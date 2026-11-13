export interface TranscriptNavLayout {
  txStart: number;
  txEnd: number;
  leftLength: number;
  rightLength: number;
  leftRatio: number;
  bodyRatio: number;
  rightRatio: number;
}

/** Proportional widths with readable minima; fixed segments leave the rest proportional. */
export function transcriptNavLayout(
  txStart: number,
  txEnd: number,
  genomicStart: number,
  genomicEnd: number,
  bodyLength = txEnd - txStart,
): TranscriptNavLayout {
  const leftLength = Math.max(0, txStart - genomicStart);
  const rightLength = Math.max(0, genomicEnd - txEnd);
  const weights = [leftLength, Math.max(1, bodyLength), rightLength];
  const minima = [1 / 6, 1 / 5, 1 / 6];
  const ratios = [0, 0, 0];
  let active = [0, 1, 2];
  let remaining = 1;
  while (active.length) {
    const total = active.reduce((sum, i) => sum + weights[i], 0);
    const constrained = active.filter(i => remaining * weights[i] / total < minima[i]);
    if (!constrained.length) {
      active.forEach(i => { ratios[i] = remaining * weights[i] / total; });
      break;
    }
    for (const i of constrained) {
      ratios[i] = minima[i];
      remaining -= ratios[i];
    }
    active = active.filter(i => !constrained.includes(i));
  }
  return { txStart, txEnd, leftLength, rightLength, leftRatio: ratios[0], bodyRatio: ratios[1], rightRatio: ratios[2] };
}

export function genomicToNavRatio(layout: TranscriptNavLayout, position: number): number {
  const { txStart, txEnd, leftLength, rightLength, leftRatio, bodyRatio, rightRatio } = layout;
  if (position < txStart) return leftLength > 0 ? leftRatio * (1 - (txStart - position) / leftLength) : leftRatio;
  if (position > txEnd) return rightLength > 0 ? leftRatio + bodyRatio + rightRatio * (position - txEnd) / rightLength : leftRatio + bodyRatio;
  return leftRatio + bodyRatio * (position - txStart) / Math.max(1, txEnd - txStart);
}

export function navRatioToGenomic(layout: TranscriptNavLayout, ratio: number): number {
  const { txStart, txEnd, leftLength, rightLength, leftRatio, bodyRatio, rightRatio } = layout;
  if (ratio < leftRatio) return Math.round(txStart - leftLength * (1 - ratio / leftRatio));
  if (ratio > leftRatio + bodyRatio) return Math.round(txEnd + rightLength * (ratio - leftRatio - bodyRatio) / rightRatio);
  return Math.round(txStart + (ratio - leftRatio) / bodyRatio * (txEnd - txStart));
}
