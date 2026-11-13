import { parseTssRegion, tssInterval } from "../utils/tss-region";
import type { WheelMode } from "../events/wheel-mode";
import { AddChannelView } from "../channel/components/add-channel-view";
import { ITRConfig } from "../config/config";
import type { IAnnotationConfig } from "../config/config";
import {
  type IResolvedConfig,
  type IConfigDraft,
  normaliseLocusToTargetRegion,
  normaliseReferenceToAnnotation,
  normaliseSettings,
  normaliseLocusMode,
} from "./config/normalize";
import { ChromManager } from "./chrom-manager";
import { ExportManager } from "../export/export-manager";
import { ChannelScrollbar } from "../channel/components/channel-scrollbar";
import { ChannelController } from "../channel/manager/channel-controller";
import { InteractionBinder } from "../events/interaction-binder";
import { AxisController } from "../axis/axis-controller";
import { NavigationController } from "../navigation/navigation-controller";
import { hexToRgbBackground } from "../colors/colors";
import { RenderingContext } from "../graph/context";
import { LayoutView } from "./view";
import { ChannelView, IChannel } from "../channel/index";
import {
  ChannelManager,
  type IChannelManagerDelegate,
} from "../channel/manager/channel-manager";
import { HeaderPanelManager } from "../header/header-panel-manager";
import { ReferenceManager } from "../reference/reference-manager";
import { LocusManager } from "../locus/locus-manager";
import { SearchManager } from "../search";
import { favouriteManager } from "../favourite";
import { GridRenderer } from "../grid/grid";
import { initChannelsConfig } from "../channel/init";
import { RendererStatus, IRendererState } from "./status";
import { AxisView } from "../axis";
import { InteractionController, IDomain } from "../events";
import { defaultConfig } from "../../../../config/default_config";
import { merge } from "lodash";
import {
  HighlightManager,
  type IHighlightProjectionContext,
  type IRegionList,
} from "../highlight/index";
import { CDSCoordinateMapper, TranscriptFeature } from "../utils/cds";
import { BoundaryFeedback } from "../events/boundary-feedback";
import { logger } from "../utils/logger";

interface RenderState {
  domain: { start: number; end: number };
}

/** Navigation-change event fired whenever the visible region changes. */
export interface NavigationChangeEvent {
  /** Chromosome name (e.g. "chr1") */
  chr: string;
  /** Start position in base-pairs */
  start: number;
  /** End position in base-pairs */
  end: number;
  /**
   * What caused the change:
   * - `"navigate"` — explicit programmatic / UI navigation (navigateTo, set region, search)
   * - `"pan"`      — user is dragging / swiping the view
   * - `"zoom"`     — user is pinch-zooming or scroll-wheeling
   */
  source: "navigate" | "pan" | "zoom";
  /** Gene symbol (e.g. "TP53"). Empty string when no transcript is active. */
  gene_name: string;
  /** Ensembl gene ID (e.g. "ENSG00000141510"). Empty string when unavailable. */
  gene_id: string;
  /** Transcript name (e.g. "TP53-202"). Empty string when unavailable. */
  transcript_name: string;
  /** Ensembl transcript ID (e.g. "ENST00000269305"). Empty string when unavailable. */
  transcript_id: string;
}

/** Base Renderer — core rendering logic. */
export class BaseRenderer {
  public config: IResolvedConfig;
  public context: RenderingContext;
  public rootView: LayoutView;
  public container: HTMLElement | null = null;
  public gridRenderer: GridRenderer | null = null;

  /** Set by destroy(); async ops bail on it so a torn-down renderer never
   *  fetches (matters under React Strict Mode remounts). */
  protected _destroyed = false;

  /** Read-only view of _destroyed for collaborators holding only a
   *  renderer reference (e.g. ReferenceManager) that must abort on teardown. */
  public get isDestroyed(): boolean {
    return this._destroyed;
  }

  /** Bumped on every explicit mode switch (DNA/RNA/CDS); async navigations
   *  capture it before awaiting and abort if it changed, killing stale callbacks. */
  public _modeGeneration = 0;

  get modeGeneration(): number {
    return this._modeGeneration;
  }

  incrementModeGeneration(): number {
    return ++this._modeGeneration;
  }

  /** Bumped on every reference change (applyReference); async navigations
   *  capture it and abort if it changed, so a slow prior-reference navigation
   *  can't land late and overwrite the new view. */
  public _navGeneration = 0;

  /** Visible genomic window (updated by pan/zoom). render() uses this;
   *  loadData() uses config.region. */
  public viewDomain: IDomain = { start: 0, end: 0 };

  /** Pan/zoom interaction controller — attached in mount() */
  public interactionController: InteractionController | null = null;

  /** Boundary feedback overlay (inner shadow + bounce) — attached in mount() */
  public boundaryFeedback: BoundaryFeedback | null = null;

  /** Public API: persistent genomic highlight bands over the channel content. */
  public readonly highlightManager = new HighlightManager();

  /** Data / image / publication-figure export subsystem. */
  public readonly exporter = new ExportManager(this);

  /** The drag-only channel scrollbar (right edge). */
  public readonly scrollbar = new ChannelScrollbar(this);

  /** Channel lifecycle (add/remove/reorder/replace, group sync, data loading)
   *  behind the public ChannelManager facade. */
  public readonly channelController = new ChannelController(this);

  /** Binds pan/zoom/drag + boundary-feedback + Alt-wheel onto the canvas. */
  public readonly interactionBinder = new InteractionBinder(this);

  /** Transcript navigation (navigate*, navigateTo, nav-bar, transcript loading);
   *  public methods below are delegates kept for API stability. */
  public readonly navigationController = new NavigationController(this);

  public navigateByTranscript(
    transcriptName: string,
    flank: number,
  ): Promise<void> {
    return this.navigationController.navigateByTranscript(
      transcriptName,
      flank,
    );
  }
  public navigateByTranscriptAsymmetric(name: string, up: number, down: number): Promise<void> {
    return this.navigationController.navigateByTranscriptAsymmetric(name, up, down);
  }
  public navigateByTranscriptTss(name: string, start: number, end: number, mode: "rna" | "dna" = "rna"): Promise<void> {
    return this.navigationController.navigateByTranscriptTss(name, start, end, mode);
  }
  /** Retain transcript coordinates when switching to genomic axes. */
  public _tssContext: NonNullable<BaseRenderer["_rnaInfo"]> | null = null;
  public navigateByTranscriptCDS(
    transcriptName: string,
    flank: number,
  ): Promise<void> {
    return this.navigationController.navigateByTranscriptCDS(
      transcriptName,
      flank,
    );
  }
  public navigateByTranscriptAnnotation(
    transcriptName: string,
    dna: { chrom: string; start: number; end: number },
    upstream: number = 5000,
    downstream: number = 5000,
  ): Promise<void> {
    return this.navigationController.navigateByTranscriptAnnotation(
      transcriptName,
      dna,
      upstream,
      downstream,
    );
  }
  public navigateTo(chr: string, start: number, end: number): void {
    this.navigationController.navigateTo(chr, start, end);
  }
  public setCdsCanvasNavigationCallback(cb: (() => void) | null): void {
    this.navigationController.setCdsCanvasNavigationCallback(cb);
  }

  /** Coordinate-mode behaviour (RNA/CDS enter/leave, CDS pan/zoom, DNA resolve).
   *  Mode state stays on the renderer; public methods below are API-stability delegates. */
  public readonly axisController = new AxisController(this);

  public disableRnaMode(): void {
    this.axisController.disableRnaMode();
  }
  public disableCdsMode(): void {
    this.axisController.disableCdsMode();
  }
  public panCdsView(frac: number): void {
    this.axisController.panCdsView(frac);
  }
  public zoomCdsView(factor: number): void {
    this.axisController.zoomCdsView(factor);
  }
  public resolveTranscriptDNA(
    transcriptName: string,
    flank: number,
  ): Promise<string | null> {
    return this.axisController.resolveTranscriptDNA(transcriptName, flank);
  }
  public setCdsModeChangeCallback(
    cb: (
      enabled: boolean,
      info?: { strand: "+" | "-"; chr: string; name: string },
    ) => void,
  ): void {
    this.axisController.setCdsModeChangeCallback(cb);
  }

  /** Mark renderer as dirty (to be overridden by subclass). */
  protected markDirty?(): void;

  /**
   * Request a repaint on the next frame. Public wrapper around the subclass's
   * protected markDirty() so composed managers (e.g. ChannelController) can
   * trigger a repaint without markDirty being public across the hierarchy.
   */
  public requestRepaint(): void {
    this.markDirty?.();
  }

  /** Add a channel (public API, delegates to the channel controller). */
  public addChannel(channelConfig: IChannel): void {
    this.channelController.addChannel(channelConfig);
  }

  /** Add many channels with a batch confirm dialog (public API). */
  public addManyChannels(configs: IChannel[]): void {
    this.channelController.addManyChannels(configs);
  }

  /** Load data for all channels in the current viewport (public API). */
  public async loadData(): Promise<void> {
    return this.channelController.loadData();
  }

  /** Export the whole browser as a figure (data-less image). Kept on the
   *  renderer for API stability; delegates to the exporter. */
  public exportBrowser(
    format: "PNG" | "SVG" | "PDF",
    theme: "print" | "publish" = "print",
  ): void {
    this.exporter.exportBrowser(format, theme);
  }

  /** Snapshot the current view as a JSON-serialisable config (delegates to the exporter). */
  public exportConfig(): ITRConfig {
    return this.exporter.exportConfig();
  }

  /**
   * Draw the current frame on demand. Public wrapper the exporter uses to
   * re-render channels into offscreen canvases; the render loop itself stays
   * protected.
   */
  public renderForExport(): void {
    this.render();
  }

  /** Public API: centralised channel CRUD (add/remove/update/reorder/replace). */
  public readonly channelManager: ChannelManager;

  /** Public API: header toolbar panel manager (button visibility, action events, state). */
  public readonly headerPanelManager: HeaderPanelManager;

  /**
   * Public API: manage the list of genome reference configurations and
   * the currently active one.  Initialised with the config's `reference`
   * entry; additional references can be added at runtime via
   * `renderer.referenceManager.add(...)`.
   */
  public readonly referenceManager: ReferenceManager;

  /** Public API: snapshot the current locus as an ILocus (mode + DNA
   *  window + transcript + favourite) and subscribe; host calls tick() per frame. */
  public readonly locusManager: LocusManager;

  /** Public API: transcript / gene search facade over
   *  ReferenceManager.searchTranscripts (by trans_id / trans_name / gene_*). */
  public readonly searchManager: SearchManager;

  /** Alt+wheel scroll handler — attached in mount() */
  public _altWheelHandler: ((e: WheelEvent) => void) | null = null;

  /** Reference to the AxisView instance (set in initializeViews). */
  public _axisView: AxisView | null = null;

  /**
   * Active RNA mode info.  Non-null when the user has navigated via a
   * "TRANSCRIPT-NAME:FLANK" region string and RNA axis mode is enabled.
   */
  public _rnaInfo: {
    tssPos: number;
    strand: "+" | "-";
    chr: string;
    name: string;
    txStart: number;
    txEnd: number;
  } | null = null;

  /**
   * Transcript information fetched from the browser_region API.
   * Contains gene and transcript identifiers for the current region.
   * Used by channels for data filtering (filterGene/filterTranscript)
   * and by getRegionList() for enriching RNA/CDS entries.
   */
  public _transcriptInfo: {
    gene_id: string;
    trans_id: string;
    trans_name: string;
    gene_name: string;
    trans_type: string;
    gene_type: string;
  } | null = null;

  // ── CDS mode state ──────────────────────────────────────────────────────
  /**
   * CDS coordinate mapper.  Non-null when the renderer is in CDS mode —
   * all rendering coordinates are transformed from genomic to CDS space.
   */
  public _cdsMapper: CDSCoordinateMapper | null = null;

  /**
   * CDS mapper kept purely for coordinate export (getRegionList).
   * Built whenever we navigate to a transcript (RNA or CDS mode) so that
   * CDS coordinates can always be computed, even outside CDS mode.
   */
  public _exportCdsMapper: CDSCoordinateMapper | null = null;

  /**
   * Exon mapper kept purely for mRNA coordinate export (getRegionList).
   * Built from exon intervals whenever we navigate to a transcript.
   * Uses the same CDSCoordinateMapper logic to collapse intron gaps.
   */
  public _exportExonMapper: CDSCoordinateMapper | null = null;

  /**
   * Persistent transcript genomic coordinates.
   * Set whenever enableRnaMode / enableCdsMode is called,
   * never cleared by mode-disable so the nav bar marker persists.
   */
  public _lastTranscriptCoords: { txStart: number; txEnd: number } | null =
    null;

  /**
   * Active CDS mode info.  Non-null when the user has navigated via a
   * CDS-mode transcript string and CDS mode is enabled.
   */
  public _cdsInfo: {
    strand: "+" | "-";
    chr: string;
    name: string;
    /** Genomic viewDomain — preserved for converting CDS ↔ genomic. */
    genomicDomain: IDomain;
    /** Transcription start site (genomic) — needed for RNA coordinate export. */
    tssPos: number;
    /** Transcript start in genomic coords (0-based). */
    txStart: number;
    /** Transcript end in genomic coords (0-based half-open). */
    txEnd: number;
  } | null = null;

  /**
   * Transcript features (CDS, exon, UTR, codons) for the CDS nav bar.
   * Parsed from the API response and stored in genomic coordinates.
   */
  public _transcriptFeatures: TranscriptFeature[] = [];
  /** Flank size used for the current CDS navigation. */
  public _cdsFlank: number = 0;

  // ── Built-in channel state ─────────────────────────────────────────
  /** Current transcript ID for buildin channel URL resolution. */
  public _buildinTranscriptId: string | null = null;
  /** Current upstream offset for buildin channel URL resolution. */
  public _buildinUpstream: number = 5000;
  /** Current downstream offset for buildin channel URL resolution. */
  public _buildinDownstream: number = 5000;

  /**
   * Optional hook called on every CDS-space domain change from
   * canvas interactions (wheel-zoom, drag-pan). Button-triggered
   * navigation goes through App.tsx's panBy/zoomBy directly.
   */
  public _onCdsCanvasNavigation: (() => void) | null = null;

  // Renderer state
  public state: IRendererState = {
    status: RendererStatus.init,
    loadedChannels: 0,
    totalChannels: 0,
  };

  constructor(config: ITRConfig) {
    // ── Merge top-level defaults from default_config.ts ─────────────
    // User-supplied config takes precedence; defaults fill gaps.
    const { channels: _channelDefaults, ...topLevelDefaults } = defaultConfig;
    const draft = merge({}, topLevelDefaults, config) as IConfigDraft;

    // ── Public-to-internal normalisation ────────────────────────────
    // The public config exposes only `locus`, `reference`, and
    // `settings`. Internal renderer code reads the resolved `target`,
    // `region`, `annotation`, `grid`, `axis`, `loading`, `channelLabel`,
    // `mode`, and `renderer.leftPanel/headerPanel` fields, so derive
    // them here.
    normaliseLocusToTargetRegion(draft);
    normaliseReferenceToAnnotation(draft);
    normaliseSettings(draft);
    normaliseLocusMode(draft);

    // Initialize channels with per-plot-type defaults
    draft.channels = initChannelsConfig(draft.channels || []);

    // After normalisation both `target` and `region` are guaranteed to
    // exist, so we narrow to the stricter internal shape.
    this.config = draft as IResolvedConfig;
    this.context = new RenderingContext();
    this.rootView = new LayoutView();

    this.state.totalChannels = this.config.channels.length;

    // Initialise viewDomain from the configured region
    this.viewDomain = {
      start: this.config.region.start,
      end: this.config.region.end,
    };

    // ── Rendering quality mode ──────────────────────────────────────────
    // Default to "high". The actual WebGL2 availability check happens in
    // mount() after the context is created; if it fails, mode is forced
    // to "low".
    this.context.renderMode = this.config.renderer.mode ?? "high";

    // ── Channel manager ─────────────────────────────────────────────────
    const delegate: IChannelManagerDelegate = {
      addChannel: (cfg) => this.channelController.addChannel(cfg),
      addChannelDirect: (cfg) => this.channelController._addChannelDirect(cfg),
      addManyChannels: (cfgs) => this.channelController.addManyChannels(cfgs),
      removeChannelByIndex: (index, silent) =>
        this.channelController.removeChannelByIndex(index, silent),
      reorderChannels: (from, to) =>
        this.channelController.reorderChannels(from, to),
      getChannelConfigs: () => this.config.channels ?? [],
      getChannelCount: () =>
        this.rootView.children.filter((c) => c instanceof ChannelView).length,
      getChannelData: (index) => {
        const views = this.rootView.children.filter(
          (c) => c instanceof ChannelView,
        ) as ChannelView[];
        return views[index]?.getData();
      },
      reloadAll: () => this.channelController.loadData(),
      replaceAllChannels: (channels) =>
        this.channelController.replaceAllChannels(channels),
      updateChannel: (index) =>
        this.channelController._updateChannelByIndex(index),
    };
    this.channelManager = new ChannelManager(delegate);

    // ── Header panel manager ────────────────────────────────────────────
    this.headerPanelManager = new HeaderPanelManager(
      this.config.renderer?.headerPanel,
    );

    // ── Reference manager ───────────────────────────────────────────────
    // Seeded with the config's `reference` entry (if any); callers add
    // more via `renderer.referenceManager.add(otherRef)`.
    this.referenceManager = new ReferenceManager(
      this,
      this.config.reference ? [this.config.reference] : undefined,
    );

    // ── Locus manager ──────────────────────────────────────────────────
    // Pulls live state from this renderer + the global favouriteManager
    // singleton. `tick()` is driven by the host RAF loop (see
    // `views/main.tsx`).
    this.locusManager = new LocusManager(this as any, favouriteManager);

    // ── Search manager ─────────────────────────────────────────────────
    // Thin facade over `referenceManager.searchTranscripts` so external
    // callers get a focused, documented `renderer.searchManager` entry
    // point instead of digging into reference internals. Both managers
    // share the same underlying SQLite / REST routing.
    this.searchManager = new SearchManager(this.referenceManager);
  }

  /** Per-chromosome sizes + cytoband data (loaded from the reference). */
  public readonly chrom = new ChromManager();

  // ---------------------------------------------------------------------------
  // Public pan / zoom API
  // ---------------------------------------------------------------------------

  /**
   * The visible canvas width in CSS pixels — same value interaction.ts uses
   * when computing `effectiveMinSpan = max(10, viewWidth / maxBpPixelRatio)`.
   */
  public get browserWidth(): number {
    const dpr = window.devicePixelRatio || 1;
    return (this.context.canvas?.width ?? 1000) / dpr;
  }

  /**
   * Returns the chromosome size in bp from the loaded chromsizes file.
   * Returns `undefined` if the chromsizes haven't loaded yet or the
   * chromosome name is absent from the file.
   */
  public getChromSize(chr: string): number | undefined {
    return this.chrom.getChromSize(chr);
  }

  /** Returns the current visible domain (the zoomed/panned window). */
  public getViewDomain(): IDomain {
    return { ...this.viewDomain };
  }

  // ── Region list export ────────────────────────────────────────────────────

  /**
   * Build a multi-mode region list from the current highlight regions.
   *
   * Always produces DNA, mRNA, RNA and CDS entries regardless of the current
   * view mode.  RNA, mRNA and CDS entries carry additional transcript metadata.
   *
   * - **DNA**  — genomic coordinates (always available).
   * - **mRNA** — mature mRNA coordinates (introns removed, exon-only space).
   *              Uses the exon mapper to collapse intron gaps.
   * - **RNA**  — pre-mRNA / TSS-relative coordinates (offset from TSS).
   * - **CDS**  — CDS-only coordinates (introns + UTR removed).
   *
   * Each entry carries the `assembly` of the currently active reference
   * (e.g. `{ name: "GRCh38" }`) so the result can be replayed against the
   * correct genome later.
   *
   * @returns `{ DNA: [...], mRNA: [...], RNA: [...], CDS: [...] }`
   */
  public getRegionList(): IRegionList {
    this.refreshFeatureRegions();
    return this.highlightManager.getFeatureRegion();
  }

  /** Refresh cached highlight projections; the manager's guard makes it cheap. */
  protected refreshFeatureRegions(): void {
    this.highlightManager.projectFeatureRegions(this.buildProjectionContext());
  }

  /** Package the mappers and transcript metadata the projection needs. */
  private buildProjectionContext(): IHighlightProjectionContext {
    const rna = this._rnaInfo;
    const cds = this._cdsMapper ?? this._exportCdsMapper;
    const cdsInfo = this._cdsInfo;
    const txInfo = this._transcriptInfo;
    const chr = this.config.region?.chr ?? "";
    const assembly = this.referenceManager?.getConfig()?.assembly;
    const isCdsMode = this.axisController.isCdsMode;
    const mode = isCdsMode
      ? "cds"
      : this.axisController.isRnaMode
        ? "rna"
        : "dna";
    // Changes only when feature coordinates could change (not on pan / zoom).
    const signature = [
      txInfo?.trans_id ?? rna?.name ?? cdsInfo?.name ?? "",
      mode,
      assembly?.name ?? "",
      chr,
    ].join("|");
    return {
      chr,
      rna,
      cds,
      exonMapper: this._exportExonMapper,
      cdsInfo,
      txInfo,
      isCdsMode,
      assembly,
      signature,
    };
  }

  // ── Config export ─────────────────────────────────────────────────────────

  /**
   * Programmatically set the visible domain and trigger a re-render.
   * Does NOT reload data — use navigateTo() for that.
   */
  public setViewDomain(domain: IDomain): void {
    this.viewDomain = { ...domain };
    this.markDirty?.();
  }

  /** Get the current loaded region as a UCSC-style string, e.g. `chr1:7769296-7783432`. */
  get region(): string {
    const { chr, start, end } = this.config.region;
    return `${chr}:${start}-${end}`;
  }

  /**
   * Get the **currently visible** genomic window as a UCSC-style string.
   * Updates on every pan / zoom frame, unlike `region` which only changes
   * when `navigateTo()` is called.
   */
  get viewRegion(): string {
    const chr = this.config.region?.chr ?? "";
    const { minStart, maxEnd } = this.chrom.chromBounds(chr);
    // Clamp to chromosome boundaries so extreme zoom-out never produces
    // scientific-notation coordinates in the UI.
    const genomicStart = this._cdsMapper ? this._cdsMapper.cdsToGenomic(this.viewDomain.start) : this.viewDomain.start;
    const genomicEnd = this._cdsMapper ? this._cdsMapper.cdsToGenomic(this.viewDomain.end) : this.viewDomain.end;
    const start = Math.round(Math.max(minStart, genomicStart));
    const end = Math.round(Math.min(maxEnd, genomicEnd));
    return `${chr}:${start}-${end}`;
  }

  /**
   * Get the **currently visible** RNA/CDS region as a transcript notation string.
   * RNA format: `TRANSCRIPT-NAME:start:end`, both endpoints relative to TSS=0.
   * CDS retains its legacy flank notation.
   * Returns `""` if not in RNA or CDS mode.
   */
  get viewRnaRegion(): string {
    const rna = this._rnaInfo;
    const cds = this._cdsInfo;
    if (rna) {
      const name = rna.name;
      const interval = tssInterval(rna, this.viewDomain);
      return `${name}:${interval.start}:${interval.end}`;
    }
    if (cds && this._cdsMapper) {
      const name = cds.name;
      // viewDomain is in CDS space — convert back to genomic
      const gStart = this._cdsMapper.cdsToGenomic(this.viewDomain.start);
      const gEnd = this._cdsMapper.cdsToGenomic(this.viewDomain.end);
      const up = Math.max(0, Math.round(cds.txStart - Math.min(gStart, gEnd)));
      const down = Math.max(0, Math.round(Math.max(gStart, gEnd) - cds.txEnd));
      return `${name}:${up}:${down}`;
    }
    return "";
  }

  /**
   * Update the renderer's internal annotation configuration from a new
   * `IReferenceConfig`.  Call this after switching the active genome
   * reference so that subsequent transcript lookups (`set region`,
   * `navigateByTranscript*`) resolve against the new assembly's SQLite
   * catalogue or REST API rather than the previous one.
   *
   * Also updates `chromsizes` and `cytoband` so chromosome-boundary
   * clamping and the ideogram are correct for the new assembly.
   */
  public async applyReference(
    ref: import("../config/config").IReferenceConfig,
  ): Promise<void> {
    // Invalidate any in-flight transcript navigation from the previous
    // reference so it can't land late and overwrite this reference's view.
    this._navGeneration++;
    // Reset RNA / CDS coordinate state from the previous reference. Its
    // mappers live in the OLD reference's genomic coordinates; leaking them
    // into the new reference mis-positions RNA navigation and crashes a later
    // switch to DNA mode. The new reference navigates to its own default locus
    // immediately after this, which re-enables the correct mode.
    this.axisController._resetCoordinateModes();
    const fromRef: IAnnotationConfig = {};
    if (ref.assembly?.name) fromRef.transcriptome = ref.assembly.name;
    const refTranscripts =
      ref.transcriptome?.api ?? ref.transcriptome?.annotation?.transcripts;
    if (refTranscripts) fromRef.transcripts = refTranscripts;
    if (ref.genome?.chromSizes?.url)
      fromRef.chromsizes = ref.genome.chromSizes.url;
    if (ref.genome?.cytoband?.url) fromRef.cytoband = ref.genome.cytoband.url;
    this.config.annotation = fromRef;
    // Re-fetch chromsizes + cytobands so chromosome-boundary clamping and
    // the ideogram reflect the new assembly.  Fire-and-forget but exposed
    // via the returned Promise so callers may await full readiness.
    await Promise.all([
      this.chrom.loadChromSizes(this.config.annotation?.chromsizes),
      this.chrom.loadCytobands(this.config.annotation?.cytoband),
    ]);
    // Refresh interaction bounds for the current chromosome under the new
    // chromsizes, and re-render the ideogram.
    if (this.interactionController) {
      const chr = this.config.region?.chr ?? "";
      const { minStart, maxEnd } = this.chrom.chromBounds(chr);
      this.interactionController.updateOptions({ minStart, maxEnd });
      this.navigationController._updateAxisNavBar(chr);
    }
    this.markDirty?.();
  }

  /**
   * Navigate to a region specified as a UCSC-style string, e.g. `chr1:7769296-7783432`.
   * Equivalent to calling `navigateTo(chr, start, end)`.
   *
   * Also accepts RNA transcript notation `"TRANSCRIPT-NAME:FLANK"`,
   * e.g. `"VAMP3-201:5000"` – fetches transcript coordinates from the
   * configured `annotation.transcripts` API, then navigates to
   * `[txStart-flank, txEnd+flank]` and enables RNA axis mode.
   *
   * @throws if format is unrecognised
   */
  set region(value: string) {
    const cleaned = value.replace(/,/g, ""); // allow comma-separated numbers

    // UCSC-style "chrN:start-end"
    const m = cleaned.match(/^([\w.]+):(\d+)-(\d+)$/);
    if (m) {
      this.navigateTo(m[1], parseInt(m[2], 10), parseInt(m[3], 10));
      return;
    }

    const interval = parseTssRegion(cleaned);
    if (interval) {
      this.navigateByTranscriptTss(interval.name, interval.start, interval.end)
        .catch((error) => logger.error("TSS interval navigation failed", error));
      return;
    }

    // RNA transcript notation "TRANSCRIPT-NAME:FLANK" (word chars + hyphens, colon, digits)
    // Examples: "VAMP3-201:5000", "BRCA1-001:10000"
    const rna = cleaned.match(/^([\w][\w.-]*):(\d+)$/);
    if (rna) {
      const transcriptName = rna[1];
      const flank = parseInt(rna[2], 10);
      this.navigateByTranscript(transcriptName, flank).catch((err) => {
        logger.error(
          `[Renderer] navigateByTranscript("${transcriptName}", ${flank}) failed:`,
          err,
        );
      });
      return;
    }

    throw new Error(
      `[Renderer] Invalid region format "${value}". ` +
        `Expected "chrN:start-end" or "TRANSCRIPT-NAME:FLANK" (e.g. "VAMP3-201:5000").`,
    );
  }

  /**
   * Current transcript information (gene_id, trans_id, etc.).
   * Fetched from the browser_region API when navigating by transcript name.
   * Returns `null` if no transcript info has been loaded yet.
   */
  get transcriptInfo(): {
    gene_id: string;
    trans_id: string;
    trans_name: string;
    gene_name: string;
    trans_type: string;
    gene_type: string;
  } | null {
    return this._transcriptInfo ? { ...this._transcriptInfo } : null;
  }

  /**
   * Navigation-change event source descriptor.
   *
   * - `"navigate"` — explicit programmatic / UI navigation (navigateTo, set region, search).
   * - `"pan"`      — user is dragging / swiping the view.
   * - `"zoom"`     — user is pinch-zooming or scroll-wheeling.
   */
  public static readonly NavigationSource = {
    NAVIGATE: "navigate" as const,
    PAN: "pan" as const,
    ZOOM: "zoom" as const,
  };

  /** Callback type for navigation change events. */
  public static readonly NavigationChangeEvent =
    undefined as unknown as NavigationChangeEvent;

  /** Primary wheel action; Ctrl/Cmd temporarily selects the other action. */
  public getWheelMode(): WheelMode {
    return this.config.renderer.wheelMode ?? "zoom";
  }

  public setWheelMode(mode: WheelMode): void {
    if (mode !== "zoom" && mode !== "scroll")
      throw new Error("Unknown wheel mode");
    if (this.getWheelMode() === mode) return;
    this.config.renderer.wheelMode = mode;
    this.headerPanelManager.dispatchStateChange("wheel", { mode });
  }

  /** Run a full relayout + repaint cycle (after scroll offset change). */
  public _relayoutAndRepaint(): void {
    if (this.context.canvas && this.container) {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.container.getBoundingClientRect();
      this.rootView.layout(0, 0, rect.width * dpr, rect.height * dpr);
      this.scrollbar.update();
    }
    this.markDirty?.();
  }

  /** Final scrollable row, separate from the channel model. */
  public readonly addChannelView = new AddChannelView();

  /** Initialize views. */
  protected initializeViews() {
    // Add axis view at the top if configured
    if (this.config.axis && this.config.axis.enabled !== false) {
      const axisView = new AxisView(this.context, this.config.axis);
      this._axisView = axisView;
      this.rootView.addChild(axisView);
    }

    if (this.config.channels) {
      const loadingConfig = {
        enabled: true,
        position: "rightBottom" as const,
        size: "small" as const,
        fadeOutDuration: 300,
        ...this.config.loading,
      };

      // Sort channels according to order field before creating views
      const sortedChannels = ChannelView.sortChannels(this.config.channels);

      sortedChannels.forEach((channel, index) => {
        const dataLoader = this.channelController.createDataLoader(
          channel,
          index,
        );
        const channelLabelConfig = {
          enabled: true,
          ...this.config.channelLabel,
        };
        const channelView = new ChannelView(
          this.context,
          channel,
          index,
          dataLoader,
          loadingConfig,
          channelLabelConfig,
          () => this.markDirty?.(),
          () => this.interactionController,
          (fromIndex: number, toIndex: number, pinned?: boolean) =>
            this.channelController.reorderChannels(fromIndex, toIndex, pinned),
        );

        // Wire up expand / collapse callback
        channelView.onExpandCallback = (parent, subs, action) =>
          this.channelController.handleChannelExpand(parent, subs, action);

        // Wire up menu action callback
        channelView.onMenuAction = (ch, action, payload) =>
          this.channelController.handleChannelMenuAction(ch, action, payload);

        // Wire up transcript info accessor for filterGene/filterTranscript
        channelView.getTranscriptInfo = () => this.transcriptInfo;

        this.rootView.addChild(channelView);
      });
    }
    this.channelController.syncChannelOrder();
  }

  /** Update renderer state. */
  public setState(state: Partial<IRendererState>) {
    this.state = { ...this.state, ...state };
  }

  /** Get current state. */
  public getState(): IRendererState {
    return this.state;
  }

  // Cached per-render state to avoid per-frame allocations
  private _cachedBgColor: { r: number; g: number; b: number } | null = null;
  private _cachedBgColorHex = "";

  protected render() {
    // Clear background — only re-parse hex when the value changes
    let bgColorHex = this.config.renderer.backgroundColor;
    if (!bgColorHex) {
      bgColorHex =
        this.config.renderer.theme === "dark" ? "#1e1e1e" : "#ffffff";
    }
    if (bgColorHex !== this._cachedBgColorHex) {
      this._cachedBgColor = hexToRgbBackground(bgColorHex);
      this._cachedBgColorHex = bgColorHex;
    }
    const bgColor = this._cachedBgColor!;

    if (this.context.gl) {
      this.context.gl.clearColor(bgColor.r, bgColor.g, bgColor.b, 1.0);
    }
    this.context.clear();

    const state: RenderState = {
      domain: {
        start: this.viewDomain.start,
        end: this.viewDomain.end,
      },
    };

    // Set up grid rendering callbacks.
    // Scrollable-area grid + pinned separator fire BEFORE pinned children,
    // so pinned channels paint over them.
    // Pinned-area grid fires AFTER pinned children, so the separator lines
    // between pinned channels are visible on top of pinned content.
    this.rootView.onBeforePinnedRender = () => {
      this._renderGrid(state, /* pinnedOnly */ false);
      this._renderPinnedSeparator();
    };
    this.rootView.onAfterPinnedRender = () => {
      this._renderGrid(state, /* pinnedOnly */ true);
    };

    this.rootView.render(state);
  }

  /**
   * Render the grid overlay.
   *
   * @param state      Current render state (domain).
   * @param pinnedOnly When true, only draw grid lines for pinned children
   *                   (called after pinned render). When false, draw for
   *                   scrollable children only (called before pinned render).
   */
  private _renderGrid(state: RenderState, pinnedOnly: boolean): void {
    if (!this.gridRenderer || !this.context.gl || !this.context.canvas) return;

    // The Add Channel row participates in scrolling, but is not a data track.
    const filtered = this.rootView.children.filter(
      (c) =>
        c !== this.addChannelView &&
        (pinnedOnly ? c.isPinned === true : c.isPinned !== true),
    );
    if (filtered.length === 0) return;

    const tracks = filtered.map((child: any) => ({
      y: child.y || 0,
      height: child.height || 0,
    }));

    const hasValidLayout = tracks.some((track) => track.height > 0);
    if (
      hasValidLayout &&
      this.context.canvas.width > 0 &&
      this.context.canvas.height > 0
    ) {
      this.gridRenderer.render(this.context.gl, {
        canvasWidth: this.context.canvas.width,
        canvasHeight: this.context.canvas.height,
        tracks,
        domain: state.domain,
      });
    }
  }

  /**
   * Draw a thick solid horizontal line at the bottom edge of the last
   * pinned channel, visually separating pinned from scrollable channels.
   */
  private _renderPinnedSeparator(): void {
    const gl = this.context.gl;
    const canvas = this.context.canvas;
    if (!gl || !canvas) return;

    const pinnedBottom = this.rootView.pinnedBottomY;
    if (pinnedBottom <= 0) return; // no pinned children

    const canvasH = canvas.height;
    const lineThickness = Math.round(2 * (window.devicePixelRatio || 1));
    // WebGL Y is flipped: 0 at bottom
    const glY = Math.max(0, Math.floor(canvasH - pinnedBottom - lineThickness));

    const color =
      this.context.theme === "light"
        ? [0.55, 0.55, 0.55, 1.0]
        : [0.5, 0.5, 0.5, 1.0];

    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, glY, canvas.width, lineThickness);
    gl.clearColor(color[0], color[1], color[2], color[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);
  }
}
