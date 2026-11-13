import { describe, it, expect, beforeAll } from "vitest";
import initSqlJs from "sql.js";
import type { ISqlBackend } from "../../data/parser/TranscriptSearchParser";
import { loadTranscriptFromBackend } from "../../data/parser/transcript-from-sqlite";

async function buildBackend(): Promise<ISqlBackend> {
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
      chrom_start0 INTEGER,
      chrom_end0 INTEGER,
      strand TEXT,
      biotype TEXT,
      exon_starts TEXT,
      exon_ends TEXT,
      cds_start INTEGER,
      cds_end INTEGER,
      utr5_start INTEGER,
      utr5_end INTEGER,
      utr3_start INTEGER,
      utr3_end INTEGER
    );
    CREATE TABLE alias(
      feature_id INTEGER,
      alias TEXT,
      alias_norm TEXT,
      alias_type TEXT
    );
  `);
  // VAMP3-201 — real coordinates sampled from hg38.gencode.rbrowser.sqlite
  db.run(
    `INSERT INTO feature(id,feature_type,gene_id,gene_name,transcript_id,
        transcript_name,chrom,start,end,chrom_start0,chrom_end0,strand,
        biotype,exon_starts,exon_ends,cds_start,cds_end,
        utr5_start,utr5_end,utr3_start,utr3_end)
     VALUES (1,'transcript','ENSG00000049245.13','VAMP3',
        'ENST00000054666.11','VAMP3-201','chr1',7771296,7781432,
        7771295,7781432,'+','protein_coding',
        '7771296,7773442,7777160,7778118,7779626',
        '7771385,7773511,7777318,7778169,7781432',
        7771384,7779642,7771296,7771383,7779643,7781432);`,
  );
  db.run(
    `INSERT INTO alias(feature_id,alias,alias_norm,alias_type) VALUES
      (1,'ENST00000054666','enst00000054666','transcript_id_versionless'),
      (1,'ENSG00000049245','ensg00000049245','gene_id_versionless');`,
  );
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

describe("loadTranscriptFromBackend (shim → API-shape)", () => {
  let backend: ISqlBackend;
  beforeAll(async () => {
    backend = await buildBackend();
  });

  it("resolves by transcript_name and shapes JSON like the REST API", async () => {
    const json = await loadTranscriptFromBackend(backend, "VAMP3-201");
    expect(json).not.toBeNull();
    const r = json!.results.region;
    expect(r.chrom).toBe("chr1");
    expect(r.start).toBe(7771296); // 1-based inclusive
    expect(r.end).toBe(7781432);
    expect(r.strand).toBe("+");
    expect(r.gene_id).toBe("ENSG00000049245.13");
    expect(r.trans_id).toBe("ENST00000054666.11");
    expect(r.trans_name).toBe("VAMP3-201");
    expect(r.gene_name).toBe("VAMP3");
    expect(r.trans_type).toBe("protein_coding");

    expect(json!.results.base.exon.position).toEqual([
      7771296, 7771385, 7773442, 7773511, 7777160, 7777318, 7778118, 7778169,
      7779626, 7781432,
    ]);
    expect(json!.results.base.CDS.position).toEqual([
      7771383, 7771385, 7773441, 7773511, 7777159, 7777318, 7778117, 7778169,
      7779625, 7779642,
    ]);
    expect(json!.results.base.five_prime_UTR!.position).toEqual([
      7771296, 7771383,
    ]);
    expect(json!.results.base.three_prime_UTR!.position).toEqual([
      7779643, 7781432,
    ]);
  });

  it("resolves by versionless transcript_id via alias", async () => {
    const json = await loadTranscriptFromBackend(backend, "ENST00000054666");
    expect(json?.results.region.trans_id).toBe("ENST00000054666.11");
  });

  it("falls back to a transcript when only a gene_name is given", async () => {
    const json = await loadTranscriptFromBackend(backend, "VAMP3");
    expect(json?.results.region.gene_name).toBe("VAMP3");
    expect(json?.results.region.trans_id).toBe("ENST00000054666.11");
  });

  it("is case-insensitive on direct lookup", async () => {
    const json = await loadTranscriptFromBackend(backend, "vamp3-201");
    expect(json?.results.region.trans_name).toBe("VAMP3-201");
  });

  it("returns null for unknown name", async () => {
    const json = await loadTranscriptFromBackend(backend, "DOES-NOT-EXIST");
    expect(json).toBeNull();
  });
});
