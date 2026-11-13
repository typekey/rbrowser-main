/**
 * ScreenDataManager – tile-based genomic data cache.
 *
 * One instance is created per channel.  It maintains a sliding window of
 * pre-fetched screen tiles so that pan is instant and zoom only re-requests
 * when the cached resolution is insufficient.
 *
 * Algorithm overview:
 *
 *  PAN  – slide the visible window across the fixed tile grid.
 *         • Compute which screen tile the centre of the new view falls in.
 *         • If the dominant tile changed, evict tiles that are now too far
 *           away and schedule a fetch for newly-needed tiles.
 *         • Data is never re-fetched when panning if it is already cached.
 *
 *  ZOOM-IN  – new level ≤ current level.
 *         • The cached data is already fine enough; simply slice the
 *           matching tiles and return them filtered to the new viewport.
 *         • No network request is made.
 *
 *  ZOOM-OUT – new level > current level  (or new region outside cached range).
 *         • Reset the tile coordinate system around the new viewport (screen 0).
 *         • Cancel any in-flight fetches.
 *         • Re-fetch all screenDataNumber tiles with the new (coarser) level.
 *
 * Tile boundaries are always at multiples of the reference span so that the
 * same URL parameters are reused across pans (cache-friendly).
 */

import { IScreenData, IScreenRegion, IScreenDataManagerOptions } from "./types";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// ScreenDataManager
// ---------------------------------------------------------------------------

export class ScreenDataManager<T = any> {
  // ---- options (with resolved defaults) ----
  private readonly opts: Required<
    Omit<IScreenDataManagerOptions<T>, "onUpdate" | "onError">
  > & {
    onUpdate?: IScreenDataManagerOptions<T>["onUpdate"];
    onError?: IScreenDataManagerOptions<T>["onError"];
  };

  // ---- current cache state ----
  private state: IScreenData<T> | null = null;

  // ---- in-flight fetch tracking ----
  // Maps screen index → AbortController; lets us cancel stale requests.
  private inFlight: Map<number, AbortController> = new Map();

  // ---- deferred reinitialization ----
  // When a zoom event arrives but in-flight requests prevent immediate
  // re-initialization, store the desired region here.  Once all in-flight
  // requests resolve, we re-initialize at the deferred level.
  private _deferredRegion: IScreenRegion | null = null;

  // ---- log prefix ----
  private readonly tag = "[ScreenDataManager]";

  constructor(opts: IScreenDataManagerOptions<T>) {
    // Default to 3 tiles (left + centre + right).
    // 5 was the previous default but it caused ~10 extra HTTP range requests
    // per zoom/pan on BigWig channels even after the parser-cache fix.
    const half = Math.floor(Math.max(1, opts.screenDataNumber ?? 3) / 2);
    // Ensure screenDataNumber is odd
    const screenDataNumber = half * 2 + 1;

    this.opts = {
      screenDataNumber,
      fetchData: opts.fetchData,
      onUpdate: opts.onUpdate,
      onError: opts.onError,
      baseSpan: opts.baseSpan ?? 1_000,
    };
  }

  /** True while fetches are pending — drives pan/zoom loading indicators. */
  public hasPendingRequests(): boolean {
    return this.inFlight.size > 0;
  }

  /**
   * Initialise the cache for the given genomic region.
   *
   * This sets the tile coordinate system (screen 0 = `region`), computes
   * the data-resolution level, and kicks off parallel fetches for all
   * `screenDataNumber` tiles.
   *
   * Safe to call again to hard-reset after a chromosome / gene switch.
   */
  initialize(region: IScreenRegion): void {
    this.cancelAllInFlight();
    this._deferredRegion = null; // clear any stale deferred zoom

    const level = this.computeLevel(region.end - region.start);

    if (this.state && this.state.data.size > 0) {
      for (const [, records] of this.state.data) {
        // Help GC by clearing the arrays
        if (Array.isArray(records)) {
          records.length = 0;
        }
      }
      this.state.data.clear();
    }

    this.state = {
      level,
      region: { ...region },
      current: { screen: 0, region: { ...region } },
      annotation: {},
      data: new Map(),
    };

    // Fetch only the visible centre tile first so that the initial render is
    // as fast as possible (fewer parallel HTTP requests in the critical path).
    // Flanking tiles are scheduled lazily once the centre tile resolves so
    // they do not compete with the structural BigWig reads (header, B-tree,
    // R-tree) that must complete sequentially before any data can be returned.
    this.scheduleFetch(0, () => {
      if (this.state) this.syncCache(0);
    });
  }

  /**
   * Call this on every pan event (drag or swipe).
   *
   * No re-fetch occurs if the visible tiles are already cached.
   * Only newly-needed tiles (at the leading edge of the pan direction)
   * are requested; trailing tiles are evicted.
   */
  handlePan(visibleRegion: IScreenRegion): void {
    if (!this.state) return;

    const newScreen = this.screenIndexFor(visibleRegion);
    const prevScreen = this.state.current.screen;

    // Always update the visible region
    this.state.current = {
      screen: newScreen,
      region: { ...visibleRegion },
    };

    // Always notify so that score-range labels and other viewport-derived UI
    // refresh even when the viewport moves within the same tile.
    this.opts.onUpdate?.(this.state);

    if (newScreen === prevScreen) return; // same tile — no fetch needed

    this.syncCache(newScreen);
  }

  handleZoom(visibleRegion: IScreenRegion): void {
    if (!this.state) {
      this.initialize(visibleRegion);
      return;
    }

    const newSpan = visibleRegion.end - visibleRegion.start;
    const newLevel = this.computeLevel(newSpan);

    if (newLevel !== this.state.level) {
      // Level changed (zoom-in or zoom-out).
      if (this.inFlight.size > 0) {
        // Defer: remember the desired region so we can reinitialize once the
        // current in-flight requests finish.  Update the viewport pointer so
        // old data keeps rendering correctly while we wait.
        this._deferredRegion = { ...visibleRegion };
        this.state.current = {
          screen: this.screenIndexFor(visibleRegion),
          region: { ...visibleRegion },
        };
        this.opts.onUpdate?.(this.state);
        return;
      }
      this._deferredRegion = null;
      this.initialize(visibleRegion);
      return;
    }

    // Same level: check if current cache covers the new viewport
    if (this.isCovered(visibleRegion)) {
      // Cache is valid at this resolution — just move the viewport pointer.
      const screen = this.screenIndexFor(visibleRegion);
      this.state.current = { screen, region: { ...visibleRegion } };
      this.opts.onUpdate?.(this.state);
    } else if (this.inFlight.size > 0) {
      // Same level, not covered, but fetches pending → defer
      this._deferredRegion = { ...visibleRegion };
      this.state.current = {
        screen: this.screenIndexFor(visibleRegion),
        region: { ...visibleRegion },
      };
      this.opts.onUpdate?.(this.state);
    } else {
      this.initialize(visibleRegion);
    }
  }

  /**
   * Returns the best available data array for the given visible region.
   *
   * Scans all cached screen tiles that overlap the visible region and
   * concatenates their records.  If no data is cached yet, returns [].
   */
  getDataForRegion(_visibleRegion: IScreenRegion): T[] {
    if (!this.state) return [];

    const span = this.state.region.end - this.state.region.start;
    const result: T[] = [];

    for (const [, records] of this.state.data) {
      result.push(...records);
    }

    // The feature renderer clips to the viewport via the domain uniform, so
    // returning all cached data is safe and avoids O(n) filtering here.
    void span; // suppress unused-var warning
    return result;
  }

  /** Read-only snapshot of the current state. */
  getState(): Readonly<IScreenData<T>> | null {
    return this.state;
  }

  /** Cancel all in-flight fetches and clear the cache. */
  destroy(): void {
    this.cancelAllInFlight();
    this.state = null;
  }

  // =========================================================================
  // Level computation
  // =========================================================================

  /**
   * Map a genomic span (in bp) to an integer resolution level.
   *
   *   level 0 : span ≤ baseSpan           (finest, ~1 bp/pixel)
   *   level N : span ≈ baseSpan × 2^N
   *
   * A higher level means coarser data (fewer records, each covering more bp).
   */
  computeLevel(span: number): number {
    if (span <= 0) return 0;
    return Math.max(0, Math.floor(Math.log2(span / this.opts.baseSpan)));
  }

  // =========================================================================
  // Screen-tile helpers
  // =========================================================================

  /**
   * Given a screen index, return its genomic boundaries (relative to the
   * current reference region).
   */
  screenRegion(idx: number): IScreenRegion {
    if (!this.state) throw new Error("ScreenDataManager not initialised");
    const { chr, start, end, strand } = this.state.region;
    const span = end - start;
    return {
      chr,
      start: start + idx * span,
      end: end + idx * span,
      strand,
    };
  }

  /**
   * Return the screen tile index whose centre is closest to the centre of
   * the given visible region.
   */
  screenIndexFor(region: IScreenRegion): number {
    if (!this.state) return 0;
    const ref = this.state.region;
    const span = ref.end - ref.start;
    const viewCentre = (region.start + region.end) / 2;
    const refCentre = (ref.start + ref.end) / 2;
    return Math.round((viewCentre - refCentre) / span);
  }

  /**
   * Return the sorted list of screen indices that should be cached when the
   * dominant tile is `centreScreen`.
   */
  neededIndices(centreScreen: number): number[] {
    const half = Math.floor(this.opts.screenDataNumber / 2);
    const indices: number[] = [];
    for (let i = centreScreen - half; i <= centreScreen + half; i++) {
      indices.push(i);
    }
    return indices;
  }

  // =========================================================================
  // Cache management
  // =========================================================================

  /**
   * After a pan to `newScreen`, evict stale tiles and schedule fetches for
   * any tile in the new window that is not already cached.
   */
  private syncCache(newScreen: number): void {
    const needed = new Set(this.neededIndices(newScreen));

    // --- evict tiles that are no longer needed ---
    for (const idx of [...this.state!.data.keys()]) {
      if (!needed.has(idx)) {
        this.state!.data.delete(idx);
      }
    }

    // --- cancel in-flight requests for evicted tiles ---
    for (const [idx, ctrl] of this.inFlight) {
      if (!needed.has(idx)) {
        ctrl.abort();
        this.inFlight.delete(idx);
      }
    }

    // --- schedule fetches for newly-needed tiles ---
    for (const idx of needed) {
      if (!this.state!.data.has(idx) && !this.inFlight.has(idx)) {
        this.scheduleFetch(idx);
      }
    }
  }

  /**
   * Kick off fetches for all tiles in the window around `centreScreen`.
   */
  private _fetchWindow(centreScreen: number): void {
    for (const idx of this.neededIndices(centreScreen)) {
      this.scheduleFetch(idx);
    }
  }

  /**
   * Schedule a fetch for a single screen tile.
   * Uses AbortController so that a stale fetch can be cancelled.
   *
   * @param onComplete  Optional callback invoked after the fetch resolves
   *                    (not called on abort or error).  Used to trigger lazy
   *                    prefetch of flanking tiles after the centre tile loads.
   */
  private scheduleFetch(idx: number, onComplete?: () => void): void {
    if (!this.state) return;

    // Don't duplicate in-flight requests
    if (this.inFlight.has(idx)) return;

    const region = this.screenRegion(idx);
    const level = this.state.level;
    const ctrl = new AbortController();
    this.inFlight.set(idx, ctrl);

    this.opts
      .fetchData(region, level)
      .then((records) => {
        // Verify the fetch wasn't cancelled and the state hasn't been reset
        if (ctrl.signal.aborted || !this.state) return;
        if (this.state.level !== level) return; // level changed while fetching


        this.state.data.set(idx, records);
        this.inFlight.delete(idx);
        this.opts.onUpdate?.(this.state);
        onComplete?.();

        // After all in-flight requests are done, check if a zoom event was
        // deferred while we were fetching.  Re-initialise at the new level.
        if (this.inFlight.size === 0 && this._deferredRegion) {
          const deferred = this._deferredRegion;
          this._deferredRegion = null;
          this.initialize(deferred);
        }
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return; // expected abort
        logger.error(`${this.tag} fetch error for screen ${idx}:`, err);
        this.inFlight.delete(idx);

        // Propagate the error to the channel so it can show an error state
        // instead of spinning forever.
        this.opts.onError?.(err);

        // Also check deferred region on error completion
        if (this.inFlight.size === 0 && this._deferredRegion) {
          const deferred = this._deferredRegion;
          this._deferredRegion = null;
          this.initialize(deferred);
        }
      });
  }

  // =========================================================================
  // Zoom helpers
  // =========================================================================

  /**
   * Check whether every part of `visibleRegion` is covered by at least one
   * cached tile.
   */
  private isCovered(visibleRegion: IScreenRegion): boolean {
    if (!this.state || this.state.data.size === 0) return false;

    for (const [idx] of this.state.data) {
      const tile = this.screenRegion(idx);
      if (tile.start <= visibleRegion.start && tile.end >= visibleRegion.end) {
        return true; // single tile fully covers the view
      }
    }

    // Check if the combination of all cached tiles covers the view
    let minCovered = Infinity;
    let maxCovered = -Infinity;
    for (const [idx] of this.state.data) {
      const tile = this.screenRegion(idx);
      minCovered = Math.min(minCovered, tile.start);
      maxCovered = Math.max(maxCovered, tile.end);
    }
    return minCovered <= visibleRegion.start && maxCovered >= visibleRegion.end;
  }

  /**
   * After a zoom-in where data is already sufficient, update the tile grid
   * so that the new (narrower) viewport becomes the new screen-0.
   * This keeps tile boundaries aligned with the viewport and avoids very
   * wide tiles during a subsequent pan.
   *
   * Existing cached data records are re-distributed into the new tile slots.
   */
  private _resetTileGrid(
    newRefRegion: IScreenRegion,
    currentScreen: number,
  ): void {
    if (!this.state) return;

    // Cancel stale in-flight requests first so they cannot write data that
    // belongs to the old tile grid into the new one.
    this.cancelAllInFlight();

    // Collect all currently cached records across all tiles
    const allRecords: T[] = [];
    for (const [, records] of this.state.data) {
      allRecords.push(...records);
    }

    const newLevel = this.computeLevel(newRefRegion.end - newRefRegion.start);

    // Reset tile grid to the new viewport
    this.state.region = { ...newRefRegion };
    this.state.level = newLevel;
    this.state.data = new Map();

    // Populate screen 0 with the records we already have (all of them, since
    // the new tile is a subset of the previously cached range)
    this.state.data.set(0, allRecords);
    this.state.current = {
      screen: currentScreen,
      region: { ...newRefRegion },
    };

    // Prefetch the flanking tiles with the new tile grid
    this.syncCache(0);
  }

  // =========================================================================
  // Utility
  // =========================================================================

  private cancelAllInFlight(): void {
    for (const ctrl of this.inFlight.values()) {
      ctrl.abort();
    }
    this.inFlight.clear();
  }
}
