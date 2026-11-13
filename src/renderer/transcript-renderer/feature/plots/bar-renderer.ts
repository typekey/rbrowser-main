import { scoreColor, type PlotBuildCtx } from "./color";

/**
 * Bar / bigwig plot: a value-driven bar growing up from the lane baseline.
 *
 * Height is `score / norm` (clamped 0..1), where `norm` is the dynamic data
 * max, else the colormap range upper bound, else 100. Colour comes from the
 * colormap when configured, otherwise the caller-provided (r, g, b).
 *
 * @returns the new instance count.
 */
export function buildBarInstance(
  record: any,
  recStart: number,
  recWidth: number,
  r: number,
  g: number,
  b: number,
  instanceCount: number,
  ctx: PlotBuildCtx,
): number {
  const score = record.score || 0;
  const [barR, barG, barB] = scoreColor(
    score,
    r,
    g,
    b,
    ctx.colors,
    ctx.resolveRange,
  );
  // Normalise bar height by the dynamic max of the current visible data.
  // Fall back to the colormap range upper bound, then 100, so that a
  // channel with no data yet still renders sensibly.
  const norm =
    ctx.maxValue && ctx.maxValue > 0
      ? ctx.maxValue
      : (ctx.colors?.range?.[1] ?? 100);
  const height = Math.min(1.0, Math.max(0, score) / norm);
  const base = instanceCount * 4;
  ctx.rectArray[base] = recStart;
  ctx.rectArray[base + 1] = 1.0 - height;
  ctx.rectArray[base + 2] = recWidth;
  ctx.rectArray[base + 3] = height;
  ctx.colorArray[base] = barR;
  ctx.colorArray[base + 1] = barG;
  ctx.colorArray[base + 2] = barB;
  ctx.colorArray[base + 3] = ctx.baseAlpha;
  return instanceCount + 1;
}
