import { describe, it, expect, beforeAll } from "vitest";
import initSqlJs from "sql.js";
import {
  TranscriptSearch,
  type ISqlBackend,
  normalize,
} from "../../data/parser/TranscriptSearchParser";

type Row = Record<string, any>;

async function makeFixture(): Promise<ISqlBackend> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE feature(
      id INTEGER PRIMARY KEY,
      feature_type TEXT,
      gene_id TEXT,
      gene_name TEXT,
      transcript_id TEXT,
      transcript_name TEXT,
      chrom TEXT,
      start INTEGER,
      end INTEGER,
      strand TEXT,
      biotype TEXT
    );
    CREATE TABLE alias(
      feature_id INTEGER,
      alias TEXT,
      alias_norm TEXT,
      alias_type TEXT
    );
  `);

  const features: Row[] = [
    {
      id: 1,
      feature_type: "transcript",
      gene_id: "ENSG00000049245.13",
      gene_name: "VAMP3",
      transcript_id: "ENST00000054666.10",
      transcript_name: "VAMP3-201",
      chrom: "chr1",
      start: 7831318,
      end: 7842032,
      strand: "+",
      biotype: "protein_coding",
    },
    {
      id: 2,
      feature_type: "gene",
      gene_id: "ENSG00000141510.18",
      gene_name: "TP53",
      transcript_id: null,
      transcript_name: null,
      chrom: "chr17",
      start: 7668421,
      end: 7687490,
      strand: "-",
      biotype: "protein_coding",
    },
    {
      id: 3,
      feature_type: "transcript",
      gene_id: "ENSG00000141510.18",
      gene_name: "TP53",
      transcript_id: "ENST00000269305.9",
      transcript_name: "TP53-201",
      chrom: "chr17",
      start: 7668421,
      end: 7687490,
      strand: "-",
      biotype: "protein_coding",
    },
  ];

  const insF = db.prepare(
    `INSERT INTO feature(id,feature_type,gene_id,gene_name,transcript_id,
       transcript_name,chrom,start,end,strand,biotype)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const f of features) {
    insF.run([
      f.id,
      f.feature_type,
      f.gene_id,
      f.gene_name,
      f.transcript_id,
      f.transcript_name,
      f.chrom,
      f.start,
      f.end,
      f.strand,
      f.biotype,
    ]);
  }
  insF.free();

  // v0.5.5 schema: alias rows include the identifiers themselves (typed),
  // and `normalize()` strips trailing ".N" so a single row covers both
  // versioned and versionless lookups.
  const aliases = [
    // feature 1 — VAMP3-201 transcript
    { fid: 1, a: "ENST00000054666.10", t: "transcript_id" },
    { fid: 1, a: "VAMP3-201", t: "transcript_name" },
    { fid: 1, a: "VAMP3", t: "gene_name" },
    { fid: 1, a: "ENSG00000049245.13", t: "gene_id" },
    // feature 2 — TP53 gene
    { fid: 2, a: "TP53", t: "gene_name" },
    { fid: 2, a: "ENSG00000141510.18", t: "gene_id" },
    { fid: 2, a: "p53", t: "gene_synonym" },
    { fid: 2, a: "LFS1", t: "gene_synonym" },
    // feature 3 — TP53-201 transcript
    { fid: 3, a: "ENST00000269305.9", t: "transcript_id" },
    { fid: 3, a: "TP53-201", t: "transcript_name" },
    { fid: 3, a: "TP53", t: "gene_name" },
    { fid: 3, a: "ENSG00000141510.18", t: "gene_id" },
  ];
  const insA = db.prepare(
    `INSERT INTO alias(feature_id, alias, alias_norm, alias_type)
     VALUES (?,?,?,?)`,
  );
  for (const r of aliases) {
    insA.run([r.fid, r.a, normalize(r.a), r.t]);
  }
  insA.free();

  return {
    async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params as any);
        const out: T[] = [];
        while (stmt.step()) out.push(stmt.getAsObject() as T);
        return out;
      } finally {
        stmt.free();
      }
    },
  };
}

describe("TranscriptSearch (v0.5.5 in-memory fixture)", () => {
  let search: TranscriptSearch;

  beforeAll(async () => {
    search = new TranscriptSearch(await makeFixture());
  });

  it("transcript_id exact (with version)", async () => {
    const r = await search.search("ENST00000054666.10");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].matched_field).toBe("transcript_id_exact");
    expect(r[0].rank_score).toBe(1);
    expect(r[0].transcript_name).toBe("VAMP3-201");
  });

  it("transcript_id versionless (same alias row, normalize strips .N)", async () => {
    const r = await search.search("ENST00000054666");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].matched_field).toBe("transcript_id_exact");
    expect(r[0].gene_name).toBe("VAMP3");
  });

  it("transcript_name exact", async () => {
    const r = await search.search("TP53-201");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].matched_field).toBe("transcript_name_exact");
    expect(r[0].rank_score).toBe(2);
    expect(r[0].transcript_id).toBe("ENST00000269305.9");
  });

  it("gene_name exact returns gene-level row first, transcripts next", async () => {
    const r = await search.search("VAMP3");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].matched_field).toBe("gene_name_exact");
    expect(r[0].rank_score).toBe(3);
    expect(r[0].gene_name).toBe("VAMP3");
  });

  it("gene_id exact (with version)", async () => {
    const r = await search.search("ENSG00000049245.13");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].matched_field).toBe("gene_id_exact");
    expect(r[0].rank_score).toBe(4);
    expect(r[0].gene_name).toBe("VAMP3");
  });

  it("gene_id versionless (same row, normalize strips .N)", async () => {
    const r = await search.search("ENSG00000049245");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].matched_field).toBe("gene_id_exact");
    expect(r[0].gene_name).toBe("VAMP3");
  });

  it("generic alias (gene_synonym 'p53' → TP53)", async () => {
    const r = await search.search("p53");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].matched_field).toBe("alias_exact");
    expect(r[0].rank_score).toBe(5);
    expect(r[0].gene_name).toBe("TP53");
  });

  it("returns [] for unknown query (FTS tables absent, fuzzy fallback skipped)", async () => {
    const r = await search.search("totally-unknown-symbol-xyz");
    expect(r).toEqual([]);
  });

  it("respects `limit`", async () => {
    const r = await search.search("ENSG00000141510", 1);
    expect(r.length).toBe(1);
  });

  it("rejects empty / whitespace input", async () => {
    expect(await search.search("")).toEqual([]);
    expect(await search.search("   ")).toEqual([]);
  });
});

describe("normalize()", () => {
  it("lowercases, strips trailing version, removes separators", () => {
    expect(normalize("ENST00000054666.10")).toBe("enst00000054666");
    expect(normalize(" Vamp_3 ")).toBe("vamp3");
    expect(normalize("ENSG-000.49245.13")).toBe("ensg00049245");
  });
});
