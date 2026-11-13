import type { ChannelView } from "../index";
import type { RenderContext, IRenderView } from "./render-context";

/** Per-base sequence letters + the "zoom in to view sequence" hint. */
export class SequenceView implements IRenderView {
  constructor(private readonly v: ChannelView) {}

  render(ctx: RenderContext): void {
    if (!ctx.trackContainer) return;

    const dpr = window.devicePixelRatio || 1;
    const domainLength = ctx.state.domain.end - ctx.state.domain.start;

    // ── Large scale → show "zoom in" hint ──────────────────────────────
    if (ctx.isAboveDetailZoom(domainLength)) {
      this.clearSequenceLetters();

      if (!this.v._seqZoomHintEl) {
        const hint = document.createElement("div");
        hint.className = "seq-zoom-hint";
        hint.textContent = "Zoom in to view sequence";
        hint.style.cssText = [
          "position:absolute",
          "inset:0",
          "display:flex",
          "align-items:center",
          "justify-content:center",
          "font-size:12px",
          "color:#999",
          "pointer-events:none",
          "user-select:none",
          "font-family:Calibre,Roboto,Helvetica,sans-serif",
        ].join(";");
        ctx.trackContainer.appendChild(hint);
        this.v._seqZoomHintEl = hint;
      }
      this.v._seqZoomHintEl.style.display = "flex";
      return;
    }

    // Hide hint when zoomed in enough
    if (this.v._seqZoomHintEl) {
      this.v._seqZoomHintEl.style.display = "none";
    }

    // ── Determine if letters should be shown ──────────────────────────
    const trackCSSWidth = ctx.width / dpr;
    const trackCSSHeight = ctx.height / dpr;
    const pxPerBp = trackCSSWidth / domainLength;

    // Only show letters if each base is ≥ 4 CSS px wide
    if (pxPerBp < 4) {
      this.clearSequenceLetters();
      return;
    }

    // Skip if no data loaded yet
    if (!ctx.data || ctx.data.length === 0) {
      this.clearSequenceLetters();
      return;
    }

    // Colored background rects are already rendered on the WebGL canvas
    // by featureRenderer.updateData() (sequence branch). Only the letter
    // overlay needs DOM elements.

    if (!this.v._seqOverlayEl) {
      const overlay = document.createElement("div");
      overlay.className = "seq-overlay";
      overlay.style.cssText = [
        "position:absolute",
        "inset:0",
        "pointer-events:none",
        "user-select:none",
        "overflow:hidden",
      ].join(";");
      ctx.trackContainer.appendChild(overlay);
      this.v._seqOverlayEl = overlay;
    }

    // Visible domain start/end
    const domStart = ctx.state.domain.start;
    const domEnd = ctx.state.domain.end;

    // Font size: scale with base width, capped to track height
    const fontSize = Math.min(
      Math.floor(pxPerBp * 0.8),
      Math.floor(trackCSSHeight * 0.75),
    );
    if (fontSize < 6) {
      this.clearSequenceLetters();
      return;
    }

    // Use configured base text colour or default to white
    const textColor = (ctx.config.style as any)?.baseTextColor ?? "#ffffff";
    const fragments: string[] = [];

    for (const rec of ctx.data) {
      const bp = rec.start ?? rec.chromStart ?? 0;
      if (bp >= domEnd || bp + 1 <= domStart) continue;

      let base = (rec.base || "N").toUpperCase();
      if (this.v._isComplementStrand) base = SequenceView._complementBase(base);
      // Position in CSS pixels from left edge of track
      const xCss = (bp - domStart) * pxPerBp;

      fragments.push(
        `<span style="position:absolute;left:${xCss.toFixed(1)}px;top:0;width:${pxPerBp.toFixed(1)}px;height:${trackCSSHeight}px;display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:400;color:${textColor};font-family:Arial,Helvetica,sans-serif">${base}</span>`,
      );
    }

    this.v._seqOverlayEl.innerHTML = fragments.join("");
    this.v._seqOverlayEl.style.display = "block";
  }

  /** Remove sequence letter overlay DOM */

  private clearSequenceLetters(): void {
    if (this.v._seqOverlayEl) {
      this.v._seqOverlayEl.style.display = "none";
      this.v._seqOverlayEl.innerHTML = "";
    }
  }

  private static _complementBase(b: string): string {
    switch (b) {
      case "A":
        return "T";
      case "T":
        return "A";
      case "G":
        return "C";
      case "C":
        return "G";
      default:
        return b;
    }
  }

  /**
   * Multi-scale rendering for the "sequence" plot type.
   *
   * | Bases visible on screen | Behaviour                       |
   * |-------------------------|---------------------------------|
   * | > detailZoom            | Hide rects, show "Zoom in" hint |
   * | pxPerBp < 4            | Show coloured rects only        |
   * | pxPerBp >= 4           | Show coloured rects + letters   |
   */
}
