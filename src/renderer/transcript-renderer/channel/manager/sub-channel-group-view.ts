import { defaultConfig } from "../../../../../config/default_config";
import type {
  RenderingContext,
  SubChannelGroupRenderState,
} from "../channel-types";
import { logger } from "../../utils/logger";

/**
 * Scrollable area holding sub-channels when a parent channel is expanded.
 * Owned by the parent ChannelView so drag-reordering treats parent + group
 * as one unit.
 */
export class SubChannelGroupView {
  // ChannelViews; typed any[] to avoid circular imports
  private subChannels: any[] = [];
  private parentHeight: number; // CSS pixels
  private maxVisibleCount: number;
  private scrollOffset: number = 0; // CSS pixels scrolled from top
  private context: RenderingContext;
  private onDirty?: () => void;

  // Canvas-space (device pixels)
  private x: number = 0;
  y: number = 0;
  private width: number = 0;
  height: number = 0;

  // DOM
  groupContainer: HTMLElement | null = null;
  private scrollTrack: HTMLElement | null = null;
  private scrollThumb: HTMLElement | null = null;

  /** Right-side inset (CSS px) for sub-channel scrollbar to avoid overlapping browser scrollbar */
  private _scrollbarInset: number = 0;

  /** Update sub-channel scrollbar inset and reposition if existing. */
  setScrollbarInset(px: number): void {
    this._scrollbarInset = px;
    // Full inset needed to clear the browser-level channel scrollbar.
    if (this.scrollTrack) {
      this.scrollTrack.style.right = `${Math.max(2, px)}px`;
    }
    // Propagate so sub-channel trackContainers + legends shift too
    for (const sub of this.subChannels) {
      if (typeof sub.setScrollbarInset === "function") {
        sub.setScrollbarInset(px);
      }
    }
  }

  // ── Sample label (colored block) support ────────────────────────────
  /** Which expand field(s) are used, e.g. ["Biosample"] or ["Biosample","Method"] */
  private expandFields: string[] = [];
  /** Per-field unique values: "Biosample" → ["HeLa","K562",…] */
  private fieldValueSets: Map<string, string[]> = new Map();
  /** Per-field per-value → colour (hex) */
  private fieldValueColors: Map<string, Map<string, string>> = new Map();
  /** Sample label block DOM elements, one per sub-channel */
  private sampleLabelEls: HTMLElement[] = [];
  private sampleTooltipEl: HTMLElement | null = null;
  // private channelName: string = "";
  // private lastDomain: { start: number; end: number } | null = null;
  /** Separator for composite keys */
  private static readonly COMPOSITE_SEP = "\x00";

  // ── Tableau-10 inspired colour palette ──────────────────────────────
  /** 10 distinct colours per expand field, cycled if needed */
  private static readonly PALETTE: string[][] = [
    // field 0 (e.g. Biosample)
    [
      "#4e79a7",
      "#f28e2b",
      "#e15759",
      "#76b7b2",
      "#59a14f",
      "#edc948",
      "#b07aa1",
      "#ff9da7",
      "#9c755f",
      "#bab0ac",
    ],
    // field 1 (e.g. Method)
    [
      "#1b9e77",
      "#d95f02",
      "#7570b3",
      "#e7298a",
      "#66a61e",
      "#e6ab02",
      "#a6761d",
      "#666666",
      "#1f78b4",
      "#b2df8a",
    ],
    // field 2+
    [
      "#8dd3c7",
      "#ffffb3",
      "#bebada",
      "#fb8072",
      "#80b1d3",
      "#fdb462",
      "#b3de69",
      "#fccde5",
      "#d9d9d9",
      "#bc80bd",
    ],
  ];

  constructor(
    context: RenderingContext,
    subChannels: any[],
    parentHeight: number,
    maxVisibleCount: number,
    onDirty?: () => void,
    expandFields?: string[],
    fieldValueSets?: Map<string, string[]>,
    _channelName?: string,
  ) {
    this.context = context;
    this.subChannels = subChannels;
    this.parentHeight = parentHeight;
    this.maxVisibleCount = maxVisibleCount;
    this.onDirty = onDirty;
    this.expandFields = expandFields ?? [];
    this.fieldValueSets = fieldValueSets ?? new Map();
    // this.channelName = channelName ?? "";

    this.buildColorMaps();
  }

  /** Assign a unique colour to each unique value within each expand field. */
  private buildColorMaps(): void {
    this.fieldValueColors.clear();
    let fieldIdx = 0;
    for (const field of this.expandFields) {
      const values = this.fieldValueSets.get(field) ?? [];
      const palette =
        SubChannelGroupView.PALETTE[
          Math.min(fieldIdx, SubChannelGroupView.PALETTE.length - 1)
        ];
      const colorMap = new Map<string, string>();
      for (let i = 0; i < values.length; i++) {
        colorMap.set(values[i], palette[i % palette.length]);
      }
      this.fieldValueColors.set(field, colorMap);
      fieldIdx++;
    }
  }

  /** Visible height of the group area in CSS pixels. */
  getVisibleHeight(): number {
    const subH = this.getSubHeight();
    const total = this.subChannels.length * subH;
    const maxH = this.maxVisibleCount * this.parentHeight;
    return Math.min(total, maxH);
  }

  /** Total content height in CSS pixels (may exceed visible height). */
  private getTotalContentHeight(): number {
    return this.subChannels.length * this.getSubHeight();
  }

  /** Height of one sub-channel in CSS pixels. */
  private getSubHeight(): number {
    if (this.subChannels.length > 0) {
      const pref = this.subChannels[0].getPreferredHeight?.();
      if (pref !== undefined) return pref;
    }
    return this.parentHeight;
  }

  private get needsScroll(): boolean {
    return this.getTotalContentHeight() > this.getVisibleHeight();
  }

  // ── Layout ──────────────────────────────────────────────────────────

  layout(x: number, y: number, width: number, height: number): void {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;

    const dpr = window.devicePixelRatio || 1;
    const subHeightCSS = this.getSubHeight();
    const subHeightDevice = subHeightCSS * dpr;

    // Clamp scroll offset
    const maxScroll = Math.max(
      0,
      this.getTotalContentHeight() - this.getVisibleHeight(),
    );
    if (this.scrollOffset > maxScroll) this.scrollOffset = maxScroll;

    // Position each sub-channel in canvas space
    let currentY = y - this.scrollOffset * dpr;
    for (const sub of this.subChannels) {
      sub.layout(x, currentY, width, subHeightDevice);
      currentY += subHeightDevice;
    }

    // Update DOM positions
    if (this.groupContainer) {
      this.groupContainer.style.top = `${y / dpr}px`;
      this.groupContainer.style.height = `${height / dpr}px`;

      const labelW = this.getSampleLabelWidth();

      // Position trackContainers relative to the group container,
      // offset right by the sample label width
      for (const sub of this.subChannels) {
        const tc = sub.trackContainer as HTMLElement | null;
        if (tc) {
          tc.style.top = `${(sub.y - this.y) / dpr}px`;
          tc.style.height = `${subHeightCSS}px`;
          if (labelW > 0) {
            tc.style.left = `${labelW}px`;
            // Preserve the scrollbar inset so score labels don't hide
            // behind the browser-level channel scrollbar.
            tc.style.right = `${this._scrollbarInset}px`;
          }
        }
        // Store the label offset on the sub-channel so overlay canvases can
        // compensate and align with the parent's full-width coordinate space.
        (sub as any)._trackLabelOffset = labelW;
      }
    }

    this.updateScrollbar();
    this.updateSampleLabelPositions();
  }

  // ── Render ──────────────────────────────────────────────────────────

  render(state: SubChannelGroupRenderState): void {
    // this.lastDomain = state.domain;
    for (const sub of this.subChannels) {
      const subY = sub.y as number;
      const subH = sub.height as number;
      const subBottom = subY + subH;
      const groupBottom = this.y + this.height;

      // Skip if completely outside the visible group area
      if (subBottom <= this.y || subY >= groupBottom) continue;

      // Clip bounds so renderBackground/renderFeatures scissor-clip
      sub._clipBounds = { y: this.y, height: this.height };
      sub.render(state);
      sub._clipBounds = null;
    }

    this.renderSubChannelGridLines();
  }

  /**
   * Render dashed horizontal dividers between sub-channels via WebGL
   * scissor, clipped to the visible group area.
   */
  private renderSubChannelGridLines(): void {
    const gl = this.context.gl;
    const canvas = this.context.canvas;
    if (!gl || !canvas) return;

    const canvasHeight = canvas.height;
    const groupTop = this.y;
    const groupBottom = this.y + this.height;
    const dpr = window.devicePixelRatio || 1;

    // Must use alpha = 1.0 because canvas has premultipliedAlpha: true.
    // Semi-transparent clearColor values appear washed-out / invisible.
    const gridColor =
      this.context.theme === "light"
        ? [0.78, 0.78, 0.78, 1.0]
        : [0.35, 0.35, 0.35, 1.0];

    // Dash / gap sizes in CSS pixels, converted to device pixels
    const dashLen = Math.round(4 * dpr);
    const gapLen = Math.round(4 * dpr);

    gl.enable(gl.SCISSOR_TEST);

    for (let i = 0; i < this.subChannels.length - 1; i++) {
      const sub = this.subChannels[i];
      const lineY = (sub.y as number) + (sub.height as number); // bottom edge

      // Only draw if the line falls within the visible group area
      if (lineY <= groupTop || lineY >= groupBottom) continue;

      const glY = Math.max(0, Math.floor(canvasHeight - lineY - 1));
      if (glY < 0 || glY >= canvasHeight) continue;

      // Dashed line across full width
      let currentX = Math.floor(this.x);
      const endX = Math.floor(this.x + this.width);

      gl.clearColor(gridColor[0], gridColor[1], gridColor[2], gridColor[3]);

      while (currentX < endX) {
        const segW = Math.min(dashLen, endX - currentX);
        if (segW > 0) {
          gl.scissor(currentX, glY, segW, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        currentX += dashLen + gapLen;
      }
    }

    gl.disable(gl.SCISSOR_TEST);
  }

  // ── Mount / Destroy ─────────────────────────────────────────────────

  mount(container: HTMLElement, insertAfter?: HTMLElement): void {
    // Idempotency guard: tear down existing group DOM first, else a second
    // mount() call would duplicate sub-channel labels.
    if (this.groupContainer) {
      logger.warn(
        "[SubChannelGroupView] mount() called while groupContainer already exists — destroying old group first",
      );
      this.destroy();
    }

    const dpr = window.devicePixelRatio || 1;

    this.groupContainer = document.createElement("div");
    this.groupContainer.className = "subchannel-group-container";
    this.groupContainer.style.position = "absolute";
    this.groupContainer.style.left = "0";
    this.groupContainer.style.right = "0";
    this.groupContainer.style.top = `${this.y / dpr}px`;
    this.groupContainer.style.height = `${this.height / dpr}px`;
    this.groupContainer.style.overflow = "hidden";
    this.groupContainer.style.pointerEvents = "none";
    this.groupContainer.style.zIndex = "999";

    // Inner shadow overlay to mark the subchannel list boundaries
    const shadowOverlay = document.createElement("div");
    shadowOverlay.className = "subchannel-shadow-overlay";
    shadowOverlay.style.cssText = [
      "position:absolute",
      "inset:0",
      "pointer-events:none",
      "z-index:1000",
      "box-shadow:inset 0 6px 6px -4px rgba(0,0,0,0.15), inset 0 -6px 6px -4px rgba(0,0,0,0.15)",
    ].join(";");
    this.groupContainer.appendChild(shadowOverlay);

    // Insert right after the parent's track-container for correct DOM order
    // (setupDragHandleEvents relies on nextElementSibling to find the group)
    if (insertAfter && insertAfter.nextSibling) {
      container.insertBefore(this.groupContainer, insertAfter.nextSibling);
    } else {
      container.appendChild(this.groupContainer);
    }

    for (const sub of this.subChannels) {
      sub.mount(this.groupContainer);
    }

    // Position trackContainers relative to group
    const labelW = this.getSampleLabelWidth();
    for (const sub of this.subChannels) {
      const tc = sub.trackContainer as HTMLElement | null;
      if (tc) {
        tc.style.top = `${(sub.y - this.y) / dpr}px`;
        if (labelW > 0) {
          tc.style.left = `${labelW}px`;
          tc.style.right = "0";
        }
      }
      (sub as any)._trackLabelOffset = labelW;
    }

    // ── Sample label coloured blocks ──────────────────────────────────
    if (this.expandFields.length > 0) {
      this.createSampleLabels();
    }

    if (this.needsScroll) {
      this.createScrollbar();
    }
  }

  // ── Sample label rendering ──────────────────────────────────────────

  /** Width of one colour-block strip in CSS px (from default config). */
  private static get SAMPLE_LABEL_STRIP_W(): number {
    return defaultConfig.ui.sampleLabel.stripWidth;
  }
  /** Gap between strips in CSS px (from default config). */
  private static get SAMPLE_LABEL_GAP(): number {
    return defaultConfig.ui.sampleLabel.stripGap;
  }

  /** Total width of sample label block in CSS px (strips + gaps). */
  getSampleLabelWidth(): number {
    if (this.expandFields.length === 0) return 0;
    const n = this.expandFields.length;
    return (
      n * SubChannelGroupView.SAMPLE_LABEL_STRIP_W +
      (n - 1) * SubChannelGroupView.SAMPLE_LABEL_GAP
    );
  }

  /**
   * Get sample label colour strips for a sub-channel (for SVG export).
   * Returns an array of { field, value, color } objects — one per expand field.
   */
  getSampleLabelColors(
    sub: any,
  ): { field: string; value: string; color: string }[] {
    if (this.expandFields.length === 0) return [];
    const compositeKey: string = sub._expandFilterValue ?? "";
    const parts =
      this.expandFields.length === 1
        ? [compositeKey]
        : compositeKey.split(SubChannelGroupView.COMPOSITE_SEP);
    const result: { field: string; value: string; color: string }[] = [];
    for (let f = 0; f < this.expandFields.length; f++) {
      const field = this.expandFields[f];
      const val = parts[f] ?? "";
      const color = this.fieldValueColors.get(field)?.get(val) ?? "#999";
      result.push({ field, value: val, color });
    }
    return result;
  }

  /**
   * Create a sample label per sub-channel: a left-edge row of coloured
   * rectangles, one per expand field.
   */
  private createSampleLabels(): void {
    if (!this.groupContainer) return;
    const dpr = window.devicePixelRatio || 1;
    const STRIP = SubChannelGroupView.SAMPLE_LABEL_STRIP_W;
    const COMPOSITE_SEP = SubChannelGroupView.COMPOSITE_SEP;

    // Remove previous labels if any
    for (const el of this.sampleLabelEls) el.remove();
    this.sampleLabelEls = [];

    for (let i = 0; i < this.subChannels.length; i++) {
      const sub = this.subChannels[i];
      const compositeKey: string = sub._expandFilterValue ?? "";
      const parts =
        this.expandFields.length === 1
          ? [compositeKey]
          : compositeKey.split(COMPOSITE_SEP);

      const labelRow = document.createElement("div");
      labelRow.className = "sample-label-row";
      labelRow.style.cssText = [
        "position:absolute",
        "left:0",
        `top:${(sub.y - this.y) / dpr}px`,
        `height:${(sub.height ?? this.parentHeight * dpr) / dpr}px`,
        "display:flex",
        "flex-direction:row",
        "align-items:stretch",
        "pointer-events:auto",
        "z-index:1002",
        "cursor:pointer",
      ].join(";");

      for (let f = 0; f < this.expandFields.length; f++) {
        const field = this.expandFields[f];
        const val = parts[f] ?? "";
        const color = this.fieldValueColors.get(field)?.get(val) ?? "#999";

        const strip = document.createElement("div");
        strip.className = "sample-label-strip";
        strip.dataset.field = field;
        strip.dataset.value = val;
        const gap = SubChannelGroupView.SAMPLE_LABEL_GAP;
        strip.style.cssText = [
          `width:${STRIP}px`,
          "height:100%",
          `background:${color}`,
          f < this.expandFields.length - 1 ? `margin-right:${gap}px` : "",
          "border-radius:0",
          "transition:filter 0.12s",
        ].join(";");

        labelRow.appendChild(strip);
      }

      // Composite key stored for tooltip lookup
      labelRow.dataset.compositeKey = compositeKey;
      labelRow.dataset.subIndex = String(i);

      // Hover: tooltip + highlight
      labelRow.addEventListener("mouseenter", (ev) =>
        this.onSampleLabelEnter(ev, labelRow),
      );
      labelRow.addEventListener("mouseleave", () =>
        this.onSampleLabelLeave(labelRow),
      );

      this.groupContainer.appendChild(labelRow);
      this.sampleLabelEls.push(labelRow);
    }
  }

  /** Reposition sample labels after layout changes (scroll / resize). */
  private updateSampleLabelPositions(): void {
    if (this.sampleLabelEls.length === 0) return;
    const dpr = window.devicePixelRatio || 1;

    for (let i = 0; i < this.sampleLabelEls.length; i++) {
      const sub = this.subChannels[i];
      if (!sub) continue;
      const labelRow = this.sampleLabelEls[i];
      labelRow.style.top = `${(sub.y - this.y) / dpr}px`;
      labelRow.style.height = `${(sub.height ?? this.parentHeight * dpr) / dpr}px`;
    }
  }

  // ── Sample label tooltip ────────────────────────────────────────────

  /**
   * Show a lightweight tooltip next to the sample label on hover
   * and highlight the hovered colour-block strips (brightness boost).
   */
  private onSampleLabelEnter(ev: MouseEvent, labelRow: HTMLElement): void {
    // Highlight all strips in this row
    const strips = labelRow.querySelectorAll<HTMLElement>(
      ".sample-label-strip",
    );
    strips.forEach((s) => (s.style.filter = "brightness(1.35)"));

    const compositeKey = labelRow.dataset.compositeKey ?? "";
    const COMPOSITE_SEP = SubChannelGroupView.COMPOSITE_SEP;
    const parts =
      this.expandFields.length === 1
        ? [compositeKey]
        : compositeKey.split(COMPOSITE_SEP);

    // Create / reuse tooltip element
    if (!this.sampleTooltipEl) {
      this.sampleTooltipEl = document.createElement("div");
      this.sampleTooltipEl.className = "sample-label-tooltip";
      this.sampleTooltipEl.style.cssText = [
        "position:fixed",
        "z-index:99999",
        "padding:6px 10px",
        "background:rgba(30,30,30,0.92)",
        "color:#eee",
        "font:12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
        "border-radius:4px",
        "pointer-events:none",
        "white-space:nowrap",
        "box-shadow:0 2px 8px rgba(0,0,0,0.35)",
        "backdrop-filter:blur(4px)",
      ].join(";");
      document.body.appendChild(this.sampleTooltipEl);
    }

    // Render rows: field = value, with coloured badge
    let html = "";
    for (let f = 0; f < this.expandFields.length; f++) {
      const field = this.expandFields[f];
      const val = parts[f] ?? "";
      const color = this.fieldValueColors.get(field)?.get(val) ?? "#999";
      html += `<div style="display:flex;align-items:center;gap:6px;${f > 0 ? "margin-top:3px;" : ""}">`;
      html += `<span style="display:inline-block;width:8px;height:8px;background:${color};border-radius:0;flex-shrink:0;border:1px solid rgba(255,255,255,0.25);"></span>`;
      html += `<span style="color:#aaa;">${this.escHtml(field)}:</span>`;
      html += `<span>${this.escHtml(val)}</span>`;
      html += `</div>`;
    }

    // For score channels (exon/junction expression), show count stats
    // for the hovered tissue.
    const matchingSub = this.subChannels.find(
      (s: any) => s._expandFilterValue === compositeKey,
    );
    if (matchingSub) {
      const subData: any[] = (matchingSub as any).data ?? [];
      const scoreFeatures = subData.filter(
        (f: any) => f.score !== undefined && f.score !== null,
      );
      if (scoreFeatures.length > 0) {
        const scores = scoreFeatures.map((f: any) => Number(f.score));
        const totalCount = scores.reduce((a, b) => a + b, 0);
        const maxCount = Math.max(...scores);
        const featureCount = scoreFeatures.length;
        html += `<div style="margin-top:5px;border-top:1px solid rgba(255,255,255,0.15);padding-top:5px;display:flex;flex-direction:column;gap:2px;">`;
        html += `<div><span style="color:#aaa;">Features:</span> ${featureCount}</div>`;
        html += `<div><span style="color:#aaa;">Count (max):</span> ${Math.round(maxCount)}</div>`;
        html += `<div><span style="color:#aaa;">Count (sum):</span> ${Math.round(totalCount)}</div>`;
        html += `</div>`;
      }
    }
    this.sampleTooltipEl.innerHTML = html;
    this.sampleTooltipEl.style.display = "block";

    this.positionSampleTooltip(ev.clientX, ev.clientY);

    // Reposition tooltip as the cursor moves
    labelRow.addEventListener(
      "mousemove",
      this.onSampleLabelMouseMove as EventListener,
    );
  }

  /** Reposition tooltip as cursor moves within the label row. */
  private onSampleLabelMouseMove = (ev: MouseEvent): void => {
    this.positionSampleTooltip(ev.clientX, ev.clientY);
  };

  /** Position tooltip avoiding viewport overflow. */
  private positionSampleTooltip(clientX: number, clientY: number): void {
    if (!this.sampleTooltipEl) return;
    const GAP = 12;
    const tipW = this.sampleTooltipEl.offsetWidth;
    const tipH = this.sampleTooltipEl.offsetHeight;
    let left = clientX + GAP;
    let top = clientY - tipH / 2;

    if (left + tipW > window.innerWidth - 4) left = clientX - tipW - GAP;
    if (top < 4) top = 4;
    if (top + tipH > window.innerHeight - 4)
      top = window.innerHeight - 4 - tipH;

    this.sampleTooltipEl.style.left = `${left}px`;
    this.sampleTooltipEl.style.top = `${top}px`;
  }

  /** Hide tooltip and remove highlight. */
  private onSampleLabelLeave(labelRow: HTMLElement): void {
    const strips = labelRow.querySelectorAll<HTMLElement>(
      ".sample-label-strip",
    );
    strips.forEach((s) => (s.style.filter = "none"));

    if (this.sampleTooltipEl) {
      this.sampleTooltipEl.style.display = "none";
    }

    labelRow.removeEventListener(
      "mousemove",
      this.onSampleLabelMouseMove as EventListener,
    );
  }

  /** Minimal HTML escaping. */
  private escHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  destroy(): void {
    for (const el of this.sampleLabelEls) el.remove();
    this.sampleLabelEls = [];

    if (this.sampleTooltipEl) {
      this.sampleTooltipEl.remove();
      this.sampleTooltipEl = null;
    }

    if (this.scrollTrack) {
      this.scrollTrack.remove();
      this.scrollTrack = null;
      this.scrollThumb = null;
    }
    if (this.groupContainer && this.groupContainer.parentElement) {
      this.groupContainer.parentElement.removeChild(this.groupContainer);
    }
    this.groupContainer = null;
  }

  // ── Sub-channel reordering (drag within group) ──────────────────────

  reorderSubChannel(fromIndex: number, toIndex: number): void {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= this.subChannels.length ||
      toIndex >= this.subChannels.length
    )
      return;


    const [moved] = this.subChannels.splice(fromIndex, 1);
    this.subChannels.splice(toIndex, 0, moved);

    // Reorder sample label elements to match
    if (this.sampleLabelEls.length === this.subChannels.length + 1) {
      // length check accounts for the splice above (already done)
    }
    if (
      this.sampleLabelEls.length > fromIndex &&
      this.sampleLabelEls.length > toIndex
    ) {
      const [movedLabel] = this.sampleLabelEls.splice(fromIndex, 1);
      this.sampleLabelEls.splice(toIndex, 0, movedLabel);
    }

    // Reorder DOM so subsequent querySelectorAll matches logical order
    for (const sub of this.subChannels) {
      const tc = sub.trackContainer as HTMLElement | null;
      if (tc && this.groupContainer) {
        this.groupContainer.appendChild(tc);
      }
    }

    this.layout(this.x, this.y, this.width, this.height);
    this.onDirty?.();
  }

  // ── Scrollbar ───────────────────────────────────────────────────────

  private createScrollbar(): void {
    if (!this.groupContainer) return;

    // Guard: remove any existing scrollbar before creating a new one
    if (this.scrollTrack) {
      this.scrollTrack.remove();
      this.scrollTrack = null;
      this.scrollThumb = null;
    }

    const insetPx = Math.max(2, this._scrollbarInset);
    const track = document.createElement("div");
    track.style.cssText = [
      "position:absolute",
      `right:${insetPx}px`,
      "top:2px",
      "bottom:2px",
      "width:6px",
      "background:rgba(0,0,0,0.08)",
      "border-radius:6px",
      "pointer-events:auto",
      "z-index:1001",
    ].join(";");

    const thumb = document.createElement("div");
    thumb.style.cssText = [
      "position:absolute",
      "right:0",
      "width:6px",
      "background:rgba(0,0,0,0.4)",
      "border-radius:6px",
      "cursor:pointer",
      "transition:background 0.15s",
      "min-height:20px",
    ].join(";");

    thumb.addEventListener("mouseenter", () => {
      thumb.style.background = "rgba(0,0,0,0.6)";
    });
    thumb.addEventListener("mouseleave", () => {
      if (!thumbDragging) thumb.style.background = "rgba(0,0,0,0.4)";
    });

    track.appendChild(thumb);
    this.groupContainer.appendChild(track);
    this.scrollTrack = track;
    this.scrollThumb = thumb;

    // ── Thumb drag ──
    let thumbDragging = false;
    let thumbStartY = 0;
    let thumbStartOffset = 0;

    thumb.addEventListener("mousedown", (e) => {
      thumbDragging = true;
      thumbStartY = e.clientY;
      thumbStartOffset = this.scrollOffset;
      thumb.style.background = "rgba(0,0,0,0.7)";
      e.preventDefault();
      e.stopPropagation();

      const onMove = (ev: MouseEvent) => {
        if (!thumbDragging) return;
        const trackH = this.scrollTrack!.clientHeight;
        const thumbH = this.scrollThumb!.clientHeight;
        const scrollableTrack = trackH - thumbH;
        if (scrollableTrack <= 0) return;

        const deltaY = ev.clientY - thumbStartY;
        const maxScroll =
          this.getTotalContentHeight() - this.getVisibleHeight();
        const newOffset = Math.max(
          0,
          Math.min(
            maxScroll,
            thumbStartOffset + (deltaY / scrollableTrack) * maxScroll,
          ),
        );
        this.scrollTo(newOffset);
      };

      const onUp = () => {
        thumbDragging = false;
        thumb.style.background = "rgba(0,0,0,0.4)";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    // ── Wheel on scrollbar track ──
    track.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const maxScroll =
          this.getTotalContentHeight() - this.getVisibleHeight();
        const newOffset = Math.max(
          0,
          Math.min(maxScroll, this.scrollOffset + e.deltaY * 0.5),
        );
        this.scrollTo(newOffset);
      },
      { passive: false },
    );

    this.updateScrollbar();
  }

  private scrollTo(offset: number): void {
    this.scrollOffset = offset;
    this.layout(this.x, this.y, this.width, this.height);
    this.onDirty?.();
  }

  /**
   * Scroll through sub-channels when the user holds Alt and scrolls.
   * Returns `true` if the group needs scrolling and the scroll was applied.
   */
  altWheelScroll(deltaY: number): boolean {
    if (!this.needsScroll) return false;
    const maxScroll = this.getTotalContentHeight() - this.getVisibleHeight();
    const newOffset = Math.max(
      0,
      Math.min(maxScroll, this.scrollOffset + deltaY * 0.5),
    );
    this.scrollTo(newOffset);
    return true;
  }

  private updateScrollbar(): void {
    if (!this.scrollTrack || !this.scrollThumb) return;

    const totalH = this.getTotalContentHeight();
    const visibleH = this.getVisibleHeight();

    if (totalH <= visibleH) {
      this.scrollTrack.style.display = "none";
      return;
    }
    this.scrollTrack.style.display = "block";

    const trackH = this.scrollTrack.clientHeight || visibleH - 4;
    const thumbRatio = visibleH / totalH;
    const thumbH = Math.max(20, trackH * thumbRatio);
    const maxScroll = totalH - visibleH;
    const scrollRatio = maxScroll > 0 ? this.scrollOffset / maxScroll : 0;
    const thumbTop = scrollRatio * (trackH - thumbH);

    this.scrollThumb.style.height = `${thumbH}px`;
    this.scrollThumb.style.top = `${thumbTop}px`;
  }

  // ── Hit-testing (delegated from parent ChannelView) ───────────────

  /**
   * Hit-test a canvas-space point against visible sub-channels.
   * Returns `{ feature, channel }` from the first sub-channel that hits.
   */
  hitTestFeature(
    canvasX: number,
    canvasY: number,
    domain: { start: number; end: number },
  ): { feature: any; channel: any } | null {
    // Only test sub-channels whose Y region overlaps the visible group area
    const groupTop = this.y;
    const groupBottom = this.y + this.height;

    for (const sub of this.subChannels) {
      const subY = sub.y as number;
      const subH = sub.height as number;
      const subBottom = subY + subH;

      // Skip if fully outside visible area
      if (subBottom <= groupTop || subY >= groupBottom) continue;
      // Skip if canvasY is outside this sub-channel's Y range
      if (
        canvasY < Math.max(subY, groupTop) ||
        canvasY > Math.min(subBottom, groupBottom)
      )
        continue;

      const feature = sub.hitTestFeature(canvasX, canvasY, domain);
      if (feature) return { feature, channel: sub };
    }
    return null;
  }

  /**
   * Gather per-channel genomic-position hits for cursor mode from visible sub-channels.
   */
  collectGenomicHits(
    genomicPos: number,
    domain: { start: number; end: number },
    dpr: number,
  ): Array<{ channelName: string; annotation: string; yCenterCss: number }> {
    const groupTop = this.y;
    const groupBottom = this.y + this.height;
    const results: Array<{
      channelName: string;
      annotation: string;
      yCenterCss: number;
    }> = [];

    for (const sub of this.subChannels) {
      const subY = sub.y as number;
      const subH = sub.height as number;
      const subBottom = subY + subH;

      // Only include sub-channels at least partially visible
      if (subBottom <= groupTop || subY >= groupBottom) continue;

      const feature = sub.hitTestGenomicPos(genomicPos, domain);
      if (feature) {
        const annotation = sub.getFeatureAnnotation(feature);
        if (annotation) {
          // Clamp centre to visible portion
          const visTop = Math.max(subY, groupTop);
          const visBot = Math.min(subBottom, groupBottom);
          const yCenterCss = (visTop + visBot) / 2 / dpr;
          results.push({ channelName: sub.name, annotation, yCenterCss });
        }
      }
    }
    return results;
  }
}
