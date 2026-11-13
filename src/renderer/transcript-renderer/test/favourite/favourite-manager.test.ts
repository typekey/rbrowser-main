import { describe, it, expect, beforeEach, vi } from "vitest";
import { FavouriteManager } from "../../favourite/index";
import type { ILocus } from "../../config/config";
import { locusKey } from "../../locus/locus-key";

const FAVORITES_KEY = "tbrowser_favorites_v1";

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

// ── In-memory localStorage stub for Node test env ─────────────────────────
function installLocalStorageStub(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  const stub = {
    getItem: vi.fn((k: string) => (store.has(k) ? store.get(k)! : null)),
    setItem: vi.fn((k: string, v: string) => {
      store.set(k, String(v));
    }),
    removeItem: vi.fn((k: string) => {
      store.delete(k);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    key: vi.fn(),
    length: 0,
  };
  (globalThis as any).localStorage = stub;
  return stub;
}

describe("FavouriteManager", () => {
  beforeEach(() => {
    installLocalStorageStub();
  });

  it("starts empty when localStorage has no entries", () => {
    const fm = new FavouriteManager();
    expect(fm.count).toBe(0);
    expect(fm.getAll()).toEqual([]);
  });

  it("add() / has() / remove() round-trip on the same locus", () => {
    const fm = new FavouriteManager();
    const l = makeLocus();
    expect(fm.has(l)).toBe(false);
    fm.add(l);
    expect(fm.has(l)).toBe(true);
    expect(fm.count).toBe(1);
    expect(fm.remove(l)).toBe(true);
    expect(fm.has(l)).toBe(false);
    expect(fm.count).toBe(0);
  });

  it("stored entries always have isFavorite = true", () => {
    const fm = new FavouriteManager();
    fm.add(makeLocus({ isFavorite: false }));
    expect(fm.getAll()[0].isFavorite).toBe(true);
  });

  it("dedups two locuses with the same locusKey (different id/time)", () => {
    const fm = new FavouriteManager();
    fm.add(makeLocus({ id: "a", time: "1" }));
    fm.add(makeLocus({ id: "b", time: "2" }));
    expect(fm.count).toBe(1);
  });

  it("treats RNA and CDS on the same transcript as DIFFERENT favourites", () => {
    const fm = new FavouriteManager();
    fm.add(
      makeLocus({
        mode: "rna",
        rna: {
          assembly: "GRCh38",
          trans_name: "T1",
          up: 5000,
          down: 5000,
        },
      }),
    );
    fm.add(
      makeLocus({
        mode: "cds",
        rna: {
          assembly: "GRCh38",
          trans_name: "T1",
          up: 5000,
          down: 5000,
        },
      }),
    );
    expect(fm.count).toBe(2);
  });

  it("toggle() flips state and returns the new state", () => {
    const fm = new FavouriteManager();
    const l = makeLocus();
    expect(fm.toggle(l)).toBe(true);
    expect(fm.has(l)).toBe(true);
    expect(fm.toggle(l)).toBe(false);
    expect(fm.has(l)).toBe(false);
  });

  it("hasKey() returns the same answer as has() with the computed key", () => {
    const fm = new FavouriteManager();
    const l = makeLocus();
    fm.add(l);
    expect(fm.hasKey(locusKey(l))).toBe(true);
    expect(fm.hasKey("non-existent-key")).toBe(false);
  });

  it("persists to localStorage and survives reload", () => {
    const fm = new FavouriteManager();
    const l = makeLocus();
    fm.add(l);
    const fm2 = new FavouriteManager();
    expect(fm2.has(l)).toBe(true);
  });

  it("clear() removes all entries and persists the empty state", () => {
    const fm = new FavouriteManager();
    fm.add(makeLocus());
    fm.clear();
    expect(fm.count).toBe(0);
    const fm2 = new FavouriteManager();
    expect(fm2.count).toBe(0);
  });

  it("emits add / remove / toggle / clear events", () => {
    const fm = new FavouriteManager();
    const events: Array<[string, unknown]> = [];
    fm.on((event, detail) => events.push([event, detail]));
    const l = makeLocus();
    fm.add(l);
    fm.toggle(l); // removes
    fm.toggle(l); // re-adds
    fm.remove(l);
    fm.clear();
    expect(events.map((e) => e[0])).toEqual([
      "add",
      "toggle",
      "toggle",
      "remove",
      "clear",
    ]);
  });

  // ── Legacy format migration ─────────────────────────────────────────────

  it("migrates plain-string entries from pre-v1.0.49 sessions", () => {
    installLocalStorageStub({
      [FAVORITES_KEY]: JSON.stringify(["chr1:1000-2000", "VAMP3-201:5000:5000"]),
    });
    const fm = new FavouriteManager();
    expect(fm.count).toBe(2);
    const all = fm.getAll();
    expect(all.find((l) => l.mode === "dna")?.dna.chr).toBe("chr1");
    expect(all.find((l) => l.mode === "rna")?.rna.trans_name).toBe("VAMP3-201");
  });

  it("migrates {region, assembly} entries from v1.0.49 sessions", () => {
    installLocalStorageStub({
      [FAVORITES_KEY]: JSON.stringify([
        { region: "chr1:1000-2000", assembly: { name: "GRCh38" } },
      ]),
    });
    const fm = new FavouriteManager();
    expect(fm.count).toBe(1);
    expect(fm.getAll()[0].dna.assembly).toBe("GRCh38");
  });

  it("reads current ILocus format without modification", () => {
    const seed: ILocus = makeLocus({ id: "seeded", time: "seeded-time" });
    installLocalStorageStub({
      [FAVORITES_KEY]: JSON.stringify([seed]),
    });
    const fm = new FavouriteManager();
    const out = fm.getAll()[0];
    expect(out.id).toBe("seeded");
    expect(out.dna).toEqual(seed.dna);
  });
});
