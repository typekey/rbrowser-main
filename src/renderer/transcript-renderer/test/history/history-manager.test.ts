import { describe, it, expect, beforeEach, vi } from "vitest";
import { HistoryManager } from "../../history/index";
import type { ILocus } from "../../config/config";
import { locusKey } from "../../locus/locus-key";

const HISTORY_KEY = "tbrowser_history_v1";

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

function installLocalStorageStub(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  (globalThis as any).localStorage = {
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
}

describe("HistoryManager", () => {
  beforeEach(() => {
    installLocalStorageStub();
  });

  it("starts empty when localStorage has no entries", () => {
    const hm = new HistoryManager();
    expect(hm.getAll()).toEqual([]);
    expect(hm.count).toBe(0);
  });

  // ── add / getAll / dedup ───────────────────────────────────────────────

  it("add() prepends and dedups by locusKey", () => {
    const hm = new HistoryManager();
    hm.add(makeLocus({ id: "a" }));
    hm.add(
      makeLocus({
        id: "b",
        dna: { chr: "chr2", start: 0, end: 100, assembly: "GRCh38" },
      }),
    );
    hm.add(makeLocus({ id: "c" })); // same key as first → dedup, prepend
    const got = hm.getAll();
    expect(got).toHaveLength(2);
    expect(got[0].id).toBe("c"); // most-recent prepended
    expect(got[1].dna.chr).toBe("chr2");
  });

  it("caps stored entries at MAX_HISTORY = 20", () => {
    const hm = new HistoryManager();
    for (let i = 0; i < 25; i++) {
      hm.add(
        makeLocus({
          id: `id-${i}`,
          dna: {
            chr: `chr${i}`,
            start: 0,
            end: 100,
            assembly: "GRCh38",
          },
        }),
      );
    }
    expect(hm.getAll()).toHaveLength(20);
    expect(hm.count).toBe(20);
    // Oldest entries dropped
    expect(hm.getAll().find((l) => l.dna.chr === "chr0")).toBeUndefined();
  });

  // ── has / hasKey ──────────────────────────────────────────────────────

  it("has() returns true after add(), false after remove()", () => {
    const hm = new HistoryManager();
    const l = makeLocus();
    expect(hm.has(l)).toBe(false);
    hm.add(l);
    expect(hm.has(l)).toBe(true);
    expect(hm.remove(l)).toBe(true);
    expect(hm.has(l)).toBe(false);
  });

  it("hasKey() returns the same answer as has() with the computed key", () => {
    const hm = new HistoryManager();
    const l = makeLocus();
    hm.add(l);
    expect(hm.hasKey(locusKey(l))).toBe(true);
    expect(hm.hasKey("non-existent-key")).toBe(false);
  });

  // ── remove / removeKey ────────────────────────────────────────────────

  it("remove() returns boolean — true on hit, false when missing", () => {
    const hm = new HistoryManager();
    const l = makeLocus();
    expect(hm.remove(l)).toBe(false); // empty store
    hm.add(l);
    expect(hm.remove(l)).toBe(true);
    expect(hm.remove(l)).toBe(false); // already removed
  });

  it("remove() matches by locusKey regardless of id / time", () => {
    const hm = new HistoryManager();
    hm.add(makeLocus({ id: "a", time: "t-1" }));
    hm.remove(makeLocus({ id: "different", time: "t-2" })); // same locusKey
    expect(hm.getAll()).toEqual([]);
  });

  it("removeKey() takes a precomputed key", () => {
    const hm = new HistoryManager();
    const l = makeLocus();
    hm.add(l);
    expect(hm.removeKey(locusKey(l))).toBe(true);
    expect(hm.count).toBe(0);
    expect(hm.removeKey("")).toBe(false);
  });

  // ── clear ────────────────────────────────────────────────────────────

  it("clear() empties the list and persists", () => {
    const hm = new HistoryManager();
    hm.add(makeLocus());
    hm.clear();
    expect(hm.getAll()).toEqual([]);
    const hm2 = new HistoryManager();
    expect(hm2.getAll()).toEqual([]);
  });

  // ── persistence ──────────────────────────────────────────────────────

  it("persists to localStorage and survives reload", () => {
    const hm = new HistoryManager();
    hm.add(makeLocus());
    const hm2 = new HistoryManager();
    expect(hm2.getAll()).toHaveLength(1);
  });

  // ── on / events ──────────────────────────────────────────────────────

  it("emits add / remove / clear events", () => {
    const hm = new HistoryManager();
    const events: Array<[string, unknown]> = [];
    hm.on((event, detail) => events.push([event, detail]));
    const l = makeLocus();
    hm.add(l);
    hm.remove(l);
    hm.add(l);
    hm.clear();
    expect(events.map((e) => e[0])).toEqual(["add", "remove", "add", "clear"]);
  });

  it("remove() that hits nothing does NOT emit", () => {
    const hm = new HistoryManager();
    const events: string[] = [];
    hm.on((event) => events.push(event));
    hm.remove(makeLocus());
    expect(events).toEqual([]);
  });

  it("on() returns an unsubscribe that stops further events", () => {
    const hm = new HistoryManager();
    const events: string[] = [];
    const off = hm.on((event) => events.push(event));
    hm.add(makeLocus());
    off();
    hm.add(
      makeLocus({
        dna: { chr: "chr2", start: 0, end: 100, assembly: "GRCh38" },
      }),
    );
    expect(events).toEqual(["add"]);
  });

  // ── Legacy format migration ─────────────────────────────────────────────

  it("migrates {region, timestamp, assembly} entries from old sessions", () => {
    installLocalStorageStub({
      [HISTORY_KEY]: JSON.stringify([
        {
          region: "chr1:1000-2000",
          timestamp: 1700000000000,
          assembly: { name: "GRCh38" },
        },
        { region: "VAMP3-201:5000:5000", timestamp: 1700001000000 },
      ]),
    });
    const hm = new HistoryManager();
    const got = hm.getAll();
    expect(got).toHaveLength(2);
    expect(got[0].dna.chr).toBe("chr1");
    expect(got[0].dna.assembly).toBe("GRCh38");
    // Legacy ms timestamp → ISO string
    expect(got[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(got[1].rna.trans_name).toBe("VAMP3-201");
  });

  it("migrates plain-string entries from very old sessions", () => {
    installLocalStorageStub({
      [HISTORY_KEY]: JSON.stringify(["chr1:1000-2000"]),
    });
    const hm = new HistoryManager();
    expect(hm.getAll()[0].dna.chr).toBe("chr1");
  });

  it("dedups legacy entries that share a locusKey", () => {
    installLocalStorageStub({
      [HISTORY_KEY]: JSON.stringify([
        "chr1:1000-2000",
        { region: "chr1:1000-2000", assembly: { name: "" } },
      ]),
    });
    const hm = new HistoryManager();
    expect(hm.getAll()).toHaveLength(1);
  });
});
