import type { IAssemblyInfo } from "../config/config";
import type { CDSCoordinateMapper } from "../utils/cds";

/** A single feature-space projection of a highlight. */
export interface IFeatureRegionEntry {
  feature: "DNA" | "mRNA" | "RNA" | "CDS";
  chr: string;
  start: number;
  end: number;
  strand: string;
  trans_id?: string;
  trans_name?: string;
  gene_id?: string;
  gene_name?: string;
  tss?: number;
  assembly?: IAssemblyInfo;
}

/**
 * A single named genomic highlight region.
 */
export interface IHighlightRegion {
  /** Unique identifier – used to update or remove the region later. */
  name: string;
  /** Genomic start coordinate (inclusive, same coordinate space as the viewport). */
  start: number;
  /** Genomic end coordinate (exclusive). */
  end: number;
  /** CSS hex colour used for both the border and the translucent fill. */
  color: string;
  /**
   * Strand of the highlighted feature: `"+"`, `"-"`, or `"."` (unknown /
   * strandless, the default for plain genomic bands). Declared on the type so
   * the value `getRegionList()` emits for RNA/mRNA/CDS entries is part of the
   * public contract rather than an undeclared, "invisible" field.
   */
  strand?: string;
  /**
   * Genome assembly active when the highlight was created, e.g.
   * `{ name: "GRCh38" }`.  Records the reference version so the highlight
   * can be validated against the currently-loaded reference.
   */
  assembly?: IAssemblyInfo;
  /** Cached DNA / mRNA / RNA / CDS projection of this highlight. */
  featureRegions?: IFeatureRegionEntry[];
}

// ── Feature-region projection types ────────────────────────────────────────

/** DNA-feature entry (always genomic, strandless). */
export interface IRegionEntryDNA {
  chr: string;
  start: number;
  end: number;
  strand: string;
  assembly?: IAssemblyInfo;
}

/** mRNA / RNA / CDS entry (transcript-relative, carries transcript identity). */
export interface IRegionEntryRNA {
  chr: string;
  start: number;
  end: number;
  strand: string;
  trans_id: string;
  trans_name: string;
  gene_id: string;
  gene_name: string;
  tss: number;
  assembly?: IAssemblyInfo;
}

/** Highlights grouped by feature coordinate system. */
export interface IRegionList {
  DNA: IRegionEntryDNA[];
  mRNA: IRegionEntryRNA[];
  RNA: IRegionEntryRNA[];
  CDS: IRegionEntryRNA[];
}

/** What the projection math needs from the renderer, injected on each call. */
export interface IHighlightProjectionContext {
  /** Chromosome of the currently loaded region. */
  chr: string;
  /** Active RNA-mode info, or `null` outside RNA mode. */
  rna: {
    tssPos: number;
    strand: "+" | "-";
    chr: string;
    name: string;
    txStart: number;
    txEnd: number;
  } | null;
  /** CDS mapper, or `null` for non-coding transcripts. */
  cds: CDSCoordinateMapper | null;
  /** Exon mapper used to collapse introns for mRNA coordinates. */
  exonMapper: CDSCoordinateMapper | null;
  /** Active CDS-mode info, or `null` outside CDS mode. */
  cdsInfo: {
    strand: "+" | "-";
    chr: string;
    name: string;
    tssPos: number;
    txStart: number;
    txEnd: number;
  } | null;
  /** Gene / transcript identifiers for the current transcript. */
  txInfo: {
    gene_id: string;
    trans_id: string;
    trans_name: string;
    gene_name: string;
  } | null;
  /** Whether the viewport is in CDS coordinate space. */
  isCdsMode: boolean;
  /** Assembly tag stamped onto every emitted entry. */
  assembly?: IAssemblyInfo;
  /** Transcript-context signature; the dirty guard skips work when unchanged. */
  signature: string;
}

/**
 * Map a genomic [start, end] span through a genomic-ordered mapper, flipping
 * across the mapped length on the minus strand so coordinates stay 5'→ 3'.
 */
function mapGenomicSpan(
  mapper: CDSCoordinateMapper,
  gStart: number,
  gEnd: number,
  strand: string,
): [number, number] {
  const a = mapper.genomicToCDS(gStart);
  const b = mapper.genomicToCDS(gEnd);
  if (strand === "-") {
    const len = mapper.totalCDSLength;
    return [len - b, len - a];
  }
  return [a, b];
}

// ── HighlightManager ──────────────────────────────────────────────────────

/**
 * Container for highlight regions.  Thread of execution is single-threaded
 * so no locking is required.
 */
export class HighlightManager {
  private _regions: IHighlightRegion[] = [];

  /** Bumped on every mutation; drives the projection dirty guard. */
  private _regionsVersion = 0;
  /** `_regionsVersion` at the last successful projection (-1 = never). */
  private _projectedVersion = -1;
  /** `ctx.signature` at the last successful projection. */
  private _projectedSignature: string | null = null;

  setRegion(
    name: string,
    start: number,
    end: number,
    color = "#3867d6",
    assembly?: IAssemblyInfo,
    strand = ".",
  ): void {
    const normEnd = end <= start ? start + 1 : end;
    const region: IHighlightRegion = {
      name,
      start,
      end: normEnd,
      color,
      strand,
      assembly,
    };

    this._regionsVersion++;

    const byName = this._regions.findIndex((r) => r.name === name);
    if (byName >= 0) {
      this._regions[byName] = region;
      return;
    }

    const duplicate = this._regions.findIndex(
      (r) => r.start === start && r.end === normEnd,
    );
    if (duplicate >= 0) {
      this._regions[duplicate] = {
        ...this._regions[duplicate],
        color,
        strand,
        assembly,
        featureRegions: undefined,
      };
      return;
    }

    this._regions.push(region);
  }

  get regions(): readonly IHighlightRegion[] {
    return this._regions.slice();
  }

  removeRegion(name: string): void {
    this._regionsVersion++;
    this._regions = this._regions.filter((r) => r.name !== name);
  }

  clear(): void {
    this._regionsVersion++;
    this._regions = [];
  }

  get isEmpty(): boolean {
    return this._regions.length === 0;
  }

  /**
   * Number of stored regions.
   */
  get size(): number {
    return this._regions.length;
  }

  // ── Feature-region projection ─────────────────────────────────────────────

  /**
   * Project every highlight into the four feature coordinate systems and cache
   * the result on each region. Mappers are injected via `ctx`. Skips work when
   * neither the highlight set nor the transcript context changed.
   */
  projectFeatureRegions(ctx: IHighlightProjectionContext): void {
    if (
      this._projectedVersion === this._regionsVersion &&
      this._projectedSignature === ctx.signature
    ) {
      return;
    }

    const { chr, rna, cds, exonMapper, cdsInfo, txInfo } = ctx;
    // Derive strand / name / TSS from whichever mode is active.
    const strand = rna?.strand ?? cdsInfo?.strand ?? ".";
    const transName = rna?.name ?? cdsInfo?.name ?? "";
    const tssPos = rna?.tssPos ?? cdsInfo?.tssPos ?? 0;
    const transId = txInfo?.trans_id ?? transName;
    const transNameResolved = txInfo?.trans_name ?? transName;
    const geneId = txInfo?.gene_id ?? "";
    const geneName = txInfo?.gene_name ?? "";
    const inCdsMode = ctx.isCdsMode && cds != null;
    const assemblyTag: { assembly?: IAssemblyInfo } = ctx.assembly
      ? { assembly: ctx.assembly }
      : {};
    const hasTranscript = rna != null || cdsInfo != null;
    const hasCdsInfo = cds != null || cdsInfo != null || rna != null;

    // Build an mRNA / RNA / CDS entry, blanking transcript identity when the
    // feature has no transcript context.
    const makeEntry = (
      feature: IFeatureRegionEntry["feature"],
      start: number,
      end: number,
      has: boolean,
    ): IFeatureRegionEntry => ({
      feature,
      chr,
      start: Math.round(start),
      end: Math.round(end),
      strand: has ? strand : ".",
      trans_id: has ? transId : "",
      trans_name: has ? transNameResolved : "",
      gene_id: has ? geneId : "",
      gene_name: has ? geneName : "",
      tss: tssPos,
      ...assemblyTag,
    });

    for (const hl of this._regions) {
      // Highlight coords are genomic in DNA/RNA mode, CDS-space in CDS mode.
      let gStart: number;
      let gEnd: number;
      let cdsStart: number;
      let cdsEnd: number;

      if (inCdsMode) {
        cdsStart = hl.start;
        cdsEnd = hl.end;
        gStart = cds!.cdsToGenomic(hl.start);
        gEnd = cds!.cdsToGenomic(hl.end);
      } else {
        gStart = hl.start;
        gEnd = hl.end;
        // Non-coding transcript reports `0-0` so the CDS row stays present.
        [cdsStart, cdsEnd] = cds
          ? mapGenomicSpan(cds, gStart, gEnd, strand)
          : [0, 0];
      }

      // DNA is always genomic and strandless.
      const dnaEntry: IFeatureRegionEntry = {
        feature: "DNA",
        chr,
        start: Math.round(gStart),
        end: Math.round(gEnd),
        strand: ".",
        ...assemblyTag,
      };

      // mRNA collapses introns via the exon mapper (genomic when unavailable).
      const [mrnaStart, mrnaEnd] = exonMapper
        ? mapGenomicSpan(exonMapper, gStart, gEnd, strand)
        : [gStart, gEnd];
      const mrnaEntry = makeEntry("mRNA", mrnaStart, mrnaEnd, hasTranscript);

      // RNA is TSS-relative when a transcript with a known TSS is active.
      let rnaEntry: IFeatureRegionEntry;
      if (hasTranscript && tssPos !== 0) {
        const [rnaStart, rnaEnd] =
          strand === "+"
            ? [gStart - tssPos, gEnd - tssPos]
            : [tssPos - gEnd, tssPos - gStart];
        rnaEntry = makeEntry("RNA", rnaStart, rnaEnd, true);
      } else {
        rnaEntry = makeEntry("RNA", gStart, gEnd, false);
      }

      const cdsEntry = makeEntry("CDS", cdsStart, cdsEnd, hasCdsInfo);

      hl.featureRegions = [dnaEntry, mrnaEntry, rnaEntry, cdsEntry];
    }

    this._projectedVersion = this._regionsVersion;
    this._projectedSignature = ctx.signature;
  }

  /**
   * Read the cached projections back, grouped by feature. Parameter-free — just
   * returns what the last projectFeatureRegions() stored.
   */
  getFeatureRegion(): IRegionList {
    const out: IRegionList = { DNA: [], mRNA: [], RNA: [], CDS: [] };
    for (const r of this._regions) {
      for (const e of r.featureRegions ?? []) {
        const assemblyTag = e.assembly ? { assembly: e.assembly } : {};
        if (e.feature === "DNA") {
          out.DNA.push({
            chr: e.chr,
            start: e.start,
            end: e.end,
            strand: e.strand,
            ...assemblyTag,
          });
        } else {
          out[e.feature].push({
            chr: e.chr,
            start: e.start,
            end: e.end,
            strand: e.strand,
            trans_id: e.trans_id ?? "",
            trans_name: e.trans_name ?? "",
            gene_id: e.gene_id ?? "",
            gene_name: e.gene_name ?? "",
            tss: e.tss ?? 0,
            ...assemblyTag,
          });
        }
      }
    }
    return out;
  }
}
