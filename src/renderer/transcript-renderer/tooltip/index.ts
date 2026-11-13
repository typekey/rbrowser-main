export interface ITooltipBadge {
  /** Short text displayed inside the badge (e.g. "A", "SNP"). */
  text: string;
  /** Badge background colour (hex). */
  color: string;
  /** Badge text colour (hex). Defaults to "#ffffff". */
  textColor?: string;
}

export interface ITooltipRow {
  /** Display label (left column). */
  label: string;
  /** Display value (right column). */
  value: string | number;
  /** If true, render a horizontal separator line instead of label/value. */
  separator?: boolean;
  /** Optional coloured badges rendered in-line before the value text. */
  badges?: ITooltipBadge[];
}

export interface ITooltipContent {
  /** Bold title line (e.g. channel name). */
  title: string;
  /** Key-value rows displayed below the title. */
  rows: ITooltipRow[];
  /**
   * Optional genomic span of the feature. When present, the pinned header
   * shows "zoom-to" (target) and "highlight" (bulb) icons.
   */
  featureRegion?: {
    start: number;
    end: number;
    /** true = junction arc (highlight endpoints only, not the full span). */
    isJunction?: boolean;
  };
}

/**
 * Tooltip display mode.
 * - `"detailed"` : title + region + all fields (default)
 * - `"compact"`  : no title/region; bigwig → score only, others → annotation name
 */
export type TooltipMode = "detailed" | "compact";

/**
 * Tooltip trigger mode.
 * - `"hover"` : shows on mousemove, hides on mouseout (default)
 * - `"click"` : shows on click, stays pinned with close button
 * - `"off"`   : tooltip disabled
 */
export type TooltipTrigger = "hover" | "click" | "off";

// ── Tooltip class ─────────────────────────────────────────────────────────

/**
 * Singleton dark-card tooltip.
 *
 * Usage:
 *   const tip = new Tooltip(container);
 *   tip.show(mouseX, mouseY, { title: "m6A", rows: [...] });
 *   tip.hide();
 *   tip.destroy();
 */
export class Tooltip {
  /** Root container we append the tooltip element to. */
  private container: HTMLElement;

  /** The actual tooltip DOM node. */
  private el: HTMLDivElement;

  /** Whether the tooltip is currently visible. */
  private _visible = false;

  /** Whether the tooltip is pinned (click mode — shows close button). */
  private _pinned = false;

  /** Drag state */
  private _isDragging = false;
  private _dragStartX = 0;
  private _dragStartY = 0;
  private _currentX = 0;
  private _currentY = 0;

  /** Optional callback invoked when the tooltip is hidden. */
  public onHide: (() => void) | null = null;

  /**
   * Called when the user clicks the ⊕ target icon in the pinned tooltip header.
   * The renderer should zoom the viewport to [start, end].
   */
  public onZoomTo: ((start: number, end: number) => void) | null = null;

  /**
   * Called when the user clicks the 💡 bulb icon in the pinned tooltip header.
   * The renderer should add a highlight band for [start, end].
   * If isJunction is true, only the endpoints should be highlighted.
   */
  public onHighlight:
    ((start: number, end: number, isJunction?: boolean) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    this.el = document.createElement("div");
    this.el.className = "rbrowser-tooltip";
    this.applyBaseStyle();
    this.container.appendChild(this.el);
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Show the tooltip at `(x, y)` with the given content.
   * Coordinates are in CSS pixels **relative to the container**.
   */
  show(x: number, y: number, content: ITooltipContent): void {
    this.renderContent(content, false);
    this.el.style.pointerEvents = "none";
    this.el.style.visibility = "visible";
    this.el.style.opacity = "1";
    this._visible = true;
    this._pinned = false;

    this.positionAt(x, y);
  }

  /**
   * Show the tooltip pinned at `(x, y)` with a close (×) button.
   * The tooltip stays visible until the close button is clicked.
   * Tooltip can be dragged by the user.
   */
  showPinned(x: number, y: number, content: ITooltipContent): void {
    this.renderContent(content, true);
    this.el.style.pointerEvents = "auto";
    this.el.style.cursor = "";
    this.el.style.visibility = "visible";
    this.el.style.opacity = "1";
    this._visible = true;
    this._pinned = true;

    // positionAt applies boundary checking and updates _currentX/_currentY
    this.positionAt(x, y);
    this.attachDragHandlers();
  }

  /**
   * Move the tooltip without re-rendering content (fast path for mousemove).
   * Coordinates are in CSS pixels **relative to the container**.
   */
  move(x: number, y: number): void {
    if (!this._visible) return;
    this.positionAt(x, y);
  }

  /** Hide the tooltip with a short fade-out. */
  hide(): void {
    const wasDragging = this._isDragging;
    this.el.style.visibility = "hidden";
    this.el.style.opacity = "0";
    this.el.style.pointerEvents = "none";
    this.el.style.cursor = "";
    this._visible = false;
    this._pinned = false;
    this._isDragging = false;
    this.detachDragHandlers();

    // If the tooltip was being dragged (or pinned), dispatch a synthetic mouseup
    // on the document to reset any stuck browser pan state that may have been
    // initiated by a mousedown that leaked through before we could block it.
    if (wasDragging) {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    }

    // Notify listener that tooltip was hidden (e.g. to re-enable cursor)
    if (this.onHide) {
      this.onHide();
    }
  }

  /** Whether the tooltip card is currently shown. */
  get visible(): boolean {
    return this._visible;
  }

  /** Whether the tooltip is pinned (click mode with close button). */
  get pinned(): boolean {
    return this._pinned;
  }

  /** Whether the tooltip is currently being dragged by the user. */
  get isDragging(): boolean {
    return this._isDragging;
  }

  /** Remove the tooltip element from the DOM entirely. */
  destroy(): void {
    this.hide();
    this.detachDragHandlers();
    this.el.remove();
  }

  // ── Drag handlers ─────────────────────────────────────────────────────

  /** Reference to the current header element for drag binding. */
  private _headerEl: HTMLElement | null = null;

  private attachDragHandlers(): void {
    // Block ALL mouse events on the tooltip element from reaching the container
    this.el.addEventListener("mousedown", this.onTooltipMouseBlock);
    this.el.addEventListener("mousemove", this.onTooltipMouseBlock);
    this.el.addEventListener("mouseup", this.onTooltipMouseBlock);

    // Bind drag only to the header element (not the whole tooltip)
    this._headerEl = this.el.querySelector(
      ".rbrowser-tooltip-header",
    ) as HTMLElement | null;
    if (this._headerEl) {
      this._headerEl.addEventListener("mousedown", this.onDragStart);
    }
  }

  private detachDragHandlers(): void {
    this.el.removeEventListener("mousedown", this.onTooltipMouseBlock);
    this.el.removeEventListener("mousemove", this.onTooltipMouseBlock);
    this.el.removeEventListener("mouseup", this.onTooltipMouseBlock);
    if (this._headerEl) {
      this._headerEl.removeEventListener("mousedown", this.onDragStart);
    }
    this._headerEl = null;
    document.removeEventListener("mousemove", this.onDragMove);
    document.removeEventListener("mouseup", this.onDragEnd);
  }

  /** Block mouse events on the tooltip from propagating to the container. */
  private onTooltipMouseBlock = (e: MouseEvent): void => {
    // During drag, let mouseup bubble to document so onDragEnd handler fires
    if (this._isDragging && e.type === "mouseup") {
      return;
    }
    e.stopPropagation();
  };

  private onDragStart = (e: MouseEvent): void => {
    // Don't drag when clicking the close button
    if (
      (e.target as HTMLElement).classList.contains("rbrowser-tooltip-close")
    ) {
      return;
    }

    this._isDragging = true;
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
    if (this._headerEl) this._headerEl.style.cursor = "grabbing";
    e.preventDefault();
    e.stopPropagation();

    document.addEventListener("mousemove", this.onDragMove);
    document.addEventListener("mouseup", this.onDragEnd);
  };

  private onDragMove = (e: MouseEvent): void => {
    if (!this._isDragging) return;

    const dx = e.clientX - this._dragStartX;
    const dy = e.clientY - this._dragStartY;

    this._currentX += dx;
    this._currentY += dy;

    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;

    // Update position directly (skip edge detection during drag)
    this.el.style.transform = `translate3d(${this._currentX}px, ${this._currentY}px, 0px)`;
  };

  private onDragEnd = (): void => {
    this._isDragging = false;
    if (this._headerEl) this._headerEl.style.cursor = "grab";
    document.removeEventListener("mousemove", this.onDragMove);
    document.removeEventListener("mouseup", this.onDragEnd);
  };

  // ── Internal helpers ──────────────────────────────────────────────────

  /** Apply the required inline styles matching the design spec. */
  private applyBaseStyle(): void {
    const s = this.el.style;
    s.position = "absolute";
    s.display = "block";
    s.borderStyle = "solid";
    s.whiteSpace = "nowrap";
    s.zIndex = "9999999";
    s.boxShadow = "rgba(0, 0, 0, 0.2) 1px 1px 1px";
    s.transition =
      "opacity 0.2s cubic-bezier(0.23, 1, 0.32, 1), " +
      "visibility 0.2s cubic-bezier(0.23, 1, 0.32, 1), " +
      "transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)";
    s.backgroundColor = "rgba(0, 0, 0, 0.8)";
    s.borderWidth = "1px";
    s.borderRadius = "4px";
    s.borderColor = "rgba(0, 0, 0, 0.8)";
    s.color = "rgb(255, 255, 255)";
    s.padding = "3px 6px";
    s.fontFamily = "Calibre, Roboto, Helvetica, sans-serif";
    s.fontSize = "10px";
    s.lineHeight = "1.3";
    s.pointerEvents = "none";
    s.top = "0px";
    s.left = "0px";
    // Start hidden
    s.visibility = "hidden";
    s.opacity = "0";
  }

  /** Render an array of badges as small coloured squares (no text). */
  private renderBadges(badges?: ITooltipBadge[]): string {
    if (!badges || badges.length === 0) return "";
    return badges
      .map((b) => {
        const bg = b.color;
        return (
          `<span style="display:inline-block;width:8px;height:8px;` +
          `background:${bg};border-radius:0;margin-right:3px;` +
          `vertical-align:middle;border:1px solid rgba(255,255,255,0.25);"></span>`
        );
      })
      .join("");
  }

  /**
   * Max inline chars for a value before it is ellipsis-truncated. Long values
   * (CIGAR strings, read names) would otherwise stretch the card; the full text
   * is exposed via a native `title` sub-tooltip (works in pinned mode where the
   * card receives pointer events).
   */
  private static readonly MAX_VALUE_LEN = 40;

  /** Render the value cell, truncating long text and exposing the full value as a `title`. */
  private renderValueSpan(value: string): string {
    const max = Tooltip.MAX_VALUE_LEN;
    if (value.length <= max) {
      return `<span style="color:#ffffff;font-weight:500;">${this.esc(value)}</span>`;
    }
    const truncated = value.slice(0, max - 1) + "…";
    return (
      `<span title="${this.esc(value)}" style="color:#ffffff;font-weight:500;` +
      `cursor:help;border-bottom:1px dotted rgba(255,255,255,0.4);` +
      `overflow:hidden;text-overflow:ellipsis;">${this.esc(truncated)}</span>`
    );
  }

  /** Build the inner HTML from structured content. */
  private renderContent(content: ITooltipContent, showClose = false): void {
    const rows = content.rows
      .map((r) => {
        if (r.separator) {
          return `<div style="border-top:1px solid rgba(255,255,255,0.15);margin:4px 0;"></div>`;
        }
        const badgeHtml = this.renderBadges(r.badges);
        if (!r.label) {
          return (
            `<div style="margin:2px 0 0;">` +
            badgeHtml +
            this.renderValueSpan(String(r.value)) +
            `</div>`
          );
        }
        return (
          `<div style="margin:2px 0 0;display:flex;justify-content:space-between;gap:12px;align-items:center;">` +
          `<span style="color:#b3b3b3;flex-shrink:0;">${this.esc(r.label)}</span>` +
          `<span style="color:#ffffff;font-weight:500;min-width:0;text-align:right;">` +
          badgeHtml +
          this.renderValueSpan(String(r.value)) +
          `</span>` +
          `</div>`
        );
      })
      .join("");

    if (showClose) {
      // ── Pinned mode: distinct header bar + scrollable body ──────────
      // Build action icons (bulb=highlight, target=zoom) when featureRegion is known
      let actionIcons = "";
      if (content.featureRegion) {
        const { start, end, isJunction } = content.featureRegion;
        const jAttr = isJunction ? ` data-junction="1"` : "";
        // Bulb icon — highlight region (outlined SVG lightbulb)
        actionIcons +=
          `<svg class="rbrowser-tooltip-bulb" data-start="${start}" data-end="${end}"${jAttr}` +
          ` title="Highlight this region" viewBox="0 0 24 24" width="13" height="13"` +
          ` style="cursor:pointer;vertical-align:middle;margin:0 2px;opacity:0.85;fill:#ffffff;flex-shrink:0;">` +
          `<path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19` +
          ` 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74` +
          ` 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9` +
          ` c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"/>` +
          `</svg>`;
        // Target/crosshair icon — zoom to region
        actionIcons +=
          `<svg class="rbrowser-tooltip-target" data-start="${start}" data-end="${end}"` +
          ` title="Zoom to this region" viewBox="0 0 24 24" width="13" height="13"` +
          ` style="cursor:pointer;vertical-align:middle;margin:0 2px;opacity:0.8;fill:#ffffff;">` +
          `<path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4m8.94 3A8.994` +
          ` 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0` +
          ` 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2zM12 19c-3.87 0-7-3.13` +
          `-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7"/></svg>`;
      }

      const headerHtml = content.title
        ? `<div class="rbrowser-tooltip-header" style="display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.7);margin:-3px -6px 0;padding:4px 6px;border-radius:4px 4px 0 0;cursor:grab;user-select:none;">` +
          `<span style="font-size:10px;font-weight:600;flex:1;min-width:0;display:flex;align-items:center;">${this.esc(content.title)}</span>` +
          `<span style="display:flex;align-items:center;flex-shrink:0;">` +
          actionIcons +
          `<span class="rbrowser-tooltip-close" style="cursor:pointer;font-size:13px;color:#999;line-height:1;padding:0 2px;margin-left:4px;">×</span>` +
          `</span>` +
          `</div>`
        : `<div class="rbrowser-tooltip-header" style="display:flex;align-items:center;justify-content:flex-end;background:rgba(0,0,0,0.7);margin:-3px -6px 0;padding:4px 6px;border-radius:4px 4px 0 0;cursor:grab;user-select:none;">` +
          `<span style="display:flex;align-items:center;">` +
          actionIcons +
          `<span class="rbrowser-tooltip-close" style="cursor:pointer;font-size:13px;color:#999;line-height:1;padding:0 2px;">×</span>` +
          `</span>` +
          `</div>`;

      const bodyHtml =
        `<div class="rbrowser-tooltip-body" style="padding-top:4px;">` +
        rows +
        `</div>`;

      this.el.style.paddingRight = "6px";
      this.el.innerHTML = headerHtml + bodyHtml;

      const closeEl = this.el.querySelector(".rbrowser-tooltip-close");
      closeEl?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.hide();
      });

      const bulbEl = this.el.querySelector(".rbrowser-tooltip-bulb");
      bulbEl?.addEventListener("click", (e) => {
        e.stopPropagation();
        const el = e.currentTarget as HTMLElement;
        const s = parseInt(el.dataset.start ?? "0", 10);
        const en = parseInt(el.dataset.end ?? "0", 10);
        const junc = el.dataset.junction === "1";
        this.onHighlight?.(s, en, junc);
      });

      const targetEl = this.el.querySelector(".rbrowser-tooltip-target");
      targetEl?.addEventListener("click", (e) => {
        e.stopPropagation();
        const el = e.currentTarget as SVGElement;
        const s = parseInt((el as any).dataset.start ?? "0", 10);
        const en = parseInt((el as any).dataset.end ?? "0", 10);
        this.onZoomTo?.(s, en);
      });
    } else {
      // ── Hover mode: simple flat layout ──────────────────────────────
      const header = content.title
        ? `<div style="font-size:10px;font-weight:600;margin-bottom:2px;">${this.esc(content.title)}</div>`
        : "";

      this.el.style.paddingRight = "6px";
      this.el.innerHTML = header + rows;
    }
  }

  /**
   * Position the tooltip near the cursor and flip direction when close to
   * viewport edges so the card never gets clipped.
   */
  private positionAt(mouseX: number, mouseY: number): void {
    const OFFSET = 10; // gap between cursor and tooltip edge

    // Default: place below-right of cursor
    let x = mouseX + OFFSET;
    let y = mouseY + OFFSET;

    // Tentatively position so we can measure against the viewport
    this.el.style.transform = `translate3d(${x}px, ${y}px, 0px)`;

    const tipRect = this.el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Flip horizontally: place to the LEFT of the cursor
    if (tipRect.right > vw) {
      x = mouseX - tipRect.width - OFFSET;
    }
    // Flip vertically: place ABOVE the cursor
    if (tipRect.bottom > vh) {
      y = mouseY - tipRect.height - OFFSET;
    }
    // Safety: if flipped position still overflows left / top, clamp to 0
    if (x < 0) x = 0;
    if (y < 0) y = 0;

    this.el.style.transform = `translate3d(${x}px, ${y}px, 0px)`;

    // Store corrected position for drag calculations
    this._currentX = x;
    this._currentY = y;
  }

  /** Minimal HTML escaping. */
  private esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}
