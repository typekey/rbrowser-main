/**
 * Base-level RNA / CDS offsets for the cursor and tooltips.
 *
 * Axis ticks label boundaries between bases (`tssPos` / the CDS anchor is a
 * boundary). A base is labelled by its 5′ boundary on the transcript strand:
 * the left edge on "+", the right edge on "−" — hence the extra −1 on the
 * minus strand. With that, the TSS base and the first base of the start
 * codon read 0 on both strands, and the base just upstream reads −1.
 */

export type TxStrand = "+" | "-";

/** Genomic base `pos` (0-based) → offset from the TSS base. */
export function rnaBaseOffset(
  pos: number,
  tssPos: number,
  strand: TxStrand,
): number {
  return strand === "-" ? tssPos - pos - 1 : pos - tssPos;
}

/**
 * Base at CDS coordinate `cdsPos` (CDSCoordinateMapper space: 0 = lowest
 * genomic CDS base) → offset from the first base of the start codon.
 */
export function cdsBaseOffset(
  cdsPos: number,
  totalCDSLength: number,
  strand: TxStrand,
): number {
  return strand === "-" ? totalCDSLength - cdsPos - 1 : cdsPos;
}

/**
 * Half-open `[start, end)` → `[first, last]` base offsets in transcript
 * order (5′ base first). A zero-length span (a point / junction) is a
 * boundary and maps to the boundary offset on both ends.
 */
export function baseRangeOffsets(
  start: number,
  end: number,
  strand: TxStrand,
  toOffset: (pos: number) => number,
): [number, number] {
  if (end <= start) {
    // Boundary: offset of the base just 3′ of it.
    const b = strand === "-" ? toOffset(start - 1) : toOffset(start);
    return [b, b];
  }
  return strand === "-"
    ? [toOffset(end - 1), toOffset(start)]
    : [toOffset(start), toOffset(end - 1)];
}
