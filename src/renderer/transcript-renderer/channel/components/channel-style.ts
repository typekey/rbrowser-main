import type { ChannelView } from "../index";

/**
 * Channel style resolution: turns the channel config's foreground /
 * background / padding declarations into the concrete colours, RGBA
 * tuples and padding ratios the renderer consumes. Pure derivations of
 * config (plus the padding ratios it writes back to ChannelView).
 */
export class ChannelStyle {
  constructor(private readonly v: ChannelView) {}

  public extractForegroundColor(): string {
    const styleForeground = this.v.config.style?.foreground;

    // Case 1: String color
    if (typeof styleForeground === "string") {
      return styleForeground;
    }

    // Case 2: Array of colors (use first one)
    if (Array.isArray(styleForeground) && styleForeground.length > 0) {
      return styleForeground[0];
    }

    // Case 3: Object with colormap or undefined - return default
    return "#747d8c";
  }

  /**
   * Extract background color from style.background.
   *
   * @returns The background color, defaults to #ffffff
   */
  public extractBackgroundColor(): string {
    return this.v.config.style?.background || "#ffffff";
  }

  /**
   * Convert hex color to RGBA array (0-1 range)
   * @param hex - Hex color string (e.g., "#ff0000" or "#f00")
   * @returns [r, g, b, a] array with values 0-1
   */
  public hexToRgba(hex: string): [number, number, number, number] {
    // Remove # if present
    hex = hex.replace(/^#/, "");

    // Handle 3-digit hex
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }

    // Parse RGB
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1.0;

    return [r, g, b, a];
  }

  /**
   * Get default padding based on plot type
   * @returns padding string like '0.2 0.1' or '0.2'
   */
  public getDefaultPadding(): string {
    const plot = this.v.config.plot;
    if (plot === "bar" || plot === "line" || plot === "point") return "0.1 0";
    if (plot === "rect") return "0.2";
    if (plot === "heatmap" || plot === "diamond" || plot === "score_rect")
      return "0";
    if (plot === "transcript" || plot === "rna" || plot === "simple_rna")
      return "0";
    if (plot === "score_curve") return "0";
    if (plot === "motif") return "0";
    return "0.2"; // default for other plot types
  }

  /**
   * Parse padding string into top and bottom ratios
   * Format: '0.2 0.1' (top bottom) or '0.2' (both)
   */
  public parsePadding(): void {
    const paddingStr = this.v.config.style?.padding || this.getDefaultPadding();
    const parts = paddingStr.trim().split(/\s+/);

    if (parts.length === 1) {
      // Single value: apply to both top and bottom
      const value = parseFloat(parts[0]);
      this.v.paddingTop = isNaN(value) ? 0 : value;
      this.v.paddingBottom = this.v.paddingTop;
    } else if (parts.length >= 2) {
      // Two values: top and bottom
      const top = parseFloat(parts[0]);
      const bottom = parseFloat(parts[1]);
      this.v.paddingTop = isNaN(top) ? 0 : top;
      this.v.paddingBottom = isNaN(bottom) ? 0 : bottom;
    } else {
      // Invalid format, use defaults
      this.v.paddingTop = 0;
      this.v.paddingBottom = 0;
    }
  }

  /**
   * Convert style.foreground to the format expected by FeatureRenderer.updateData.
   * Handles conversion from string/array formats to object format.
   * For diamond plots, also forwards _keys and _sep from channel style
   * so that updateData can parse record.rest for data-driven mappings.
   *
   * @returns Color configuration object or undefined
   */
  public normalizeColorsForRenderer():
    | {
        colormap?: string;
        range?: [number, number];
        reversed?: boolean;
        custom?: { [key: string]: string };
        alpha?: number;
        colorBy?: string;
        sizeBy?: string;
        sizeRange?: [number, number];
        alphaBy?: string;
        alphaRange?: [number, number];
        _keys?: string[];
        _sep?: string;
      }
    | undefined {
    const styleForeground = this.v.config.style?.foreground;

    // Case 1: Already an object (colormap config) - use as-is
    if (
      styleForeground &&
      typeof styleForeground === "object" &&
      !Array.isArray(styleForeground)
    ) {
      // Forward keys/sep for diamond data-driven field parsing
      const result = { ...styleForeground } as any;
      if (this.v.config.style?.keys) {
        result._keys = this.v.config.style.keys;
      }
      if (this.v.config.style?.sep) {
        result._sep = this.v.config.style.sep;
      }
      return result;
    }

    // Case 2: String or Array - these are handled via defaultColor parameter
    // Return undefined to let FeatureRenderer use defaultColor
    return undefined;
  }
}
