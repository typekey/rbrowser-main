import { resolveWheelAction, type WheelMode } from "./wheel-mode";
/**
 * Genome Browser Pan & Zoom Interaction Controller
 */
export interface IDomain {
  start: number;
  end: number;
}

export type InteractionMode = "pan" | "zoom";

export interface IInteractionOptions {
  /** Called every time the visible domain changes due to pan/zoom. */
  onDomainChange: (domain: IDomain, mode: InteractionMode) => void;

  /** Returns the current visible domain (live). */
  getDomain: () => IDomain;

  /** Returns the current viewport width in CSS pixels. */
  getViewWidth: () => number;

  /** Hard left boundary in genomic coordinates; pan/zoom never goes below it. */
  minStart?: number;

  /** Hard right boundary in genomic coordinates; pan/zoom never exceeds it. */
  maxEnd?: number;

  /**
   * Minimum allowed span (= maximum zoom-in level), in base pairs.
   * Default: computed dynamically so that 1 bp ≤ maxBpPixelRatio CSS pixels.
   */
  minSpan?: number;

  /**
   * Maximum CSS pixels per base pair (controls max zoom-in).
   * When set, minSpan is computed as `viewWidth / maxBpPixelRatio`.
   * Default: 50  (i.e. 1 bp = 50 px at maximum zoom)
   */
  maxBpPixelRatio?: number;

  /**
   * Maximum allowed span (= maximum zoom-out level), in base pairs.
   * Defaults to maxEnd - minStart when both are set.
   */
  maxSpan?: number;

  /** Enable inertia/momentum scrolling after drag release. Default: true. */
  enableInertia?: boolean;

  /** Read the current wheel preference without reattaching listeners. */
  getWheelMode?: () => WheelMode;

  /**
   * Called when a pan/zoom attempt hits one or more domain boundaries.
   * `sides` contains "left" and/or "right" depending on which edge was hit.
   */
  onBoundaryHit?: (sides: Array<"left" | "right">) => void;
}

// ---------------------------------------------------------------------------
// Domain math helpers
// ---------------------------------------------------------------------------

/**
 * Translate the domain by `deltaPixels` CSS pixels.
 *
 * Positive deltaPixels (moving right / dragging right) shifts the genomic
 * window towards smaller coordinates (scrolling "left" in genome terms).
 * Negative deltaPixels shifts towards larger coordinates.
 */
function panDomain(
  domain: IDomain,
  deltaPixels: number,
  viewWidth: number,
): IDomain {
  const span = domain.end - domain.start;
  // deltaPixels / viewWidth  is the fractional shift of the viewport
  const deltaGenomicBases = (deltaPixels / viewWidth) * span;
  return {
    start: domain.start - deltaGenomicBases,
    end: domain.end - deltaGenomicBases,
  };
}

/**
 * Zoom the domain by `scaleFactor` around a genomic anchor point.
 *
 * @param scaleFactor  > 1 = zoom out (more context), < 1 = zoom in (closer)
 * @param anchorFraction  [0, 1] – normalised x position within viewport
 *                        that stays fixed during zoom (e.g. cursor position)
 */
function zoomDomain(
  domain: IDomain,
  scaleFactor: number,
  anchorFraction: number,
): IDomain {
  const span = domain.end - domain.start;
  const anchor = domain.start + anchorFraction * span;
  const newSpan = span * scaleFactor;
  return {
    start: anchor - anchorFraction * newSpan,
    end: anchor + (1 - anchorFraction) * newSpan,
  };
}

/**
 * Clamp the domain so it stays within allowed boundaries and span limits.
 * When the span itself needs clamping the center is kept; when it goes
 * outside the hard boundaries the window is shifted (not shrunk).
 */
function clampDomain(
  domain: IDomain,
  minStart: number,
  maxEnd: number,
  minSpan: number,
  maxSpan: number,
): IDomain {
  let { start, end } = domain;

  // 1. Clamp span
  const span = end - start;
  const clampedSpan = Math.min(Math.max(span, minSpan), maxSpan);
  if (clampedSpan !== span) {
    const center = (start + end) / 2;
    start = center - clampedSpan / 2;
    end = center + clampedSpan / 2;
  }

  // 2. Clamp to boundaries (shift, don't shrink)
  if (start < minStart) {
    start = minStart;
    end = start + clampedSpan;
  }
  if (end > maxEnd) {
    end = maxEnd;
    start = Math.max(minStart, end - clampedSpan);
  }

  return { start: Math.round(start), end: Math.round(end) };
}

// ---------------------------------------------------------------------------
// Ring buffer for inertia velocity calculation
// ---------------------------------------------------------------------------

class RingBuffer<T> {
  private buf: Array<T>;
  private idx = 0;
  private count = 0;

  constructor(private readonly capacity: number) {
    this.buf = new Array<T>(capacity);
  }

  push(v: T): void {
    this.buf[this.idx % this.capacity] = v;
    this.idx++;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  get(): T[] {
    if (this.count < this.capacity) {
      return this.buf.slice(0, this.count);
    }
    const start = this.idx % this.capacity;
    return [...this.buf.slice(start), ...this.buf.slice(0, start)];
  }
}

// ---------------------------------------------------------------------------
// Main InteractionController class
// ---------------------------------------------------------------------------

export class InteractionController {
  private container: HTMLElement | null = null;
  private opts: IInteractionOptions;

  // Bound listeners (stored for cleanup)
  private _onWheel!: (e: WheelEvent) => void;
  private _onMouseDown!: (e: MouseEvent) => void;
  private _onTouchStart!: (e: TouchEvent) => void;

  // Inertia animation frame handle
  private inertiaRafId: number | null = null;
  private isInertiaActive = false;

  constructor(opts: IInteractionOptions) {
    this.opts = opts;

    this._onWheel = this.handleWheel.bind(this);
    this._onMouseDown = this.handleMouseDown.bind(this);
    this._onTouchStart = this.handleTouchStart.bind(this);
  }

  /** Attach all event listeners to a container element. */
  attach(container: HTMLElement): void {
    this.detach(); // clean up any previous attachment
    this.container = container;
    container.addEventListener("wheel", this._onWheel, { passive: false });
    container.addEventListener("mousedown", this._onMouseDown);
    container.addEventListener("touchstart", this._onTouchStart, {
      passive: false,
    });
  }

  /** Remove all event listeners and stop inertia. */
  detach(): void {
    if (!this.container) return;
    this.container.removeEventListener("wheel", this._onWheel);
    this.container.removeEventListener("mousedown", this._onMouseDown);
    this.container.removeEventListener("touchstart", this._onTouchStart);
    this.container = null;
    this.stopInertia();
  }

  /** Update interaction options (e.g. new min/max after data reload). */
  updateOptions(opts: Partial<IInteractionOptions>): void {
    this.opts = { ...this.opts, ...opts };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private clamp(domain: IDomain, mode: InteractionMode): IDomain {
    const { minStart, maxEnd, minSpan, maxSpan, maxBpPixelRatio } = this.opts;

    // During a pan gesture the span must be preserved exactly — the user is
    // translating the viewport, not zooming.  Collapsing the span here (e.g.
    // when the current view is wider than `maxEnd - minStart`) would make the
    // region visibly shrink mid-drag.  So for pan we disable span clamping and
    // only shift the window to stay within the chromosome boundaries.
    if (mode === "pan") {
      return clampDomain(
        domain,
        minStart ?? -Infinity,
        maxEnd ?? Infinity,
        0,
        Infinity,
      );
    }

    const effectiveMaxSpan =
      maxSpan ??
      (minStart !== undefined && maxEnd !== undefined
        ? maxEnd - minStart
        : Infinity);

    // Dynamic minSpan: viewWidth / maxBpPixelRatio so 1bp never exceeds N px
    let effectiveMinSpan = minSpan ?? 10;
    if (maxBpPixelRatio !== undefined && maxBpPixelRatio > 0) {
      const viewWidth = this.opts.getViewWidth();
      effectiveMinSpan = Math.max(
        effectiveMinSpan,
        viewWidth / maxBpPixelRatio,
      );
    }

    return clampDomain(
      domain,
      minStart ?? -Infinity,
      maxEnd ?? Infinity,
      effectiveMinSpan,
      effectiveMaxSpan,
    );
  }

  private emit(domain: IDomain, mode: InteractionMode): void {
    const clamped = this.clamp(domain, mode);
    this.opts.onDomainChange(clamped, mode);

    if (this.opts.onBoundaryHit) {
      const sides: Array<"left" | "right"> = [];
      const { minStart, maxEnd } = this.opts;
      // A boundary is "hit" when the unclamped domain extended beyond
      // the boundary but the clamped domain doesn't, AND the clamped
      // domain is flush against that boundary.
      if (
        minStart !== undefined &&
        domain.start < minStart &&
        Math.abs(clamped.start - minStart) < 1
      ) {
        sides.push("left");
      }
      if (
        maxEnd !== undefined &&
        domain.end > maxEnd &&
        Math.abs(clamped.end - maxEnd) < 1
      ) {
        sides.push("right");
      }
      if (sides.length > 0) {
        this.opts.onBoundaryHit(sides);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Wheel — zoom on vertical scroll, pan on horizontal scroll
  // ---------------------------------------------------------------------------

  private handleWheel(e: WheelEvent): void {
    if (resolveWheelAction(this.opts.getWheelMode?.() ?? "zoom", e) !== "zoom")
      return;

    e.preventDefault();
    this.stopInertia();

    const domain = this.opts.getDomain();
    const viewWidth = this.opts.getViewWidth();
    const rect = this.container!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const anchorFraction = Math.max(0, Math.min(1, mouseX / viewWidth));

    // deltaMode 1 = lines, 2 = pages — normalise to pixels
    const wheelMultiplier = e.deltaMode !== 0 ? 120 : 1;
    const deltaX = e.deltaX * wheelMultiplier;
    const deltaY = e.deltaY * wheelMultiplier;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Horizontal scroll → pan
      this.emit(panDomain(domain, -deltaX * 0.5, viewWidth), "pan");
    } else {
      // Vertical scroll → zoom  (exp ensures smooth, symmetric zoom)
      const scaleFactor = Math.exp(deltaY / 1000);
      this.emit(zoomDomain(domain, scaleFactor, anchorFraction), "zoom");
    }
  }

  // ---------------------------------------------------------------------------
  // Mouse drag — pan with inertia on release
  // ---------------------------------------------------------------------------

  private handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return; // only primary button
    e.preventDefault();
    this.stopInertia();

    const eventBuffer = new RingBuffer<{ x: number; t: number }>(30);
    let prevX = e.clientX;

    // Switch cursor to a closed-hand only while actively dragging,
    // and restore on release. Applied at document level so the cursor
    // stays consistent even when the pointer leaves the container; the
    // container's normal cursor (arrow) is otherwise untouched.
    const prevContainerCursor = this.container?.style.cursor ?? "";
    const prevBodyCursor = document.body.style.cursor;
    if (this.container) this.container.style.cursor = "grabbing";
    document.body.style.cursor = "grabbing";

    const onMouseMove = (ev: MouseEvent): void => {
      const deltaX = ev.clientX - prevX;
      const newDomain = panDomain(
        this.opts.getDomain(),
        deltaX,
        this.opts.getViewWidth(),
      );
      this.emit(newDomain, "pan");
      eventBuffer.push({ x: ev.clientX, t: performance.now() });
      prevX = ev.clientX;
    };

    const onMouseUp = (): void => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (this.container) this.container.style.cursor = prevContainerCursor;
      document.body.style.cursor = prevBodyCursor;
      this.launchInertia(eventBuffer);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  // ---------------------------------------------------------------------------
  // Touch — single finger pan, two-finger pinch zoom
  // ---------------------------------------------------------------------------

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    this.stopInertia();

    if (e.touches.length === 1) {
      this.handleSingleTouchPan(e);
    } else if (e.touches.length === 2) {
      this.handlePinchZoom(e);
    }
  }

  private handleSingleTouchPan(e: TouchEvent): void {
    let prevX = e.touches[0].clientX;
    const eventBuffer = new RingBuffer<{ x: number; t: number }>(30);

    const onTouchMove = (ev: TouchEvent): void => {
      if (ev.touches.length !== 1) return;
      const deltaX = ev.touches[0].clientX - prevX;
      this.emit(
        panDomain(this.opts.getDomain(), deltaX, this.opts.getViewWidth()),
        "pan",
      );
      eventBuffer.push({ x: ev.touches[0].clientX, t: performance.now() });
      prevX = ev.touches[0].clientX;
    };

    const onTouchEnd = (): void => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      this.launchInertia(eventBuffer);
    };

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
  }

  private handlePinchZoom(e: TouchEvent): void {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    const viewWidth = this.opts.getViewWidth();

    const getMidpoint = (touches: TouchList) => ({
      x: (touches[0].clientX + touches[1].clientX) / 2,
      dist: Math.hypot(
        touches[1].clientX - touches[0].clientX,
        touches[1].clientY - touches[0].clientY,
      ),
    });

    let prev = getMidpoint(e.touches);

    const onTouchMove = (ev: TouchEvent): void => {
      if (ev.touches.length !== 2) return;
      const curr = getMidpoint(ev.touches);
      let domain = this.opts.getDomain();

      // Pan from midpoint movement
      const deltaX = curr.x - prev.x;
      domain = panDomain(domain, deltaX, viewWidth);

      // Zoom from pinch distance change
      if (prev.dist > 0 && curr.dist > 0) {
        const scaleFactor = prev.dist / curr.dist;
        const anchorFraction = Math.max(
          0,
          Math.min(1, (curr.x - rect.left) / viewWidth),
        );
        domain = zoomDomain(domain, scaleFactor, anchorFraction);
      }

      this.emit(domain, "zoom");
      prev = curr;
    };

    const onTouchEnd = (): void => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
  }

  // ---------------------------------------------------------------------------
  // Inertia / momentum
  // ---------------------------------------------------------------------------

  /** Check if inertia is currently active. */
  public isInertia(): boolean {
    return this.isInertiaActive;
  }

  /**
   * After a drag or swipe ends, compute the release velocity from the last
   * ~160 ms of movement and animate a decelerating continuation.
   */
  private launchInertia(
    eventBuffer: RingBuffer<{ x: number; t: number }>,
  ): void {
    if (this.opts.enableInertia === false) return;

    const now = performance.now();
    const recent = eventBuffer.get().filter((p) => now - p.t < 160);

    if (recent.length < 5) return;

    const a = recent[recent.length - 1];
    const b = recent[0];
    const vx = (a.x - b.x) / (a.t - b.t); // pixels per millisecond

    if (Math.abs(vx) < 0.05) return;

    this.startInertia(vx);
  }

  private startInertia(vxInitial: number): void {
    const DECAY = 0.94; // velocity multiplier per 16 ms frame
    const STOP_THRESHOLD = 0.02; // px/ms below which we stop

    this.isInertiaActive = true;
    let vx = vxInitial;
    let lastTime = performance.now();

    const tick = (): void => {
      const now = performance.now();
      const dt = now - lastTime; // milliseconds elapsed
      lastTime = now;

      const deltaX = vx * dt;
      this.emit(
        panDomain(this.opts.getDomain(), deltaX, this.opts.getViewWidth()),
        "pan",
      );

      // Decay velocity (frame-rate independent)
      const frames = dt / 16;
      vx *= Math.pow(DECAY, frames);

      if (Math.abs(vx) < STOP_THRESHOLD) {
        this.stopInertia();
        return;
      }

      this.inertiaRafId = requestAnimationFrame(tick);
    };

    this.inertiaRafId = requestAnimationFrame(tick);
  }

  private stopInertia(): void {
    if (this.inertiaRafId !== null) {
      cancelAnimationFrame(this.inertiaRafId);
      this.inertiaRafId = null;
    }
    this.isInertiaActive = false;
  }
}
