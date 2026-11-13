/**
 * Color mapping utilities - D3-style color scales
 * Provides methods for mapping numerical values to colors using gradients or discrete values
 */

import { COLORMAP_GRADIENTS } from "./color_map";
import { logger } from "../utils/logger";

export type ColorMapName = keyof typeof COLORMAP_GRADIENTS;

/** Parse hex color to RGB array [0-1]. */
export function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    logger.warn(`Invalid hex color: ${hex}`);
    return [0, 0, 0];
  }
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
  ];
}

/**
 * Parse a hex colour into a normalised `{ r, g, b }` object (0–1). Falls back
 * to white on an unparseable value — used for the WebGL background clear, where
 * an invalid colour should read as blank rather than black.
 */
export function hexToRgbBackground(hex: string): {
  r: number;
  g: number;
  b: number;
} {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : { r: 1, g: 1, b: 1 };
}

/**
 * Pick a contrast-safe chevron / arrow colour to overlay on a feature fill.
 *
 * Strand-direction arrows are stamped on top of rect / CDS / UTR fills whose
 * luminance varies wildly (CDS `#3867d6` is dark, UTR `#ced6e0` is near-white).
 * A single hard-coded white loses contrast on the light fills and a hard-coded
 * black loses contrast on the dark ones — neither works alone. We compute the
 * fill's WCAG relative luminance and return white-ish for dark fills and
 * near-black for light fills.
 *
 * Accepts `#rgb`, `#rrggbb`, or `#rrggbbaa` (alpha is ignored). Unknown input
 * → white default, on the assumption that most channel themes lean dark.
 */
export function pickStrandArrowColor(
  fill: string | null | undefined,
): string {
  const LIGHT_ARROW = "rgba(255,255,255,0.9)";
  const DARK_ARROW = "rgba(33,33,33,0.8)";
  if (typeof fill !== "string") return LIGHT_ARROW;

  const h = fill.startsWith("#") ? fill.slice(1) : fill;
  let r: number, g: number, b: number;
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length === 6 || h.length === 8) {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    return LIGHT_ARROW;
  }
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return LIGHT_ARROW;

  // WCAG relative luminance.
  const toLin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  // Threshold tuned so the default exon gray (#a4b0be, L≈0.39) and CDS dark
  // blue (#3867d6, L≈0.16) both pick the light arrow, while UTR light gray
  // (#ced6e0, L≈0.65) picks the dark arrow.
  return L < 0.5 ? LIGHT_ARROW : DARK_ARROW;
}

/** Interpolate between two RGB colors. */
function interpolateRgb(
  color1: [number, number, number],
  color2: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    color1[0] + (color2[0] - color1[0]) * t,
    color1[1] + (color2[1] - color1[1]) * t,
    color1[2] + (color2[2] - color1[2]) * t,
  ];
}

/**
 * D3-style sequential color scale
 * Maps a continuous value from [domain[0], domain[1]] to a color gradient
 */
export class SequentialScale {
  private domain: [number, number];
  private colors: [number, number, number][];
  private clamp: boolean;

  /**
   * Cache: parsed RGB arrays keyed by colormap name.
   * Avoids re-running hexToRgb (regex) on every SequentialScale construction.
   * Colormaps are static, so the cache is valid for the lifetime of the app.
   */
  private static _rgbCache = new Map<string, [number, number, number][]>();

  constructor(
    colorMapName: ColorMapName,
    domain: [number, number] = [0, 1],
    clamp: boolean = true,
  ) {
    this.domain = domain;
    this.clamp = clamp;

    // Convert hex colors to RGB (cached per colormap name)
    let rgbColors = SequentialScale._rgbCache.get(colorMapName);
    if (!rgbColors) {
      const hexColors = COLORMAP_GRADIENTS[colorMapName];
      rgbColors = hexColors.map(hexToRgb);
      SequentialScale._rgbCache.set(colorMapName, rgbColors);
    }
    this.colors = rgbColors;
  }

  /** Get color for a given value. */
  getColor(value: number): [number, number, number] {
    let t = (value - this.domain[0]) / (this.domain[1] - this.domain[0]);

    if (this.clamp) {
      t = Math.max(0, Math.min(1, t));
    }

    const maxIndex = this.colors.length - 1;
    const position = t * maxIndex;
    const index = Math.floor(position);
    const fraction = position - index;

    if (index < 0) return this.colors[0];
    if (index >= maxIndex) return this.colors[maxIndex];

    return interpolateRgb(this.colors[index], this.colors[index + 1], fraction);
  }

  /** Update domain. */
  setDomain(domain: [number, number]): void {
    this.domain = domain;
  }

  /** Get current domain. */
  getDomain(): [number, number] {
    return this.domain;
  }
}

/**
 * D3-style ordinal color scale
 * Maps discrete values to specific colors
 */
export class OrdinalScale {
  private mapping: Map<string, [number, number, number]>;
  private defaultColor: [number, number, number];

  constructor(
    mapping: { [key: string]: string },
    defaultColor: string = "#808080",
  ) {
    this.mapping = new Map();
    this.defaultColor = hexToRgb(defaultColor);

    for (const [key, hexColor] of Object.entries(mapping)) {
      this.mapping.set(key, hexToRgb(hexColor));
    }
  }

  /** Get color for a given key. */
  getColor(key: string): [number, number, number] {
    return this.mapping.get(key) || this.defaultColor;
  }

  /** Add or update a color mapping. */
  setColor(key: string, hexColor: string): void {
    this.mapping.set(key, hexToRgb(hexColor));
  }

  /** Check if a key exists. */
  hasColor(key: string): boolean {
    return this.mapping.has(key);
  }
}

/**
 * D3-style threshold color scale
 * Maps values to colors based on thresholds
 */
export class ThresholdScale {
  private thresholds: number[];
  private colors: [number, number, number][];

  constructor(thresholds: number[], hexColors: string[]) {
    if (hexColors.length !== thresholds.length + 1) {
      throw new Error(
        "ThresholdScale requires colors.length = thresholds.length + 1",
      );
    }

    this.thresholds = [...thresholds].sort((a, b) => a - b);
    this.colors = hexColors.map(hexToRgb);
  }

  /** Get color for a given value. */
  getColor(value: number): [number, number, number] {
    for (let i = 0; i < this.thresholds.length; i++) {
      if (value < this.thresholds[i]) {
        return this.colors[i];
      }
    }
    return this.colors[this.colors.length - 1];
  }
}

/** Create a sequential scale. */
export function createSequentialScale(
  colorMapName: ColorMapName,
  domain: [number, number] = [0, 1],
): SequentialScale {
  return new SequentialScale(colorMapName, domain);
}

/** Create an ordinal scale. */
export function createOrdinalScale(
  mapping: { [key: string]: string },
  defaultColor?: string,
): OrdinalScale {
  return new OrdinalScale(mapping, defaultColor);
}

/** Create a threshold scale. */
export function createThresholdScale(
  thresholds: number[],
  colors: string[],
): ThresholdScale {
  return new ThresholdScale(thresholds, colors);
}

/** Quick color mapper for simple use cases. Returns [r, g, b] with each component 0-1. */
export function mapValueToColor(
  value: number,
  colorMapName: ColorMapName,
  range: [number, number] = [0, 1],
): [number, number, number] {
  const scale = new SequentialScale(colorMapName, range);
  return scale.getColor(value);
}

/** Batch color mapping for arrays (optimized). */
export function mapValuesToColors(
  values: number[],
  colorMapName: ColorMapName,
  range: [number, number] = [0, 1],
): [number, number, number][] {
  const scale = new SequentialScale(colorMapName, range);
  return values.map((v) => scale.getColor(v));
}

// ── Feature colour config + transcript-part styling ─────────────────────────
// (Consolidated here from the former feature/feature-colors.ts.)

/**
 * Colour/data-mapping configuration passed from the channel layer.
 * The diamond-specific fields (colorBy, sizeBy, alphaBy, etc.) are only
 * used by the diamond plot branch in updateData / refreshColorsOnly.
 */
export interface IFeatureColorConfig {
  colormap?: string;
  range?: [number, number];
  reversed?: boolean;
  custom?: { [key: string]: string };
  /** Base alpha (opacity) for all rendered instances. Default 1 (fully opaque). */
  alpha?: number;
  // ── Diamond-specific data-driven mappings ──
  colorBy?: string;
  sizeBy?: string;
  sizeRange?: [number, number];
  alphaBy?: string;
  alphaRange?: [number, number];
  // keys/sep forwarded from channel style so updateData can parse record.rest
  _keys?: string[];
  _sep?: string;
}

/**
 * Transcript part-type styling table. To change the appearance of any part
 * (colour / height fraction / draw order), edit only this table.
 * - **height**: fraction of lane height (larger = taller)
 * - **order** : draw priority — lower is drawn first (behind), higher on top.
 */
export const TX_PART_CONFIG: Record<
  string,
  { color: string; height: number; order: number }
> = {
  exon: { color: "#a4b0be", height: 0.5, order: 0 },
  CDS: { color: "#747d8c", height: 0.5, order: 1 },
  start_codon: { color: "#2ed573", height: 0.5, order: 1 },
  five_prime_UTR: { color: "#ced6e0", height: 0.5, order: 2 },
  three_prime_UTR: { color: "#ced6e0", height: 0.5, order: 2 },
  stop_codon: { color: "#ff4757", height: 0.5, order: 2 },
};

/** Fallback for unknown part types. */
export const TX_DEFAULT_CONFIG = {
  color: "#747d8e",
  height: 0.38,
  order: 1,
};

/** Intron backbone colour (hex). */
export const TX_INTRON_COLOR_HEX = "#b0b0b0";

// ── Pre-computed caches (built once from TX_PART_CONFIG) ─────────────
/** Pre-computed type → [r,g,b] map. */
const _txColorCache: Map<string, [number, number, number]> = (() => {
  const m = new Map<string, [number, number, number]>();
  for (const [type, cfg] of Object.entries(TX_PART_CONFIG)) {
    m.set(type, hexToRgb(cfg.color));
  }
  return m;
})();

/** Pre-computed default colour (float). */
export const txDefaultColor: [number, number, number] = hexToRgb(
  TX_DEFAULT_CONFIG.color,
);

/** Pre-computed intron backbone colour (float). */
export const txIntronColor: [number, number, number] =
  hexToRgb(TX_INTRON_COLOR_HEX);

/** Lookup part-type colour (from pre-computed cache, zero allocation). */
export function txPartColor(type: string): [number, number, number] {
  return _txColorCache.get(type) ?? txDefaultColor;
}

/**
 * Lookup part-type colour as a hex string (`#rrggbb`). Mirrors
 * txPartColor but returns the original config-string form so
 * callers that need to feed downstream APIs (e.g. luminance-based contrast
 * pickers like `pickStrandArrowColor`) don't have to round-trip floats.
 */
export function txPartHexColor(type: string): string {
  return TX_PART_CONFIG[type]?.color ?? TX_DEFAULT_CONFIG.color;
}

/** Return the height fraction for a transcript part type. */
export function txPartHeightFrac(type: string): number {
  return (TX_PART_CONFIG[type] ?? TX_DEFAULT_CONFIG).height;
}

/** Draw order: lower = drawn first (behind), higher = on top. */
export function txPartOrder(type: string): number {
  return (TX_PART_CONFIG[type] ?? TX_DEFAULT_CONFIG).order;
}
