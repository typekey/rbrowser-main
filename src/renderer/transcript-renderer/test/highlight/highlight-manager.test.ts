import { describe, it, expect } from "vitest";
import {
  HighlightManager,
  type IHighlightProjectionContext,
} from "../../highlight/index";
import { CDSCoordinateMapper } from "../../utils/cds";

// A "+"-strand transcript:
//   TSS at genomic 1000
//   exons: [1000,1100] [1200,1300]  → mature-mRNA length 200
//   CDS:   [1050,1100] [1200,1250]  → CDS length 100
function plusStrandCtx(
  over: Partial<IHighlightProjectionContext> = {},
): IHighlightProjectionContext {
  return {
    chr: "chr1",
    rna: {
      tssPos: 1000,
      strand: "+",
      chr: "chr1",
      name: "T1-201",
      txStart: 1000,
      txEnd: 1300,
    },
    cds: new CDSCoordinateMapper(
      [
        { start: 1050, end: 1100 },
        { start: 1200, end: 1250 },
      ],
      "+",
    ),
    exonMapper: new CDSCoordinateMapper(
      [
        { start: 1000, end: 1100 },
        { start: 1200, end: 1300 },
      ],
      "+",
    ),
    cdsInfo: null,
    txInfo: {
      gene_id: "G1",
      trans_id: "T1",
      trans_name: "T1-201",
      gene_name: "GENE1",
    },
    isCdsMode: false,
    assembly: { name: "GRCh38" },
    signature: "T1|dna|GRCh38",
    ...over,
  };
}

describe("HighlightManager — storage", () => {
  it("starts empty", () => {
    const hm = new HighlightManager();
    expect(hm.isEmpty).toBe(true);
    expect(hm.size).toBe(0);
    expect(hm.regions).toEqual([]);
  });

  it("setRegion / removeRegion / clear round-trip", () => {
    const hm = new HighlightManager();
    hm.setRegion("a", 100, 200, "#fff");
    expect(hm.size).toBe(1);
    expect(hm.regions[0]).toMatchObject({ name: "a", start: 100, end: 200 });
    hm.removeRegion("a");
    expect(hm.size).toBe(0);
    hm.setRegion("b", 1, 2);
    hm.clear();
    expect(hm.isEmpty).toBe(true);
  });

  it("normalizes zero/negative-length regions to start+1", () => {
    const hm = new HighlightManager();
    hm.setRegion("a", 500, 500);
    expect(hm.regions[0].end).toBe(501);
  });

  it("updates an existing region by name instead of duplicating", () => {
    const hm = new HighlightManager();
    hm.setRegion("a", 100, 200, "#111");
    hm.setRegion("a", 300, 400, "#222");
    expect(hm.size).toBe(1);
    expect(hm.regions[0]).toMatchObject({ start: 300, end: 400, color: "#222" });
  });
});

describe("HighlightManager — feature projection (+ strand)", () => {
  it("projects DNA / mRNA / RNA / CDS for a highlight inside the CDS", () => {
    const hm = new HighlightManager();
    // genomic highlight [1210, 1240] (DNA/RNA-mode coords)
    hm.setRegion("h1", 1210, 1240);
    hm.projectFeatureRegions(plusStrandCtx());
    const rl = hm.getFeatureRegion();

    expect(rl.DNA[0]).toMatchObject({
      chr: "chr1",
      start: 1210,
      end: 1240,
      strand: ".",
    });
    // mRNA: introns collapsed — 1210→110, 1240→140
    expect(rl.mRNA[0]).toMatchObject({
      start: 110,
      end: 140,
      strand: "+",
      trans_id: "T1",
      trans_name: "T1-201",
      gene_name: "GENE1",
    });
    // RNA: TSS-relative — 1210-1000, 1240-1000
    expect(rl.RNA[0]).toMatchObject({ start: 210, end: 240, strand: "+" });
    // CDS: 1210→60, 1240→90
    expect(rl.CDS[0]).toMatchObject({ start: 60, end: 90, strand: "+" });
  });

  it("stamps the active assembly onto every entry", () => {
    const hm = new HighlightManager();
    hm.setRegion("h1", 1210, 1240);
    hm.projectFeatureRegions(plusStrandCtx());
    const rl = hm.getFeatureRegion();
    for (const list of [rl.DNA, rl.mRNA, rl.RNA, rl.CDS]) {
      expect(list[0].assembly).toEqual({ name: "GRCh38" });
    }
  });
});

describe("HighlightManager — feature projection (- strand)", () => {
  function minusStrandCtx(): IHighlightProjectionContext {
    return {
      chr: "chr1",
      rna: {
        tssPos: 1300,
        strand: "-",
        chr: "chr1",
        name: "M1-201",
        txStart: 1000,
        txEnd: 1300,
      },
      cds: new CDSCoordinateMapper(
        [
          { start: 1050, end: 1100 },
          { start: 1200, end: 1250 },
        ],
        "-",
      ),
      exonMapper: new CDSCoordinateMapper(
        [
          { start: 1000, end: 1100 },
          { start: 1200, end: 1300 },
        ],
        "-",
      ),
      cdsInfo: null,
      txInfo: {
        gene_id: "G2",
        trans_id: "M1",
        trans_name: "M1-201",
        gene_name: "GENE2",
      },
      isCdsMode: false,
      assembly: { name: "GRCh38" },
      signature: "M1|dna|GRCh38",
    };
  }

  it("flips mRNA / RNA / CDS across transcript length on the minus strand", () => {
    const hm = new HighlightManager();
    hm.setRegion("h1", 1210, 1240);
    hm.projectFeatureRegions(minusStrandCtx());
    const rl = hm.getFeatureRegion();

    // DNA stays genomic + strandless
    expect(rl.DNA[0]).toMatchObject({ start: 1210, end: 1240, strand: "." });
    // mRNA flipped across mature length 200: 200-140, 200-110
    expect(rl.mRNA[0]).toMatchObject({ start: 60, end: 90, strand: "-" });
    // RNA: tss(1300) - end, tss - start
    expect(rl.RNA[0]).toMatchObject({ start: 60, end: 90, strand: "-" });
    // CDS flipped across CDS length 100: 100-90, 100-60
    expect(rl.CDS[0]).toMatchObject({ start: 10, end: 40, strand: "-" });
  });
});

describe("HighlightManager — non-coding / no-transcript fallback", () => {
  it("reports CDS 0-0, mRNA/RNA genomic and strandless when no mappers", () => {
    const hm = new HighlightManager();
    hm.setRegion("h1", 1210, 1240);
    hm.projectFeatureRegions({
      chr: "chr1",
      rna: null,
      cds: null,
      exonMapper: null,
      cdsInfo: null,
      txInfo: null,
      isCdsMode: false,
      signature: "none|dna|",
    });
    const rl = hm.getFeatureRegion();

    expect(rl.DNA[0]).toMatchObject({ start: 1210, end: 1240, strand: "." });
    expect(rl.mRNA[0]).toMatchObject({ start: 1210, end: 1240, strand: "." });
    expect(rl.RNA[0]).toMatchObject({ start: 1210, end: 1240, strand: "." });
    expect(rl.CDS[0]).toMatchObject({
      start: 0,
      end: 0,
      strand: ".",
      trans_id: "",
    });
  });
});

describe("HighlightManager — grouping & ordering", () => {
  it("getFeatureRegion groups per feature, preserving highlight order", () => {
    const hm = new HighlightManager();
    hm.setRegion("h1", 1210, 1240);
    hm.setRegion("h2", 1211, 1241);
    hm.projectFeatureRegions(plusStrandCtx());
    const rl = hm.getFeatureRegion();

    expect(rl.DNA.map((e) => e.start)).toEqual([1210, 1211]);
    expect(rl.mRNA).toHaveLength(2);
    expect(rl.RNA).toHaveLength(2);
    expect(rl.CDS).toHaveLength(2);
  });
});

describe("HighlightManager — dirty guard", () => {
  it("skips re-projection when version and signature are unchanged", () => {
    const hm = new HighlightManager();
    hm.setRegion("h1", 1210, 1240);
    hm.projectFeatureRegions(plusStrandCtx());
    expect(hm.getFeatureRegion().RNA[0].start).toBe(210);

    // Different TSS would move RNA to a different value, but SAME signature and
    // no mutation → guard must skip, leaving the cached 210.
    hm.projectFeatureRegions(
      plusStrandCtx({
        rna: {
          tssPos: 2000,
          strand: "+",
          chr: "chr1",
          name: "T1-201",
          txStart: 1000,
          txEnd: 1300,
        },
      }),
    );
    expect(hm.getFeatureRegion().RNA[0].start).toBe(210);
  });

  it("re-projects when the signature changes", () => {
    const hm = new HighlightManager();
    hm.setRegion("h1", 1210, 1240);
    hm.projectFeatureRegions(plusStrandCtx());
    hm.projectFeatureRegions(
      plusStrandCtx({
        rna: {
          tssPos: 2000,
          strand: "+",
          chr: "chr1",
          name: "T1-201",
          txStart: 1000,
          txEnd: 1300,
        },
        signature: "T1|rna|GRCh38",
      }),
    );
    // 1210 - 2000 = -790
    expect(hm.getFeatureRegion().RNA[0].start).toBe(-790);
  });

  it("re-projects when a highlight is added (version bump)", () => {
    const hm = new HighlightManager();
    hm.setRegion("h1", 1210, 1240);
    hm.projectFeatureRegions(plusStrandCtx());
    expect(hm.getFeatureRegion().DNA).toHaveLength(1);

    hm.setRegion("h2", 1211, 1241);
    // same signature, but version changed → must re-project both
    hm.projectFeatureRegions(plusStrandCtx());
    expect(hm.getFeatureRegion().DNA).toHaveLength(2);
  });
});
