import { describe, it, expect } from "vitest";
import { CDSCoordinateMapper } from "../../utils/cds";
import {
  baseRangeOffsets,
  cdsBaseOffset,
  rnaBaseOffset,
} from "../../utils/transcript-coords";

// Real transcripts (GENCODE v44 = Ensembl), 0-based half-open genomic.
// TP53-201 (−): transcript [7668420, 7687490) → tssPos = 7687490 (txEnd).
// EGFR-201 (+): transcript [55019016, 55211628) → tssPos = 55019016.
const TP53_TSS = 7687490;
const EGFR_TSS = 55019016;

describe("rnaBaseOffset — the TSS base reads 0 on both strands", () => {
  it("plus strand", () => {
    expect(rnaBaseOffset(55019016, EGFR_TSS, "+")).toBe(0);
    expect(rnaBaseOffset(55019015, EGFR_TSS, "+")).toBe(-1);
    expect(rnaBaseOffset(55019277, EGFR_TSS, "+")).toBe(261); // start codon
  });

  it("minus strand", () => {
    // Regression: tssPos − pos read +1 on the TSS base and 0 one base upstream.
    expect(rnaBaseOffset(7687489, TP53_TSS, "-")).toBe(0);
    expect(rnaBaseOffset(7687490, TP53_TSS, "-")).toBe(-1);
    expect(rnaBaseOffset(7676593, TP53_TSS, "-")).toBe(10896); // start codon
  });
});

describe("cdsBaseOffset — the start codon's first base reads 0 on both strands", () => {
  // Two CDS exons with an intron gap; the start codon is on the left (+) or right (−).
  const mapper = new CDSCoordinateMapper(
    [
      { start: 100, end: 130 },
      { start: 200, end: 260 },
    ],
    "-",
  );
  const len = mapper.totalCDSLength; // 90

  it("plus strand", () => {
    expect(cdsBaseOffset(mapper.genomicToCDS(100), len, "+")).toBe(0);
    expect(cdsBaseOffset(mapper.genomicToCDS(200), len, "+")).toBe(30);
    expect(cdsBaseOffset(mapper.genomicToCDS(99), len, "+")).toBe(-1);
  });

  it("minus strand", () => {
    // Regression: totalCDSLength − pos read +1 on the start codon.
    expect(cdsBaseOffset(mapper.genomicToCDS(259), len, "-")).toBe(0);
    expect(cdsBaseOffset(mapper.genomicToCDS(129), len, "-")).toBe(60);
    expect(cdsBaseOffset(mapper.genomicToCDS(100), len, "-")).toBe(89);
    expect(cdsBaseOffset(mapper.genomicToCDS(260), len, "-")).toBe(-1); // 5′ UTR
  });
});

describe("baseRangeOffsets — tooltip spans, 5′ base first", () => {
  it("one base reads the same value on both strands", () => {
    const plus = (g: number) => rnaBaseOffset(g, EGFR_TSS, "+");
    const minus = (g: number) => rnaBaseOffset(g, TP53_TSS, "-");
    expect(baseRangeOffsets(55019016, 55019017, "+", plus)).toEqual([0, 0]);
    // Regression: the minus strand printed "+1 – +0" for the TSS base.
    expect(baseRangeOffsets(7687489, 7687490, "-", minus)).toEqual([0, 0]);
  });

  it("multi-base spans list the 5′ base first (inclusive)", () => {
    const minus = (g: number) => rnaBaseOffset(g, TP53_TSS, "-");
    expect(baseRangeOffsets(7687480, 7687490, "-", minus)).toEqual([0, 9]);
  });

  it("CDS tooltip on the minus strand counts from the start codon", () => {
    const m = new CDSCoordinateMapper([{ start: 100, end: 1279 }], "-");
    const len = m.totalCDSLength; // 1179 like TP53-201
    const toCds = (c: number) => cdsBaseOffset(c, len, "-");
    // Start codon = 3 bases at the high genomic end (raw CDS 1176..1178).
    // Regression: the raw CDS coordinate "CDS +1,176 – +1,179" was shown.
    expect(baseRangeOffsets(1176, 1179, "-", toCds)).toEqual([0, 2]);
    expect(baseRangeOffsets(0, 1, "-", toCds)).toEqual([1178, 1178]);
  });

  it("a zero-length point keeps its boundary offset", () => {
    const minus = (g: number) => rnaBaseOffset(g, TP53_TSS, "-");
    expect(baseRangeOffsets(TP53_TSS, TP53_TSS, "-", minus)).toEqual([0, 0]);
    const plus = (g: number) => rnaBaseOffset(g, EGFR_TSS, "+");
    expect(baseRangeOffsets(EGFR_TSS + 5, EGFR_TSS + 5, "+", plus)).toEqual([5, 5]);
  });
});
