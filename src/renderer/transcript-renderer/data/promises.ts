import { Parser } from "./parser";
import {
  transformGffToTranscripts,
  type TranscriptRecord,
} from "../transcript/transform";
import { logger } from "../utils/logger";

interface IBuildPromiseOpts {
  url?: string;
  index?: string;
  /** Secondary index file (e.g. .gzi for bgzipped FASTA). */
  index2?: string;
  /** Explicit BAM index variant (`bai` / `csi`) when not inferable from URL. */
  indexFormat?: "bai" | "csi";
  method: string;
  format?: string; // maps to 'type' in parser
  /**
   * Inline raw content for `method: "local"` (TSV/JSON/BED text). When set,
   * no URL is fetched.
   */
  content?: string;
  /** Canvas pixel width — used to compute BigWig/BigBed zoom scale. */
  viewWidth?: number;
  /** Override scale for BigWig/BigBed (0 < scale ≤ 1). If provided, skip auto-calculation. */
  scale?: number;
  /**
   * Reference GFF3 source for buildin `transcript` / `exon` / `junction`
   * channels.  When present, the buildin parser derives the active RNA's
   * structure (exon/CDS/UTR), the gene's exons, and computed splice
   * junctions from the reference annotation GFF3 over `region` instead of
   * the hardcoded expression API.
   */
  buildinGff?: {
    /** Reference annotation GFF3 URL (`reference.transcriptome.annotation.url`). */
    url: string;
    /** Tabix index URL (`.tbi`). */
    index?: string;
    /** Active transcript identifier (transcript_id or transcript_name). */
    transcriptId?: string | null;
    /**
     * Fixed query region (active transcript span ± flank).  When omitted the
     * loader's view `region` is used.
     */
    region?: { chr: string; start: number; end: number };
  };
  structureFallbackUrl?: string;
  region: {
    chr: string;
    start: number;
    end: number;
  };
}

/**
 * Preset colours for Transcript-Structure feature types (exon/CDS/UTR/codon).
 * Mirrors the table used by the legacy expression-API buildin path so the
 * GFF-derived structure renders with identical per-feature colouring.
 */
const BUILTIN_FEATURE_COLORS: Record<string, string> = {
  exon: "#a4b0be",
  CDS: "#3867d6",
  UTR: "#ced6e0",
  five_prime_UTR: "#ced6e0",
  three_prime_UTR: "#ced6e0",
  start_codon: "#2ed573",
  stop_codon: "#ff4757",
};

/**
 * Parser instance cache keyed by "url\0index\0format".
 *
 * Reusing the same Parser (and therefore the same underlying BigWig / BigBed
 * object) avoids re-fetching the file header and R-tree index on every tile
 * request.  Without this cache, a 5-tile ScreenDataManager window for a
 * bigwig channel fires ~9 HTTP range requests per tile (header + index + data
 * blocks) instead of ~2 (data blocks only), producing ~90 requests per load.
 *
 * NOTE: The BigBed/BigWig object itself (indexes, metadata) can occupy 30-50MB.
 * This is unavoidable as it's part of the file format structure.
 */
const parserCache = new Map<string, Parser>();

/** Formats that support BigWig/BigBed stream + scale. */
const STREAM_FORMATS = new Set(["bigwig", "bw", "bigbed", "bb"]);

/**
 * In-flight request dedup cache.
 *
 * When multiple ScreenDataManagers (from different channels that share the
 * same URL) request the same region concurrently, we re-use the same Promise
 * instead of issuing duplicate HTTP range requests.  The entry is removed once
 * the Promise settles so that subsequent requests still hit the network.
 *
 * Key format: `${url}\0${chr}:${start}-${end}\0${scale}`
 */
const inflightRequests = new Map<string, Promise<any[]>>();

/**
 * Build a dedup key for a remote data request.
 */
function buildDedupKey(
  url: string,
  chr: string,
  start: number,
  end: number,
  scale: number | undefined,
): string {
  return `${url}\0${chr}:${start}-${end}\0${scale ?? ""}`;
}

/**
 * Collect an AsyncIterable<Feature[]> (from @gmod/bbi getFeatureStream) into a
 * flat array; passes through if the stream is already an array.
 *
 * @param maxRecords - cap on total records collected, to bound memory
 * @param samplingRate - if > 1, keep only every Nth record
 */
async function collectStream(
  stream: any,
  maxRecords?: number,
  samplingRate: number = 1,
): Promise<any[]> {
  if (Array.isArray(stream)) return stream;
  const records: any[] = [];
  let index = 0;

  for await (const chunk of stream) {
    if (Array.isArray(chunk)) {
      // Apply sampling during collection to avoid creating huge arrays
      if (samplingRate > 1) {
        for (let i = 0; i < chunk.length; i++) {
          if (index % samplingRate === 0) {
            records.push(chunk[i]);
            if (maxRecords && records.length >= maxRecords) {
              return records;
            }
          }
          index++;
        }
      } else {
        records.push(...chunk);
        if (maxRecords && records.length >= maxRecords) {
          return records;
        }
      }
    } else {
      if (samplingRate <= 1 || index % samplingRate === 0) {
        records.push(chunk);
        if (maxRecords && records.length >= maxRecords) {
          return records;
        }
      }
      index++;
    }
  }
  return records;
}

export const buildPromise = (opts: IBuildPromiseOpts) => {
  const {
    url,
    index,
    method,
    format,
    viewWidth,
    region,
    scale: overrideScale,
  } = opts;


  switch (method) {
    case "built-in":
    case "buildin":
      return parseBuiltInData(opts);
    case "local": {
      // Inline content path — used for `data: { method: "local", format:
      // "tsv"|"json"|"bed", content: "..." }`. No URL fetching.
      const content = opts.content;
      if (!content) return Promise.resolve([]);

      // Cache key uses a content fingerprint (length + short prefix) to avoid
      // storing potentially huge strings as Map keys while still
      // disambiguating distinct inline channels.
      const fp = `${content.length}:${content.slice(0, 64)}`;
      const cacheKey = `local\0${format ?? ""}\0${fp}`;
      let parser = parserCache.get(cacheKey);
      if (!parser) {
        try {
          parser = new Parser({
            method: "local",
            file: "",
            content,
            type: format || "bed",
          });
        } catch (err: any) {
          return Promise.reject(
            err instanceof Error ? err : new Error(String(err)),
          );
        }
        parserCache.set(cacheKey, parser);
      }
      const { chr, start, end } = region;
      return parser.recordsParser({ chr, start, end });
    }
    case "remote": {
      if (!url) return Promise.resolve([]);

      // Re-use an existing Parser for this (url, index, format) combination so
      // that the underlying file handle (BigWig, BigBed, …) is not recreated.
      const cacheKey = `${url}\0${index ?? ""}\0${format ?? ""}`;
      let parser = parserCache.get(cacheKey);
      if (!parser) {
        try {
          parser = new Parser({
            method: "remote",
            file: url,
            index: index,
            gindex: opts.index2,
            indexFormat: opts.indexFormat,
            type: format || "gff",
          });
        } catch (err: any) {
          // Surface synchronous parser-construction errors (e.g. missing
          // index file) as a rejected Promise so the channel-level error
          // handler can display them instead of crashing the caller.
          return Promise.reject(
            err instanceof Error ? err : new Error(String(err)),
          );
        }
        parserCache.set(cacheKey, parser);
      }

      const { chr, start, end } = region;
      const span = end - start;

      // For BigWig / BigBed: compute scale from view pixels per bp and use
      // the streaming API which respects BigWig zoom levels.
      if (STREAM_FORMATS.has((format ?? "").toLowerCase()) && span > 0) {
        // Use override scale if provided (from ScreenDataManager level calculation),
        // otherwise compute from viewWidth / span.
        let scale: number;
        if (overrideScale !== undefined) {
          scale = overrideScale;
        } else {
          // scale = pixels per basepair (clamped to a sane range).
          // viewWidth defaults to 1000px when not provided.
          const px = viewWidth && viewWidth > 0 ? viewWidth : 1000;
          scale = Math.min(1, Math.max(1e-6, px / span));
        }

        // ── In-flight dedup: if an identical request is already running,
        //    return the same Promise instead of issuing duplicate HTTP
        //    range requests.  Each caller gets its own shallow copy of the
        //    result array so downstream mutations don't interfere.
        const dedupKey = buildDedupKey(url, chr, start, end, scale);
        const existing = inflightRequests.get(dedupKey);
        if (existing) {
          return existing.then((records) => [...records]);
        }


        const promise = parser
          .recordsStreamParser({ chr, start, end, scale })
          .then((stream) => {
            return collectStream(stream);
          })
          .then((records) => {
            return records;
          })
          .catch((err) => {
            logger.warn(
              `[buildPromise] Stream failed, trying non-streaming fallback:`,
              err,
            );
            return parser!.recordsParser({ chr, start, end, scale });
          })
          .then((records) => {
            return records;
          })
          .finally(() => {
            inflightRequests.delete(dedupKey);
          });

        inflightRequests.set(dedupKey, promise);
        return promise;
      }

      // ── Non-streaming path (GFF, BED, VCF, etc.) ──────────────────
      // Also apply in-flight dedup.
      {
        const dedupKey = buildDedupKey(url, chr, start, end, undefined);
        const existing = inflightRequests.get(dedupKey);
        if (existing) {
          return existing.then((records) => [...records]);
        }

        const promise = parser
          .recordsParser({ chr, start, end })
          .then((records) => {
            return records;
          })
          .finally(() => {
            inflightRequests.delete(dedupKey);
          });

        inflightRequests.set(dedupKey, promise);
        return promise;
      }
    }

    default:
      return Promise.resolve([]);
  }
};

const parseBuiltInFromGff = async (opts: IBuildPromiseOpts): Promise<any[]> => {
  const src = opts.buildinGff;
  if (!src?.url) return [];
  const format = opts.format ?? "";
  const region = src.region ?? opts.region;

  // Reuse / create a GFF parser for the reference annotation.
  const cacheKey = `${src.url}\0${src.index ?? ""}\0gff`;
  let parser = parserCache.get(cacheKey);
  if (!parser) {
    try {
      parser = new Parser({
        method: "remote",
        file: src.url,
        index: src.index,
        type: "gff",
      });
    } catch (err) {
      logger.error(`[parseBuiltInFromGff] parser construction failed:`, err);
      return [];
    }
    parserCache.set(cacheKey, parser);
  }

  let gffRecords: any[];
  try {
    gffRecords = await parser.recordsParser({
      chr: region.chr,
      start: region.start,
      end: region.end,
    });
  } catch (err) {
    logger.error(`[parseBuiltInFromGff] GFF fetch failed:`, err);
    return [];
  }

  const transcripts = transformGffToTranscripts(gffRecords);
  if (transcripts.length === 0) return [];

  const bareId = (s: string) => s.replace(/^[A-Za-z_]+:/, "").toLowerCase();
  const normId = (s: string) => bareId(s).replace(/\.\d+$/, "");
  const want = (src.transcriptId ?? "").trim();
  let active: TranscriptRecord | undefined;
  if (want) {
    const wantBare = bareId(want);
    const wantNorm = normId(want);
    active = transcripts.find(
      (t) =>
        bareId(t.transcriptId) === wantBare ||
        bareId(t.transcriptName) === wantBare,
    );
    if (!active) {
      active = transcripts.find(
        (t) =>
          normId(t.transcriptId) === wantNorm ||
          normId(t.transcriptName) === wantNorm,
      );
    }
    // A transcript id was supplied but not found in the queried window. Do
    // NOT fall back to a neighbouring transcript — the buildin channels must
    // render the SAME transcript the navigation resolved, traceable by id.
    // Returning empty is the deterministic, correct behaviour here (better an
    // empty structure track than the wrong gene, e.g. CAMTA1 in VAMP3's flank).
    if (!active) {
      logger.warn(
        `[parseBuiltInFromGff] no transcript matching id "${src.transcriptId}" in ${region.chr}:${region.start}-${region.end}`,
      );
      return [];
    }
  } else {
    // No id supplied (plain genomic browsing): use the left-most transcript.
    active = transcripts[0];
  }
  if (!active) return [];

  // ── Transcript Structure: the active RNA's exon/CDS/UTR/codon parts ──
  if (format === "transcript" || format === "simple_rna") {
    return active.parts.map((p) => ({
      chromStart: p.start,
      chromEnd: p.end,
      start: p.start,
      end: p.end,
      featureType: p.type,
      color: BUILTIN_FEATURE_COLORS[p.type] ?? "#a4b0be",
      strand: active!.strand,
      name: p.type,
      rest: p.type,
    }));
  }

  // ── Gene-level collection (every transcript sharing the gene) ──
  const geneName = active.geneName;
  const geneTranscripts = geneName
    ? transcripts.filter((t) => t.geneName === geneName)
    : [active];

  // ── Exon: all exons of the gene (deduplicated by coordinate) ──
  if (format === "exon") {
    const seen = new Set<string>();
    const features: any[] = [];
    for (const tx of geneTranscripts) {
      for (const p of tx.parts) {
        if (p.type !== "exon") continue;
        const key = `${p.start}-${p.end}`;
        if (seen.has(key)) continue;
        seen.add(key);
        features.push({
          chromStart: p.start,
          chromEnd: p.end,
          start: p.start,
          end: p.end,
          featureType: "exon",
          strand: tx.strand,
          name: "exon",
        });
      }
    }
    features.sort((a, b) => a.start - b.start);
    features.forEach((f, i) => {
      f.id = `Exon${i + 1}`;
    });
    return features;
  }

  // ── Junction: introns computed from consecutive exons (deduplicated) ──
  if (format === "junction") {
    const seen = new Set<string>();
    const features: any[] = [];
    for (const tx of geneTranscripts) {
      const exons = tx.parts
        .filter((p) => p.type === "exon")
        .slice()
        .sort((a, b) => a.start - b.start);
      for (let i = 0; i + 1 < exons.length; i++) {
        const jStart = exons[i].end;
        const jEnd = exons[i + 1].start;
        if (jEnd <= jStart) continue; // overlapping / adjacent exons: no intron
        const key = `${jStart}-${jEnd}`;
        if (seen.has(key)) continue;
        seen.add(key);
        features.push({
          chromStart: jStart,
          chromEnd: jEnd,
          start: jStart,
          end: jEnd,
          featureType: "junction",
          strand: tx.strand,
          name: "junction",
        });
      }
    }
    features.sort((a, b) => a.start - b.start);
    features.forEach((f, i) => {
      f.id = `Junction${i + 1}`;
    });
    return features;
  }

  return [];
};

/**
 * Derive buildin structure features (transcript parts / gene exons / computed
 * junctions) from the RNA structure API's `results.base` for a transcript the
 * reference GFF3 doesn't carry. Mirrors parseBuiltInFromGff's per-format
 * output, but sources the structure from the API `base` instead of the GFF3 —
 * the same source the header transcript-navigation bar uses, keeping the two
 * consistent. Used only as a fallback when the GFF3 lookup returns nothing.
 *
 * Coordinate convention matches the templated transcript branch below: every
 * `base.<type>.position` pair is 1-based GFF3, converted to 0-based half-open.
 */
const deriveStructureFromApi = async (
  structureUrl: string,
  format: string | undefined,
): Promise<any[]> => {
  let json: any;
  try {
    const res = await fetch(structureUrl);
    if (!res.ok) {
      logger.error(
        `[deriveStructureFromApi] Failed to fetch structure: ${res.status} ${structureUrl}`,
      );
      return [];
    }
    json = await res.json();
  } catch (err) {
    logger.error(`[deriveStructureFromApi] fetch error:`, err);
    return [];
  }

  const base = json?.results?.base;
  const region = json?.results?.region;
  if (!base || !region) return [];
  const strand: string | null = region.strand ?? null;

  // Flatten base.<type>.position into 0-based parts, keeping only renderable
  // structure types (skips e.g. an aggregate "UTR" only when unknown).
  const parts: Array<{ type: string; start: number; end: number }> = [];
  for (const [type, fData] of Object.entries(base)) {
    if (!(type in BUILTIN_FEATURE_COLORS)) continue;
    const positions = ((fData as any)?.position ?? []) as number[];
    for (let i = 0; i + 1 < positions.length; i += 2) {
      parts.push({ type, start: positions[i] - 1, end: positions[i + 1] });
    }
  }

  if (format === "transcript" || format === "simple_rna") {
    return parts.map((p) => ({
      chromStart: p.start,
      chromEnd: p.end,
      start: p.start,
      end: p.end,
      featureType: p.type,
      color: BUILTIN_FEATURE_COLORS[p.type] ?? "#a4b0be",
      strand,
      name: p.type,
      rest: p.type,
    }));
  }

  const exons = parts
    .filter((p) => p.type === "exon")
    .sort((a, b) => a.start - b.start);

  if (format === "exon") {
    return exons.map((p, i) => ({
      chromStart: p.start,
      chromEnd: p.end,
      start: p.start,
      end: p.end,
      featureType: "exon",
      // Solid structural colour (no expression score) so the parent renders a
      // plain rect rather than a colormap-mapped one.
      color: BUILTIN_FEATURE_COLORS.exon,
      strand,
      name: "exon",
      id: `Exon${i + 1}`,
    }));
  }

  if (format === "junction") {
    const features: any[] = [];
    for (let i = 0; i + 1 < exons.length; i++) {
      const jStart = exons[i].end;
      const jEnd = exons[i + 1].start;
      if (jEnd <= jStart) continue; // overlapping / adjacent exons: no intron
      features.push({
        chromStart: jStart,
        chromEnd: jEnd,
        start: jStart,
        end: jEnd,
        featureType: "junction",
        color: BUILTIN_FEATURE_COLORS.exon,
        strand,
        name: "junction",
        id: `Junction${features.length + 1}`,
      });
    }
    return features;
  }

  return [];
};

const parseBuiltInData = async (opts: IBuildPromiseOpts): Promise<any[]> => {
  const { url, format } = opts;

  // Reference-GFF3-driven buildin channels take precedence over the legacy
  // expression API: derive transcript structure / exons / junctions from the
  // active reference annotation when a GFF source is supplied.
  if (opts.buildinGff?.url) {
    const gffFeatures = await parseBuiltInFromGff(opts);
    if (gffFeatures.length > 0) return gffFeatures;
    // The reference GFF3 carries no record under the navigation's transcript
    // identifier. This is expected for transcripts the GFF3 names under a
    // different authority than the search catalogue — e.g. an RNAcentral
    // mitochondrial tRNA ("tRNA-Gln", URS0000B939A4_9606) that GENCODE
    // annotates as "MT-TQ". Rather than render an empty track, derive THIS
    // transcript's structure (transcript parts / exons / junctions) from the
    // species-correct RNA structure API — the same source the header
    // transcript-navigation bar uses, so the two stay consistent.
    // (Not a silent neighbour fallback: it is the same transcript's
    // authoritative structure, keyed by the navigation's own name/id.)
    if (opts.structureFallbackUrl) {
      return deriveStructureFromApi(opts.structureFallbackUrl, format);
    }
    return gffFeatures;
  }

  if (!url) return [];

  // ── Transcript structure ────────────────────────────────────────────
  // Fetches a single transcript's exon/CDS/UTR structure.
  if (format === "transcript" || format === "simple_rna") {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        logger.error(
          `[parseBuiltInData] Failed to fetch transcript data: ${res.status} ${url}`,
        );
        return [];
      }
      const json = await res.json();
      const results = json?.results;
      if (!results) return [];

      const base = results.base;
      const region = results.region;
      if (!base || !region) return [];


      // Return flat rect-compatible features, one per genomic interval per feature type.
      // featureType field enables expand by feature type:
      //   style.keys: ["featureType"], style.expand: ["featureType"]
      // Recognised types: exon, CDS, UTR, five_prime_UTR, three_prime_UTR, start_codon, stop_codon
      const FEATURE_COLORS: Record<string, string> = {
        exon: "#a4b0be",
        CDS: "#3867d6",
        UTR: "#ced6e0",
        five_prime_UTR: "#ced6e0",
        three_prime_UTR: "#ced6e0",
        start_codon: "#2ed573",
        stop_codon: "#ff4757",
      };
      const features: any[] = [];
      const INCLUDE_TYPES = new Set(Object.keys(FEATURE_COLORS));

      for (const [fType, fData] of Object.entries(base)) {
        if (!INCLUDE_TYPES.has(fType)) continue;
        const positions = ((fData as any)?.position ?? []) as number[];
        for (let i = 0; i + 1 < positions.length; i += 2) {
          const s = positions[i];
          const e = positions[i + 1];
          // API returns 1-based (GFF3); store 0-based half-open.
          features.push({
            chromStart: s - 1, // 1-based → 0-based
            chromEnd: e, // 1-based inclusive end = 0-based exclusive end
            start: s - 1,
            end: e,
            featureType: fType,
            color: FEATURE_COLORS[fType] ?? "#a4b0be",
            // rest string for parseRestFields compatibility
            rest: fType,
          });
        }
      }

      // ── Strand info ──────────────────────────────────────────────────
      // The API region carries the transcript strand.  Propagate it to
      // every feature so that renderRectStrandOverlay / intron backbone
      // can show direction arrows.
      const strand: string | null = region.strand ?? null;
      if (strand) {
        for (const f of features) {
          f.strand = strand;
        }
      }

      return features;
    } catch (err) {
      logger.error(`[parseBuiltInData] Error fetching transcript data:`, err);
      return [];
    }
  }

  // ── Exon expression ─────────────────────────────────────────────────
  // Fetches per-tissue exon-level expression from the GTEx-style API.
  // Returns flat features: { start, end, score, Tissue }.
  // Works with style.expand: ["Tissue"] + style.keys: ["Tissue"] to create
  // one sub-channel per tissue using the existing expand mechanism.
  if (format === "exon") {
    // Fall back to plain structural exons from the structure API (rendered as
    // solid rects on the parent channel, since they carry no `Tissue`) when the
    // GTEx expression can't be used:
    //   - no expression at all, OR
    //   - expression returned in a non-genomic coordinate origin (some
    //     RNAcentral / mitochondrial transcripts, e.g. tRNA-Ala on "MT", come
    //     back at coordinates like 630,677 that aren't valid for the active
    //     assembly and would render far off-screen).
    const fallback = () =>
      opts.structureFallbackUrl
        ? deriveStructureFromApi(opts.structureFallbackUrl, "exon")
        : Promise.resolve([] as any[]);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        logger.error(
          `[parseBuiltInData] Failed to fetch exon expression: ${res.status} ${url}`,
        );
        return fallback();
      }
      const json = await res.json();
      const data = json?.results?.exon_expression?.data;
      if (!data) return fallback();

      const {
        start,
        end,
        count: parentCount,
        children,
      } = data as {
        start: number[];
        end: number[];
        count?: number[];
        children: Array<{ name: string; count: number[] }>;
      };
      if (
        !Array.isArray(start) ||
        !Array.isArray(end) ||
        !Array.isArray(children)
      )
        return fallback();

      // Reject non-genomic coordinates: if no exon overlaps the queried genomic
      // region, the API returned them in a different coordinate origin (see
      // above) — they can't be placed, so use the structure API instead.
      const inRegion = start.some(
        (s, i) => end[i] > opts.region.start && s - 1 < opts.region.end,
      );
      if (!inRegion) return fallback();

      const features: any[] = [];

      // Aggregate features (one per exon position, score = parent-level count)
      if (Array.isArray(parentCount)) {
        for (let i = 0; i < start.length; i++) {
          // API returns 1-based; store 0-based half-open.
          features.push({
            start: start[i] - 1, // 1-based → 0-based
            end: end[i], // 1-based inclusive end = 0-based exclusive end
            score: parentCount[i] ?? 0,
            id: `Exon${i + 1}`,
            _parentAggregate: true,
          });
        }
      }

      // Per-tissue sub-channel features
      for (const tissue of children) {
        if (!Array.isArray(tissue.count)) continue;
        for (let i = 0; i < start.length; i++) {
          // API returns 1-based; store 0-based half-open.
          features.push({
            start: start[i] - 1, // 1-based → 0-based
            end: end[i], // 1-based inclusive end = 0-based exclusive end
            score: tissue.count[i] ?? 0,
            id: `Exon${i + 1}`,
            Tissue: tissue.name,
          });
        }
      }

      return features.length > 0 ? features : fallback();
    } catch (err) {
      logger.error(`[parseBuiltInData] Error fetching exon expression:`, err);
      return fallback();
    }
  }

  // ── Junction expression ─────────────────────────────────────────────
  // Fetches per-tissue junction (splice-site) expression.
  // Returns flat features: { start, end, score, Tissue }.
  // Used with plot: "score_curve" for arc visualization of splice junctions.
  if (format === "junction") {
    // No per-tissue expression: fall back to junctions computed from the
    // structure API exons (a single-exon tRNA correctly yields none).
    const fallback = () =>
      opts.structureFallbackUrl
        ? deriveStructureFromApi(opts.structureFallbackUrl, "junction")
        : Promise.resolve([] as any[]);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        logger.error(
          `[parseBuiltInData] Failed to fetch junction expression: ${res.status} ${url}`,
        );
        return fallback();
      }
      const json = await res.json();
      const data = json?.results?.junc_expression?.data;
      if (!data) return fallback();

      const {
        start,
        end,
        count: parentCount,
        children,
      } = data as {
        start: number[];
        end: number[];
        count?: number[];
        children: Array<{ name: string; count: number[] }>;
      };
      if (
        !Array.isArray(start) ||
        !Array.isArray(end) ||
        !Array.isArray(children)
      )
        return fallback();

      // Reject non-genomic coordinates (see the exon branch): if no junction
      // overlaps the queried genomic region, derive from the structure instead.
      const inRegion = start.some(
        (s, i) => end[i] > opts.region.start && s - 1 < opts.region.end,
      );
      if (!inRegion) return fallback();

      const features: any[] = [];

      // Aggregate features (one per junction, score = parent-level count)
      if (Array.isArray(parentCount)) {
        for (let i = 0; i < start.length; i++) {
          // API returns 1-based; store 0-based half-open.
          features.push({
            start: start[i] - 1, // 1-based → 0-based
            end: end[i], // 1-based inclusive end = 0-based exclusive end
            score: parentCount[i] ?? 0,
            id: `Junction${i + 1}`,
            _parentAggregate: true,
          });
        }
      }

      // Per-tissue sub-channel features
      for (const tissue of children) {
        if (!Array.isArray(tissue.count)) continue;
        for (let i = 0; i < start.length; i++) {
          // API returns 1-based; store 0-based half-open.
          features.push({
            start: start[i] - 1, // 1-based → 0-based
            end: end[i], // 1-based inclusive end = 0-based exclusive end
            score: tissue.count[i] ?? 0,
            id: `Junction${i + 1}`,
            Tissue: tissue.name,
          });
        }
      }

      return features.length > 0 ? features : fallback();
    } catch (err) {
      logger.error(
        `[parseBuiltInData] Error fetching junction expression:`,
        err,
      );
      return fallback();
    }
  }

  logger.warn(`[parseBuiltInData] Unrecognized format: "${format}"`);
  return [];
};
