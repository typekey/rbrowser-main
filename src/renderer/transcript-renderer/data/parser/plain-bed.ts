/**
 * PlainBedParser — supports plain-text (un-bgzipped, un-indexed) BED-like
 * files AND inline content (method: "local" + content).
 *
 * Supported sub-formats:
 *   - bed         : tab-separated BED6 / BED12 (parsed via @gmod/bed)
 *   - bedgraph    : 4-column chr/start/end/score
 *   - narrowpeak  : MACS narrowPeak (BED6+4) — parsed via @gmod/bed
 *   - broadpeak   : MACS broadPeak  (BED6+3) — parsed via @gmod/bed
 *   - json        : single record object or array of normalised record
 *                   objects (chrom, start, end, name, score, strand, …)
 *
 * Strategy (URL mode):
 *   - On first call, do a HEAD request to obtain Content-Length.
 *   - If the file is larger than SIZE_WARN_THRESHOLD, show a confirmation
 *     dialog. If the user declines, throw an error.
 *   - Otherwise fetch the whole file once, parse every line, group by
 *     chromosome and sort by start.
 *
 * Strategy (inline-content mode):
 *   - Skip all I/O; parse opts.content directly into the same map shape.
 *
 * Output records use the same shape produced by `normaliseBedRecord` so
 * downstream rendering code does not need to change.
 */

import BED from "@gmod/bed";
import { IParserOpts } from "./base";
import { IFetchOpts } from "./type";
import { normaliseBedRecord } from "./bed-normalise";
import { ModalDialog } from "../../dialog";
import { resolveChromFromSet } from "./chrom-alias";

const SIZE_WARN_THRESHOLD = 10 * 1024 * 1024; // 10 MB

export type SubFormat =
  | "bed"
  | "bedgraph"
  | "narrowpeak"
  | "broadpeak"
  | "json";

/** Per-URL cache so concurrent channels share one download. */
const loadCache = new Map<string, Promise<Map<string, any[]>>>();

function detectSubFormat(url: string): SubFormat {
  const lower = url.toLowerCase().split("?")[0].split("#")[0];
  if (lower.endsWith(".bedgraph") || lower.endsWith(".bg")) return "bedgraph";
  if (lower.endsWith(".narrowpeak")) return "narrowpeak";
  if (lower.endsWith(".broadpeak")) return "broadpeak";
  if (lower.endsWith(".json")) return "json";
  return "bed";
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "unknown size";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i >= 2 ? 2 : 0)} ${units[i]}`;
}

function isSkippableLine(line: string): boolean {
  if (!line) return true;
  const t = line.trimStart();
  if (!t) return true;
  if (t.startsWith("#")) return true;
  if (t.startsWith("track ")) return true;
  if (t.startsWith("browser ")) return true;
  return false;
}

function parseBedGraphLine(line: string): any | null {
  const parts = line.split(/\s+/);
  if (parts.length < 4) return null;
  const chromStart = Number(parts[1]);
  const chromEnd = Number(parts[2]);
  const score = Number(parts[3]);
  if (Number.isNaN(chromStart) || Number.isNaN(chromEnd)) return null;
  return {
    chrom: parts[0],
    chromStart,
    chromEnd,
    start: chromStart,
    end: chromEnd,
    score: Number.isNaN(score) ? 0 : score,
    strand: 0,
  };
}

/**
 * Probe the file size (best effort). Returns `null` when the server does
 * not expose Content-Length on HEAD.
 */
async function probeSize(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) return null;
    const len = res.headers.get("content-length");
    if (!len) return null;
    const n = Number(len);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function confirmLargeFile(url: string, size: number): Promise<boolean> {
  const fileName = url.split("/").pop() || url;
  return ModalDialog.confirm(
    "Large unindexed file",
    `The file "${fileName}" is ${formatBytes(size)} and exceeds the 10 MB threshold. ` +
      `Because it is not indexed, RBrowser must download the full file before rendering. Continue?`,
    { confirmLabel: "Continue", warning: true },
  );
}

async function loadAll(
  url: string,
  subFormat: SubFormat,
): Promise<Map<string, any[]>> {
  // Size check + confirmation
  const size = await probeSize(url);
  if (size !== null && size > SIZE_WARN_THRESHOLD) {
    const ok = await confirmLargeFile(url, size);
    if (!ok) {
      throw new Error(
        `User cancelled download of large file (${formatBytes(size)})`,
      );
    }
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  return parseTextToMap(text, subFormat);
}

/**
 * Parse a raw text blob (BED / bedGraph / peak / JSON) into the
 * chr-keyed map used by `recordsParser`. Shared by both URL and inline
 * code paths.
 */
function parseTextToMap(
  text: string,
  subFormat: SubFormat,
): Map<string, any[]> {
  const map = new Map<string, any[]>();

  if (subFormat === "json") {
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e: any) {
      throw new Error(`Invalid JSON content: ${e?.message ?? e}`);
    }
    const records: any[] = Array.isArray(parsed) ? parsed : [parsed];
    for (const rec of records) {
      const norm = normaliseJsonRecord(rec);
      if (!norm) continue;
      const chrom = String(norm.chrom);
      let arr = map.get(chrom);
      if (!arr) {
        arr = [];
        map.set(chrom, arr);
      }
      arr.push(norm);
    }
  } else {
    const bedParser = subFormat === "bedgraph" ? null : new BED();
    const lines = text.split(/\r?\n/);
    for (const raw of lines) {
      if (isSkippableLine(raw)) continue;

      let rec: any | null = null;
      if (subFormat === "bedgraph") {
        rec = parseBedGraphLine(raw);
      } else {
        try {
          const parsed = bedParser!.parseLine(raw);
          rec = normaliseBedRecord(parsed);
        } catch {
          rec = null;
        }
      }
      if (!rec) continue;
      if (rec.chrom === undefined || rec.chrom === null) continue;
      if (rec.start === undefined || rec.end === undefined) continue;

      const chrom = String(rec.chrom);
      let arr = map.get(chrom);
      if (!arr) {
        arr = [];
        map.set(chrom, arr);
      }
      arr.push(rec);
    }
  }

  // Sort each chromosome by start for cheap range filtering.
  for (const arr of map.values()) {
    arr.sort((a, b) => a.start - b.start);
  }

  return map;
}

/**
 * Normalise a user-supplied JSON record to the same shape produced by
 * `normaliseBedRecord`. Coerces numeric fields, validates required keys,
 * and normalises strand (+ → 1, - → -1, . → 0).
 *
 * Returns `null` when chrom/start/end are missing or non-numeric.
 */
function normaliseJsonRecord(rec: any): any | null {
  if (!rec || typeof rec !== "object") return null;
  const chrom = rec.chrom ?? rec.chr ?? rec.chromosome;
  const startRaw = rec.start ?? rec.chromStart;
  const endRaw = rec.end ?? rec.chromEnd;
  if (chrom === undefined || chrom === null) return null;
  const start = Number(startRaw);
  const end = Number(endRaw);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  const out: any = {
    chrom: String(chrom),
    chromStart: start,
    chromEnd: end,
    start,
    end,
  };
  if (rec.name !== undefined) out.name = String(rec.name);
  if (rec.score !== undefined) {
    const n = Number(rec.score);
    out.score = Number.isFinite(n) ? n : 0;
  }
  out.strand = normaliseStrand(rec.strand);
  // BED12 optional columns — keep as-is (numbers coerced where appropriate)
  if (rec.thickStart !== undefined) {
    const n = Number(rec.thickStart);
    if (Number.isFinite(n)) out.thickStart = n;
  }
  if (rec.thickEnd !== undefined) {
    const n = Number(rec.thickEnd);
    if (Number.isFinite(n)) out.thickEnd = n;
  }
  if (rec.itemRgb !== undefined) out.itemRgb = String(rec.itemRgb);
  if (rec.blockCount !== undefined) {
    const n = Number(rec.blockCount);
    if (Number.isFinite(n)) out.blockCount = n;
  }
  if (rec.blockSizes !== undefined) out.blockSizes = String(rec.blockSizes);
  if (rec.blockStarts !== undefined) out.blockStarts = String(rec.blockStarts);
  return out;
}

function normaliseStrand(v: unknown): number {
  if (v === undefined || v === null) return 0;
  if (v === 1 || v === -1 || v === 0) return v as number;
  const s = String(v);
  if (s === "+" || s === "1") return 1;
  if (s === "-" || s === "-1") return -1;
  return 0;
}

export class PlainBedParser {
  opts: IParserOpts;
  url: string;
  subFormat: SubFormat;
  /** When inline `content` was supplied, the parsed map is cached here. */
  private _inlinePromise: Promise<Map<string, any[]>> | null = null;

  constructor(opts: IParserOpts, subFormatOverride?: SubFormat) {
    this.opts = opts;
    this.url = opts.file ?? "";
    if (subFormatOverride) {
      this.subFormat = subFormatOverride;
    } else if (opts.content) {
      this.subFormat = "bed";
    } else {
      this.subFormat = detectSubFormat(this.url);
    }
  }

  private getLoadPromise(): Promise<Map<string, any[]>> {
    // Inline-content path — parse the in-memory string once and cache.
    if (this.opts.content !== undefined) {
      if (!this._inlinePromise) {
        const content = this.opts.content;
        const subFormat = this.subFormat;
        this._inlinePromise = Promise.resolve().then(() =>
          parseTextToMap(content, subFormat),
        );
      }
      return this._inlinePromise;
    }

    // URL path — fetch (shared across channels via module-level cache).
    let p = loadCache.get(this.url);
    if (!p) {
      p = loadAll(this.url, this.subFormat).catch((err) => {
        // Don't cache failures so the user can retry.
        loadCache.delete(this.url);
        throw err;
      });
      loadCache.set(this.url, p);
    }
    return p;
  }

  recordsParser = async (opts: IFetchOpts): Promise<any[]> => {
    const { chr, start, end } = opts;
    const map = await this.getLoadPromise();

    // Resolve chr against whatever spelling the file actually uses
    // (chr1 ↔ 1, chrM ↔ MT, …).
    const wantChrom = resolveChromFromSet(chr, map.keys());
    if (!wantChrom) return [];
    const arr = map.get(wantChrom);
    if (!arr || arr.length === 0) return [];

    // Simple linear scan; arrays are sorted by start so we can early-exit.
    const out: any[] = [];
    for (const rec of arr) {
      if (rec.start >= end) break;
      if (rec.end > start) out.push(rec);
    }
    return out;
  };
}
