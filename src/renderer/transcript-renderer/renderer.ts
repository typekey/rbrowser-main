import { isChannelControlTarget } from "./channel/components/channel-control-hints";
import { ITRConfig, GridDisplay } from "./config/config";
import { BaseRenderer, NavigationChangeEvent } from "./core/base-renderer";
import { GridRenderer } from "./grid/grid";
import { ChannelView, IChannel } from "./channel/index";
import {
  Tooltip,
  TooltipMode,
  TooltipTrigger,
  ITooltipContent,
} from "./tooltip/index";
import {
  Cursor,
  CursorMode,
  CursorChannelHit,
  CursorCoordMode,
} from "./cursor/index";
import { AxisView } from "./axis";
import {
  attachDragDrop,
  showImportDialog,
  showRemoteImportDialog,
  showUnsupportedFormatDialog,
  showCustomReferenceDialog,
  detectTrackInfo,
  buildDefaultChannelConfig,
  baseName,
} from "./drag-drop/index";
import type { IReferenceConfig } from "./config/config";
import { logger } from "./utils/logger";
import {
  baseRangeOffsets,
  cdsBaseOffset,
  rnaBaseOffset,
} from "./utils/transcript-coords";

/** Renderer that adds the DOM/UI layer (canvas, overlays, render loop) on top of BaseRenderer. */
export class TranscriptBrowserRenderer extends BaseRenderer {
  /** Observes the container for size changes. */
  private resizeObserver: ResizeObserver | null = null;
  /** Handle of the pending animation frame. */
  private animationFrameId: number | null = null;
  /** Handle of the pending resize debounce timer. */
  private resizeTimeout: number | null = null;
  /** Set when the scene needs a repaint. */
  private isDirty: boolean = true;

  /** Tooltip shown on feature hover. */
  private tooltip: Tooltip | null = null;
  /** Tooltip trigger mode: hover, click, or off. */
  private tooltipTrigger: TooltipTrigger = "hover";
  /** Current tooltip display mode. */
  private tooltipMode: TooltipMode = "compact";
  /** Cursor overlay. */
  private cursor: Cursor | null = null;
  /** True if the cursor was enabled before the tooltip was pinned. */
  private _cursorWasEnabled = false;

  /** Bound `mousemove` handler, retained for removal on detach. */
  private _onMouseMove: ((e: MouseEvent) => void) | null = null;
  /** Bound `mouseleave` handler, retained for removal on detach. */
  private _onMouseLeave: ((e: MouseEvent) => void) | null = null;
  /** Bound `click` handler, retained for removal on detach. */
  private _onClick: ((e: MouseEvent) => void) | null = null;
  /** Bound `mousedown` handler, retained for removal on detach. */
  private _onMouseDown: ((e: MouseEvent) => void) | null = null;

  /** Client x at the last primary-button mousedown. */
  private _mouseDownX = 0;
  /** Client y at the last primary-button mousedown. */
  private _mouseDownY = 0;
  /** True once the pointer moved past the drag threshold while held. */
  private _wasDragging = false;
  /** Pointer travel, in CSS pixels, above which a press counts as a drag. */
  private static readonly CLICK_DRAG_THRESHOLD = 5;

  // ── Selection overlay (right-click drag) ──────────────────────────────

  /** Transparent canvas that draws the selection rect and channel highlights. */
  private _selectionOverlayCanvas: HTMLCanvasElement | null = null;

  /** Active right-click drag state. Null when no drag is in progress. */
  private _selectionState: {
    mode: "axis" | "channel";
    startClientX: number;
    currentClientX: number;
    startGenomicPos: number;
  } | null = null;

  /** Bound `contextmenu` handler, retained for removal on detach. */
  private _onContextMenu: ((e: MouseEvent) => void) | null = null;
  /** Bound right-button `mousedown` handler, retained for removal on detach. */
  private _onRightMouseDown: ((e: MouseEvent) => void) | null = null;
  /** Bound right-button `mousemove` handler, retained for removal on detach. */
  private _onRightMouseMove: ((e: MouseEvent) => void) | null = null;
  /** Bound right-button `mouseup` handler, retained for removal on detach. */
  private _onRightMouseUp: ((e: MouseEvent) => void) | null = null;

  /** Whether highlight regions are drawn. */
  private _highlightVisible = true;

  /** Whether each highlight region shows a width label. */
  private _highlightShowDistance = false;

  /** Legend (score-label) display style. */
  private _legendStyle: "auto" | "text" | "colorbar" = "auto";
  /** Whether legend (score-label) is visible. */
  private _legendVisible = true;

  /** Cleanup function for drag-and-drop file import. */
  private _cleanupDragDrop: (() => void) | null = null;

  constructor(config: ITRConfig) {
    super(config);
    this.initializeViews();
    this.addChannelView.setActions({
      local: (files) => this.importLocalFiles(files),
      remote: () => this.importRemoteUrl(),
      dataHub: () => this.openDataHub(),
    });
  }

  /** Marks the scene dirty so the next frame repaints. */
  protected markDirty() {
    this.isDirty = true;
  }

  /** Initializes the rendering context, theme, and grid renderer. */
  private initConfig(container: HTMLElement) {
    let bgColor = this.config.renderer.backgroundColor;
    const theme = this.config.renderer.theme || "light";
    if (!bgColor) {
      bgColor = theme === "dark" ? "#1e1e1e" : "#ffffff";
    }
    this.context.initialize(container, bgColor, theme);

    const gridConfig = this.config.grid;
    const gridDisplay =
      typeof gridConfig === "string"
        ? gridConfig
        : gridConfig?.display || "none";
    const gridColor =
      typeof gridConfig === "object" ? gridConfig?.color : undefined;
    this.gridRenderer = new GridRenderer(theme, gridColor);
    this.gridRenderer.setGridDisplay(gridDisplay);
  }

  /** Mounts the renderer into the element named by `config.renderer.containerId`. */
  mount() {
    const containerId = this.config.renderer.containerId;
    const container = document.getElementById(containerId);
    if (!container) {
      logger.error(
        `[RBrowser Renderer] Container #${containerId} not found in DOM`,
      );
      return;
    }
    this.container = container;

    this.initConfig(container);

    if (!this.context.gl) {
      logger.warn(
        "[RBrowser Renderer] WebGL2 not available — falling back to low-quality rendering mode.",
      );
      this.context.renderMode = "low";
    }

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.context.resize(
      Math.floor(rect.width * dpr),
      Math.floor(rect.height * dpr),
    );

    this.rootView.layout(0, 0, rect.width * dpr, rect.height * dpr);

    this.rootView.children.forEach((child) => {
      if ("mount" in child && typeof (child as any).mount === "function") {
        (child as any).mount(container);
      }
    });

    this.resizeObserver = new ResizeObserver((entries) => {
      requestAnimationFrame(() => {
        if (!Array.isArray(entries) || !entries.length) return;
        this.handleResize(entries[0]);
      });
    });
    this.resizeObserver.observe(container);

    this.isDirty = true;

    this.interactionBinder.attach(container);

    this.scrollbar.create(container);
    this.scrollbar.update();

    this.attachTooltip(container);

    this.attachCursor(container);

    this.attachRightClickSelection(container);

    this._cleanupDragDrop = attachDragDrop(
      container,
      (config) => this.channelController._addChannelWithDuplicateGuard(config),
      (config) => this._onImportCustomReference?.(config),
    );

    this.startLoop();

    // ── Load initial highlight regions from config ────────────────────
    if (this.config.highlight && this.config.highlight.length > 0) {
      const initAssembly = this.referenceManager.getConfig()?.assembly;
      for (const hl of this.config.highlight) {
        this.highlightManager.setRegion(
          hl.name,
          hl.start,
          hl.end,
          hl.color,
          initAssembly,
        );
      }
    }

    // ── Mode-based initial navigation ─────────────────────────────────
    const initMode = this.config.mode ?? "rna";
    const hasTranscriptTarget =
      !!this.config.target?.rna && !!this.config.annotation?.transcripts;

    if (initMode === "cds" && hasTranscriptTarget) {
      const rnaName = this.config.target.rna;
      const legacyOff = (this.config.target as any)?.offset;
      const upOff = this.config.target?.upOffset ?? legacyOff ?? 5000;
      const downOff = this.config.target?.downOffset ?? legacyOff ?? 5000;
      (this as any)._buildinTranscriptId = rnaName;
      (this as any)._buildinUpstream = upOff;
      (this as any)._buildinDownstream = downOff;
      this.navigateByTranscriptCDS(rnaName, Math.max(upOff, downOff)).catch(
        (err) =>
          logger.error(
            `[RBrowser Renderer] auto-navigate CDS to "${rnaName}":`,
            err,
          ),
      );
    } else if (initMode === "dna" || !hasTranscriptTarget) {
      this.loadData();
    } else {
      const rnaName = this.config.target.rna;
      const legacyOff = (this.config.target as any)?.offset;
      const upOff = this.config.target?.upOffset ?? legacyOff ?? 5000;
      const downOff = this.config.target?.downOffset ?? legacyOff ?? 5000;
      (this as any)._buildinTranscriptId = rnaName;
      (this as any)._buildinUpstream = upOff;
      (this as any)._buildinDownstream = downOff;
      this.navigationController
        .navigateByTranscriptAsymmetric(rnaName, upOff, downOff)
        .catch((err) =>
          logger.error(
            `[RBrowser Renderer] auto-navigate to "${rnaName}":`,
            err,
          ),
        );
    }
  }

  /** Registers a callback fired when the renderer enters or leaves RNA mode; `null` unregisters. */
  public setRnaModeChangeCallback(
    cb:
      | ((
          enabled: boolean,
          info?: {
            tssPos: number;
            strand: "+" | "-";
            chr: string;
            name: string;
          },
        ) => void)
      | null,
  ): void {
    this.axisController._onRnaModeChange = cb;
  }

  /** Registers a callback fired when the visible genomic region changes; `null` unregisters. */
  public setNavigationChangeCallback(
    cb: ((event: NavigationChangeEvent) => void) | null,
  ): void {
    this.navigationController._onNavigationChange = cb;
  }

  /** Handles a container resize, debouncing the real resize and layout by 150 ms. */
  private handleResize(entry: ResizeObserverEntry) {
    if (!this.context.canvas) return;

    let width = 0,
      height = 0;
    const dpr = window.devicePixelRatio || 1;

    if ("devicePixelContentBoxSize" in entry) {
      const sizes = (entry as any).devicePixelContentBoxSize;
      if (sizes && sizes.length > 0) {
        width = sizes[0].inlineSize;
        height = sizes[0].blockSize;
      }
    }

    if (width === 0 || height === 0) {
      const rect = (entry as any).contentRect;
      if (rect) {
        width = rect.width * dpr;
        height = rect.height * dpr;
      }
    }

    width = Math.round(width);
    height = Math.round(height);

    if (width === 0 || height === 0) return;

    const currentWidth = this.context.canvas.width;
    const currentHeight = this.context.canvas.height;
    if (currentWidth === width && currentHeight === height) return;

    if (this.resizeTimeout !== null) {
      window.clearTimeout(this.resizeTimeout);
    }
    this.resizeTimeout = window.setTimeout(() => {
      this.resizeTimeout = null;
      this.context.resize(width, height);
      this.rootView.layout(0, 0, width, height);
      this.scrollbar.update();
      this.isDirty = true;
    }, 150);
  }

  /** Frames left to repaint; reset to 3 whenever the scene turns dirty. */
  private _dirtyFrames = 0;

  /** Starts the `requestAnimationFrame` render loop. */
  private startLoop() {
    const loop = () => {
      if (this.isDirty) {
        this._dirtyFrames = 3;
        this.isDirty = false;
      }
      if (this._dirtyFrames > 0) {
        // Every navigation / highlight change flows through here, keeping the
        // cached highlight projections fresh from one place.
        this.refreshFeatureRegions();
        this.render();
        this._dirtyFrames--;
      }
      this.animationFrameId = requestAnimationFrame(loop);
    };
    loop();
  }

  /** Tears down everything `mount()` created; the instance is not reusable afterwards. */
  destroy() {
    this._destroyed = true;
    if (this.resizeTimeout !== null) {
      window.clearTimeout(this.resizeTimeout);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.container && this.context.canvas) {
      this.container.removeChild(this.context.canvas);
    }

    this.interactionController?.detach();

    this.boundaryFeedback?.destroy();
    this.boundaryFeedback = null;

    this.detachTooltip();

    this.cursor?.destroy();
    this.cursor = null;

    this.detachRightClickSelection();

    this._cleanupDragDrop?.();
    this._cleanupDragDrop = null;

    this.scrollbar.destroy();

    this.rootView.children.forEach((child) => {
      if ("destroy" in child && typeof (child as any).destroy === "function") {
        (child as any).destroy();
      }
    });
  }

  // ── Redraw ────────────────────────────────────────────────────────────

  /** Forces a repaint on the next animation frame. */
  public forceRedraw(): void {
    this.markDirty();
  }

  // ── Smart channel import ──────────────────────────────────────────────

  private onOpenDataHub: (() => void) | null = null;

  /** Let the host open its own DataHub selector. Null restores the public catalog. */
  public setOnOpenDataHub(callback: (() => void) | null): void {
    this.onOpenDataHub = callback;
  }

  public openDataHub(): void {
    if (this.onOpenDataHub) this.onOpenDataHub();
    else
      window.open(
        "https://rbrowser.org/#/data_hub",
        "_blank",
        "noopener,noreferrer",
      );
  }

  /** Opens the smart import dialog for local files. */
  public importLocalFiles(files: File[]): void {
    if (!files.length) return;
    showImportDialog(files, (config) =>
      this.channelController._addChannelWithDuplicateGuard(config),
    );
  }

  // ── Custom reference import ────────────────────────────────────────────

  /** Handler invoked when the user assembles a Custom Reference. */
  private _onImportCustomReference:
    ((config: IReferenceConfig) => void) | null = null;

  /** Registers the Custom Reference import handler; `null` unregisters. */
  public setOnImportCustomReference(
    cb: ((config: IReferenceConfig) => void) | null,
  ): void {
    this._onImportCustomReference = cb;
  }

  /** Opens the "Import Custom Reference" dialog, optionally pre-filled with local files. */
  public importCustomReference(files?: File[]): void {
    showCustomReferenceDialog(files ?? [], (config) =>
      this._onImportCustomReference?.(config),
    );
  }

  /** Opens the smart import dialog for one remote URL, or batch-imports an array of them. */
  public importRemoteUrl(
    urlOrList?:
      | string
      | Array<{
          url: string;
          name?: string;
          indexUrl?: string;
          index2Url?: string;
        }>,
    indexUrl?: string,
    index2Url?: string,
    name?: string,
  ): void {
    // ── Batch mode ──
    if (Array.isArray(urlOrList)) {
      const unsupported: string[] = [];
      const configs: IChannel[] = urlOrList
        .filter((e) => e.url)
        .filter((entry) => {
          const filename =
            entry.url.split("?")[0].split("/").pop() ?? entry.url;
          const info = detectTrackInfo(filename);
          if (info.unsupported) {
            unsupported.push(filename);
            return false;
          }
          return true;
        })
        .map((entry) => {
          const filename =
            entry.url.split("?")[0].split("/").pop() ?? entry.url;
          const info = detectTrackInfo(filename);
          const defaults = buildDefaultChannelConfig(info);
          const displayName = entry.name ?? baseName(filename);
          const baseData = (defaults as any).data ?? {};
          return {
            ...defaults,
            name: displayName,
            data: {
              ...baseData,
              method: "remote" as const,
              format: info.format,
              url: entry.url,
              ...(entry.indexUrl ? { index: entry.indexUrl } : {}),
              ...(entry.index2Url ? { index2: entry.index2Url } : {}),
            },
          } as IChannel;
        });
      if (unsupported.length > 0) {
        const ext = unsupported[0].split(".").pop() ?? "unknown";
        showUnsupportedFormatDialog(ext, unsupported[0]);
      }
      if (configs.length === 0) return;
      this.addManyChannels(configs);
      return;
    }

    // ── Single-channel mode ──
    showRemoteImportDialog(
      (config) => this.channelController._addChannelWithDuplicateGuard(config),
      {
        url: urlOrList,
        indexUrl,
        index2Url,
        name,
      },
    );
  }

  /** Rewrites the tooltip's region row in TSS-relative coordinates. No-op outside RNA mode. */
  private _injectRnaCoords(content: ITooltipContent): void {
    const info = this.axisController.rnaInfo;
    if (!info || !content.featureRegion) return;
    const { tssPos, strand } = info;
    const fmt = (n: number) =>
      n >= 0 ? `+${n.toLocaleString()}` : `${n.toLocaleString()}`;
    // featureRegion is genomic half-open: report first / last base, 5′ → 3′.
    const { start, end } = content.featureRegion;
    const [rs, re] = baseRangeOffsets(start, end, strand, (g) =>
      rnaBaseOffset(Math.round(g), tssPos, strand),
    );

    const isSinglePoint = end - start <= 1;
    const rnaText = isSinglePoint ? fmt(rs) : `${fmt(rs)} – ${fmt(re)}`;

    const regionLabels = [
      "Region",
      "Position",
      "Feature Region",
      "Reference span",
      "Location",
    ];
    let found = false;
    for (const row of content.rows) {
      if (regionLabels.includes(row.label)) {
        const label =
          row.label === "Position"
            ? "Position"
            : isSinglePoint
              ? "Position"
              : "Region";
        row.label = label;
        row.value = rnaText;
        found = true;
      }
    }
    if (!found) {
      const label = isSinglePoint ? "Position" : "Region";
      content.rows.unshift({ label, value: rnaText });
    }
  }

  /** Rewrites the tooltip's region row in CDS-relative coordinates. No-op outside CDS mode. */
  private _injectCdsCoords(content: ITooltipContent): void {
    if (!this.axisController.isCdsMode || !content.featureRegion) return;
    const fmt = (n: number) =>
      n >= 0
        ? `+${Math.round(n).toLocaleString()}`
        : `${Math.round(n).toLocaleString()}`;
    // featureRegion is half-open in raw CDS space (0 = lowest genomic CDS
    // base); report first / last base from the start codon, 5′ → 3′.
    const mapper = this.axisController.cdsMapper;
    const strand = this.axisController.cdsInfo?.strand ?? "+";
    const len = mapper?.totalCDSLength ?? 0;
    const { start, end } = content.featureRegion;
    const [cs, ce] = baseRangeOffsets(start, end, strand, (c) =>
      cdsBaseOffset(Math.round(c), len, strand),
    );

    const isSinglePoint = end - start <= 1;
    const cdsText = isSinglePoint
      ? `CDS ${fmt(cs)}`
      : `CDS ${fmt(cs)} – ${fmt(ce)}`;
    const cdsTextSingle = `CDS ${fmt(cs)}`;

    const regionLabels = [
      "Region",
      "Position",
      "Feature Region",
      "Reference span",
      "Location",
    ];
    let found = false;
    for (const row of content.rows) {
      if (regionLabels.includes(row.label)) {
        const isDiamond = row.label === "Position";
        const label = isDiamond || isSinglePoint ? "Position" : "Region";
        row.label = label;
        row.value = isDiamond ? cdsTextSingle : cdsText;
        found = true;
      }
    }
    if (!found) {
      const label = isSinglePoint ? "Position" : "Region";
      content.rows.unshift({ label, value: cdsText });
    }
  }

  // ── Render override ──────────────────────────────────────────────────

  /** Draws the base scene, then the selection overlay on top of it. */
  protected override render(): void {
    super.render();
    this.drawSelectionOverlay();
  }

  // ── Selection overlay ─────────────────────────────────────────────────

  /** Returns the axis y-range in CSS pixels, or null when there is no axis. */
  private getAxisBoundsCss(): { top: number; bottom: number } | null {
    const dpr = window.devicePixelRatio || 1;
    for (const child of this.rootView.children) {
      if (child instanceof AxisView) {
        const b = child.getBounds();
        return { top: b.y / dpr, bottom: (b.y + b.height) / dpr };
      }
    }
    return null;
  }

  /** Repaints the overlay canvas: persistent highlight bands, then the active drag rect. */
  private drawSelectionOverlay(): void {
    if (!this._selectionOverlayCanvas || !this.container) return;
    const canvas = this._selectionOverlayCanvas;
    const container = this.container;
    const dpr = window.devicePixelRatio || 1;

    const w = Math.round(container.clientWidth * dpr);
    const h = Math.round(container.clientHeight * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    const domain = this.getViewDomain();
    const domainSpan = domain.end - domain.start;
    if (domainSpan <= 0) return;

    const cssW = container.clientWidth;
    const axisBounds = this.getAxisBoundsCss();
    const channelTopCss = axisBounds ? axisBounds.bottom : 0;

    // NOTE: no ±0.5 bp shift — edges land on base boundaries, not on the base
    // centres that the axis ticks and the cursor hairline snap to.
    const gToX = (g: number): number =>
      Math.max(0, Math.min(cssW, ((g - domain.start) / domainSpan) * cssW));

    // `color` must be a 6-digit hex string, e.g. `#3867d6`.
    const drawRect = (
      color: string,
      xCss: number,
      yCss: number,
      wCss: number,
      hCss: number,
    ): void => {
      if (wCss < 1) return;
      const hx = color.replace("#", "");
      const r = parseInt(hx.substring(0, 2), 16);
      const g = parseInt(hx.substring(2, 4), 16);
      const b = parseInt(hx.substring(4, 6), 16);
      const px = xCss * dpr;
      const py = yCss * dpr;
      const pw = wCss * dpr;
      const ph = hCss * dpr;
      ctx.fillStyle = `rgba(${r},${g},${b},0.2)`;
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = color;
      ctx.lineWidth = dpr;
      ctx.strokeRect(px + 0.5 * dpr, py + 0.5 * dpr, pw - dpr, ph - dpr);
    };

    // ── 1. Persistent channel highlights ─────────────────────────────────
    const channelH = Math.max(0, container.clientHeight - channelTopCss);
    if (channelH > 0 && this._highlightVisible) {
      for (const region of this.highlightManager.regions) {
        const x1 = gToX(region.start);
        const x2 = gToX(region.end);
        const wFeat = Math.max(1, x2 - x1);
        drawRect(region.color, x1, channelTopCss, wFeat, channelH);

        // ── Width indicator just below the axis ──────────────────────────
        if (axisBounds && wFeat > 20 && this._highlightShowDistance) {
          const regionBp = region.end - region.start;
          let widthLabel: string;
          if (regionBp >= 1_000_000) {
            widthLabel = `${(regionBp / 1_000_000).toFixed(1)} Mb`;
          } else if (regionBp >= 1000) {
            widthLabel = `${(regionBp / 1000).toFixed(1)} kb`;
          } else {
            widthLabel = `${Math.round(regionBp)} bp`;
          }
          const indicatorText = `\u2190 ${widthLabel} \u2192`;
          const indicatorY = axisBounds.bottom + 10;
          const centerX = x1 + wFeat / 2;
          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.font = "10px Calibre, Roboto, Helvetica, sans-serif";
          ctx.fillStyle = region.color;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(indicatorText, centerX, indicatorY);
          ctx.restore();
        }
      }
    }

    // ── 2. Active selection rect ──────────────────────────────────────────
    if (this._selectionState) {
      const s = this._selectionState;
      const rect = container.getBoundingClientRect();
      const x1Css = Math.max(0, Math.min(cssW, s.startClientX - rect.left));
      const x2Css = Math.max(0, Math.min(cssW, s.currentClientX - rect.left));
      const minXCss = Math.min(x1Css, x2Css);
      const selWCss = Math.abs(x1Css - x2Css);

      if (s.mode === "axis") {
        const aTop = axisBounds ? axisBounds.top : 0;
        const aH = axisBounds ? axisBounds.bottom - axisBounds.top : 30;
        drawRect("#ff4757", minXCss, aTop, selWCss, aH);
        // Redraw on the axis canvas so the rect clears the opaque axis background.
        for (const child of this.rootView.children) {
          if (child instanceof AxisView) {
            child.drawSelectionHighlight(minXCss, selWCss);
            break;
          }
        }
      } else {
        drawRect("#3867d6", minXCss, channelTopCss, selWCss, channelH);
      }
    }
  }

  /** Creates the overlay canvas and attaches the right-click drag handlers. */
  private attachRightClickSelection(container: HTMLElement): void {
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "900";
    container.appendChild(canvas);
    this._selectionOverlayCanvas = canvas;

    // ── Suppress browser context menu ────────────────────────────────────
    this._onContextMenu = (e: MouseEvent) => e.preventDefault();
    container.addEventListener("contextmenu", this._onContextMenu);

    // ── Right mousedown: start selection ─────────────────────────────────
    this._onRightMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const cssW = container.clientWidth;
      const domain = this.getViewDomain();

      const axisBounds = this.getAxisBoundsCss();
      const relY = e.clientY - rect.top;
      const inAxis =
        axisBounds !== null &&
        relY >= axisBounds.top &&
        relY < axisBounds.bottom;
      const mode = inAxis ? "axis" : "channel";

      if (mode === "channel" && !e.ctrlKey) {
        this.highlightManager.clear();
      }

      const relX = Math.max(0, Math.min(cssW, e.clientX - rect.left));
      const frac = relX / cssW;
      const startGenomicPos = domain.start + frac * (domain.end - domain.start);

      this._selectionState = {
        mode,
        startClientX: e.clientX,
        currentClientX: e.clientX,
        startGenomicPos,
      };
      this.markDirty?.();
    };

    // ── Right mousemove: update rect ─────────────────────────────────────
    this._onRightMouseMove = (e: MouseEvent) => {
      if (!this._selectionState) return;
      this._selectionState.currentClientX = e.clientX;
      this.markDirty?.();
    };

    // ── Right mouseup: finalise selection ────────────────────────────────
    this._onRightMouseUp = (e: MouseEvent) => {
      if (e.button !== 2 || !this._selectionState) return;

      const s = this._selectionState;
      this._selectionState = null;

      const rect = container.getBoundingClientRect();
      const cssW = container.clientWidth;
      const domain = this.getViewDomain();

      const relXEnd = Math.max(0, Math.min(cssW, e.clientX - rect.left));
      const fracEnd = relXEnd / cssW;
      const endGenomicPos =
        domain.start + fracEnd * (domain.end - domain.start);

      const gStart = Math.round(Math.min(s.startGenomicPos, endGenomicPos));
      const gEnd = Math.round(Math.max(s.startGenomicPos, endGenomicPos));

      if (gEnd - gStart > 1) {
        if (s.mode === "axis") {
          this.setViewDomain({ start: gStart, end: gEnd });

          // setViewDomain alone does not load data; channels need the navigation.
          const chr = this.config.region?.chr ?? "";
          let navStart = gStart;
          let navEnd = gEnd;
          if (this.axisController.isCdsMode && this.axisController.cdsMapper) {
            navStart = this.axisController.cdsMapper.cdsToGenomic(gStart);
            navEnd = this.axisController.cdsMapper.cdsToGenomic(gEnd);
          }
          const visibleRegion = { chr, start: navStart, end: navEnd };
          this.rootView.children.forEach((child) => {
            if (child instanceof ChannelView) {
              child.handleNavigation(visibleRegion, "zoom");
            }
          });
        } else {
          const name = `highlight_${Date.now()}`;
          this.highlightManager.setRegion(
            name,
            gStart,
            gEnd,
            undefined,
            this.referenceManager.getConfig()?.assembly,
          );
        }
      }
      this.markDirty?.();
    };

    container.addEventListener("mousedown", this._onRightMouseDown);
    // move/up on document so a drag that leaves the container still completes.
    document.addEventListener("mousemove", this._onRightMouseMove);
    document.addEventListener("mouseup", this._onRightMouseUp);
  }

  /** Removes the right-click selection listeners and destroys the overlay canvas. */
  private detachRightClickSelection(): void {
    if (this.container) {
      if (this._onContextMenu)
        this.container.removeEventListener("contextmenu", this._onContextMenu);
      if (this._onRightMouseDown)
        this.container.removeEventListener("mousedown", this._onRightMouseDown);
    }
    if (this._onRightMouseMove)
      document.removeEventListener("mousemove", this._onRightMouseMove);
    if (this._onRightMouseUp)
      document.removeEventListener("mouseup", this._onRightMouseUp);

    if (
      this._selectionOverlayCanvas &&
      this._selectionOverlayCanvas.parentElement
    ) {
      this._selectionOverlayCanvas.parentElement.removeChild(
        this._selectionOverlayCanvas,
      );
    }
    this._selectionOverlayCanvas = null;
    this._selectionState = null;
    this._onContextMenu = null;
    this._onRightMouseDown = null;
    this._onRightMouseMove = null;
    this._onRightMouseUp = null;
  }

  /** Creates the tooltip and installs the container's pointer handlers (tooltip, cursor, drag detection). */
  private attachTooltip(container: HTMLElement): void {
    this.tooltip = new Tooltip(container);

    this.tooltip.onZoomTo = (start, end) => {
      const span = end - start;
      const pad = Math.max(Math.round(span * 0.1), 100);
      this.setViewDomain({ start: start - pad, end: end + pad });
    };
    this.tooltip.onHighlight = (start, end, isJunction) => {
      const name = `hl_${Date.now()}`;
      const tipAssembly = this.referenceManager.getConfig()?.assembly;
      if (isJunction) {
        const width = Math.max(200, Math.round((end - start) * 0.01));
        const hw = Math.round(width / 2);
        this.highlightManager.setRegion(
          `${name}_s`,
          start - hw,
          start + hw,
          undefined,
          tipAssembly,
        );
        this.highlightManager.setRegion(
          `${name}_e`,
          end - hw,
          end + hw,
          undefined,
          tipAssembly,
        );
      } else {
        this.highlightManager.setRegion(
          name,
          start,
          end,
          undefined,
          tipAssembly,
        );
      }
      this.markDirty();
    };

    this.tooltip.onHide = () => {
      if (this._cursorWasEnabled) {
        this.setCursorEnabled(true);
        this._cursorWasEnabled = false;
      }
    };

    let lastFeature: any = null;

    const hitTestAt = (
      clientX: number,
      clientY: number,
    ): {
      feature: any;
      channel: ChannelView;
      localX: number;
      localY: number;
    } | null => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const canvasX = (clientX - rect.left) * dpr;
      const canvasY = (clientY - rect.top) * dpr;
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      const domain = this.getViewDomain();

      for (const child of this.rootView.children) {
        if (child instanceof ChannelView) {
          const hit = child.hitTestFeatureWithChannel(canvasX, canvasY, domain);
          if (hit) {
            return {
              feature: hit.feature,
              channel: hit.channel,
              localX,
              localY,
            };
          }
        }
      }
      return null;
    };

    this._onMouseDown = (e: MouseEvent) => {
      if (isChannelControlTarget(e.target)) return;
      if (e.button !== 0) return;
      this._mouseDownX = e.clientX;
      this._mouseDownY = e.clientY;
      this._wasDragging = false;
    };

    this._onMouseMove = (e: MouseEvent) => {
      // Decide before cursor updates or feature hit-testing. DOM delegation
      // covers every label, including dynamically added and nested channels.
      if (
        isChannelControlTarget(e.target) ||
        document.querySelector(".channel-drag-tooltip")
      ) {
        lastFeature = null;
        if (!this.tooltip?.pinned) this.tooltip?.hide();
        this.cursor?.hide();
        return;
      }
      if (e.buttons === 1 && !this._wasDragging) {
        const dx = e.clientX - this._mouseDownX;
        const dy = e.clientY - this._mouseDownY;
        if (
          Math.abs(dx) > TranscriptBrowserRenderer.CLICK_DRAG_THRESHOLD ||
          Math.abs(dy) > TranscriptBrowserRenderer.CLICK_DRAG_THRESHOLD
        ) {
          this._wasDragging = true;
        }
      }

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left) * dpr;
      const canvasY = (e.clientY - rect.top) * dpr;
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      const domain = this.getViewDomain();

      // ── Cursor update ────────────────────────────────────────────────
      if (this.cursor?.isEnabled()) {
        // Axis ticks span the full canvas width, which scrollable channels do not.
        const canvasWidthDev = this.context.canvas?.width ?? rect.width * dpr;
        const canvasWidthCss = canvasWidthDev / dpr;

        let genomicPos: number | null = null;
        {
          const frac = canvasX / canvasWidthDev;
          if (frac >= 0 && frac <= 1) {
            genomicPos = domain.start + frac * (domain.end - domain.start);
          }
        }

        if (genomicPos !== null) {
          let contentTopCss = 0;
          for (const child of this.rootView.children) {
            if (child instanceof AxisView) {
              const { y: childY, height: childH } = child.getBounds();
              contentTopCss = (childY + childH) / dpr;
              break;
            }
          }
          this.cursor.updateLayout(contentTopCss, rect.height);

          let channelHits: CursorChannelHit[] | undefined;
          const cursorMode = this.cursor.getMode();
          if (cursorMode === "detailed" || cursorMode === "each") {
            channelHits = [];
            for (const child of this.rootView.children) {
              if (child instanceof ChannelView) {
                const hits = child.collectCursorHits(genomicPos, domain, dpr);
                channelHits.push(...hits);
              }
            }
          }

          let cursorCoordMode: CursorCoordMode | undefined;
          if (this.axisController.isCdsMode && this.axisController.cdsMapper) {
            const ci = this.axisController.cdsInfo;
            cursorCoordMode = {
              mode: "cds",
              strand: ci?.strand ?? "+",
              cdsMapper: this.axisController.cdsMapper,
            };
          } else if (this.axisController.isRnaMode) {
            const ri = this.axisController.rnaInfo;
            if (ri) {
              cursorCoordMode = {
                mode: "rna",
                tssPos: ri.tssPos,
                strand: ri.strand,
              };
            }
          }

          const flooredGenomicPos = Math.floor(genomicPos);
          this.cursor.show(
            localX,
            flooredGenomicPos,
            channelHits,
            cursorCoordMode,
          );

          // Snap the hairline to the base centre so it aligns with the axis ticks.
          const baseCenter = flooredGenomicPos + 0.5;
          const domainLen = domain.end - domain.start;
          const ratio = (baseCenter - domain.start) / domainLen;
          const centerCssX = ratio * canvasWidthCss;
          this.cursor.snapHairline(centerCssX);
        } else {
          this.cursor.hide();
        }
      }

      // ── Tooltip update (hover mode only) ─────────────────────────────
      if (this.tooltipTrigger !== "hover" || this.tooltip?.pinned) {
        return;
      }

      // Detailed/each cursor already annotates each channel; a label owns its own hover.
      const suppressTooltip =
        this.cursor?.isEnabled() &&
        (this.cursor.getMode() === "detailed" ||
          this.cursor.getMode() === "each");

      if (!this.tooltip || suppressTooltip) {
        if (lastFeature !== null) {
          lastFeature = null;
          this.tooltip?.hide();
        }
        return;
      }

      let hitFeature: any = null;
      let hitChannel: ChannelView | null = null;

      for (const child of this.rootView.children) {
        if (child instanceof ChannelView) {
          const hit = child.hitTestFeatureWithChannel(canvasX, canvasY, domain);
          if (hit) {
            hitFeature = hit.feature;
            hitChannel = hit.channel;
            break;
          }
        }
      }

      if (hitFeature && hitChannel) {
        if (hitFeature === lastFeature) {
          this.tooltip.move(localX, localY);
        } else {
          lastFeature = hitFeature;
          const hoverMode =
            hitFeature._isBamHit || hitFeature._isCoverageHit
              ? "compact"
              : "detailed";
          const content = hitChannel.buildTooltipContent(
            hitFeature,
            hoverMode as any,
          );
          this._injectRnaCoords(content);
          this._injectCdsCoords(content);
          this.tooltip.show(localX, localY, content);
        }
      } else {
        if (lastFeature !== null) {
          lastFeature = null;
          this.tooltip.hide();
        }
      }
    };

    this._onMouseLeave = () => {
      lastFeature = null;
      if (!this.tooltip?.pinned) {
        this.tooltip?.hide();
      }
      this.cursor?.hide();
    };

    this._onClick = (e: MouseEvent) => {
      if (isChannelControlTarget(e.target)) return;
      if (!this.tooltip) return;

      // A pan ends in a click event; do not treat it as one.
      if (this._wasDragging) {
        this._wasDragging = false;
        return;
      }

      // ── Click mode: pin on hit, dismiss on empty area ──
      if (this.tooltipTrigger === "click") {
        const hit = hitTestAt(e.clientX, e.clientY);
        if (hit) {
          lastFeature = hit.feature;
          const content = hit.channel.buildTooltipContent(
            hit.feature,
            "detailed",
          );
          this._injectRnaCoords(content);
          this._injectCdsCoords(content);
          this._cursorWasEnabled = this.isCursorEnabled();
          if (this._cursorWasEnabled) {
            this.setCursorEnabled(false);
            this.cursor?.hide();
          }
          this.tooltip.showPinned(hit.localX, hit.localY, content);
        } else {
          lastFeature = null;
          this.tooltip.hide();
        }
        return;
      }

      // ── Hover mode: click pins or switches the tooltip ──
      if (this.tooltipTrigger === "hover" && this.tooltip.visible) {
        const hit = hitTestAt(e.clientX, e.clientY);
        if (hit) {
          lastFeature = hit.feature;
          const content = hit.channel.buildTooltipContent(
            hit.feature,
            "detailed",
          );
          this._injectRnaCoords(content);
          this._injectCdsCoords(content);
          if (!this.tooltip.pinned) {
            this._cursorWasEnabled = this.isCursorEnabled();
            if (this._cursorWasEnabled) {
              this.setCursorEnabled(false);
              this.cursor?.hide();
            }
          }
          this.tooltip.showPinned(hit.localX, hit.localY, content);
        } else if (this.tooltip.pinned) {
          lastFeature = null;
          this.tooltip.hide();
        }
      }
    };

    container.addEventListener("mousedown", this._onMouseDown);
    container.addEventListener("mousemove", this._onMouseMove);
    container.addEventListener("mouseleave", this._onMouseLeave);
    container.addEventListener("click", this._onClick);
  }

  /** Removes the container's pointer listeners and destroys the tooltip. */
  private detachTooltip(): void {
    if (this.container) {
      if (this._onMouseDown)
        this.container.removeEventListener("mousedown", this._onMouseDown);
      if (this._onMouseMove)
        this.container.removeEventListener("mousemove", this._onMouseMove);
      if (this._onMouseLeave)
        this.container.removeEventListener("mouseleave", this._onMouseLeave);
      if (this._onClick)
        this.container.removeEventListener("click", this._onClick);
    }
    this.tooltip?.destroy();
    this.tooltip = null;
    this._onMouseDown = null;
    this._onMouseMove = null;
    this._onMouseLeave = null;
  }

  // ── Channel Label visibility ─────────────────────────────────────────

  /** Shows or hides all channel name labels, including those of channels added later. */
  setChannelLabelVisible(visible: boolean): void {
    if (!this.config.channelLabel) {
      (this.config as any).channelLabel = {};
    }
    this.config.channelLabel!.enabled = visible;

    for (const child of this.rootView.children) {
      if (child instanceof ChannelView) {
        child.setChannelLabelEnabled(visible);
      }
    }
  }

  /** Whether channel labels are currently visible. */
  isChannelLabelVisible(): boolean {
    return this.config.channelLabel?.enabled !== false;
  }

  /** Shows or hides all highlight regions; the regions themselves are preserved. */
  setHighlightVisible(visible: boolean): void {
    this._highlightVisible = visible;
    this.markDirty();
  }

  /** Whether highlight regions are currently drawn. */
  isHighlightVisible(): boolean {
    return this._highlightVisible;
  }

  /** Shows or hides the width label (`← width →`) on each highlight region. */
  setHighlightShowDistance(show: boolean): void {
    this._highlightShowDistance = show;
    this.markDirty();
  }

  /** Whether highlight regions currently carry a width label. */
  isHighlightShowDistance(): boolean {
    return this._highlightShowDistance;
  }

  // ── Grid ──────────────────────────────────────────────────────────────

  /** Sets which grid lines are drawn: `"x"`, `"y"`, `"x+y"`, or `"none"`. */
  setGrid(display: GridDisplay) {
    if (this.gridRenderer) {
      this.gridRenderer.setGridDisplay(display);
      this.markDirty?.();
    }
  }

  /** Returns the active grid mode. */
  getGrid(): GridDisplay {
    return this.gridRenderer?.getGridDisplay() || "none";
  }

  // ── Cursor ────────────────────────────────────────────────────────

  /** Creates the cursor overlay; its handlers are installed by `attachTooltip()`. */
  private attachCursor(container: HTMLElement): void {
    this.cursor = new Cursor(container);
  }

  /** Shows or hides the cursor overlay. */
  setCursorEnabled(enabled: boolean): void {
    this.cursor?.setEnabled(enabled);
  }

  /** Whether the cursor overlay is enabled. */
  isCursorEnabled(): boolean {
    return this.cursor?.isEnabled() ?? false;
  }

  /** Sets the cursor mode: `"compact"`, `"detailed"`, or `"each"`. */
  setCursorMode(mode: CursorMode): void {
    this.cursor?.setMode(mode);
  }

  /** Returns the active cursor mode. */
  getCursorMode(): CursorMode {
    return this.cursor?.getMode() ?? "compact";
  }

  // ── Tooltip mode API ──────────────────────────────────────────────────

  /** Sets the tooltip trigger mode: `"hover"`, `"click"`, or `"off"`. */
  setTooltipTrigger(trigger: TooltipTrigger): void {
    this.tooltipTrigger = trigger;
    if (trigger === "off") this.tooltip?.hide();
  }

  /** Returns the active tooltip trigger mode. */
  getTooltipTrigger(): TooltipTrigger {
    return this.tooltipTrigger;
  }

  /** Enables or disables the tooltip; legacy shorthand for `setTooltipTrigger()`. */
  setTooltipEnabled(enabled: boolean): void {
    this.tooltipTrigger = enabled ? "hover" : "off";
    if (!enabled) this.tooltip?.hide();
  }

  /** Whether the tooltip trigger is anything other than `"off"`. */
  isTooltipEnabled(): boolean {
    return this.tooltipTrigger !== "off";
  }

  /** Hides and unpins the tooltip, if any. */
  hideTooltip(): void {
    this.tooltip?.hide();
  }

  /** Sets the tooltip display mode: `"detailed"` or `"compact"`. */
  setTooltipMode(mode: TooltipMode): void {
    this.tooltipMode = mode;
  }

  /** Returns the active tooltip display mode. */
  getTooltipMode(): TooltipMode {
    return this.tooltipMode;
  }

  // ── Legend (score-label) control ────────────────────────────────────

  /** Sets legend visibility and style: `"auto"`, `"text"`, or `"colorbar"`. */
  setLegendStyle(
    visible: boolean,
    style: "auto" | "text" | "colorbar" = "auto",
  ): void {
    this._legendVisible = visible;
    this._legendStyle = style;

    for (const child of this.rootView.children) {
      if (child instanceof ChannelView) {
        child.setLegendInfo(visible, style);
        child.refreshScoreLabels();
      }
    }

    // Sub-channels create score labels outside rootView; sweep the DOM for them.
    const container = this.container;
    if (container) {
      container
        .querySelectorAll<HTMLElement>(".channel-score-label")
        .forEach((el) => {
          if (!visible) {
            el.style.display = "none";
          } else {
            el.style.display = "";
            el.setAttribute("data-legend-style", style);
          }
        });
    }
  }

  /** Whether channel legends are currently visible. */
  isLegendVisible(): boolean {
    return this._legendVisible;
  }

  /** Returns the active legend display style. */
  getLegendStyle(): "auto" | "text" | "colorbar" {
    return this._legendStyle;
  }
}
