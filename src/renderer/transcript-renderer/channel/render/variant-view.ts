import type { ChannelView } from "../index";
import type { RenderContext, IRenderView } from "./render-context";

/** Variant plot: GPU feature draw + DOM allele-letter overlay + scroll. */
export class VariantView implements IRenderView {
  constructor(private readonly v: ChannelView) {}

  renderFeatures(ctx: RenderContext): void {
    const gl = ctx.gc.gl;
    if (!gl) return;
    const domainLength = ctx.state.domain.end - ctx.state.domain.start;

    if (ctx.isAboveDetailZoom(domainLength)) return;
    if (this.v._variantRecords.length === 0) return;
    if (!ctx.featureRenderer) return;

    const dpr = window.devicePixelRatio || 1;

    // Content area (with padding)
    const paddingTopPx = Math.round(ctx.height * ctx.paddingTop);
    const paddingBottomPx = Math.round(ctx.height * ctx.paddingBottom);
    const contentY = ctx.y + paddingTopPx;
    const contentHeight = ctx.height - paddingTopPx - paddingBottomPx;
    const channelCSS = contentHeight / dpr;

    // Clamp scroll
    const maxScrollCSS = Math.max(
      0,
      this.v.variantTotalContentHeightCSS - channelCSS,
    );
    if (this.v._variantScrollOffset > maxScrollCSS)
      this.v._variantScrollOffset = maxScrollCSS;
    if (this.v._variantScrollOffset < 0) this.v._variantScrollOffset = 0;

    ctx.featureRenderer!.renderVariant(gl, this.v._variantRecords, {
      dataRegionStart: ctx.dataRegion.start,
      laneCount: this.v._variantLaneCount,
      totalContentHeightCSS: this.v.variantTotalContentHeightCSS,
      scrollOffsetCSS: this.v._variantScrollOffset,
      contentY,
      contentHeight,
      channelX: ctx.x,
      channelWidth: ctx.width,
      canvasWidth: ctx.gc.canvas!.width,
      canvasHeight: ctx.gc.canvas?.height || 0,
      domainStart: ctx.state.domain.start,
      domainLength,
      mode: ctx.gc.renderMode,
      rowHeight: ctx.config.style?.rowHeight ?? 0.31,
      rowPadding: ctx.config.style?.rowPadding ?? 0.01,
    });
  }

  render(ctx: RenderContext): void {
    if (!ctx.trackContainer) return;

    const dpr = window.devicePixelRatio || 1;
    const domainLength = ctx.state.domain.end - ctx.state.domain.start;
    const channelCSS = ctx.height / dpr;

    // ── Large scale → show "zoom in" hint ────────────────────────────
    if (ctx.isAboveDetailZoom(domainLength)) {
      this.clearVariantLetters();
      ctx.scrollUI.removeVariantScrollbar();
      ctx.scrollUI.removeVariantShadow();

      if (!this.v._variantZoomHintEl) {
        const hint = document.createElement("div");
        hint.className = "variant-zoom-hint";
        hint.textContent = "Zoom in to view variants";
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
        this.v._variantZoomHintEl = hint;
      }
      this.v._variantZoomHintEl.style.display = "flex";
      return;
    }

    // Hide hint when zoomed in enough
    if (this.v._variantZoomHintEl) {
      this.v._variantZoomHintEl.style.display = "none";
    }

    // ── Scrollbar & shadow management ────────────────────────────────
    if (this.v.variantNeedsScroll) {
      ctx.scrollUI.ensureVariantScrollbar();
      ctx.scrollUI.updateVariantScrollbar(channelCSS);
      ctx.scrollUI.ensureVariantShadow(channelCSS);
    } else {
      ctx.scrollUI.removeVariantScrollbar();
      ctx.scrollUI.removeVariantShadow();
    }

    // ── Medium scale → only coloured rects (no letters) ──────────────
    if (domainLength > 5000) {
      this.clearVariantLetters();
      return;
    }

    // ── Small scale → coloured rects + base letters ──────────────────
    const trackCSSWidth = ctx.width / dpr;
    const pxPerBp = trackCSSWidth / domainLength;

    // Only show letters if each base is ≥ 4 CSS px wide
    if (pxPerBp < 4) {
      this.clearVariantLetters();
      return;
    }

    // Skip if no variant records loaded
    if (!this.v._variantRecords || this.v._variantRecords.length === 0) {
      this.clearVariantLetters();
      return;
    }

    if (!this.v._variantOverlayEl) {
      const overlay = document.createElement("div");
      overlay.className = "variant-overlay";
      overlay.style.cssText = [
        "position:absolute",
        "inset:0",
        "pointer-events:none",
        "user-select:none",
        "overflow:hidden",
      ].join(";");
      ctx.trackContainer.appendChild(overlay);
      this.v._variantOverlayEl = overlay;
    }

    // Visible domain range
    const domStart = ctx.state.domain.start;
    const domEnd = ctx.state.domain.end;

    // Lane geometry — must match GPU renderer exactly
    const rowH = this.v.variantRowHeightCSS;
    const rowPad = ctx.config.style?.rowPadding ?? 0.01;
    const fillH = rowH * (1 - 2 * rowPad);
    const lanePadCSS = rowH * rowPad;
    const scrollOff = this.v._variantScrollOffset;

    // Channel padding offset — GPU renders into contentY (padded area),
    // but the overlay div starts at inset:0 (top of full channel).
    const channelPadTopCSS = Math.round(ctx.height * ctx.paddingTop) / dpr;
    const channelPadBotCSS = Math.round(ctx.height * ctx.paddingBottom) / dpr;
    const contentTopCSS = channelPadTopCSS;
    const contentBotCSS = channelCSS - channelPadBotCSS;

    // Font size: scale with base width, capped to fill height
    // (mirrors Sequence overlay: pxPerBp * 0.8 capped to fillH * 0.75)
    const fontSize = Math.min(
      Math.floor(pxPerBp * 0.8),
      Math.floor(fillH * 0.75),
    );
    if (fontSize < 6) {
      this.clearVariantLetters();
      return;
    }

    const textColor = "#ffffff";
    const fragments: string[] = [];

    for (const rec of this.v._variantRecords) {
      const start = rec.start ?? 0;
      const end = rec.end ?? start + 1;
      if (end <= domStart || start >= domEnd) continue;

      const lane = rec.lane ?? 0;
      // Rect top = channelPadding + lane * rowH + lanePad − scrollOffset
      // (matches GPU which renders into the padded content area)
      const rectTopCSS = contentTopCSS + lane * rowH + lanePadCSS - scrollOff;
      const rectBottomCSS = rectTopCSS + fillH;

      // Skip if fully outside the content area
      if (rectBottomCSS < contentTopCSS || rectTopCSS > contentBotCSS) continue;

      const varWidth = end - start;
      const xCss = (start - domStart) * pxPerBp;
      const wCss = varWidth * pxPerBp;

      // Build alt allele display text
      const altArr: string[] = rec.alt || [];
      let displayText: string;
      if (rec.altDisplay) {
        displayText = rec.altDisplay;
      } else if (altArr.length === 0) {
        displayText = "?";
      } else if (altArr.length === 1) {
        const a = altArr[0];
        displayText = a.length <= 3 ? a : a[0] + "…";
      } else {
        displayText = altArr
          .map((a: string) => (a.length <= 2 ? a : a[0]))
          .join("|");
      }

      // Clamp Y within content bounds (clip to padded area)
      const visTop = Math.max(contentTopCSS, rectTopCSS);
      const visBottom = Math.min(contentBotCSS, rectBottomCSS);
      const visH = visBottom - visTop;
      if (visH < 2) continue;

      // Letter span covers exactly the fill rect, vertically centred
      // (same approach as Sequence overlay: flex + align-items:center)
      fragments.push(
        `<span style="position:absolute;left:${xCss.toFixed(1)}px;top:${visTop.toFixed(1)}px;` +
          `width:${wCss.toFixed(1)}px;height:${visH.toFixed(1)}px;` +
          `display:flex;align-items:center;justify-content:center;` +
          `font-size:${fontSize}px;font-weight:400;color:${textColor};` +
          `font-family:Arial,Helvetica,sans-serif;` +
          `overflow:hidden;white-space:nowrap">${displayText}</span>`,
      );
    }

    this.v._variantOverlayEl.innerHTML = fragments.join("");
    this.v._variantOverlayEl.style.display = "block";
  }

  private clearVariantLetters(): void {
    if (this.v._variantOverlayEl) {
      this.v._variantOverlayEl.style.display = "none";
      this.v._variantOverlayEl.innerHTML = "";
    }
  }
}
