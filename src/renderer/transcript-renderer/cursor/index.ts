/**
 * Cursor module for the transcript renderer.
 *
 * Draws a vertical hairline at the mouse position and optionally shows
 * genomic coordinate / feature information in floating labels.
 *
 * Three display modes:
 *   - **compact**  – vertical 0.5 px line + coordinate label
 *   - **detailed** – vertical line + coordinate + per-channel feature annotations
 *                     in a single merged tooltip
 *   - **each**     – vertical line + one small label **per channel** positioned
 *                     at that channel's vertical centre
 */

import { cdsBaseOffset, rnaBaseOffset } from "../utils/transcript-coords";

// ── Public types ──────────────────────────────────────────────────────────

/** Cursor display mode (see module header for what each mode draws). */
export type CursorMode = "compact" | "detailed" | "each";

/** Minimal info about a channel hit used by detailed / each modes. */
export interface CursorChannelHit {
  channelName: string;
  annotation: string;
  /** CSS-pixel Y centre of the channel (relative to container). Used by "each" mode. */
  yCenterCss?: number;
}

/**
 * Optional coordinate-mode info passed to Cursor.show() so the label
 * can display RNA-relative or CDS-relative coordinates instead of
 * raw genomic positions.
 */
export interface CursorCoordMode {
  mode: "rna" | "cds";
  /** TSS position in genomic coordinates (RNA mode only). */
  tssPos?: number;
  /** Strand of the transcript. */
  strand: "+" | "-";
  /** CDS coordinate mapper (CDS mode only). */
  cdsMapper?: { genomicToCDS(pos: number): number; totalCDSLength: number };
}

// ── Shared label styles ──────────────────────────────────────────────────

const LABEL_STYLE: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  top: "0px",
  left: "0px",
  pointerEvents: "none",
  whiteSpace: "nowrap",
  backgroundColor: "rgba(0,0,0,0.75)",
  color: "#fff",
  fontSize: "10px",
  fontFamily: "Calibre, Roboto, Helvetica, sans-serif",
  lineHeight: "1.3",
  padding: "3px 6px",
  borderRadius: "3px",
  display: "none",
};

// ── Cursor class ──────────────────────────────────────────────────────────

export class Cursor {
  private container: HTMLElement;

  /** The vertical hairline element. */
  private lineEl: HTMLDivElement;

  /** Primary label for compact & detailed modes; hidden in "each" mode. */
  private labelEl: HTMLDivElement;

  /** Pool of per-channel label elements reused across frames ("each" mode); grown on demand. */
  private eachLabels: HTMLDivElement[] = [];

  /** Whether the cursor overlay is currently enabled. */
  private _enabled = true;

  /** Current display mode. */
  private _mode: CursorMode = "compact";

  /** CSS-pixel Y offset where content starts (below axis). */
  private contentTop = 0;

  /** Full container height in CSS px. */
  private containerHeight = 0;

  constructor(container: HTMLElement) {
    this.container = container;

    // ── Hairline ──────────────────────────────────────────────────────
    this.lineEl = document.createElement("div");
    this.lineEl.className = "rbrowser-cursor-line";
    Object.assign(this.lineEl.style, {
      position: "absolute",
      top: "0px",
      left: "0px",
      width: "0.5px",
      height: "100%",
      backgroundColor: "rgba(0,0,0,0.6)",
      pointerEvents: "none",
      zIndex: "9999990",
      display: "none",
    } as Partial<CSSStyleDeclaration>);
    this.container.appendChild(this.lineEl);

    // ── Primary label (compact / detailed) ───────────────────────────
    this.labelEl = document.createElement("div");
    this.labelEl.className = "rbrowser-cursor-label";
    Object.assign(this.labelEl.style, {
      ...LABEL_STYLE,
      zIndex: "9999991",
    } as Partial<CSSStyleDeclaration>);
    this.container.appendChild(this.labelEl);
  }

  // ── Public API ────────────────────────────────────────────────────────

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (!enabled) this.hide();
  }

  isEnabled(): boolean {
    return this._enabled;
  }

  setMode(mode: CursorMode): void {
    this._mode = mode;
  }

  getMode(): CursorMode {
    return this._mode;
  }

  /** Update layout metrics so the line spans the correct area. */
  updateLayout(contentTopCss: number, containerHeightCss: number): void {
    this.contentTop = contentTopCss;
    this.containerHeight = containerHeightCss;
  }

  /**
   * Show / update the cursor at a given container-relative X.
   *
   * @param localX        Mouse X in CSS pixels relative to container
   * @param genomicPos    Genomic coordinate at this X
   * @param channelHits   Per-channel feature hits (used in detailed & each modes)
   * @param coordMode     Optional RNA/CDS coordinate mode info
   */
  show(
    localX: number,
    genomicPos: number,
    channelHits?: CursorChannelHit[],
    coordMode?: CursorCoordMode,
  ): void {
    if (!this._enabled) return;

    // ── Position hairline ──────────────────────────────────────────────
    this.lineEl.style.display = "block";
    this.lineEl.style.left = `${localX}px`;
    this.lineEl.style.top = `${this.contentTop}px`;
    this.lineEl.style.height = `${this.containerHeight - this.contentTop}px`;

    // ── Mode: each ─────────────────────────────────────────────────────
    if (this._mode === "each") {
      this.labelEl.style.display = "none";
      this.showEachLabels(localX, channelHits ?? []);
      return;
    }

    // ── Hide per-channel labels when not in "each" mode ────────────────
    this.hideEachLabels();

    // ── Build primary label content (compact / detailed) ───────────────
    const coordStr = this.formatCoord(genomicPos, coordMode);
    let html = `<div style="font-weight:600;">${this.esc(coordStr)}</div>`;

    if (this._mode === "detailed" && channelHits && channelHits.length > 0) {
      for (const hit of channelHits) {
        html +=
          `<div style="margin-top:2px;border-top:1px solid rgba(255,255,255,0.15);padding-top:2px;">` +
          `<span style="color:#aaa;">${this.esc(hit.channelName)}</span> ` +
          `<span>${this.esc(hit.annotation)}</span>` +
          `</div>`;
      }
    }

    this.labelEl.innerHTML = html;
    this.labelEl.style.display = "block";
    this.positionLabel(localX);
  }

  /** Hide the cursor. */
  hide(): void {
    this.lineEl.style.display = "none";
    this.labelEl.style.display = "none";
    this.hideEachLabels();
  }

  /**
   * Snap the hairline to a specific CSS x position (e.g. base-pair centre).
   * Called AFTER show() to override the raw mouse-based position.
   */
  snapHairline(cssX: number): void {
    this.lineEl.style.left = `${cssX}px`;
  }

  /** Remove cursor elements entirely. */
  destroy(): void {
    this.hide();
    this.lineEl.remove();
    this.labelEl.remove();
    for (const el of this.eachLabels) el.remove();
    this.eachLabels.length = 0;
  }

  // ── "each" mode helpers ───────────────────────────────────────────────

  /** Show one small label per channel hit, positioned at the channel's vertical centre. */
  private showEachLabels(lineX: number, hits: CursorChannelHit[]): void {
    // Grow the pool until it can hold every hit
    while (this.eachLabels.length < hits.length) {
      const el = document.createElement("div");
      el.className = "rbrowser-cursor-each-label";
      Object.assign(el.style, {
        ...LABEL_STYLE,
        zIndex: "9999991",
      } as Partial<CSSStyleDeclaration>);
      this.container.appendChild(el);
      this.eachLabels.push(el);
    }

    const GAP = 4;
    const containerRect = this.container.getBoundingClientRect();

    for (let i = 0; i < this.eachLabels.length; i++) {
      const el = this.eachLabels[i];
      if (i >= hits.length) {
        el.style.display = "none";
        continue;
      }

      const hit = hits[i];
      el.innerHTML = this.esc(hit.annotation);
      el.style.display = "block";

      // Position: right of line, vertically centred on channel
      const yCenterCss = hit.yCenterCss ?? this.contentTop;
      let x = lineX + GAP;

      // Place tentatively to measure
      el.style.transform = `translate3d(${x}px, ${yCenterCss}px, 0px)`;

      const elRect = el.getBoundingClientRect();
      const halfH = elRect.height / 2;

      // Flip left if overflows right viewport edge
      if (elRect.right > window.innerWidth) {
        x = lineX - elRect.width - GAP;
      }
      // Also check container right edge
      if (x + elRect.width > containerRect.width) {
        x = lineX - elRect.width - GAP;
      }
      if (x < 0) x = 0;

      // Centre vertically on channel Y, clamping inside container
      let y = yCenterCss - halfH;
      if (y < this.contentTop) y = this.contentTop;
      if (y + elRect.height > this.containerHeight) {
        y = this.containerHeight - elRect.height;
      }

      el.style.transform = `translate3d(${x}px, ${y}px, 0px)`;
    }
  }

  /** Hide all per-channel label elements. */
  private hideEachLabels(): void {
    for (const el of this.eachLabels) {
      el.style.display = "none";
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────

  /** Position the primary label right of the hairline; flip left if it would overflow. */
  private positionLabel(lineX: number): void {
    const GAP = 4;
    let x = lineX + GAP;
    const y = this.contentTop;

    this.labelEl.style.transform = `translate3d(${x}px, ${y}px, 0px)`;

    const labelRect = this.labelEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (labelRect.right > vw) {
      x = lineX - labelRect.width - GAP;
    }
    if (labelRect.bottom > vh) {
      const overflowY = labelRect.bottom - vh + 4;
      this.labelEl.style.transform = `translate3d(${x}px, ${y - overflowY}px, 0px)`;
      return;
    }
    if (x < 0) x = 0;

    this.labelEl.style.transform = `translate3d(${x}px, ${y}px, 0px)`;
  }

  private esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ── Coordinate formatting ──────────────────────────────────────────────

  /** Format the genomic position for display, respecting RNA/CDS mode if set. */
  private formatCoord(genomicPos: number, coordMode?: CursorCoordMode): string {
    if (!coordMode) {
      // DNA mode: display 1-based genomic position (internal coordinates are 0-based).
      // Use floor to find which base the position falls in, then convert to 1-based.
      // Example: genomicPos=7771295.5 (base center) → floor=7771295 → display 7,771,296
      return (Math.floor(genomicPos) + 1).toLocaleString();
    }

    // genomicPos is the hovered base (floored by the caller). Offsets count
    // that base, so the TSS / start-codon base reads 0 on both strands.
    if (coordMode.mode === "cds" && coordMode.cdsMapper) {
      // In CDS mode, genomicPos is already in CDS space (viewDomain is CDS).
      const offset = cdsBaseOffset(
        Math.round(genomicPos),
        coordMode.cdsMapper.totalCDSLength,
        coordMode.strand,
      );
      return this.formatSignedOffset(offset);
    }

    if (coordMode.mode === "rna" && coordMode.tssPos !== undefined) {
      const offset = rnaBaseOffset(
        Math.round(genomicPos),
        coordMode.tssPos,
        coordMode.strand,
      );
      return this.formatSignedOffset(offset);
    }

    // Fallback: display 1-based genomic position (use floor for 0-based → 1-based conversion)
    return (Math.floor(genomicPos) + 1).toLocaleString();
  }

  /**
   * Format a signed offset using the same algorithm as axis formatRnaTickLabel:
   *   0       → "0"
   *   ±5000   → "±5K"
   *   ±1500   → "±1,500"
   *   ±5000000 → "±5M"
   */
  private formatSignedOffset(offset: number): string {
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
    // Add comma separators for large numbers (only when no suffix)
    const numStr = suffix === "" ? num.toLocaleString() : num.toString();
    return `${sign}${numStr}${suffix}`;
  }
}
