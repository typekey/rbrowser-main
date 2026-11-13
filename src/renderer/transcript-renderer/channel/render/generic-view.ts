import type { ChannelView } from "../index";
import type { RenderContext } from "./render-context";
import { defaultConfig } from "../../../../../config/default_config";

/** Generic GPU draw path (background, feature rects, stacked overlays). */
export class GenericView {
  constructor(private readonly v: ChannelView) {}

  renderBackground(ctx: RenderContext): void {
    const gl = ctx.gc.gl;
    if (!gl) return;
    gl.enable(gl.SCISSOR_TEST);

    const canvasHeight = ctx.gc.canvas?.height || 0;

    // Compute clipped bounds
    let clipY = ctx.y;
    let clipHeight = ctx.height;

    const effectiveClip = ctx.getEffectiveClip();
    if (effectiveClip) {
      const top = Math.max(ctx.y, effectiveClip.y);
      const bottom = Math.min(
        ctx.y + ctx.height,
        effectiveClip.y + effectiveClip.height,
      );
      if (bottom <= top) {
        gl.disable(gl.SCISSOR_TEST);
        return;
      }
      clipY = top;
      clipHeight = bottom - top;
    }

    gl.scissor(
      ctx.x,
      Math.max(0, canvasHeight - clipY - clipHeight),
      ctx.width,
      clipHeight,
    );

    // Use backgroundColor from config
    const [r, g, b, a] = this.v.hexToRgba(this.v.backgroundColor);
    gl.clearColor(r, g, b, a);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);
  }

  renderFeatures(ctx: RenderContext): void {
    const gl = ctx.gc.gl;
    if (!gl) return;
    if (!ctx.featureRenderer) return;

    const canvasHeight = ctx.gc.canvas?.height || 0;

    // Calculate padding in pixels
    const paddingTopPx = Math.round(ctx.height * ctx.paddingTop);
    const paddingBottomPx = Math.round(ctx.height * ctx.paddingBottom);

    // Calculate content area (with padding)
    const contentY = ctx.y + paddingTopPx;
    const contentHeight = ctx.height - paddingTopPx - paddingBottomPx;

    // Compute clipped scissor bounds
    let clipY = contentY;
    let clipH = contentHeight;

    const effectiveClip = ctx.getEffectiveClip();
    if (effectiveClip) {
      const top = Math.max(contentY, effectiveClip.y);
      const bottom = Math.min(
        contentY + contentHeight,
        effectiveClip.y + effectiveClip.height,
      );
      if (bottom <= top) return; // fully clipped
      clipY = top;
      clipH = bottom - top;
    }

    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(
      ctx.x,
      Math.max(0, canvasHeight - clipY - clipH),
      ctx.width,
      clipH,
    );

    const domainStart = ctx.state.domain.start;
    const domainLength = ctx.state.domain.end - ctx.state.domain.start;
    const relativeStart = domainStart - ctx.dataRegion.start;

    // Compute diamond size: channelHeight * style.size (default from config)
    const ddc = defaultConfig.channels.diamond.style;
    const diamondSizeRatio = ctx.config.style?.size ?? ddc.size;
    const diamondSizePx = contentHeight * diamondSizeRatio;

    // ── Diamond semantic zoom: per-instance density-based LOD ─────────
    // Each diamond has a quasi-random importance score (golden ratio hash)
    // stored in instance_rect.z. A threshold uniform controls which
    // diamonds are visible: score >= threshold → visible.
    //
    // threshold = max(0, 1 − fraction × zoomLevel)
    //   fraction = maxVisiblePerPx × trackWidth / featureCount
    //   zoomLevel = dataRegionSpan / domainLength
    //
    // At full zoom-out: only a fraction of diamonds visible (uniform coverage).
    // As you zoom in: more diamonds progressively appear.
    // At sufficient zoom: all diamonds visible (threshold reaches 0).
    let semanticThreshold = 0.0; // default: all visible
    const isDiamond = ctx.config.plot === "diamond";
    if (isDiamond && ctx.data && ctx.data.length > 1) {
      const dataSpan = ctx.dataRegion.end - ctx.dataRegion.start;
      const featureCount = ctx.data.length;
      const trackWidthPx = ctx.width;
      // Target: ~0.5 diamonds per pixel at full zoom-out
      const maxVisiblePerPx = 0.5;
      const fraction = (maxVisiblePerPx * trackWidthPx) / featureCount;
      const zoomLevel = dataSpan / Math.max(1, domainLength);
      semanticThreshold = Math.max(0, 1 - fraction * zoomLevel);
    }

    const isStackedHost = this.v._stackedChannels.length > 0;
    const renderParams: {
      domain: [number, number];
      resolution: [number, number];
      layout: [number, number, number, number];
      diamondSize?: number;
      semanticThreshold?: number;
      mode?: "high" | "low";
      alpha?: number;
    } = {
      domain: [relativeStart, domainLength],
      resolution: [ctx.gc.canvas!.width, ctx.gc.canvas!.height],
      layout: [ctx.x, contentY, ctx.width, contentHeight],
      diamondSize: diamondSizePx,
      semanticThreshold,
      mode: ctx.gc.renderMode,
      alpha: isStackedHost ? (ctx.config.group?.alpha ?? 0.8) : undefined,
    };

    if (isStackedHost) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    ctx.featureRenderer.render(gl, renderParams);

    gl.disable(gl.SCISSOR_TEST);
  }

  renderStackedOverlays(ctx: RenderContext): void {
    const gl = ctx.gc.gl;
    if (!gl) return;
    if (this.v._stackedChannels.length === 0) return;

    const canvasHeight = ctx.gc.canvas?.height || 0;
    const paddingTopPx = Math.round(ctx.height * ctx.paddingTop);
    const paddingBottomPx = Math.round(ctx.height * ctx.paddingBottom);
    const contentY = ctx.y + paddingTopPx;
    const contentHeight = ctx.height - paddingTopPx - paddingBottomPx;
    if (contentHeight <= 0) return;

    // Compute clipped scissor bounds
    let clipY = contentY;
    let clipH = contentHeight;

    const effectiveClip = ctx.getEffectiveClip();
    if (effectiveClip) {
      const top = Math.max(contentY, effectiveClip.y);
      const bottom = Math.min(
        contentY + contentHeight,
        effectiveClip.y + effectiveClip.height,
      );
      if (bottom <= top) return;
      clipY = top;
      clipH = bottom - top;
    }

    // Enable alpha blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    for (const stacked of this.v._stackedChannels) {
      const fr = stacked.getFeatureRenderer();
      if (!fr) continue;

      const stackedDataRegion = stacked.getDataRegion();
      if (!stackedDataRegion) continue;

      const domainStart = ctx.state.domain.start;
      const domainLength = ctx.state.domain.end - ctx.state.domain.start;
      const relativeStart = domainStart - stackedDataRegion.start;

      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(
        ctx.x,
        Math.max(0, canvasHeight - clipY - clipH),
        ctx.width,
        clipH,
      );

      const renderParams = {
        domain: [relativeStart, domainLength] as [number, number],
        resolution: [
          ctx.gc.canvas!.width,
          ctx.gc.canvas!.height,
        ] as [number, number],
        layout: [ctx.x, contentY, ctx.width, contentHeight] as [
          number,
          number,
          number,
          number,
        ],
        mode: ctx.gc.renderMode,
        alpha: stacked.getChannelConfig().group?.alpha ?? 0.8,
      };

      fr.render(gl, renderParams);
      gl.disable(gl.SCISSOR_TEST);
    }

    gl.disable(gl.BLEND);
  }
}
