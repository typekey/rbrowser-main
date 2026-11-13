import type { ChannelView } from "../index";
import type { RenderContext, IRenderView } from "./render-context";

/** Sequence-logo / motif letters drawn to a 2D canvas overlay. */
export class MotifView implements IRenderView {
  constructor(private readonly v: ChannelView) {}

  render(rc: RenderContext): void {
    if (!rc.featureRenderer) return;

    const gl = rc.gc.gl;
    if (!gl) return;

    const dpr = window.devicePixelRatio || 1;
    const domStart = rc.state.domain.start;
    const domEnd = rc.state.domain.end;
    const domLen = domEnd - domStart;
    if (domLen <= 0) return;

    const physW = rc.width;
    const physH = rc.height;
    const cssW = physW / dpr;

    // ── Detail zoom guard ──────────────────────────────────────────────
    if (rc.isAboveDetailZoom(domLen)) {
      return;
    }

    // ── Lazy-create offscreen canvas (never added to DOM) ──────────────
    if (!this.v._motifCanvas) {
      this.v._motifCanvas = document.createElement("canvas");
    }

    const cvs = this.v._motifCanvas;
    if (cvs.width !== physW || cvs.height !== physH) {
      cvs.width = physW;
      cvs.height = physH;
    }

    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, physW, physH);

    const displayData = this.v.getParentDisplayData(rc.data);
    if (!displayData || displayData.length === 0) return;

    // ── Base colours ───────────────────────────────────────────────────
    const BASE_COLORS: Record<string, string> = {
      A: "#2ed573", // green
      T: "#ff4757", // red
      C: "#3dc1d3", // cyan-blue
      G: "#f5cd79", // gold
    };

    // ── Compute global max positive/negative stacks for y-axis scaling ─
    let globalMaxPos = 0;
    let globalMaxNeg = 0; // stored as positive magnitude
    let hasNegative = false;

    for (const rec of displayData) {
      const bp = rec.chromStart ?? rec.start ?? 0;
      if (bp >= domEnd || bp + 1 <= domStart) continue;

      const scores = [
        rec.aScore ?? 0,
        rec.tScore ?? 0,
        rec.cScore ?? 0,
        rec.gScore ?? 0,
      ];
      let posSum = 0;
      let negSum = 0;
      for (const s of scores) {
        if (s > 0) posSum += s;
        else if (s < 0) {
          negSum += Math.abs(s);
          hasNegative = true;
        }
      }
      if (posSum > globalMaxPos) globalMaxPos = posSum;
      if (negSum > globalMaxNeg) globalMaxNeg = negSum;
    }

    if (globalMaxPos === 0 && globalMaxNeg === 0) return;

    // ── Update score label ─────────────────────────────────────────────
    this.v.updateScoreLabel(hasNegative ? -globalMaxNeg : 0, globalMaxPos);

    // ── Coordinate system ─────────────────────────────────────────────
    // Reserve proportional space for positive and negative stacks.
    // If only positive: zeroY at bottom. If only negative: zeroY at top.
    // If mixed: zeroY proportional.
    const pad = 2 * dpr; // vertical padding
    const availH = physH - 2 * pad;
    const totalRange = globalMaxPos + globalMaxNeg;
    const posH = totalRange > 0 ? (globalMaxPos / totalRange) * availH : availH;
    const negH = totalRange > 0 ? (globalMaxNeg / totalRange) * availH : 0;
    const zeroY = pad + posH; // device-pixel y of the zero line

    const pxPerBp = physW / domLen;

    // ── Draw zero line if negatives exist ──────────────────────────────
    if (hasNegative) {
      ctx.save();
      ctx.strokeStyle = "#dfe4ea";
      ctx.lineWidth = Math.max(1, 1 * dpr);
      ctx.beginPath();
      ctx.moveTo(0, zeroY);
      ctx.lineTo(physW, zeroY);
      ctx.stroke();
      ctx.restore();
    }

    // ── Prepare base entries for each position ─────────────────────────
    type BaseEntry = { base: string; score: number; color: string };
    const BASES: Array<{ key: string; base: string }> = [
      { key: "aScore", base: "A" },
      { key: "tScore", base: "T" },
      { key: "cScore", base: "C" },
      { key: "gScore", base: "G" },
    ];

    // Determine render mode by bp per pixel
    const bpPerCssPx = domLen / cssW;
    const showLetters = bpPerCssPx < 1; // roughly < 200 bp for a 200px-wide track

    // ── Render each position ───────────────────────────────────────────
    for (const rec of displayData) {
      const bp = rec.chromStart ?? rec.start ?? 0;
      if (bp >= domEnd || bp + 1 <= domStart) continue;

      const x = (bp - domStart) * pxPerBp;
      const w = Math.max(2, pxPerBp); // min 2 CSS px so bars stay visible

      // Collect positive and negative entries separately
      const posEntries: BaseEntry[] = [];
      const negEntries: BaseEntry[] = [];

      for (const { key, base } of BASES) {
        const score = rec[key] ?? 0;
        if (score === 0) continue;
        const entry: BaseEntry = {
          base,
          score,
          color: BASE_COLORS[base] || "#999",
        };
        if (score > 0) posEntries.push(entry);
        else negEntries.push(entry);
      }

      // Sort: smallest absolute value at base of stack (bottom for pos, top for neg)
      posEntries.sort((a, b) => Math.abs(a.score) - Math.abs(b.score));
      negEntries.sort((a, b) => Math.abs(a.score) - Math.abs(b.score));

      // ── Draw positive stack (upward from zeroY) ────────────────────
      let curY = zeroY;
      for (const entry of posEntries) {
        const h = globalMaxPos > 0 ? (entry.score / globalMaxPos) * posH : 0;
        if (h < 0.5) continue;
        const letterY = curY - h;

        if (showLetters && w >= 4 * dpr) {
          // Draw stretched letter glyph
          this._drawMotifLetter(ctx, entry.base, entry.color, x, letterY, w, h);
        } else {
          // Draw colored rectangle
          ctx.fillStyle = entry.color;
          ctx.fillRect(x, letterY, w, h);
        }
        curY = letterY;
      }

      // ── Draw negative stack (downward from zeroY) ──────────────────
      curY = zeroY;
      for (const entry of negEntries) {
        const h =
          globalMaxNeg > 0 ? (Math.abs(entry.score) / globalMaxNeg) * negH : 0;
        if (h < 0.5) continue;

        if (showLetters && w >= 4 * dpr) {
          // Draw stretched letter glyph (flipped)
          this._drawMotifLetter(
            ctx,
            entry.base,
            entry.color,
            x,
            curY,
            w,
            h,
            true,
          );
        } else {
          ctx.fillStyle = entry.color;
          ctx.fillRect(x, curY, w, h);
        }
        curY += h;
      }
    }

    // ── Upload offscreen canvas to WebGL as a textured quad ────────────
    const canvasHeight = rc.gc.canvas?.height || 0;

    // Compute clipped scissor bounds (same logic as renderFeatures)
    const paddingTopPx = Math.round(physH * rc.paddingTop);
    const paddingBottomPx = Math.round(physH * rc.paddingBottom);
    const contentY = rc.y + paddingTopPx;
    const contentHeight = physH - paddingTopPx - paddingBottomPx;

    let clipY = contentY;
    let clipH = contentHeight;
    const effectiveClipRect = rc.getEffectiveClip();
    if (effectiveClipRect) {
      const top = Math.max(contentY, effectiveClipRect.y);
      const bottom = Math.min(
        contentY + contentHeight,
        effectiveClipRect.y + effectiveClipRect.height,
      );
      if (bottom <= top) return;
      clipY = top;
      clipH = bottom - top;
    }

    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(
      rc.x,
      Math.max(0, canvasHeight - clipY - clipH),
      rc.width,
      clipH,
    );

    rc.featureRenderer.renderOverlayTexture(gl, cvs, {
      resolution: [rc.gc.canvas!.width, rc.gc.canvas!.height],
      layout: [rc.x, rc.y, rc.width, rc.height],
    });

    gl.disable(gl.SCISSOR_TEST);
  }

  /**
   * Draw a single base letter stretched to fill the given rectangle.
   * Uses Canvas 2D `transform` to scale the letter glyph to the
   * exact bounding box.
   *
   * Positive letters: bottom edge of the letter sits at `y + h` (the baseline).
   * Negative (flipped) letters: top edge of the letter sits at `y` (the baseline).
   *
   * @param flip — if true, mirror the letter vertically (for negative scores)
   */

  private _drawMotifLetter(
    ctx: CanvasRenderingContext2D,
    base: string,
    color: string,
    x: number,
    y: number,
    w: number,
    h: number,
    flip = false,
  ): void {
    ctx.save();
    ctx.fillStyle = color;

    // Measure the letter at a reference font size to get its actual bounding box
    const refSize = 100;
    ctx.font = `bold ${refSize}px Arial, Helvetica, sans-serif`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";
    const metrics = ctx.measureText(base);

    // Actual ink bounds of the glyph
    const ascent = metrics.actualBoundingBoxAscent ?? refSize * 0.75;
    const descent = metrics.actualBoundingBoxDescent ?? refSize * 0.05;
    const inkH = ascent + descent;
    const inkW =
      (metrics.actualBoundingBoxLeft ?? 0) +
        (metrics.actualBoundingBoxRight ?? refSize * 0.5) || refSize * 0.6;

    if (inkH <= 0 || inkW <= 0) {
      ctx.restore();
      return;
    }

    // Scale ink box → target rectangle
    const sx = w / inkW;
    const sy = h / inkH;

    const cx = x + w / 2; // horizontal center of target rectangle

    if (!flip) {
      // Positive: letter bottom (baseline + descent) aligns with y + h
      // After scale, the alphabetic baseline must land at:
      //   y + h  −  descent * sy
      const baselineY = y + h - descent * sy;
      ctx.translate(cx, baselineY);
      ctx.scale(sx, sy);
    } else {
      // Negative (flipped): the flipped letter's visual top must touch
      // the zero line at y.  After scale(sx, -sy), the glyph's descent
      // (which was below the baseline) flips upward.  Place the baseline
      // so that the flipped top = translateY − descent·sy = y.
      const baselineY = y + descent * sy;
      ctx.translate(cx, baselineY);
      ctx.scale(sx, -sy);
    }

    ctx.fillText(base, 0, 0);
    ctx.restore();
  }
}
