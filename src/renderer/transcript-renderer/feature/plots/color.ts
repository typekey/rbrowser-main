import {
  mapValueToColor,
  SequentialScale,
  type ColorMapName,
} from "../../colors/colors";
import type { IFeatureColorConfig } from "../../colors/colors";

/**
 * Resolve an instance colour from a score: the colormap colour when a colormap
 * is configured, otherwise the caller-provided fallback (r, g, b).
 *
 * Shared by the bar / point plots' geometry builders and by the colour-only
 * `refreshColorsOnly` path, so both stay in lock-step.
 */
export function scoreColor(
  score: number,
  r: number,
  g: number,
  b: number,
  colors: IFeatureColorConfig | undefined,
  resolveRange: (base: [number, number] | undefined) => [number, number],
): [number, number, number] {
  if (colors?.colormap) {
    return mapValueToColor(
      score,
      colors.colormap as ColorMapName,
      resolveRange(colors.range),
    );
  }
  return [r, g, b];
}

/**
 * Pre-computed diamond data-driven **colour** context (colorBy + alphaBy only —
 * sizeBy is geometry and handled during `updateData`). Built once before the
 * `refreshColorsOnly` loop, replacing the previous per-instance lazy-init that
 * stashed state on the renderer via `(this as any)._rc*`.
 */
export interface DiamondColorCtx {
  active: boolean;
  sep?: string;
  colorByIdx: number;
  alphaByIdx: number;
  scale: SequentialScale | null;
  alphaRange: [number, number];
  effRange: [number, number];
  rangeDenom: number;
}

/** Build the diamond colour context from the channel colour config. */
export function makeDiamondColorCtx(
  colors: IFeatureColorConfig | undefined,
): DiamondColorCtx {
  const ctx: DiamondColorCtx = {
    active: false,
    sep: colors?._sep,
    colorByIdx: -1,
    alphaByIdx: -1,
    scale: null,
    alphaRange: [0.1, 1],
    effRange: [0, 1],
    rangeDenom: 1,
  };
  if (colors && (colors.colorBy || colors.alphaBy) && colors._keys && colors._sep) {
    const ck = colors._keys;
    ctx.active = true;
    ctx.colorByIdx = colors.colorBy ? ck.indexOf(colors.colorBy) : -1;
    ctx.alphaByIdx = colors.alphaBy ? ck.indexOf(colors.alphaBy) : -1;
    ctx.effRange = colors.range ?? [0, 1];
    ctx.rangeDenom = ctx.effRange[1] - ctx.effRange[0] || 1;
    ctx.alphaRange = colors.alphaRange ?? [0.1, 1];
    if (colors.colorBy && colors.colormap) {
      ctx.scale = new SequentialScale(
        colors.colormap as ColorMapName,
        colors.reversed ? [ctx.effRange[1], ctx.effRange[0]] : ctx.effRange,
      );
    }
  }
  return ctx;
}

/**
 * Resolve a diamond record's colour + alpha into `out` (`[r, g, b, a]`),
 * starting from the fallback (r, g, b, baseAlpha) and applying the data-driven
 * colorBy / alphaBy mappings when active. Rect and other non-diamond types
 * pass an inactive ctx and get the plain fallback.
 */
export function diamondColorInto(
  out: [number, number, number, number],
  record: any,
  r: number,
  g: number,
  b: number,
  baseAlpha: number,
  ctx: DiamondColorCtx,
): void {
  out[0] = r;
  out[1] = g;
  out[2] = b;
  out[3] = baseAlpha;
  if (!ctx.active || !ctx.sep || !record.rest) return;

  const tokens = record._tokens ?? record.rest.split(ctx.sep);

  if (ctx.colorByIdx >= 0 && ctx.colorByIdx < tokens.length && ctx.scale) {
    const v = +tokens[ctx.colorByIdx];
    if (v === v) {
      const [cr, cg, cb] = ctx.scale.getColor(v);
      out[0] = cr;
      out[1] = cg;
      out[2] = cb;
    }
  }

  if (ctx.alphaByIdx >= 0 && ctx.alphaByIdx < tokens.length) {
    const v = +tokens[ctx.alphaByIdx];
    if (v === v) {
      const t = Math.min(
        1,
        Math.max(0, (v - ctx.effRange[0]) / ctx.rangeDenom),
      );
      out[3] = ctx.alphaRange[0] + t * (ctx.alphaRange[1] - ctx.alphaRange[0]);
    }
  }
}

/**
 * Pre-computed data-driven mapping context for the diamond plot, built once
 * per `updateData` call so the per-record hot loop never re-parses field
 * indices or re-constructs a colour scale.
 */
export interface DiamondCtx {
  hasDataDriven: boolean;
  colorByIdx: number;
  scale: SequentialScale | null;
  sizeByIdx: number;
  sizeRange: [number, number];
  alphaByIdx: number;
  alphaRange: [number, number];
  effectiveRange: [number, number];
  rangeDenom: number;
}

/**
 * Shared context for plot geometry builders, created once per `updateData`
 * call (after the instance buffers have been grown). Each builder fills a
 * slice of the shared typed arrays for one record and returns the new
 * instance count.
 *
 * The object is built once and reused across every record in the loop, so
 * builders add no per-record allocation.
 */
export interface PlotBuildCtx {
  /** Instance rect buffer: [start_bp, y_frac, width_bp, height_frac] × N. */
  rectArray: Float32Array;
  /** Instance colour buffer: [r, g, b, a] × N. */
  colorArray: Float32Array;
  /** Base alpha applied to every instance (0..1). */
  baseAlpha: number;
  /** Colour/data-mapping config from the channel style. */
  colors?: IFeatureColorConfig;
  /** Dynamic max of the visible data, used to normalise bar/point heights. */
  maxValue?: number;
  /** Resolve the effective [min, max] range (swapped when `reversed`). */
  resolveRange: (base: [number, number] | undefined) => [number, number];
  /** True when sequence bases should be complemented (− strand view). */
  complementMode: boolean;
  /** Data-driven mapping context (only read by the diamond plot). */
  diamond: DiamondCtx;
}
