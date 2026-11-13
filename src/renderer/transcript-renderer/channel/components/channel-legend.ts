import type { ChannelView } from "../index";
import { COLORMAP_GRADIENTS } from "../../colors/color_map";

/**
 * Score legend / label for a channel: the compact score-range text, the
 * colorbar legend, and the RNA-modification score label. Reads channel
 * config + score-range state through the ChannelView back-reference.
 */
export class ChannelLegend {
  constructor(private readonly v: ChannelView) {}

  getScoreLabelText(): string | null {
    return this.v.scoreLabelEl?.textContent ?? null;
  }
  setLegendInfo(visible: boolean, style: "auto" | "text" | "colorbar"): void {
    this.v._legendVisible = visible;
    this.v._legendStyleOverride = style;
    // Also set on existing DOM elements for backwards compatibility
    if (this.v.scoreLabelEl) {
      this.v.scoreLabelEl.style.display = visible ? "" : "none";
      this.v.scoreLabelEl.setAttribute("data-legend-style", style);
    }
    if (this.v._modScoreLabelEl) {
      this.v._modScoreLabelEl.style.display = visible ? "" : "none";
      this.v._modScoreLabelEl.setAttribute("data-legend-style", style);
    }
    if (this.v._bamScoreLabelEl) {
      this.v._bamScoreLabelEl.style.display = visible ? "" : "none";
      this.v._bamScoreLabelEl.setAttribute("data-legend-style", style);
    }
  }
  refreshScoreLabels(): void {
    // Main score label
    if (this.v._lastScoreRange) {
      this.updateScoreLabel(this.v._lastScoreRange[0], this.v._lastScoreRange[1]);
    }
    // Modification score label
    this.updateModificationScoreLabel();
    // BAM coverage score label is re-rendered on next frame via markDirty

    // Propagate to sub-channels
    if (this.v._subChannels) {
      for (const sub of this.v._subChannels) {
        sub.setLegendInfo(this.v._legendVisible, this.v._legendStyleOverride);
        sub.refreshScoreLabels();
      }
    }
  }
  public updateScoreLabel(minScore: number, maxScore: number): void {
    // Store for later refresh (e.g. when legend style changes)
    this.v._lastScoreRange = [minScore, maxScore];

    const isScorePlot =
      this.v.config.plot === "bar" ||
      this.v.config.plot === "bigwig" ||
      this.v.config.plot === "line" ||
      this.v.config.plot === "point" ||
      this.v.config.plot === "heatmap" ||
      this.v.config.plot === "motif" ||
      this.v.config.plot === "score_rect" ||
      this.v.config.plot === "score_curve";

    // Diamond with a colormap foreground also gets a legend
    const isDiamondWithColormap =
      this.v.config.plot === "diamond" &&
      this.v.config.style?.foreground &&
      typeof this.v.config.style.foreground === "object" &&
      !Array.isArray(this.v.config.style.foreground) &&
      !!(this.v.config.style.foreground as any).colormap;

    if (!isScorePlot && !isDiamondWithColormap) return;

    // If the foreground config specifies an explicit range, use it for
    // the legend display — BUT only when group range is not active,
    // because the group shared range takes priority over everything.
    if (!this.v._groupScoreRange) {
      const fgCfgRange = this.v.config.style?.foreground;
      if (
        fgCfgRange &&
        typeof fgCfgRange === "object" &&
        !Array.isArray(fgCfgRange) &&
        Array.isArray((fgCfgRange as any).range)
      ) {
        const [cfgMin, cfgMax] = (fgCfgRange as any).range as [number, number];
        if (isFinite(cfgMin) && isFinite(cfgMax)) {
          minScore = cfgMin;
          maxScore = cfgMax;
        }
      }
    }

    // If trackContainer isn't mounted yet (sub-channel just created),
    // save the range and apply it once mount() is called.
    if (!this.v.trackContainer) {
      this.v._pendingScoreRange = [minScore, maxScore];
      return;
    }

    const fmt = (v: number) =>
      Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");

    // Detect colormap + reversed flag from foreground config
    const fgCfg = this.v.config.style?.foreground;
    const colormapName: string | undefined =
      fgCfg && typeof fgCfg === "object" && !Array.isArray(fgCfg)
        ? (fgCfg as any).colormap
        : undefined;
    const isReversed: boolean =
      fgCfg && typeof fgCfg === "object" && !Array.isArray(fgCfg)
        ? !!(fgCfg as any).reversed
        : false;

    if (!this.v.scoreLabelEl) {
      const el = document.createElement("div");
      el.className = "channel-score-label";
      el.style.cssText = [
        "position:absolute",
        "top:2px",
        "right:4px",
        "font-size:11px",
        "line-height:1",
        "font-family:monospace",
        "color:#555",
        "background:rgba(255,255,255,0.75)",
        "padding:1px 3px",
        "border-radius:2px",
        "pointer-events:none",
        "user-select:none",
        "white-space:nowrap",
      ].join(";");
      this.v.trackContainer.appendChild(el);
      this.v.scoreLabelEl = el;

      // Apply initial visibility from the global legend setting
      if (!this.v._legendVisible) {
        el.style.display = "none";
      }
    }

    // Use the instance-level legend style property (kept in sync by
    // renderer.setLegendStyle → channel.setLegendInfo)
    const legendStyleOverride = this.v._legendStyleOverride;

    // If legend is hidden globally, keep element but hide it
    if (!this.v._legendVisible) {
      this.v.scoreLabelEl.style.display = "none";
      return;
    }

    if (colormapName && legendStyleOverride !== "text") {
      // ── Compact colorbar legend: min ████████ max ──
      const rawColors =
        COLORMAP_GRADIENTS[colormapName as keyof typeof COLORMAP_GRADIENTS];
      if (rawColors && rawColors.length > 0) {
        // Reverse the color stops when the colormap is reversed
        const colors = isReversed ? [...rawColors].reverse() : rawColors;
        // Build CSS linear-gradient from the colormap stops
        const stops = colors
          .map(
            (c, i) => `${c} ${((i / (colors.length - 1)) * 100).toFixed(1)}%`,
          )
          .join(",");

        this.v.scoreLabelEl.style.display = "flex";
        this.v.scoreLabelEl.style.alignItems = "center";
        this.v.scoreLabelEl.style.gap = "2px";
        this.v.scoreLabelEl.textContent = "";
        this.v.scoreLabelEl.innerHTML =
          `<span style="flex-shrink:0">${fmt(minScore)}</span>` +
          `<span style="display:inline-block;width:40px;height:6px;` +
          `border-radius:1px;flex-shrink:0;` +
          `background:linear-gradient(to right,${stops})"></span>` +
          `<span style="flex-shrink:0">${fmt(maxScore)}</span>`;
        return;
      }
    }

    // ── Plain text fallback: [min, max] ──
    this.v.scoreLabelEl.style.display = "";
    this.v.scoreLabelEl.style.alignItems = "";
    this.v.scoreLabelEl.style.gap = "";
    this.v.scoreLabelEl.textContent = `[${fmt(minScore)}, ${fmt(maxScore)}]`;
  }
  public updateModificationScoreLabel(): void {
    const isTranscript =
      this.v.config.plot === "transcript" || this.v.config.plot === "rna";
    if (!isTranscript) return;

    // Only show when there are modification records
    if (!this.v._modificationRecords || this.v._modificationRecords.length === 0) {
      if (this.v._modScoreLabelEl) {
        this.v._modScoreLabelEl.style.display = "none";
      }
      return;
    }

    if (!this.v.trackContainer) return;

    const modCfg = this.v.config.style?.modification;
    const colorCfg = modCfg?.color;

    // Determine colormap name and range
    let colormapName: string | undefined;
    let rangeMin = 0;
    let rangeMax = 1;

    if (colorCfg && typeof colorCfg === "object" && !Array.isArray(colorCfg)) {
      colormapName = (colorCfg as any).colormap;
      const range = (colorCfg as any).range;
      if (Array.isArray(range) && range.length === 2) {
        rangeMin = range[0];
        rangeMax = range[1];
      }
    } else if (typeof colorCfg === "string") {
      // Solid colour – hide the modification colorbar
      if (this.v._modScoreLabelEl) {
        this.v._modScoreLabelEl.style.display = "none";
      }
      return;
    } else {
      // Default: coolwarm colormap with [0, 1] range
      colormapName = "coolwarm";
    }

    if (!colormapName) {
      if (this.v._modScoreLabelEl) {
        this.v._modScoreLabelEl.style.display = "none";
      }
      return;
    }

    const colors =
      COLORMAP_GRADIENTS[colormapName as keyof typeof COLORMAP_GRADIENTS];
    if (!colors || colors.length === 0) {
      if (this.v._modScoreLabelEl) {
        this.v._modScoreLabelEl.style.display = "none";
      }
      return;
    }

    // Create the DOM element if needed
    if (!this.v._modScoreLabelEl) {
      const el = document.createElement("div");
      el.className = "channel-score-label channel-mod-score-label";
      el.style.cssText = [
        "position:absolute",
        "top:16px",
        "right:4px",
        "font-size:10px",
        "line-height:1",
        "font-family:monospace",
        "color:#555",
        "background:rgba(255,255,255,0.75)",
        "padding:1px 3px",
        "border-radius:2px",
        "pointer-events:none",
        "user-select:none",
        "white-space:nowrap",
      ].join(";");
      this.v.trackContainer.appendChild(el);
      this.v._modScoreLabelEl = el;

      // Apply initial visibility from the global legend setting
      if (!this.v._legendVisible) {
        el.style.display = "none";
      }
    }

    // Use instance-level legend style property
    const legendStyleOverride = this.v._legendStyleOverride;

    // If legend is hidden globally, keep element but hide it
    if (!this.v._legendVisible) {
      this.v._modScoreLabelEl.style.display = "none";
      return;
    }

    const fmt = (v: number) =>
      Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");

    if (legendStyleOverride === "text") {
      // Force plain text mode
      this.v._modScoreLabelEl.style.display = "";
      this.v._modScoreLabelEl.style.alignItems = "";
      this.v._modScoreLabelEl.style.gap = "";
      this.v._modScoreLabelEl.textContent = `mod [${fmt(rangeMin)}, ${fmt(rangeMax)}]`;
      return;
    }

    const stops = colors
      .map((c, i) => `${c} ${((i / (colors.length - 1)) * 100).toFixed(1)}%`)
      .join(",");

    this.v._modScoreLabelEl.style.display = "flex";
    this.v._modScoreLabelEl.style.alignItems = "center";
    this.v._modScoreLabelEl.style.gap = "2px";
    this.v._modScoreLabelEl.innerHTML =
      `<span style="flex-shrink:0;font-size:9px;color:#888">mod</span>` +
      `<span style="flex-shrink:0">${fmt(rangeMin)}</span>` +
      `<span style="display:inline-block;width:30px;height:5px;` +
      `border-radius:1px;flex-shrink:0;` +
      `background:linear-gradient(to right,${stops})"></span>` +
      `<span style="flex-shrink:0">${fmt(rangeMax)}</span>`;
  }

  // --- Colormap metadata (used by export-manager for legends) ---
  getModificationColormapInfo(): {
    colormap: string;
    min: number;
    max: number;
  } | null {
    const isTranscript =
      this.v.config.plot === "transcript" || this.v.config.plot === "rna";
    if (!isTranscript) return null;
    if (!this.v._modificationRecords || this.v._modificationRecords.length === 0)
      return null;

    const modCfg = this.v.config.style?.modification;
    const colorCfg = modCfg?.color;

    let colormapName: string | undefined;
    let rangeMin = 0;
    let rangeMax = 1;

    if (colorCfg && typeof colorCfg === "object" && !Array.isArray(colorCfg)) {
      colormapName = (colorCfg as any).colormap;
      const range = (colorCfg as any).range;
      if (Array.isArray(range) && range.length === 2) {
        rangeMin = range[0];
        rangeMax = range[1];
      }
    } else if (typeof colorCfg === "string") {
      return null; // solid colour
    } else {
      colormapName = "coolwarm";
    }

    if (!colormapName) return null;
    return { colormap: colormapName, min: rangeMin, max: rangeMax };
  }

  /**
   * Return BAM coverage colorbar info for export.
   * Returns null when BAM coverage doesn't use a colormap.
   */
  getBamCoverageColormapInfo(): {
    colormap: string;
    min: number;
    max: number;
  } | null {
    if (this.v.config.plot !== "bam") return null;
    if (!this.v.isBamCoverageEnabled()) return null;
    const covMax = this.v._bamCoverageMax;
    if (covMax <= 0) return null;

    const cov = this.v.config.style?.coverage;
    const covColor = cov && typeof cov === "object" ? cov.color : undefined;
    const colormapName: string | undefined =
      covColor && typeof covColor === "object"
        ? (covColor as any).colormap
        : undefined;
    if (!colormapName) return null;
    return { colormap: colormapName, min: 0, max: covMax };
  }

  /**
   * Return colormap info for export: the colormap name plus the displayed
   * score range.  Returns null when the channel doesn't use a colormap.
   */
  getColormapInfo(): {
    colormap: string;
    min: number;
    max: number;
    reversed?: boolean;
  } | null {
    const fgCfg = this.v.config.style?.foreground;
    const colormapName =
      fgCfg && typeof fgCfg === "object" && !Array.isArray(fgCfg)
        ? (fgCfg as any).colormap
        : undefined;
    if (!colormapName) return null;

    const reversed =
      fgCfg && typeof fgCfg === "object" && !Array.isArray(fgCfg)
        ? !!(fgCfg as any).reversed
        : false;

    // If the config specifies an explicit range, prefer it
    if (
      fgCfg &&
      typeof fgCfg === "object" &&
      !Array.isArray(fgCfg) &&
      Array.isArray((fgCfg as any).range)
    ) {
      const [cfgMin, cfgMax] = (fgCfg as any).range as [number, number];
      if (isFinite(cfgMin) && isFinite(cfgMax)) {
        return { colormap: colormapName, min: cfgMin, max: cfgMax, reversed };
      }
    }

    // Read the score range that's currently displayed
    if (this.v._globalScoreRange) {
      return {
        colormap: colormapName,
        min: this.v._globalScoreRange[0],
        max: this.v._globalScoreRange[1],
        reversed,
      };
    }
    if (this.v._pendingScoreRange) {
      return {
        colormap: colormapName,
        min: this.v._pendingScoreRange[0],
        max: this.v._pendingScoreRange[1],
        reversed,
      };
    }

    // Use the last stored score range (set by updateScoreLabel)
    if (this.v._lastScoreRange) {
      return {
        colormap: colormapName,
        min: this.v._lastScoreRange[0],
        max: this.v._lastScoreRange[1],
        reversed,
      };
    }

    // Try parsing from the DOM element text content (e.g. "0 36.84")
    const txt = this.v.scoreLabelEl?.textContent;
    if (txt) {
      const nums = txt.match(/-?[\d.]+/g);
      if (nums && nums.length >= 2) {
        return {
          colormap: colormapName,
          min: parseFloat(nums[0]),
          max: parseFloat(nums[nums.length - 1]),
          reversed,
        };
      }
    }
    return null;
  }
}
