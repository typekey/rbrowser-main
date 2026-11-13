// ---------------------------------------------------------------------------
// Region / coordinate primitives
// ---------------------------------------------------------------------------

export interface IScreenRegion {
  chr: string;
  start: number;
  end: number;
  strand?: string;
}

// ---------------------------------------------------------------------------
// ScreenData – single-channel cache object
// ---------------------------------------------------------------------------

/**
 * The full cache state for one channel.
 *
 * @template T  The element type stored in each screen slot (e.g. parsed records).
 */
export interface IScreenData<T = any> {
  /**
   * Data resolution level (0 = finest, higher = coarser).
   * Similar to BigWig zoom levels: increasing level means each datum covers
   * a wider genomic span.  When span grows (zoom-out) the level rises;
   * when span shrinks (zoom-in) the level may fall, requiring a fresh fetch.
   */
  level: number;

  /**
   * The genomic region that defines **screen 0** in the tile coordinate
   * system.  All other screen boundaries are derived from this.
   * Its span equals `end - start` and is the tile width in base-pairs.
   */
  region: IScreenRegion;

  /**
   * The currently visible window and which screen tile it maps to.
   */
  current: {
    /** Index of the screen tile that best represents the visible window. */
    screen: number;
    /** The exact genomic interval the user is currently viewing. */
    region: IScreenRegion;
  };

  /**
   * Reserved for future RNA / DNA mode metadata.
   */
  annotation: Record<string, any>;

  /**
   * Cached data, keyed by integer screen index.
   * e.g. { [-2]: [], [-1]: [...], [0]: [...], [1]: [...], [2]: [] }
   * Slots outside the active window are evicted automatically.
   */
  data: Map<number, T[]>;
}

// ---------------------------------------------------------------------------
// Manager options
// ---------------------------------------------------------------------------

export interface IScreenDataManagerOptions<T = any> {
  /**
   * Number of screen slots to keep in cache.
   * Default 5 → caches -2, -1, 0, +1, +2 relative to current screen.
   * Must be odd; if even, it is rounded up.
   */
  screenDataNumber?: number;

  /**
   * Fetch raw records for the given region and data-resolution level.
   * Implementations should hit the appropriate server endpoint or worker.
   */
  fetchData: (region: IScreenRegion, level: number) => Promise<T[]>;

  /**
   * Called whenever cached data changes (new fetch complete, eviction, …).
   * Use this to trigger a re-render.
   */
  onUpdate?: (screenData: IScreenData<T>) => void;

  /**
   * Called when a tile fetch fails with a non-abort error.
   * Use this to transition the channel into an error state.
   */
  onError?: (error: any) => void;

  /**
   * Lowest span (in bp) that maps to level 0.
   * Spans below this value also use level 0.
   * Default: 1_000 (1 kb).
   */
  baseSpan?: number;
}
