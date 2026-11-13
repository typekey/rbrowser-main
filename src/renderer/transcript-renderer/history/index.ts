import type { ILocus } from "../config/config";
import { locusKey, regionStringToLocus } from "../locus/locus-key";
import { logger } from "../utils/logger";

const HISTORY_KEY = "tbrowser_history_v1";
const MAX_HISTORY = 20;

// ── Event types ────────────────────────────────────────────────────────────

export type HistoryEvent = "add" | "remove" | "clear";

export type HistoryListener = (
  event: HistoryEvent,
  detail?: {
    /** The locus the event applies to (omitted for `"clear"`). */
    locus?: ILocus;
    /** Stable equality key for the locus — convenient for lookup tables. */
    key?: string;
  },
) => void;

export class HistoryManager {
  /** Ordered most-recent-first; deduplicated by locusKey. */
  private _history: ILocus[] = [];
  private _listeners: HistoryListener[] = [];

  constructor() {
    this._load();
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private _load(): void {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown[];
      if (!Array.isArray(parsed)) return;
      const out: ILocus[] = [];
      const seen = new Set<string>();
      for (const entry of parsed) {
        const locus = this._coerceEntry(entry);
        if (!locus) continue;
        const k = locusKey(locus);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(locus);
      }
      this._history = out;
    } catch {
      this._history = [];
    }
  }

  private _coerceEntry(entry: unknown): ILocus | null {
    if (typeof entry === "string") return regionStringToLocus(entry);
    if (entry && typeof entry === "object") {
      const e = entry as any;
      if (e.dna && e.rna && typeof e.mode === "string") {
        return e as ILocus;
      }
      if (typeof e.region === "string") {
        return regionStringToLocus(e.region, {
          assembly: e.assembly?.name,
          // Legacy timestamps were `Date.now()` numbers — convert.
          time:
            typeof e.timestamp === "number"
              ? new Date(e.timestamp).toISOString()
              : undefined,
        });
      }
    }
    return null;
  }

  private _save(): void {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this._history));
    } catch {
      // localStorage might be full or disabled — silently ignore
    }
  }

  // ── Event helpers ───────────────────────────────────────────────────────

  /**
   * Subscribe to history events.
   * Returns an unsubscribe function.
   */
  on(listener: HistoryListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  private _emit(
    event: HistoryEvent,
    detail?: { locus?: ILocus; key?: string },
  ): void {
    for (const l of this._listeners) {
      try {
        l(event, detail);
      } catch (e) {
        logger.error("[HistoryManager] listener error:", e);
      }
    }
  }

  add(locus: ILocus): void {
    const k = locusKey(locus);
    if (!k) return;
    this._history = this._history.filter((h) => locusKey(h) !== k);
    this._history.unshift(locus);
    if (this._history.length > MAX_HISTORY) {
      this._history = this._history.slice(0, MAX_HISTORY);
    }
    this._save();
    this._emit("add", { locus, key: k });
  }

  has(locus: ILocus): boolean {
    const k = locusKey(locus);
    return !!k && this._history.some((h) => locusKey(h) === k);
  }

  hasKey(key: string): boolean {
    return !!key && this._history.some((h) => locusKey(h) === key);
  }

  getAll(): ILocus[] {
    return [...this._history];
  }

  /** Number of history entries. */
  get count(): number {
    return this._history.length;
  }

  remove(locus: ILocus): boolean {
    return this.removeKey(locusKey(locus));
  }

  /** Variant of remove that takes a pre-computed key. */
  removeKey(key: string): boolean {
    if (!key) return false;
    const before = this._history.length;
    let removed: ILocus | undefined;
    this._history = this._history.filter((h) => {
      if (locusKey(h) === key) {
        removed = h;
        return false;
      }
      return true;
    });
    const did = this._history.length < before;
    if (did) {
      this._save();
      this._emit("remove", { locus: removed, key });
    }
    return did;
  }

  /**
   * Erase all history entries (favourites are managed independently).
   */
  clear(): void {
    this._history = [];
    this._save();
    this._emit("clear");
  }
}

/** Singleton instance — import this to share state across the app. */
export const historyManager = new HistoryManager();
