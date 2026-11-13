import type { ChannelView } from "../index";
import type { RenderContext, IRenderView } from "./render-context";
import { hexToRgb, SequentialScale, ColorMapName } from "../../colors/colors";

/** Continuous score curve drawn to a 2D canvas overlay. */
export class ScoreCurveView implements IRenderView {
  constructor(private readonly v: ChannelView) {}

  render(rc: RenderContext): void {
    if (!rc.featureRenderer) return;

    const gl = rc.gc.gl;
    if (!gl) return;

    const dpr = window.devicePixelRatio || 1;
    const domainStart = rc.state.domain.start;
    const domainEnd = rc.state.domain.end;
    const domainLen = domainEnd - domainStart;
    if (domainLen <= 0) return;

    // Physical (backing-store) dimensions
    const physW = rc.width;
    const physH = rc.height;

    // ── Lazy-create offscreen canvas (never added to DOM) ─────────
    if (!this.v._scoreCurveCanvas) {
      this.v._scoreCurveCanvas = document.createElement("canvas");
      this.v._scoreCurveCtx = null;
      this.v._scoreCurveCacheDomain = null;
    }

    const cvs = this.v._scoreCurveCanvas;

    // Keep backing-store resolution in sync (device pixels)
    if (cvs.width !== physW || cvs.height !== physH) {
      cvs.width = physW;
      cvs.height = physH;
      this.v._scoreCurveCtx = null; // context reset on resize
      this.v._scoreCurveCacheDomain = null;
    }

    // Cache 2D context
    if (!this.v._scoreCurveCtx) {
      this.v._scoreCurveCtx = cvs.getContext("2d");
    }
    const ctx = this.v._scoreCurveCtx;
    if (!ctx) return;

    // Use only the features appropriate for this channel's display mode
    const displayData = this.v.getParentDisplayData(rc.data);

    // ── Cache check: skip full Canvas 2D redraw if domain/size/data unchanged ──
    const cache = this.v._scoreCurveCacheDomain;
    const needsRedraw =
      !cache ||
      cache.start !== domainStart ||
      cache.end !== domainEnd ||
      cache.w !== physW ||
      cache.h !== physH ||
      cache.dataLen !== displayData.length;

    if (needsRedraw) {
      ctx.clearRect(0, 0, physW, physH);
      if (displayData.length === 0) {
        this.v._scoreCurveCacheDomain = {
          start: domainStart,
          end: domainEnd,
          w: physW,
          h: physH,
          dataLen: 0,
        };
        return;
      }

      // ── Colormap / score range ──────────────────────────────────────
      const fgCfg = rc.config.style?.foreground as any;

      // A plain string `foreground` (e.g. "#00b894") paints every arc with
      // one fixed colour, bypassing the score→colormap mapping. Used by
      // junction channels that have no expression value.
      const fixedColor: [number, number, number] | null =
        typeof fgCfg === "string" && /^#?[0-9a-fA-F]{6}$/.test(fgCfg.trim())
          ? (hexToRgb(fgCfg.trim()).map((c) => Math.round(c * 255)) as [
              number,
              number,
              number,
            ])
          : null;

      const scoreRange: [number, number] = fgCfg?.range ?? [0, 0];

      // Resolve colormap name from config (e.g. foreground: { colormap: "coolwarm" })
      const colormapName: ColorMapName =
        (fgCfg?.colormap as ColorMapName) ?? "coolwarm";

      // Use global range (set by parent during distributeDataToSubChannels) so
      // all sub-channels share the same colormap bounds. Fall back to per-channel
      // computation when no global range is available (parent/non-expanded view).
      let minScore = scoreRange[0];
      let maxScore = scoreRange[1];
      if (minScore === 0 && maxScore === 0) {
        if (this.v._globalScoreRange) {
          [minScore, maxScore] = this.v._globalScoreRange;
        } else {
          // Compute actual min and max from the display data (count / score)
          let computedMin = Infinity;
          let computedMax = -Infinity;
          for (const f of displayData) {
            const s = (f as any).score ?? 0;
            if (s < computedMin) computedMin = s;
            if (s > computedMax) computedMax = s;
          }
          if (!isFinite(computedMin)) computedMin = 0;
          if (!isFinite(computedMax) || computedMax <= computedMin)
            computedMax = computedMin + 1;
          minScore = computedMin;
          maxScore = computedMax;
        }
      }

      // Build a SequentialScale from the configured colormap name and score range.
      const colorScale = new SequentialScale(colormapName, [
        minScore,
        maxScore,
      ]);

      // Resolve colour from score via the configured colormap.
      // Returns [r, g, b] in 0-255 range.
      const resolveColor = (score: number): [number, number, number] => {
        if (fixedColor) return fixedColor;
        const [r01, g01, b01] = colorScale.getColor(score);
        return [
          Math.round(r01 * 255),
          Math.round(g01 * 255),
          Math.round(b01 * 255),
        ];
      };

      // Arc: opens downward (∪ shape) from a thin baseline at the top of the channel.
      const baseline = 1.5 * dpr;
      const maxArcH = physH * 0.88;

      // Minimum 1 CSS-px so arcs are always visible, even at low scores.
      const minLW = Math.max(1, 1.0 * dpr);
      const maxLW = Math.max(1, 2.5 * dpr);

      for (const feature of displayData) {
        const start =
          (feature as any).chromStart ?? (feature as any).start ?? 0;
        const end = (feature as any).chromEnd ?? (feature as any).end ?? 0;
        if (start >= end) continue;

        // X in physical pixels
        const x1 = ((start - domainStart) / domainLen) * physW;
        const x2 = ((end - domainStart) / domainLen) * physW;

        // Clip check: skip arcs entirely outside the visible area
        if (x2 < 0 || x1 > physW) continue;

        const score = (feature as any).score ?? 0;
        const t =
          maxScore > minScore
            ? Math.max(
                0,
                Math.min(1, (score - minScore) / (maxScore - minScore)),
              )
            : 0;

        // Arc height: proportional to genomic span relative to domain, also biased by score
        const spanFrac = Math.min(1, (end - start) / domainLen);
        const arcH = Math.max(6 * dpr, (spanFrac * 0.7 + t * 0.3) * maxArcH);
        // Arc dips DOWN: tipY is below baseline
        const tipY = baseline + arcH;

        const [r, g, b] = resolveColor(score);
        // Stroke alpha: 0.6 (low count) → 0.95 (high count) — always clearly
        // visible. Plain fixed-colour junctions (no expression value) instead
        // draw thicker arcs at a constant alpha of 0.9.
        const strokeAlpha = fixedColor ? 0.9 : 0.6 + t * 0.35;
        const fillAlpha = 0.06 + t * 0.1;
        const lw = fixedColor
          ? Math.max(2, 2.2 * dpr)
          : minLW + t * (maxLW - minLW);

        ctx.strokeStyle = `rgba(${r},${g},${b},${strokeAlpha})`;
        ctx.fillStyle = `rgba(${r},${g},${b},${fillAlpha})`;
        ctx.lineWidth = lw;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        // Cubic Bézier: endpoints at top baseline, control points at arc tip (downward)
        ctx.beginPath();
        ctx.moveTo(x1, baseline);
        ctx.bezierCurveTo(x1, tipY, x2, tipY, x2, baseline);
        // Fill area only when areaShow is explicitly true (default: off)
        if (rc.config.style?.areaShow) ctx.fill();
        ctx.stroke();
      }

      // Update cache key
      this.v._scoreCurveCacheDomain = {
        start: domainStart,
        end: domainEnd,
        w: physW,
        h: physH,
        dataLen: displayData.length,
      };
    } // end needsRedraw

    // ── Upload (cached) offscreen canvas to WebGL as a textured quad ──
    const canvasHeight = rc.gc.canvas?.height || 0;

    // Compute clipped scissor bounds (same logic as renderFeatures)
    const paddingTopPx = Math.round(physH * rc.paddingTop);
    const paddingBottomPx = Math.round(physH * rc.paddingBottom);
    const contentY = rc.y + paddingTopPx;
    const contentHeight = physH - paddingTopPx - paddingBottomPx;

    let clipY = contentY;
    let clipH = contentHeight;
    const effectiveClipCurve = rc.getEffectiveClip();
    if (effectiveClipCurve) {
      const top = Math.max(contentY, effectiveClipCurve.y);
      const bottom = Math.min(
        contentY + contentHeight,
        effectiveClipCurve.y + effectiveClipCurve.height,
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

    rc.featureRenderer.renderOverlayTexture(
      gl,
      cvs,
      {
        resolution: [rc.gc.canvas!.width, rc.gc.canvas!.height],
        layout: [rc.x, rc.y, rc.width, rc.height],
      },
      !needsRedraw /* skipUpload when canvas unchanged */,
    );

    gl.disable(gl.SCISSOR_TEST);
  }
}
