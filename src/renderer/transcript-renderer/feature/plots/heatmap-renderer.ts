import { mapValueToColor, type ColorMapName } from "../../colors/colors";
import type { IFeatureColorConfig } from "../../colors/colors";
import type { PlotBuildCtx } from "./color";

export function heatmapColor(
  score: number,
  colors: IFeatureColorConfig | undefined,
  resolveRange: (base: [number, number] | undefined) => [number, number],
  maxValue: number | undefined,
): [number, number, number] {
  if (colors?.colormap) {
    return mapValueToColor(
      score,
      colors.colormap as ColorMapName,
      resolveRange(colors.range),
    );
  }
  // Default: grayscale intensity from score
  const norm =
    maxValue && maxValue > 0 ? maxValue : (colors?.range?.[1] ?? 100);
  const intensity = Math.min(1.0, Math.max(0, score) / norm);
  return [intensity, intensity, intensity];
}

export function buildHeatmapInstance(
  record: any,
  recStart: number,
  recWidth: number,
  _r: number,
  _g: number,
  _b: number,
  instanceCount: number,
  ctx: PlotBuildCtx,
): number {
  const score = record.score || 0;
  const [hmR, hmG, hmB] = heatmapColor(
    score,
    ctx.colors,
    ctx.resolveRange,
    ctx.maxValue,
  );

  const base = instanceCount * 4;
  ctx.rectArray[base] = recStart;
  ctx.rectArray[base + 1] = 0; // top of track
  ctx.rectArray[base + 2] = recWidth;
  ctx.rectArray[base + 3] = 1.0; // full track height
  ctx.colorArray[base] = hmR;
  ctx.colorArray[base + 1] = hmG;
  ctx.colorArray[base + 2] = hmB;
  ctx.colorArray[base + 3] = ctx.baseAlpha;
  return instanceCount + 1;
}
