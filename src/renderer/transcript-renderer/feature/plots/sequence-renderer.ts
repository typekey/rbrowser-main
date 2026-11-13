import type { PlotBuildCtx } from "./color";

export function buildSequenceInstance(
  record: any,
  recStart: number,
  recWidth: number,
  _r: number,
  _g: number,
  _b: number,
  instanceCount: number,
  ctx: PlotBuildCtx,
): number {
  let base_char = (record.base || "N").toUpperCase();
  if (ctx.complementMode) {
    switch (base_char) {
      case "A":
        base_char = "T";
        break;
      case "T":
        base_char = "A";
        break;
      case "G":
        base_char = "C";
        break;
      case "C":
        base_char = "G";
        break;
    }
  }
  let sR = 0.6,
    sG = 0.6,
    sB = 0.6; // default for N / unknown

  switch (base_char) {
    case "A":
      sR = 0x2e / 255;
      sG = 0xd5 / 255;
      sB = 0x73 / 255;
      break;
    case "T":
      sR = 0xff / 255;
      sG = 0x47 / 255;
      sB = 0x57 / 255;
      break;
    case "C":
      sR = 0x3d / 255;
      sG = 0xc1 / 255;
      sB = 0xd3 / 255;
      break;
    case "G":
      sR = 0xf5 / 255;
      sG = 0xcd / 255;
      sB = 0x79 / 255;
      break;
  }

  const base = instanceCount * 4;
  ctx.rectArray[base] = recStart;
  ctx.rectArray[base + 1] = 0.0; // full height
  ctx.rectArray[base + 2] = recWidth;
  ctx.rectArray[base + 3] = 1.0;
  ctx.colorArray[base] = sR;
  ctx.colorArray[base + 1] = sG;
  ctx.colorArray[base + 2] = sB;
  ctx.colorArray[base + 3] = ctx.baseAlpha;
  return instanceCount + 1;
}
