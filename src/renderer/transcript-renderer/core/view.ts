interface RenderState {
  domain: { start: number; end: number };
}

/** Width of the browser-level channel scrollbar in CSS pixels. */
export const CHANNEL_SCROLLBAR_WIDTH = 12;

/** Abstract View class. */
export abstract class View {
  public x: number = 0;
  public y: number = 0;
  public width: number = 0;
  public height: number = 0;

  abstract render(state: RenderState): void;
  abstract layout(x: number, y: number, width: number, height: number): void;

  getPreferredHeight(): number | undefined {
    return undefined;
  }

  /**
   * Whether this view is pinned (sticky) at the top.
   * Override in subclasses (e.g. AxisView always returns true,
   * ChannelView returns config.style.pinned).
   */
  get isPinned(): boolean {
    return false;
  }

  /**
   * Set a scroll clip region (device pixels), or null to remove clipping.
   * Override in subclasses that need clipping (e.g. ChannelView).
   */
  setScrollClip(_clip: { y: number; height: number } | null): void {
    // No-op by default
  }

  /**
   * Set the right-side inset (CSS pixels) that sub-channel scrollbars honour
   * to avoid overlapping the browser-level channel scrollbar.
   */
  setScrollbarInset(_px: number): void {
    // No-op by default — override in ChannelView
  }

  /** Returns the current layout bounds in physical pixels. */
  getBounds(): { x: number; y: number; width: number; height: number } {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  /**
   * The view's own layout height in physical (device) pixels. Unlike
   * getBounds, subclasses that fold extra height into their bounds
   * (e.g. `ChannelView` adds its expand-group height) do NOT include that
   * here — this is always the parent view's own height.
   */
  get ownHeight(): number {
    return this.height;
  }
}

/**
 * Vertical stack of child views with scroll support. Pinned children (sticky
 * at the top) are laid out first at fixed height; scrollable children follow
 * below and may extend past the viewport with a scroll offset.
 */
export class LayoutView extends View {
  children: View[] = [];

  /** Scroll offset in device pixels for non-pinned children. */
  private _scrollOffset: number = 0;

  /** Total height of all scrollable children in device pixels. */
  private _scrollableContentHeight: number = 0;

  /** Height of the visible scrollable viewport in device pixels. */
  private _scrollableViewportHeight: number = 0;

  /** Top offset where the scrollable area begins (below pinned children). */
  private _scrollableAreaTop: number = 0;

  addChild(view: View) {
    this.children.push(view);
  }

  /** Insert a child view at a specific index. */
  insertChild(view: View, index: number) {
    this.children.splice(index, 0, view);
  }

  /** Remove a child view. Returns true if found and removed. */
  removeChild(view: View): boolean {
    const idx = this.children.indexOf(view);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      return true;
    }
    return false;
  }

  /** Whether scrolling is needed (content exceeds viewport). */
  get needsScroll(): boolean {
    return this._scrollableContentHeight > this._scrollableViewportHeight + 1;
  }

  /** Current scroll offset in device pixels. */
  get scrollOffset(): number {
    return this._scrollOffset;
  }

  /** Total scrollable content height in device pixels. */
  get scrollableContentHeight(): number {
    return this._scrollableContentHeight;
  }

  /** Visible viewport height for scrollable area in device pixels. */
  get scrollableViewportHeight(): number {
    return this._scrollableViewportHeight;
  }

  /** Device-pixel Y where the scrollable area starts. */
  get scrollableAreaTop(): number {
    return this._scrollableAreaTop;
  }

  /** Set scroll offset (device pixels). Clamped to valid range. */
  setScrollOffset(offset: number): void {
    const maxScroll = Math.max(
      0,
      this._scrollableContentHeight - this._scrollableViewportHeight,
    );
    this._scrollOffset = Math.max(0, Math.min(maxScroll, offset));
  }

  /** Scroll by a delta (device pixels). Positive = scroll down. */
  scrollBy(delta: number): void {
    this.setScrollOffset(this._scrollOffset + delta);
  }

  /**
   * Optional callback invoked between scrollable and pinned rendering.
   * Used by the renderer to draw grid lines after scrollable content
   * but before pinned content, so pinned channels are never obscured.
   */
  onBeforePinnedRender: (() => void) | null = null;

  /**
   * Optional callback invoked after all pinned children have rendered.
   * Used to draw grid lines for pinned tracks (which must appear on top
   * of pinned channel content).
   */
  onAfterPinnedRender: (() => void) | null = null;

  render(state: RenderState) {
    // Render scrollable children FIRST, then pinned on top, so pinned
    // channels paint over any scrolled content.
    const pinned: View[] = [];
    const scrollable: View[] = [];

    for (const child of this.children) {
      if (child.isPinned) {
        pinned.push(child);
      } else {
        scrollable.push(child);
      }
    }

    // Render scrollable children (skip those fully outside viewport)
    for (const child of scrollable) {
      if (this.needsScroll) {
        const bounds = child.getBounds();
        const viewportBottom =
          this._scrollableAreaTop + this._scrollableViewportHeight;
        if (
          bounds.y + bounds.height <= this._scrollableAreaTop ||
          bounds.y >= viewportBottom
        ) {
          continue;
        }
      }
      child.render(state);
    }

    // Invoke the between-phase callback (e.g. grid rendering)
    // so that grid lines appear above scrollable content but below pinned.
    this.onBeforePinnedRender?.();

    // Render pinned children on top
    for (const child of pinned) {
      child.render(state);
    }

    // Draw grid lines for pinned tracks (must appear after pinned content)
    this.onAfterPinnedRender?.();
  }

  layout(x: number, y: number, width: number, height: number) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;

    if (this.children.length === 0) return;

    const dpr = window.devicePixelRatio || 1;

    // ── Separate pinned and scrollable children ──
    const pinnedChildren: View[] = [];
    const scrollableChildren: View[] = [];

    for (const child of this.children) {
      if (child.isPinned) {
        pinnedChildren.push(child);
      } else {
        scrollableChildren.push(child);
      }
    }

    // ── Layout pinned children at the top ──
    // Pinned children MUST have a fixed height. If getPreferredHeight()
    // returns undefined, use a sensible default (24 CSS pixels).
    const DEFAULT_PINNED_HEIGHT = 24;

    let pinnedTotalHeight = 0;
    for (const child of pinnedChildren) {
      const pref = child.getPreferredHeight();
      const childH =
        pref !== undefined
          ? Math.round(pref * dpr)
          : Math.round(DEFAULT_PINNED_HEIGHT * dpr);
      // Clear scroll clip before layout so _applyScrollDOMClip uses
      // the correct state (no clipping for pinned channels).
      child.setScrollClip(null);
      child.setScrollbarInset(0);
      // Pinned channels use the full width — they sit above the scrollable
      // area and should not be narrowed by the browser scrollbar.
      child.layout(x, y + pinnedTotalHeight, width, childH);
      pinnedTotalHeight += childH;
    }

    // ── Compute scrollable children heights ──
    const scrollableAreaTop = y + pinnedTotalHeight;
    const scrollableViewportHeight = height - pinnedTotalHeight;

    // Calculate total height of scrollable children
    let scrollableTotalFixed = 0;
    let scrollableFlexCount = 0;

    for (const child of scrollableChildren) {
      const pref = child.getPreferredHeight();
      if (pref !== undefined) {
        scrollableTotalFixed += pref * dpr;
      } else {
        scrollableFlexCount++;
      }
    }

    // For flex children in the scrollable area, give them a fair share
    // of the VIEWPORT height (not the infinite scroll area)
    const scrollableRemaining = Math.max(
      0,
      scrollableViewportHeight - scrollableTotalFixed,
    );
    const scrollableFlexHeight =
      scrollableFlexCount > 0 ? scrollableRemaining / scrollableFlexCount : 0;

    // Compute total content height (actual height of all scrollable children)
    let contentHeight = 0;
    for (const child of scrollableChildren) {
      const pref = child.getPreferredHeight();
      const childH =
        pref !== undefined
          ? Math.round(pref * dpr)
          : Math.round(scrollableFlexHeight);
      contentHeight += childH;
    }

    this._scrollableAreaTop = scrollableAreaTop;
    this._scrollableViewportHeight = Math.max(0, scrollableViewportHeight);
    this._scrollableContentHeight = contentHeight;

    // Clamp scroll offset
    const maxScroll = Math.max(0, contentHeight - scrollableViewportHeight);
    if (this._scrollOffset > maxScroll) {
      this._scrollOffset = maxScroll;
    }

    // ── Layout scrollable children with scroll offset ──
    const scrollClip = this.needsScroll
      ? { y: scrollableAreaTop, height: scrollableViewportHeight }
      : null;

    // Tell all children about the scrollbar inset so sub-channel scrollbars
    // can avoid overlapping the browser-level channel scrollbar.
    const scrollbarInset = this.needsScroll ? CHANNEL_SCROLLBAR_WIDTH : 0;

    let currentY = scrollableAreaTop - this._scrollOffset;
    for (const child of scrollableChildren) {
      const pref = child.getPreferredHeight();
      const childH =
        pref !== undefined
          ? Math.round(pref * dpr)
          : Math.round(scrollableFlexHeight);

      // Set clip bounds and scrollbar inset BEFORE layout so that
      // _applyScrollDOMClip (called inside layout()) uses the correct,
      // up-to-date clip region.  Previously these were set after layout(),
      // causing stale clip bounds to hide channels incorrectly after
      // pin/unpin or height changes.
      child.setScrollClip(scrollClip);
      child.setScrollbarInset(scrollbarInset);

      child.layout(x, currentY, width, childH);

      currentY += childH;
    }
  }

  /**
   * Device-pixel Y coordinate of the bottom edge of the last pinned child.
   * Returns 0 if there are no pinned children.
   */
  get pinnedBottomY(): number {
    return this._scrollableAreaTop;
  }
}
