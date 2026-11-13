import { ChannelView } from "../index";
import type { RenderContext } from "./render-context";
import { pickStrandArrowColor } from "../../colors/colors";

/** Rect/transcript overlays: strand arrows, feature name labels, intron backbones. */
export class RectOverlayView {
  constructor(private readonly v: ChannelView) {}

  renderStrand(ctx: RenderContext): void {
    if (!ctx.trackContainer) return;
    if (!ctx.data || ctx.data.length === 0) {
      if (this.v._rectStrandOverlay) {
        this.v._rectStrandOverlay.innerHTML = "";
        this.v._rectStrandOverlay.style.display = "none";
      }
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const channelFullCSS = ctx.height / dpr;
    const paddingTopCSS = channelFullCSS * ctx.paddingTop;
    const paddingBottomCSS = channelFullCSS * ctx.paddingBottom;
    const contentHeightCSS = channelFullCSS - paddingTopCSS - paddingBottomCSS;
    const trackCSSWidth = ctx.width / dpr;

    const domainStart = ctx.state.domain.start;
    const domainEnd = ctx.state.domain.end;
    const domainLength = domainEnd - domainStart;
    if (domainLength <= 0) return;

    // Ensure overlay element exists
    if (!this.v._rectStrandOverlay) {
      const el = document.createElement("div");
      el.style.cssText =
        "position:absolute;left:0;top:0;width:100%;overflow:hidden;pointer-events:none;user-select:none;z-index:10";
      ctx.trackContainer.appendChild(el);
      this.v._rectStrandOverlay = el;
    }
    this.v._rectStrandOverlay.style.top = `${paddingTopCSS}px`;
    this.v._rectStrandOverlay.style.height = `${contentHeightCSS}px`;
    this.v._rectStrandOverlay.style.display = "block";

    const fragments: string[] = [];
    const arrowSpacingCSS = 30;
    const isDiamond = ctx.config.plot === "diamond";

    // Vertical centre of the rect band
    // Rect occupies 10%–90% → centre at 50%; diamond centre is also 50%.
    // Use transform to perfectly centre the glyph vertically.
    const arrowFontSize = 8;
    const arrowCenterCSS = contentHeightCSS * 0.5;
    const arrowTopCSS = arrowCenterCSS - arrowFontSize / 2;
    void isDiamond; // reserved for future per-plot adjustments

    // Most rect channels reuse a tiny palette across all features
    // (FEATURE_COLORS has ≤7 entries), so cache hex → arrow colour for
    // the whole render to avoid re-running WCAG luminance per feature.
    const colorCache = new Map<string, string>();
    const fallbackFg =
      typeof ctx.config.style?.foreground === "string"
        ? (ctx.config.style.foreground as string)
        : "";
    const fallbackArrow = pickStrandArrowColor(fallbackFg);

    for (const feature of ctx.data) {
      // Determine strand
      const rawStrand = feature.strand;
      if (!rawStrand || rawStrand === "." || rawStrand === 0) continue;
      const isForward =
        rawStrand === "+" || rawStrand === 1 || rawStrand === "1";
      const isReverse =
        rawStrand === "-" || rawStrand === -1 || rawStrand === "-1";
      if (!isForward && !isReverse) continue;
      const arrowChar = isReverse ? "❮" : "❯";

      const fStart = feature.chromStart ?? feature.start ?? 0;
      const fEnd = feature.chromEnd ?? feature.end ?? fStart;

      // Map to CSS coordinates
      let xStart = ((fStart - domainStart) / domainLength) * trackCSSWidth;
      let xEnd = ((fEnd - domainStart) / domainLength) * trackCSSWidth;

      // Clip to visible
      xStart = Math.max(0, xStart);
      xEnd = Math.min(trackCSSWidth, xEnd);
      const featureWidthCSS = xEnd - xStart;
      if (featureWidthCSS < 14) continue; // too narrow for an arrow

      const numArrows = Math.max(
        1,
        Math.floor(featureWidthCSS / arrowSpacingCSS),
      );
      const step = featureWidthCSS / (numArrows + 1);
      // Adapt arrow colour to the feature's fill luminance — a single
      // hard-coded white disappears on light fills (UTR `#ced6e0`) and a
      // hard-coded dark loses contrast on dark fills (CDS `#3867d6`).
      const featColor = (feature as any).color as string | undefined;
      let arrowColor: string;
      if (featColor) {
        let c = colorCache.get(featColor);
        if (c === undefined) {
          c = pickStrandArrowColor(featColor);
          colorCache.set(featColor, c);
        }
        arrowColor = c;
      } else {
        arrowColor = fallbackArrow;
      }
      for (let ai = 1; ai <= numArrows; ai++) {
        const ax = xStart + step * ai;
        fragments.push(
          `<span style="position:absolute;left:${ax.toFixed(1)}px;top:${arrowTopCSS.toFixed(1)}px;font-size:8px;color:${arrowColor};pointer-events:none;line-height:1">${arrowChar}</span>`,
        );
      }
    }

    this.v._rectStrandOverlay.innerHTML = fragments.join("");
  }

  renderName(ctx: RenderContext): void {
    if (!ctx.trackContainer) return;
    if (!ctx.data || ctx.data.length === 0) {
      if (this.v._rectNameOverlay) {
        this.v._rectNameOverlay.innerHTML = "";
        this.v._rectNameOverlay.style.display = "none";
      }
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const channelFullCSS = ctx.height / dpr;
    const paddingTopCSS = channelFullCSS * ctx.paddingTop;
    const paddingBottomCSS = channelFullCSS * ctx.paddingBottom;
    const contentHeightCSS = channelFullCSS - paddingTopCSS - paddingBottomCSS;
    const trackCSSWidth = ctx.width / dpr;

    // The rect body was rendered with an extra bottom-padding of
    // SHOW_NAME_PAD_BOTTOM, so it occupies only the upper portion
    // of the content area.  Labels go in the remaining space below.
    const extraPadCSS = channelFullCSS * ChannelView.SHOW_NAME_PAD_BOTTOM;
    const rectBodyCSS = contentHeightCSS - extraPadCSS;
    // Label Y: just below the rect body, centred in the remaining space
    const labelY = rectBodyCSS + (extraPadCSS - 9) / 2; // 9 ≈ default font size

    const domainStart = ctx.state.domain.start;
    const domainEnd = ctx.state.domain.end;
    const domainLength = domainEnd - domainStart;
    if (domainLength <= 0) return;

    // Ensure overlay element exists
    if (!this.v._rectNameOverlay) {
      const el = document.createElement("div");
      el.style.cssText =
        "position:absolute;left:0;top:0;width:100%;overflow:hidden;pointer-events:none;user-select:none;z-index:11";
      ctx.trackContainer.appendChild(el);
      this.v._rectNameOverlay = el;
    }
    this.v._rectNameOverlay.style.top = `${paddingTopCSS}px`;
    this.v._rectNameOverlay.style.height = `${contentHeightCSS}px`;
    this.v._rectNameOverlay.style.display = "block";

    const fragments: string[] = [];
    const defaultFontSize = 9;
    const charWidth = defaultFontSize * 0.58;

    for (const feature of ctx.data) {
      // Extract display name
      const rawName =
        (feature as any).geneName ??
        (feature as any).name ??
        (feature as any).gene_name ??
        "";
      if (!rawName || typeof rawName !== "string") continue;

      // Strand arrow prefix / suffix (like transcript labels)
      const rawStrand = feature.strand;
      const isForward =
        rawStrand === "+" || rawStrand === 1 || rawStrand === "1";
      const isReverse =
        rawStrand === "-" || rawStrand === -1 || rawStrand === "-1";
      const arrow = isReverse ? "< " : "";
      const arrowEnd = isForward ? " >" : "";
      const displayName = `${arrow}${rawName}${arrowEnd}`;

      const fStart = feature.chromStart ?? feature.start ?? 0;
      const fEnd = feature.chromEnd ?? feature.end ?? fStart;

      // Map to CSS coordinates
      const xStartRaw = ((fStart - domainStart) / domainLength) * trackCSSWidth;
      const xEndRaw = ((fEnd - domainStart) / domainLength) * trackCSSWidth;

      // Visible portion (clipped to track bounds)
      const visibleLeft = Math.max(0, xStartRaw);
      const visibleRight = Math.min(trackCSSWidth, xEndRaw);
      const visibleWidth = visibleRight - visibleLeft;
      if (visibleWidth <= 0) continue;

      const labelWidth = displayName.length * charWidth;
      let fontSize = defaultFontSize;
      let opacity = 1;
      let textAlign = "center";

      // Centre label within the feature's visible span
      let labelX = visibleLeft + (visibleWidth - labelWidth) / 2;

      const offLeft = xStartRaw < 0 && xEndRaw > 0;
      const offRight = xEndRaw > trackCSSWidth && xStartRaw < trackCSSWidth;

      if (offLeft && offRight) {
        // Feature spans the entire viewport
        labelX = (trackCSSWidth - labelWidth) / 2;
        if (labelX < 0) labelX = 0;
      } else if (offLeft) {
        labelX = visibleLeft + (visibleWidth - labelWidth) / 2;
        if (labelX < 0) labelX = 0;
        textAlign = "left";
        if (visibleWidth < labelWidth && visibleWidth > 0) {
          const ratio = visibleWidth / labelWidth;
          fontSize = defaultFontSize * ratio;
          opacity = ratio;
          labelX = 0;
        }
      } else if (offRight) {
        labelX = visibleLeft + (visibleWidth - labelWidth) / 2;
        if (labelX + labelWidth > trackCSSWidth) {
          labelX = trackCSSWidth - labelWidth;
        }
        textAlign = "right";
        if (visibleWidth < labelWidth && visibleWidth > 0) {
          const ratio = visibleWidth / labelWidth;
          fontSize = defaultFontSize * ratio;
          opacity = ratio;
          labelX = visibleRight - visibleWidth;
        }
      } else {
        // Fully visible
        const featureWidthCSS = xEndRaw - xStartRaw;
        labelX = xStartRaw + (featureWidthCSS - labelWidth) / 2;
        if (labelWidth > featureWidthCSS && featureWidthCSS > 0) {
          const ratio = featureWidthCSS / labelWidth;
          fontSize = defaultFontSize * ratio;
          opacity = ratio;
          labelX = xStartRaw;
        }
      }

      // Don't render if font size is too small
      if (fontSize < 4) continue;

      const maxW = Math.min(400, visibleRight - Math.max(0, labelX));
      if (maxW <= 0) continue;

      fragments.push(
        `<span style="position:absolute;left:${labelX.toFixed(1)}px;top:${labelY.toFixed(1)}px;font-size:${fontSize.toFixed(1)}px;font-family:Arial,Helvetica,sans-serif;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:${textAlign};max-width:${maxW.toFixed(1)}px;line-height:1.1;opacity:${opacity.toFixed(2)};pointer-events:none">${displayName}</span>`,
      );
    }

    this.v._rectNameOverlay.innerHTML = fragments.join("");
  }

  renderIntronBackbone(ctx: RenderContext): void {
    // Only for buildin transcript parent channels (not sub-channels)
    const cfg = ctx.config;
    const isBuildinTranscript =
      cfg.data &&
      (cfg.data as any).method === "buildin" &&
      (cfg.data as any).format === "transcript" &&
      (cfg.plot === "rect" || !cfg.plot);

    if (!isBuildinTranscript || this.v._isSubChannel) return;

    const gl = ctx.gc.gl;
    if (!gl) return;
    if (!ctx.data || ctx.data.length === 0) {
      // No structure for the active transcript. Clear the strand-arrow DOM
      // overlay so the PREVIOUS transcript's chevrons don't linger on screen
      // (the WebGL rects already vanish because `ctx.data` is empty, but the
      // arrows live in persistent DOM and would otherwise stay stale).
      if (this.v._intronStrandOverlay) this.v._intronStrandOverlay.innerHTML = "";
      return;
    }

    // Compute transcript span from features
    let txStart = Infinity;
    let txEnd = -Infinity;
    for (const f of ctx.data) {
      const s = f.chromStart ?? f.start ?? 0;
      const e = f.chromEnd ?? f.end ?? 0;
      if (s < txStart) txStart = s;
      if (e > txEnd) txEnd = e;
    }
    if (txStart >= txEnd) return;

    const dpr = window.devicePixelRatio || 1;
    const physW = ctx.width;
    const physH = ctx.height;
    const canvasHeight = ctx.gc.canvas?.height || 0;

    const domainStart = ctx.state.domain.start;
    const domainEnd = ctx.state.domain.end;
    const domainLength = domainEnd - domainStart;
    if (domainLength <= 0) return;

    // Map txStart/txEnd to physical pixel coordinates
    let xStartPx = ((txStart - domainStart) / domainLength) * physW;
    let xEndPx = ((txEnd - domainStart) / domainLength) * physW;
    xStartPx = Math.max(0, xStartPx);
    xEndPx = Math.min(physW, xEndPx);
    const rectW = Math.round(xEndPx - xStartPx);
    if (rectW < 2) return;

    // Intron rect: 30% of content height, vertically centred
    const paddingTopPx = Math.round(physH * ctx.paddingTop);
    const paddingBottomPx = Math.round(physH * ctx.paddingBottom);
    const contentH = physH - paddingTopPx - paddingBottomPx;
    const lineThickness = Math.max(
      Math.round(3 * dpr),
      Math.round(contentH * 0.3),
    );
    const contentCenterY = ctx.y + paddingTopPx + contentH * 0.5;
    const rectTop = Math.round(contentCenterY - lineThickness / 2);

    // Draw a solid rect using gl.scissor + gl.clear — same approach as renderBackground.
    // #a6afba = rgb(166, 175, 186)
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(
      ctx.x + Math.round(xStartPx),
      Math.max(0, canvasHeight - rectTop - lineThickness),
      rectW,
      lineThickness,
    );
    gl.clearColor(166 / 255, 175 / 255, 186 / 255, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);

    // ── Strand-direction arrows on the intron gaps ───────────────────
    this.renderIntronStrandArrows(ctx, domainStart, domainLength);
  }

  private renderIntronStrandArrows(
    ctx: RenderContext,
    domainStart: number,
    domainLength: number,
  ): void {
    if (!ctx.trackContainer || !ctx.data || ctx.data.length === 0) return;

    // Determine strand from the first feature that has one
    let strand: string | number | null = null;
    for (const f of ctx.data) {
      if (f.strand && f.strand !== "." && f.strand !== 0) {
        strand = f.strand;
        break;
      }
    }
    if (!strand) {
      // No strand info — hide overlay if it exists
      if (this.v._intronStrandOverlay) {
        this.v._intronStrandOverlay.style.display = "none";
      }
      return;
    }

    const isForward = strand === "+" || strand === 1 || strand === "1";
    const isReverse = strand === "-" || strand === -1 || strand === "-1";
    if (!isForward && !isReverse) return;
    const arrowChar = isReverse ? "❮" : "❯";

    const dpr = window.devicePixelRatio || 1;
    const channelFullCSS = ctx.height / dpr;
    const paddingTopCSS = channelFullCSS * ctx.paddingTop;
    const paddingBottomCSS = channelFullCSS * ctx.paddingBottom;
    const contentHeightCSS = channelFullCSS - paddingTopCSS - paddingBottomCSS;
    const trackCSSWidth = ctx.width / dpr;

    // Ensure overlay element exists
    if (!this.v._intronStrandOverlay) {
      const el = document.createElement("div");
      el.style.cssText =
        "position:absolute;left:0;top:0;width:100%;overflow:hidden;pointer-events:none;user-select:none;z-index:10";
      ctx.trackContainer.appendChild(el);
      this.v._intronStrandOverlay = el;
    }
    this.v._intronStrandOverlay.style.top = `${paddingTopCSS}px`;
    this.v._intronStrandOverlay.style.height = `${contentHeightCSS}px`;
    this.v._intronStrandOverlay.style.display = "block";

    // Sort features by start position to find intron gaps
    const sorted = [...ctx.data]
      .map((f) => ({
        s: f.chromStart ?? f.start ?? 0,
        e: f.chromEnd ?? f.end ?? 0,
      }))
      .sort((a, b) => a.s - b.s);

    // Merge overlapping intervals to get non-overlapping exon blocks
    const merged: Array<{ s: number; e: number }> = [];
    for (const iv of sorted) {
      if (merged.length > 0 && iv.s <= merged[merged.length - 1].e) {
        merged[merged.length - 1].e = Math.max(
          merged[merged.length - 1].e,
          iv.e,
        );
      } else {
        merged.push({ s: iv.s, e: iv.e });
      }
    }

    // Collect all regions to place arrows: intron gaps + exon blocks
    const regions: Array<{ s: number; e: number; isGap: boolean }> = [];

    // Intron gaps (between merged exon blocks)
    for (let i = 0; i < merged.length - 1; i++) {
      const gapStart = merged[i].e;
      const gapEnd = merged[i + 1].s;
      if (gapEnd > gapStart) {
        regions.push({ s: gapStart, e: gapEnd, isGap: true });
      }
    }

    // Exon blocks (merged, so no duplicates from overlapping exon/CDS/UTR)
    for (const block of merged) {
      regions.push({ s: block.s, e: block.e, isGap: false });
    }

    if (regions.length === 0) {
      this.v._intronStrandOverlay.innerHTML = "";
      return;
    }

    // Place arrows in each region
    const arrowSpacingCSS = 30;
    const arrowFontSize = 9;
    const arrowCenterCSS = contentHeightCSS * 0.5;
    const arrowTopCSS = arrowCenterCSS - arrowFontSize / 2;

    // Per-feature.color → arrow colour cache. The buildin Transcript
    // Structure channel only renders a handful of distinct colours
    // (CDS / exon / UTR / codons), so a tiny per-render Map keeps the
    // arrow loop allocation-free and skips re-running the WCAG luminance
    // for repeated lookups inside the same frame.
    const colorCache = new Map<string, string>();
    const cachedArrowColor = (fill: string): string => {
      let c = colorCache.get(fill);
      if (c === undefined) {
        c = pickStrandArrowColor(fill);
        colorCache.set(fill, c);
      }
      return c;
    };
    // Scan `ctx.data` directly inside the lookup — avoids the
    // intermediate `featSpans = ctx.data.map(...)` array (one allocation
    // per render × N features). Tracks the smallest-containing feature
    // using primitives only, so the inner pickColorAtBp does no per-arrow
    // object allocation.
    const features = ctx.data;
    const featCount = features.length;
    const pickArrowColorAtBp = (bp: number): string => {
      let bestWidth = Infinity;
      let bestColor: string | undefined;
      for (let i = 0; i < featCount; i++) {
        const f = features[i];
        const s = f.chromStart ?? f.start ?? 0;
        const e = f.chromEnd ?? f.end ?? 0;
        if (bp < s || bp >= e) continue;
        const w = e - s;
        if (w < bestWidth) {
          bestWidth = w;
          bestColor = (f as any).color ?? "";
        }
      }
      return bestColor ? cachedArrowColor(bestColor) : cachedArrowColor("");
    };

    const fragments: string[] = [];
    for (const region of regions) {
      // Map region to CSS coordinates
      let xStart = ((region.s - domainStart) / domainLength) * trackCSSWidth;
      let xEnd = ((region.e - domainStart) / domainLength) * trackCSSWidth;
      xStart = Math.max(0, xStart);
      xEnd = Math.min(trackCSSWidth, xEnd);
      const regionWidthCSS = xEnd - xStart;
      if (regionWidthCSS < 14) continue; // too narrow for an arrow

      const numArrows = Math.max(
        1,
        Math.floor(regionWidthCSS / arrowSpacingCSS),
      );
      const step = regionWidthCSS / (numArrows + 1);
      const isGap = region.isGap;
      for (let ai = 1; ai <= numArrows; ai++) {
        const ax = xStart + step * ai;
        // Intron gaps sit on the gray backbone (`#a6afba`, dark side of
        // the threshold) → always a light arrow. Exon-block arrows adapt
        // to the specific feature they overlap.
        let color: string;
        if (isGap) {
          color = "rgba(255,255,255,0.85)";
        } else {
          const bp = domainStart + (ax / trackCSSWidth) * domainLength;
          color = pickArrowColorAtBp(bp);
        }
        fragments.push(
          `<span style="position:absolute;left:${ax.toFixed(1)}px;top:${arrowTopCSS.toFixed(1)}px;font-size:${arrowFontSize}px;color:${color};pointer-events:none;line-height:1">${arrowChar}</span>`,
        );
      }
    }

    this.v._intronStrandOverlay.innerHTML = fragments.join("");
  }
}
