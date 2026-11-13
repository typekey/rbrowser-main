/**
 * AxisView — renders a genomic coordinate ruler using a 2D canvas overlay.
 * Placed at the top of the container by BaseRenderer when config.axis is defined.
 */
import { transcriptNavLayout, genomicToNavRatio, navRatioToGenomic, type TranscriptNavLayout } from "./transcript-nav-layout";
import { View } from "../core/view";
import { RenderingContext } from "../graph/context";
import { CDSCoordinateMapper, TranscriptFeature } from "../utils/cds";

/** A single cytoband entry parsed from a UCSC cytoband file. */
export interface CytobandEntry {
  chr: string;
  start: number;
  end: number;
  name: string;
  stain: string;
}

export interface IAxisConfig {
  /** Enable/disable the axis (default: true) */
  enabled?: boolean;
  /** Height of the axis row in CSS pixels (default: 30) */
  height?: number;
  /** Tick and label color. Defaults to theme-appropriate color. */
  color?: string;
  /** Background color of the axis row (default: "#f1f2f6") */
  backgroundColor?: string;
  /** Font size in CSS pixels (default: 11) */
  fontSize?: number;
  /** Approximate number of major ticks (default: auto based on width) */
  tickCount?: number;
  /** Number of minor ticks between major ticks (default: 4) */
  minorTickCount?: number;
  /** Height of major ticks in CSS pixels (default: 8) */
  majorTickHeight?: number;
  /** Height of minor ticks in CSS pixels (default: 4) */
  minorTickHeight?: number;
}

interface RenderState {
  domain: { start: number; end: number };
}

/**
 * AxisView
 *
 * Lifecycle mirrors ChannelView:
 *   layout() → called by LayoutView, positions the overlay
 *   mount()  → called by renderer.mount(), creates DOM elements
 *   render() → called every frame, redraws ticks/labels
 *   destroy()→ removes DOM elements
 */
export class AxisView extends View {
  private config: IAxisConfig;
  private renderingContext: RenderingContext;

  private overlayEl: HTMLDivElement | null = null;
  private axisCanvas: HTMLCanvasElement | null = null;
  private lastState: RenderState | null = null;

  // ── RNA mode state ────────────────────────────────────────────────────────
  /** When true, axis shows TSS-relative coordinates instead of genomic coords. */
  private _rnaMode: boolean = false;
  /** Genomic position of the TSS (transcription start site). */
  private _tssPos: number = 0;
  /** Strand of the transcript. "+" means upstream is to the left. */
  private _tssStrand: "+" | "-" =
    "+"; /** Genomic start of the current transcript (for highlight band). */
  private _txStart: number = 0;
  /** Genomic end of the current transcript (for highlight band). */
  private _txEnd: number = 0;
  // ── CDS mode state ──────────────────────────────────────────────────────
  /** When true, axis shows CDS-relative coordinates (0 = first CDS base). */
  private _cdsMode: boolean = false;
  /** CDS coordinate mapper used for label formatting. */
  private _cdsMapper: CDSCoordinateMapper | null = null;

  // ── Navigation overview bar state ─────────────────────────────────────────
  /** Total size of the current chromosome (0 = unknown / hidden). */
  private _chromSize: number = 0;
  /** Height of the navigation overview bar in CSS px. */
  private static readonly NAV_BAR_HEIGHT = 14;
  /** DOM element for the interactive nav bar (pointer events enabled). */
  private _navBarEl: HTMLDivElement | null = null;
  private _axisLabelEl: HTMLDivElement | null = null;
  private _chromosome = "";
  private _transcriptName = "";
  private _navDragLayout: TranscriptNavLayout | null = null;
  /** Callback fired when the user clicks/drags on the nav bar. Receives a new center position (genomic). */
  private _onNavClick: ((center: number) => void) | null = null;
  /** Callback fired when user resizes the viewport via edge drag. Receives (newStart, newEnd) in genomic coords. */
  private _onNavResize: ((start: number, end: number) => void) | null = null;
  /** Callback fired when user clicks/drags in transcript mode. Receives genomic center. */
  private _onTxNavClick: ((genomicCenter: number) => void) | null = null;
  /** Callback fired when user resizes viewport in transcript mode. Receives (gStart, gEnd) in genomic coords. */
  private _onTxNavResize: ((start: number, end: number) => void) | null = null;
  /** Cytoband entries for the current chromosome (for ideogram rendering). */
  private _cytobands: CytobandEntry[] = [];

  // ── Nav bar DOM viewport overlay ────────────────────────────────────────
  /** The DOM element for the viewport highlight box on the nav bar. */
  private _vpBoxEl: HTMLDivElement | null = null;
  /** Left edge resize handle. */
  private _vpLeftHandle: HTMLDivElement | null = null;
  /** Right edge resize handle. */
  private _vpRightHandle: HTMLDivElement | null = null;
  /** Transcript marker element on the nav bar. */
  private _txMarkerEl: HTMLDivElement | null = null;
  /** Tooltip element for cytoband hover. */
  private _navTooltipEl: HTMLDivElement | null = null;
  /** Timer for delayed tooltip show. */
  private _navTooltipTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Nav bar drag state ────────────────────────────────────────────────
  private _navDragMode: "none" | "pan" | "resize-left" | "resize-right" =
    "none";
  /** Genomic position at drag start (for offset calculation). */
  private _navDragStartCenter: number = 0;
  private _navDragStartDomainStart: number = 0;
  private _navDragStartDomainEnd: number = 0;

  // ── Active transcript genomic position (for nav marker) ─────────────
  private _activeTranscriptStart: number = 0;
  private _activeTranscriptEnd: number = 0;
  private _activeTranscriptMode: "dna" | "rna" | "cds" = "dna";

  // ── Transcript features for CDS nav bar ────────────────────────────
  private _txFeatures: TranscriptFeature[] = [];
  private _txFeatTxStart: number = 0;
  private _txFeatTxEnd: number = 0;
  private _txFeatUpFlank: number = 0;
  private _txFeatDownFlank: number = 0;
  private _txFeatStrand: "+" | "-" = "+";

  constructor(context: RenderingContext, config: IAxisConfig) {
    super();
    this.renderingContext = context;
    this.config = config;
  }

  private _genomicDomain(domain = this.lastState?.domain) {
    if (!domain) return { start: this._txFeatTxStart - this._txFeatUpFlank, end: this._txFeatTxEnd + this._txFeatDownFlank };
    return this._cdsMode && this._cdsMapper
      ? { start: this._cdsMapper.cdsToGenomic(domain.start), end: this._cdsMapper.cdsToGenomic(domain.end) }
      : domain;
  }

  private _getTxLayout(domain?: { start: number; end: number }): TranscriptNavLayout {
    if (!domain && this._navDragLayout) return this._navDragLayout;
    const genomic = this._genomicDomain(domain);
    const bodyLength = this._cdsMode && this._cdsMapper
      ? this._cdsMapper.genomicToCDS(this._txFeatTxEnd) - this._cdsMapper.genomicToCDS(this._txFeatTxStart)
      : this._txFeatTxEnd - this._txFeatTxStart;
    return transcriptNavLayout(this._txFeatTxStart, this._txFeatTxEnd, genomic.start, genomic.end, bodyLength);
  }

  private _txGenomicToRatio(position: number): number {
    return genomicToNavRatio(this._getTxLayout(), position);
  }

  private _txRatioToGenomic(ratio: number): number {
    return navRatioToGenomic(this._getTxLayout(), ratio);
  }

  private _axisLabel(): string {
    return this._activeTranscriptMode !== "dna" && this._transcriptName
      ? this._transcriptName + " | " + this._chromosome : this._chromosome;
  }

  private _labelWidth(width: number): number {
    return this._axisLabel() ? Math.min(this._axisLabel().length * 6 + 12, width * 0.35, 320) : 0;
  }

  private _endNavDrag(): void {
    this._navDragMode = "none";
    this._navDragLayout = null;
    if (this.lastState) this.drawAxis(this.lastState);
  }

  // ── View interface ──────────────────────────────────────────────────────────

  /** Axis is always pinned (sticky at top). */
  override get isPinned(): boolean {
    return true;
  }

  getPreferredHeight(): number | undefined {
    const base = this.config.height ?? 30;
    return this._chromSize > 0 ? base + AxisView.NAV_BAR_HEIGHT : base;
  }

  layout(x: number, y: number, width: number, height: number) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;

    const dpr = window.devicePixelRatio || 1;

    if (this.overlayEl) {
      this.overlayEl.style.top = `${y / dpr}px`;
      this.overlayEl.style.height = `${height / dpr}px`;
    }

    if (this.axisCanvas) {
      const cssW = width / dpr;
      const cssH = height / dpr;
      this.axisCanvas.style.width = `${cssW}px`;
      this.axisCanvas.style.height = `${cssH}px`;
      this.axisCanvas.width = Math.round(cssW * dpr);
      this.axisCanvas.height = Math.round(cssH * dpr);
    }

    if (this.lastState) this.drawAxis(this.lastState);
  }

  render(state: RenderState) {
    this.lastState = state;
    this.drawAxis(state);
  }

  // ── RNA mode API ─────────────────────────────────────────────────────────

  /**
   * Enable or disable RNA (TSS-relative) axis mode.
   * enabled=true → offsets from TSS; enabled=false → genomic coords.
   */
  setRnaMode(
    enabled: boolean,
    tssPos?: number,
    strand?: "+" | "-",
    txStart?: number,
    txEnd?: number,
  ): void {
    this._rnaMode = enabled;
    if (enabled && tssPos !== undefined) {
      this._tssPos = tssPos;
      this._tssStrand = strand ?? "+";
      this._txStart = txStart ?? tssPos;
      this._txEnd = txEnd ?? tssPos;
    }
    if (this.lastState) this.drawAxis(this.lastState);
  }

  /**
   * Enable or disable CDS axis mode.
   *
   * In CDS mode the domain is already in CDS coordinates (0 = first CDS base).
   * The axis simply formats these as signed offsets.
   */
  setCdsMode(enabled: boolean, mapper?: CDSCoordinateMapper): void {
    this._cdsMode = enabled;
    if (enabled && mapper) {
      this._cdsMapper = mapper;
    } else if (!enabled) {
      this._cdsMapper = null;
    }
    if (this.lastState) this.drawAxis(this.lastState);
  }

  // ── Navigation overview bar API ────────────────────────────────────────────

  /**
   * Set the total chromosome size for the navigation overview bar.
   * Pass 0 to hide the bar.
   */
  setChromSize(
    size: number,
    onNavClick?: (center: number) => void,
    onNavResize?: (start: number, end: number) => void,
  ): void {
    this._chromSize = size;
    if (onNavClick) this._onNavClick = onNavClick;
    if (onNavResize) this._onNavResize = onNavResize;
    if (this._navBarEl)
      this._navBarEl.style.display = size > 0 ? "block" : "none";
    if (this.lastState) this.drawAxis(this.lastState);
  }

  /** Set cytoband entries for the current chromosome. */
  setCytobands(bands: CytobandEntry[]): void {
    this._cytobands = bands;
    if (this.lastState) this.drawAxis(this.lastState);
  }

  /** Set the active transcript region for the nav bar marker. */
  setActiveTranscript(
    txStart: number,
    txEnd: number,
    mode: "dna" | "rna" | "cds",
    identity?: { chromosome: string; transcriptName: string },
  ): void {
    this._activeTranscriptStart = txStart;
    this._activeTranscriptEnd = txEnd;
    this._activeTranscriptMode = mode;
    if (identity) {
      this._chromosome = identity.chromosome;
      this._transcriptName = identity.transcriptName;
    }
    if (this.lastState) this.drawAxis(this.lastState);
  }

  /** Set transcript features for the CDS/RNA-mode transcript nav bar. */
  setTranscriptFeatures(
    features: TranscriptFeature[],
    txStart: number,
    txEnd: number,
    upFlank: number,
    downFlank: number,
    strand: "+" | "-",
    onTxNavClick?: (genomicCenter: number) => void,
    onTxNavResize?: (start: number, end: number) => void,
  ): void {
    this._txFeatures = features;
    this._txFeatTxStart = txStart;
    this._txFeatTxEnd = txEnd;
    this._txFeatUpFlank = upFlank;
    this._txFeatDownFlank = downFlank;
    this._txFeatStrand = strand;
    if (onTxNavClick) this._onTxNavClick = onTxNavClick;
    if (onTxNavResize) this._onTxNavResize = onTxNavResize;
    if (this.lastState) this.drawAxis(this.lastState);
  }

  // ── DOM lifecycle ───────────────────────────────────────────────────────────

  mount(container: HTMLElement) {
    const dpr = window.devicePixelRatio || 1;

    this.overlayEl = document.createElement("div");
    this.overlayEl.style.position = "absolute";
    this.overlayEl.style.left = "0";
    this.overlayEl.style.right = "0";
    this.overlayEl.style.top = `${this.y / dpr}px`;
    this.overlayEl.style.height = `${this.height / dpr}px`;
    this.overlayEl.style.pointerEvents = "none";
    this.overlayEl.style.zIndex = "1001";
    this.overlayEl.style.overflow = "hidden";

    this.axisCanvas = document.createElement("canvas");
    const cssW = this.width / dpr;
    const cssH = this.height / dpr;
    this.axisCanvas.style.width = `${cssW}px`;
    this.axisCanvas.style.height = `${cssH}px`;
    this.axisCanvas.style.display = "block";
    this.axisCanvas.width = Math.round(cssW * dpr);
    this.axisCanvas.height = Math.round(cssH * dpr);

    this.overlayEl.appendChild(this.axisCanvas);

    // ── Navigation bar overlay (interactive) ──────────────────────────
    this._axisLabelEl = document.createElement("div");
    this._axisLabelEl.className = "axis-context-label";
    this._axisLabelEl.setAttribute("role", "note");
    this._axisLabelEl.setAttribute("aria-label", "Axis context");
    Object.assign(this._axisLabelEl.style, {
      position: "absolute", left: "0", top: "0", height: AxisView.NAV_BAR_HEIGHT + "px",
      lineHeight: AxisView.NAV_BAR_HEIGHT + "px", font: "700 10px Roboto, Helvetica, sans-serif",
      display: "flex", alignItems: "center", padding: "0 5px", boxSizing: "border-box",
      whiteSpace: "nowrap", overflow: "hidden", pointerEvents: "none",
    });
    this.overlayEl.appendChild(this._axisLabelEl);
    this._navBarEl = document.createElement("div");
    this._navBarEl.className = "axis-overview";
    this._navBarEl.setAttribute("role", "group");
    this._navBarEl.setAttribute("aria-label", "Axis overview");
    this._navBarEl.style.position = "absolute";
    this._navBarEl.style.left = "0";
    this._navBarEl.style.right = "0";
    this._navBarEl.style.top = "0";
    this._navBarEl.style.height = `${AxisView.NAV_BAR_HEIGHT}px`;
    this._navBarEl.style.pointerEvents = "auto";
    this._navBarEl.style.cursor = "pointer";
    this._navBarEl.style.display = this._chromSize > 0 ? "block" : "none";

    // ── Viewport highlight box (DOM) ──────────────────────────────────
    this._vpBoxEl = document.createElement("div");
    this._vpBoxEl.style.position = "absolute";
    this._vpBoxEl.style.top = "0";
    this._vpBoxEl.style.height = `${AxisView.NAV_BAR_HEIGHT}px`;
    this._vpBoxEl.style.boxSizing = "border-box";
    this._vpBoxEl.style.borderTop = "1px solid rgba(100,149,237,0.35)";
    this._vpBoxEl.style.borderBottom = "1px solid rgba(100,149,237,0.35)";
    this._vpBoxEl.style.borderLeft = "2px solid rgba(100,149,237,0.9)";
    this._vpBoxEl.style.borderRight = "2px solid rgba(100,149,237,0.9)";
    this._vpBoxEl.style.backgroundColor = "rgba(100,149,237,0.35)";
    this._vpBoxEl.style.pointerEvents = "none"; // handles are interactive
    this._vpBoxEl.style.display = "none";
    this._vpBoxEl.style.zIndex = "2";

    // ── Left resize handle ────────────────────────────────────────────
    this._vpLeftHandle = document.createElement("div");
    this._vpLeftHandle.setAttribute("aria-label", "Viewport left edge");
    this._vpLeftHandle.style.position = "absolute";
    this._vpLeftHandle.style.left = "-3px";
    this._vpLeftHandle.style.top = "0";
    this._vpLeftHandle.style.width = "6px";
    this._vpLeftHandle.style.height = "100%";
    this._vpLeftHandle.style.cursor = "col-resize";
    this._vpLeftHandle.style.pointerEvents = "auto";
    this._vpLeftHandle.style.zIndex = "4";
    this._vpBoxEl.appendChild(this._vpLeftHandle);

    // ── Right resize handle ───────────────────────────────────────────
    this._vpRightHandle = document.createElement("div");
    this._vpRightHandle.setAttribute("aria-label", "Viewport right edge");
    this._vpRightHandle.style.position = "absolute";
    this._vpRightHandle.style.right = "-3px";
    this._vpRightHandle.style.top = "0";
    this._vpRightHandle.style.width = "6px";
    this._vpRightHandle.style.height = "100%";
    this._vpRightHandle.style.cursor = "col-resize";
    this._vpRightHandle.style.pointerEvents = "auto";
    this._vpRightHandle.style.zIndex = "4";
    this._vpBoxEl.appendChild(this._vpRightHandle);

    this._navBarEl.appendChild(this._vpBoxEl);

    // ── Transcript marker ─────────────────────────────────────────────
    this._txMarkerEl = document.createElement("div");
    this._txMarkerEl.style.position = "absolute";
    this._txMarkerEl.style.top = "0";
    this._txMarkerEl.style.height = `${AxisView.NAV_BAR_HEIGHT}px`;
    this._txMarkerEl.style.pointerEvents = "none";
    this._txMarkerEl.style.display = "none";
    this._txMarkerEl.style.zIndex = "3";
    this._txMarkerEl.style.opacity = "0.7";
    this._navBarEl.appendChild(this._txMarkerEl);

    // ── Cytoband tooltip ──────────────────────────────────────────────
    this._navTooltipEl = document.createElement("div");
    this._navTooltipEl.style.position = "fixed";
    this._navTooltipEl.style.padding = "3px 7px";
    this._navTooltipEl.style.fontSize = "11px";
    this._navTooltipEl.style.lineHeight = "1.3";
    this._navTooltipEl.style.borderRadius = "4px";
    this._navTooltipEl.style.pointerEvents = "none";
    this._navTooltipEl.style.whiteSpace = "nowrap";
    this._navTooltipEl.style.zIndex = "9999";
    this._navTooltipEl.style.display = "none";
    this._navTooltipEl.style.backgroundColor = "rgba(30,30,30,0.92)";
    this._navTooltipEl.style.color = "#eee";
    this._navTooltipEl.style.boxShadow = "0 1px 4px rgba(0,0,0,0.3)";
    document.body.appendChild(this._navTooltipEl);

    // ── Pointer interactions ──────────────────────────────────────────
    this._setupNavBarInteractions();

    this.overlayEl.appendChild(this._navBarEl);
    container.appendChild(this.overlayEl);

    if (this.lastState) this.drawAxis(this.lastState);
  }

  /**
   * Set up all nav-bar pointer interactions: click-to-center, viewport pan,
   * edge resize, cytoband tooltip.
   */
  private _setupNavBarInteractions(): void {
    if (!this._navBarEl || !this._vpLeftHandle || !this._vpRightHandle) return;

    /** Whether the nav bar currently shows a transcript ideogram. */
    const hasTxIdeogram = (): boolean =>
      this._txFeatures.length > 0 && (this._cdsMode || this._rnaMode);

    // ── Helper: pixel → genomic position (chromosome scale) ───────────
    const pxToGenomic = (clientX: number): number => {
      const rect = this._navBarEl!.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );
      return Math.round(ratio * this._chromSize);
    };

    // ── Helper: pixel → genomic position (transcript scale) ───────────
    const pxToTxGenomic = (clientX: number): number => {
      const rect = this._navBarEl!.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );
      return this._txRatioToGenomic(ratio);
    };

    // ── Edge hover: bold border feedback ──────────────────────────────
    const updateEdgeBorder = (hoveredEdge: "left" | "right" | null): void => {
      if (!this._vpBoxEl) return;
      const base = "2px solid rgba(100,149,237,0.9)";
      const bold = "3px solid rgba(100,149,237,1)";
      if (hoveredEdge === "left") {
        this._vpBoxEl.style.borderLeft = bold;
        this._vpBoxEl.style.borderRight = base;
      } else if (hoveredEdge === "right") {
        this._vpBoxEl.style.borderRight = bold;
        this._vpBoxEl.style.borderLeft = base;
      } else {
        this._vpBoxEl.style.borderLeft = base;
        this._vpBoxEl.style.borderRight = base;
      }
    };

    // ── Left handle events ────────────────────────────────────────────
    this._vpLeftHandle.addEventListener("pointerenter", () => {
      updateEdgeBorder("left");
    });
    this._vpLeftHandle.addEventListener("pointerleave", () => {
      if (this._navDragMode !== "resize-left") updateEdgeBorder(null);
    });
    this._vpLeftHandle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._navDragLayout = this._getTxLayout();
      this._navDragMode = "resize-left";
      this._vpLeftHandle!.setPointerCapture(e.pointerId);
      if (this.lastState) {
        this._navDragStartDomainStart = this._genomicDomain().start;
        this._navDragStartDomainEnd = this._genomicDomain().end;
      }
      updateEdgeBorder("left");
    });
    this._vpLeftHandle.addEventListener("pointermove", (e) => {
      if (this._navDragMode !== "resize-left") return;
      if (hasTxIdeogram()) {
        const gPos = pxToTxGenomic(e.clientX);
        const rangeStart = 0;
        const minSpan = 100;
        const clampedStart = Math.max(
          rangeStart,
          Math.min(gPos, this._navDragStartDomainEnd - minSpan),
        );
        if (this._onTxNavResize)
          this._onTxNavResize(clampedStart, this._navDragStartDomainEnd);
      } else {
        const newStart = pxToGenomic(e.clientX);
        const minSpan = Math.max(1000, this._chromSize * 0.001);
        const clampedStart = Math.max(
          0,
          Math.min(newStart, this._navDragStartDomainEnd - minSpan),
        );
        if (this._onNavResize)
          this._onNavResize(clampedStart, this._navDragStartDomainEnd);
      }
    });
    this._vpLeftHandle.addEventListener("pointerup", (e) => {
      this._endNavDrag();
      this._vpLeftHandle!.releasePointerCapture(e.pointerId);
      updateEdgeBorder(null);
    });
    this._vpLeftHandle.addEventListener("pointercancel", () => {
      this._endNavDrag();
      updateEdgeBorder(null);
    });

    // ── Right handle events ───────────────────────────────────────────
    this._vpRightHandle.addEventListener("pointerenter", () => {
      updateEdgeBorder("right");
    });
    this._vpRightHandle.addEventListener("pointerleave", () => {
      if (this._navDragMode !== "resize-right") updateEdgeBorder(null);
    });
    this._vpRightHandle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._navDragLayout = this._getTxLayout();
      this._navDragMode = "resize-right";
      this._vpRightHandle!.setPointerCapture(e.pointerId);
      if (this.lastState) {
        this._navDragStartDomainStart = this._genomicDomain().start;
        this._navDragStartDomainEnd = this._genomicDomain().end;
      }
      updateEdgeBorder("right");
    });
    this._vpRightHandle.addEventListener("pointermove", (e) => {
      if (this._navDragMode !== "resize-right") return;
      if (hasTxIdeogram()) {
        const gPos = pxToTxGenomic(e.clientX);
        const rangeEnd = this._chromSize;
        const minSpan = 100;
        const clampedEnd = Math.min(
          rangeEnd,
          Math.max(gPos, this._navDragStartDomainStart + minSpan),
        );
        if (this._onTxNavResize)
          this._onTxNavResize(this._navDragStartDomainStart, clampedEnd);
      } else {
        const newEnd = pxToGenomic(e.clientX);
        const minSpan = Math.max(1000, this._chromSize * 0.001);
        const clampedEnd = Math.min(
          this._chromSize,
          Math.max(newEnd, this._navDragStartDomainStart + minSpan),
        );
        if (this._onNavResize)
          this._onNavResize(this._navDragStartDomainStart, clampedEnd);
      }
    });
    this._vpRightHandle.addEventListener("pointerup", (e) => {
      this._endNavDrag();
      this._vpRightHandle!.releasePointerCapture(e.pointerId);
      updateEdgeBorder(null);
    });
    this._vpRightHandle.addEventListener("pointercancel", () => {
      this._endNavDrag();
      updateEdgeBorder(null);
    });

    // ── Nav bar: click-to-center + viewport pan ───────────────────────
    let panStartX = 0;
    let panStartCenter = 0;
    let panStartSpan = 0;
    let panTxMode = false; // true when pan started in transcript ideogram mode

    this._navBarEl.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      panTxMode = hasTxIdeogram();
      if (panTxMode) this._navDragLayout = this._getTxLayout();

      if (panTxMode) {
        // ── Transcript mode: navigate within transcript range ──────
        // Check if clicking inside viewport box
        if (this.lastState && this._cdsMapper && this._cdsMode) {
          const rect = this._navBarEl!.getBoundingClientRect();
          const gStart = this._cdsMapper.cdsToGenomic(
            this.lastState.domain.start,
          );
          const gEnd = this._cdsMapper.cdsToGenomic(this.lastState.domain.end);
          const vpLeftPx = this._txGenomicToRatio(gStart) * rect.width;
          const vpRightPx = this._txGenomicToRatio(gEnd) * rect.width;
          const localX = e.clientX - rect.left;

          if (localX >= vpLeftPx && localX <= vpRightPx) {
            this._navDragMode = "pan";
            this._navBarEl!.setPointerCapture(e.pointerId);
            panStartX = e.clientX;
            panStartCenter = (gStart + gEnd) / 2;
            panStartSpan = gEnd - gStart;
            this._navBarEl!.style.cursor = "grabbing";
            return;
          }
        } else if (this.lastState && this._rnaMode) {
          const rect = this._navBarEl!.getBoundingClientRect();
          const gStart = this.lastState.domain.start;
          const gEnd = this.lastState.domain.end;
          const vpLeftPx = this._txGenomicToRatio(gStart) * rect.width;
          const vpRightPx = this._txGenomicToRatio(gEnd) * rect.width;
          const localX = e.clientX - rect.left;

          if (localX >= vpLeftPx && localX <= vpRightPx) {
            this._navDragMode = "pan";
            this._navBarEl!.setPointerCapture(e.pointerId);
            panStartX = e.clientX;
            panStartCenter = (gStart + gEnd) / 2;
            panStartSpan = gEnd - gStart;
            this._navBarEl!.style.cursor = "grabbing";
            return;
          }
        }

        // Click outside viewport → jump center
        this._navDragMode = "pan";
        this._navBarEl!.setPointerCapture(e.pointerId);
        const gCenter = pxToTxGenomic(e.clientX);
        if (this._onTxNavClick) this._onTxNavClick(gCenter);
        panStartX = e.clientX;
        panStartCenter = gCenter;
        if (this.lastState) {
          if (this._cdsMode && this._cdsMapper) {
            const gS = this._cdsMapper.cdsToGenomic(
              this.lastState.domain.start,
            );
            const gE = this._cdsMapper.cdsToGenomic(this.lastState.domain.end);
            panStartSpan = gE - gS;
          } else {
            panStartSpan =
              this.lastState.domain.end - this.lastState.domain.start;
          }
        }
        this._navBarEl!.style.cursor = "grabbing";
      } else {
        // ── Chromosome mode: original DNA behavior ────────────────
        // Check if we're clicking on the viewport box area
        if (this.lastState && this._chromSize > 0) {
          const rect = this._navBarEl!.getBoundingClientRect();
          const barW = rect.width;
          const domainStart = this.lastState.domain.start;
          const domainEnd = this.lastState.domain.end;
          const vpLeftPx = (domainStart / this._chromSize) * barW;
          const vpRightPx = (domainEnd / this._chromSize) * barW;
          const localX = e.clientX - rect.left;

          if (localX >= vpLeftPx && localX <= vpRightPx) {
            this._navDragMode = "pan";
            this._navBarEl!.setPointerCapture(e.pointerId);
            panStartX = e.clientX;
            panStartCenter = (domainStart + domainEnd) / 2;
            panStartSpan = domainEnd - domainStart;
            this._navBarEl!.style.cursor = "grabbing";
            return;
          }
        }
        // Click outside viewport → click-to-center
        this._navDragMode = "pan";
        this._navBarEl!.setPointerCapture(e.pointerId);
        const center = pxToGenomic(e.clientX);
        if (this._onNavClick) this._onNavClick(center);
        if (this.lastState) {
          panStartX = e.clientX;
          const span = this.lastState.domain.end - this.lastState.domain.start;
          panStartCenter = center;
          panStartSpan = span;
        }
        this._navBarEl!.style.cursor = "grabbing";
      }
    });

    this._navBarEl.addEventListener("pointermove", (e) => {
      if (this._navDragMode === "pan") {
        const rect = this._navBarEl!.getBoundingClientRect();
        const dx = e.clientX - panStartX;

        if (panTxMode) {
          // Transcript mode pan — compute delta via ratio helpers
          const rangeStart = 0;
          const rangeEnd = this._chromSize;
          const startRatio = (panStartX - rect.left) / rect.width;
          const curRatio = (e.clientX - rect.left) / rect.width;
          const dGenomic =
            this._txRatioToGenomic(curRatio) -
            this._txRatioToGenomic(startRatio);
          let newCenter = panStartCenter + dGenomic;
          const halfSpan = panStartSpan / 2;
          newCenter = Math.max(
            rangeStart + halfSpan,
            Math.min(rangeEnd - halfSpan, newCenter),
          );
          if (this._onTxNavClick) this._onTxNavClick(Math.round(newCenter));
        } else {
          // Chromosome mode pan
          const dGenomic = (dx / rect.width) * this._chromSize;
          let newCenter = panStartCenter + dGenomic;
          const halfSpan = panStartSpan / 2;
          newCenter = Math.max(
            halfSpan,
            Math.min(this._chromSize - halfSpan, newCenter),
          );
          if (this._onNavClick) this._onNavClick(Math.round(newCenter));
        }
        return;
      }
      if (this._navDragMode === "none") {
        // Hover: show tooltip
        this._handleNavTooltip(e);
      }
    });

    this._navBarEl.addEventListener("pointerup", (e) => {
      if (this._navDragMode === "pan") {
        this._endNavDrag();
        this._navBarEl!.releasePointerCapture(e.pointerId);
        this._navBarEl!.style.cursor = "pointer";
      }
    });
    this._navBarEl.addEventListener("pointercancel", () => {
      this._endNavDrag();
      this._navBarEl!.style.cursor = "pointer";
    });

    // ── Tooltip hide on leave ─────────────────────────────────────────
    this._navBarEl.addEventListener("pointerleave", () => {
      this._hideNavTooltip();
    });
  }

  /** Show cytoband or transcript feature tooltip near the cursor. */
  private _handleNavTooltip(e: PointerEvent): void {
    if (!this._navTooltipEl || !this._navBarEl) return;

    const rect = this._navBarEl.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );

    // ── Transcript ideogram tooltip ───────────────────────────────────
    if (
      this._txFeatures.length > 0 &&
      (this._cdsMode || this._rnaMode) &&
      this._txFeatTxEnd > this._txFeatTxStart
    ) {
      const pos = this._txRatioToGenomic(ratio);

      // Determine region name
      let label: string;
      if (pos < this._txFeatTxStart || pos > this._txFeatTxEnd) {
        // In flanking region — show actual left or right flank distance
        const isLeft = pos < this._txFeatTxStart;
        const layout = this._getTxLayout();
        const flankVal = isLeft ? layout.leftLength : layout.rightLength;
        const flankLabel =
          flankVal >= 1000
            ? `${(flankVal / 1000).toFixed(flankVal % 1000 === 0 ? 0 : 1)}kb`
            : `${flankVal}bp`;
        label = `Flanking (${flankLabel})`;
      } else {
        // Find the most specific feature at this position (highest draw order)
        // Priority: start/stop_codon > CDS > UTR > exon > intron
        const priority: Record<string, number> = {
          start_codon: 5,
          stop_codon: 5,
          CDS: 4,
          five_prime_UTR: 3,
          three_prime_UTR: 3,
          exon: 2,
        };
        const featureLabels: Record<string, string> = {
          CDS: "CDS",
          exon: "Exon",
          five_prime_UTR: "5\u2032 UTR",
          three_prime_UTR: "3\u2032 UTR",
          start_codon: "Start Codon",
          stop_codon: "Stop Codon",
        };
        let bestFeature: string | null = null;
        let bestPrio = -1;
        for (const feat of this._txFeatures) {
          if (pos >= feat.start && pos < feat.end) {
            const p = priority[feat.type] ?? 0;
            if (p > bestPrio) {
              bestPrio = p;
              bestFeature = feat.type;
            }
          }
        }
        label = bestFeature
          ? (featureLabels[bestFeature] ?? bestFeature)
          : "Intron";
      }

      if (this._navTooltipTimer) {
        clearTimeout(this._navTooltipTimer);
        this._navTooltipTimer = null;
      }
      this._navTooltipEl.textContent = label;
      this._navTooltipEl.style.left = `${e.clientX + 10}px`;
      this._navTooltipEl.style.top = `${rect.bottom + 4}px`;
      this._navTooltipEl.style.display = "block";
      return;
    }

    // ── Cytoband tooltip ──────────────────────────────────────────────
    if (this._cytobands.length === 0 || this._chromSize <= 0) return;

    const pos = Math.round(ratio * this._chromSize);

    // Find the band containing this position
    const band = this._cytobands.find((b) => pos >= b.start && pos < b.end);
    if (!band) {
      this._hideNavTooltip();
      return;
    }

    // Clear any pending timer
    if (this._navTooltipTimer) {
      clearTimeout(this._navTooltipTimer);
      this._navTooltipTimer = null;
    }

    // Format band info
    this._navTooltipEl.textContent = band.name;
    this._navTooltipEl.style.left = `${e.clientX + 10}px`;
    this._navTooltipEl.style.top = `${rect.bottom + 4}px`;
    this._navTooltipEl.style.display = "block";
  }

  /** Hide the nav bar tooltip. */
  private _hideNavTooltip(): void {
    if (this._navTooltipTimer) {
      clearTimeout(this._navTooltipTimer);
      this._navTooltipTimer = null;
    }
    if (this._navTooltipEl) this._navTooltipEl.style.display = "none";
  }

  destroy() {
    if (this.overlayEl?.parentElement) {
      this.overlayEl.parentElement.removeChild(this.overlayEl);
    }
    if (this._navTooltipEl?.parentElement) {
      this._navTooltipEl.parentElement.removeChild(this._navTooltipEl);
    }
    this.overlayEl = null;
    this.axisCanvas = null;
    this._navBarEl = null;
    this._axisLabelEl = null;
    this._vpBoxEl = null;
    this._vpLeftHandle = null;
    this._vpRightHandle = null;
    this._txMarkerEl = null;
    this._navTooltipEl = null;
  }

  // ── Drawing ─────────────────────────────────────────────────────────────────

  private drawAxis(state: RenderState) {
    if (!this.axisCanvas) return;
    const ctx = this.axisCanvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = this.axisCanvas.width;
    const h = this.axisCanvas.height;

    // Guard: skip drawing when canvas is too small (layout not ready)
    if (w < 8 * dpr || h < 4 * dpr) return;

    const isDark = this.renderingContext.theme === "dark";
    const tickColor = this.config.color ?? (isDark ? "#aaaaaa" : "#757d8c");
    const textColor = isDark ? "#cccccc" : "#2f3542";
    const bgColor =
      this.config.backgroundColor ?? (isDark ? "#2a2a2a" : "#f1f2f6");
    const separatorColor = isDark ? "#666666" : "#757d8c";
    const fontSize = (this.config.fontSize ?? 10) * dpr;
    const majorTickH = (this.config.majorTickHeight ?? 8) * dpr;
    const minorTickH = (this.config.minorTickHeight ?? 4) * dpr;
    const MINOR_COUNT = this.config.minorTickCount ?? 4;

    // ── Navigation overview bar height (in device px) ──
    const navH = this._chromSize > 0 ? AxisView.NAV_BAR_HEIGHT * dpr : 0;
    // Tick area starts below the nav bar
    const tickAreaTop = navH;
    const tickAreaH = h - navH;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    if (this._navBarEl) {
      this._navBarEl.style.display = this._chromSize > 0 ? "block" : "none";
    }

    const domainStart = state.domain.start;
    const domainEnd = state.domain.end;
    const domainLen = domainEnd - domainStart;
    if (domainLen <= 0) return;

    // ── Draw navigation overview bar ─────────────────────────────────────
    if (this._chromSize > 0 && navH > 0) {
      const navBg = isDark ? "#1e1e1e" : "#e8e9ed";
      const navBarPad = 2 * dpr;

      // Nav bar background
      ctx.fillStyle = navBg;
      ctx.fillRect(0, 0, w, navH);

      // Chromosome track bar
      const trackY = navBarPad;
      const trackH = navH - navBarPad * 2;
      const labelWidth = this._labelWidth(w / dpr);
      const trackL = (labelWidth + 2) * dpr;
      const trackW = Math.max(1, w - trackL - 2 * dpr);
      if (this._navBarEl) {
        this._navBarEl.style.left = (trackL / dpr) + "px";
        this._navBarEl.style.right = "2px";
        const layout = this._getTxLayout();
        this._navBarEl.dataset.leftRatio = String(layout.leftRatio);
        this._navBarEl.dataset.bodyRatio = String(layout.bodyRatio);
        this._navBarEl.dataset.rightRatio = String(layout.rightRatio);
        this._navBarEl.dataset.leftFlank = String(layout.leftLength);
        this._navBarEl.dataset.rightFlank = String(layout.rightLength);
      }
      const axisLabel = this._axisLabel();
      if (this._axisLabelEl) {
        this._axisLabelEl.textContent = axisLabel;
        this._axisLabelEl.title = axisLabel;
        this._axisLabelEl.style.width = labelWidth + "px";
        this._axisLabelEl.style.backgroundColor = navBg;
        this._axisLabelEl.style.color = isDark ? "#eeeeee" : "#353b48";
      }
      // Keep the label in the canvas too, for bitmap exports.
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, labelWidth * dpr, navH); ctx.clip();
      ctx.font = "700 " + (10 * dpr) + "px Roboto, Helvetica, sans-serif";
      ctx.fillStyle = isDark ? "#eeeeee" : "#353b48";
      ctx.textBaseline = "middle"; ctx.textAlign = "left";
      ctx.fillText(axisLabel, 5 * dpr, navH / 2);
      ctx.restore();
      const r = Math.min(trackH / 2, 3 * dpr);

      if ((this._cdsMode || this._rnaMode) && this._txFeatures.length > 0) {
        // ── Draw transcript structure ideogram (CDS/RNA mode) ────────
        this._drawTranscriptIdeogram(
          ctx,
          trackL,
          trackY,
          trackW,
          trackH,
          r,
          isDark,
          dpr,
        );
      } else if (this._cytobands.length > 0) {
        // ── Draw cytoband ideogram ────────────────────────────────────
        this._drawCytobandIdeogram(
          ctx,
          trackL,
          trackY,
          trackW,
          trackH,
          r,
          isDark,
          dpr,
        );
      } else {
        // ── Fallback: plain gray bar ──────────────────────────────────
        const trackColor = isDark ? "#3a3a3a" : "#d1d2d6";
        ctx.fillStyle = trackColor;
        ctx.beginPath();
        this._roundRect(ctx, trackL, trackY, trackW, trackH, r);
        ctx.fill();
      }

      // Viewport highlight: update DOM overlay instead of canvas
      if (
        (this._cdsMode || this._rnaMode) &&
        this._txFeatures.length > 0 &&
        this._txFeatTxEnd > 0
      ) {
        // Transcript mode: map domain using the same dynamic layout as the features
        if (this._vpBoxEl) {
          let gStart: number;
          let gEnd: number;
          if (this._cdsMode && this._cdsMapper) {
            gStart = this._cdsMapper.cdsToGenomic(domainStart);
            gEnd = this._cdsMapper.cdsToGenomic(domainEnd);
          } else {
            // RNA mode: domain is already genomic
            gStart = domainStart;
            gEnd = domainEnd;
          }
          let vpLeftRatio = Math.max(
            0,
            Math.min(1, this._txGenomicToRatio(gStart)),
          );
          let vpRightRatio = Math.max(
            0,
            Math.min(1, this._txGenomicToRatio(gEnd)),
          );
          // Ensure minimum visible width (at least 0.5% of bar)
          const minW = 0.005;
          if (vpRightRatio - vpLeftRatio < minW) {
            const mid = (vpLeftRatio + vpRightRatio) / 2;
            vpLeftRatio = Math.max(0, mid - minW / 2);
            vpRightRatio = Math.min(1, vpLeftRatio + minW);
          }
          this._vpBoxEl.style.display = "block";
          this._vpBoxEl.style.left = `${(vpLeftRatio * 100).toFixed(4)}%`;
          this._vpBoxEl.style.width = `${((vpRightRatio - vpLeftRatio) * 100).toFixed(4)}%`;
        }
      } else {
        const vpLeftRatio = Math.max(0, domainStart / this._chromSize);
        const vpRightRatio = Math.min(1, domainEnd / this._chromSize);
        if (this._vpBoxEl) {
          this._vpBoxEl.style.display = "block";
          this._vpBoxEl.style.left = `${(vpLeftRatio * 100).toFixed(4)}%`;
          this._vpBoxEl.style.width = `${((vpRightRatio - vpLeftRatio) * 100).toFixed(4)}%`;
        }
      }

      // Transcript marker on the nav bar (hidden when ideogram replaces it)
      if ((this._cdsMode || this._rnaMode) && this._txFeatures.length > 0) {
        if (this._txMarkerEl) this._txMarkerEl.style.display = "none";
      } else if (
        this._txMarkerEl &&
        this._activeTranscriptStart > 0 &&
        this._activeTranscriptEnd > 0
      ) {
        const txLeftRatio = Math.max(
          0,
          this._activeTranscriptStart / this._chromSize,
        );
        const txRightRatio = Math.min(
          1,
          this._activeTranscriptEnd / this._chromSize,
        );
        const txWidthPct = (txRightRatio - txLeftRatio) * 100;
        // Ensure minimum 10 CSS px display width via minWidth
        this._txMarkerEl.style.display = "block";
        this._txMarkerEl.style.left = `${(txLeftRatio * 100).toFixed(4)}%`;
        this._txMarkerEl.style.width = `${txWidthPct.toFixed(4)}%`;
        this._txMarkerEl.style.minWidth = "4px";

        // Color: dark green
        this._txMarkerEl.style.backgroundColor = "rgba(0,100,0,0.7)";
      } else if (this._txMarkerEl) {
        this._txMarkerEl.style.display = "none";
      }

      // Store the domain info for pointer hit testing
      (this as any)._lastNavDomainStart = domainStart;
      (this as any)._lastNavDomainEnd = domainEnd;
    }

    // A standalone ruler keeps its top border; the overview-to-ruler join
    // stays open so no full-width line competes with the navigation track.
    if (navH === 0) {
      ctx.strokeStyle = separatorColor;
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, 0.5 * dpr);
      ctx.lineTo(w, 0.5 * dpr);
      ctx.stroke();
    }

    // Pick a nice major tick interval
    const targetTicks =
      this.config.tickCount ?? Math.max(4, Math.floor(w / dpr / 100));
    const rawInterval = domainLen / targetTicks;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
    const normalized = rawInterval / magnitude;
    let majorInterval: number;
    if (normalized < 1.5) majorInterval = magnitude;
    else if (normalized < 3.5) majorInterval = 2 * magnitude;
    else if (normalized < 7.5) majorInterval = 5 * magnitude;
    else majorInterval = 10 * magnitude;

    // At base-pair level the interval must be ≥ 1 (no sub-bp ticks)
    if (majorInterval < 1) majorInterval = 1;

    let minorInterval = majorInterval / (MINOR_COUNT + 1);
    // Genomic coordinates are integers – never draw sub-bp minor ticks.
    // Suppress minor ticks entirely when the computed interval would be < 1 bp.
    const suppressMinor = minorInterval < 1;
    if (suppressMinor) minorInterval = majorInterval; // skip minor iteration

    // Ticks hang DOWN from the top edge of the tick area
    const tickTop = tickAreaTop + 1 * dpr;

    ctx.strokeStyle = tickColor;
    ctx.font = `${fontSize}px Calibre, Roboto, Helvetica, sans-serif`;
    ctx.lineWidth = 1 * dpr;

    // Determine start of iteration.
    // RNA mode: anchor the grid to the TSS so offset 0 is always a major tick.
    // CDS mode: anchor to the CDS "zero" point (0 for + strand,
    //           totalCDSLength for - strand, i.e. the start codon position).
    // DNA mode: align to 1-based display coordinates (e.g. 7771295, 7771300).
    const cdsAnchor = this._cdsMapper
      ? this._cdsMapper.strand === "-"
        ? this._cdsMapper.totalCDSLength
        : 0
      : 0;
    const iterStart = this._rnaMode
      ? this._tssPos +
        Math.ceil((domainStart - this._tssPos) / minorInterval) * minorInterval
      : this._cdsMode
        ? cdsAnchor +
          Math.ceil((domainStart - cdsAnchor) / minorInterval) * minorInterval
        : Math.ceil((domainStart + 1) / minorInterval) * minorInterval; // +1 to get 1-based values

    for (
      let tick = iterStart;
      tick <=
      domainEnd +
        minorInterval * 0.5 +
        (this._rnaMode || this._cdsMode ? 0 : 1); // +1 only for DNA mode
      tick += minorInterval
    ) {
      // In DNA mode: tick is 1-based display coord, convert to 0-based position
      // In RNA/CDS mode: tick is already the offset value (0-based position), no conversion needed
      const tickPos0Based = this._rnaMode || this._cdsMode ? tick : tick - 1;
      const ratio = (tickPos0Based + 0.5 - domainStart) / domainLen;
      const xPx = Math.round(ratio * w);

      // Skip non-integer positions when zoomed to single-bp level
      if (
        majorInterval <= 5 &&
        Math.abs(tickPos0Based - Math.round(tickPos0Based)) > 0.01
      ) {
        continue;
      }

      // Is this a major tick?
      // In RNA mode: use TSS-relative offset so TSS (offset=0) is always major.
      // In CDS mode: anchor to cdsAnchor so start codon (display=0) is always major.
      // In DNA mode: align to round genomic coordinates.
      const distToMajor = this._rnaMode
        ? Math.abs(
            tickPos0Based -
              this._tssPos -
              Math.round((tickPos0Based - this._tssPos) / majorInterval) *
                majorInterval,
          )
        : this._cdsMode
          ? Math.abs(
              tickPos0Based -
                cdsAnchor -
                Math.round((tickPos0Based - cdsAnchor) / majorInterval) *
                  majorInterval,
            )
          : Math.abs(tick - Math.round(tick / majorInterval) * majorInterval);
      const isMajor = distToMajor < minorInterval * 0.01;

      if (isMajor) {
        // Major tick — from top downward
        ctx.globalAlpha = 1;
        ctx.strokeStyle = tickColor;
        ctx.beginPath();
        ctx.moveTo(xPx, tickTop);
        ctx.lineTo(xPx, tickTop + majorTickH);
        ctx.stroke();

        // Label at bottom, centered on tick
        ctx.fillStyle = textColor;
        let label: string;
        if (this._cdsMode) {
          // CDS mode: offset from the CDS "zero" (start codon).
          // For + strand: start codon is at raw CDS=0 (left).
          // For - strand: start codon is at raw CDS=totalCDSLength (right).
          const rawOffset = Math.round(tickPos0Based) - cdsAnchor;
          const offset =
            this._cdsMapper?.strand === "-" ? -rawOffset : rawOffset;
          label = this.formatRnaTickLabel(offset);
        } else if (this._rnaMode) {
          // RNA mode: show offset from TSS, accounting for strand.
          // "+" strand: positive = downstream (to the right)
          // "-" strand: positive = downstream (to the left, so invert offset)
          const rawOffset = Math.round(tickPos0Based) - this._tssPos;
          const offset = this._tssStrand === "-" ? -rawOffset : rawOffset;
          label = this.formatRnaTickLabel(offset);
        } else {
          // DNA mode: tick is already 1-based, display it directly
          label = this.formatTickLabel(Math.round(tick), majorInterval);
        }
        const textW = ctx.measureText(label).width;
        const labelX = Math.max(2, Math.min(w - textW - 2, xPx - textW / 2));
        ctx.textBaseline = "bottom";
        ctx.fillText(label, labelX, h - 3 * dpr);
      } else if (!suppressMinor) {
        // Minor tick — from top downward (skip when at single-bp level)
        ctx.globalAlpha = 1;
        ctx.strokeStyle = tickColor;
        ctx.beginPath();
        ctx.moveTo(xPx, tickTop);
        ctx.lineTo(xPx, tickTop + minorTickH);
        ctx.stroke();
      }
    }

    // ── Transcript / CDS highlight band ───────────────────────────────────────
    // Draw a translucent band on the axis to show the extent of the current
    // transcript (RNA mode) or CDS region (CDS mode).
    if (this._rnaMode || this._cdsMode) {
      let bandStart: number;
      let bandEnd: number;
      let bandColor: string;

      if (this._cdsMode && this._cdsMapper) {
        // CDS mode: domain is in CDS space; CDS region is [0, totalCDSLength]
        bandStart = 0;
        bandEnd = this._cdsMapper.totalCDSLength;
        bandColor = "#f58518";
      } else {
        // RNA mode: domain is in genomic space; transcript is [txStart, txEnd]
        bandStart = this._txStart;
        bandEnd = this._txEnd;
        bandColor = "#00b894";
      }

      // Detect overflow directions (in domain space, before pixel mapping)
      const bandExtendsLeft = bandStart < domainStart;
      const bandExtendsRight = bandEnd > domainEnd;
      const bandFullyLeft = bandEnd <= domainStart;
      const bandFullyRight = bandStart >= domainEnd;

      // Map to pixel coordinates and clamp to canvas bounds
      const pxLeft = Math.max(
        0,
        Math.min(w, ((bandStart - domainStart) / domainLen) * w),
      );
      const pxRight = Math.max(
        0,
        Math.min(w, ((bandEnd - domainStart) / domainLen) * w),
      );

      // Ensure at least 1px width even at very large scale
      let pxWidth = pxRight - pxLeft;
      if (pxWidth > 0 && pxWidth < 1 * dpr) pxWidth = 1 * dpr;

      // Draw the main band (only when partially or fully visible)
      if (!bandFullyLeft && !bandFullyRight && pxWidth > 0) {
        ctx.save();
        ctx.fillStyle = bandColor;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(pxLeft, tickAreaTop, pxWidth, tickAreaH);
        ctx.restore();
      }

      // Draw 2px edge indicators when band extends past or is beyond boundaries
      if (bandExtendsLeft || bandFullyLeft) {
        ctx.save();
        ctx.fillStyle = bandColor;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(0, tickAreaTop, 2 * dpr, tickAreaH);
        ctx.restore();
      }
      if (bandExtendsRight || bandFullyRight) {
        ctx.save();
        ctx.fillStyle = bandColor;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(w - 2 * dpr, tickAreaTop, 2 * dpr, tickAreaH);
        ctx.restore();
      }
    }
  }

  // ── Cytoband ideogram rendering ─────────────────────────────────────────

  /** Return a fill color for a UCSC cytoband stain value. */
  private _cytobandStainColor(stain: string, isDark: boolean): string {
    if (isDark) {
      switch (stain) {
        case "gneg":
          return "#555555";
        case "gpos25":
          return "#777777";
        case "gpos50":
          return "#999999";
        case "gpos75":
          return "#bbbbbb";
        case "gpos100":
          return "#dddddd";
        case "acen":
          return "#c0392b";
        case "gvar":
          return "#aaaaaa";
        case "stalk":
          return "#888888";
        default:
          return "#555555";
      }
    }
    switch (stain) {
      case "gneg":
        return "#e8e8e8";
      case "gpos25":
        return "#c0c0c0";
      case "gpos50":
        return "#999999";
      case "gpos75":
        return "#666666";
      case "gpos100":
        return "#333333";
      case "acen":
        return "#c0392b";
      case "gvar":
        return "#8e8e8e";
      case "stalk":
        return "#b0b0b0";
      default:
        return "#e8e8e8";
    }
  }

  /**
   * Draw the cytoband ideogram as the chromosome track in the nav bar.
   *
   * The ideogram is clipped to a rounded rectangle matching the track shape.
   * Centromere bands ("acen") are drawn with a triangular notch to mimic the
   * classic chromosome pinch shape.
   */
  private _drawCytobandIdeogram(
    ctx: CanvasRenderingContext2D,
    trackL: number,
    trackY: number,
    trackW: number,
    trackH: number,
    _r: number,
    isDark: boolean,
    dpr: number,
  ): void {
    const chromSize = this._chromSize;
    if (chromSize <= 0) return;

    // Draw a base background (the lightest band color) with rounded rect
    const baseBg = isDark ? "#444444" : "#e8e8e8";
    const r = Math.min(trackH / 2, 3 * dpr);

    ctx.fillStyle = baseBg;
    ctx.beginPath();
    this._roundRect(ctx, trackL, trackY, trackW, trackH, r);
    ctx.fill();

    // Clip to the track rounded rect so bands don't overflow
    ctx.save();
    ctx.beginPath();
    this._roundRect(ctx, trackL, trackY, trackW, trackH, r);
    ctx.clip();

    const midY = trackY + trackH / 2;

    // Find centromere bands to identify p/q arm boundary
    const acenBands = this._cytobands.filter((b) => b.stain === "acen");

    for (const band of this._cytobands) {
      const bpStart = band.start;
      const bpEnd = band.end;
      const x1 = trackL + (bpStart / chromSize) * trackW;
      const x2 = trackL + (bpEnd / chromSize) * trackW;
      const bw = x2 - x1;
      if (bw < 0.5) continue; // too narrow to draw

      const color = this._cytobandStainColor(band.stain, isDark);

      if (band.stain === "acen") {
        // Draw centromere as a triangular notch (pointing inward)
        ctx.fillStyle = color;
        ctx.beginPath();
        // Determine which acen band this is (p-arm or q-arm side)
        const isFirst = acenBands.length >= 2 && band === acenBands[0];
        if (isFirst) {
          // p-arm centromere: triangle pointing right →
          ctx.moveTo(x1, trackY);
          ctx.lineTo(x2, midY);
          ctx.lineTo(x1, trackY + trackH);
        } else {
          // q-arm centromere: triangle pointing left ←
          ctx.moveTo(x2, trackY);
          ctx.lineTo(x1, midY);
          ctx.lineTo(x2, trackY + trackH);
        }
        ctx.closePath();
        ctx.fill();
      } else if (band.stain === "stalk") {
        // Stalk regions: narrow horizontal bar
        const stalkH = trackH * 0.35;
        const stalkY = midY - stalkH / 2;
        ctx.fillStyle = color;
        ctx.fillRect(x1, stalkY, bw, stalkH);
      } else {
        // Regular band: simple filled rectangle
        ctx.fillStyle = color;
        ctx.fillRect(x1, trackY, bw, trackH);
      }
    }

    // Draw a thin outline around the entire track
    ctx.restore();
    ctx.strokeStyle = isDark ? "#666666" : "#aaaaaa";
    ctx.lineWidth = 0.5 * dpr;
    ctx.beginPath();
    this._roundRect(ctx, trackL, trackY, trackW, trackH, r);
    ctx.stroke();
  }

  /**
   * Draw a transcript structure ideogram for CDS mode.
   *
   * Shows the full genomic transcript region (txStart-flank .. txEnd+flank)
   * with exon/CDS/UTR/codon features rendered as blocks.
   *
   * Color scheme (black/gray palette):
   *   - Flanking regions: light gray background
   *   - Intron line: thin gray line through the transcript body
   *   - Exon: medium gray (#999)
   *   - CDS: dark (#333)
   *   - UTR (5'/3'): lighter gray (#bbb)
   *   - Start/stop codon: black (#000)
   *   - Strand arrow in center
   */
  private _drawTranscriptIdeogram(
    ctx: CanvasRenderingContext2D,
    trackL: number,
    trackY: number,
    trackW: number,
    trackH: number,
    _r: number,
    isDark: boolean,
    dpr: number,
  ): void {
    const txStart = this._txFeatTxStart;
    const txEnd = this._txFeatTxEnd;
    const upFlank = this._txFeatUpFlank;
    const downFlank = this._txFeatDownFlank;
    if (txEnd <= txStart) return;

    const txSize = txEnd - txStart;

    const r = Math.min(trackH / 2, 3 * dpr);
    const midY = trackY + trackH / 2;

    const layout = this._getTxLayout();
    const leftFlankX = trackL;
    const txStartX = trackL + trackW * layout.leftRatio;
    const txEndX = trackL + trackW * (layout.leftRatio + layout.bodyRatio);
    const rightFlankEnd = trackL + trackW;
    const txPixelW = txEndX - txStartX;

    // Helper: genomic position → x pixel (maps within transcript region only)
    const toX = (gPos: number) =>
      txStartX + ((gPos - txStart) / txSize) * txPixelW;

    // ── Background: rounded rect ─────────────────────────────────────
    const baseBg = isDark ? "#2a2a2a" : "#ececec";
    ctx.fillStyle = baseBg;
    ctx.beginPath();
    this._roundRect(ctx, trackL, trackY, trackW, trackH, r);
    ctx.fill();

    // Clip to the track shape
    ctx.save();
    ctx.beginPath();
    this._roundRect(ctx, trackL, trackY, trackW, trackH, r);
    ctx.clip();

    // ── Flanking region shading ──────────────────────────────────────
    const flankColor = isDark ? "#333333" : "#dcdcdc";

    // Left flanking
    if (txStartX > leftFlankX) {
      ctx.fillStyle = flankColor;
      ctx.fillRect(leftFlankX, trackY, txStartX - leftFlankX, trackH);
    }
    // Right flanking
    if (rightFlankEnd > txEndX) {
      ctx.fillStyle = flankColor;
      ctx.fillRect(txEndX, trackY, rightFlankEnd - txEndX, trackH);
    }

    // ── Flanking divider lines ───────────────────────────────────────
    const divColor = isDark ? "#555555" : "#aaaaaa";
    ctx.strokeStyle = divColor;
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([2 * dpr, 2 * dpr]);
    // Left divider
    ctx.beginPath();
    ctx.moveTo(txStartX, trackY);
    ctx.lineTo(txStartX, trackY + trackH);
    ctx.stroke();
    // Right divider
    ctx.beginPath();
    ctx.moveTo(txEndX, trackY);
    ctx.lineTo(txEndX, trackY + trackH);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Flanking labels (live distances from viewport to transcript) ──
    const flankLabelSize = Math.max(7, Math.min(9, trackH * 0.7)) * dpr;
    ctx.font = `${flankLabelSize}px Calibre, Roboto, Helvetica, sans-serif`;
    ctx.textBaseline = "middle";
    const labelColor = isDark ? "#888888" : "#777777";
    ctx.fillStyle = labelColor;

    // Compute live upstream/downstream from current viewport
    let liveUpDist = upFlank;
    let liveDownDist = downFlank;
    if (this.lastState) {
      let gStart: number;
      let gEnd: number;
      if (this._cdsMode && this._cdsMapper) {
        gStart = this._cdsMapper.cdsToGenomic(this.lastState.domain.start);
        gEnd = this._cdsMapper.cdsToGenomic(this.lastState.domain.end);
      } else {
        gStart = this.lastState.domain.start;
        gEnd = this.lastState.domain.end;
      }
      liveUpDist = Math.max(0, Math.round(txStart - gStart));
      liveDownDist = Math.max(0, Math.round(gEnd - txEnd));
    }

    const fmtDist = (v: number) =>
      v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}kb` : `${v}`;
    const leftLabel = fmtDist(liveUpDist);
    const rightLabel = fmtDist(liveDownDist);
    const leftFlankCx = (leftFlankX + txStartX) / 2;
    const rightFlankCx = (txEndX + rightFlankEnd) / 2;
    // Only draw if there's enough room
    const leftTextW = ctx.measureText(leftLabel).width;
    if (txStartX - leftFlankX > leftTextW + 4 * dpr) {
      ctx.textAlign = "center";
      ctx.fillText(leftLabel, leftFlankCx, midY);
    }
    const rightTextW = ctx.measureText(rightLabel).width;
    if (rightFlankEnd - txEndX > rightTextW + 4 * dpr) {
      ctx.textAlign = "center";
      ctx.fillText(rightLabel, rightFlankCx, midY);
    }

    // ── Intron line (thin line through transcript body) ──────────────
    const intronColor = isDark ? "#666666" : "#999999";
    ctx.strokeStyle = intronColor;
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(txStartX, midY);
    ctx.lineTo(txEndX, midY);
    ctx.stroke();

    // ── Draw features (layered: exon first, then CDS, then UTR, then codons) ──
    // Sort features by draw order so CDS overlays exons, and codons overlay CDS
    const drawOrder: Record<string, number> = {
      exon: 0,
      five_prime_UTR: 1,
      three_prime_UTR: 1,
      CDS: 2,
      start_codon: 3,
      stop_codon: 3,
    };
    const sorted = [...this._txFeatures].sort(
      (a, b) => (drawOrder[a.type] ?? 0) - (drawOrder[b.type] ?? 0),
    );

    for (const feat of sorted) {
      const x1 = toX(feat.start);
      const x2 = toX(feat.end);
      const fw = Math.max(x2 - x1, 1 * dpr); // minimum 1px width

      let color: string;
      let fh: number; // feature height
      let fy: number; // feature y

      switch (feat.type) {
        case "exon":
          // Full-height medium gray
          color = isDark ? "#777777" : "#999999";
          fh = trackH * 0.75;
          fy = midY - fh / 2;
          break;
        case "CDS":
          // Full-height dark block
          color = isDark ? "#cccccc" : "#444444";
          fh = trackH * 0.85;
          fy = midY - fh / 2;
          break;
        case "five_prime_UTR":
        case "three_prime_UTR":
          // Shorter lighter block
          color = isDark ? "#666666" : "#bbbbbb";
          fh = trackH * 0.45;
          fy = midY - fh / 2;
          break;
        case "start_codon":
        case "stop_codon":
          // Dark/black narrow marker at full height
          color = isDark ? "#eeeeee" : "#000000";
          fh = trackH;
          fy = trackY;
          break;
        default:
          continue;
      }

      ctx.fillStyle = color;
      ctx.fillRect(x1, fy, fw, fh);
    }

    // ── Strand direction chevrons along intron regions ────────────
    const chevColor = isDark ? "#aaaaaa" : "#555555";
    const chevH = trackH * 0.25;
    const chevW = chevH * 0.5;
    const chevSpacing = Math.max(12 * dpr, chevH * 4);

    // Build merged occupied intervals from features (position-sorted)
    const posSorted = [...this._txFeatures].sort((a, b) => a.start - b.start);
    const occupied: Array<[number, number]> = [];
    for (const feat of posSorted) {
      const fx1 = toX(feat.start);
      const fx2 = toX(feat.end);
      if (occupied.length > 0 && fx1 <= occupied[occupied.length - 1][1] + 1) {
        occupied[occupied.length - 1][1] = Math.max(
          occupied[occupied.length - 1][1],
          fx2,
        );
      } else {
        occupied.push([fx1, fx2]);
      }
    }

    // Collect intron gaps between features
    const gaps: Array<[number, number]> = [];
    let prevGapEnd = txStartX;
    for (const [fs, fe] of occupied) {
      if (fs > prevGapEnd + 1) gaps.push([prevGapEnd, fs]);
      prevGapEnd = Math.max(prevGapEnd, fe);
    }
    if (prevGapEnd < txEndX - 1) gaps.push([prevGapEnd, txEndX]);

    // Draw chevrons in each intron gap
    ctx.strokeStyle = chevColor;
    ctx.lineWidth = 1 * dpr;
    ctx.lineCap = "round";
    for (const [gStart, gEnd] of gaps) {
      const gapW = gEnd - gStart;
      if (gapW < chevSpacing * 0.6) continue;
      const n = Math.max(1, Math.floor(gapW / chevSpacing));
      const step = gapW / (n + 1);
      for (let i = 1; i <= n; i++) {
        const cx = gStart + step * i;
        ctx.beginPath();
        if (this._txFeatStrand === "+") {
          ctx.moveTo(cx - chevW, midY - chevH);
          ctx.lineTo(cx + chevW, midY);
          ctx.lineTo(cx - chevW, midY + chevH);
        } else {
          ctx.moveTo(cx + chevW, midY - chevH);
          ctx.lineTo(cx - chevW, midY);
          ctx.lineTo(cx + chevW, midY + chevH);
        }
        ctx.stroke();
      }
    }

    // ── Strand direction triangle ───────────────────────────────
    // A single red triangle at the terminal exon boundary to indicate
    // transcription direction:  + strand → last exon end,  - strand → first exon start.
    const exons = this._txFeatures
      .filter((f) => f.type === "exon")
      .sort((a, b) => a.start - b.start);
    if (exons.length > 0) {
      const triH = trackH * 0.85;
      const triW = triH * 0.7;
      let tipX: number;
      if (this._txFeatStrand === "+") {
        // Arrow at end of last exon, pointing right
        tipX = toX(exons[exons.length - 1].end);
        ctx.beginPath();
        ctx.moveTo(tipX, midY - triH / 2);
        ctx.lineTo(tipX + triW, midY);
        ctx.lineTo(tipX, midY + triH / 2);
        ctx.closePath();
      } else {
        // Arrow at start of first exon, pointing left
        tipX = toX(exons[0].start);
        ctx.beginPath();
        ctx.moveTo(tipX, midY - triH / 2);
        ctx.lineTo(tipX - triW, midY);
        ctx.lineTo(tipX, midY + triH / 2);
        ctx.closePath();
      }
      ctx.fillStyle = "#c0392b";
      ctx.fill();
    }

    // ── Outline ─────────────────────────────────────────────────────
    ctx.restore();
    ctx.strokeStyle = isDark ? "#666666" : "#aaaaaa";
    ctx.lineWidth = 0.5 * dpr;
    ctx.beginPath();
    this._roundRect(ctx, trackL, trackY, trackW, trackH, r);
    ctx.stroke();
  }

  /** Draw a path for a rounded rectangle (compatible with all browsers). */
  private _roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    if (w <= 0 || h <= 0) return;
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  /**
   * Format a genomic tick value with comma-separated thousands and K/M
   * suffixes to shorten trailing zeros.
   *
   *  - 7,000,000 → "7M"       (divisible by 1 000 000)
   *  - 6,186,000 → "6,186K"   (divisible by 1 000)
   *  - 1,234,567 → "1,234,567" (no trailing-zero shortening)
   */
  private formatTickLabel(value: number, _majorInterval: number): string {
    const v = Math.round(value);
    let num: number;
    let suffix: string;
    if (v !== 0 && v % 1_000_000 === 0) {
      num = v / 1_000_000;
      suffix = "M";
    } else if (v !== 0 && v % 1_000 === 0) {
      num = v / 1_000;
      suffix = "K";
    } else {
      num = v;
      suffix = "";
    }
    // Add commas every 3 digits from the right
    const s = num.toString();
    let result = "";
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) result += ",";
      result += s[i];
    }
    return result + suffix;
  }

  /**
   * Format a TSS-relative offset for RNA mode using the same integer
   * algorithm as DNA mode:
   *   0       → "0"     (TSS position, no special "TSS" label)
   *   ±5000   → "±5K"
   *   ±1500   → "±1500" (not abbreviated if not cleanly divisible by 1 000)
   *   ±5000000 → "±5M"
   */
  private formatRnaTickLabel(offset: number): string {
    const v = Math.round(offset);
    if (v === 0) return "0";
    const sign = v > 0 ? "+" : "-";
    const abs = Math.abs(v);
    let num: number;
    let suffix: string;
    if (abs % 1_000_000 === 0) {
      num = abs / 1_000_000;
      suffix = "M";
    } else if (abs % 1_000 === 0) {
      num = abs / 1_000;
      suffix = "K";
    } else {
      num = abs;
      suffix = "";
    }
    return `${sign}${num}${suffix}`;
  }

  // ── Selection highlight (right-click drag-to-zoom) ──────────────────────────

  /**
   * Draw a translucent `#ff4757` selection rectangle on the axis canvas.
   * Called by the renderer when a right-click drag is active over the axis.
   *
   * @param startXCss  Left edge of the selection in CSS pixels (relative to container)
   * @param widthCss   Width of the selection in CSS pixels
   */
  drawSelectionHighlight(startXCss: number, widthCss: number): void {
    if (!this.axisCanvas || widthCss < 1) return;
    const ctx = this.axisCanvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const h = this.axisCanvas.height;
    const navH = this._chromSize > 0 ? AxisView.NAV_BAR_HEIGHT * dpr : 0;
    const px = startXCss * dpr;
    const pw = widthCss * dpr;

    // Fill (0.2 opacity) — only in the tick area
    ctx.fillStyle = "rgba(255,71,87,0.2)";
    ctx.fillRect(px, navH, pw, h - navH);

    // Stroke border (1px)
    ctx.strokeStyle = "#ff4757";
    ctx.lineWidth = dpr;
    ctx.strokeRect(px + 0.5 * dpr, navH + 0.5 * dpr, pw - dpr, h - navH - dpr);
  }

  // ── SVG export ──────────────────────────────────────────────────────────────

  private escapeXml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Generate SVG elements for the axis (no `<svg>` wrapper).
   * Used by the image-export pipeline to add a vector axis at the top of
   * downloaded images.
   *
   * @param widthCSS  Width of the SVG in CSS pixels (must match channel width).
   * @returns Object with `elements` (SVG markup string) and `height` (CSS px),
   *          or `null` if there is no state to render.
   */
  buildSVGElements(
    widthCSS: number,
  ): { elements: string; height: number } | null {
    if (!this.lastState) return null;

    const axisH = this.config.height ?? 30;
    const f = (n: number) => n.toFixed(2);

    const isDark = this.renderingContext.theme === "dark";
    const tickColor = this.config.color ?? (isDark ? "#aaaaaa" : "#757d8c");
    const textColor = isDark ? "#cccccc" : "#2f3542";
    const bgColor =
      this.config.backgroundColor ?? (isDark ? "#2a2a2a" : "#f1f2f6");
    const separatorColor = isDark ? "#666666" : "#757d8c";
    const fontSize = this.config.fontSize ?? 10;
    const majorTickH = this.config.majorTickHeight ?? 8;
    const minorTickH = this.config.minorTickHeight ?? 4;
    const MINOR_COUNT = this.config.minorTickCount ?? 4;

    const domainStart = this.lastState.domain.start;
    const domainEnd = this.lastState.domain.end;
    const domainLen = domainEnd - domainStart;
    if (domainLen <= 0) return null;

    const lines: string[] = [];

    // Background
    lines.push(
      `<rect x="0" y="0" width="${f(widthCSS)}" height="${f(axisH)}" fill="${bgColor}"/>`,
    );

    if (this._chromSize <= 0) {
      lines.push(
        `<line x1="0" y1="0.5" x2="${f(widthCSS)}" y2="0.5" stroke="${separatorColor}" stroke-width="1"/>`,
      );
    }

    // Compute tick intervals (same algorithm as drawAxis)
    const targetTicks =
      this.config.tickCount ?? Math.max(4, Math.floor(widthCSS / 100));
    const rawInterval = domainLen / targetTicks;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
    const normalized = rawInterval / magnitude;
    let majorInterval: number;
    if (normalized < 1.5) majorInterval = magnitude;
    else if (normalized < 3.5) majorInterval = 2 * magnitude;
    else if (normalized < 7.5) majorInterval = 5 * magnitude;
    else majorInterval = 10 * magnitude;
    if (majorInterval < 1) majorInterval = 1;

    let minorInterval = majorInterval / (MINOR_COUNT + 1);
    const suppressMinor = minorInterval < 1;
    if (suppressMinor) minorInterval = majorInterval;

    const tickTop = 1;

    const cdsAnchorSvg = this._cdsMapper
      ? this._cdsMapper.strand === "-"
        ? this._cdsMapper.totalCDSLength
        : 0
      : 0;
    const iterStart = this._rnaMode
      ? this._tssPos +
        Math.ceil((domainStart - this._tssPos) / minorInterval) * minorInterval
      : this._cdsMode
        ? cdsAnchorSvg +
          Math.ceil((domainStart - cdsAnchorSvg) / minorInterval) *
            minorInterval
        : Math.ceil((domainStart + 1) / minorInterval) * minorInterval; // +1 for 1-based

    for (
      let tick = iterStart;
      tick <=
      domainEnd +
        minorInterval * 0.5 +
        (this._rnaMode || this._cdsMode ? 0 : 1); // +1 only for DNA mode
      tick += minorInterval
    ) {
      const tickPos0Based = this._rnaMode || this._cdsMode ? tick : tick - 1; // Convert only in DNA mode
      const xPx = ((tickPos0Based + 0.5 - domainStart) / domainLen) * widthCSS;

      if (
        majorInterval <= 5 &&
        Math.abs(tickPos0Based - Math.round(tickPos0Based)) > 0.01
      )
        continue;

      const distToMajor = this._rnaMode
        ? Math.abs(
            tickPos0Based -
              this._tssPos -
              Math.round((tickPos0Based - this._tssPos) / majorInterval) *
                majorInterval,
          )
        : this._cdsMode
          ? Math.abs(
              tickPos0Based -
                cdsAnchorSvg -
                Math.round((tickPos0Based - cdsAnchorSvg) / majorInterval) *
                  majorInterval,
            )
          : Math.abs(tick - Math.round(tick / majorInterval) * majorInterval);
      const isMajor = distToMajor < minorInterval * 0.01;

      if (isMajor) {
        // Major tick
        lines.push(
          `<line x1="${f(xPx)}" y1="${f(tickTop)}" x2="${f(xPx)}" y2="${f(tickTop + majorTickH)}" stroke="${tickColor}" stroke-width="1"/>`,
        );

        // Label
        let label: string;
        if (this._cdsMode) {
          const rawOffset = Math.round(tickPos0Based) - cdsAnchorSvg;
          const offset =
            this._cdsMapper?.strand === "-" ? -rawOffset : rawOffset;
          label = this.formatRnaTickLabel(offset);
        } else if (this._rnaMode) {
          const rawOffset = Math.round(tickPos0Based) - this._tssPos;
          const offset = this._tssStrand === "-" ? -rawOffset : rawOffset;
          label = this.formatRnaTickLabel(offset);
        } else {
          // DNA mode: tick is already 1-based
          label = this.formatTickLabel(Math.round(tick), majorInterval);
        }

        lines.push(
          `<text x="${f(xPx)}" y="${f(axisH - 3)}" text-anchor="middle" font-size="${fontSize}" fill="${textColor}" font-family="Calibre,Roboto,Helvetica,sans-serif">${this.escapeXml(label)}</text>`,
        );
      } else if (!suppressMinor) {
        // Minor tick
        lines.push(
          `<line x1="${f(xPx)}" y1="${f(tickTop)}" x2="${f(xPx)}" y2="${f(tickTop + minorTickH)}" stroke="${tickColor}" stroke-width="1"/>`,
        );
      }
    }

    // Highlight band
    if (this._rnaMode || this._cdsMode) {
      let bandStart: number, bandEnd: number, bandColor: string;
      if (this._cdsMode && this._cdsMapper) {
        bandStart = 0;
        bandEnd = this._cdsMapper.totalCDSLength;
        bandColor = "#f58518";
      } else {
        bandStart = this._txStart;
        bandEnd = this._txEnd;
        bandColor = "#00b894";
      }

      const bandExtendsLeft = bandStart < domainStart;
      const bandExtendsRight = bandEnd > domainEnd;
      const bandFullyLeft = bandEnd <= domainStart;
      const bandFullyRight = bandStart >= domainEnd;

      const pxL = Math.max(
        0,
        Math.min(widthCSS, ((bandStart - domainStart) / domainLen) * widthCSS),
      );
      const pxR = Math.max(
        0,
        Math.min(widthCSS, ((bandEnd - domainStart) / domainLen) * widthCSS),
      );
      let pxW = pxR - pxL;
      if (pxW > 0 && pxW < 1) pxW = 1;

      if (!bandFullyLeft && !bandFullyRight && pxW > 0) {
        lines.push(
          `<rect x="${f(pxL)}" y="0" width="${f(pxW)}" height="${f(axisH)}" fill="${bandColor}" opacity="0.35"/>`,
        );
      }
      if (bandExtendsLeft || bandFullyLeft) {
        lines.push(
          `<rect x="0" y="0" width="2" height="${f(axisH)}" fill="${bandColor}" opacity="0.6"/>`,
        );
      }
      if (bandExtendsRight || bandFullyRight) {
        lines.push(
          `<rect x="${f(widthCSS - 2)}" y="0" width="2" height="${f(axisH)}" fill="${bandColor}" opacity="0.6"/>`,
        );
      }
    }

    // Bottom separator
    lines.push(
      `<line x1="0" y1="${f(axisH - 0.5)}" x2="${f(widthCSS)}" y2="${f(axisH - 0.5)}" stroke="${separatorColor}" stroke-width="1"/>`,
    );

    // ── Prepend navigation overview bar if available ───────────────
    const navH = this._chromSize > 0 ? AxisView.NAV_BAR_HEIGHT : 0;
    if (navH > 0) {
      const navLines = this._buildNavBarSVGElements(
        widthCSS,
        navH,
        domainStart,
        domainEnd,
      );
      const tickContent = lines.join("\n");
      return {
        elements: [
          ...navLines,
          `<g transform="translate(0,${f(navH)})">`,
          tickContent,
          `</g>`,
        ].join("\n"),
        height: axisH + navH,
      };
    }

    return { elements: lines.join("\n"), height: axisH };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  SVG export — navigation overview bar
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Build SVG elements for the navigation overview bar (cytoband or transcript
   * ideogram) used in image export. Mirrors the canvas `drawAxis` nav bar.
   */
  private _buildNavBarSVGElements(
    widthCSS: number,
    navH: number,
    domainStart: number,
    domainEnd: number,
  ): string[] {
    const f = (n: number) => n.toFixed(2);
    const isDark = this.renderingContext.theme === "dark";

    const navBg = isDark ? "#1e1e1e" : "#e8e9ed";
    const navBarPad = 2;
    const trackY = navBarPad;
    const trackH = navH - navBarPad * 2;
    const labelWidth = this._labelWidth(widthCSS);
    const trackL = labelWidth + 2;
    const trackW = Math.max(1, widthCSS - trackL - 2);
    const r = Math.min(trackH / 2, 3);
    const midY = trackY + trackH / 2;

    const out: string[] = [];

    // Nav bar background
    out.push(
      `<rect x="0" y="0" width="${f(widthCSS)}" height="${f(navH)}" fill="${navBg}"/>`,
    );

    const labelColor = isDark ? "#eeeeee" : "#353b48";
    out.push(`<defs><clipPath id="_rbAxisLabelClip"><rect width="${f(labelWidth)}" height="${f(navH)}"/></clipPath></defs>`);
    out.push(`<text x="5" y="${f(navH / 2)}" dominant-baseline="central" font-size="10" font-weight="700" fill="${labelColor}" font-family="Roboto,Helvetica,sans-serif" clip-path="url(#_rbAxisLabelClip)">${this.escapeXml(this._axisLabel())}</text>`);

    // Clip path for rounded track shape
    const clipId = "_rbNavClip";
    out.push(
      `<defs><clipPath id="${clipId}"><rect x="${f(trackL)}" y="${f(trackY)}" width="${f(trackW)}" height="${f(trackH)}" rx="${f(r)}" ry="${f(r)}"/></clipPath></defs>`,
    );

    if ((this._cdsMode || this._rnaMode) && this._txFeatures.length > 0) {
      // ── Transcript structure ideogram (CDS / RNA mode) ──────────
      this._buildTxIdeogramSVG(
        out,
        trackL,
        trackY,
        trackW,
        trackH,
        r,
        midY,
        clipId,
        domainStart,
        domainEnd,
        isDark,
        f,
      );
    } else if (this._cytobands.length > 0) {
      // ── Cytoband ideogram (DNA mode) ────────────────────────────
      this._buildCytobandSVG(
        out,
        trackL,
        trackY,
        trackW,
        trackH,
        r,
        midY,
        clipId,
        domainStart,
        domainEnd,
        isDark,
        f,
      );
    } else {
      // ── Fallback: plain gray bar ────────────────────────────────
      const trackColor = isDark ? "#3a3a3a" : "#d1d2d6";
      out.push(
        `<rect x="${f(trackL)}" y="${f(trackY)}" width="${f(trackW)}" height="${f(trackH)}" rx="${f(r)}" ry="${f(r)}" fill="${trackColor}"/>`,
      );
    }

    // Track outline
    out.push(
      `<rect x="${f(trackL)}" y="${f(trackY)}" width="${f(trackW)}" height="${f(trackH)}" rx="${f(r)}" ry="${f(r)}" fill="none" stroke="${isDark ? "#666666" : "#aaaaaa"}" stroke-width="0.5"/>`,
    );

    return out;
  }

  // ── Cytoband ideogram SVG ───────────────────────────────────────────

  private _buildCytobandSVG(
    out: string[],
    trackL: number,
    trackY: number,
    trackW: number,
    trackH: number,
    r: number,
    midY: number,
    clipId: string,
    domainStart: number,
    domainEnd: number,
    isDark: boolean,
    f: (n: number) => string,
  ): void {
    const chromSize = this._chromSize;
    if (chromSize <= 0) return;

    // Base background
    const baseBg = isDark ? "#444444" : "#e8e8e8";
    out.push(
      `<rect x="${f(trackL)}" y="${f(trackY)}" width="${f(trackW)}" height="${f(trackH)}" rx="${f(r)}" ry="${f(r)}" fill="${baseBg}"/>`,
    );

    // Clipped bands
    out.push(`<g clip-path="url(#${clipId})">`);
    const acenBands = this._cytobands.filter((b) => b.stain === "acen");
    for (const band of this._cytobands) {
      const x1 = trackL + (band.start / chromSize) * trackW;
      const x2 = trackL + (band.end / chromSize) * trackW;
      const bw = x2 - x1;
      if (bw < 0.5) continue;

      const color = this._cytobandStainColor(band.stain, isDark);

      if (band.stain === "acen") {
        const isFirst = acenBands.length >= 2 && band === acenBands[0];
        if (isFirst) {
          // p-arm centromere: triangle pointing right
          out.push(
            `<polygon points="${f(x1)},${f(trackY)} ${f(x2)},${f(midY)} ${f(x1)},${f(trackY + trackH)}" fill="${color}"/>`,
          );
        } else {
          // q-arm centromere: triangle pointing left
          out.push(
            `<polygon points="${f(x2)},${f(trackY)} ${f(x1)},${f(midY)} ${f(x2)},${f(trackY + trackH)}" fill="${color}"/>`,
          );
        }
      } else if (band.stain === "stalk") {
        const stalkH = trackH * 0.35;
        const stalkY = midY - stalkH / 2;
        out.push(
          `<rect x="${f(x1)}" y="${f(stalkY)}" width="${f(bw)}" height="${f(stalkH)}" fill="${color}"/>`,
        );
      } else {
        out.push(
          `<rect x="${f(x1)}" y="${f(trackY)}" width="${f(bw)}" height="${f(trackH)}" fill="${color}"/>`,
        );
      }
    }
    out.push(`</g>`);

    // Viewport highlight
    const vpLeftRatio = Math.max(0, domainStart / chromSize);
    const vpRightRatio = Math.min(1, domainEnd / chromSize);
    const vpX = trackL + vpLeftRatio * trackW;
    const vpW = Math.max((vpRightRatio - vpLeftRatio) * trackW, 1);
    out.push(
      `<rect x="${f(vpX)}" y="${f(trackY)}" width="${f(vpW)}" height="${f(trackH)}" fill="rgba(100,149,237,0.35)" stroke="rgba(100,149,237,0.9)" stroke-width="0.5" rx="1" ry="1"/>`,
    );

    // Transcript marker (DNA mode only — when a transcript is selected)
    if (
      !(this._cdsMode || this._rnaMode) &&
      this._activeTranscriptStart > 0 &&
      this._activeTranscriptEnd > 0
    ) {
      const txLeftRatio = Math.max(0, this._activeTranscriptStart / chromSize);
      const txRightRatio = Math.min(1, this._activeTranscriptEnd / chromSize);
      const txX = trackL + txLeftRatio * trackW;
      const txW = Math.max((txRightRatio - txLeftRatio) * trackW, 2);
      out.push(
        `<rect x="${f(txX)}" y="${f(trackY)}" width="${f(txW)}" height="${f(trackH)}" fill="rgba(0,100,0,0.7)"/>`,
      );
    }
  }

  // ── Transcript ideogram SVG ─────────────────────────────────────────

  private _buildTxIdeogramSVG(
    out: string[],
    trackL: number,
    trackY: number,
    trackW: number,
    trackH: number,
    r: number,
    midY: number,
    clipId: string,
    domainStart: number,
    domainEnd: number,
    isDark: boolean,
    f: (n: number) => string,
  ): void {
    const txStart = this._txFeatTxStart;
    const txEnd = this._txFeatTxEnd;
    if (txEnd <= txStart) return;

    const txSize = txEnd - txStart;

    const layout = this._getTxLayout({ start: domainStart, end: domainEnd });
    const txStartX = trackL + trackW * layout.leftRatio;
    const txEndX = trackL + trackW * (layout.leftRatio + layout.bodyRatio);
    const txPixelW = txEndX - txStartX;
    const rightFlankEnd = trackL + trackW;

    const toX = (gPos: number) =>
      txStartX + ((gPos - txStart) / txSize) * txPixelW;

    // Base background
    const baseBg = isDark ? "#2a2a2a" : "#ececec";
    out.push(
      `<rect x="${f(trackL)}" y="${f(trackY)}" width="${f(trackW)}" height="${f(trackH)}" rx="${f(r)}" ry="${f(r)}" fill="${baseBg}"/>`,
    );

    // Clipped content
    out.push(`<g clip-path="url(#${clipId})">`);

    // Flanking region shading
    const flankColor = isDark ? "#333333" : "#dcdcdc";
    if (txStartX > trackL) {
      out.push(
        `<rect x="${f(trackL)}" y="${f(trackY)}" width="${f(txStartX - trackL)}" height="${f(trackH)}" fill="${flankColor}"/>`,
      );
    }
    if (rightFlankEnd > txEndX) {
      out.push(
        `<rect x="${f(txEndX)}" y="${f(trackY)}" width="${f(rightFlankEnd - txEndX)}" height="${f(trackH)}" fill="${flankColor}"/>`,
      );
    }

    // Flanking divider lines (dashed)
    const divColor = isDark ? "#555555" : "#aaaaaa";
    out.push(
      `<line x1="${f(txStartX)}" y1="${f(trackY)}" x2="${f(txStartX)}" y2="${f(trackY + trackH)}" stroke="${divColor}" stroke-width="1" stroke-dasharray="2,2"/>`,
    );
    out.push(
      `<line x1="${f(txEndX)}" y1="${f(trackY)}" x2="${f(txEndX)}" y2="${f(trackY + trackH)}" stroke="${divColor}" stroke-width="1" stroke-dasharray="2,2"/>`,
    );

    // Flanking labels (live distances)
    let gStart: number;
    let gEnd: number;
    if (this._cdsMode && this._cdsMapper) {
      gStart = this._cdsMapper.cdsToGenomic(domainStart);
      gEnd = this._cdsMapper.cdsToGenomic(domainEnd);
    } else {
      gStart = domainStart;
      gEnd = domainEnd;
    }
    const liveUpDist = Math.max(0, Math.round(txStart - gStart));
    const liveDownDist = Math.max(0, Math.round(gEnd - txEnd));
    const fmtDist = (v: number) =>
      v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}kb` : `${v}`;
    const labelColor = isDark ? "#888888" : "#777777";
    const flankLabelSize = Math.max(7, Math.min(9, trackH * 0.7));
    const leftFlankCx = (trackL + txStartX) / 2;
    const rightFlankCx = (txEndX + rightFlankEnd) / 2;

    out.push(
      `<text x="${f(leftFlankCx)}" y="${f(midY)}" text-anchor="middle" dominant-baseline="central" font-size="${f(flankLabelSize)}" fill="${labelColor}" font-family="Calibre,Roboto,Helvetica,sans-serif">${this.escapeXml(fmtDist(liveUpDist))}</text>`,
    );
    out.push(
      `<text x="${f(rightFlankCx)}" y="${f(midY)}" text-anchor="middle" dominant-baseline="central" font-size="${f(flankLabelSize)}" fill="${labelColor}" font-family="Calibre,Roboto,Helvetica,sans-serif">${this.escapeXml(fmtDist(liveDownDist))}</text>`,
    );

    // Intron line
    const intronColor = isDark ? "#666666" : "#999999";
    out.push(
      `<line x1="${f(txStartX)}" y1="${f(midY)}" x2="${f(txEndX)}" y2="${f(midY)}" stroke="${intronColor}" stroke-width="1"/>`,
    );

    // Features (layered: exon → UTR → CDS → codons)
    const drawOrder: Record<string, number> = {
      exon: 0,
      five_prime_UTR: 1,
      three_prime_UTR: 1,
      CDS: 2,
      start_codon: 3,
      stop_codon: 3,
    };
    const sorted = [...this._txFeatures].sort(
      (a, b) => (drawOrder[a.type] ?? 0) - (drawOrder[b.type] ?? 0),
    );

    for (const feat of sorted) {
      const x1 = toX(feat.start);
      const x2 = toX(feat.end);
      const fw = Math.max(x2 - x1, 1);

      let color: string;
      let fh: number;
      let fy: number;

      switch (feat.type) {
        case "exon":
          color = isDark ? "#777777" : "#999999";
          fh = trackH * 0.6;
          fy = midY - fh / 2;
          break;
        case "CDS":
          color = isDark ? "#cccccc" : "#444444";
          fh = trackH * 0.85;
          fy = midY - fh / 2;
          break;
        case "five_prime_UTR":
        case "three_prime_UTR":
          color = isDark ? "#666666" : "#bbbbbb";
          fh = trackH * 0.45;
          fy = midY - fh / 2;
          break;
        case "start_codon":
        case "stop_codon":
          color = isDark ? "#eeeeee" : "#000000";
          fh = trackH;
          fy = trackY;
          break;
        default:
          continue;
      }

      out.push(
        `<rect x="${f(x1)}" y="${f(fy)}" width="${f(fw)}" height="${f(fh)}" fill="${color}"/>`,
      );
    }

    // Strand chevrons in intron gaps
    const chevColor = isDark ? "#aaaaaa" : "#555555";
    const chevH = trackH * 0.25;
    const chevW = chevH * 0.5;
    const chevSpacing = Math.max(12, chevH * 4);

    // Build merged occupied intervals
    const posSorted = [...this._txFeatures].sort((a, b) => a.start - b.start);
    const occupied: Array<[number, number]> = [];
    for (const feat of posSorted) {
      const fx1 = toX(feat.start);
      const fx2 = toX(feat.end);
      if (occupied.length > 0 && fx1 <= occupied[occupied.length - 1][1] + 1) {
        occupied[occupied.length - 1][1] = Math.max(
          occupied[occupied.length - 1][1],
          fx2,
        );
      } else {
        occupied.push([fx1, fx2]);
      }
    }
    // Collect intron gaps
    const gaps: Array<[number, number]> = [];
    let prevEnd = txStartX;
    for (const [fs, fe] of occupied) {
      if (fs > prevEnd + 1) gaps.push([prevEnd, fs]);
      prevEnd = Math.max(prevEnd, fe);
    }
    if (prevEnd < txEndX - 1) gaps.push([prevEnd, txEndX]);
    // Draw chevrons
    for (const [gs, ge] of gaps) {
      const gapW = ge - gs;
      if (gapW < chevSpacing * 0.6) continue;
      const n = Math.max(1, Math.floor(gapW / chevSpacing));
      const step = gapW / (n + 1);
      for (let i = 1; i <= n; i++) {
        const cx = gs + step * i;
        if (this._txFeatStrand === "+") {
          out.push(
            `<polyline points="${f(cx - chevW)},${f(midY - chevH)} ${f(cx + chevW)},${f(midY)} ${f(cx - chevW)},${f(midY + chevH)}" fill="none" stroke="${chevColor}" stroke-width="1" stroke-linecap="round"/>`,
          );
        } else {
          out.push(
            `<polyline points="${f(cx + chevW)},${f(midY - chevH)} ${f(cx - chevW)},${f(midY)} ${f(cx + chevW)},${f(midY + chevH)}" fill="none" stroke="${chevColor}" stroke-width="1" stroke-linecap="round"/>`,
          );
        }
      }
    }

    out.push(`</g>`); // end clip group

    // Viewport highlight (matches DOM viewport box styling)
    let vpLeftRatio = Math.max(0, Math.min(1, genomicToNavRatio(layout, gStart)));
    let vpRightRatio = Math.max(0, Math.min(1, genomicToNavRatio(layout, gEnd)));
    const minVpW = 0.005;
    if (vpRightRatio - vpLeftRatio < minVpW) {
      const mid = (vpLeftRatio + vpRightRatio) / 2;
      vpLeftRatio = Math.max(0, mid - minVpW / 2);
      vpRightRatio = Math.min(1, vpLeftRatio + minVpW);
    }
    const vpX = trackL + vpLeftRatio * trackW;
    const vpW = Math.max((vpRightRatio - vpLeftRatio) * trackW, 1);
    out.push(
      `<rect x="${f(vpX)}" y="${f(trackY)}" width="${f(vpW)}" height="${f(trackH)}" fill="rgba(100,149,237,0.35)" stroke="rgba(100,149,237,0.9)" stroke-width="0.5" rx="1" ry="1"/>`,
    );
  }
}
