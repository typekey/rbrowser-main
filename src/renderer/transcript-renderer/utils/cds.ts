export interface CDSInterval {
  start: number;
  end: number;
}

/** Feature type identifiers available from the transcript API. */
export type TranscriptFeatureType =
  | "CDS"
  | "exon"
  | "five_prime_UTR"
  | "three_prime_UTR"
  | "start_codon"
  | "stop_codon";

/** A transcript feature with its genomic coordinates. */
export interface TranscriptFeature {
  type: TranscriptFeatureType;
  /** 0-based genomic start. */
  start: number;
  /** 0-based half-open genomic end. */
  end: number;
}

/**
 * CDS coordinate mapper. Built from genomic CDS intervals; provides O(log n)
 * genomic → CDS and CDS → genomic transformations.
 */
export class CDSCoordinateMapper {
  /** Sorted, non-overlapping CDS intervals. */
  readonly cdsRegions: CDSInterval[];
  /** Cumulative gap before each CDS region (cumulativeGaps[i] = sum of all intron gaps before cdsRegions[i]). */
  private readonly cumulativeGaps: number[];
  /** Total length of all gaps removed. */
  readonly totalGapLength: number;
  /** Start of the first CDS (genomic coordinate) — this becomes CDS coordinate 0. */
  readonly cdsStart: number;
  /** End of the last CDS (genomic coordinate). */
  readonly cdsEnd: number;
  /** Total CDS length (sum of all CDS region lengths). */
  readonly totalCDSLength: number;
  /** Strand of the transcript. */
  readonly strand: "+" | "-";

  constructor(cdsIntervals: CDSInterval[], strand: "+" | "-" = "+") {
    this.cdsRegions = [...cdsIntervals].sort((a, b) => a.start - b.start);
    this.strand = strand;

    if (this.cdsRegions.length === 0) {
      this.cumulativeGaps = [];
      this.totalGapLength = 0;
      this.cdsStart = 0;
      this.cdsEnd = 0;
      this.totalCDSLength = 0;
      return;
    }

    this.cdsStart = this.cdsRegions[0].start;
    this.cdsEnd = this.cdsRegions[this.cdsRegions.length - 1].end;

    this.cumulativeGaps = new Array(this.cdsRegions.length);
    this.cumulativeGaps[0] = 0;
    let totalGap = 0;
    for (let i = 1; i < this.cdsRegions.length; i++) {
      const gap = this.cdsRegions[i].start - this.cdsRegions[i - 1].end;
      totalGap += Math.max(0, gap);
      this.cumulativeGaps[i] = totalGap;
    }
    this.totalGapLength = totalGap;

    this.totalCDSLength = this.cdsRegions.reduce(
      (sum, r) => sum + (r.end - r.start),
      0,
    );
  }

  /**
   * Convert a genomic coordinate to CDS coordinate.
   * CDS coordinate 0 = first base of the first CDS region.
   */
  genomicToCDS(genomicPos: number): number {
    if (this.cdsRegions.length === 0) return genomicPos;

    // Before first CDS: offset from CDS start (negative)
    if (genomicPos <= this.cdsStart) {
      return genomicPos - this.cdsStart;
    }

    // After last CDS: offset from CDS end, shifted by total gap
    if (genomicPos >= this.cdsEnd) {
      return genomicPos - this.cdsStart - this.totalGapLength;
    }

    // Find which CDS region or gap this position falls in
    const idx = this.findCDSIndex(genomicPos);

    if (idx >= 0) {
      // Inside CDS region idx
      return genomicPos - this.cdsStart - this.cumulativeGaps[idx];
    }

    // In a gap between CDS regions
    // Map to the end of the preceding CDS (or start of the next)
    const insertionIdx = -(idx + 1); // index of next CDS region
    if (insertionIdx > 0) {
      // Map to end of preceding CDS (collapse the gap)
      const prevCDS = this.cdsRegions[insertionIdx - 1];
      return (
        prevCDS.end - this.cdsStart - this.cumulativeGaps[insertionIdx - 1]
      );
    }

    // Before first CDS (shouldn't reach here due to early return above)
    return genomicPos - this.cdsStart;
  }

  /** Convert a CDS coordinate back to genomic coordinate. */
  cdsToGenomic(cdsPos: number): number {
    if (this.cdsRegions.length === 0) return cdsPos;

    // Before first CDS (negative CDS coordinates)
    if (cdsPos < 0) {
      return this.cdsStart + cdsPos;
    }

    // After total CDS length
    if (cdsPos >= this.totalCDSLength) {
      return this.cdsEnd + (cdsPos - this.totalCDSLength);
    }

    // Within CDS regions — find which one
    let runningLength = 0;
    for (let i = 0; i < this.cdsRegions.length; i++) {
      const regionLen = this.cdsRegions[i].end - this.cdsRegions[i].start;
      if (cdsPos < runningLength + regionLen) {
        return this.cdsRegions[i].start + (cdsPos - runningLength);
      }
      runningLength += regionLen;
    }

    // Past end
    return this.cdsEnd + (cdsPos - this.totalCDSLength);
  }

  /**
   * Transform a genomic region [start, end) to CDS coordinates.
   *
   * Returns an array of non-overlapping CDS-coordinate intervals.
   * A genomic interval that spans intron gaps will be split into multiple
   * CDS-coordinate intervals (one per CDS region it overlaps).
   *
   * Features entirely within gaps return an empty array.
   */
  transformRegion(
    start: number,
    end: number,
  ): Array<{ start: number; end: number }> {
    if (this.cdsRegions.length === 0) return [{ start, end }];

    const result: Array<{ start: number; end: number }> = [];

    // Before first CDS
    if (start < this.cdsStart) {
      const clippedEnd = Math.min(end, this.cdsStart);
      result.push({
        start: start - this.cdsStart,
        end: clippedEnd - this.cdsStart,
      });
      if (end <= this.cdsStart) return result;
    }

    // Overlap with CDS regions
    for (let i = 0; i < this.cdsRegions.length; i++) {
      const cds = this.cdsRegions[i];
      if (start >= cds.end) continue; // feature starts after this CDS
      if (end <= cds.start) break; // feature ends before this CDS

      const overlapStart = Math.max(start, cds.start);
      const overlapEnd = Math.min(end, cds.end);

      result.push({
        start: overlapStart - this.cdsStart - this.cumulativeGaps[i],
        end: overlapEnd - this.cdsStart - this.cumulativeGaps[i],
      });
    }

    // After last CDS
    if (end > this.cdsEnd) {
      const clippedStart = Math.max(start, this.cdsEnd);
      result.push({
        start: clippedStart - this.cdsStart - this.totalGapLength,
        end: end - this.cdsStart - this.totalGapLength,
      });
    }

    return result;
  }

  /**
   * Transform an array of feature records for CDS-mode display.
   *
   * Each feature is expected to have `start`/`end` (or `chromStart`/`chromEnd`).
   * Features entirely within intron gaps are removed.
   * Features spanning CDS boundaries are split into the CDS-overlapping portions.
   *
   * Returns new feature objects with updated coordinates (does NOT mutate originals).
   */
  transformFeatures(features: any[]): any[] {
    if (this.cdsRegions.length === 0) return features;

    const result: any[] = [];
    for (const feat of features) {
      const fStart = feat.start ?? feat.chromStart;
      const fEnd = feat.end ?? feat.chromEnd;
      if (fStart == null || fEnd == null) {
        result.push(feat); // pass through features without coordinates
        continue;
      }

      const transformed = this.transformRegion(fStart, fEnd);
      for (const t of transformed) {
        result.push({
          ...feat,
          start: t.start,
          end: t.end,
          chromStart: t.start,
          chromEnd: t.end,
          // Preserve original genomic coordinates for reference
          _originalStart: fStart,
          _originalEnd: fEnd,
        });
      }
    }
    return result;
  }

  /**
   * Compute the CDS-mode viewport domain.
   *
   * Given the genomic viewport [start, end), returns the equivalent domain
   * in CDS coordinate space.
   */
  transformDomain(start: number, end: number): { start: number; end: number } {
    return {
      start: this.genomicToCDS(start),
      end: this.genomicToCDS(end),
    };
  }

  /**
   * Get the total span in CDS coordinate space for the entire visible region.
   * This is used to set up the interaction controller bounds.
   */
  getCDSBounds(
    flankStart: number,
    flankEnd: number,
  ): { minStart: number; maxEnd: number } {
    return {
      minStart: this.genomicToCDS(flankStart),
      maxEnd: this.genomicToCDS(flankEnd),
    };
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  /**
   * Binary search for the CDS region containing the given genomic position.
   *
   * Returns:
   *   - Non-negative index if pos is inside cdsRegions[index]
   *   - Negative value -(insertionPoint + 1) if pos is in a gap
   *     (insertionPoint = index of the next CDS region)
   */
  private findCDSIndex(pos: number): number {
    let lo = 0;
    let hi = this.cdsRegions.length - 1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const cds = this.cdsRegions[mid];

      if (pos < cds.start) {
        hi = mid - 1;
      } else if (pos >= cds.end) {
        lo = mid + 1;
      } else {
        return mid; // inside this CDS
      }
    }

    // Not inside any CDS — lo is the insertion point
    return -(lo + 1);
  }
}

/**
 * Parse CDS intervals from the transcript API response.
 *
 * The API returns `results.base.CDS.position` as a flat array of
 * [start, end, start, end, ...] pairs in **1-based GFF3** coordinates — the
 * same convention as `exon` / `start_codon` / `UTR` (the CDS `start` shares the
 * exact value of `start_codon`'s `start`). Converted to 0-based half-open here,
 * matching parseExonsFromTranscriptAPI and the buildin structure
 * channels — otherwise the CDS mapper's origin sits 1 bp downstream of the real
 * start codon and every CDS coordinate reads 1 too low (e.g. the start codon
 * lands at CDS −1 instead of 0).
 */
export function parseCDSFromTranscriptAPI(apiResponse: any): CDSInterval[] {
  const cdsData = apiResponse?.results?.base?.CDS;
  if (!cdsData?.position) return [];

  const positions: number[] = cdsData.position;
  const intervals: CDSInterval[] = [];

  for (let i = 0; i + 1 < positions.length; i += 2) {
    intervals.push({
      // 1-based inclusive start → 0-based; 1-based inclusive end = 0-based
      // exclusive end (unchanged).
      start: positions[i] - 1,
      end: positions[i + 1],
    });
  }

  return intervals;
}

export function mergeTranscriptStructure(primary: any, fallback: any): any {
  if (!primary) return primary;
  // Primary already has CDS — nothing to recover.
  if (parseCDSFromTranscriptAPI(primary).length > 0) return primary;
  // Fallback can't supply CDS either (e.g. a genuine non-coding transcript).
  if (!fallback || parseCDSFromTranscriptAPI(fallback).length === 0) {
    return primary;
  }
  const fallbackBase = fallback?.results?.base;
  if (!fallbackBase) return primary;
  // Keep the primary's identity (region / id); take the fallback's structure.
  return {
    ...primary,
    results: { ...primary.results, base: fallbackBase },
  };
}

export function parseExonsFromTranscriptAPI(apiResponse: any): CDSInterval[] {
  const exonData = apiResponse?.results?.base?.exon;
  if (!exonData?.position) return [];

  const positions: number[] = exonData.position;
  const intervals: CDSInterval[] = [];

  for (let i = 0; i + 1 < positions.length; i += 2) {
    // API positions are 1-based (GFF3) — convert to 0-based half-open
    intervals.push({
      start: positions[i] - 1,
      end: positions[i + 1],
    });
  }

  return intervals;
}

export function parseTranscriptFeaturesFromAPI(
  apiResponse: any,
): TranscriptFeature[] {
  const base = apiResponse?.results?.base;
  if (!base) return [];

  const features: TranscriptFeature[] = [];
  const featureTypes: TranscriptFeatureType[] = [
    "CDS",
    "exon",
    "five_prime_UTR",
    "three_prime_UTR",
    "start_codon",
    "stop_codon",
  ];

  for (const type of featureTypes) {
    const data = base[type];
    if (!data?.position) continue;
    const positions: number[] = data.position;
    // All feature types — CDS included — are 1-based GFF3 (the CDS `start`
    // equals the `start_codon` `start`). Convert the inclusive start to 0-based;
    // the inclusive end already equals the 0-based exclusive end.
    for (let i = 0; i + 1 < positions.length; i += 2) {
      features.push({
        type,
        start: positions[i] - 1,
        end: positions[i + 1],
      });
    }
  }

  return features;
}
