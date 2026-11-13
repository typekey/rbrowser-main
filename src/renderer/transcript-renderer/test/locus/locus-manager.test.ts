import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  LocusManager,
  type ILocusRendererLike,
} from "../../locus/locus-manager";
import type { FavouriteManager } from "../../favourite";

type FakeRenderer = ILocusRendererLike & {
  // Mutable fields the tests poke directly.
  viewRegion: string;
  viewRnaRegion: string;
  axisController: {
    isRnaMode: boolean;
    isCdsMode: boolean;
    rnaInfo: ILocusRendererLike["axisController"]["rnaInfo"];
    cdsInfo: ILocusRendererLike["axisController"]["cdsInfo"];
  };
  transcriptInfo: ILocusRendererLike["transcriptInfo"];
  assemblyName: string;
  /**
   * Set of assemblies the fake's `referenceManager.switchByName()` will
   * accept. Defaults to just the initial `assemblyName` so the test can
   * exercise both "happy path" and "assembly not loaded" branches.
   */
  loadedAssemblies: Set<string>;
  /**
   * The fake `referenceManager.lastSyncPromise` — the test can override
   * this to assert the manager awaits it before navigating.
   */
  lastSyncPromise: Promise<void> | undefined;
  // Spies on write-API entry points.
  calls: {
    disableRnaMode: number;
    disableCdsMode: number;
    incrementModeGeneration: number;
    navigateByTranscript: Array<[string, number]>;
    navigateByTranscriptAsymmetric: Array<[string, number, number]>;
    navigateByTranscriptCDS: Array<[string, number]>;
    navigateTo: Array<[string, number, number]>;
    switchByName: string[];
    syncAwaits: number;
  };
};

function makeFakeRenderer(init?: Partial<FakeRenderer>): FakeRenderer {
  const calls = {
    disableRnaMode: 0,
    disableCdsMode: 0,
    incrementModeGeneration: 0,
    navigateByTranscript: [] as Array<[string, number]>,
    navigateByTranscriptAsymmetric: [] as Array<[string, number, number]>,
    navigateByTranscriptCDS: [] as Array<[string, number]>,
    navigateTo: [] as Array<[string, number, number]>,
    switchByName: [] as string[],
    syncAwaits: 0,
  };
  const fake: FakeRenderer = {
    viewRegion: "chr1:1000-2000",
    viewRnaRegion: "",
    axisController: {
      isRnaMode: false,
      isCdsMode: false,
      rnaInfo: null,
      cdsInfo: null,
    },
    transcriptInfo: null,
    assemblyName: "GRCh38",
    loadedAssemblies: new Set(["GRCh38"]),
    lastSyncPromise: undefined,
    referenceManager: {
      getConfig: () => ({ assembly: { name: fake.assemblyName } }),
      switchByName: (name: string) => {
        calls.switchByName.push(name);
        if (!fake.loadedAssemblies.has(name)) return undefined;
        fake.assemblyName = name;
        return { assembly: { name } };
      },
      get lastSyncPromise() {
        if (fake.lastSyncPromise) calls.syncAwaits++;
        return fake.lastSyncPromise;
      },
    },
    calls,
    disableRnaMode: () => {
      calls.disableRnaMode++;
      fake.axisController.isRnaMode = false;
    },
    disableCdsMode: () => {
      calls.disableCdsMode++;
      fake.axisController.isCdsMode = false;
    },
    incrementModeGeneration: () => {
      calls.incrementModeGeneration++;
    },
    navigateByTranscript: async (name, flank) => {
      calls.navigateByTranscript.push([name, flank]);
    },
    navigateByTranscriptAsymmetric: async (name, up, down) => {
      calls.navigateByTranscriptAsymmetric.push([name, up, down]);
    },
    navigateByTranscriptCDS: async (name, flank) => {
      calls.navigateByTranscriptCDS.push([name, flank]);
    },
    navigateTo: (chr, start, end) => {
      calls.navigateTo.push([chr, start, end]);
    },
    ...init,
  };
  return fake;
}

// The new LocusManager.getIsFavorite() consults hasKey(locusKey(locus)),
// so the fake stores locusKey strings. Test helpers (_add / _remove)
// accept either a raw locusKey string or an ILocus for ergonomics.
import { locusKey as computeLocusKey } from "../../locus/locus-key";
function makeFakeFavourites(initial: string[] = []): FavouriteManager {
  const set = new Set<string>(initial);
  const keyOf = (v: string | { mode?: string; dna?: any; rna?: any }) =>
    typeof v === "string" ? v : computeLocusKey(v as any);
  return {
    has: (locus: any) => set.has(keyOf(locus)),
    hasKey: (key: string) => set.has(key),
    _add: (v: string | any) => set.add(keyOf(v)),
    _remove: (v: string | any) => set.delete(keyOf(v)),
  } as any;
}

/** Deterministic id / time injectors. */
function makeIdGen() {
  let n = 0;
  return () => `id-${++n}`;
}
function makeNowGen() {
  let n = 0;
  return () => `t-${++n}`;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("LocusManager", () => {
  let renderer: FakeRenderer;
  let favs: ReturnType<typeof makeFakeFavourites> & {
    _add: (s: string) => void;
    _remove: (s: string) => void;
  };
  let mgr: LocusManager;

  beforeEach(() => {
    renderer = makeFakeRenderer();
    favs = makeFakeFavourites() as any;
    mgr = new LocusManager(renderer, favs, {
      genId: makeIdGen(),
      now: makeNowGen(),
    });
  });

  describe("getLocus", () => {
    it("returns a fully-shaped ILocus snapshot for the default DNA view", () => {
      const locus = mgr.getLocus();
      expect(locus.mode).toBe("dna");
      expect(locus.dna).toEqual({
        chr: "chr1",
        start: 1000,
        end: 2000,
        assembly: "GRCh38",
      });
      expect(locus.rna.assembly).toBe("GRCh38");
      // No transcript identity in default DNA view
      expect(locus.rna.trans_id).toBeUndefined();
      expect(locus.rna.trans_name).toBeUndefined();
      expect(locus.id).toMatch(/^id-/);
      expect(locus.time).toMatch(/^t-/);
      expect(locus.isFavorite).toBe(false);
    });

    it("fills in trans/gene fields when transcriptInfo is populated", () => {
      renderer.axisController.isRnaMode = true;
      renderer.viewRnaRegion = "VAMP3-201:-5000:4000";
      renderer.viewRegion = "chr1:2000-11000";
      renderer.axisController.rnaInfo = {
        strand: "+",
        chr: "chr1",
        name: "VAMP3-201",
        txStart: 7000,
        txEnd: 8000,
        tssPos: 7000,
      };
      renderer.transcriptInfo = {
        gene_id: "ENSG00000049245",
        trans_id: "ENST00000054666",
        trans_name: "VAMP3-201",
        gene_name: "VAMP3",
        trans_type: "protein_coding",
        gene_type: "protein_coding",
      };
      const locus = mgr.getLocus();
      expect(locus.mode).toBe("rna");
      expect(locus.rna).toEqual({
        assembly: "GRCh38",
        strand: "+",
        trans_id: "ENST00000054666",
        trans_name: "VAMP3-201",
        trans_type: "protein_coding",
        gene_id: "ENSG00000049245",
        gene_name: "VAMP3",
        gene_type: "protein_coding",
        up: 5000,
        down: 3000,
        tssStart: -5000,
        tssEnd: 4000,
      });
    });

    it("does NOT fall back gene_name to trans_name when transcriptInfo lacks gene_name", () => {
      // Regression: a previous build copied `trans_name` into `gene_name`
      // when the upstream catalogue didn't supply one — leading to
      // VAMP3-201 showing up as the gene name. Empty string is the
      // honest answer; downstream UI renders an em-dash.
      renderer.axisController.isRnaMode = true;
      renderer.viewRnaRegion = "VAMP3-201:-5000:6000";
      renderer.transcriptInfo = {
        gene_id: "ENSG00000049245",
        trans_id: "ENST00000054666",
        trans_name: "VAMP3-201",
        gene_name: "", // explicitly empty
        trans_type: "protein_coding",
        gene_type: "",
      };
      const locus = mgr.getLocus();
      expect(locus.rna.gene_name).toBeUndefined();
      expect(locus.rna.trans_name).toBe("VAMP3-201");
    });
  });

  describe("getMode / getAssembly", () => {
    it("getMode reflects renderer flags", () => {
      expect(mgr.getMode()).toBe("dna");
      renderer.axisController.isRnaMode = true;
      expect(mgr.getMode()).toBe("rna");
      renderer.axisController.isCdsMode = true;
      // cds wins over rna
      expect(mgr.getMode()).toBe("cds");
    });

    it("getAssembly reads from the reference manager", () => {
      expect(mgr.getAssembly()).toBe("GRCh38");
      renderer.assemblyName = "GRCm39";
      expect(mgr.getAssembly()).toBe("GRCm39");
    });
  });

  describe("getRNALocus / getDNALocus", () => {
    it("getRNALocus exposes only the RNA sub-object", () => {
      renderer.axisController.isRnaMode = true;
      renderer.viewRnaRegion = "VAMP3-201:-5000:6000";
      renderer.axisController.rnaInfo = {
        strand: "-",
        chr: "chr1",
        name: "VAMP3-201",
        txStart: 7000,
        txEnd: 8000,
        tssPos: 8000,
      };
      renderer.transcriptInfo = {
        gene_id: "ENSG1",
        trans_id: "ENST1",
        trans_name: "T1",
        gene_name: "G1",
        trans_type: "protein_coding",
        gene_type: "protein_coding",
      };
      renderer.viewRegion = "chr1:2000-13000";
      const rna = mgr.getRNALocus();
      expect(rna.strand).toBe("-");
      expect(rna.trans_id).toBe("ENST1");
      expect(rna.tssStart).toBe(-5000);
      expect(rna.tssEnd).toBe(6000);
      expect(rna.up).toBe(5000);
      expect(rna.down).toBe(5000);
      // Never carries DNA coords
      expect((rna as any).chr).toBeUndefined();
    });

    it("getDNALocus parses viewRegion into chr/start/end", () => {
      renderer.viewRegion = "chrX:100000-200000";
      const dna = mgr.getDNALocus();
      expect(dna).toEqual({
        chr: "chrX",
        start: 100000,
        end: 200000,
        assembly: "GRCh38",
      });
    });
  });

  describe("getIsFavorite", () => {
    it("returns false when the current region key is not favourited", () => {
      expect(mgr.getIsFavorite()).toBe(false);
    });

    it("matches by full locusKey in DNA mode (assembly + chr/start/end)", () => {
      // Default fake renderer is DNA mode at chr1:1000-2000 on GRCh38.
      favs._add("GRCh38|dna|chr1:1000-2000");
      expect(mgr.getIsFavorite()).toBe(true);
    });

    it("matches by full locusKey in RNA / CDS mode (assembly + transcript + flanks)", () => {
      renderer.axisController.isRnaMode = true;
      renderer.viewRnaRegion = "VAMP3-201:-5000:6000";
      renderer.transcriptInfo = {
        gene_id: "ENSG1",
        trans_id: "ENST1",
        trans_name: "VAMP3-201",
        gene_name: "VAMP3",
        trans_type: "protein_coding",
        gene_type: "protein_coding",
      };
      // RNA key uses trans_name (priority mirrors locusToRegionString —
      // identity matches what the user sees).
      favs._add("GRCh38|rna|tss|VAMP3-201:-5000:6000");
      expect(mgr.getIsFavorite()).toBe(true);
      // A DNA-mode key for the same coords does NOT match in RNA mode.
      favs._remove("GRCh38|rna|tss|VAMP3-201:-5000:6000");
      favs._add("GRCh38|dna|chr1:1000-2000");
      expect(mgr.getIsFavorite()).toBe(false);
    });
  });

  describe("tick + listeners", () => {
    it("emits to subscribers on the first tick", () => {
      const received: any[] = [];
      mgr.on((l) => received.push(l));
      const out = mgr.tick();
      expect(out).not.toBeNull();
      expect(received).toHaveLength(1);
      expect(received[0].id).toBe(out!.id);
    });

    it("does NOT emit when nothing material changed", () => {
      const received: any[] = [];
      mgr.on((l) => received.push(l));
      mgr.tick(); // initial emit
      const second = mgr.tick();
      expect(second).toBeNull();
      expect(received).toHaveLength(1);
    });

    it("emits with a fresh id/time when the view region changes", () => {
      const received: any[] = [];
      mgr.on((l) => received.push(l));
      const first = mgr.tick();
      renderer.viewRegion = "chr2:500-1500";
      const second = mgr.tick();
      expect(second).not.toBeNull();
      expect(second!.id).not.toBe(first!.id);
      expect(second!.time).not.toBe(first!.time);
      expect(received).toHaveLength(2);
    });

    it("emits when mode changes (DNA → RNA)", () => {
      mgr.tick(); // baseline
      renderer.axisController.isRnaMode = true;
      renderer.viewRnaRegion = "T1:-5000:6000";
      const out = mgr.tick();
      expect(out).not.toBeNull();
      expect(out!.mode).toBe("rna");
    });

    it("does NOT mint a new id when only isFavorite changed", () => {
      const first = mgr.tick()!;
      favs._add("GRCh38|dna|chr1:1000-2000"); // favourite the current locus
      const second = mgr.tick();
      // No content change → no new emit
      expect(second).toBeNull();
      // But getLocus reflects the live favourite state
      expect(mgr.getLocus().isFavorite).toBe(true);
      // And the id stays stable across the favourite toggle
      expect(mgr.getLocus().id).toBe(first.id);
    });

    it("on() returns an unsubscribe that stops further emits", () => {
      const received: any[] = [];
      const off = mgr.on((l) => received.push(l));
      mgr.tick();
      off();
      renderer.viewRegion = "chr3:1-100";
      mgr.tick();
      expect(received).toHaveLength(1);
    });
  });

  describe("setMode", () => {
    it("DNA mode disables active RNA / CDS modes", () => {
      renderer.axisController.isRnaMode = true;
      mgr.setMode("dna");
      expect(renderer.calls.disableRnaMode).toBe(1);
      expect(renderer.calls.incrementModeGeneration).toBe(1);
    });

    it("noop when target equals current mode", () => {
      mgr.setMode("dna"); // already DNA
      expect(renderer.calls.incrementModeGeneration).toBe(0);
      expect(renderer.calls.disableRnaMode).toBe(0);
    });

    it("RNA mode re-navigates by the cached transcript name", () => {
      renderer.transcriptInfo = {
        gene_id: "G1",
        trans_id: "T1",
        trans_name: "VAMP3-201",
        gene_name: "VAMP3",
        trans_type: "protein_coding",
        gene_type: "protein_coding",
      };
      mgr.setMode("rna");
      expect(renderer.calls.navigateByTranscript).toEqual([
        ["VAMP3-201", 5000],
      ]);
    });

    it("RNA mode no-ops without a transcript context", () => {
      // No transcriptInfo and no rnaInfo → can't navigate
      mgr.setMode("rna");
      expect(renderer.calls.navigateByTranscript).toHaveLength(0);
    });

    it("CDS mode re-navigates by the cached transcript name", () => {
      renderer.transcriptInfo = {
        gene_id: "G1",
        trans_id: "T1",
        trans_name: "VAMP3-201",
        gene_name: "VAMP3",
        trans_type: "protein_coding",
        gene_type: "protein_coding",
      };
      mgr.setMode("cds");
      expect(renderer.calls.navigateByTranscriptCDS).toEqual([
        ["VAMP3-201", 5000],
      ]);
    });
  });

  describe("setLocus", () => {
    it("navigates by transcript name (default RNA mode, symmetric flanks)", async () => {
      await mgr.setLocus({ trans_name: "VAMP3-201", up: 10000, down: 10000 });
      expect(renderer.calls.navigateByTranscript).toEqual([
        ["VAMP3-201", 10000],
      ]);
    });

    it("collapses asymmetric up / down to max() for the legacy flank arg", async () => {
      await mgr.setLocus({ trans_name: "VAMP3-201", up: 2000, down: 8000 });
      // The underlying navigateByTranscript only accepts one flank value;
      // max() preserves transcript visibility on the longer side.
      expect(renderer.calls.navigateByTranscript).toEqual([
        ["VAMP3-201", 8000],
      ]);
    });

    it("defaults missing up / down to 5000 each", async () => {
      await mgr.setLocus({ trans_name: "VAMP3-201" });
      expect(renderer.calls.navigateByTranscript).toEqual([
        ["VAMP3-201", 5000],
      ]);
    });

    it("prefers trans_id over trans_name / gene_*", async () => {
      await mgr.setLocus({
        trans_id: "ENST1",
        trans_name: "VAMP3-201",
        gene_id: "ENSG1",
        gene_name: "VAMP3",
      });
      expect(renderer.calls.navigateByTranscript).toEqual([["ENST1", 5000]]);
    });

    it("dispatches to navigateByTranscriptCDS when mode='cds'", async () => {
      await mgr.setLocus({ mode: "cds", trans_name: "VAMP3-201" });
      expect(renderer.calls.navigateByTranscriptCDS).toEqual([
        ["VAMP3-201", 5000],
      ]);
      expect(renderer.calls.navigateByTranscript).toHaveLength(0);
    });

    it("navigates by genomic coords when mode='dna' + chr/start/end given", async () => {
      await mgr.setLocus({
        mode: "dna",
        chr: "chrX",
        start: 1000,
        end: 5000,
      });
      expect(renderer.calls.navigateTo).toEqual([["chrX", 1000, 5000]]);
      expect(renderer.calls.navigateByTranscript).toHaveLength(0);
    });

    it("noop when no identity nor coords supplied", async () => {
      await mgr.setLocus({});
      expect(renderer.calls.navigateByTranscript).toHaveLength(0);
      expect(renderer.calls.navigateByTranscriptCDS).toHaveLength(0);
      expect(renderer.calls.navigateTo).toHaveLength(0);
    });
  });

  describe("navigateToLocus", () => {
    // ── Rule 3: identity dispatch ────────────────────────────────────
    it("DNA locus → navigateTo(chr, start, end)", async () => {
      const ok = await mgr.navigateToLocus({
        id: "x",
        time: "t",
        isFavorite: false,
        mode: "dna",
        dna: { chr: "chrX", start: 1000, end: 5000, assembly: "GRCh38" },
        rna: { assembly: "GRCh38" },
      });
      expect(ok).toBe(true);
      expect(renderer.calls.navigateTo).toEqual([["chrX", 1000, 5000]]);
    });

    it("RNA locus → navigateByTranscriptAsymmetric(name, up, down) — preserves asymmetric flanks", async () => {
      const ok = await mgr.navigateToLocus({
        id: "x",
        time: "t",
        isFavorite: false,
        mode: "rna",
        dna: { chr: "", start: 0, end: 0, assembly: "GRCh38" },
        rna: {
          assembly: "GRCh38",
          trans_id: "ENST1",
          trans_name: "VAMP3-201",
          up: 2000,
          down: 8000,
        },
      });
      expect(ok).toBe(true);
      // trans_id wins over trans_name; up / down preserved independently.
      expect(renderer.calls.navigateByTranscriptAsymmetric).toEqual([
        ["ENST1", 2000, 8000],
      ]);
      expect(renderer.calls.navigateByTranscript).toHaveLength(0);
    });

    it("falls back to navigateByTranscript(max) when asymmetric API absent", async () => {
      const r = makeFakeRenderer();
      delete (r as any).navigateByTranscriptAsymmetric;
      const m = new LocusManager(r, favs, {
        genId: makeIdGen(),
        now: makeNowGen(),
      });
      await m.navigateToLocus({
        id: "x",
        time: "t",
        isFavorite: false,
        mode: "rna",
        dna: { chr: "", start: 0, end: 0, assembly: "GRCh38" },
        rna: {
          assembly: "GRCh38",
          trans_name: "T1",
          up: 2000,
          down: 8000,
        },
      });
      expect(r.calls.navigateByTranscript).toEqual([["T1", 8000]]);
    });

    it("CDS locus → navigateByTranscriptCDS(name, max(up, down))", async () => {
      const ok = await mgr.navigateToLocus({
        id: "x",
        time: "t",
        isFavorite: false,
        mode: "cds",
        dna: { chr: "", start: 0, end: 0, assembly: "GRCh38" },
        rna: {
          assembly: "GRCh38",
          trans_name: "T1",
          up: 1000,
          down: 4000,
        },
      });
      expect(ok).toBe(true);
      expect(renderer.calls.navigateByTranscriptCDS).toEqual([["T1", 4000]]);
    });

    // ── Rule 2: mode switching ───────────────────────────────────────
    it("DNA locus disables RNA + CDS modes before navigating", async () => {
      renderer.axisController.isRnaMode = true;
      renderer.axisController.isCdsMode = true;
      await mgr.navigateToLocus({
        id: "x",
        time: "t",
        isFavorite: false,
        mode: "dna",
        dna: { chr: "chr1", start: 100, end: 200, assembly: "GRCh38" },
        rna: { assembly: "GRCh38" },
      });
      expect(renderer.calls.disableRnaMode).toBe(1);
      expect(renderer.calls.disableCdsMode).toBe(1);
      expect(renderer.calls.incrementModeGeneration).toBe(1);
    });

    it("RNA locus disables CDS mode when active", async () => {
      renderer.axisController.isCdsMode = true;
      await mgr.navigateToLocus({
        id: "x",
        time: "t",
        isFavorite: false,
        mode: "rna",
        dna: { chr: "", start: 0, end: 0, assembly: "GRCh38" },
        rna: { assembly: "GRCh38", trans_name: "T1", up: 5000, down: 5000 },
      });
      expect(renderer.calls.disableCdsMode).toBe(1);
      expect(renderer.calls.disableRnaMode).toBe(0);
    });

    it("CDS locus disables RNA mode when active", async () => {
      renderer.axisController.isRnaMode = true;
      await mgr.navigateToLocus({
        id: "x",
        time: "t",
        isFavorite: false,
        mode: "cds",
        dna: { chr: "", start: 0, end: 0, assembly: "GRCh38" },
        rna: { assembly: "GRCh38", trans_name: "T1", up: 5000, down: 5000 },
      });
      expect(renderer.calls.disableRnaMode).toBe(1);
    });

    // ── Rule 1: assembly check + switch ──────────────────────────────
    it("auto-switches reference when locus assembly differs and is loaded", async () => {
      renderer.loadedAssemblies = new Set(["GRCh38", "GRCh37"]);
      const ok = await mgr.navigateToLocus({
        id: "x",
        time: "t",
        isFavorite: false,
        mode: "dna",
        dna: { chr: "chr1", start: 100, end: 200, assembly: "GRCh37" },
        rna: { assembly: "GRCh37" },
      });
      expect(ok).toBe(true);
      expect(renderer.calls.switchByName).toEqual(["GRCh37"]);
      expect(renderer.assemblyName).toBe("GRCh37");
      expect(renderer.calls.navigateTo).toEqual([["chr1", 100, 200]]);
    });

    it("refuses navigation when target assembly is NOT loaded", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const ok = await mgr.navigateToLocus({
        id: "x",
        time: "t",
        isFavorite: false,
        mode: "dna",
        dna: { chr: "chr1", start: 100, end: 200, assembly: "T2T-CHM13v2" },
        rna: { assembly: "T2T-CHM13v2" },
      });
      expect(ok).toBe(false);
      expect(renderer.calls.navigateTo).toHaveLength(0);
      expect(renderer.assemblyName).toBe("GRCh38"); // unchanged
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("awaits referenceManager.lastSyncPromise before navigating", async () => {
      renderer.loadedAssemblies = new Set(["GRCh38", "GRCh37"]);
      let syncResolved = false;
      renderer.lastSyncPromise = new Promise<void>((resolve) =>
        setTimeout(() => {
          syncResolved = true;
          resolve();
        }, 5),
      );
      const navigatePromise = mgr.navigateToLocus({
        id: "x",
        time: "t",
        isFavorite: false,
        mode: "dna",
        dna: { chr: "chr1", start: 100, end: 200, assembly: "GRCh37" },
        rna: { assembly: "GRCh37" },
      });
      // navigateTo must NOT have fired yet — we're behind the sync await.
      expect(renderer.calls.navigateTo).toHaveLength(0);
      await navigatePromise;
      expect(syncResolved).toBe(true);
      expect(renderer.calls.navigateTo).toEqual([["chr1", 100, 200]]);
    });

    it("does not invoke switchByName when assemblies already match", async () => {
      await mgr.navigateToLocus({
        id: "x",
        time: "t",
        isFavorite: false,
        mode: "dna",
        dna: { chr: "chr1", start: 100, end: 200, assembly: "GRCh38" },
        rna: { assembly: "GRCh38" },
      });
      expect(renderer.calls.switchByName).toHaveLength(0);
    });

    // ── Refusal cases ─────────────────────────────────────────────────
    it("refuses DNA locus without chr", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const ok = await mgr.navigateToLocus({
        id: "x",
        time: "t",
        isFavorite: false,
        mode: "dna",
        dna: { chr: "", start: 100, end: 200, assembly: "GRCh38" },
        rna: { assembly: "GRCh38" },
      });
      expect(ok).toBe(false);
      expect(renderer.calls.navigateTo).toHaveLength(0);
      warn.mockRestore();
    });

    it("refuses RNA / CDS locus without any transcript identity", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const ok = await mgr.navigateToLocus({
        id: "x",
        time: "t",
        isFavorite: false,
        mode: "rna",
        dna: { chr: "", start: 0, end: 0, assembly: "GRCh38" },
        rna: { assembly: "GRCh38", up: 5000, down: 5000 },
      });
      expect(ok).toBe(false);
      expect(renderer.calls.navigateByTranscript).toHaveLength(0);
      expect(renderer.calls.navigateByTranscriptAsymmetric).toHaveLength(0);
      warn.mockRestore();
    });
  });
});
