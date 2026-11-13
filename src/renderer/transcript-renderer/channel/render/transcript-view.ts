import { ChannelView } from "../index";
import type { RenderContext } from "./render-context";
import { pickStrandArrowColor, txPartHexColor } from "../../colors/colors";

// ── Pre-computed arrow colour per transcript part type ─────────────────
// `pickStrandArrowColor(txPartHexColor(type))` is a pure function with a
// closed range of inputs (the 7 known TX_PART_CONFIG keys). The strand
// arrow loop in `renderTranscriptLabels` runs N × M times per frame
// (transcripts × arrows-per-transcript); resolving the colour through
// the registry once per render frame keeps that loop allocation-free
// instead of recomputing WCAG luminance per arrow.
const TX_PART_ARROW_COLOR_CACHE = new Map<string, string>();
function txPartArrowColor(type: string): string {
  let c = TX_PART_ARROW_COLOR_CACHE.get(type);
  if (c === undefined) {
    c = pickStrandArrowColor(txPartHexColor(type));
    TX_PART_ARROW_COLOR_CACHE.set(type, c);
  }
  return c;
}

/** Transcript plot: GPU exon/intron features + DOM name labels + scroll. */
export class TranscriptView {
  constructor(private readonly v: ChannelView) {}

  renderFeatures(ctx: RenderContext): void {
    const gl = ctx.gc.gl;
    if (!gl) return;
    const domainLength = ctx.state.domain.end - ctx.state.domain.start;

    // ── Large scale → skip (zoom hint shown by labels) ──
    if (ctx.isAboveDetailZoom(domainLength)) return;
    if (this.v._transcriptRecords.length === 0) return;
    if (!ctx.featureRenderer) return;

    const dpr = window.devicePixelRatio || 1;

    // Content area (with padding)
    const paddingTopPx = Math.round(ctx.height * ctx.paddingTop);
    const paddingBottomPx = Math.round(ctx.height * ctx.paddingBottom);
    const contentY = ctx.y + paddingTopPx;
    const contentHeight = ctx.height - paddingTopPx - paddingBottomPx;
    const channelCSS = contentHeight / dpr;

    // Clamp scroll
    const maxScrollCSS = Math.max(0, this.v.txTotalContentHeightCSS - channelCSS);
    if (this.v._txScrollOffset > maxScrollCSS)
      this.v._txScrollOffset = maxScrollCSS;
    if (this.v._txScrollOffset < 0) this.v._txScrollOffset = 0;

    // Build colour overrides from config.style.foreground.custom
    const fgCfg = ctx.config.style?.foreground;
    const colorOverrides: { [type: string]: string } | undefined =
      fgCfg && typeof fgCfg === "object" && !Array.isArray(fgCfg)
        ? (fgCfg as any).custom
        : undefined;

    // Delegate everything to FeatureRenderer
    ctx.featureRenderer!.renderTranscript(gl, this.v._transcriptRecords, {
      dataRegionStart: ctx.dataRegion.start,
      laneCount: this.v._transcriptLaneCount,
      totalContentHeightCSS: this.v.txPureLaneHeightCSS,
      scrollOffsetCSS: this.v._txScrollOffset,
      contentY,
      contentHeight,
      channelX: ctx.x,
      channelWidth: ctx.width,
      canvasWidth: ctx.gc.canvas!.width,
      canvasHeight: ctx.gc.canvas?.height || 0,
      domainStart: ctx.state.domain.start,
      domainLength,
      mode: ctx.gc.renderMode,
      colorOverrides,
    });

    // Render modification markers (inverted triangles) on top of transcripts
    if (this.v._modificationRecords.length > 0) {
      ctx.featureRenderer!.renderModifications(
        gl,
        this.v._modificationRecords,
        this.v._transcriptRecords,
        {
          dataRegionStart: ctx.dataRegion.start,
          laneCount: this.v._transcriptLaneCount,
          totalContentHeightCSS: this.v.txPureLaneHeightCSS,
          scrollOffsetCSS: this.v._txScrollOffset,
          contentY,
          contentHeight,
          channelX: ctx.x,
          channelWidth: ctx.width,
          canvasWidth: ctx.gc.canvas!.width,
          canvasHeight: ctx.gc.canvas?.height || 0,
          domainStart: ctx.state.domain.start,
          domainLength,
          channelHeight: ctx.height,
          modConfig: ctx.config.style?.modification,
        },
      );

      // Update the modification colorbar legend
      this.v.legend.updateModificationScoreLabel();
    }
  }

  renderLabels(ctx: RenderContext): void {
    if (!ctx.trackContainer) return;

    const dpr = window.devicePixelRatio || 1;
    const domLength = ctx.state.domain.end - ctx.state.domain.start;

    // ── Large scale → show "Zoom in to view transcripts" ────────────
    if (ctx.isAboveDetailZoom(domLength)) {
      // Clear label overlay
      if (this.v._txLabelOverlay) {
        this.v._txLabelOverlay.innerHTML = "";
        this.v._txLabelOverlay.style.display = "none";
      }
      // Remove scrollbar / shadow
      ctx.scrollUI.removeTxScrollbar();
      ctx.scrollUI.removeTxShadow();

      // Show zoom hint
      if (!this.v._txZoomHintEl) {
        const hint = document.createElement("div");
        hint.className = "tx-zoom-hint";
        hint.textContent = "Zoom in to view transcripts";
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
        this.v._txZoomHintEl = hint;
      }
      this.v._txZoomHintEl.style.display = "flex";
      return;
    }

    // Hide zoom hint when zoomed in enough
    if (this.v._txZoomHintEl) {
      this.v._txZoomHintEl.style.display = "none";
    }

    const paddingTopPx = Math.round(ctx.height * ctx.paddingTop);
    const paddingBottomPx = Math.round(ctx.height * ctx.paddingBottom);
    const contentHeight = ctx.height - paddingTopPx - paddingBottomPx;
    const channelCSS = contentHeight / dpr;
    const channelFullCSS = ctx.height / dpr; // full parent channel height
    const laneH = ChannelView.TX_LANE_HEIGHT_CSS;

    const domStart = ctx.state.domain.start;
    const domEnd = ctx.state.domain.end;
    const trackCSSWidth = ctx.width / dpr;

    // ── Label overlay container ──────────────────────────────────────
    if (!this.v._txLabelOverlay) {
      const el = document.createElement("div");
      el.className = "tx-label-overlay";
      el.style.cssText = [
        "position:absolute",
        "left:0",
        "right:0",
        "pointer-events:none",
        "user-select:none",
        "overflow:hidden",
      ].join(";");
      ctx.trackContainer.appendChild(el);
      this.v._txLabelOverlay = el;
    }
    // Label overlay spans the full parent channel height
    this.v._txLabelOverlay.style.top = "0";
    this.v._txLabelOverlay.style.height = `${channelFullCSS}px`;
    this.v._txLabelOverlay.style.display = "block";

    // ── Build label HTML ─────────────────────────────────────────────
    const fragments: string[] = [];
    const scrollCSS = this.v._txScrollOffset;
    // Offset for labels inside the overlay (padding offset)
    const labelOffsetY = paddingTopPx / dpr;

    for (const tx of this.v._transcriptRecords) {
      // Skip transcripts outside vertical viewport
      const laneTop = tx.lane * laneH - scrollCSS;
      if (laneTop + laneH < 0 || laneTop > channelCSS) continue;

      // Skip transcripts entirely outside horizontal domain
      if (tx.txEnd < domStart || tx.txStart > domEnd) continue;

      // ── Transcript name label ────────────────────────────────────
      const strand = tx.strand || "+";
      const arrow = strand === "-" ? "< " : "";
      const arrowEnd = strand === "+" ? " >" : "";
      const displayName = `${arrow}${tx.transcriptName}${arrowEnd}`;

      // Position at start of transcript, below the gene body
      const xStart = ((tx.txStart - domStart) / domLength) * trackCSSWidth;
      const xEnd = ((tx.txEnd - domStart) / domLength) * trackCSSWidth;
      const txWidthCss = xEnd - xStart;
      const labelY = labelOffsetY + laneTop + laneH * 0.55 + 2; // just below the gene body

      // ── Sticky label logic (left + right boundary) ────────────────
      const visibleLeft = Math.max(0, xStart);
      const visibleRight = Math.min(trackCSSWidth, xEnd);
      const visibleWidth = visibleRight - visibleLeft;

      // If no part of transcript is visible horizontally, skip label
      if (visibleWidth <= 0) continue;

      // Measure approximate label width
      const defaultFontSize = 9;
      const charWidth = defaultFontSize * 0.58;
      const labelWidth = displayName.length * charWidth;

      let fontSize = defaultFontSize;
      let opacity = 1;
      let textAlign = "center";

      // Centre label within the transcript's visible span by default
      let labelX = visibleLeft + (visibleWidth - labelWidth) / 2;

      const offLeft = xStart < 0 && xEnd > 0;
      const offRight = xEnd > trackCSSWidth && xStart < trackCSSWidth;

      if (offLeft && offRight) {
        // Both edges off-screen — transcript spans the entire viewport
        labelX = (trackCSSWidth - labelWidth) / 2;
        if (labelX < 0) labelX = 0;
      } else if (offLeft) {
        // Transcript partially off-screen to the LEFT
        // Centre within visible portion
        labelX = visibleLeft + (visibleWidth - labelWidth) / 2;
        if (labelX < 0) labelX = 0;
        textAlign = "left";

        // Only shrink + fade when the label (centred) actually touches
        // the left boundary, i.e. visibleWidth < labelWidth
        if (visibleWidth < labelWidth && visibleWidth > 0) {
          const ratio = visibleWidth / labelWidth;
          fontSize = defaultFontSize * ratio;
          opacity = ratio;
          labelX = 0; // pin to left edge when shrinking
        }
      } else if (offRight) {
        // Transcript partially off-screen to the RIGHT
        labelX = visibleLeft + (visibleWidth - labelWidth) / 2;
        if (labelX + labelWidth > trackCSSWidth) {
          labelX = trackCSSWidth - labelWidth;
        }
        textAlign = "right";

        // Only shrink + fade when the label actually touches the right boundary
        if (visibleWidth < labelWidth && visibleWidth > 0) {
          const ratio = visibleWidth / labelWidth;
          fontSize = defaultFontSize * ratio;
          opacity = ratio;
          labelX = visibleRight - visibleWidth; // pin to available space
        }
      } else {
        // Transcript fully visible — centre label within transcript width
        labelX = xStart + (txWidthCss - labelWidth) / 2;
        if (labelWidth > txWidthCss && txWidthCss > 0) {
          // Label wider than transcript — shrink to fit
          const ratio = txWidthCss / labelWidth;
          fontSize = defaultFontSize * ratio;
          opacity = ratio;
          labelX = xStart;
        }
      }

      // Don't render if font size is too small to read
      if (fontSize < 4) continue;

      // Max width: don't let the label exceed visible transcript area
      const maxW = Math.min(400, visibleRight - Math.max(0, labelX));
      if (maxW <= 0) continue;

      fragments.push(
        `<span style="position:absolute;left:${labelX.toFixed(1)}px;top:${labelY.toFixed(1)}px;font-size:${fontSize.toFixed(1)}px;font-family:Arial,Helvetica,sans-serif;color:#000000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:${textAlign};max-width:${maxW.toFixed(1)}px;line-height:1.1;opacity:${opacity.toFixed(2)}">${displayName}</span>`,
      );

      // ── Strand direction arrows on intron backbone ────────────────
      // Draw small chevron arrows along the intron line to indicate
      // transcription direction.  Arrows are placed every ~40 CSS px.
      // Arrows land on BOTH the white intron backbone AND on top of the
      // WebGL-rendered exon / CDS / UTR rects, so the colour has to adapt
      // per-arrow — a single mid-gray disappears against dark CDS
      // (`#747d8c`) and a single white disappears against light UTR
      // (`#ced6e0`). For arrows over a part we pick a contrast-safe
      // chevron; for arrows over the bare intron we keep the existing
      // mid-gray which already reads on the white channel background.
      const arrowBodyY = labelOffsetY + laneTop + laneH * 0.55 * 0.5;
      const arrowSpacingCSS = 40;
      const arrowLeft = Math.max(0, xStart);
      const arrowRight = Math.min(trackCSSWidth, xEnd);
      const arrowSpan = arrowRight - arrowLeft;
      const INTRON_ARROW_COLOR = "rgba(120,120,120,0.6)";
      if (arrowSpan > 10) {
        const numArrows = Math.max(1, Math.floor(arrowSpan / arrowSpacingCSS));
        const step = arrowSpan / (numArrows + 1);
        const arrowChar = strand === "-" ? "❮" : "❯";
        // Snapshot tx.parts into the loop scope; tracks the smallest part
        // (= most specific / topmost) containing each arrow's bp using
        // primitives only so the inner loop allocates nothing per arrow
        // (was: one `{type, width}` per call → 60 fps × 30 arrows × 10
        // transcripts ≈ 18 K objects/sec of garbage).
        const parts = tx.parts;
        const partsLen = parts.length;
        for (let ai = 1; ai <= numArrows; ai++) {
          const ax = arrowLeft + step * ai;
          // Convert overlay CSS x back to bp to consult tx.parts.
          const bp = domStart + (ax / trackCSSWidth) * domLength;
          let bestWidth = Infinity;
          let bestType: string | undefined;
          for (let pi = 0; pi < partsLen; pi++) {
            const p = parts[pi];
            if (bp < p.start || bp >= p.end) continue;
            const w = p.end - p.start;
            if (w < bestWidth) {
              bestWidth = w;
              bestType = p.type;
            }
          }
          const color = bestType
            ? txPartArrowColor(bestType)
            : INTRON_ARROW_COLOR;
          fragments.push(
            `<span style="position:absolute;left:${ax.toFixed(1)}px;top:${(arrowBodyY - 4).toFixed(1)}px;font-size:7px;color:${color};pointer-events:none;user-select:none;line-height:1">${arrowChar}</span>`,
          );
        }
      }
    }

    this.v._txLabelOverlay.innerHTML = fragments.join("");

    // ── Scrollbar & shadow ───────────────────────────────────────────
    if (this.v.txNeedsScroll) {
      ctx.scrollUI.ensureTxScrollbar();
      ctx.scrollUI.updateTxScrollbar(channelFullCSS);
      ctx.scrollUI.ensureTxShadow(channelFullCSS);
    } else {
      // Remove scrollbar / shadow if not needed
      ctx.scrollUI.removeTxScrollbar();
      ctx.scrollUI.removeTxShadow();
    }
  }
}
