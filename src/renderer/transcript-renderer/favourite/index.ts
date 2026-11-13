/*
 * FavouriteManager — standalone CRUD manager for favourite locuses.
 */

const FAVORITES_KEY = "tbrowser_favorites_v1";

import type { ILocus } from "../config/config";
import { locusKey, regionStringToLocus } from "../locus/locus-key";
import { logger } from "../utils/logger";

// ── Event types ────────────────────────────────────────────────────────────

export type FavouriteEvent = "add" | "remove" | "toggle" | "clear";

export type FavouriteListener = (
  event: FavouriteEvent,
  detail?: {
    /** The locus the event applies to (omitted for `"clear"`). */
    locus?: ILocus;
    /** Stable equality key for the locus — convenient for lookup tables. */
    key?: string;
    /** Whether the locus is favourited after the event. */
    isFavourite?: boolean;
  },
) => void;

// ── FavouriteManager ────────────────────────────────────────────────────────

export class FavouriteManager {
  /** Keyed by locusKey — guarantees mode + assembly dedup. */
  private _favourites: Map<string, ILocus> = new Map();
  private _listeners: FavouriteListener[] = [];

  constructor() {
    this._load();
  }

  // ── Persistence ─────────────────────────────────────────────────────────

  private _load(): void {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown[];
      if (!Array.isArray(parsed)) return;
      const map = new Map<string, ILocus>();
      for (const entry of parsed) {
        const locus = this._coerceEntry(entry);
        if (locus) map.set(locusKey(locus), locus);
      }
      this._favourites = map;
    } catch {
      this._favourites = new Map();
    }
  }

  private _coerceEntry(entry: unknown): ILocus | null {
    if (typeof entry === "string") {
      return regionStringToLocus(entry);
    }
    if (entry && typeof entry === "object") {
      const e = entry as any;
      // Current format: full ILocus
      if (e.dna && e.rna && typeof e.mode === "string") {
        return e as ILocus;
      }
      // Legacy `{region, assembly}` shape
      if (typeof e.region === "string") {
        return regionStringToLocus(e.region, {
          assembly: e.assembly?.name,
        });
      }
    }
    return null;
  }

  private _save(): void {
    try {
      localStorage.setItem(
        FAVORITES_KEY,
        JSON.stringify([...this._favourites.values()]),
      );
    } catch {}
  }

  // ── Event helpers ───────────────────────────────────────────────────────

  /**
   * Subscribe to favourite management events.
   * Returns an unsubscribe function.
   */
  on(listener: FavouriteListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  private _emit(
    event: FavouriteEvent,
    detail?: { locus?: ILocus; key?: string; isFavourite?: boolean },
  ): void {
    for (const l of this._listeners) {
      try {
        l(event, detail);
      } catch (e) {
        logger.error("[FavouriteManager] listener error:", e);
      }
    }
  }

  // ── Create ──────────────────────────────────────────────────────────────
  add(locus: ILocus): void {
    const k = locusKey(locus);
    if (!k) return;
    const isNew = !this._favourites.has(k);
    this._favourites.set(k, { ...locus, isFavorite: true });
    this._save();
    if (isNew) this._emit("add", { locus, key: k, isFavourite: true });
  }

  // ── Read ────────────────────────────────────────────────────────────────

  has(locus: ILocus): boolean {
    return this._favourites.has(locusKey(locus));
  }

  hasKey(key: string): boolean {
    return this._favourites.has(key);
  }

  getAll(): ILocus[] {
    return [...this._favourites.values()];
  }

  /** Number of favourites. */
  get count(): number {
    return this._favourites.size;
  }

  // ── Update / Toggle ─────────────────────────────────────────────────────

  /**
   * Toggle the favourite state of `locus`.
   *
   * @returns `true` if the locus is now a favourite, `false` if removed.
   */
  toggle(locus: ILocus): boolean {
    const k = locusKey(locus);
    if (!k) return false;
    if (this._favourites.has(k)) {
      this._favourites.delete(k);
      this._save();
      this._emit("toggle", { locus, key: k, isFavourite: false });
      return false;
    }
    this._favourites.set(k, { ...locus, isFavorite: true });
    this._save();
    this._emit("toggle", { locus, key: k, isFavourite: true });
    return true;
  }

  // ── Delete ──────────────────────────────────────────────────────────────
  remove(locus: ILocus): boolean {
    return this.removeKey(locusKey(locus));
  }

  /** Variant of remove that takes a pre-computed key. */
  removeKey(key: string): boolean {
    if (!key) return false;
    const existing = this._favourites.get(key);
    const existed = this._favourites.delete(key);
    if (existed) {
      this._save();
      this._emit("remove", {
        locus: existing,
        key,
        isFavourite: false,
      });
    }
    return existed;
  }

  /** Remove all favourites. */
  clear(): void {
    this._favourites.clear();
    this._save();
    this._emit("clear");
  }
}

/** Singleton instance — import this to share state across the app. */
export const favouriteManager = new FavouriteManager();
