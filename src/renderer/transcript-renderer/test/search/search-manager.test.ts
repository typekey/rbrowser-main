import { describe, it, expect } from "vitest";
import { SearchManager, type ISearchSource } from "../../search/index";
import type { ITrans } from "../../reference/reference-manager";

/**
 * Tests for SearchManager — the facade is intentionally thin (delegates
 * to `ReferenceManager.searchTranscripts`), so we focus on the grouping
 * / filtering helpers it layers on top.
 */

function s(
  trans_name: string,
  trans_type: string,
  level: ITrans["level"] = "transcript",
  trans_id = `ENST_${trans_name}`,
): ITrans {
  return { trans_id, trans_name, trans_type, level };
}

function makeFakeSource(byQuery: Record<string, ITrans[]>): ISearchSource {
  return {
    async searchTranscripts(query: string, limit = 20) {
      const k = query.toLowerCase();
      return (byQuery[k] ?? []).slice(0, limit);
    },
  };
}

describe("SearchManager", () => {
  // ── search() — pass-through ────────────────────────────────────────

  it("search() returns the flat list from the source", async () => {
    const mgr = new SearchManager(
      makeFakeSource({
        vamp3: [
          s("VAMP3-201", "protein_coding"),
          s("VAMP3-202", "protein_coding"),
        ],
      }),
    );
    const out = await mgr.search("vamp3");
    expect(out).toHaveLength(2);
    expect(out[0].trans_name).toBe("VAMP3-201");
  });

  it("search() forwards the limit argument", async () => {
    const mgr = new SearchManager(
      makeFakeSource({
        vamp3: [
          s("A", "protein_coding"),
          s("B", "protein_coding"),
          s("C", "protein_coding"),
        ],
      }),
    );
    expect(await mgr.search("vamp3", 2)).toHaveLength(2);
  });

  it("search() returns [] when source has no hit", async () => {
    const mgr = new SearchManager(makeFakeSource({}));
    expect(await mgr.search("nothing")).toEqual([]);
  });

  // ── searchGrouped() ────────────────────────────────────────────────

  it("searchGrouped() collapses suggestions into one group per biotype", async () => {
    const mgr = new SearchManager(
      makeFakeSource({
        vamp3: [
          s("VAMP3-201", "protein_coding"),
          s("VAMP3-202", "protein_coding"),
          s("VAMP3-203", "retained_intron"),
        ],
      }),
    );
    const groups = await mgr.searchGrouped("vamp3");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({
      type: "protein_coding",
      items: [
        s("VAMP3-201", "protein_coding"),
        s("VAMP3-202", "protein_coding"),
      ],
    });
    expect(groups[1]).toEqual({
      type: "retained_intron",
      items: [s("VAMP3-203", "retained_intron")],
    });
  });

  it("searchGrouped() preserves biotype first-seen order", async () => {
    const mgr = new SearchManager(
      makeFakeSource({
        x: [
          s("a", "lncRNA"),
          s("b", "protein_coding"),
          s("c", "lncRNA"), // shouldn't move lncRNA after protein_coding
        ],
      }),
    );
    const groups = await mgr.searchGrouped("x");
    expect(groups.map((g) => g.type)).toEqual(["lncRNA", "protein_coding"]);
    expect(groups[0].items.map((i) => i.trans_name)).toEqual(["a", "c"]);
  });

  it("searchGrouped() returns [] on empty input", async () => {
    const mgr = new SearchManager(makeFakeSource({}));
    expect(await mgr.searchGrouped("nothing")).toEqual([]);
  });

  it("searchGrouped() coalesces empty `trans_type` into `unknown`", async () => {
    const mgr = new SearchManager(
      makeFakeSource({
        x: [s("a", ""), s("b", "")],
      }),
    );
    const groups = await mgr.searchGrouped("x");
    expect(groups).toEqual([
      {
        type: "unknown",
        items: [s("a", ""), s("b", "")],
      },
    ]);
  });

  // ── searchByLevel() ────────────────────────────────────────────────

  it("searchByLevel('transcript') keeps only transcript-level rows", async () => {
    const mgr = new SearchManager(
      makeFakeSource({
        vamp3: [
          s("VAMP3", "protein_coding", "gene", "ENSG_VAMP3"),
          s("VAMP3-201", "protein_coding", "transcript"),
          s("VAMP3-202", "protein_coding", "transcript"),
        ],
      }),
    );
    const out = await mgr.searchByLevel("vamp3", "transcript");
    expect(out).toHaveLength(2);
    expect(out.every((s) => s.level === "transcript")).toBe(true);
  });

  it("searchByLevel('gene') keeps only gene-level rows", async () => {
    const mgr = new SearchManager(
      makeFakeSource({
        vamp3: [
          s("VAMP3", "protein_coding", "gene", "ENSG_VAMP3"),
          s("VAMP3-201", "protein_coding", "transcript"),
        ],
      }),
    );
    const out = await mgr.searchByLevel("vamp3", "gene");
    expect(out).toHaveLength(1);
    expect(out[0].trans_id).toBe("ENSG_VAMP3");
  });
});
