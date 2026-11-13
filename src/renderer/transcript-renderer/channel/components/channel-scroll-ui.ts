import type { ChannelView } from "../index";
import { COLORMAP_GRADIENTS } from "../../colors/color_map";

/**
 * Per-channel scroll-UI chrome: the custom vertical scrollbars, edge
 * shadows, zoom-hint pills, and the BAM coverage score label for the
 * BAM / transcript / variant lane areas. Owns no state itself — it
 * builds/updates DOM against the ChannelView (refs + geometry via `v`).
 */
export class ChannelScrollUI {
  constructor(private readonly v: ChannelView) {}

  public showBamReadsZoomHint(
    coverageCSS: number,
    paddingTopCSS: number,
  ): void {
    if (!this.v.trackContainer) return;

    if (!this.v._bamReadsZoomHintEl) {
      const el = document.createElement("div");
      el.className = "bam-reads-zoom-hint";
      el.textContent = "Zoom in to view reads";
      el.style.cssText = [
        "position:absolute",
        "left:0",
        "right:0",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "font-size:12px",
        "color:#999",
        "pointer-events:none",
        "user-select:none",
        "font-family:Calibre,Roboto,Helvetica,sans-serif",
      ].join(";");
      this.v.trackContainer.appendChild(el);
      this.v._bamReadsZoomHintEl = el;
    }

    // Position: starts below coverage, extends to bottom of channel
    const topCSS = paddingTopCSS + coverageCSS;
    this.v._bamReadsZoomHintEl.style.top = `${topCSS}px`;
    this.v._bamReadsZoomHintEl.style.bottom = "0";
    this.v._bamReadsZoomHintEl.style.display = "flex";
  }
  public hideBamReadsZoomHint(): void {
    if (this.v._bamReadsZoomHintEl) {
      this.v._bamReadsZoomHintEl.style.display = "none";
    }
  }
  public updateBamCoverageScoreLabel(
    coverageHeightPx: number,
    paddingTopCSS: number,
  ): void {
    if (!this.v.trackContainer) return;

    const showCoverage = this.v.bamCoverageEnabled && coverageHeightPx > 0;
    const maxDepth = this.v._bamCoverageMax;

    // Resolve scoreLabel config from coverage config
    const covCfg = this.v.bamCoverageConfig;
    const slCfg = (covCfg as any)?.scoreLabel;
    const labelEnabled = slCfg?.enabled !== false; // default true

    if (!showCoverage || maxDepth <= 0 || !labelEnabled) {
      // Hide existing label
      if (this.v._bamScoreLabelEl) this.v._bamScoreLabelEl.style.display = "none";
      return;
    }

    const fontSize = slCfg?.fontSize ?? 12;
    const textColor = slCfg?.color ?? "#555";
    const bgColor = slCfg?.background ?? "rgba(255,255,255,0.75)";

    if (!this.v._bamScoreLabelEl) {
      const el = document.createElement("div");
      el.className = "channel-score-label bam-coverage-score-label";
      el.style.cssText = [
        "position:absolute",
        `font-size:${fontSize}px`,
        "line-height:1",
        "font-family:monospace",
        `color:${textColor}`,
        `background:${bgColor}`,
        "padding:1px 3px",
        "border-radius:2px",
        "pointer-events:none",
        "user-select:none",
        "white-space:nowrap",
        "z-index:10",
      ].join(";");
      this.v.trackContainer.appendChild(el);
      this.v._bamScoreLabelEl = el;
    }

    // Position at top-right of coverage area
    const topCSS = paddingTopCSS + 1;
    this.v._bamScoreLabelEl.style.top = `${topCSS}px`;
    this.v._bamScoreLabelEl.style.right = "4px";
    this.v._bamScoreLabelEl.style.display = "";

    const fmt = (v: number) =>
      Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.?0+$/, "");

    // Detect colormap from coverage color config
    const covColor = covCfg.color;
    const colormapName: string | undefined =
      covColor && typeof covColor === "object" ? covColor.colormap : undefined;

    // Use instance-level legend style property
    const legendStyleOverride = this.v._legendStyleOverride;

    // If legend is hidden globally, keep element but hide it
    if (!this.v._legendVisible) {
      this.v._bamScoreLabelEl.style.display = "none";
      return;
    }

    if (colormapName && legendStyleOverride !== "text") {
      // ── Compact colorbar legend: 0 ████████ max ──
      const colors =
        COLORMAP_GRADIENTS[colormapName as keyof typeof COLORMAP_GRADIENTS];
      if (colors && colors.length > 0) {
        const stops = colors
          .map(
            (c, i) => `${c} ${((i / (colors.length - 1)) * 100).toFixed(1)}%`,
          )
          .join(",");

        this.v._bamScoreLabelEl.style.display = "flex";
        this.v._bamScoreLabelEl.style.alignItems = "center";
        this.v._bamScoreLabelEl.style.gap = "2px";
        this.v._bamScoreLabelEl.textContent = "";
        this.v._bamScoreLabelEl.innerHTML =
          `<span style="flex-shrink:0">0</span>` +
          `<span style="display:inline-block;width:40px;height:6px;` +
          `border-radius:1px;flex-shrink:0;` +
          `background:linear-gradient(to right,${stops})"></span>` +
          `<span style="flex-shrink:0">${fmt(maxDepth)}</span>`;
        return;
      }
    }

    // ── Plain text fallback: [0, max] ──
    this.v._bamScoreLabelEl.style.alignItems = "";
    this.v._bamScoreLabelEl.style.gap = "";
    this.v._bamScoreLabelEl.textContent = `[0, ${fmt(maxDepth)}]`;
  }
  public ensureBamScrollbar(): void {
    if (this.v._bamScrollTrack) return;
    if (!this.v.trackContainer) return;

    const dpr = window.devicePixelRatio || 1;
    const paddingTopPx = Math.round(this.v.height * this.v.paddingTop);
    const paddingBottomPx = Math.round(this.v.height * this.v.paddingBottom);
    const fullContentHeight = this.v.height - paddingTopPx - paddingBottomPx;
    const coverageHeightPx = this.v.bamCoverageEnabled
      ? Math.round(fullContentHeight * this.v.bamCoverageHeightFrac)
      : 0;
    const coverageCSS = coverageHeightPx / dpr;
    const readsCSS = (fullContentHeight - coverageHeightPx) / dpr;
    const topOffsetCSS = paddingTopPx / dpr + coverageCSS;

    // Track — spans only the reads portion (below coverage)
    const track = document.createElement("div");
    track.className = "bam-scrollbar-track";
    track.style.cssText = [
      "position:absolute",
      `top:${topOffsetCSS}px`,
      "right:2px",
      `height:${readsCSS}px`,
      "width:6px",
      "background:rgba(0,0,0,0.05)",
      "border-radius:3px",
      "z-index:100",
      "pointer-events:auto",
    ].join(";");

    // Thumb
    const thumb = document.createElement("div");
    thumb.className = "bam-scrollbar-thumb";
    thumb.style.cssText = [
      "position:absolute",
      "top:0",
      "right:0",
      "width:6px",
      "min-height:16px",
      "background:rgba(0,0,0,0.25)",
      "border-radius:3px",
      "cursor:pointer",
      "transition:background 0.15s",
    ].join(";");

    track.appendChild(thumb);
    this.v.trackContainer.appendChild(track);
    this.v._bamScrollTrack = track;
    this.v._bamScrollThumb = thumb;

    // Hover
    thumb.addEventListener("mouseenter", () => {
      thumb.style.background = "rgba(0,0,0,0.45)";
    });
    thumb.addEventListener("mouseleave", () => {
      thumb.style.background = "rgba(0,0,0,0.25)";
    });

    // Thumb drag
    let dragging = false;
    let dragStartY = 0;
    let dragStartScroll = 0;

    thumb.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      dragStartY = e.clientY;
      dragStartScroll = this.v._bamScrollOffset;
      thumb.style.background = "rgba(0,0,0,0.55)";
    });

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      const trackCSS = readsCSS;
      const totalCSS = this.v.bamTotalContentHeightCSS;
      const maxScroll = Math.max(0, totalCSS - trackCSS);
      const thumbTravel = trackCSS - (trackCSS * trackCSS) / totalCSS;
      const dy = e.clientY - dragStartY;
      const scrollDelta = (dy / thumbTravel) * maxScroll;
      this.v._bamScrollOffset = Math.max(
        0,
        Math.min(maxScroll, dragStartScroll + scrollDelta),
      );
      this.v.onDirtyCallback?.();
    };

    const onMouseUp = () => {
      if (dragging) {
        dragging = false;
        thumb.style.background = "rgba(0,0,0,0.25)";
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    // Wheel on scrollbar track
    track.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const maxScroll = Math.max(0, this.v.bamTotalContentHeightCSS - readsCSS);
        this.v._bamScrollOffset = Math.max(
          0,
          Math.min(maxScroll, this.v._bamScrollOffset + e.deltaY * 0.5),
        );
        this.v.onDirtyCallback?.();
      },
      { passive: false },
    );
  }
  public updateBamScrollbar(
    channelCSS: number,
    topOffsetCSS: number,
    trackHeightCSS: number,
  ): void {
    if (!this.v._bamScrollThumb || !this.v._bamScrollTrack) return;
    const totalCSS = this.v.bamTotalContentHeightCSS;
    if (totalCSS <= 0) return;

    // Update track position every frame so it stays aligned with the
    // parent channel bottom even after resize / layout changes.
    this.v._bamScrollTrack.style.top = `${topOffsetCSS}px`;
    this.v._bamScrollTrack.style.height = `${trackHeightCSS}px`;

    const thumbH = Math.max(16, (channelCSS / totalCSS) * channelCSS);
    const maxScroll = Math.max(0, totalCSS - channelCSS);
    const scrollFrac = maxScroll > 0 ? this.v._bamScrollOffset / maxScroll : 0;
    const thumbTop = scrollFrac * (channelCSS - thumbH);

    this.v._bamScrollThumb.style.height = `${thumbH}px`;
    this.v._bamScrollThumb.style.top = `${thumbTop}px`;
    this.v._bamScrollTrack.style.display = "block";
  }
  public removeBamScrollbar(): void {
    if (this.v._bamScrollTrack) {
      this.v._bamScrollTrack.remove();
      this.v._bamScrollTrack = null;
      this.v._bamScrollThumb = null;
    }
  }
  public ensureBamShadow(readsCSS: number): void {
    if (!this.v.trackContainer) return;

    const dpr = window.devicePixelRatio || 1;
    const paddingTopPx = Math.round(this.v.height * this.v.paddingTop);
    const fullContentHeight =
      this.v.height - paddingTopPx - Math.round(this.v.height * this.v.paddingBottom);
    const coverageHeightPx = this.v.bamCoverageEnabled
      ? Math.round(fullContentHeight * this.v.bamCoverageHeightFrac)
      : 0;
    const topOffsetCSS = paddingTopPx / dpr + coverageHeightPx / dpr;

    if (!this.v._bamShadowEl) {
      const el = document.createElement("div");
      el.className = "bam-inner-shadow";
      el.style.cssText = [
        "position:absolute",
        "left:0",
        "right:0",
        "pointer-events:none",
        "z-index:50",
      ].join(";");
      this.v.trackContainer.appendChild(el);
      this.v._bamShadowEl = el;
    }

    this.v._bamShadowEl.style.top = `${topOffsetCSS}px`;
    this.v._bamShadowEl.style.height = `${readsCSS}px`;
    this.v._bamShadowEl.style.boxShadow =
      "inset 0 8px 6px -6px rgba(0,0,0,0.12), inset 0 -8px 6px -6px rgba(0,0,0,0.12)";
  }
  public removeBamShadow(): void {
    if (this.v._bamShadowEl) {
      this.v._bamShadowEl.remove();
      this.v._bamShadowEl = null;
    }
  }
  public ensureTxScrollbar(): void {
    if (this.v._txScrollTrack) return;
    if (!this.v.trackContainer) return;

    const dpr = window.devicePixelRatio || 1;
    const channelFullCSS = this.v.height / dpr; // full parent channel height

    // Track — spans the entire channel height (not just content area)
    const track = document.createElement("div");
    track.className = "tx-scrollbar-track";
    track.style.cssText = [
      "position:absolute",
      "top:0",
      "right:2px",
      `height:${channelFullCSS}px`,
      "width:6px",
      "background:rgba(0,0,0,0.05)",
      "border-radius:3px",
      "z-index:100",
      "pointer-events:auto",
    ].join(";");

    // Thumb
    const thumb = document.createElement("div");
    thumb.className = "tx-scrollbar-thumb";
    thumb.style.cssText = [
      "position:absolute",
      "top:0",
      "right:0",
      "width:6px",
      "min-height:16px",
      "background:rgba(0,0,0,0.25)",
      "border-radius:3px",
      "cursor:pointer",
      "transition:background 0.15s",
    ].join(";");

    track.appendChild(thumb);
    this.v.trackContainer.appendChild(track);
    this.v._txScrollTrack = track;
    this.v._txScrollThumb = thumb;

    // Hover
    thumb.addEventListener("mouseenter", () => {
      thumb.style.background = "rgba(0,0,0,0.45)";
    });
    thumb.addEventListener("mouseleave", () => {
      thumb.style.background = "rgba(0,0,0,0.25)";
    });

    // Thumb drag
    let dragging = false;
    let dragStartY = 0;
    let dragStartScroll = 0;

    thumb.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      dragStartY = e.clientY;
      dragStartScroll = this.v._txScrollOffset;
      thumb.style.background = "rgba(0,0,0,0.55)";
    });

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      const trackCSS = channelFullCSS;
      const totalCSS = this.v.txTotalContentHeightCSS;
      const maxScroll = Math.max(0, totalCSS - trackCSS);
      const thumbTravel = trackCSS - (trackCSS * trackCSS) / totalCSS;
      const dy = e.clientY - dragStartY;
      const scrollDelta = (dy / thumbTravel) * maxScroll;
      this.v._txScrollOffset = Math.max(
        0,
        Math.min(maxScroll, dragStartScroll + scrollDelta),
      );
      this.v.onDirtyCallback?.();
    };

    const onMouseUp = () => {
      if (dragging) {
        dragging = false;
        thumb.style.background = "rgba(0,0,0,0.25)";
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    // Wheel scrolling
    track.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const maxScroll = Math.max(
          0,
          this.v.txTotalContentHeightCSS - channelFullCSS,
        );
        this.v._txScrollOffset = Math.max(
          0,
          Math.min(maxScroll, this.v._txScrollOffset + e.deltaY * 0.5),
        );
        this.v.onDirtyCallback?.();
      },
      { passive: false },
    );

    // Also allow wheel on the track container itself
    this.v.trackContainer.addEventListener(
      "wheel",
      (e) => {
        if (!this.v.txNeedsScroll) return;
        if (!e.altKey) return; // Alt+wheel to scroll channel content
        e.preventDefault();
        e.stopPropagation();
        const maxScroll = Math.max(
          0,
          this.v.txTotalContentHeightCSS - channelFullCSS,
        );
        this.v._txScrollOffset = Math.max(
          0,
          Math.min(maxScroll, this.v._txScrollOffset + e.deltaY * 0.5),
        );
        this.v.onDirtyCallback?.();
      },
      { passive: false },
    );
  }
  public updateTxScrollbar(channelCSS: number): void {
    if (!this.v._txScrollThumb || !this.v._txScrollTrack) return;
    const totalCSS = this.v.txTotalContentHeightCSS;
    if (totalCSS <= 0) return;

    const thumbH = Math.max(16, (channelCSS / totalCSS) * channelCSS);
    const maxScroll = Math.max(0, totalCSS - channelCSS);
    const scrollFrac = maxScroll > 0 ? this.v._txScrollOffset / maxScroll : 0;
    const thumbTop = scrollFrac * (channelCSS - thumbH);

    this.v._txScrollThumb.style.height = `${thumbH}px`;
    this.v._txScrollThumb.style.top = `${thumbTop}px`;
    this.v._txScrollTrack.style.display = "block";
  }
  public removeTxScrollbar(): void {
    if (this.v._txScrollTrack) {
      this.v._txScrollTrack.remove();
      this.v._txScrollTrack = null;
      this.v._txScrollThumb = null;
    }
  }
  public ensureTxShadow(channelCSS: number): void {
    if (!this.v.trackContainer) return;
    if (!this.v._txShadowEl) {
      const el = document.createElement("div");
      el.className = "tx-inner-shadow";
      el.style.cssText = [
        "position:absolute",
        "left:0",
        "right:0",
        "pointer-events:none",
        "z-index:50",
      ].join(";");
      this.v.trackContainer.appendChild(el);
      this.v._txShadowEl = el;
    }

    // Shadow spans the full parent channel height
    this.v._txShadowEl.style.top = "0";
    this.v._txShadowEl.style.height = `${channelCSS}px`;
    this.v._txShadowEl.style.boxShadow =
      "inset 0 8px 6px -6px rgba(0,0,0,0.12), inset 0 -8px 6px -6px rgba(0,0,0,0.12)";
  }
  public removeTxShadow(): void {
    if (this.v._txShadowEl) {
      this.v._txShadowEl.remove();
      this.v._txShadowEl = null;
    }
  }
  public ensureVariantScrollbar(): void {
    if (this.v._variantScrollTrack) return;
    if (!this.v.trackContainer) return;

    const dpr = window.devicePixelRatio || 1;
    const channelCSS = this.v.height / dpr;

    // Track
    const track = document.createElement("div");
    track.className = "variant-scrollbar-track";
    track.style.cssText = [
      "position:absolute",
      "top:0",
      "right:2px",
      `height:${channelCSS}px`,
      "width:6px",
      "background:rgba(0,0,0,0.05)",
      "border-radius:3px",
      "z-index:100",
      "pointer-events:auto",
    ].join(";");

    // Thumb
    const thumb = document.createElement("div");
    thumb.className = "variant-scrollbar-thumb";
    thumb.style.cssText = [
      "position:absolute",
      "top:0",
      "right:0",
      "width:6px",
      "min-height:16px",
      "background:rgba(0,0,0,0.25)",
      "border-radius:3px",
      "cursor:pointer",
      "transition:background 0.15s",
    ].join(";");

    track.appendChild(thumb);
    this.v.trackContainer.appendChild(track);
    this.v._variantScrollTrack = track;
    this.v._variantScrollThumb = thumb;

    // Hover
    thumb.addEventListener("mouseenter", () => {
      thumb.style.background = "rgba(0,0,0,0.45)";
    });
    thumb.addEventListener("mouseleave", () => {
      thumb.style.background = "rgba(0,0,0,0.25)";
    });

    // Thumb drag
    let dragging = false;
    let dragStartY = 0;
    let dragStartScroll = 0;

    thumb.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      dragStartY = e.clientY;
      dragStartScroll = this.v._variantScrollOffset;
      thumb.style.background = "rgba(0,0,0,0.55)";
    });

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      const totalCSS = this.v.variantTotalContentHeightCSS;
      const maxScroll = Math.max(0, totalCSS - channelCSS);
      const thumbTravel = channelCSS - (channelCSS * channelCSS) / totalCSS;
      const dy = e.clientY - dragStartY;
      const scrollDelta = (dy / thumbTravel) * maxScroll;
      this.v._variantScrollOffset = Math.max(
        0,
        Math.min(maxScroll, dragStartScroll + scrollDelta),
      );
      this.v.onDirtyCallback?.();
    };

    const onMouseUp = () => {
      if (dragging) {
        dragging = false;
        thumb.style.background = "rgba(0,0,0,0.25)";
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }
  public updateVariantScrollbar(channelCSS: number): void {
    if (!this.v._variantScrollThumb || !this.v._variantScrollTrack) return;
    const totalCSS = this.v.variantTotalContentHeightCSS;
    if (totalCSS <= 0) return;

    const thumbH = Math.max(16, (channelCSS / totalCSS) * channelCSS);
    const maxScroll = Math.max(0, totalCSS - channelCSS);
    const scrollFrac =
      maxScroll > 0 ? this.v._variantScrollOffset / maxScroll : 0;
    const thumbTop = scrollFrac * (channelCSS - thumbH);

    this.v._variantScrollThumb.style.height = `${thumbH}px`;
    this.v._variantScrollThumb.style.top = `${thumbTop}px`;
    this.v._variantScrollTrack.style.display = "block";
  }
  public removeVariantScrollbar(): void {
    if (this.v._variantScrollTrack) {
      this.v._variantScrollTrack.remove();
      this.v._variantScrollTrack = null;
      this.v._variantScrollThumb = null;
    }
  }
  public ensureVariantShadow(channelCSS: number): void {
    if (!this.v.trackContainer) return;
    if (!this.v._variantShadowEl) {
      const el = document.createElement("div");
      el.className = "variant-inner-shadow";
      el.style.cssText = [
        "position:absolute",
        "left:0",
        "right:0",
        "pointer-events:none",
        "z-index:50",
      ].join(";");
      this.v.trackContainer.appendChild(el);
      this.v._variantShadowEl = el;
    }
    this.v._variantShadowEl.style.top = "0";
    this.v._variantShadowEl.style.height = `${channelCSS}px`;
    this.v._variantShadowEl.style.boxShadow =
      "inset 0 8px 6px -6px rgba(0,0,0,0.12), inset 0 -8px 6px -6px rgba(0,0,0,0.12)";
  }
  public removeVariantShadow(): void {
    if (this.v._variantShadowEl) {
      this.v._variantShadowEl.remove();
      this.v._variantShadowEl = null;
    }
  }
  public showGenericZoomHint(): void {
    if (!this.v._genericZoomHintEl) {
      const hint = document.createElement("div");
      hint.className = "generic-zoom-hint";
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
      this.v.trackContainer?.appendChild(hint);
      this.v._genericZoomHintEl = hint;
    }
    this.v._genericZoomHintEl.textContent = "Zoom in to view details";
    this.v._genericZoomHintEl.style.display = "flex";
  }
  public hideGenericZoomHint(): void {
    if (this.v._genericZoomHintEl) {
      this.v._genericZoomHintEl.style.display = "none";
    }
  }
  public hideAllZoomHints(): void {
    if (this.v._genericZoomHintEl) this.v._genericZoomHintEl.style.display = "none";
    if (this.v._txZoomHintEl) this.v._txZoomHintEl.style.display = "none";
    if (this.v._bamZoomHintEl) this.v._bamZoomHintEl.style.display = "none";
    if (this.v._bamReadsZoomHintEl)
      this.v._bamReadsZoomHintEl.style.display = "none";
    if (this.v._variantZoomHintEl) this.v._variantZoomHintEl.style.display = "none";
    if (this.v._seqZoomHintEl) this.v._seqZoomHintEl.style.display = "none";
    if (this.v._diamondMotifZoomHintEl)
      this.v._diamondMotifZoomHintEl.style.display = "none";
  }
}
