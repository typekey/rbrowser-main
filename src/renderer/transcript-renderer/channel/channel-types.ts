/**
 * Channel type definitions (config, style, data, render-state).
 * Shared by ChannelView, SubChannelGroupView, and external consumers.
 */

export interface IChannelData {
  method: string;
  format: string;
  url?: string;
  index?: string;
  /** Secondary index file (e.g. .gzi for bgzipped FASTA). */
  index2?: string;
  /**
   * Explicit BAM index variant (`"bai"` / `"csi"`). Only needed when the
   * index URL has no recognisable extension (e.g. blob URLs from drag-and-drop
   * uploads); otherwise the type is inferred from the `index` filename suffix.
   */
  indexFormat?: "bai" | "csi";
  /**
   * Origin of a `method: "buildin"` channel's data.
   *
   * - `"annotation"` : derive the feature structure (transcript exon/CDS/UTR,
   *   gene exons, splice junctions) from the active reference's GFF3
   *   annotation. Used by the auto-injected Transcript Structure / Exon /
   *   Junction channels.
   * - unset / other : use the legacy expression API templated in
   *   `defaultConfig.buildin` (e.g. GTEx exon / junction expression with
   *   per-tissue scores).
   */
  source?: "annotation" | string;
  /**
   * Inline raw content for `method: "local"`. Used with format `"tsv"`
   * (BED6/BED12 tab-separated text) or `"json"` (single record object or
   * array of records). When set, no URL is fetched.
   */
  content?: string;
  retain?: boolean;
  /**
   * Windowing function for aggregating multiple features within the same
   * screen pixel/bin (BigWig/BigBed bar plots).
   *
   * - 'mean'   : Average score across features in each bin (IGV default)
   * - 'max'    : Maximum score in each bin
   * - 'min'    : Minimum score in each bin
   *
   * Only affects the score-range label and bar normalization, not the
   * individual feature rendering. Defaults to 'mean'.
   */
  windowingFunction?: "mean" | "max" | "min";
}

export interface IChannelLabelStyle {
  color: string;
}

export interface IChannelStyle {
  height?: number;
  /**
   * Whether this channel is pinned (sticky) at the top of the viewport.
   * Pinned channels stay visible above the scrollable channel area.
   * The axis is always pinned by default.
   */
  pinned?: boolean;
  /**
   * Maximum visible sub-channels when expanded.
   * Value is a multiplier of the parent channel height.
   * E.g. maxHeight=5 with height=24 → max visible area = 120px (5 sub-channels).
   * A scrollbar appears on the right when sub-channels exceed this limit.
   * Defaults to 5.
   */
  maxHeight?: number;
  label?: IChannelLabelStyle;
  color?: string;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  cellWidth?: number;
  // Channel content styling
  expand?: string | string[];
  keys?: string[];
  /** Display order of key-value pairs in tooltip */
  order?: string[];
  sep?: string;
  foreground?:
    | string // Single color name: "yellow", "#ff0000"
    | string[] // Array of colors: ["sky", "yellow", "green"]
    | {
        // Colormap configuration for continuous data
        colormap?: string; // 'viridis', 'plasma', 'coolwarm', etc.
        range?: [number, number]; // [min, max] value range
        reversed?: boolean; // Reverse the colormap direction
        custom?: { [key: string]: string }; // Custom key-value color mapping
        // ── Diamond-specific data-driven mappings ──
        /** Field name whose numeric value drives the colormap (diamond plot). */
        colorBy?: string;
        /** Field name whose numeric value drives per-instance size (diamond plot). */
        sizeBy?: string;
        /** [min, max] size multiplier range mapped from sizeBy values (default [0.1, 1]). */
        sizeRange?: [number, number];
        /** Base alpha (opacity) for all rendered instances. Default 1 (fully opaque). */
        alpha?: number;
        /** Field name whose numeric value drives per-instance alpha (diamond plot). */
        alphaBy?: string;
        /** [min, max] alpha range mapped from alphaBy values (default [0.1, 1]). */
        alphaRange?: [number, number];
        /**
         * Filter diamond data by gene: field name in record.rest whose value
         * must match the current renderer gene_id (version-stripped).
         * e.g. filterGene: "Gene id" → keeps records where "Gene id" matches.
         */
        filterGene?: string;
        /**
         * Filter diamond data by transcript: field name in record.rest whose
         * value must match the current renderer trans_id (version-stripped).
         */
        filterTranscript?: string;
      };
  background?: string; // Background color for the channel, defaults to #ffffff
  padding?: string; // e.g., '0.2 0.1' (top bottom) or '0.2' (both)
  size?: number; // Size ratio for diamond plot: diamondPx = channelHeight * size. Default 0.3
  /**
   * Domain span threshold (bp) above which the track hides detail and shows
   * a "Zoom in" hint instead. Set to 0 to disable (always show detail).
   *
   * Defaults per plot type:
   * - `bam`:        50 000
   * - `transcript`:  500 000
   * - `sequence`:    10 000
   * - all others:    0 (no limit)
   */
  detailZoom?: number;
  /**
   * BAM coverage display configuration.
   * - `boolean`: `true` (default) to enable with defaults, `false` to disable.
   * - `object`:  fine-grained control over coverage rendering.
   */
  coverage?:
    | boolean
    | {
        /** Whether coverage is shown. Default true. */
        enabled?: boolean;
        /**
         * Coverage colour.
         * - string: a single hex colour, e.g. "#6b7484"
         * - object: colormap-based gradient, e.g. { colormap: "viridis", range: [0, 100] }
         */
        color?:
          | string
          | {
              colormap?: string;
              range?: [number, number];
            };
        /** Coverage opacity (0–1). Default 0.7. */
        alpha?: number;
        /** Fraction of channel height for coverage area (0–1). Default 0.2. */
        height?: number;
        /** Rendering style. Default "bar". */
        plot?: "bar" | "line" | "heatmap" | "point";
        /**
         * Domain span threshold (bp) above which coverage is hidden.
         * Coverage can have a larger threshold than reads so it stays
         * visible at medium zoom levels. Default 5 000 000.
         */
        detailZoom?: number;
        /** Score label in the top-right of the coverage area. */
        scoreLabel?: {
          enabled?: boolean;
          fontSize?: number;
          color?: string;
          background?: string;
        };
      };
  /**
   * Read-strand colours for BAM tracks.
   * - `plus`  → forward (+) strand colour
   * - `minus` → reverse (−) strand colour
   * - `other` → unmapped / unknown strand colour
   */
  readsColor?: {
    plus?: string;
    minus?: string;
    other?: string;
  };
  /**
   * Row height for lane-stacked plots (variant, transcript) as a fraction
   * of the channel content height. E.g. 0.31 means each lane uses 31% of
   * the content area when there is a single lane. Default: 0.31.
   */
  rowHeight?: number;
  /**
   * Row padding for lane-stacked variant plots, as a fraction of the lane
   * height. Padding is applied on both top and bottom of each row.
   * E.g. 0.01 means 1% of lane height padding on each side.
   * Default: 0.01.
   */
  rowPadding?: number;
  /**
   * Base colours for variant allele rendering.
   * Maps single bases (A, T, C, G, N) to hex colours.
   */
  baseColors?: { [base: string]: string };
  /** Reference allele colour for variant rendering. */
  refColor?: string;
  /** Text colour for base letters in variant rendering. */
  baseTextColor?: string;
  /**
   * RNA modification marker rendering configuration for transcript plots.
   * Controls how m6A, m5C, and other modification features are displayed.
   */
  modification?: {
    /** Whether modification markers are shown. Default true. */
    enabled?: boolean;
    /**
     * Colour for modification markers.
     * - string: a single hex colour, e.g. "#e74c3c"
     * - object: colormap-based gradient using probability_modified,
     *           e.g. { colormap: "coolwarm", range: [0, 1] }
     * Default: { colormap: "coolwarm" }
     */
    color?:
      | string
      | {
          colormap?: string;
          range?: [number, number];
        };
    /** Marker opacity (0–1). Default 1. */
    alpha?: number;
    /** Marker height as a fraction of channel height (0–1). Default 0.05. */
    height?: number;
    /** Marker shape. Default "triangle" (inverted triangle ▼). */
    plot?: "triangle";
  };
  /**
   * Whether to fill the area under junction arcs (score_curve plot).
   * When `false` (default), only the arc stroke is drawn without area fill,
   * giving a cleaner look. Set to `true` to show the filled area underneath.
   */
  areaShow?: boolean;
  /**
   * Whether this channel should automatically expand its sub-channels
   * when data first arrives.  Defaults to `false`.
   */
  isExpand?: boolean;
  /**
   * Whether to display feature names as text labels on rect features.
   * Applies to `rect` plot channels with bigbed/bed data.
   * Labels use sticky positioning, font-size scaling and alpha fading
   * similar to transcript labels.  Defaults to `false`.
   */
  showName?: boolean;
}

export interface IChannelGroup {
  name: string;
  number?: number;
  /** When true, channels in the same numbered group are rendered stacked
   *  (overlaid) in a single channel with alpha blending.  If *any* channel
   *  in the group has `stacked: true`, the entire group is stacked. */
  stacked?: boolean;
  /** Per-channel alpha multiplier for stacked rendering (0.0–1.0, default 0.8). */
  alpha?: number;
  /** When true, this channel belongs to a multi-select "Group Autoscale"
   *  group: all members share a common value scale that is kept in sync
   *  across pan / zoom / reorder until the user toggles it off. */
  autoscale?: boolean;
  /** The shared [min, max] value range for the autoscale group. Persisted so
   *  the constraint survives data reloads and config export/import. */
  autoscaleRange?: [number, number];
  style?: {
    color: string;
  };
}

export interface IChannelAnnotation {
  /** Field name used to expand (split) features into sub-channels */
  expand?: string;
  /** Field keys to display in tooltips / annotations */
  keys?: string[];
  /** Separator used to split composite field values */
  sep?: string;
  /**
   * Color mapping for expanded sub-channels.
   * - `string`: single color name or hex, e.g. `"yellow"`
   * - `string[]`: array of colors cycled across sub-channels
   * - `{ custom: Record<string, string> }`: explicit key → color mapping
   */
  colors?: string | string[] | { custom?: Record<string, string> };
  /** Filter expression applied to annotation records */
  filter?: string;
}

export interface IChannel {
  name: string;
  plot: string;
  level?: string;
  style?: IChannelStyle;
  group?: IChannelGroup;
  data?: IChannelData;
  filter?: string;
  pin?: boolean;
  /**
   * Annotation configuration for the channel.
   * Controls field expansion, tooltip keys, separators, and color mapping.
   */
  annotation?: IChannelAnnotation;
  /**
   * Display order of the channel.
   * Sorting rules:
   * 1. By default, follow the order in config.channels array
   * 2. Channels with order value > channels without order (undefined)
   * 3. Among channels with order values, smaller values come first
   */
  order?: number;
  sortable?: boolean; // Whether the channel can be sorted, defaults to true

  // ── Menu item visibility controls ─────────────────────────────────
  // Each defaults to true. Set to false to hide the corresponding menu item.

  /** Allow deleting this channel via the context menu. Default: true */
  isDeleteEnabled?: boolean;
  /** Allow sorting (move up/down) via the context menu. Default: true */
  isSortEnabled?: boolean;
  /** Allow setting group number via the context menu. Default: true */
  isGroupEnabled?: boolean;
  /** Allow renaming the channel via the context menu. Default: true */
  isRenameEnabled?: boolean;
  /** Allow changing background color via the context menu. Default: true */
  isBackgroundColorEnabled?: boolean;
  /** Allow changing foreground color via the context menu. Default: true */
  isForegroundColorEnabled?: boolean;
  /** Allow changing channel height via the context menu. Default: true */
  isChannelHeightEnabled?: boolean;
  /** Allow pinning/unpinning the channel via the context menu. Default: true */
  isPinEnabled?: boolean;
  /** Allow downloading channel image (PNG/SVG/PDF) via the context menu. Default: true */
  isImageDownloadEnabled?: boolean;
  /** Allow downloading channel data (BED/CSV/JSON etc.) via the context menu. Default: true */
  isDataDownloadEnabled?: boolean;

  /**
   * When `true` (the default), the channel respects the `style.detailZoom`
   * threshold: if the visible region exceeds that threshold the channel
   * shows a "Zoom in to view details" hint and **skips fetching data**,
   * reducing network requests.
   *
   * Set to `false` to disable this behaviour — data will always be
   * fetched regardless of zoom level (the `detailZoom` value is ignored).
   *
   * Only meaningful when `style.detailZoom` is set (explicitly or via
   * plot-type defaults).
   *
   * Default: `true`
   */
  isDetailLimitedByZoom?: boolean;
}


export interface RenderState {
  domain: { start: number; end: number };
}

export interface RenderingContext {
  gl: WebGL2RenderingContext | null;
  canvas: HTMLCanvasElement | null;
  theme: "light" | "dark";
  renderMode: "high" | "low";
}

/**
 * Data loader function type
 */
export type DataLoader = (region: {
  chr: string;
  start: number;
  end: number;
  scale?: number;
}) => Promise<any[]>;

export interface SubChannelGroupRenderState {
  domain: { start: number; end: number };
}
