import {
  TranscriptSearch,
  openTranscriptSearch,
  type ISqlBackend,
  normalize,
} from "./TranscriptSearchParser"; /** JSON shape consumed by the renderer's existing parsers. */
export interface ITranscriptApiResponse {
  status: number;
  results: {
    region: {
      chrom: string;
      start: number; // 1-based inclusive
      end: number; // 1-based inclusive
      strand: string;
      gene_id: string;
      gene_name: string;
      trans_id: string;
      trans_name: string;
      trans_type: string;
    };
    base: {
      exon: { position: number[] }; // 1-based closed
      CDS: { position: number[] }; // 0-based half-open
      five_prime_UTR?: { position: number[] }; // 1-based closed
      three_prime_UTR?: { position: number[] }; // 1-based closed
    };
  };
}

interface IFeatureRow {
  feature_type: string;
  gene_id: string | null;
  gene_name: string | null;
  transcript_id: string | null;
  transcript_name: string | null;
  chrom: string;
  start: number;
  end: number;
  strand: string | null;
  biotype: string | null;
  exon_starts: string | null;
  exon_ends: string | null;
  cds_start: number | null;
  cds_end: number | null;
  utr5_start: number | null;
  utr5_end: number | null;
  utr3_start: number | null;
  utr3_end: number | null;
}

const FEATURE_COLS =
  "feature_type, gene_id, gene_name, transcript_id, transcript_name, " +
  "chrom, start, end, strand, biotype, exon_starts, exon_ends, " +
  "cds_start, cds_end, utr5_start, utr5_end, utr3_start, utr3_end";

/**
 * Resolve `name` (a transcript_name, transcript_id, gene_name, gene_id —
 * with or without `.N` version) to a single transcript-level row in the
 * SQLite catalogue and return it shaped like the REST API response.
 * Returns `null` if nothing matches.
 */
export async function loadTranscriptFromSqlite(
  sqliteUrl: string,
  name: string,
): Promise<ITranscriptApiResponse | null> {
  const search = await openTranscriptSearch(sqliteUrl);
  return loadTranscriptFromBackend(search.backend, name);
}

/**
 * Backend-level entry point — same contract as `loadTranscriptFromSqlite`
 * but takes a pre-built `ISqlBackend`, so unit tests can drive it with an
 * in-memory `sql.js` database (no `sql.js-httpvfs` worker required).
 */
export async function loadTranscriptFromBackend(
  db: ISqlBackend,
  name: string,
): Promise<ITranscriptApiResponse | null> {
  const row = await resolveTranscriptRow(db, name);
  if (!row) return null;
  return rowToApiShape(row);
}

/** A genomic window resolved from the catalogue (1-based inclusive). */
export interface ICatalogueRegion {
  chrom: string;
  start: number; // 1-based inclusive
  end: number; // 1-based inclusive
}

export async function resolveRegionFromSqlite(
  sqliteUrl: string,
  name: string,
): Promise<ICatalogueRegion | null> {
  const search = await openTranscriptSearch(sqliteUrl);
  return resolveRegionFromBackend(search.backend, name);
}

/** Backend-level counterpart to resolveRegionFromSqlite. */
export async function resolveRegionFromBackend(
  db: ISqlBackend,
  name: string,
): Promise<ICatalogueRegion | null> {
  // Prefer a transcript-level structural row when present (most specific).
  const row = await resolveTranscriptRow(db, name);
  if (row && row.chrom && row.start != null && row.end != null) {
    return { chrom: row.chrom, start: row.start, end: row.end };
  }

  const lower = name.trim().toLowerCase();
  const nq = normalize(name);
  const cols = "chrom, start, end";

  // Direct match on any feature (gene OR transcript), preferring rows that
  // actually carry coordinates (some gene rows have null start/end).
  const direct = await db.query<{ chrom: string; start: number; end: number }>(
    `SELECT ${cols} FROM feature
      WHERE start IS NOT NULL AND end IS NOT NULL
        AND (transcript_id = ? COLLATE NOCASE
          OR transcript_name = ? COLLATE NOCASE
          OR gene_name = ? COLLATE NOCASE
          OR gene_id = ? COLLATE NOCASE)
      ORDER BY (feature_type = 'gene'), (end - start) DESC
      LIMIT 1`,
    [lower, lower, lower, lower],
  );
  if (direct.length > 0 && direct[0].chrom) {
    return {
      chrom: direct[0].chrom,
      start: direct[0].start,
      end: direct[0].end,
    };
  }

  // Alias match (covers gene synonyms / cross-refs). Resolve to the feature's
  // own locus regardless of feature_type.
  const viaAlias = await db.query<{
    chrom: string;
    start: number;
    end: number;
  }>(
    `SELECT f.chrom, f.start, f.end
       FROM alias a JOIN feature f ON f.id = a.feature_id
      WHERE a.alias_norm = ?
        AND f.start IS NOT NULL AND f.end IS NOT NULL
      ORDER BY (f.feature_type = 'gene'), (f.end - f.start) DESC
      LIMIT 1`,
    [nq],
  );
  if (viaAlias.length > 0 && viaAlias[0].chrom) {
    return {
      chrom: viaAlias[0].chrom,
      start: viaAlias[0].start,
      end: viaAlias[0].end,
    };
  }

  return null;
}

async function resolveTranscriptRow(
  db: ISqlBackend,
  name: string,
): Promise<IFeatureRow | null> {
  const lower = name.trim().toLowerCase();
  const nq = normalize(name);

  // 1. transcript_id exact (with version)
  // 2. transcript_name exact
  // 3. transcript_id versionless (via alias)
  // 4. gene_name exact (pick first transcript)
  // 5. gene_id exact / versionless (pick first transcript)
  const direct = await db.query<IFeatureRow>(
    `SELECT ${FEATURE_COLS} FROM feature
      WHERE feature_type != 'gene'
        AND (transcript_id = ? COLLATE NOCASE
          OR transcript_name = ? COLLATE NOCASE)
      LIMIT 1`,
    [lower, lower],
  );
  if (direct.length > 0) return direct[0];

  const viaAlias = await db.query<IFeatureRow>(
    `SELECT ${"f." + FEATURE_COLS.split(", ").join(", f.")}
       FROM alias a JOIN feature f ON f.id = a.feature_id
      WHERE a.alias_norm = ?
        AND f.feature_type != 'gene'
      LIMIT 1`,
    [nq],
  );
  if (viaAlias.length > 0) return viaAlias[0];

  const byGene = await db.query<IFeatureRow>(
    `SELECT ${FEATURE_COLS} FROM feature
      WHERE feature_type != 'gene'
        AND (gene_name = ? COLLATE NOCASE
          OR gene_id = ? COLLATE NOCASE)
      ORDER BY (end - start) DESC LIMIT 1`,
    [lower, lower],
  );
  if (byGene.length > 0) return byGene[0];

  return null;
}

function parseIntList(csv: string | null): number[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

function rowToApiShape(row: IFeatureRow): ITranscriptApiResponse {
  const exonStarts = parseIntList(row.exon_starts);
  const exonEnds = parseIntList(row.exon_ends);
  const n = Math.min(exonStarts.length, exonEnds.length);

  // ── Exons: flat [s1,e1,s2,e2,...] 1-based closed ───────────────────────
  const exonPos: number[] = [];
  for (let i = 0; i < n; i++) {
    exonPos.push(exonStarts[i], exonEnds[i]);
  }

  // ── CDS: per-exon intersection with [cds_start, cds_end], 1-based closed
  //        → emit as 0-based half-open (subtract 1 from start) so it matches
  //          `parseCDSFromTranscriptAPI` expectations.
  const cdsPos: number[] = [];
  if (
    row.cds_start != null &&
    row.cds_end != null &&
    row.cds_end >= row.cds_start
  ) {
    for (let i = 0; i < n; i++) {
      const s = Math.max(exonStarts[i], row.cds_start);
      const e = Math.min(exonEnds[i], row.cds_end);
      if (e >= s) cdsPos.push(s - 1, e);
    }
  }

  // ── 5' / 3' UTR: per-exon intersection, 1-based closed ─────────────────
  const utr5Pos: number[] = utrIntersection(
    exonStarts,
    exonEnds,
    n,
    row.utr5_start,
    row.utr5_end,
  );
  const utr3Pos: number[] = utrIntersection(
    exonStarts,
    exonEnds,
    n,
    row.utr3_start,
    row.utr3_end,
  );

  const transId = row.transcript_id ?? "";
  const transName = row.transcript_name ?? transId;
  return {
    status: 1,
    results: {
      region: {
        chrom: row.chrom,
        start: row.start,
        end: row.end,
        strand: row.strand ?? "+",
        gene_id: row.gene_id ?? "",
        gene_name: row.gene_name ?? "",
        trans_id: transId,
        trans_name: transName,
        trans_type: row.biotype ?? "",
      },
      base: {
        exon: { position: exonPos },
        CDS: { position: cdsPos },
        five_prime_UTR: { position: utr5Pos },
        three_prime_UTR: { position: utr3Pos },
      },
    },
  };
}

function utrIntersection(
  exonStarts: number[],
  exonEnds: number[],
  n: number,
  utrStart: number | null,
  utrEnd: number | null,
): number[] {
  if (utrStart == null || utrEnd == null || utrEnd < utrStart) return [];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = Math.max(exonStarts[i], utrStart);
    const e = Math.min(exonEnds[i], utrEnd);
    if (e >= s) out.push(s, e);
  }
  return out;
}

/**
 * Heuristic — recognise URLs that point to a SQLite catalogue.
 *
 * Accepts the standard `.sqlite` extension as well as the project-specific
 * `.rba` / `.rbi` (RBrowser Annotation) extensions. All three share the same
 * on-disk SQLite 3 layout and identical schema (`feature`, `alias`,
 * `feature_fts`, `feature_trigram`, `metadata`) — the `.rba`/`.rbi` suffixes
 * are just convenience labels used by the data hub for packaged annotation
 * databases, so every one of them is fully name-searchable.
 */
export function isSqliteTranscriptUrl(url: string): boolean {
  return /\.(sqlite|rba|rbi)(\?|$)/i.test(url);
}

/**
 * Recognise a `.rbi` (RBrowser Index) URL — a *search-only* catalogue.
 *
 * A `.rbi` is built from a GFF3/GTF purely to make transcripts name-searchable
 * (name/id/gene → genomic region). It deliberately carries NO exon/CDS
 * structure (`exon_count = 0`, empty `exon_starts`). Navigation therefore
 * follows the rule: **resolve the locus from the `.rbi`, then resolve the
 * transcript model from the reference GFF3/GTF**. A `.rba`/`.sqlite` catalogue
 * (e.g. GRCm38) is the full packaged database and DOES carry structure, so it
 * is handled directly without the GFF round-trip.
 */
export function isRbiIndexUrl(url: string): boolean {
  return /\.rbi(\?|$)/i.test(url);
}

// Re-export so callers can hold a typed handle if desired.
export { TranscriptSearch };
