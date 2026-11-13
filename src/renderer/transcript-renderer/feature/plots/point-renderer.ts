import { scoreColor, type PlotBuildCtx } from "./color";

export function buildPointInstance(
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
  const norm =
    ctx.maxValue && ctx.maxValue > 0
      ? ctx.maxValue
      : (ctx.colors?.range?.[1] ?? 100);
  const yNorm = 1.0 - Math.min(1.0, Math.max(0, score) / norm);

  const [ptR, ptG, ptB] = scoreColor(
    score,
    r,
    g,
    b,
    ctx.colors,
    ctx.resolveRange,
  );

  const base = instanceCount * 4;
  ctx.rectArray[base] = recStart;
  ctx.rectArray[base + 1] = yNorm;
  ctx.rectArray[base + 2] = recWidth;
  ctx.rectArray[base + 3] = 0.015; // thin segment (1.5% of track height)
  ctx.colorArray[base] = ptR;
  ctx.colorArray[base + 1] = ptG;
  ctx.colorArray[base + 2] = ptB;
  ctx.colorArray[base + 3] = ctx.baseAlpha;
  return instanceCount + 1;
}
