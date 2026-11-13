import { getLocalBlobFile } from "./local-blob-registry";

export interface ITranscriptSearchHit {
  feature_type: string;
  gene_name: string | null;
  gene_id: string | null;
  transcript_name: string | null;
  transcript_id: string | null;
  chrom: string;
  start: number;
  end: number;
  strand: string | null;
  biotype: string | null;
  /** v0.5.5 rank: 1=transcript_id … 5=alias_exact, 6=prefix, 7=trigram. */
  rank_score: number;
  matched_field: string;
}

/**
 * Minimal SQL backend interface. The browser implementation is provided by
 * `sql.js-httpvfs`; tests can inject a Node-side `sql.js` adapter.
 */
export interface ISqlBackend {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
}

const SELECT_COLS = [
  "id",
  "feature_type",
  "gene_name",
  "gene_id",
  "transcript_name",
  "transcript_id",
  "chrom",
  "start",
  "end",
  "strand",
  "biotype",
].join(", ");

/** lowercase + strip trailing `.N` version + remove [\s_.-] separators. */
export function normalize(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .replace(/\.\d+$/, "")
    .replace(/[\s_.-]+/g, "");
}

/** Quote-strip an FTS5 token so it can be safely wrapped in "…". */
function ftsTok(q: string): string {
  return q.replace(/["']/g, " ").trim().replace(/\s+/g, " ");
}

/**
 * alias_type → [rank score, matched_field label].
 * Lower score = better match. Anything not listed here
 * (gene_synonym, hgnc, havana, ccds, protein_id, rnacentral_id,
 * rnacentral_db, dbxref, refseq, name, alias, …) → generic alias_exact.
 */
const ALIAS_FIELD: Record<string, [number, string]> = {
  transcript_id: [1, "transcript_id_exact"],
  transcript_name: [2, "transcript_name_exact"],
  gene_name: [3, "gene_name_exact"],
  gene_id: [4, "gene_id_exact"],
};

/**
 * Pure search algorithm. Independent of transport so it can be unit-tested
 * against an in-memory `sql.js` DB.
 */
export class TranscriptSearch {
  constructor(private readonly db: ISqlBackend) {}

  /** Underlying SQL backend (escape hatch for advanced queries). */
  get backend(): ISqlBackend {
    return this.db;
  }

  async search(query: string, limit = 10): Promise<ITranscriptSearchHit[]> {
    const raw = (query ?? "").trim();
    if (!raw) return [];
    const nq = normalize(raw);

    // ── Tiers 1–5: ONE index-only seek into idx_alias_norm ───────────────
    // Resolves any exact match (id / name / synonym / RNAcentral URS / …)
    // across all species in a single lookup; alias_type gives rank +
    // matched_field. No fuzzy work runs when this returns hits.
    const candLimit = Math.max(limit * 8, 50);
    const cand = await this.db.query<{
      alias_type: string;
      feature_id: number;
    }>(
      `SELECT alias_type, feature_id FROM alias
        WHERE alias_norm = ? LIMIT ?`,
      [nq, candLimit],
    );

    if (cand.length > 0) {
      const best = new Map<number, [number, string]>();
      for (const { alias_type, feature_id } of cand) {
        const [score, field] = ALIAS_FIELD[alias_type] ?? [5, "alias_exact"];
        const cur = best.get(feature_id);
        if (!cur || score < cur[0]) best.set(feature_id, [score, field]);
      }
      const ordered = [...best.entries()]
        .sort((a, b) => a[1][0] - b[1][0] || a[0] - b[0])
        .slice(0, limit);
      const ids = ordered.map(([fid]) => fid);
      const placeholders = ids.map(() => "?").join(",");
      const rows = await this.db.query<any>(
        `SELECT ${SELECT_COLS} FROM feature WHERE id IN (${placeholders})`,
        ids,
      );
      const byId = new Map<number, any>(rows.map((r) => [r.id, r]));
      const out: ITranscriptSearchHit[] = [];
      for (const [fid, [score, field]] of ordered) {
        const r = byId.get(fid);
        if (r) out.push({ ...r, rank_score: score, matched_field: field });
      }
      return out;
    }

    // ── Fuzzy tiers — only when no exact hit at all ──────────────────────
    const seen = new Set<number>();
    const out: ITranscriptSearchHit[] = [];
    const take = (rows: any[], field: string, score: number): boolean => {
      for (const r of rows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push({ ...r, rank_score: score, matched_field: field });
        if (out.length >= limit) return true;
      }
      return false;
    };

    // Tier 6 — prefix / autocomplete (names + IDs + synonyms).
    const token = ftsTok(raw);
    if (token.length > 0) {
      try {
        const rows = await this.db.query<any>(
          `SELECT ${SELECT_COLS} FROM feature WHERE id IN
             (SELECT rowid FROM feature_fts WHERE feature_fts MATCH ?)
             LIMIT ?`,
          [`"${token}"*`, limit * 4],
        );
        if (take(rerank(rows, nq), "prefix", 6)) return out;
      } catch {
        /* FTS phrase error on odd input → ignore, fall through */
      }
    }

    // Tier 7 — trigram substring (NAMES + synonyms only).
    // Skip for letter-less queries: the trigram has no IDs, so a pure
    // digit/symbol fragment can never match a name — running it would just
    // scan postings for nothing (the pathological multi-second case).
    if (raw.length >= 3 && /[a-z]/i.test(raw)) {
      try {
        const rows = await this.db.query<any>(
          `SELECT ${SELECT_COLS} FROM feature WHERE id IN
             (SELECT rowid FROM feature_trigram WHERE feature_trigram MATCH ?)
             LIMIT ?`,
          [`"${raw.replace(/"/g, "")}"`, limit * 4],
        );
        if (take(rerank(rows, nq), "trigram", 7)) return out;
      } catch {
        /* trigram table absent — ignore */
      }
    }

    return out;
  }

  /**
   * Return all transcript-level rows belonging to `geneId` (matches either
   * the versioned or versionless form because `normalize()` strips `.N`,
   * but we just use the alias index for simplicity).
   *
   * Used by the suggestions dropdown to expand a gene-name hit (v0.5.5
   * only indexes `alias_type='gene_name'` against the gene-level feature,
   * so callers must fan out to surface the gene's transcripts).
   */
  async transcriptsOfGene(
    geneId: string,
    limit = 200,
  ): Promise<ITranscriptSearchHit[]> {
    const id = (geneId ?? "").trim();
    if (!id) return [];
    const rows = await this.db.query<any>(
      `SELECT ${SELECT_COLS} FROM feature
        WHERE gene_id = ? COLLATE NOCASE
          AND feature_type <> 'gene'
        LIMIT ?`,
      [id, limit],
    );
    return rows.map((r) => ({
      ...r,
      rank_score: 3,
      matched_field: "gene_name_exact",
    }));
  }
}

/** Rank fuzzy hits: startswith → contains → shorter name first. */
function rerank(rows: any[], nq: string): any[] {
  const key = (r: any): [number, number, number, string] => {
    const name: string =
      r.transcript_name || r.gene_name || r.transcript_id || r.gene_id || "";
    const nn = normalize(name);
    return [
      nn.startsWith(nq) ? 0 : 1,
      nq && nn.includes(nq) ? 0 : 1,
      name.length,
      name,
    ] as [number, number, number, string];
  };
  return rows.slice().sort((a, b) => {
    const ka = key(a),
      kb = key(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    }
    return 0;
  });
}

// -------------------------------------------------------------------------
// Browser transport — sql.js-httpvfs over HTTP Range
// -------------------------------------------------------------------------

let workerModulePromise: Promise<typeof import("sql.js-httpvfs")> | null = null;
const dbWorkerCache = new Map<string, Promise<ISqlBackend>>();

interface IHttpvfsAssets {
  /** Public URL of `sqlite.worker.js`. */
  workerUrl: string;
  /** Public URL of `sql-wasm.wasm`. */
  wasmUrl: string;
}

/**
 * Open a remote SQLite catalogue and return a `TranscriptSearch` bound to it.
 * Multiple calls for the same `dbUrl` share a single underlying worker.
 *
 * The worker and wasm assets are resolved automatically from the npm
 * package via Vite `?url` imports — no `public/` copy is required. Pass
 * `assets` to override (e.g. when hosting via CDN).
 *
 * @param dbUrl   Absolute / relative URL of the `.sqlite` file. Server
 *                must expose `Accept-Ranges: bytes` and serve the file
 *                uncompressed (no gzip/brotli).
 * @param assets  Optional override for the worker / wasm asset URLs.
 */
export async function openTranscriptSearch(
  dbUrl: string,
  assets: Partial<IHttpvfsAssets> = {},
): Promise<TranscriptSearch> {
  // `blob:` / `data:` / `file:` catalogues (e.g. a local `.rbi`/`.rba`
  // imported via the Custom Reference dialog) cannot be served through the
  // HTTP Range path that `sql.js-httpvfs` relies on — Range requests against
  // an object URL are unsupported, so the worker silently yields no rows.
  // Download the whole file once and query it in-memory via plain `sql.js`.
  if (isWholeFileUrl(dbUrl)) {
    return getWholeFileSearch(dbUrl);
  }
  const resolved = await resolveAssets(assets);
  const backend = await getHttpvfsBackend(dbUrl, resolved);
  return new TranscriptSearch(backend);
}

async function resolveAssets(
  override: Partial<IHttpvfsAssets>,
): Promise<IHttpvfsAssets> {
  if (override.workerUrl && override.wasmUrl) {
    return override as IHttpvfsAssets;
  }
  // Vite bundles these as hashed assets at build time. The dynamic-
  // import form lets non-Vite environments (e.g. Node test runner)
  // skip resolution unless the call path is actually taken.
  const [workerMod, wasmMod] = await Promise.all([
    import("sql.js-httpvfs/dist/sqlite.worker.js?url"),
    import("sql.js-httpvfs/dist/sql-wasm.wasm?url"),
  ]);
  return {
    workerUrl: override.workerUrl ?? (workerMod as any).default,
    wasmUrl: override.wasmUrl ?? (wasmMod as any).default,
  };
}

async function getHttpvfsBackend(
  dbUrl: string,
  assets: IHttpvfsAssets,
): Promise<ISqlBackend> {
  const key = `${dbUrl}\0${assets.workerUrl}\0${assets.wasmUrl}`;
  let p = dbWorkerCache.get(key);
  if (p) return p;
  p = createHttpvfsBackend(dbUrl, assets).catch((e) => {
    dbWorkerCache.delete(key);
    throw e;
  });
  dbWorkerCache.set(key, p);
  return p;
}

async function createHttpvfsBackend(
  dbUrl: string,
  assets: IHttpvfsAssets,
): Promise<ISqlBackend> {
  if (!workerModulePromise) {
    workerModulePromise = import("sql.js-httpvfs");
  }
  const { createDbWorker } = await workerModulePromise;
  const worker = await createDbWorker(
    [
      {
        from: "inline",
        config: {
          serverMode: "full",
          url: dbUrl,
          requestChunkSize: 4096,
        },
      },
    ],
    assets.workerUrl,
    assets.wasmUrl,
    10 * 1024 * 1024, // maxBytesToRead — VFS byte-cap safety net (v0.5.5 recommended)
  );
  return {
    async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
      return (await worker.db.query(sql, params)) as T[];
    },
  };
}

// -------------------------------------------------------------------------
// In-memory transport — sql.js (whole file)
// -------------------------------------------------------------------------
// Used for local catalogues exposed as `blob:` / `data:` / `file:` URLs,
// where HTTP Range requests are unavailable. The entire database is fetched
// once and queried from memory. Fine for the modest `.rbi` search indices a
// custom reference carries.

const wholeFileCache = new Map<string, Promise<TranscriptSearch>>();
let sqlJsPromise: Promise<
  Awaited<ReturnType<(typeof import("sql.js"))["default"]>>
> | null = null;

/** True for object/data URLs that can't serve HTTP Range requests. */
function isWholeFileUrl(url: string): boolean {
  return /^(blob:|data:|file:)/i.test(url);
}

async function getSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = (async () => {
      const [{ default: initSqlJs }, wasmMod] = await Promise.all([
        import("sql.js"),
        import("sql.js/dist/sql-wasm.wasm?url"),
      ]);
      return initSqlJs({
        locateFile: () => (wasmMod as { default: string }).default,
      });
    })();
  }
  return sqlJsPromise;
}

async function getWholeFileSearch(dbUrl: string): Promise<TranscriptSearch> {
  const cached = wholeFileCache.get(dbUrl);
  if (cached) return cached;
  const p = (async () => {
    const bytes = await readWholeFileBytes(dbUrl);
    const SQL = await getSqlJs();
    const db = new SQL.Database(bytes);
    const backend: ISqlBackend = {
      async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
        const stmt = db.prepare(sql);
        try {
          stmt.bind(params as never);
          const out: T[] = [];
          while (stmt.step()) out.push(stmt.getAsObject() as T);
          return out;
        } finally {
          stmt.free();
        }
      },
    };
    return new TranscriptSearch(backend);
  })().catch((e) => {
    wholeFileCache.delete(dbUrl);
    throw e;
  });
  wholeFileCache.set(dbUrl, p);
  return p;
}

/**
 * Read a whole local catalogue into memory.
 *
 * Prefer the registered `File` (from the Custom Reference dialog) and read its
 * bytes directly — fetching a `blob:` URL that carries a `#fragment` is
 * unreliable across browsers. Fall back to `fetch` for `data:`/`file:` URLs or
 * blob URLs that were not registered.
 */
async function readWholeFileBytes(dbUrl: string): Promise<Uint8Array> {
  const file = getLocalBlobFile(dbUrl);
  if (file) return new Uint8Array(await file.arrayBuffer());
  // `fetch` ignores the URL fragment for http(s); for blob URLs strip it so the
  // blob-store lookup resolves to the canonical entry.
  const fetchUrl = dbUrl.startsWith("blob:") ? dbUrl.split("#")[0] : dbUrl;
  const resp = await fetch(fetchUrl);
  if (!resp.ok) throw new Error(`Failed to fetch catalogue: ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}
