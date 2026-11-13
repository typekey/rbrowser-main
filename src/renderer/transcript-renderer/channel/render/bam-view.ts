import { ChannelView } from "../index";
import type { RenderContext, IRenderView } from "./render-context";
import { hexToRgb } from "../../colors/colors";

/** BAM plot: read lanes + coverage histogram, overlay + scroll. */
export class BamView implements IRenderView {
  constructor(private readonly v: ChannelView) {}

  renderFeatures(ctx: RenderContext): void {
    const gl = ctx.gc.gl;
    if (!gl) return;
    const domainLength = ctx.state.domain.end - ctx.state.domain.start;
    if (this.v._bamReads.length === 0) return;
    if (!ctx.featureRenderer) return;

    // Coverage and reads have *independent* detail-zoom thresholds.
    // Coverage can stay visible at larger scales than individual reads.
    const readsVisible = !ctx.isAboveDetailZoom(domainLength);
    const coverageVisible =
      this.v.bamCoverageEnabled && !this.v.isCoverageAboveDetailZoom(domainLength);

    // If neither is renderable, bail out early
    if (!readsVisible && !coverageVisible) return;

    const dpr = window.devicePixelRatio || 1;

    const paddingTopPx = Math.round(ctx.height * ctx.paddingTop);
    const paddingBottomPx = Math.round(ctx.height * ctx.paddingBottom);
    const fullContentY = ctx.y + paddingTopPx;
    const fullContentHeight = ctx.height - paddingTopPx - paddingBottomPx;

    // ── Coverage / reads split ────────────────────────────────────────
    const coverageHeightPx = coverageVisible
      ? Math.round(fullContentHeight * this.v.bamCoverageHeightFrac)
      : 0;
    const readsContentY = fullContentY + coverageHeightPx;
    const readsContentHeight = fullContentHeight - coverageHeightPx;
    const readsChannelCSS = readsContentHeight / dpr;

    // ── 1. Render coverage ─────────────────────────────────────────────
    if (coverageVisible && coverageHeightPx > 0) {
      this._computeBamCoverage(ctx, ctx.state.domain.start, ctx.state.domain.end);
      if (this.v._bamCoverage && this.v._bamCoverageMax > 0) {
        const covCfg = this.v.bamCoverageConfig;
        const covColorCfg = covCfg.color;
        let covColor: [number, number, number];
        let covColormapConfig:
          { colormap?: string; range?: [number, number] } | undefined;

        if (typeof covColorCfg === "string") {
          covColor = hexToRgb(covColorCfg);
        } else if (
          covColorCfg &&
          typeof covColorCfg === "object" &&
          covColorCfg.colormap
        ) {
          covColor = hexToRgb(ChannelView.BAM_COVERAGE_COLOR);
          covColormapConfig = covColorCfg;
        } else {
          covColor = hexToRgb(ChannelView.BAM_COVERAGE_COLOR);
        }
        ctx.featureRenderer.renderBamCoverage(
          gl,
          this.v._bamCoverage,
          this.v._bamCoverageMax,
          {
            coverageStart: this.v._bamCoverageStart,
            coverageEnd: this.v._bamCoverageEnd,
            dataRegionStart: ctx.dataRegion.start,
            coverageY: fullContentY,
            coverageHeight: coverageHeightPx,
            channelX: ctx.x,
            channelWidth: ctx.width,
            canvasWidth: ctx.gc.canvas!.width,
            canvasHeight: ctx.gc.canvas?.height || 0,
            domainStart: ctx.state.domain.start,
            domainLength,
            color: covColor,
            colormapConfig: covColormapConfig,
            alpha: covCfg.alpha,
            plot: covCfg.plot,
            mode: ctx.gc.renderMode,
          },
        );
      }
    }

    // ── 2. Render lane-stacked reads (only when below reads zoom) ─────
    if (!readsVisible) return;

    // Clamp scroll to reads area
    const maxScrollCSS = Math.max(
      0,
      this.v.bamTotalContentHeightCSS - readsChannelCSS,
    );
    if (this.v._bamScrollOffset > maxScrollCSS)
      this.v._bamScrollOffset = maxScrollCSS;
    if (this.v._bamScrollOffset < 0) this.v._bamScrollOffset = 0;

    // Resolve per-strand read colours from config
    const rcfg = ctx.config.style?.readsColor;
    const fwdColor = rcfg?.plus ? hexToRgb(rcfg.plus) : undefined;
    const revColor = rcfg?.minus ? hexToRgb(rcfg.minus) : undefined;
    const othColor = rcfg?.other ? hexToRgb(rcfg.other) : undefined;

    ctx.featureRenderer.renderBam(gl, this.v._bamReads, {
      dataRegionStart: ctx.dataRegion.start,
      laneCount: this.v._bamLaneCount,
      totalContentHeightCSS: this.v.bamTotalContentHeightCSS,
      scrollOffsetCSS: this.v._bamScrollOffset,
      contentY: readsContentY,
      contentHeight: readsContentHeight,
      channelX: ctx.x,
      channelWidth: ctx.width,
      canvasWidth: ctx.gc.canvas!.width,
      canvasHeight: ctx.gc.canvas?.height || 0,
      domainStart: ctx.state.domain.start,
      domainLength,
      mode: ctx.gc.renderMode,
      forwardColor: fwdColor,
      reverseColor: revColor,
      otherColor: othColor,
    });
  }

  render(ctx: RenderContext): void {
    if (!ctx.trackContainer) return;

    const dpr = window.devicePixelRatio || 1;
    const domLength = ctx.state.domain.end - ctx.state.domain.start;

    const readsVisible = !ctx.isAboveDetailZoom(domLength);
    const coverageVisible =
      this.v.bamCoverageEnabled && !this.v.isCoverageAboveDetailZoom(domLength);

    const paddingTopPx = Math.round(ctx.height * ctx.paddingTop);
    const paddingBottomPx = Math.round(ctx.height * ctx.paddingBottom);
    const fullContentHeight = ctx.height - paddingTopPx - paddingBottomPx;
    const coverageHeightPx = coverageVisible
      ? Math.round(fullContentHeight * this.v.bamCoverageHeightFrac)
      : 0;
    const coverageCSS = coverageHeightPx / dpr;
    const readsCSS = (fullContentHeight - coverageHeightPx) / dpr;

    // ── Both hidden → full-channel zoom hint ──────────────────────────
    if (!readsVisible && !coverageVisible) {
      ctx.scrollUI.removeBamScrollbar();
      ctx.scrollUI.removeBamShadow();
      ctx.scrollUI.hideBamReadsZoomHint();

      if (!this.v._bamZoomHintEl) {
        const hint = document.createElement("div");
        hint.className = "bam-zoom-hint";
        hint.textContent = "Zoom in to view reads";
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
        this.v._bamZoomHintEl = hint;
      }
      this.v._bamZoomHintEl.style.display = "flex";

      // Hide the coverage score label when coverage is also hidden
      if (this.v._bamScoreLabelEl) this.v._bamScoreLabelEl.style.display = "none";
      return;
    }

    // Hide full-channel zoom hint
    if (this.v._bamZoomHintEl) {
      this.v._bamZoomHintEl.style.display = "none";
    }

    // ── Coverage visible but reads hidden → reads-area zoom hint ──────
    if (!readsVisible) {
      ctx.scrollUI.removeBamScrollbar();
      ctx.scrollUI.removeBamShadow();
      ctx.scrollUI.showBamReadsZoomHint(coverageCSS, paddingTopPx / dpr);
    } else {
      // Reads are visible → hide reads zoom hint
      ctx.scrollUI.hideBamReadsZoomHint();

      // ── Scrollbar & shadow ──────────────────────────────────────────
      if (this.v.bamNeedsScroll) {
        const topOffsetCSS = paddingTopPx / dpr + coverageCSS;
        const trackHeightCSS = readsCSS + paddingBottomPx / dpr;
        ctx.scrollUI.ensureBamScrollbar();
        ctx.scrollUI.updateBamScrollbar(readsCSS, topOffsetCSS, trackHeightCSS);
        ctx.scrollUI.ensureBamShadow(readsCSS);
      } else {
        ctx.scrollUI.removeBamScrollbar();
        ctx.scrollUI.removeBamShadow();
      }
    }

    // ── Coverage score label ──────────────────────────────────────────
    ctx.scrollUI.updateBamCoverageScoreLabel(coverageHeightPx, paddingTopPx / dpr);
  }

  private _computeBamCoverage(ctx: RenderContext, domainStart: number, domainEnd: number): void {
    if (this.v._bamReads.length === 0) {
      this.v._bamCoverage = null;
      this.v._bamCoverageMax = 0;
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const trackCSSWidth = ctx.width / dpr;
    // One bin per CSS pixel, capped at 2000
    const numBins = Math.max(1, Math.min(2000, Math.round(trackCSSWidth)));
    const span = domainEnd - domainStart;
    if (span <= 0) return;

    const binWidth = span / numBins;
    const depths = new Float32Array(numBins);

    for (const read of this.v._bamReads) {
      // Overlap check
      if (read.end <= domainStart || read.start >= domainEnd) continue;

      const startBin = Math.max(
        0,
        Math.floor((read.start - domainStart) / binWidth),
      );
      const endBin = Math.min(
        numBins - 1,
        Math.floor((read.end - 1 - domainStart) / binWidth),
      );

      for (let b = startBin; b <= endBin; b++) {
        depths[b]++;
      }
    }

    let maxD = 0;
    for (let i = 0; i < numBins; i++) {
      if (depths[i] > maxD) maxD = depths[i];
    }

    this.v._bamCoverage = depths;
    this.v._bamCoverageStart = domainStart;
    this.v._bamCoverageEnd = domainEnd;
    this.v._bamCoverageMax = maxD;
  }
}
