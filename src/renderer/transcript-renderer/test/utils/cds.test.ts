import { describe, it, expect } from "vitest";
import {
  parseCDSFromTranscriptAPI,
  parseTranscriptFeaturesFromAPI,
  mergeTranscriptStructure,
} from "../../utils/cds";

// The API returns every base.<type>.position in 1-based GFF3, including CDS
// (its start equals start_codon's start). All must convert to 0-based, so the
// start codon lands at CDS coordinate 0 — not −1.
describe("CDS 1-based → 0-based conversion", () => {
  const json = {
    results: {
      base: {
        exon: { position: [100, 300] },
        CDS: { position: [150, 200] },
        start_codon: { position: [150, 152] },
      },
    },
  };

  it("converts the 1-based CDS start to 0-based half-open", () => {
    expect(parseCDSFromTranscriptAPI(json)).toEqual([{ start: 149, end: 200 }]);
  });

  it("places the CDS start at the same 0-based base as start_codon", () => {
    const feats = parseTranscriptFeaturesFromAPI(json);
    const cds = feats.find((f) => f.type === "CDS");
    const sc = feats.find((f) => f.type === "start_codon");
    expect(cds?.start).toBe(149); // 150 (1-based) → 149 (0-based), not 150
    expect(cds?.start).toBe(sc?.start); // start codon == first CDS base
  });
});

// A search-only endpoint (e.g. the mm10 `api`) resolves name→region and
// returns exon structure, but carries NO CDS / UTR / codon data.
const indexOnlyApiJson = () => ({
  results: {
    id: 42,
    region: {
      trans_id: "ENSMUST00000030797.3",
      trans_name: "Vamp3-201",
      trans_type: "protein_coding",
      gene_id: "ENSMUSG00000028955.3",
      gene_name: "Vamp3",
      chrom: "chr4",
      start: 151047300,
      end: 151057953,
      strand: "-",
    },
    base: {
      exon: { position: [151047300, 151048000, 151057000, 151057953] },
    },
  },
});

// A GFF-derived response for the same transcript DOES carry CDS structure.
const gffJson = () => ({
  results: {
    id: 0,
    region: {
      trans_name: "Vamp3-201",
      chrom: "chr4",
      start: 151047300,
      end: 151057953,
      strand: "-",
    },
    base: {
      exon: { position: [151047300, 151048000, 151057000, 151057953] },
      CDS: { position: [151047500, 151047800, 151057100, 151057400] },
      five_prime_UTR: { position: [151057401, 151057953] },
      three_prime_UTR: { position: [151047300, 151047499] },
    },
  },
});

describe("mergeTranscriptStructure", () => {
  it("grafts GFF CDS structure onto an index-only API response", () => {
    const merged = mergeTranscriptStructure(indexOnlyApiJson(), gffJson());
    // CDS is now recoverable
    expect(parseCDSFromTranscriptAPI(merged).length).toBe(2);
  });

  it("preserves the API response's region identity (no silent fallback)", () => {
    const merged = mergeTranscriptStructure(indexOnlyApiJson(), gffJson());
    // gene identity must come from the API, NOT the structure-poor GFF region
    expect(merged.results.region.gene_id).toBe("ENSMUSG00000028955.3");
    expect(merged.results.region.gene_name).toBe("Vamp3");
    expect(merged.results.region.trans_id).toBe("ENSMUST00000030797.3");
  });

  it("returns the primary unchanged when it already has CDS", () => {
    const primary = gffJson(); // already has CDS
    const merged = mergeTranscriptStructure(primary, indexOnlyApiJson());
    expect(merged).toBe(primary);
  });

  it("returns the primary unchanged when the fallback also lacks CDS", () => {
    // genuine non-coding transcript: neither source has CDS
    const primary = indexOnlyApiJson();
    const merged = mergeTranscriptStructure(primary, indexOnlyApiJson());
    expect(merged).toBe(primary);
    expect(parseCDSFromTranscriptAPI(merged).length).toBe(0);
  });

  it("tolerates a null fallback", () => {
    const primary = indexOnlyApiJson();
    expect(mergeTranscriptStructure(primary, null)).toBe(primary);
  });
});
