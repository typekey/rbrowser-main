/**
 * Shared normalisation for BED / BigBed records.
 *
 * After @gmod/bed `parseLine()` or @gmod/bbi `BigBed.getFeatures()`, the
 * returned objects may have non-standard field names (`field4`, `field5`, …)
 * or the `rest` string from BigBed still unparsed.
 *
 * This module turns them into a consistent shape:
 *   { chrom, chromStart, chromEnd, start, end, name, score, strand, … }
 *
 * `strand` is normalised to  1 ("+"),  -1 ("-"),  0 ("."/unknown).
 */

// ── strand helpers ──────────────────────────────────────────────────────────

const STRAND_MAP: Record<string, number> = {
  "+": 1,
  "-": -1,
  ".": 0,
  "1": 1,
  "-1": -1,
  "0": 0,
};

function toStrand(v: unknown): number {
  if (v === undefined || v === null) return 0;
  return STRAND_MAP[String(v)] ?? 0;
}

function isStrandLike(v: unknown): boolean {
  return v === "+" || v === "-" || v === "." || v === 1 || v === -1;
}

// ── main normaliser ─────────────────────────────────────────────────────────

/**
 * Normalise a record produced by `@gmod/bed` `parseLine()`.
 *
 * Handles the common problem where `parseLine` puts actual BED columns into
 * `field4`, `field5`, … because the file is not detected as BED12.
 */
export function normaliseBedRecord(rec: any): any {
  // ── 1. Fix field4 / field5 if present ──────────────────────────────────
  //
  //  Standard BED6: chrom  start  end  name  score  strand
  //
  //  @gmod/bed may produce:
  //    { chrom, chromStart, chromEnd, name, field4: "+", strand: 0 }
  //  when score is missing and strand sits at column 5.
  //
  //  Or { chrom, chromStart, chromEnd, name, field4, field5, strand: 0 }
  //  when both score and strand fall through heuristic detection.

  if ("field4" in rec) {
    if (isStrandLike(rec.field4)) {
      // field4 is actually strand
      rec.strand = rec.field4;
      delete rec.field4;
      // field5 (if present and numeric) is score
      if ("field5" in rec) {
        const n = Number(rec.field5);
        if (!Number.isNaN(n)) {
          rec.score = n;
        }
        delete rec.field5;
      }
    } else {
      // field4 might be score
      const n = Number(rec.field4);
      if (!Number.isNaN(n)) {
        rec.score = n;
        delete rec.field4;
      }
      // field5 might be strand
      if ("field5" in rec) {
        if (isStrandLike(rec.field5)) {
          rec.strand = rec.field5;
        }
        delete rec.field5;
      }
    }
  }

  // Also handle any remaining fieldN that might contain strand / score
  for (let i = 6; i <= 20; i++) {
    const key = `field${i}`;
    if (key in rec && rec[key] === undefined) delete rec[key];
  }

  // ── 2. Ensure start / end aliases exist ────────────────────────────────
  if (rec.chromStart !== undefined && rec.start === undefined)
    rec.start = rec.chromStart;
  if (rec.chromEnd !== undefined && rec.end === undefined)
    rec.end = rec.chromEnd;

  // ── 3. Normalise strand to 1 / -1 / 0 ─────────────────────────────────
  rec.strand = toStrand(rec.strand);

  return rec;
}

// ── BigBed `rest` parser ────────────────────────────────────────────────────

/**
 * Parse a BigBed feature (from `@gmod/bbi`) which carries a `rest` string
 * containing BED columns 4+ (tab-separated), and produce a normalised record
 * with named fields.
 *
 * Input:  `{ start, end, rest: "Name=L5;...\t0\t+", uniqueId }`
 * Output: `{ chromStart, chromEnd, start, end, name, score, strand, uniqueId }`
 */
export function parseBigBedRest(feature: any): any {
  const { start, end, rest, uniqueId, ...extra } = feature;

  const out: any = {
    chromStart: start,
    chromEnd: end,
    start,
    end,
    ...extra,
  };
  if (uniqueId !== undefined) out.uniqueId = uniqueId;

  if (typeof rest === "string" && rest.length > 0) {
    const cols = rest.split("\t");
    // Standard BED columns after chrom/start/end:
    //   col 0 → name  (BED column 4)
    //   col 1 → score (BED column 5)
    //   col 2 → strand(BED column 6)
    //   col 3+ → additional fields
    if (cols.length > 0) out.name = cols[0];
    if (cols.length > 1) {
      const n = Number(cols[1]);
      out.score = Number.isNaN(n) ? 0 : n;
    }
    if (cols.length > 2) {
      out.strand = toStrand(cols[2]);
    }
    // Keep remaining columns as fieldN
    for (let i = 3; i < cols.length; i++) {
      out[`field${i + 4}`] = cols[i]; // BED column 7,8,9…
    }
    // Also keep the raw rest for tooltip / expand parsing
    out.rest = rest;
  }

  // Default strand
  if (out.strand === undefined) out.strand = 0;

  return out;
}
