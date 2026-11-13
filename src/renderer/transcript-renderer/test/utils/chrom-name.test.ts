import { describe, it, expect } from "vitest";
import { chromNameCandidates, resolveChromSize } from "../../utils/chrom-name";

// UCSC-style hg38 chrom.sizes uses "chr"-prefixed names and "chrM" for the
// mitochondrion (verified against the live hg38.chromsizes file).
const ucsc = new Map<string, number>([
  ["chr3", 198295559],
  ["chrX", 156040895],
  ["chrM", 16569],
]);

// Ensembl-style references ship bare names and "MT" for the mitochondrion.
const ensembl = new Map<string, number>([
  ["3", 198295559],
  ["MT", 16569],
]);

describe("resolveChromSize", () => {
  it("resolves a direct match", () => {
    expect(resolveChromSize(ucsc, "chr3")).toBe(198295559);
  });

  it("tolerates a missing 'chr' prefix (bare nav name → chr-keyed file)", () => {
    expect(resolveChromSize(ucsc, "3")).toBe(198295559);
  });

  it("tolerates an extra 'chr' prefix (chr nav name → bare-keyed file)", () => {
    expect(resolveChromSize(ensembl, "chr3")).toBe(198295559);
  });

  // Regression: tRNA-Ala (chrom "MT") was hidden because navigateTo prefixes
  // "MT" → "chrMT", which matched neither "chrM" nor "MT". The whole RNA nav
  // bar got setChromSize(0) and disappeared.
  it("resolves Ensembl 'MT' (→ 'chrMT') against a UCSC 'chrM' file", () => {
    expect(resolveChromSize(ucsc, "chrMT")).toBe(16569);
    expect(resolveChromSize(ucsc, "MT")).toBe(16569);
  });

  it("resolves UCSC 'M' (→ 'chrM') against an Ensembl 'MT' file", () => {
    expect(resolveChromSize(ensembl, "chrM")).toBe(16569);
    expect(resolveChromSize(ensembl, "M")).toBe(16569);
  });

  it("returns undefined for a genuinely absent chromosome", () => {
    expect(resolveChromSize(ucsc, "chr99")).toBeUndefined();
  });
});

describe("chromNameCandidates", () => {
  it("includes the input first", () => {
    expect(chromNameCandidates("chr3")[0]).toBe("chr3");
  });

  it("toggles the 'chr' prefix without duplicates", () => {
    expect(chromNameCandidates("chr3")).toEqual(["chr3", "3"]);
    expect(chromNameCandidates("3")).toEqual(["3", "chr3"]);
  });

  it("expands every mitochondrial spelling for an MT input", () => {
    expect(chromNameCandidates("chrMT")).toEqual(
      expect.arrayContaining(["chrMT", "MT", "M", "chrM"]),
    );
  });
});
