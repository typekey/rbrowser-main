/**
 * BoundaryFeedback — Visual feedback when pan/zoom hits domain boundaries.
 */

export type BoundarySide = "left" | "right";

export class BoundaryFeedback {
  private container: HTMLElement;
  private leftShadow: HTMLDivElement;
  private rightShadow: HTMLDivElement;

  // Animation timers
  private leftTimer: ReturnType<typeof setTimeout> | null = null;
  private rightTimer: ReturnType<typeof setTimeout> | null = null;
  private bounceRaf: number | null = null;

  /** Shadow visible / fade-out duration in ms */
  private static readonly SHADOW_HOLD_MS = 300;
  private static readonly SHADOW_FADE_MS = 400;

  /** Bounce displacement in CSS px (single-side pan) */
  private static readonly BOUNCE_PX = 5;
  /** Squeeze factor for both-side zoom bounce (1 - SQUEEZE = actual scaleX) */
  private static readonly SQUEEZE = 0.006;
  /** Bounce animation duration in ms */
  private static readonly BOUNCE_DURATION_MS = 380;

  constructor(container: HTMLElement) {
    this.container = container;

    const createShadow = (side: "left" | "right"): HTMLDivElement => {
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.top = "0";
      el.style.bottom = "0";
      el.style.width = "54px";
      el.style.pointerEvents = "none";
      el.style.opacity = "0";
      el.style.zIndex = "5";
      // Use cubic-bezier for silky fade
      el.style.transition = `opacity ${BoundaryFeedback.SHADOW_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;

      if (side === "left") {
        el.style.left = "0";
        el.style.background =
          "linear-gradient(to right, rgba(0,0,0,0.15), rgba(0,0,0,0.04) 40%, transparent)";
      } else {
        el.style.right = "0";
        el.style.background =
          "linear-gradient(to left, rgba(0,0,0,0.15), rgba(0,0,0,0.04) 40%, transparent)";
      }

      container.appendChild(el);
      return el;
    };

    this.leftShadow = createShadow("left");
    this.rightShadow = createShadow("right");
  }

  /**
   * Flash feedback on the given side(s).
   * Rapid calls are coalesced — the shadow stays visible as long
   * as the user keeps pushing against the boundary.
   */
  flash(sides: BoundarySide | BoundarySide[]): void {
    const arr = Array.isArray(sides) ? sides : [sides];

    if (arr.includes("left")) this.showShadow("left");
    if (arr.includes("right")) this.showShadow("right");

    this.bounce(arr);
  }

  // ── Internal ─────────────────────────────────────────────────────────

  private showShadow(side: "left" | "right"): void {
    const el = side === "left" ? this.leftShadow : this.rightShadow;
    const timerKey = side === "left" ? "leftTimer" : "rightTimer";

    // Clear existing hide timer
    if (this[timerKey] !== null) {
      clearTimeout(this[timerKey]!);
      this[timerKey] = null;
    }

    // Show immediately (override transition for instant-on)
    el.style.transition = "none";
    el.style.opacity = "1";
    // Force reflow so the browser registers opacity:1 synchronously
    void el.offsetWidth;
    // Restore smooth transition for fade-out
    el.style.transition = `opacity ${BoundaryFeedback.SHADOW_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;

    // Schedule fade-out
    this[timerKey] = setTimeout(() => {
      el.style.opacity = "0";
      this[timerKey] = null;
    }, BoundaryFeedback.SHADOW_HOLD_MS);
  }

  /**
   * Smooth spring-like bounce using a critically-damped spring model.
   *
   * Single side: translateX bounce (push away from boundary, spring back).
   * Both sides:  scaleX squeeze (compress inward, spring back).
   */
  private bounce(sides: BoundarySide[]): void {
    // Cancel any running bounce
    if (this.bounceRaf !== null) {
      cancelAnimationFrame(this.bounceRaf);
      this.bounceRaf = null;
    }

    const canvas = this.container.querySelector("canvas");
    if (!canvas) return;

    const hitLeft = sides.includes("left");
    const hitRight = sides.includes("right");
    const bothSides = hitLeft && hitRight;

    const DURATION = BoundaryFeedback.BOUNCE_DURATION_MS;
    const start = performance.now();

    /**
     * Critically-damped spring response:
     *   f(t) = (1 + ω·t) · e^(-ω·t)
     * where ω controls the damping speed.
     * At t=0 → 1, decays smoothly to 0 with no oscillation.
     */
    const omega = 8; // damping factor — higher = faster settle
    const spring = (t: number): number => {
      const wt = omega * t;
      return (1 + wt) * Math.exp(-wt);
    };

    if (bothSides) {
      // Both boundaries: subtle squeeze (scaleX < 1) then release
      const squeeze = BoundaryFeedback.SQUEEZE;

      const animate = (now: number) => {
        const elapsed = now - start;
        if (elapsed >= DURATION) {
          canvas.style.transform = "";
          this.bounceRaf = null;
          return;
        }
        const t = elapsed / DURATION;
        const s = 1 - squeeze * spring(t);
        canvas.style.transform = `scaleX(${s})`;
        this.bounceRaf = requestAnimationFrame(animate);
      };

      this.bounceRaf = requestAnimationFrame(animate);
    } else {
      // Single side: translate away from the hit boundary, then spring back
      const dx = hitLeft
        ? BoundaryFeedback.BOUNCE_PX
        : -BoundaryFeedback.BOUNCE_PX;

      const animate = (now: number) => {
        const elapsed = now - start;
        if (elapsed >= DURATION) {
          canvas.style.transform = "";
          this.bounceRaf = null;
          return;
        }
        const t = elapsed / DURATION;
        const val = dx * spring(t);
        canvas.style.transform = `translateX(${val}px)`;
        this.bounceRaf = requestAnimationFrame(animate);
      };

      this.bounceRaf = requestAnimationFrame(animate);
    }
  }

  /** Remove overlay elements and cancel timers. */
  destroy(): void {
    if (this.leftTimer !== null) clearTimeout(this.leftTimer);
    if (this.rightTimer !== null) clearTimeout(this.rightTimer);
    if (this.bounceRaf !== null) {
      cancelAnimationFrame(this.bounceRaf);
      // Reset transform in case animation was mid-flight
      const canvas = this.container.querySelector("canvas");
      if (canvas) canvas.style.transform = "";
    }

    this.leftShadow.remove();
    this.rightShadow.remove();
  }
}
