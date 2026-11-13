import type { PlotBuildCtx } from "./color";

export function buildDiamondInstance(
  record: any,
  recStart: number,
  recWidth: number,
  r: number,
  g: number,
  b: number,
  instanceCount: number,
  ctx: PlotBuildCtx,
): number {
  // Data center stays at the true geometric midpoint (chromStart + 0.5 for
  // 1-bp BED features). Diamond renders at this true center to align with
  // axis ticks which are drawn at base centers (genomicPos + 0.5).
  const midBp = recStart + recWidth * 0.5;

  const dm = ctx.diamond;
  let dR = r,
    dG = g,
    dB = b,
    dA = ctx.baseAlpha,
    sizeMul = 1.0;

  if (dm.hasDataDriven && ctx.colors!._sep && record.rest) {
    const tokens = record._tokens ?? record.rest.split(ctx.colors!._sep!);

    // colorBy: map value through colormap (uses pre-created scale)
    if (dm.colorByIdx >= 0 && dm.colorByIdx < tokens.length && dm.scale) {
      const v = +tokens[dm.colorByIdx]; // faster than parseFloat
      if (v === v) {
        // NaN check (v !== v when NaN)
        const [cr, cg, cb] = dm.scale.getColor(v);
        dR = cr;
        dG = cg;
        dB = cb;
      }
    }

    // sizeBy: linearly map value to sizeRange
    if (dm.sizeByIdx >= 0 && dm.sizeByIdx < tokens.length) {
      const v = +tokens[dm.sizeByIdx];
      if (v === v) {
        const t = Math.min(
          1,
          Math.max(0, (v - dm.effectiveRange[0]) / dm.rangeDenom),
        );
        sizeMul = dm.sizeRange[0] + t * (dm.sizeRange[1] - dm.sizeRange[0]);
      }
    }

    // alphaBy: linearly map value to alphaRange
    if (dm.alphaByIdx >= 0 && dm.alphaByIdx < tokens.length) {
      const v = +tokens[dm.alphaByIdx];
      if (v === v) {
        const t = Math.min(
          1,
          Math.max(0, (v - dm.effectiveRange[0]) / dm.rangeDenom),
        );
        dA = dm.alphaRange[0] + t * (dm.alphaRange[1] - dm.alphaRange[0]);
      }
    }
  }

  const base = instanceCount * 4;
  ctx.rectArray[base] = midBp; // center X in bp offset
  ctx.rectArray[base + 1] = 0.5; // center Y (middle of track)
  ctx.rectArray[base + 2] = 0; // score filled in by finalizeDiamondScores
  ctx.rectArray[base + 3] = sizeMul; // per-instance size multiplier
  ctx.colorArray[base] = dR;
  ctx.colorArray[base + 1] = dG;
  ctx.colorArray[base + 2] = dB;
  ctx.colorArray[base + 3] = dA;
  return instanceCount + 1;
}

/**
 * Diamond post-pass: assign golden-ratio quasi-random semantic scores.
 *
 * The golden-ratio fractional sequence fract(i × φ) is the most uniformly
 * distributed quasi-random 1D sequence, so at any visibility threshold the
 * surviving subset has excellent spatial coverage — ideal for density-based
 * level-of-detail. The score is written into `instance_rect.z`.
 */
export function finalizeDiamondScores(
  rectArray: Float32Array,
  instanceCount: number,
): void {
  const PHI = (1 + Math.sqrt(5)) / 2; // golden ratio ≈ 1.618
  for (let i = 0; i < instanceCount; i++) {
    const score = (i * PHI) % 1; // fract(i × φ) ∈ [0, 1)
    rectArray[i * 4 + 2] = score;
  }
}
