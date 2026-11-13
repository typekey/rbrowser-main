import { describe, it, expect } from "vitest";
import {
  locusKey,
  locusToRegionString,
  regionStringToLocus,
} from "../../locus/locus-key";
import type { ILocus } from "../../config/config";

function makeLocus(over: Partial<ILocus> = {}): ILocus {
  return {
    id: "id-1",
    time: "t-1",
    isFavorite: false,
    mode: "dna",
    dna: { chr: "chr1", start: 1000, end: 2000, assembly: "GRCh38" },
    rna: { assembly: "GRCh38" },
    ...over,
  };
}

describe("locusKey", () => {
  it("DNA mode keys on chr/start/end + assembly", () => {
    expect(locusKey(makeLocus())).toBe("GRCh38|dna|chr1:1000-2000");
  });

  it("RNA mode keys on transcript name + flanks + assembly", () => {
    const k = locusKey(
      makeLocus({
        mode: "rna",
        rna: {
          assembly: "GRCh38",
          trans_name: "VAMP3-201",
          up: 5000,
          down: 5000,
        },
      }),
    );
    expect(k).toBe("GRCh38|rna|VAMP3-201:5000:5000");
  });

  it("CDS and RNA on the same transcript produce DIFFERENT keys", () => {
    const rna = makeLocus({
      mode: "rna",
      rna: { assembly: "GRCh38", trans_name: "T1", up: 5000, down: 5000 },
    });
    const cds = makeLocus({
      mode: "cds",
      rna: { assembly: "GRCh38", trans_name: "T1", up: 5000, down: 5000 },
    });
    expect(locusKey(rna)).not.toBe(locusKey(cds));
  });

  it("same coords on different assemblies do NOT collide", () => {
    const hg38 = makeLocus();
    const hg19 = makeLocus({
      dna: { chr: "chr1", start: 1000, end: 2000, assembly: "GRCh37" },
    });
    expect(locusKey(hg38)).not.toBe(locusKey(hg19));
  });

  it("ignores id / time / isFavorite (volatile fields)", () => {
    const a = makeLocus({ id: "x", time: "1", isFavorite: false });
    const b = makeLocus({ id: "y", time: "2", isFavorite: true });
    expect(locusKey(a)).toBe(locusKey(b));
  });

  it("RNA prefers trans_name over trans_id over gene_* (mirrors display)", () => {
    // Identity priority intentionally mirrors `locusToRegionString` so two
    // snapshots that *display* identically also dedup identically — see
    // the regression test below for the history dedup bug this prevents.
    const k = locusKey(
      makeLocus({
        mode: "rna",
        rna: {
          assembly: "GRCh38",
          trans_id: "ENST1",
          trans_name: "T1",
          gene_id: "ENSG1",
          gene_name: "G1",
          up: 1000,
          down: 1000,
        },
      }),
    );
    expect(k).toBe("GRCh38|rna|T1:1000:1000");
  });

  it("RNA falls back to trans_id when only id is set", () => {
    const k = locusKey(
      makeLocus({
        mode: "rna",
        rna: {
          assembly: "GRCh38",
          trans_id: "ENST1",
          up: 5000,
          down: 5000,
        },
      }),
    );
    expect(k).toBe("GRCh38|rna|ENST1:5000:5000");
  });

  it("RNA falls back to gene_name when no transcript identity", () => {
    const k = locusKey(
      makeLocus({
        mode: "rna",
        rna: { assembly: "GRCh38", gene_name: "VAMP3", up: 5000, down: 5000 },
      }),
    );
    expect(k).toBe("GRCh38|rna|VAMP3:5000:5000");
  });

  it("regression: trans_id-only and trans_name-only snapshots of the same gene do NOT collide as long as displays differ", () => {
    // These two locuses display as different strings ("ENST1:5000:5000"
    // vs "VAMP3-201:5000:5000") so they should be distinct keys.
    const idOnly = locusKey(
      makeLocus({
        mode: "rna",
        rna: { assembly: "GRCh38", trans_id: "ENST1", up: 5000, down: 5000 },
      }),
    );
    const nameOnly = locusKey(
      makeLocus({
        mode: "rna",
        rna: {
          assembly: "GRCh38",
          trans_name: "VAMP3-201",
          up: 5000,
          down: 5000,
        },
      }),
    );
    expect(idOnly).not.toBe(nameOnly);
  });

  it("regression: trans_id + trans_name vs trans_name-only DEDUP when they display the same", () => {
    // This is the bug from the user screenshot: a default-locus snapshot
    // carries both `trans_id` + `trans_name`, while a search-typed
    // snapshot only carries `trans_name`. Both render as
    // "NANOGP2-201:5000:5000". Before the fix they had different keys
    // and produced duplicate history entries; with name-first priority
    // they collapse to a single entry.
    const fromDefaultLocus = locusKey(
      makeLocus({
        mode: "rna",
        rna: {
          assembly: "GRCh38",
          trans_name: "NANOGP2-201",
          trans_id: "ENST00000nanogp2",
          up: 5000,
          down: 5000,
        },
      }),
    );
    const fromSearchInput = locusKey(
      makeLocus({
        mode: "rna",
        rna: {
          assembly: "GRCh38",
          trans_name: "NANOGP2-201",
          up: 5000,
          down: 5000,
        },
      }),
    );
    expect(fromDefaultLocus).toBe(fromSearchInput);
  });
});

describe("locusToRegionString", () => {
  it("DNA → UCSC-style chr:start-end", () => {
    expect(locusToRegionString(makeLocus())).toBe("chr1:1000-2000");
  });

  it("RNA displays signed TSS boundaries", () => {
    const s = locusToRegionString(
      makeLocus({
        mode: "rna",
        rna: {
          assembly: "GRCh38",
          trans_name: "VAMP3-201",
          tssStart: -5000,
          tssEnd: 15137,
        },
      }),
    );
    expect(s).toBe("VAMP3-201:-5000:15137");
  });

  it("RNA preserves an entirely upstream interval", () => {
    const s = locusToRegionString(
      makeLocus({
        mode: "rna",
        rna: { assembly: "GRCh38", trans_name: "T1", tssStart: -5000, tssEnd: -1000 },
      }),
    );
    expect(s).toBe("T1:-5000:-1000");
  });

  it("returns empty string when neither side has usable info", () => {
    expect(
      locusToRegionString(
        makeLocus({
          mode: "rna",
          rna: { assembly: "GRCh38" },
          dna: { chr: "", start: 0, end: 0, assembly: "GRCh38" },
        }),
      ),
    ).toBe("");
  });
});

describe("regionStringToLocus", () => {
  it("parses chr:start-end → DNA locus", () => {
    const l = regionStringToLocus("chr1:7769296-7783432", {
      assembly: "GRCh38",
      id: "fixed",
      time: "fixed",
    });
    expect(l.mode).toBe("dna");
    expect(l.dna).toEqual({
      chr: "chr1",
      start: 7769296,
      end: 7783432,
      assembly: "GRCh38",
    });
    expect(l.id).toBe("fixed");
    expect(l.time).toBe("fixed");
  });

  it("parses NAME:up:down → RNA locus", () => {
    const l = regionStringToLocus("VAMP3-201:5000:3000", {
      assembly: "GRCh38",
    });
    expect(l.mode).toBe("rna");
    expect(l.rna.trans_name).toBe("VAMP3-201");
    expect(l.rna.up).toBe(5000);
    expect(l.rna.down).toBe(3000);
    expect(l.rna.assembly).toBe("GRCh38");
  });

  it("parses NAME:flank (single flank) → symmetric up/down", () => {
    const l = regionStringToLocus("VAMP3-201:5000", { assembly: "GRCh38" });
    expect(l.mode).toBe("rna");
    expect(l.rna.up).toBe(5000);
    expect(l.rna.down).toBe(5000);
  });

  it("respects mode override (e.g. CDS)", () => {
    const l = regionStringToLocus("VAMP3-201:5000:5000", {
      assembly: "GRCh38",
      mode: "cds",
    });
    expect(l.mode).toBe("cds");
  });

  it("unparsable input returns an empty stub (legacy preservation)", () => {
    const l = regionStringToLocus("not-a-region", { assembly: "GRCh38" });
    expect(l.dna.chr).toBe("");
    expect(l.dna.assembly).toBe("GRCh38");
    expect(l.mode).toBe("dna");
  });
});

describe("round-trip via locusToRegionString + regionStringToLocus", () => {
  it("DNA region → string → locus produces same locusKey", () => {
    const orig = makeLocus();
    const str = locusToRegionString(orig);
    const back = regionStringToLocus(str, { assembly: "GRCh38", tss: true });
    expect(locusKey(back)).toBe(locusKey(orig));
  });

  it("RNA region → string → locus produces same locusKey", () => {
    const orig = makeLocus({
      mode: "rna",
      rna: {
        assembly: "GRCh38",
        trans_name: "VAMP3-201",
        tssStart: -5000,
        tssEnd: 15137,
      },
    });
    const str = locusToRegionString(orig);
    const back = regionStringToLocus(str, { assembly: "GRCh38", tss: true });
    expect(locusKey(back)).toBe(locusKey(orig));
  });
});
