import { CHANNEL_SCROLLBAR_WIDTH } from "../../core/view";
import { ChannelView } from "../index";
import type { BaseRenderer } from "../../core/base-renderer";

/**
 * The drag-only channel scrollbar shown on the right edge when the stacked
 * channels overflow the viewport. Owns its DOM (track / thumb / feature
 * layers) and drag state; reads scroll geometry from rootView and asks the
 * renderer to relayout+repaint after a scroll.
 */
export class ChannelScrollbar {
  /** Scrollbar DOM — exactly 4 children:
   *  track (background) → features-bg → thumb → features-fg */
  private _track: HTMLDivElement | null = null;
  private _thumb: HTMLDivElement | null = null;
  private _featuresBg: HTMLDivElement | null = null;
  private _featuresFg: HTMLDivElement | null = null;
  /** Whether a scrollbar drag is in progress. */
  private _dragging = false;

  constructor(private readonly r: BaseRenderer) {}

  /**
   * Create the channel scrollbar DOM (drag-only, always visible when needed).
   * Called once during mount().
   */
  public create(container: HTMLElement): void {
    // Guard: remove any existing scrollbar before creating a new one
    if (this._track) {
      this._track.remove();
    }
    // Also purge stale elements left by a previous renderer instance
    // (e.g. React strict-mode double mount where destroy() ran but
    //  the container was reused)
    container
      .querySelectorAll(".channel-scrollbar-track")
      .forEach((el) => el.remove());

    this._track = null;
    this._thumb = null;
    this._featuresBg = null;
    this._featuresFg = null;

    const SB_WIDTH = CHANNEL_SCROLLBAR_WIDTH;

    // ── 1. Track (background) ──────────────────────────────────────────
    const track = document.createElement("div");
    track.className = "channel-scrollbar-track";
    Object.assign(track.style, {
      position: "absolute",
      right: "0px",
      width: `${SB_WIDTH}px`,
      background: "rgba(0, 0, 0, 0.06)",
      zIndex: "1100",
      borderRadius: "6px",
      pointerEvents: "auto",
      display: "none",
      overflow: "hidden",
    });

    // ── 2. Features background layer (behind the thumb) ────────────────
    const featuresBg = document.createElement("div");
    featuresBg.className = "channel-scrollbar-features-bg";
    Object.assign(featuresBg.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
    });

    // ── 3. Thumb (bar) ─────────────────────────────────────────────────
    const thumb = document.createElement("div");
    thumb.className = "channel-scrollbar-thumb";
    Object.assign(thumb.style, {
      position: "absolute",
      width: "100%",
      background: "rgba(100, 100, 100, 0.5)",
      borderRadius: "6px",
      cursor: "pointer",
      minHeight: "20px",
      transition: "background 0.15s",
    });

    // ── 4. Features foreground layer (in front of the thumb) ───────────
    const featuresFg = document.createElement("div");
    featuresFg.className = "channel-scrollbar-features-fg";
    Object.assign(featuresFg.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
    });

    // Hover feedback on thumb
    thumb.addEventListener("mouseenter", () => {
      thumb.style.background = "rgba(100, 100, 100, 0.7)";
    });
    thumb.addEventListener("mouseleave", () => {
      if (!this._dragging) {
        thumb.style.background = "rgba(100, 100, 100, 0.5)";
      }
    });

    // DOM order: track → featuresBg → thumb → featuresFg
    track.appendChild(featuresBg);
    track.appendChild(thumb);
    track.appendChild(featuresFg);
    container.appendChild(track);

    this._track = track;
    this._thumb = thumb;
    this._featuresBg = featuresBg;
    this._featuresFg = featuresFg;

    // ── Drag thumb ──
    let dragStartY = 0;
    let dragStartOffset = 0;

    const onThumbMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this._dragging = true;
      dragStartY = e.clientY;
      dragStartOffset = this.r.rootView.scrollOffset;
      thumb.style.background = "rgba(100, 100, 100, 0.8)";

      const onMove = (ev: MouseEvent) => {
        const deltaY = ev.clientY - dragStartY;
        const trackHeight =
          this.r.rootView.scrollableViewportHeight /
          (window.devicePixelRatio || 1);
        const contentHeight =
          this.r.rootView.scrollableContentHeight /
          (window.devicePixelRatio || 1);
        if (trackHeight <= 0 || contentHeight <= 0) return;
        const ratio = contentHeight / trackHeight;
        const dpr = window.devicePixelRatio || 1;
        this.r.rootView.setScrollOffset(dragStartOffset + deltaY * ratio * dpr);
        this.r._relayoutAndRepaint();
      };

      const onUp = () => {
        this._dragging = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        thumb.style.background = "rgba(100, 100, 100, 0.5)";
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };

    thumb.addEventListener("mousedown", onThumbMouseDown);

    // ── Click on track (jump to position) ──
    track.addEventListener("mousedown", (e: MouseEvent) => {
      if (e.target === thumb) return; // thumb handles its own drag
      e.preventDefault();

      const trackRect = track.getBoundingClientRect();
      const clickY = e.clientY - trackRect.top;
      const trackHeight = trackRect.height;
      if (trackHeight <= 0) return;

      const fraction = clickY / trackHeight;
      const maxScroll =
        this.r.rootView.scrollableContentHeight -
        this.r.rootView.scrollableViewportHeight;
      this.r.rootView.setScrollOffset(fraction * maxScroll);
      this.r._relayoutAndRepaint();
    });
  }

  /**
   * Destroy the channel scrollbar, removing it from the DOM.
   */
  public destroy(): void {
    if (this._track) {
      this._track.remove();
      this._track = null;
      this._thumb = null;
      this._featuresBg = null;
      this._featuresFg = null;
    }
  }

  /**
   * Update scrollbar position/size to match current scroll state.
   * Called after layout.
   */
  public update(): void {
    if (!this._track || !this._thumb) return;

    const dpr = window.devicePixelRatio || 1;

    if (!this.r.rootView.needsScroll) {
      this._track.style.display = "none";
      return;
    }
    this._track.style.display = "block";

    // Position the track in the scrollable area
    const top = this.r.rootView.scrollableAreaTop / dpr;
    const viewportH = this.r.rootView.scrollableViewportHeight / dpr;
    this._track.style.top = `${top}px`;
    this._track.style.height = `${viewportH}px`;

    // Thumb size and position
    const contentH = this.r.rootView.scrollableContentHeight;
    const viewportDevice = this.r.rootView.scrollableViewportHeight;
    const offset = this.r.rootView.scrollOffset;

    const thumbRatio = Math.min(1, viewportDevice / contentH);
    const thumbH = Math.max(20, viewportH * thumbRatio);
    const scrollRange = contentH - viewportDevice;
    const thumbTop =
      scrollRange > 0 ? (offset / scrollRange) * (viewportH - thumbH) : 0;

    this._thumb.style.top = `${thumbTop}px`;
    this._thumb.style.height = `${thumbH}px`;

    // ── Update feature layers ─────────────────────────────────────────
    this._updateFeatures(viewportH, contentH);
  }

  /**
   * Render channel-position indicators on the scrollbar feature layers.
   *
   * - Background features: one thin stripe per scrollable channel
   *   (shows the channel's position within the total scrollable content)
   * - Foreground features: reserved for future highlight indicators
   */
  private _updateFeatures(viewportH: number, contentH: number): void {
    if (!this._featuresBg || !this._featuresFg) return;

    // ── Background features: channel position stripes ──
    const bgEl = this._featuresBg;
    bgEl.innerHTML = "";

    if (contentH <= 0) return;

    const scrollableChildren = this.r.rootView.children.filter(
      (c) => !c.isPinned && c instanceof ChannelView,
    );
    const scrollableTop = this.r.rootView.scrollableAreaTop;

    for (const child of scrollableChildren) {
      const bounds = child.getBounds();
      // Convert child position to fraction of total scrollable content
      const childTopInContent =
        bounds.y - scrollableTop + this.r.rootView.scrollOffset;
      const fraction = childTopInContent / contentH;
      const heightFraction = bounds.height / contentH;

      const stripe = document.createElement("div");
      Object.assign(stripe.style, {
        position: "absolute",
        left: "2px",
        right: "2px",
        top: `${fraction * viewportH}px`,
        height: `${Math.max(1, heightFraction * viewportH)}px`,
        background: "rgba(0,0,0,0.06)",
        borderRadius: "1px",
        pointerEvents: "none",
      });
      bgEl.appendChild(stripe);
    }

    // ── Foreground features: reserved (empty for now) ──
    this._featuresFg.innerHTML = "";
  }
}
