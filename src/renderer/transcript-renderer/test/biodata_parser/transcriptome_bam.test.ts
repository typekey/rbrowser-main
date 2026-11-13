import { describe, it, expect } from "vitest";
import { CDSCoordinateMapper } from "../../utils/cds";
import {
  projectTranscriptIntervalToGenomic,
  remapTranscriptomeReads,
} from "../../utils/transcriptome-bam";

// Two 10-bp exons separated by a 90-bp intron.
//   exon1: genomic [100, 110)
//   exon2: genomic [200, 210)
// Spliced transcript length L = 20.
const EXONS = [
  { start: 100, end: 110 },
  { start: 200, end: 210 },
];

describe("projectTranscriptIntervalToGenomic", () => {
  it("plus strand: read inside the first exon maps linearly", () => {
    const m = new CDSCoordinateMapper(EXONS, "+");
    // tx [2, 7) → genomic [102, 107)
    expect(projectTranscriptIntervalToGenomic(m, 2, 7)).toEqual([
      { start: 102, end: 107 },
    ]);
  });

  it("plus strand: junction-spanning read splits into two blocks", () => {
    const m = new CDSCoordinateMapper(EXONS, "+");
    // tx [5, 15) → exon1 [105,110) + exon2 [200,205)
    expect(projectTranscriptIntervalToGenomic(m, 5, 15)).toEqual([
      { start: 105, end: 110 },
      { start: 200, end: 205 },
    ]);
  });

  it("plus strand: full transcript maps to both complete exons", () => {
    const m = new CDSCoordinateMapper(EXONS, "+");
    expect(projectTranscriptIntervalToGenomic(m, 0, 20)).toEqual([
      { start: 100, end: 110 },
      { start: 200, end: 210 },
    ]);
  });

  it("minus strand: 5' start maps to the genomic-rightmost base", () => {
    const m = new CDSCoordinateMapper(EXONS, "-");
    // tx pos 0 (5') = genomic 209; tx [0,5) covers genomic 205..209
    expect(projectTranscriptIntervalToGenomic(m, 0, 5)).toEqual([
      { start: 205, end: 210 },
    ]);
  });

  it("minus strand: junction-spanning read yields the mirrored genomic footprint", () => {
    const m = new CDSCoordinateMapper(EXONS, "-");
    // tx [5, 15): tx5..9 → genomic 200..204 (exon2), tx10..14 → 105..109 (exon1)
    expect(projectTranscriptIntervalToGenomic(m, 5, 15)).toEqual([
      { start: 105, end: 110 },
      { start: 200, end: 205 },
    ]);
  });

  it("minus strand: full transcript maps to both complete exons", () => {
    const m = new CDSCoordinateMapper(EXONS, "-");
    expect(projectTranscriptIntervalToGenomic(m, 0, 20)).toEqual([
      { start: 100, end: 110 },
      { start: 200, end: 210 },
    ]);
  });

  it("clips reads that extend past the transcript ends", () => {
    const m = new CDSCoordinateMapper(EXONS, "+");
    // tx [-3, 25) clamps to [0, 20) → both full exons
    expect(projectTranscriptIntervalToGenomic(m, -3, 25)).toEqual([
      { start: 100, end: 110 },
      { start: 200, end: 210 },
    ]);
  });

  it("returns empty for degenerate / out-of-range intervals", () => {
    const m = new CDSCoordinateMapper(EXONS, "+");
    expect(projectTranscriptIntervalToGenomic(m, 5, 5)).toEqual([]);
    expect(projectTranscriptIntervalToGenomic(m, 25, 30)).toEqual([]);
  });
});

describe("remapTranscriptomeReads", () => {
  it("expands a junction-spanning read into blocks sharing one lane", () => {
    const m = new CDSCoordinateMapper(EXONS, "+");
    const { reads, maxLane } = remapTranscriptomeReads(
      [{ start: 5, end: 15, strand: 1, name: "r1" }],
      m,
    );
    expect(maxLane).toBe(0);
    expect(reads).toHaveLength(2);
    expect(reads.every((r) => r.lane === 0)).toBe(true);
    expect(reads.every((r) => r._txRemapped)).toBe(true);
    expect(reads.map((r) => [r.start, r.end])).toEqual([
      [105, 110],
      [200, 205],
    ]);
    // readLength = transcript-space span (used for tooltip), not genomic.
    expect(reads[0].readLength).toBe(10);
  });

  it("assigns overlapping reads to separate lanes", () => {
    const m = new CDSCoordinateMapper(EXONS, "+");
    const { maxLane } = remapTranscriptomeReads(
      [
        { start: 0, end: 8, strand: 1, name: "a" },
        { start: 2, end: 9, strand: 1, name: "b" },
      ],
      m,
    );
    expect(maxLane).toBe(1);
  });

  it("flips genomic strand for minus-strand transcripts", () => {
    const m = new CDSCoordinateMapper(EXONS, "-");
    const { reads } = remapTranscriptomeReads(
      [{ start: 0, end: 5, strand: 1, name: "r" }],
      m,
    );
    // forward read on a minus-strand transcript → genomic minus strand
    expect(reads[0].strand).toBe(-1);
  });
});
