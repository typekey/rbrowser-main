/**
 * Channel type definitions and ChannelView implementation
 */
import { FeatureRenderer } from "../feature/feature";
import { assignBamLanes } from "../feature/plots/bam-lanes";
import { ChannelStatus, IChannelState } from "./status";
import { StatusDisplay } from "../status/status";
import { View } from "../core/view";
import { sortChannelConfigs } from "./manager/channel-order";
import { LoadingRenderer, LoadingStatus, ILoadingConfig } from "../loading";
import { ScreenDataManager } from "../data/screen";
import { InteractionMode } from "../events";
import { IChannelLabelConfig } from "../config/config";
import { CDSCoordinateMapper } from "../utils/cds";
import { DIAMOND_TEXTURE_URL, ELE_GRAYS_TEXTURE_URL } from "../assets/textures";
import {
  transformGffToTranscripts,
  assignLanes,
  extractModifications,
  TranscriptRecord,
  ModificationRecord,
} from "../transcript";
import type {
  IChannel,
  RenderState,
  RenderingContext,
  DataLoader,
} from "./channel-types";
export type {
  IChannel,
  IChannelData,
  IChannelStyle,
  IChannelGroup,
  IChannelAnnotation,
  IChannelLabelStyle,
  DataLoader,
} from "./channel-types";
import { SubChannelGroupView } from "./manager/sub-channel-group-view";
import { ChannelTooltips } from "./components/channel-tooltips";
import { ChannelMenu } from "./components/channel-menu";
import { ChannelDataPipeline } from "./components/channel-data-pipeline";
import { ChannelScrollUI } from "./components/channel-scroll-ui";
import { ChannelLegend } from "./components/channel-legend";
import { ChannelHitTest } from "./components/channel-hit-test";
import { ChannelLabel } from "./components/channel-label";
import { ChannelExpand } from "./components/channel-expand";
import { ChannelParse } from "./components/channel-parse";
import { ChannelStyle } from "./components/channel-style";
import { ChannelSelector } from "./components/channel-selector";
import type { RenderContext } from "./render/render-context";
import { SequenceView } from "./render/sequence-view";
import { MotifView } from "./render/motif-view";
import { ScoreCurveView } from "./render/score-curve-view";
import { VariantView } from "./render/variant-view";
import { BamView } from "./render/bam-view";
import { TranscriptView } from "./render/transcript-view";
import { RectOverlayView } from "./render/rect-overlay-view";
import { GenericView } from "./render/generic-view";
import { logger } from "../utils/logger";

export type { IChannelState };
export { ChannelStatus };

/**
 * ChannelView - Independent channel rendering and data management
 */
export class ChannelView extends View {
  /** Builds HTML tooltip content per plot type. */
  readonly tooltips = new ChannelTooltips(this);

  /** Builds + drives the channel context menus (per-channel + multi-select). */
  readonly menu = new ChannelMenu(this);

  /** Fetches + processes this channel's data (fetch → merge → bin → GPU upload). */
  readonly dataPipeline = new ChannelDataPipeline(this);

  /** Scrollbars / shadows / zoom-hints for the lane areas. */
  readonly scrollUI = new ChannelScrollUI(this);

  /** Score legend / label (compact text, colorbar, modification label). */
  readonly legend = new ChannelLegend(this);

  /** Feature hit-testing (cursor position -> feature under it). */
  readonly hitTest = new ChannelHitTest(this);

  /** Channel label DOM + drag/click interactions. */
  readonly label = new ChannelLabel(this);

  /** Expand / collapse lifecycle (sub-channel creation + data distribution). */
  readonly expandCtrl = new ChannelExpand(this);

  /** Feature-annotation parsing & auto-detection (score-plot / style / UCSC). */
  readonly parse = new ChannelParse(this);

  /** Style resolution: foreground/background colours, RGBA, padding ratios. */
  readonly style = new ChannelStyle(this);

  /** Sequence-letter overlay view. */
  readonly sequenceView = new SequenceView(this);

  /** Motif / sequence-logo overlay view. */
  readonly motifView = new MotifView(this);

  /** Score-curve overlay view. */
  readonly scoreCurveView = new ScoreCurveView(this);

  /** Variant plot view (GPU features + allele-letter overlay + scroll). */
  readonly variantView = new VariantView(this);

  /** BAM plot view (read lanes + coverage histogram + overlay + scroll). */
  readonly bamView = new BamView(this);

  /** Transcript plot view (GPU exon/intron features + name labels + scroll). */
  readonly transcriptView = new TranscriptView(this);

  /** Rect/transcript overlays (strand arrows, name labels, intron backbones). */
  readonly rectOverlayView = new RectOverlayView(this);

  /** Generic GPU draw path (background, feature rects, stacked overlays). */
  readonly genericView = new GenericView(this);

  /** Resolve the channel's foreground colour from its style config. */
  public extractForegroundColor(): string {
    return this.style.extractForegroundColor();
  }

  /** Resolve the channel's background colour from its style config. */
  private extractBackgroundColor(): string {
    return this.style.extractBackgroundColor();
  }

  /** Convert a hex colour string to an RGBA tuple (0-1 range). */
  public hexToRgba(hex: string): [number, number, number, number] {
    return this.style.hexToRgba(hex);
  }

  /** Parse the configured padding into top/bottom ratios (writes to this). */
  private parsePadding(): void {
    this.style.parsePadding();
  }

  /** Convert style.foreground into the colour config FeatureRenderer expects. */
  public normalizeColorsForRenderer() {
    return this.style.normalizeColorsForRenderer();
  }

  /** True when the channel's data should be drawn as a score plot. */
  isScorePlot(): boolean {
    return this.parse.isScorePlot();
  }

  /** Infer channel style from the shape of the loaded data. */
  tryAutoDetectStyle(): void {
    this.parse.tryAutoDetectStyle();
  }

  /** Auto-expand the channel when the data implies grouped sub-channels. */
  tryAutoExpand(): void {
    this.parse.tryAutoExpand();
  }

  /** Parse a feature's trailing REST/attribute fields into key-value pairs. */
  parseRestFields(feature: any): Record<string, string> | null {
    return this.parse.parseRestFields(feature);
  }

  /** Build a compact one-line annotation string for a feature. */
  extractCompactAnnotation(feature: any): string {
    return this.parse.extractCompactAnnotation(feature);
  }

  /** Split this channel into per-value sub-channels. */
  expand(): void {
    this.expandCtrl.expand();
  }

  /** Collapse sub-channels back into this channel. */
  collapse(): void {
    this.expandCtrl.collapse();
  }

  /** Toggle expanded/collapsed state. */
  async toggleExpand(): Promise<void> {
    return this.expandCtrl.toggleExpand();
  }

  /** Mount the expand-fields UI into the given container. */
  mountExpandGroup(container: HTMLElement): void {
    this.expandCtrl.mountExpandGroup(container);
  }

  /** Currently-active expand field values. */
  getExpandValues(): string[] {
    return this.expandCtrl.getExpandValues();
  }

  /** Compute the distinct values for the given expand field names. */
  computeExpandValues(fieldNames: string[]): string[] {
    return this.expandCtrl.computeExpandValues(fieldNames);
  }

  /** Push filtered data down to each sub-channel. */
  distributeDataToSubChannels(): void {
    this.expandCtrl.distributeDataToSubChannels();
  }

  /** Register the reorder callback (invoked when this channel is dragged). */
  setReorderCallback(cb: (from: number, to: number) => void): void {
    this.expandCtrl.setReorderCallback(cb);
  }

  /** Build the channel label DOM (public entry; delegates to the label). */
  createChannelLabel(): void {
    this.label.createChannelLabel();
  }

  hitTestFeature(
    canvasX: number,
    canvasY: number,
    domain: { start: number; end: number },
  ): any | null {
    return this.hitTest.hitTestFeature(canvasX, canvasY, domain);
  }
  getFeatureAnnotation(feature: any): string {
    return this.hitTest.getFeatureAnnotation(feature);
  }
  hitTestFeatureWithChannel(
    canvasX: number,
    canvasY: number,
    domain: { start: number; end: number },
  ): { feature: any; channel: ChannelView } | null {
    return this.hitTest.hitTestFeatureWithChannel(canvasX, canvasY, domain);
  }
  collectCursorHits(
    genomicPos: number,
    domain: { start: number; end: number },
    dpr: number,
  ): Array<{ channelName: string; annotation: string; yCenterCss: number }> {
    return this.hitTest.collectCursorHits(genomicPos, domain, dpr);
  }
  hitTestGenomicPos(
    genomicPos: number,
    domain: { start: number; end: number },
  ): any | null {
    return this.hitTest.hitTestGenomicPos(genomicPos, domain);
  }

  getScoreLabelText(): string | null {
    return this.legend.getScoreLabelText();
  }
  setLegendInfo(visible: boolean, style: "auto" | "text" | "colorbar"): void {
    this.legend.setLegendInfo(visible, style);
  }
  refreshScoreLabels(): void {
    this.legend.refreshScoreLabels();
  }
  updateScoreLabel(minScore: number, maxScore: number): void {
    this.legend.updateScoreLabel(minScore, maxScore);
  }
  getModificationColormapInfo() {
    return this.legend.getModificationColormapInfo();
  }
  getBamCoverageColormapInfo() {
    return this.legend.getBamCoverageColormapInfo();
  }
  getColormapInfo() {
    return this.legend.getColormapInfo();
  }

  /** Load data for a region (public entry, delegates to the data pipeline). */
  async loadData(region: { chr: string; start: number; end: number }) {
    return this.dataPipeline.loadData(region);
  }

  /** Re-process cached tiles (e.g. after a gene-filter change; delegate). */
  reprocessCachedData(): void {
    this.dataPipeline.reprocessCachedData();
  }

  /** Yield to the event loop (shared by the data pipeline + render helpers). */
  yieldToMain(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  /** Public entry: build tooltip content for a feature (delegates to tooltips). */
  buildTooltipContent(feature: any, mode: "detailed" | "compact" = "detailed") {
    return this.tooltips.buildTooltipContent(feature, mode);
  }

  // ── Debug: instance tracking ─────────────────────────────────────────
  private static _instanceCounter = 0;
  public _instanceId: number;

  // ── Global channel processing queue ──────────────────────────────────
  // Prevents all channels from processing data in the same animation frame,
  // which causes severe UI jank when many heavy channels (eQTLs, sQTLs, etc.)
  // fire onUpdate simultaneously.  Channels are queued and processed one at a
  // time with a yield between each, keeping the main thread responsive.
  public static _channelQueue: Set<ChannelView> = new Set();
  private static _queueProcessing: boolean = false;

  public static async _processQueue(): Promise<void> {
    if (ChannelView._queueProcessing) return;
    ChannelView._queueProcessing = true;
    try {
      while (ChannelView._channelQueue.size > 0) {
        // Take the first channel from the queue
        const iter = ChannelView._channelQueue.values();
        const channel = iter.next().value!;
        ChannelView._channelQueue.delete(channel);
        channel._pendingUpdateFrame = 0;
        // Process this channel's data
        await channel.dataPipeline.updateDataFromCacheAsync();
        // Yield to main thread between channels so browser can paint
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    } finally {
      ChannelView._queueProcessing = false;
    }
  }

  public context: RenderingContext;
  public config: IChannel;
  public dataLoader: DataLoader;
  public loadingConfig: ILoadingConfig;

  // Data
  public data: any[] = [];
  public dataRegion: { chr: string; start: number; end: number } = {
    chr: "",
    start: 0,
    end: 0,
  };

  // Screen-based tile cache
  public screenManager: ScreenDataManager | null = null;

  // Rendering
  public featureRenderer: FeatureRenderer | null = null;

  // Status
  public state: IChannelState = { status: ChannelStatus.init };
  private statusDisplay: StatusDisplay;
  private loadingRenderer: LoadingRenderer | null = null;
  public trackContainer: HTMLDivElement | null = null;
  /** Score range label shown in the top-right corner of the channel. */
  public scoreLabelEl: HTMLElement | null = null;
  /** Channel name label shown in the top-left corner of the channel. */
  public channelLabelEl: HTMLElement | null = null;
  public channelLabelConfig: IChannelLabelConfig;
  public onDirtyCallback?: () => void;

  /** Global legend visibility (set by renderer header). */
  public _legendVisible: boolean = true;
  /** Global legend display style (set by renderer header). */
  public _legendStyleOverride: "auto" | "text" | "colorbar" = "auto";
  public onReorderCallback?: (
    fromIndex: number,
    toIndex: number,
    pinned?: boolean,
  ) => void;

  // ── Stacked rendering ──────────────────────────────────────────────

  /** When this channel is the "host" of a stacked group, the other
   *  channels whose data should be overlaid on top of this one. */
  public _stackedChannels: ChannelView[] = [];

  /** True when this channel is hidden because a stacked host is
   *  rendering its data instead. */
  _isStackedHidden: boolean = false;

  /**
   * Generation counter for async data processing.  Incremented every time
   * `updateDataFromCache` is scheduled so that stale (overtaken) updates
   * abort early instead of overwriting newer results.
   */
  public _dataGeneration: number = 0;

  /**
   * RAF id used to coalesce rapid `onUpdate` calls from ScreenDataManager
   * into a single async processing pass per animation frame.
   */
  public _pendingUpdateFrame: number = 0;

  /** Stable maxScore for rendering - frozen during inertia to prevent jitter */
  public lastStableMaxScore: number = 0;

  /** Accessor to check if inertia is active */
  public getInteractionController?: () => { isInertia(): boolean } | null;

  /** Foreground color derived from annotation.foreground, defaults to #747d8c */
  public _foregroundColor: string;

  /** Background color derived from annotation.background, defaults to #ffffff */
  public _backgroundColor: string;

  /** Parsed padding ratios [top, bottom] */
  public paddingTop: number = 0;
  public paddingBottom: number = 0;

  // ── Transcript plot state ──────────────────────────────────────────
  /** Dedicated renderer for transcript structures (used when plot === "transcript") */
  // private transcriptRenderer: TranscriptRenderer | null = null;
  /** Processed transcript records with lane assignments */
  public _transcriptRecords: TranscriptRecord[] = [];
  /** Total number of lanes after pileup layout */
  public _transcriptLaneCount: number = 0;
  /** RNA modification records extracted from GFF3 */
  public _modificationRecords: ModificationRecord[] = [];
  /** DOM element for the modification colorbar score label */
  public _modScoreLabelEl: HTMLDivElement | null = null;
  /** Whether new transcript records need re-upload to GPU */
  // private _txDataDirty: boolean = false;
  /** The dataRegion.start value used for the last GPU upload */
  // private _txUploadedRegionStart: number = NaN;
  /** Debug flags for one-time diagnostic logging */
  // private _txDebugDone = false;
  // private _txRenderLogged = false;
  /** Scroll offset in CSS pixels for transcript vertical panning */
  public _txScrollOffset: number = 0;
  /** DOM container for transcript labels & UTR markers */
  public _txLabelOverlay: HTMLDivElement | null = null;
  /** DOM scrollbar track for transcript overflow */
  public _txScrollTrack: HTMLDivElement | null = null;
  /** DOM scrollbar thumb */
  public _txScrollThumb: HTMLDivElement | null = null;
  /** Inner shadow overlay for transcript scroll */
  public _txShadowEl: HTMLDivElement | null = null;
  /** Lane height in CSS pixels (28px per lane as in genome-spy) */
  public static readonly TX_LANE_HEIGHT_CSS = 28;
  /** Extra bottom padding added to the scroll range so the last lane is never clipped */
  private static readonly TX_BOTTOM_PADDING_CSS = 24;
  // TX_ZOOM_THRESHOLD is now driven by config via detailZoomThreshold getter.
  /** DOM element for the "Zoom in to view transcripts" hint */
  public _txZoomHintEl: HTMLDivElement | null = null;
  /** Whether the transcript was in "zoomed out" state (above threshold) last frame */
  public _txWasZoomedOut: boolean = false;

  // ── Reusable typed arrays for high-quality transcript rendering ────
  // (Moved to FeatureRenderer — transcript geometry is now built there)

  // ── BAM plot state ─────────────────────────────────────────────────
  /** Lane-assigned BAM read records */
  public _bamReads: Array<{
    start: number;
    end: number;
    strand: number;
    lane: number;
    // Extended fields for tooltip (populated from @gmod/bam BamRecord)
    readName?: string;
    readLength?: number;
    flags?: number;
    mapq?: number;
    cigar?: string;
    seq?: string;
    qual?: Uint8Array | number[] | string | null;
    tags?: Record<string, any>;
  }> = [];
  /** Total number of BAM lanes after pileup */
  public _bamLaneCount: number = 0;
  /** Scroll offset in CSS pixels for BAM vertical panning */
  public _bamScrollOffset: number = 0;
  /** BAM lane height in CSS pixels */
  private static readonly BAM_LANE_HEIGHT_CSS = 4;
  /** Whether BAM wheel scroll handler has been attached */
  private _bamWheelAttached = false;
  /** DOM scrollbar track for BAM overflow */
  public _bamScrollTrack: HTMLDivElement | null = null;
  /** DOM scrollbar thumb for BAM */
  public _bamScrollThumb: HTMLDivElement | null = null;
  /** Inner shadow overlay for BAM scroll */
  public _bamShadowEl: HTMLDivElement | null = null;
  /** DOM element for the "Zoom in to view reads" hint */
  public _bamZoomHintEl: HTMLDivElement | null = null;
  /** DOM element for the BAM coverage score-range label */
  public _bamScoreLabelEl: HTMLDivElement | null = null;
  /** DOM element for the reads-area specific "Zoom in" hint (when coverage is still visible) */
  public _bamReadsZoomHintEl: HTMLDivElement | null = null;
  /** Whether the BAM was in "zoomed out" state last frame */
  public _bamWasZoomedOut: boolean = false;
  // BAM_ZOOM_THRESHOLD is now driven by config via detailZoomThreshold getter.

  // ── Variant (VCF) plot state ────────────────────────────────────────
  /** Whether the variant channel was in "zoomed out" state last frame */
  public _variantWasZoomedOut: boolean = false;
  /** DOM overlay for variant base letters */
  public _variantOverlayEl: HTMLDivElement | null = null;
  /** DOM element for "Zoom in to view variants" hint */
  public _variantZoomHintEl: HTMLDivElement | null = null;

  // ── Diamond / Motif zoom-out state ──────────────────────────────────
  /** Whether diamond/motif channel was in "zoomed out" state */
  public _diamondMotifWasZoomedOut: boolean = false;
  /** DOM element for the diamond/motif zoom hint overlay */
  public _diamondMotifZoomHintEl: HTMLDivElement | null = null;
  /** DOM element for generic (rect / score_curve / etc.) zoom hint overlay */
  public _genericZoomHintEl: HTMLDivElement | null = null;
  /** Whether generic channels were in "zoomed out" state */
  public _genericWasZoomedOut: boolean = false;
  /** Lane-assigned variant records */
  public _variantRecords: Array<{
    start: number;
    end: number;
    ref: string;
    alt: string[];
    altDisplay: string;
    lane: number;
    id?: string;
    qual?: number;
    filter?: string;
    INFO?: Record<string, unknown>;
    CHROM?: string;
    [key: string]: any;
  }> = [];
  /** Total number of variant lanes after pileup */
  public _variantLaneCount: number = 0;
  /** Scroll offset in CSS pixels for variant vertical panning */
  public _variantScrollOffset: number = 0;
  /** Whether variant wheel scroll handler has been attached */
  private _variantWheelAttached = false;
  /** DOM scrollbar track for variant overflow */
  public _variantScrollTrack: HTMLDivElement | null = null;
  /** DOM scrollbar thumb for variant */
  public _variantScrollThumb: HTMLDivElement | null = null;
  /** Inner shadow overlay for variant scroll */
  public _variantShadowEl: HTMLDivElement | null = null;
  /** Offscreen canvas for score_curve arc rendering → blitted to WebGL */
  public _scoreCurveCanvas: HTMLCanvasElement | null = null;
  /** Cached 2D context for _scoreCurveCanvas (avoid getContext per frame) */
  public _scoreCurveCtx: CanvasRenderingContext2D | null = null;
  /** Last domain used for score_curve rendering (cache key for skip-redraw) */
  public _scoreCurveCacheDomain: {
    start: number;
    end: number;
    w: number;
    h: number;
    dataLen: number;
  } | null = null;
  /** Offscreen canvas for motif (sequence logo) rendering → blitted to WebGL */
  public _motifCanvas: HTMLCanvasElement | null = null;
  /**
   * Global score range [min, max] shared across all sub-channels of a score_curve
   * or score_rect channel. Set by the parent channel before pushing data to sub-channels,
   * and read by sub-channels to keep colormap ranges consistent across tissues.
   */
  public _globalScoreRange: [number, number] | null = null;

  /**
   * Pending score range to apply once trackContainer is available (mount).
   * Stored when updateScoreLabel is called before the DOM element exists.
   */
  public _pendingScoreRange: [number, number] | null = null;

  /** DOM overlay for strand direction arrows on rect/diamond features. */
  public _rectStrandOverlay: HTMLDivElement | null = null;

  /** DOM overlay for feature name labels on rect features (showName). */
  public _rectNameOverlay: HTMLDivElement | null = null;

  /** Whether feature name labels are displayed on rect features. */
  public _showName: boolean = false;

  /** DOM overlay for strand-direction arrows on the intron backbone. */
  public _intronStrandOverlay: HTMLDivElement | null = null;

  /**
   * Group-imposed score range [min, max] set by the base-renderer when
   * multiple channels share the same `group.number`.  When present, the
   * channel uses this range for colormap normalization instead of its own.
   */
  public _groupScoreRange: [number, number] | null = null;

  /**
   * Last score range passed to updateScoreLabel, stored so the label
   * can be refreshed when the global legend style changes.
   */
  public _lastScoreRange: [number, number] | null = null;

  /**
   * The channel's OWN visible-window data [min, max], independent of any
   * group / autoscale shared range. Captured during data load before any
   * shared range is applied. Used to compute the union scale for an
   * autoscale group and to restore the local scale when the group is
   * cancelled.
   */
  public _ownScoreRange: [number, number] | null = null;

  // ── BAM coverage histogram ──────────────────────────────────────────
  /** Binned coverage depth array (one value per CSS pixel). */
  public _bamCoverage: Float32Array | null = null;
  /** Domain start that _bamCoverage array corresponds to. */
  public _bamCoverageStart: number = 0;
  /** Domain end of coverage range. */
  public _bamCoverageEnd: number = 0;
  /** Maximum depth across all bins. */
  public _bamCoverageMax: number = 0;
  // Coverage height fraction is now driven by config via bamCoverageHeightFrac getter.
  /** Coverage histogram fill colour (darker gray for visibility). */
  public static readonly BAM_COVERAGE_COLOR = "#8b95a5";

  // ── Expand / sub-channel state ─────────────────────────────────────
  /** Sub-channel views created by expanding this channel */
  public _subChannels: ChannelView[] = [];
  /** Whether the expand is currently open (showing sub-channels) */
  public _isExpanded: boolean = false;
  /** Whether auto-expand (style.isExpand) has already been triggered */
  public _ucscStyleInferred?: boolean;
  public _autoExpandDone: boolean = false;
  /** Whether this channel has been destroyed (prevents stale async work) */
  public _destroyed: boolean = false;
  /** True when this view is a sub-channel spawned by another channel */
  public _isSubChannel: boolean = false;
  /** The parent channel when this is a sub-channel */
  public _parentChannel: ChannelView | null = null;
  /** The expand-field value this sub-channel is filtered to */
  public _expandFilterValue: string | null = null;
  /**
   * When set, only expand values in this array are shown as sub-channels.
   * `null` means "show all". Managed by the Filter dialog.
   */
  _expandFilterSelection: string[] | null = null;

  /**

  /**
   * Callback invoked when sub-channels are created / removed.
   * The base-renderer sets this so it can insert / remove views from rootView.
   */
  onExpandCallback?: (
    parent: ChannelView,
    subChannels: ChannelView[],
    action: "expand" | "collapse",
  ) => void;

  // ── Clip / group state (used by SubChannelGroupView) ───────────────
  /** When set, GenericView clips its scissor rect to these bounds */
  _clipBounds: { y: number; height: number } | null = null;
  /** Scroll clip bounds set by LayoutView for global scroll clipping */
  private _scrollClipBounds: { y: number; height: number } | null = null;
  /** The SubChannelGroupView that wraps this channel's sub-channels */
  _expandGroupView: SubChannelGroupView | null = null;
  /**
   * CSS-pixel offset applied to the left edge of this channel's trackContainer
   * by the parent SubChannelGroupView (i.e., the sample-label strip width).
   * Used by ScoreCurveView to align the arc canvas with the full
   * domain coordinate space (same origin as the parent channel).
   */
  _trackLabelOffset: number = 0;

  /**
   * Optional callback set by the renderer to be notified when the mouse
   * enters / leaves the channel label.  `true` = entered, `false` = left.
   */
  _notifyLabelHover?: (hovering: boolean) => void;

  /**
   * Callback invoked when the user selects a menu action.
   * The base-renderer sets this so actions like move/delete/download
   * can be processed at the renderer level which has access to the config
   * and the full channel list.
   */
  onMenuAction?: (channel: ChannelView, action: string, payload?: any) => void;

  /**
   * Callback to retrieve transcript info from the renderer.
   * Set by the renderer so channels can access gene_id / trans_id
   * for data filtering (filterGene / filterTranscript).
   */
  getTranscriptInfo?: () => {
    gene_id: string;
    trans_id: string;
    trans_name: string;
    gene_name: string;
    trans_type: string;
  } | null;

  // ── CDS mode state ─────────────────────────────────────────────────
  /** CDS coordinate mapper (non-null when CDS mode is active). */
  public _cdsMapper: CDSCoordinateMapper | null = null;

  constructor(
    context: RenderingContext,
    config: IChannel,
    _channelIndex: number,
    dataLoader: DataLoader,
    loadingConfig: ILoadingConfig,
    channelLabelConfig: IChannelLabelConfig,
    onDirty?: () => void,
    getInteractionController?: () => { isInertia(): boolean } | null,
    onReorder?: (fromIndex: number, toIndex: number, pinned?: boolean) => void,
  ) {
    super();
    this._instanceId = ++ChannelView._instanceCounter;
    ChannelView._allInstances.add(this);
    this.context = context;
    // Deep-clone the config so mutations (e.g. Splitter, setForegroundColor)
    // never hit a frozen/read-only original supplied by the caller.
    this.config = JSON.parse(JSON.stringify(config));
    this.dataLoader = dataLoader;
    this.loadingConfig = loadingConfig;
    this.channelLabelConfig = channelLabelConfig;
    this.onDirtyCallback = onDirty;
    this.onReorderCallback = onReorder;
    this.getInteractionController = getInteractionController;

    // Initialize status display
    this.statusDisplay = new StatusDisplay(config.name);

    // Initialize foreground and background colors from config
    this._foregroundColor = this.extractForegroundColor();
    this._backgroundColor = this.extractBackgroundColor();

    // Parse and initialize padding
    this.parsePadding();

    // Initialize showName from config
    this._showName = !!this.config.style?.showName;

    if (this.context.gl) {
      this.featureRenderer = new FeatureRenderer(this.context.gl);

      // Pre-load texture for diamond plot type
      if (this.config.plot === "diamond") {
        this.featureRenderer.textures
          .loadDiamond(DIAMOND_TEXTURE_URL)
          .then(() => {
            this.onDirtyCallback?.();
          })
          .catch((err) =>
            logger.error(
              `[ChannelView] ${this.config.name} texture load error:`,
              err,
            ),
          );
      }

      // Pre-load ele_grays texture for high-quality rendering
      if (this.context.renderMode === "high") {
        this.featureRenderer.textures
          .loadEleGrays(ELE_GRAYS_TEXTURE_URL)
          .then(() => {
            this.onDirtyCallback?.();
          })
          .catch((err) =>
            logger.warn(
              `[ChannelView] ${this.config.name} ele_grays texture load error:`,
              err,
            ),
          );
      }
    }
  }

  // ── Core lifecycle ──────────────────────────────────────────────────
  /**
   * Mount status display.
   * Called after layout() so this.x/y/width/height are already computed.
   */
  mount(container: HTMLElement) {
    // Idempotency guard: if trackContainer already exists, clean up old DOM
    // to prevent duplicate labels / loading indicators on re-mount.
    if (this.trackContainer) {
      logger.warn(
        `[ChannelView] mount() called while trackContainer already exists for "${this.config.name}" — cleaning up old DOM`,
      );
      if (this.channelLabelEl) {
        this.channelLabelEl.remove();
        this.channelLabelEl = null;
      }
      if (this.loadingRenderer) {
        this.loadingRenderer.destroy();
        this.loadingRenderer = null;
      }
      if (this.trackContainer.parentElement) {
        this.trackContainer.parentElement.removeChild(this.trackContainer);
      }
      this.trackContainer = null;
    }

    this.statusDisplay.mount(container);

    // Initialize loading renderer if enabled
    if (this.loadingConfig.enabled !== false) {
      const dpr = window.devicePixelRatio || 1;
      this.trackContainer = document.createElement("div");
      this.trackContainer.className = "track-container";
      this.trackContainer.dataset.pinned = this.isPinned ? "true" : "false";
      this.trackContainer.style.position = "absolute";
      // left:0 + right:0 — width is derived from the container's content-box,
      // avoiding the 2px border-box discrepancy that caused horizontal shift.
      this.trackContainer.style.left = "0";
      this.trackContainer.style.right = "0";
      this.trackContainer.style.top = `${this.y / dpr}px`;
      this.trackContainer.style.height = `${this.height / dpr}px`;
      this.trackContainer.style.pointerEvents = "none";
      this.trackContainer.style.overflow = "visible";
      this.trackContainer.style.zIndex = "999";
      container.appendChild(this.trackContainer);

      // Initialize channel label if enabled
      this.label.createChannelLabel();

      this.loadingRenderer = new LoadingRenderer(
        this.trackContainer,
        this.loadingConfig.position || "rightBottom",
        this.loadingConfig.size || "small",
        this.loadingConfig.logoType || "svg",
      );
      // Show current status immediately
      this.updateLoadingStatus();
    }

    // Apply any pending score label that was deferred before mount
    if (this._pendingScoreRange) {
      const [min, max] = this._pendingScoreRange;
      this._pendingScoreRange = null;
      this.updateScoreLabel(min, max);
    }
  }

  /**
   * Set layout — when expanded, splits allocated height between parent & group.
   */
  layout(x: number, y: number, width: number, height: number) {
    const dpr = window.devicePixelRatio || 1;
    // Right inset for trackContainer DOM to avoid scrollbar overlap
    const rightInset = `${this._scrollbarInset}px`;

    // Stacked-hidden channels: collapse to zero and hide DOM
    if (this._isStackedHidden) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = 0;
      if (this.trackContainer) {
        this.trackContainer.style.display = "none";
      }
      return;
    }

    // Ensure trackContainer is visible (may have been stacked-hidden before)
    if (this.trackContainer && this.trackContainer.style.display === "none") {
      this.trackContainer.style.display = "";
    }

    if (this._expandGroupView) {
      // ── Expanded: parent gets its own height, rest goes to group ──
      const parentHeightCSS = this.config.style?.height ?? 24;
      const parentHeightDevice = parentHeightCSS * dpr;

      this.x = x;
      this.y = y;
      this.width = width;
      this.height = parentHeightDevice;

      // Position parent trackContainer
      if (this.trackContainer) {
        this.trackContainer.style.top = `${y / dpr}px`;
        this.trackContainer.style.height = `${parentHeightCSS}px`;
        this.trackContainer.style.right = rightInset;
      }

      // Layout group below parent
      const groupHeightDevice = height - parentHeightDevice;
      this._expandGroupView.layout(
        x,
        y + parentHeightDevice,
        width,
        groupHeightDevice,
      );
    } else {
      // ── Normal (no expand) ──
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;

      if (this.trackContainer) {
        this.trackContainer.style.top = `${y / dpr}px`;
        this.trackContainer.style.height = `${height / dpr}px`;
        this.trackContainer.style.right = rightInset;
      }
    }

    // ── DOM clipping for scrollable channels ──
    this._applyScrollDOMClip(dpr);

    this.updateStatusDisplay();

    // Ensure channel label is at correct position relative to trackContainer
    if (this.channelLabelEl) {
      const offset = this.channelLabelConfig.offset ?? { x: 0, y: 0 };
      const indentPx = 0;
      this.channelLabelEl.style.top = `${offset.y}px`;
      this.channelLabelEl.style.left = `${offset.x + indentPx}px`;
    }
  }

  /** Package the shared per-frame inputs the render views consume. */
  buildRenderContext(state: RenderState): RenderContext {
    return {
      state,
      gc: this.context,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      paddingTop: this.paddingTop,
      paddingBottom: this.paddingBottom,
      config: this.config,
      data: this.data,
      dataRegion: this.dataRegion,
      featureRenderer: this.featureRenderer,
      trackContainer: this.trackContainer,
      scrollUI: this.scrollUI,
      getEffectiveClip: () => this.getEffectiveClip(),
      isAboveDetailZoom: (domainSpan: number) =>
        this.isAboveDetailZoom(domainSpan),
    };
  }

  /** Render channel. */
  render(state: RenderState) {
    // Stacked-hidden channels are rendered by their host — skip own render
    if (this._isStackedHidden) return;

    const gl = this.context.gl;
    if (!gl) {
      logger.warn("[ChannelView] No WebGL context!");
      return;
    }

    const isTranscript =
      this.config.plot === "transcript" ||
      this.config.plot === "rna" ||
      this.config.plot === "simple_rna";
    const isBam = this.config.plot === "bam";
    const isVariant = this.config.plot === "variant";
    const isScoreCurve = this.config.plot === "score_curve";

    // ── Lazy init ──────────────────────────────────────────────────────
    if (isTranscript || isBam || isVariant) {
      // Transcript & BAM use lane-based renderTranscript()/renderBam()
      // on FeatureRenderer.  Ensure featureRenderer exists.
      if (!this.featureRenderer && gl) {
        this.featureRenderer = new FeatureRenderer(gl);
        // Load ele_grays texture for the high-quality textured path
        this.featureRenderer.textures
          .loadEleGrays(ELE_GRAYS_TEXTURE_URL)
          .then(() => this.onDirtyCallback?.())
          .catch((err) =>
            logger.warn(
              `[ChannelView] ${this.config.name} ele_grays texture error:`,
              err,
            ),
          );
      }
      // Attach BAM scroll handler once (on trackContainer, for when scrollbar is absent)
      if (isBam && !this._bamWheelAttached && this.trackContainer) {
        this._bamWheelAttached = true;
        this.trackContainer.addEventListener(
          "wheel",
          (e) => {
            if (!this.bamNeedsScroll) return;
            if (!e.altKey) return; // Alt+wheel to scroll channel content
            e.preventDefault();
            e.stopPropagation();
            const dpr = window.devicePixelRatio || 1;
            const paddingTopPx = Math.round(this.height * this.paddingTop);
            const paddingBottomPx = Math.round(
              this.height * this.paddingBottom,
            );
            const fullContentHeight =
              this.height - paddingTopPx - paddingBottomPx;
            const coverageHeightPx = this.bamCoverageEnabled
              ? Math.round(fullContentHeight * this.bamCoverageHeightFrac)
              : 0;
            const readsCSS = (fullContentHeight - coverageHeightPx) / dpr;
            const maxScroll = Math.max(
              0,
              this.bamTotalContentHeightCSS - readsCSS,
            );
            this._bamScrollOffset = Math.max(
              0,
              Math.min(maxScroll, this._bamScrollOffset + e.deltaY * 0.5),
            );
            this.onDirtyCallback?.();
          },
          { passive: false },
        );
      }
      // Attach variant scroll handler once
      if (isVariant && !this._variantWheelAttached && this.trackContainer) {
        this._variantWheelAttached = true;
        this.trackContainer.addEventListener(
          "wheel",
          (e) => {
            if (!this.variantNeedsScroll) return;
            if (!e.altKey) return; // Alt+wheel to scroll channel content
            e.preventDefault();
            e.stopPropagation();
            const dpr = window.devicePixelRatio || 1;
            const channelCSS = this.height / dpr;
            const maxScroll = Math.max(
              0,
              this.variantTotalContentHeightCSS - channelCSS,
            );
            this._variantScrollOffset = Math.max(
              0,
              Math.min(maxScroll, this._variantScrollOffset + e.deltaY * 0.5),
            );
            this.onDirtyCallback?.();
          },
          { passive: false },
        );
      }
    } else if (!this.featureRenderer && gl) {
      this.featureRenderer = new FeatureRenderer(gl);
      // Pre-load texture for diamond plot type
      if (this.config.plot === "diamond") {
        this.featureRenderer.textures
          .loadDiamond(DIAMOND_TEXTURE_URL)
          .then(() => {
            this.onDirtyCallback?.();
          })
          .catch((err) =>
            logger.error(
              `[ChannelView] ${this.config.name} lazy texture error:`,
              err,
            ),
          );
      }
      // Load ele_grays for high-quality mode
      if (this.context.renderMode === "high") {
        this.featureRenderer.textures
          .loadEleGrays(ELE_GRAYS_TEXTURE_URL)
          .then(() => this.onDirtyCallback?.())
          .catch((err) =>
            logger.warn(
              `[ChannelView] ${this.config.name} ele_grays texture error:`,
              err,
            ),
          );
      }
      if (this.data.length > 0) {
        const initData = this.getParentDisplayData(this.data);
        let initMax: number | undefined;
        let initColors = this.normalizeColorsForRenderer();
        if (
          this.config.plot === "score_rect" ||
          this.config.plot === "score_curve"
        ) {
          if (this._isSubChannel && this._globalScoreRange) {
            // Sub-channel: use global range for consistent colormap
            initMax = this._globalScoreRange[1];
            initColors = {
              ...initColors,
              range: [this._globalScoreRange[0], this._globalScoreRange[1]],
            };
          } else if (!this._isSubChannel) {
            const scores = initData
              .map((f: any) => f.score ?? 0)
              .filter(isFinite);
            if (scores.length > 0) initMax = Math.max(...scores);
          }
        }
        this.featureRenderer.updateData(
          gl,
          initData,
          this.config.plot || "rect",
          {
            chr: "unknown",
            start: this.dataRegion.start,
            end: this.dataRegion.end,
          },
          initColors,
          this.foregroundColor,
          initMax,
        );
      }
    }

    // Render background
    this.genericView.renderBackground(this.buildRenderContext(state));

    // ── Error state: hide all zoom hints and skip feature rendering ────
    if (this.state.status === ChannelStatus.Error) {
      this.scrollUI.hideAllZoomHints();
      return;
    }

    // ── Diamond / Motif: zoom-out hint ─────────────────────────────────
    const isDiamondOrMotif =
      this.config.plot === "diamond" || this.config.plot === "motif";

    // ── Render features ───────────────────────────────────────────────
    // Always render parent features, even when expanded, so the parent's
    // small strip shows its signal alongside the sub-channel split.

    if (isDiamondOrMotif) {
      const domLength = state.domain.end - state.domain.start;
      const aboveZoom = this.isAboveDetailZoom(domLength);

      if (aboveZoom) {
        // Show zoom hint overlay
        if (!this._diamondMotifZoomHintEl) {
          const hint = document.createElement("div");
          hint.className = "dm-zoom-hint";
          hint.style.cssText = [
            "position:absolute",
            "inset:0",
            "display:flex",
            "align-items:center",
            "justify-content:center",
            "font-size:12px",
            "color:#999",
            "pointer-events:none",
            "user-select:none",
            "font-family:Calibre,Roboto,Helvetica,sans-serif",
          ].join(";");
          this.trackContainer?.appendChild(hint);
          this._diamondMotifZoomHintEl = hint;
        }
        this._diamondMotifZoomHintEl.textContent = "Zoom in to view details";
        this._diamondMotifZoomHintEl.style.display = "flex";
        // Skip rendering features — just show the hint
      } else {
        // Hide zoom hint when zoomed in enough
        if (this._diamondMotifZoomHintEl) {
          this._diamondMotifZoomHintEl.style.display = "none";
        }
        // Render features
        if (this.config.plot === "motif") {
          this.motifView.render(this.buildRenderContext(state));
        } else if (this.featureRenderer) {
          // When showName is active, shrink rect by increasing bottom padding
          const savedPadBot1 = this.paddingBottom;
          if (this._showName) this.paddingBottom += 0.3;
          this.genericView.renderFeatures(this.buildRenderContext(state));
          this.rectOverlayView.renderStrand(this.buildRenderContext(state));
          this.paddingBottom = savedPadBot1;
          if (this._showName)
            this.rectOverlayView.renderName(this.buildRenderContext(state));
        }
      }
    } else if (isTranscript) {
      const ctx = this.buildRenderContext(state);
      this.transcriptView.renderFeatures(ctx);
      this.transcriptView.renderLabels(ctx);
    } else if (isBam) {
      const ctx = this.buildRenderContext(state);
      this.bamView.renderFeatures(ctx);
      this.bamView.render(ctx);
    } else if (isVariant) {
      const ctx = this.buildRenderContext(state);
      this.variantView.renderFeatures(ctx);
      this.variantView.render(ctx);
    } else if (isScoreCurve) {
      // score_curve: arcs rendered to offscreen canvas & blitted to WebGL.
      // ── Generic detailZoom guard ─────────────────────────────────────────
      const domLen = state.domain.end - state.domain.start;
      if (this.detailZoomThreshold > 0 && this.isAboveDetailZoom(domLen)) {
        this.scrollUI.showGenericZoomHint();
      } else {
        this.scrollUI.hideGenericZoomHint();
        this.scoreCurveView.render(this.buildRenderContext(state));
      }
    } else if (this.featureRenderer) {
      // ── Generic detailZoom guard ─────────────────────────────────────────
      // Sequence plot has its own zoom hint ("Zoom in to view sequence")
      // rendered by SequenceView), so skip the generic one.
      const isSeq = this.config.plot === "sequence";
      const domLen = state.domain.end - state.domain.start;
      if (
        !isSeq &&
        this.detailZoomThreshold > 0 &&
        this.isAboveDetailZoom(domLen)
      ) {
        this.scrollUI.showGenericZoomHint();
      } else if (isSeq && this.isAboveDetailZoom(domLen)) {
        // Sequence above detailZoom: skip WebGL rects entirely so the
        // "Zoom in to view sequence" hint (rendered by SequenceView)
        // is visible against a clean background.
        this.scrollUI.hideGenericZoomHint();
      } else {
        this.scrollUI.hideGenericZoomHint();
        // Intron backbone must be drawn BEFORE exon rects so it sits behind them
        const rectPlot = this.config.plot || "rect";
        // When showName is active, shrink rect by increasing bottom padding
        const savedPadBot2 = this.paddingBottom;
        if (this._showName) this.paddingBottom += 0.3;
        if (rectPlot === "rect") {
          this.rectOverlayView.renderIntronBackbone(
            this.buildRenderContext(state),
          );
        }
        this.genericView.renderFeatures(this.buildRenderContext(state));
        // Strand direction arrows for rect features.
        // For buildin transcript channels, arrows are already handled by RectOverlayView
        // (unified on both intron gaps AND exon blocks)
        // to avoid duplicates from overlapping features (exon/CDS/UTR).
        if (rectPlot === "rect") {
          const isBuildinTx =
            this.config.data &&
            (this.config.data as any).method === "buildin" &&
            (this.config.data as any).format === "transcript";
          if (!isBuildinTx) {
            this.rectOverlayView.renderStrand(this.buildRenderContext(state));
          }
        }
        this.paddingBottom = savedPadBot2;
        if (this._showName)
          this.rectOverlayView.renderName(this.buildRenderContext(state));
      }
    } else {
      logger.warn(`[ChannelView] ${this.config.name} has no featureRenderer!`);
    }

    // Sequence plot: draw base-letter overlay when zoomed in enough
    if (this.config.plot === "sequence") {
      this.sequenceView.render(this.buildRenderContext(state));
    }

    // ── Stacked rendering: overlay other group members ───────────────
    if (this._stackedChannels.length > 0) {
      this.genericView.renderStackedOverlays(this.buildRenderContext(state));
    }

    // Render expanded sub-channel group (if any)
    if (this._expandGroupView) {
      this._expandGroupView.render(state);
    }
  }

  /**
   * Update data from worker.
   * Uses async yielding to avoid blocking the main thread during transforms.
   */
  async updateData(
    data: any[],
    region?: { chr?: string; start: number; end: number },
  ) {
    this.data = data;
    if (region) {
      this.dataRegion = {
        chr: region.chr ?? this.dataRegion.chr,
        start: region.start,
        end: region.end,
      };
    }

    // Proactively detect UCSC Key=Value patterns
    this.tryAutoDetectStyle();
    this.tryAutoExpand();

    this.setState({
      status: ChannelStatus.Completed,
      loadedRecords: data.length,
    });

    if (this.featureRenderer && this.context.gl) {
      this.featureRenderer.updateData(
        this.context.gl,
        data,
        this.config.plot || "rect",
        {
          chr: "unknown",
          start: this.dataRegion.start,
          end: this.dataRegion.end,
        },
        this.normalizeColorsForRenderer(),
        this.foregroundColor,
      );
    }

    // Yield before heavy transforms
    await this.yieldToMain();

    // Transcript transform
    const isTranscript =
      this.config.plot === "transcript" || this.config.plot === "rna";
    if (isTranscript && data.length > 0) {
      const txRecords = transformGffToTranscripts(data);
      const { transcripts: laid, maxLane } = assignLanes(txRecords);
      if (laid.length > 0) {
        this._transcriptRecords = laid;
        this._transcriptLaneCount = maxLane + 1;
        // this._txDataDirty = true;
      }
      // Extract modification records (m6A, m5C, etc.)
      this._modificationRecords = extractModifications(data);
    } else if (this.config.plot === "simple_rna" && data.length > 0) {
      const records = data.filter((d: any) => d._buildinTranscript);
      if (records.length > 0) {
        this._transcriptRecords = records;
        this._transcriptLaneCount = 1;
        // this._txDataDirty = true;
      }
    }

    // Yield before BAM lane assignment
    await this.yieldToMain();

    // BAM lane assignment
    if (this.config.plot === "bam" && data.length > 0) {
      if ((data[0] as any)?._txRemapped) {
        const reads = data as any[];
        let maxLane = 0;
        for (const r of reads) if (r.lane > maxLane) maxLane = r.lane;
        this._bamReads = reads;
        this._bamLaneCount = maxLane + 1;
      } else {
        const rawReads = data.map((rec: any) => ({
          start: rec.start ?? rec.chromStart ?? 0,
          end: rec.end ?? rec.chromEnd ?? 0,
          strand: rec.strand ?? 1,
          readName: rec.name ?? rec.readName ?? undefined,
          readLength:
            rec.seq_length ?? rec.readLength ?? rec.length_on_ref ?? undefined,
          flags: rec.flags ?? undefined,
          mapq: rec.mq ?? rec.mapq ?? rec.mappingQuality ?? undefined,
          cigar: rec.CIGAR ?? rec.cigar ?? undefined,
          seq: rec.seq ?? rec.sequence ?? undefined,
          qual: rec.qual ?? undefined,
          tags: rec.tags ?? rec._tags ?? undefined,
        }));
        const { reads, maxLane } = assignBamLanes(rawReads, 0);
        this._bamReads = reads;
        this._bamLaneCount = maxLane + 1;
      }
    }

    // Mark renderer as dirty to trigger re-render
    this.onDirtyCallback?.();
  }

  /** Destroy channel view. */
  destroy() {
    this.label.destroy();
    this._destroyed = true;

    // Drop from registries so stale instances never linger.
    ChannelView._allInstances.delete(this);
    ChannelSelector.onChannelDestroyed(this);

    // Cancel any pending async data update
    if (this._pendingUpdateFrame) {
      cancelAnimationFrame(this._pendingUpdateFrame);
      this._pendingUpdateFrame = 0;
    }
    // Remove from global processing queue so stale channels never run
    ChannelView._channelQueue.delete(this);
    // Bump generation so any in-flight async update aborts
    this._dataGeneration++;

    this.featureRenderer?.destroy();
    this.featureRenderer = null;
    this.screenManager?.destroy();
    this.screenManager = null;
    this.statusDisplay.destroy();
    if (this.loadingRenderer) {
      this.loadingRenderer.destroy();
      this.loadingRenderer = null;
    }
    // Destroy expand group if present
    if (this._expandGroupView) {
      this._expandGroupView.destroy();
      this._expandGroupView = null;
    }
    // Release offscreen score-curve canvas
    if (this._scoreCurveCanvas) {
      this._scoreCurveCanvas = null;
    }
    // Clean up zoom hint overlays
    if (this._diamondMotifZoomHintEl) {
      this._diamondMotifZoomHintEl.remove();
      this._diamondMotifZoomHintEl = null;
    }
    if (this._genericZoomHintEl) {
      this._genericZoomHintEl.remove();
      this._genericZoomHintEl = null;
    }
    if (this.trackContainer && this.trackContainer.parentElement) {
      this.trackContainer.parentElement.removeChild(this.trackContainer);
      this.trackContainer = null;
    }
  }

  /** Foreground color (from annotation.foreground, defaults to #747d8c). */
  get foregroundColor(): string {
    return this._foregroundColor;
  }

  /** Set foreground color (overrides the config-derived color). */
  set foregroundColor(color: string) {
    this._foregroundColor = color;
    this.onDirtyCallback?.();
  }

  /** Background color (from annotation.background, defaults to #ffffff). */
  get backgroundColor(): string {
    return this._backgroundColor;
  }

  /** Set background color (overrides config-derived color; persisted to config). */
  set backgroundColor(color: string) {
    this._backgroundColor = color;
    const style = this.ensureMutableStyle();
    style.background = color;
    this.onDirtyCallback?.();
  }

  /**
   * Set or clear the CDS coordinate mapper.
   * When set (non-null), the channel will transform all feature data from
   * genomic coordinates to CDS coordinates before GPU upload.
   * When cleared (null), normal genomic rendering resumes.
   */
  setCdsMapper(mapper: CDSCoordinateMapper | null): void {
    this._cdsMapper = mapper;
    // Re-process cached data with (or without) the CDS transformation
    if (this.screenManager) {
      this.dataPipeline.updateDataFromCacheAsync();
    }
  }

  /**
   * Toggle complement strand display for sequence channels.
   * Swaps base colors (GPU) and letter overlay.
   */
  toggleComplementStrand(): void {
    this._isComplementStrand = !this._isComplementStrand;
    // Sync to feature renderer so GPU colors are correct
    if (this.featureRenderer) {
      this.featureRenderer.complementMode = this._isComplementStrand;
    }
    // Re-upload data with new colors
    if (this.featureRenderer && this.context.gl && this.data.length > 0) {
      this.featureRenderer.updateData(
        this.context.gl,
        this.data,
        this.config.plot || "rect",
        {
          chr: "unknown",
          start: this.dataRegion.start,
          end: this.dataRegion.end,
        },
        this.normalizeColorsForRenderer(),
        this.foregroundColor,
      );
    }
    // Rebuild label so the arrow icon reflects the new strand direction.
    // The track menu and the label icon both read `_isComplementStrand`, so
    // refreshing the label keeps both UIs in sync regardless of which
    // entry point triggered the toggle.
    this.label.createChannelLabel();
    // Mark dirty to trigger re-render (which re-draws the letter overlay)
    this.onDirtyCallback?.();
  }

  /** Whether complement strand is currently shown. */
  get isComplementStrand(): boolean {
    return this._isComplementStrand;
  }

  /**
   * Re-upload feature data to GPU with current color settings.
   * Call this after changing foreground / colormap so the existing
   * data is re-rendered with the new colours without a full data reload.
   */
  refreshGpuColors(): void {
    if (!this.featureRenderer || !this.context.gl || this.data.length === 0) {
      return;
    }
    const plot = this.config.plot || "rect";
    // Transcript, BAM, variant, sequence read colours each frame — no GPU re-upload needed
    if (
      plot === "transcript" ||
      plot === "rna" ||
      plot === "simple_rna" ||
      plot === "score_curve" ||
      plot === "bam" ||
      plot === "variant" ||
      plot === "sequence" ||
      plot === "motif"
    ) {
      // Invalidate score_curve canvas cache so it re-reads foreground config
      if (plot === "score_curve") {
        this._scoreCurveCacheDomain = null;
      }
      return;
    }
    // Score plots (bar/bigwig/heatmap/line/point/diamond): only re-upload colour buffer,
    // leaving geometry (bar heights, positions) completely unchanged.
    this.featureRenderer.refreshColorsOnly(
      this.context.gl,
      this.data,
      plot,
      this.normalizeColorsForRenderer(),
      this.foregroundColor,
      this.lastStableMaxScore > 0 ? this.lastStableMaxScore : undefined,
    );
  }

  /** The channel name. */
  get name(): string {
    return this.config.name;
  }

  /** Set the channel name. */
  set name(value: string) {
    this.config.name = value;
    this.statusDisplay = new StatusDisplay(value); // Update status display
    this.onDirtyCallback?.();
  }

  /**
   * The offscreen canvas used for score_curve arc rendering, or null when
   * this channel does not use that plot type.  Content is blitted to the
   * main WebGL canvas via featureRenderer.renderOverlayTexture().
   */
  get arcCanvas(): HTMLCanvasElement | null {
    return this._scoreCurveCanvas;
  }

  /**
   * Force-render the score_curve arc canvas for the current data and domain.
   * Used by the export pipeline: when a score_curve parent channel is expanded,
   * its own `ScoreCurveView` render is normally skipped (sub-channels handle
   * it). Calling this method before capturing the canvas ensures the parent
   * arc overlay is up-to-date for export.
   */
  ensureArcCanvasRendered(domain: { start: number; end: number }): void {
    if (this.config.plot !== "score_curve") return;
    this.scoreCurveView.render(this.buildRenderContext({ domain }));
  }

  /** The channel group name. */
  get groupName(): string | undefined {
    return this.config.group?.name;
  }

  /** Set the channel group name. */
  set groupName(value: string | undefined) {
    if (!this.config.group) {
      this.config.group = { name: value || "" };
    } else {
      this.config.group.name = value || "";
    }
    this.onDirtyCallback?.();
  }

  /** The channel group style color. */
  get groupColor(): string | undefined {
    return this.config.group?.style?.color;
  }

  /** Set the channel group style color. */
  set groupColor(value: string | undefined) {
    if (!this.config.group) {
      this.config.group = { name: "", style: { color: value || "" } };
    } else if (!this.config.group.style) {
      this.config.group.style = { color: value || "" };
    } else {
      this.config.group.style.color = value || "";
    }
    this.onDirtyCallback?.();
  }

  /** Current in-memory data records (for export / download). */
  getData(): any[] {
    return this.data ?? [];
  }

  /**
   * Get the raw (pre-binned) data records from the screen data manager.
   * For score-type plots (bar, bigwig, etc.) the rendering data stored in
   * `this.data` has been through `generateBinnedFeatures` and may contain
   * fractional start/end values.  This method returns the **original** records
   * fetched from the data source so that exported files contain faithful
   * genomic coordinates.
   *
   * Falls back to `getData()` when the screen manager is not available or
   * has no cached tiles (e.g. for built-in data formats).
   */
  getRawData(): any[] {
    if (!this.screenManager) return this.getData();
    const state = this.screenManager.getState();
    if (!state || state.data.size === 0) return this.getData();

    const records: any[] = [];
    for (const [, tileRecords] of state.data) {
      for (const rec of tileRecords) {
        records.push(rec);
      }
    }
    return records.length > 0 ? records : this.getData();
  }

  /** The current data region (chr, start, end). */
  getDataRegion(): { chr: string; start: number; end: number } {
    return { ...this.dataRegion };
  }

  /** The plot type of this channel. */
  get plotType(): string {
    return this.config.plot || "rect";
  }

  /** Whether this channel is pinned (sticky) at the top. */
  override get isPinned(): boolean {
    return this.config.style?.pinned === true;
  }

  /** Set the pinned state. */
  set isPinned(value: boolean) {
    const changed =
      this.isPinned !== value ||
      (!!this.trackContainer &&
        this.trackContainer.dataset.pinned !== String(value));
    const style = this.ensureMutableStyle();
    style.pinned = value;
    // Keep data-pinned attribute in sync for drag-sort filtering
    if (this.trackContainer) {
      this.trackContainer.dataset.pinned = value ? "true" : "false";
    }
    if (changed && this.channelLabelEl) this.label.createChannelLabel();
  }

  /**
   * Set scroll clip region for global scroll clipping.
   * Intersected with _clipBounds (sub-channel scroll) in the effective clip.
   */
  override setScrollClip(clip: { y: number; height: number } | null): void {
    this._scrollClipBounds = clip;
  }

  /**
   * Inset (CSS px) for sub-channel scrollbars to avoid overlapping the
   * browser-level channel scrollbar.
   */
  private _scrollbarInset: number = 0;

  /**
   * Set the right-side inset for sub-channel scrollbars.
   * Updates existing scrollbar DOM elements immediately.
   */
  override setScrollbarInset(px: number): void {
    this._scrollbarInset = px;
    this._applyScrollbarInset();
  }

  /**
   * Apply `_scrollbarInset` to all sub-channel scrollbar tracks.
   *
   * tx / bam / variant scrollbars live inside the trackContainer which
   * already has `right: _scrollbarInset`.  They only need a small
   * constant offset (2 px) so they don't touch the trackContainer edge.
   * The SubChannelGroupView scrollbar lives inside the groupContainer
   * which has `right: 0`, so it gets the full `_scrollbarInset`.
   */
  private _applyScrollbarInset(): void {
    if (this._expandGroupView) {
      this._expandGroupView.setScrollbarInset(this._scrollbarInset);
    }
    // Inner scrollbars: small constant (trackContainer already inset)
    const inner = "2px";
    if (this._txScrollTrack) this._txScrollTrack.style.right = inner;
    if (this._bamScrollTrack) this._bamScrollTrack.style.right = inner;
    if (this._variantScrollTrack) this._variantScrollTrack.style.right = inner;
  }

  /**
   * Compute the effective clip bounds (intersection of _clipBounds and
   * _scrollClipBounds). Returns null if no clipping is needed.
   */
  getEffectiveClip(): { y: number; height: number } | null {
    const a = this._clipBounds;
    const b = this._scrollClipBounds;
    if (!a && !b) return null;
    if (!a) return b;
    if (!b) return a;
    // Intersection of the two clip rects
    const top = Math.max(a.y, b.y);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    if (bottom <= top) return { y: 0, height: 0 }; // fully clipped
    return { y: top, height: bottom - top };
  }

  /** The full channel config (read-only access for export). */
  getChannelConfig(): IChannel {
    return this.config;
  }

  /** Current score range [min, max], or null if no score data. */
  getScoreRange(): [number, number] | null {
    return this._lastScoreRange;
  }

  /**
   * Get the channel's OWN visible-window data range [min, max], independent
   * of any group / autoscale shared range currently applied. Falls back to
   * the last score range when an own range hasn't been captured yet.
   */
  getOwnScoreRange(): [number, number] | null {
    return this._ownScoreRange ?? this._lastScoreRange;
  }

  /**
   * Set a shared score range imposed by group.number coordination.
   * When set, the channel re-uploads GPU data with this range so that
   * all channels in the same group share a common visual scale.
   *
   * @param force  Re-upload even when the range is unchanged. Needed after a
   *               data reload (pan / zoom) where the GPU buffer was just
   *               re-uploaded with the channel's own scale.
   */
  setGroupScoreRange(range: [number, number] | null, force = false): void {
    // Skip if the range hasn't changed (unless forced)
    if (
      !force &&
      this._groupScoreRange &&
      range &&
      this._groupScoreRange[0] === range[0] &&
      this._groupScoreRange[1] === range[1]
    ) {
      return;
    }
    const hadRange = this._groupScoreRange !== null;
    this._groupScoreRange = range;
    // Persist the autoscale range so the constraint survives config
    // export / import and channel re-creation.
    if (this.config.group?.autoscale) {
      if (range) this.config.group.autoscaleRange = [range[0], range[1]];
      else delete this.config.group.autoscaleRange;
    }
    if (!range) {
      // The group constraint was just removed — immediately restore the
      // channel's OWN current-region data min/max scale (the GPU buffer is
      // still holding the shared range, so re-upload with the local scale).
      if (hadRange || force) this.reuploadOwnScale();
      return;
    }

    // Re-upload GPU data with the shared max
    if (this.featureRenderer && this.context.gl && this.data.length > 0) {
      const displayData = this.getParentDisplayData(this.data);
      const colors = {
        ...this.normalizeColorsForRenderer(),
        range: [range[0], range[1]] as [number, number],
      };
      this.featureRenderer.updateData(
        this.context.gl,
        displayData,
        this.config.plot || "rect",
        {
          chr: this.dataRegion.chr,
          start: this.dataRegion.start,
          end: this.dataRegion.end,
        },
        colors,
        this.foregroundColor,
        range[1],
      );
    }
    // Update score label to reflect the shared range
    this.updateScoreLabel(range[0], range[1]);
    this.onDirtyCallback?.();
  }

  /**
   * Re-upload GPU data using this channel's OWN current-region data scale
   * (its last-computed [min, max]). Used when a Group Autoscale constraint
   * is cancelled so the channel snaps straight back to its local scale
   * without waiting for the next data reload.
   */
  private reuploadOwnScale(): void {
    if (!this.featureRenderer || !this.context.gl || this.data.length === 0) {
      return;
    }
    const own = this._ownScoreRange ?? this._lastScoreRange;
    const displayData = this.getParentDisplayData(this.data);
    const uploadMax = own && own[1] > 0 ? own[1] : undefined;
    this.featureRenderer.updateData(
      this.context.gl,
      displayData,
      this.config.plot || "rect",
      {
        chr: this.dataRegion.chr,
        start: this.dataRegion.start,
        end: this.dataRegion.end,
      },
      this.normalizeColorsForRenderer(),
      this.foregroundColor,
      uploadMax,
    );
    if (own) this.updateScoreLabel(own[0], own[1]);
    this.onDirtyCallback?.();
  }

  // ── Stacked group API ──────────────────────────────────────────────

  /**
   * Set the list of channels whose data this host should overlay.
   * Called by `syncStackedGroups()` in the renderer.
   */
  setStackedChannels(channels: ChannelView[]): void {
    this._stackedChannels = channels;
  }

  /** Get the list of channels stacked onto this host. */
  getStackedChannels(): ChannelView[] {
    return this._stackedChannels;
  }

  /** Public accessor for the feature renderer so the host can call
   *  `render()` on stacked channels' renderers. */
  getFeatureRenderer() {
    return this.featureRenderer;
  }

  /** Public accessor for foreground color. */
  getForegroundColor(): string {
    return this.foregroundColor;
  }

  // ── SVG-export accessors ──────────────────────────────────────────

  /** Padding ratios (fraction of channel height). */
  getPadding(): { top: number; bottom: number } {
    return { top: this.paddingTop, bottom: this.paddingBottom };
  }

  /** Transcript records with lane assignments (for SVG export). */
  getTranscriptRecords(): TranscriptRecord[] {
    return this._transcriptRecords;
  }

  /** Whether "Show name" is active for rect/diamond channels. */
  getShowName(): boolean {
    return this._showName;
  }

  /** Number of transcript lanes. */
  getTranscriptLaneCount(): number {
    return this._transcriptLaneCount;
  }

  /** Total virtual content height of the transcript area (CSS px). */
  getTranscriptTotalHeightCSS(): number {
    return this.txTotalContentHeightCSS;
  }

  /** Current transcript scroll offset (CSS px). */
  getTranscriptScrollOffset(): number {
    return this._txScrollOffset;
  }

  /** BAM lane-assigned read records (for SVG export). */
  getBamRecords(): Array<{
    start: number;
    end: number;
    strand: number;
    lane: number;
    [key: string]: any;
  }> {
    return this._bamReads;
  }

  /** Number of BAM lanes. */
  getBamLaneCount(): number {
    return this._bamLaneCount;
  }

  /** BAM total content height (CSS px). */
  getBamTotalHeightCSS(): number {
    return this.bamTotalContentHeightCSS;
  }

  /** Current BAM scroll offset (CSS px). */
  getBamScrollOffset(): number {
    return this._bamScrollOffset;
  }

  /** Whether BAM coverage histogram is enabled. */
  isBamCoverageEnabled(): boolean {
    return this.bamCoverageEnabled;
  }

  /** BAM coverage height fraction of content area. */
  getBamCoverageHeightFrac(): number {
    return this.bamCoverageHeightFrac;
  }

  /** Variant records with lane assignments (for SVG export). */
  getVariantRecords(): Array<{
    start: number;
    end: number;
    ref: string;
    alt: string[];
    altDisplay: string;
    lane: number;
    [key: string]: any;
  }> {
    return this._variantRecords;
  }

  /** Number of variant lanes. */
  getVariantLaneCount(): number {
    return this._variantLaneCount;
  }

  /** Variant total content height (CSS px). */
  getVariantTotalHeightCSS(): number {
    return this.variantTotalContentHeightCSS;
  }

  /** Current variant scroll offset (CSS px). */
  getVariantScrollOffset(): number {
    return this._variantScrollOffset;
  }

  /** BAM coverage max depth (for score label). */
  getBamCoverageMax(): number {
    return this._bamCoverageMax;
  }

  /** Set the transcript scroll offset (for export — will be clamped on next render). */
  setTranscriptScrollOffset(v: number): void {
    this._txScrollOffset = v;
  }

  /**
   * Show or hide the channel name label.
   * When hidden the label DOM element is removed; when shown it is
   * re-created.  Also propagated to sub-channels.
   */
  setChannelLabelEnabled(enabled: boolean): void {
    this.channelLabelConfig = { ...this.channelLabelConfig, enabled };
    if (enabled) {
      this.label.createChannelLabel();
    } else if (this.channelLabelEl) {
      this.channelLabelEl.remove();
      this.channelLabelEl = null;
    }
    // Propagate to sub-channels
    if (this._subChannels) {
      for (const sub of this._subChannels) {
        sub.setChannelLabelEnabled(enabled);
      }
    }
  }

  /** Whether transcript content exceeds the visible channel height. */
  getTranscriptNeedsScroll(): boolean {
    const dpr = window.devicePixelRatio || 1;
    const paddingTopPx = Math.round(this.height * this.paddingTop);
    const paddingBottomPx = Math.round(this.height * this.paddingBottom);
    const contentHeight = this.height - paddingTopPx - paddingBottomPx;
    const channelCSS = contentHeight / dpr;
    // Use pure lane height so bottom padding doesn't trigger a spurious scrollbar
    return this.txPureLaneHeightCSS > channelCSS;
  }

  /** Content area height in CSS px (channel height minus padding). */
  getContentHeightCSS(): number {
    const dpr = window.devicePixelRatio || 1;
    const paddingTopPx = Math.round(this.height * this.paddingTop);
    const paddingBottomPx = Math.round(this.height * this.paddingBottom);
    return (this.height - paddingTopPx - paddingBottomPx) / dpr;
  }

  /**
   * Set the WebGL render bounds without touching any DOM elements.
   * Used during export capture to reposition a sub-channel in canvas space
   * without visually shifting its label / track container.
   */
  setRenderBounds(x: number, y: number, width: number, height: number): void {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  // ── Alt+wheel vertical content scrolling ────────────────────────────

  /**
   * Scroll this channel's content vertically by `deltaY` pixels.
   * Used when the user holds Alt and scrolls.
   * Returns `true` if the channel handled the scroll (has scrollable content).
   */
  altWheelScroll(deltaY: number): boolean {
    const plot = this.plotType;
    const dpr = window.devicePixelRatio || 1;

    // Transcript / RNA / Simple-RNA (single transcript from buildin API)
    if (plot === "transcript" || plot === "rna" || plot === "simple_rna") {
      if (!this.txNeedsScroll) {
        return this.altWheelScrollExpandGroup(deltaY);
      }
      const channelCSS = this.getContentHeightCSS();
      const maxScroll = Math.max(0, this.txTotalContentHeightCSS - channelCSS);
      this._txScrollOffset = Math.max(
        0,
        Math.min(maxScroll, this._txScrollOffset + deltaY * 0.5),
      );
      this.onDirtyCallback?.();
      return true;
    }

    // BAM
    if (plot === "bam") {
      if (!this.bamNeedsScroll) {
        return this.altWheelScrollExpandGroup(deltaY);
      }
      const paddingTopPx = Math.round(this.height * this.paddingTop);
      const paddingBottomPx = Math.round(this.height * this.paddingBottom);
      const fullContentHeight = this.height - paddingTopPx - paddingBottomPx;
      const coverageHeightPx = this.bamCoverageEnabled
        ? Math.round(fullContentHeight * this.bamCoverageHeightFrac)
        : 0;
      const readsCSS = (fullContentHeight - coverageHeightPx) / dpr;
      const maxScroll = Math.max(0, this.bamTotalContentHeightCSS - readsCSS);
      this._bamScrollOffset = Math.max(
        0,
        Math.min(maxScroll, this._bamScrollOffset + deltaY * 0.5),
      );
      this.onDirtyCallback?.();
      return true;
    }

    // Variant
    if (plot === "variant") {
      if (!this.variantNeedsScroll) {
        return this.altWheelScrollExpandGroup(deltaY);
      }
      const channelCSS = this.height / dpr;
      const maxScroll = Math.max(
        0,
        this.variantTotalContentHeightCSS - channelCSS,
      );
      this._variantScrollOffset = Math.max(
        0,
        Math.min(maxScroll, this._variantScrollOffset + deltaY * 0.5),
      );
      this.onDirtyCallback?.();
      return true;
    }

    // For other plot types, try scrolling parent's expanded group
    return this.altWheelScrollExpandGroup(deltaY);
  }

  /**
   * Try scrolling the parent channel's expand group (SubChannelGroupView).
   * Returns `true` if scroll was handled.
   */
  private altWheelScrollExpandGroup(deltaY: number): boolean {
    // If this is a sub-channel, scroll the parent's expand group
    if (this._isSubChannel && this._parentChannel?._expandGroupView) {
      return this._parentChannel._expandGroupView.altWheelScroll(deltaY);
    }
    // If this channel is expanded, scroll its own expand group
    if (this._isExpanded && this._expandGroupView) {
      return this._expandGroupView.altWheelScroll(deltaY);
    }
    return false;
  }

  /**
   * Ensure `this.config.style` is a mutable (unfrozen) object.
   * Creates it if absent; shallow-clones it if frozen.
   *
   * In production builds, Rollup / Terser may inline frozen module-level
   * objects into `lodash.merge` results, leaving `this.config.style`
   * read-only despite the deep-clone in the constructor.  This helper
   * guarantees that all subsequent property writes succeed.
   */
  public ensureMutableStyle(): Record<string, any> {
    if (!this.config.style) {
      (this.config as any).style = {};
    } else if (Object.isFrozen(this.config.style)) {
      (this.config as any).style = { ...this.config.style };
    }
    return this.config.style as Record<string, any>;
  }

  /** The channel style keys. */
  get styleKeys(): string[] | undefined {
    return this.config.style?.keys;
  }

  /** Set the channel style keys. */
  set styleKeys(value: string[] | undefined) {
    const style = this.ensureMutableStyle();
    style.keys = value;
    this.onDirtyCallback?.();
  }

  /** The channel style expand. */
  get styleExpand(): string | string[] | undefined {
    return this.config.style?.expand;
  }

  /** Set the channel style expand. */
  set styleExpand(value: string | string[] | undefined) {
    const style = this.ensureMutableStyle();
    style.expand = value;
    this.onDirtyCallback?.();
  }

  /**
   * Normalize `style.expand` to an array.
   * - `undefined` → `[]`
   * - `"Biosample"` → `["Biosample"]`
   * - `["Biosample", "Method"]` → `["Biosample", "Method"]`
   */
  public normalizeExpandFields(): string[] {
    const expand = this.config.style?.expand;
    if (!expand) return [];
    return Array.isArray(expand) ? expand : [expand];
  }

  /** The channel style separator. */
  get styleSep(): string | undefined {
    return this.config.style?.sep;
  }

  /** Set the channel style separator. */
  set styleSep(value: string | undefined) {
    const style = this.ensureMutableStyle();
    style.sep = value;
    this.onDirtyCallback?.();
  }

  /** The channel style order (tooltip display order). */
  get styleOrder(): string[] | undefined {
    return this.config.style?.order;
  }

  /** Set the channel style order. */
  set styleOrder(value: string[] | undefined) {
    const style = this.ensureMutableStyle();
    style.order = value;
    this.onDirtyCallback?.();
  }

  /** The channel filter. */
  get filter(): string | undefined {
    return this.config.filter;
  }

  /** Set the channel filter. */
  set filter(value: string | undefined) {
    this.config.filter = value;
    this.onDirtyCallback?.();
  }

  /** The channel order. */
  get order(): number | undefined {
    return this.config.order;
  }

  /** Set the channel order. */
  set order(value: number | undefined) {
    this.config.order = value;
    this.onDirtyCallback?.();
  }

  /** Whether the channel is sortable. */
  get sortable(): boolean {
    return this.config.sortable !== undefined ? this.config.sortable : true;
  }

  /** Set whether the channel is sortable. */
  set sortable(value: boolean) {
    this.config.sortable = value;
    this.onDirtyCallback?.();
  }

  // ── Expand / collapse API ──────────────────────────────────────────

  /** Whether this channel has sub-channels and is currently expanded. */
  get isExpanded(): boolean {
    return this._isExpanded;
  }

  /** Whether this channel is a sub-channel spawned by expand. */
  get isSubChannel(): boolean {
    return this._isSubChannel;
  }

  /** The parent channel (null for top-level channels). */
  get parentChannel(): ChannelView | null {
    return this._parentChannel;
  }

  /** The expand-field value this sub-channel filters on (`null` for parent). */
  get expandFilterValue(): string | null {
    return this._expandFilterValue;
  }

  /** Current sub-channels (empty when collapsed). */
  get subChannels(): readonly ChannelView[] {
    return this._subChannels;
  }

  /**
   * Get sample label colour strips for a sub-channel (for SVG export).
   * Delegates to the expand group view which manages the colour assignment.
   * Returns an empty array if no expand group or no expand fields.
   */
  getSampleLabelColors(
    sub: ChannelView,
  ): { field: string; value: string; color: string }[] {
    if (!this._expandGroupView) return [];
    return this._expandGroupView.getSampleLabelColors(sub);
  }

  /**
   * Get sample label strip width in CSS px (for SVG export).
   * Returns 0 if no expand group.
   */
  getSampleLabelWidth(): number {
    if (!this._expandGroupView) return 0;
    return this._expandGroupView.getSampleLabelWidth();
  }

  /** Whether this channel has a non-empty `expand` field configured. */
  get canExpand(): boolean {
    const fields = this.normalizeExpandFields();
    return fields.length > 0;
  }

  /**
   * For expandable parent channels that carry BOTH aggregate features
   * (flagged `_parentAggregate: true`) AND per-sub-channel features,
   * return only the aggregate features for the parent GPU render.
   *
   * Sub-channels always receive pre-filtered data (no aggregates) so
   * this filter is a no-op for `_isSubChannel === true` channels.
   *
   * If no feature is marked `_parentAggregate`, return all data unchanged
   * (handles channels that don’t use the aggregate pattern).
   */
  public getParentDisplayData(data: any[]): any[] {
    if (this._isSubChannel || !this.canExpand) return data;
    if (!data.some((f) => f._parentAggregate)) return data;
    return data.filter((f) => f._parentAggregate === true);
  }

  /**
   * Generate binned features for bar/bigwig rendering.
   *
   * Aggregates original features into pixel-sized bins using the configured
   * windowing function (mean/max/min). This reduces rendering load and matches
   * IGV behavior.
   */
  public generateBinnedFeatures(
    features: Array<{ start: number; end: number; score: number }>,
    viewStart: number,
    viewEnd: number,
    viewSpan: number,
  ): any[] {
    if (features.length === 0) return [];

    const windowFn = this.config.data?.windowingFunction ?? "mean";
    const { viewportCSSWidth } = this.getViewportInfo(viewStart, viewEnd);

    // Each bin represents ~1 CSS pixel
    const binCount = Math.min(
      10000,
      Math.max(100, Math.round(viewportCSSWidth)),
    );
    const binWidth = viewSpan / binCount;

    // Initialize bins: each bin holds an array of scores
    const bins: number[][] = Array.from({ length: binCount }, () => []);

    // Distribute features into bins
    for (const feat of features) {
      const fStart = Math.max(feat.start, viewStart);
      const fEnd = Math.min(feat.end, viewEnd);
      if (fStart >= fEnd) continue;

      const binStart = Math.floor((fStart - viewStart) / binWidth);
      const binEnd = Math.floor((fEnd - viewStart) / binWidth);

      for (let b = binStart; b <= Math.min(binEnd, binCount - 1); b++) {
        bins[b].push(feat.score);
      }
    }

    // Generate binned features
    const binnedFeatures: any[] = [];
    for (let i = 0; i < binCount; i++) {
      const binScores = bins[i];
      if (binScores.length === 0) continue;

      let aggValue: number;
      switch (windowFn) {
        case "max":
          aggValue = Math.max(...binScores);
          break;
        case "min":
          aggValue = Math.min(...binScores);
          break;
        case "mean":
        default:
          aggValue = binScores.reduce((a, b) => a + b, 0) / binScores.length;
          break;
      }

      // Create a feature-like object for this bin
      const binStart = viewStart + i * binWidth;
      const binEnd = binStart + binWidth;
      binnedFeatures.push({
        start: binStart,
        end: binEnd,
        chromStart: binStart,
        chromEnd: binEnd,
        score: aggValue,
      });
    }

    return binnedFeatures;
  }

  /**
   * Get viewport dimensions and scaling factors.
   *
   * @returns Viewport info with:
   *   - viewportCSSWidth: CSS pixel width (excluding devicePixelRatio)
   *   - bpPerPx: How many basepairs per CSS pixel
   *   - pxPerBp: How many CSS pixels per basepair
   */
  private getViewportInfo(
    viewStart: number,
    viewEnd: number,
  ): {
    viewportCSSWidth: number;
    bpPerPx: number;
    pxPerBp: number;
  } {
    // Use canvas clientWidth (CSS pixels) if available
    const viewportCSSWidth = this.context.canvas?.clientWidth ?? 1000;
    const viewSpan = viewEnd - viewStart;
    const bpPerPx = viewSpan / viewportCSSWidth;
    const pxPerBp = viewportCSSWidth / viewSpan;

    return { viewportCSSWidth, bpPerPx, pxPerBp };
  }

  // ── Channel context menu ────────────────────────────────────────────

  /** When true, skip the "Too many sub-channels" confirmation dialog. */
  public static _skipExpandConfirm = false;

  /** Currently visible menu element (singleton — only one menu at a time). */
  public static _activeMenu: HTMLElement | null = null;
  /** Listener that closes the menu on outside click. */
  public static _menuOutsideListener: ((e: MouseEvent) => void) | null = null;

  /** All live ChannelView instances (used to pick a free group number, and by
   *  ChannelSelector to order selectable channels). */
  public static _allInstances: Set<ChannelView> = new Set();

  /** Hide any currently active channel menu. */
  public static hideActiveMenu(): void {
    if (ChannelView._activeMenu) {
      ChannelView._activeMenu.remove();
      ChannelView._activeMenu = null;
    }
    if (ChannelView._menuOutsideListener) {
      document.removeEventListener(
        "mousedown",
        ChannelView._menuOutsideListener,
        true,
      );
      ChannelView._menuOutsideListener = null;
    }
  }

  /** Apply (or clear) the selected-label background on this channel. */
  public applySelectionStyle(): void {
    if (!this.channelLabelEl) return;
    if (ChannelSelector._selectedChannels.has(this)) {
      this.channelLabelEl.style.backgroundColor =
        ChannelSelector.SELECTED_LABEL_BG;
    } else {
      this.channelLabelEl.style.backgroundColor =
        this.channelLabelConfig.backgroundColor ?? "rgba(255, 255, 255, 0.8)";
    }
  }

  /**
   * React to a pan or zoom interaction (delegates to the data pipeline).
   *
   * Called by BaseRenderer on every domain change. The pipeline decides
   * whether to serve from cache or schedule new fetches.
   */
  handleNavigation(
    visibleRegion: { chr: string; start: number; end: number },
    mode: InteractionMode,
  ): void {
    this.dataPipeline.handleNavigation(visibleRegion, mode);
  }

  /** Handle error from worker. */
  handleError(error: string) {
    this.setState({
      status: ChannelStatus.Error,
      error: { message: error },
    });
  }

  /** Update channel state. */
  public setState(state: Partial<IChannelState>) {
    this.state = { ...this.state, ...state };
    this.updateStatusDisplay();
    this.updateLoadingStatus();
  }

  /** Update loading indicator based on channel status. */
  private updateLoadingStatus() {
    if (!this.loadingRenderer) return;

    switch (this.state.status) {
      case ChannelStatus.Loading:
        this.loadingRenderer.setStatus(LoadingStatus.Loading);
        break;
      case ChannelStatus.Loaded:
        this.loadingRenderer.setStatus(LoadingStatus.Loaded);
        break;
      case ChannelStatus.Completed:
        this.loadingRenderer.setStatus(LoadingStatus.Completed);
        break;
      case ChannelStatus.Error:
        this.loadingRenderer.setStatus(
          LoadingStatus.Error,
          this.state.error?.message,
        );
        break;
      default:
        break;
    }
  }

  /** Get current state. */
  getState(): IChannelState {
    return this.state;
  }

  /** Update status display based on current state. */
  private updateStatusDisplay() {
    // TODO: Get actual bounds from layout
    const bounds = new DOMRect(this.x, this.y, this.width, this.height);
    this.statusDisplay.updateStatus(this.state, bounds);
  }

  /** Extra bottom-padding fraction added when showName is active. */
  public static readonly SHOW_NAME_PAD_BOTTOM = 0.3;
  // ── Transcript rendering (plot === "transcript") ────────────────────

  /**
   * Total scroll range height in CSS pixels — pure lane height plus bottom
   * padding so the last lane is never clipped at the channel boundary.
   */
  public get txTotalContentHeightCSS(): number {
    return (
      this._transcriptLaneCount * ChannelView.TX_LANE_HEIGHT_CSS +
      ChannelView.TX_BOTTOM_PADDING_CSS
    );
  }

  /** Pure lane content height without bottom padding (used for geometry). */
  public get txPureLaneHeightCSS(): number {
    return this._transcriptLaneCount * ChannelView.TX_LANE_HEIGHT_CSS;
  }

  /** Whether the transcript content exceeds the channel height. */
  public get txNeedsScroll(): boolean {
    const dpr = window.devicePixelRatio || 1;
    const channelFullCSS = this.height / dpr; // full parent channel height
    // Use pure lane height so we don't trigger a scrollbar just because of bottom padding
    return this.txPureLaneHeightCSS > channelFullCSS;
  }

  // ── BAM rendering (plot === "bam") ──────────────────────────────────

  /** Total virtual height of BAM content in CSS pixels. */
  public get bamTotalContentHeightCSS(): number {
    return this._bamLaneCount * ChannelView.BAM_LANE_HEIGHT_CSS;
  }

  /** Whether BAM content exceeds channel height and needs scrolling. */
  public get bamNeedsScroll(): boolean {
    const dpr = window.devicePixelRatio || 1;
    const paddingTopPx = Math.round(this.height * this.paddingTop);
    const paddingBottomPx = Math.round(this.height * this.paddingBottom);
    const fullContentHeight = this.height - paddingTopPx - paddingBottomPx;
    const coverageHeightPx = this.bamCoverageEnabled
      ? Math.round(fullContentHeight * this.bamCoverageHeightFrac)
      : 0;
    const readsCSS = (fullContentHeight - coverageHeightPx) / dpr;
    return this.bamTotalContentHeightCSS > readsCSS;
  }

  /** Whether coverage histogram is enabled for this BAM track. */
  public get bamCoverageEnabled(): boolean {
    const cov = this.config.style?.coverage;
    if (cov === undefined || cov === true) return true;
    if (cov === false) return false;
    return cov.enabled !== false; // object form, default true
  }

  /** Resolved coverage config object (normalises boolean / object / undefined). */
  public get bamCoverageConfig(): {
    color?: string | { colormap?: string; range?: [number, number] };
    alpha?: number;
    height: number;
    plot: "bar" | "line" | "heatmap" | "point";
    detailZoom?: number;
    scoreLabel?: {
      enabled?: boolean;
      fontSize?: number;
      color?: string;
      background?: string;
    };
  } {
    const cov = this.config.style?.coverage;
    if (!cov || typeof cov === "boolean") {
      return { height: 0.2, plot: "bar" };
    }
    return {
      color: cov.color,
      alpha: cov.alpha,
      height: cov.height ?? 0.2,
      plot: cov.plot ?? "bar",
      detailZoom: cov.detailZoom,
      scoreLabel: cov.scoreLabel,
    };
  }

  /**
   * Domain span threshold for *coverage* display.  Coverage can stay
   * visible at larger scales than reads.  Falls back to 5 000 000.
   */
  private get bamCoverageDetailZoom(): number {
    const cov = this.config.style?.coverage;
    if (cov && typeof cov === "object" && cov.detailZoom !== undefined) {
      return cov.detailZoom;
    }
    return 5_000_000;
  }

  /**
   * Check whether coverage should be hidden at the given domain span.
   * Returns true when the span exceeds `coverage.detailZoom`.
   */
  public isCoverageAboveDetailZoom(domainSpan: number): boolean {
    const threshold = this.bamCoverageDetailZoom;
    return threshold > 0 && domainSpan > threshold;
  }

  /** Height fraction of the channel reserved for the coverage area. */
  public get bamCoverageHeightFrac(): number {
    return this.bamCoverageConfig.height;
  }

  /**
   * Domain span threshold (bp) above which this channel hides detail.
   * Returns 0 when there is no limit (always show detail).
   */
  public get detailZoomThreshold(): number {
    const explicit = this.config.style?.detailZoom;
    if (explicit !== undefined) return explicit;
    // Plot-specific defaults
    switch (this.config.plot) {
      case "bam":
        return 50_000;
      case "transcript":
      case "rna":
        return 500_000;
      case "sequence":
        return 50_000; // allow sequence display up to 50 kb (14 kb default view is within range)
      case "variant":
        return 50_000;
      case "diamond":
        return 0; // no built-in default; honour explicit config only
      case "motif":
        return 50_000; // ISM/motif: default 50 kb; honour explicit detailZoom
      default:
        return 0; // no limit
    }
  }

  /**
   * Whether the current domain span exceeds the detail zoom threshold.
   * Returns `false` when `isDetailLimitedByZoom` is explicitly `false`,
   * effectively disabling the zoom guard and allowing data to be fetched
   * at any scale.
   */
  public isAboveDetailZoom(domainSpan: number): boolean {
    if (this.config.isDetailLimitedByZoom === false) return false;
    const threshold = this.detailZoomThreshold;
    return threshold > 0 && domainSpan > threshold;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Variant (VCF) lane-based rendering
  // ══════════════════════════════════════════════════════════════════════

  /** Row height per variant lane in CSS pixels (derived from config). */
  public get variantRowHeightCSS(): number {
    const dpr = window.devicePixelRatio || 1;
    const paddingTopPx = Math.round(this.height * this.paddingTop);
    const paddingBottomPx = Math.round(this.height * this.paddingBottom);
    const contentHeight = this.height - paddingTopPx - paddingBottomPx;
    const contentCSS = contentHeight / dpr;
    const frac = this.config.style?.rowHeight ?? 0.31;
    // rowHeight is a fraction — if laneCount == 1, the single row uses frac * contentCSS
    return Math.max(4, contentCSS * frac);
  }

  /** Total virtual height of all variant lanes in CSS px. */
  public get variantTotalContentHeightCSS(): number {
    return this._variantLaneCount * this.variantRowHeightCSS;
  }

  /** Whether variant content exceeds the channel height. */
  public get variantNeedsScroll(): boolean {
    const dpr = window.devicePixelRatio || 1;
    const channelFullCSS = this.height / dpr;
    return this.variantTotalContentHeightCSS > channelFullCSS;
  }

  /** Cached DOM container for sequence base-letter text overlay */
  public _seqOverlayEl: HTMLDivElement | null = null;
  /** Cached DOM element for "zoom in" hint */
  public _seqZoomHintEl: HTMLDivElement | null = null;
  /** Whether the sequence channel is showing the complement strand */
  public _isComplementStrand: boolean = false;

  /** Preferred height (includes expand group height when expanded). */
  getPreferredHeight(): number | undefined {
    // Stacked-hidden channels take no layout space
    if (this._isStackedHidden) return 0;
    const baseHeight = this.config.style?.height;
    // When expanded, always return a fixed height so LayoutView can
    // properly allocate space (and reclaim it on collapse).
    // Without this, channels without explicit height stay flex-sized
    // and collapsing never changes the layout → overlap.
    if (this._expandGroupView) {
      const effectiveBase = baseHeight ?? 24;
      return effectiveBase + this._expandGroupView.getVisibleHeight();
    }
    return baseHeight;
  }

  /**
   * Override getBounds to include expand group height.
   * LayoutView uses this to decide whether to skip rendering a channel
   * that is scrolled out of view.  Without this override, the parent's
   * own small height is used, causing LayoutView to skip the channel
   * even though the group area is still in the viewport.
   */
  getBounds(): { x: number; y: number; width: number; height: number } {
    const groupH = this._expandGroupView ? this._expandGroupView.height : 0;
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height + groupH,
    };
  }

  /**
   * Apply DOM clipping when this channel is in the scrollable area.
   * Hides trackContainer if fully outside the scroll viewport, and
   * clips with CSS clip-path if partially visible.
   * Also handles z-index for pinned vs scrollable channels.
   * When expanded, also clips the subChannel groupContainer.
   */
  private _applyScrollDOMClip(dpr: number): void {
    if (!this.trackContainer) return;

    const groupEl = this._expandGroupView?.groupContainer;

    // Pinned channels get higher z-index to layover scrolled content
    if (this.isPinned) {
      this.trackContainer.style.zIndex = "1000";
      this.trackContainer.style.visibility = "visible";
      this.trackContainer.style.clipPath = "";
      if (groupEl) {
        groupEl.style.zIndex = "1000";
        groupEl.style.visibility = "visible";
        groupEl.style.clipPath = "";
      }
      return;
    }

    if (!this._scrollClipBounds) {
      // No scroll clipping — ensure visible and no clip
      this.trackContainer.style.zIndex = "";
      this.trackContainer.style.visibility = "visible";
      this.trackContainer.style.clipPath = "";
      if (groupEl) {
        groupEl.style.zIndex = "";
        groupEl.style.visibility = "visible";
        groupEl.style.clipPath = "";
      }
      return;
    }

    const clipTopDevice = this._scrollClipBounds.y;
    const clipBottomDevice = clipTopDevice + this._scrollClipBounds.height;
    const myTopDevice = this.y;
    // Total height includes groupContainer when expanded
    const groupHeightDevice = this._expandGroupView
      ? this._expandGroupView.height
      : 0;
    const totalBottomDevice = this.y + this.height + groupHeightDevice;
    const myBottomDevice = this.y + this.height;

    // Fully outside the scroll viewport — hide parent and group completely
    if (totalBottomDevice <= clipTopDevice || myTopDevice >= clipBottomDevice) {
      this.trackContainer.style.visibility = "hidden";
      if (groupEl) {
        groupEl.style.visibility = "hidden";
      }
      return;
    }

    // ── Clip the parent trackContainer ──
    if (myBottomDevice <= clipTopDevice) {
      // Parent fully above clip area
      this.trackContainer.style.visibility = "hidden";
    } else if (
      myTopDevice >= clipTopDevice &&
      myBottomDevice <= clipBottomDevice
    ) {
      // Parent fully inside
      this.trackContainer.style.visibility = "visible";
      this.trackContainer.style.clipPath = "";
    } else {
      // Parent partially visible
      this.trackContainer.style.visibility = "visible";
      const clipTopCSS =
        myTopDevice < clipTopDevice ? (clipTopDevice - myTopDevice) / dpr : 0;
      const clipBottomCSS =
        myBottomDevice > clipBottomDevice
          ? (myBottomDevice - clipBottomDevice) / dpr
          : 0;
      this.trackContainer.style.clipPath = `inset(${clipTopCSS}px 0 ${clipBottomCSS}px 0)`;
    }

    // ── Clip the subChannel groupContainer ──
    if (groupEl && this._expandGroupView) {
      const groupTopDevice = this.y + this.height; // group starts right below parent
      const groupBottomDevice = groupTopDevice + groupHeightDevice;

      if (
        groupBottomDevice <= clipTopDevice ||
        groupTopDevice >= clipBottomDevice
      ) {
        // Group fully outside
        groupEl.style.visibility = "hidden";
      } else if (
        groupTopDevice >= clipTopDevice &&
        groupBottomDevice <= clipBottomDevice
      ) {
        // Group fully inside
        groupEl.style.visibility = "visible";
        groupEl.style.clipPath = "";
      } else {
        // Group partially visible
        groupEl.style.visibility = "visible";
        const clipTopCSS =
          groupTopDevice < clipTopDevice
            ? (clipTopDevice - groupTopDevice) / dpr
            : 0;
        const clipBottomCSS =
          groupBottomDevice > clipBottomDevice
            ? (groupBottomDevice - clipBottomDevice) / dpr
            : 0;
        groupEl.style.clipPath = `inset(${clipTopCSS}px 0 ${clipBottomCSS}px 0)`;
      }
    }
  }

  /** Sort pinned channels first, then by explicit order with stable fallbacks. */
  static sortChannels<T extends IChannel>(channels: T[]): T[] {
    return sortChannelConfigs(channels);
  }
}
