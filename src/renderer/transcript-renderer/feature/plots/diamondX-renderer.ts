import type { PlotBuildCtx } from "./color";

export function buildDiamondXInstance(
  _record: any,
  recStart: number,
  recWidth: number,
  r: number,
  g: number,
  b: number,
  instanceCount: number,
  ctx: PlotBuildCtx,
): number {
  const base = instanceCount * 4;
  ctx.rectArray[base] = recStart;
  ctx.rectArray[base + 1] = 0.4;
  ctx.rectArray[base + 2] = recWidth;
  ctx.rectArray[base + 3] = 0.2;
  ctx.colorArray[base] = r;
  ctx.colorArray[base + 1] = g;
  ctx.colorArray[base + 2] = b;
  ctx.colorArray[base + 3] = ctx.baseAlpha;
  return instanceCount + 1;
}
