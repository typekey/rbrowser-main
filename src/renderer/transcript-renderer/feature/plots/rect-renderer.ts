import type { PlotBuildCtx } from "./color";

export function buildRectInstance(
  record: any,
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
  ctx.rectArray[base + 1] = 0.1;
  ctx.rectArray[base + 2] = recWidth;
  ctx.rectArray[base + 3] = 0.8;
  // Allow features to carry an explicit hex `color` field (e.g. from
  // parseBuiltInData featureType colouring). Fall back to default.
  let rectR = r,
    rectG = g,
    rectB = b;
  if (record.color && typeof record.color === "string") {
    const hx = record.color.replace("#", "");
    if (hx.length === 6) {
      rectR = parseInt(hx.slice(0, 2), 16) / 255;
      rectG = parseInt(hx.slice(2, 4), 16) / 255;
      rectB = parseInt(hx.slice(4, 6), 16) / 255;
    }
  }
  ctx.colorArray[base] = rectR;
  ctx.colorArray[base + 1] = rectG;
  ctx.colorArray[base + 2] = rectB;
  ctx.colorArray[base + 3] = ctx.baseAlpha;
  return instanceCount + 1;
}
