import * as twgl from "twgl.js";
import {
  hexToRgb,
  txPartColor,
  txPartOrder,
  txPartHeightFrac,
  txIntronColor,
} from "../../colors/colors";
import type { TranscriptRecord } from "../../transcript/transform";
import type { FeatureRenderer } from "../feature";

// ── Lane geometry constants (fractions of a lane's height) ──────────────────
// Shared with the modification renderer, which mirrors transcript lane layout.
/** Height of the thin intron backbone as a fraction of lane height. */
export const TX_INTRON_H_FRAC = 0.04;
/** Vertical centre of the transcript body within its lane (0–1). */
export const TX_CENTRE_Y = 0.5;
/** Fraction of lane height used for the gene body (rest is label space). */
export const TX_BODY_FRAC = 0.55;

// Reusable CPU staging arrays (synchronous, non-reentrant rendering).
let rectArray: Float32Array | null = null;
let colorArray: Float32Array | null = null;

/**
 * All-in-one transcript rendering: builds intron-backbone + exon/CDS/UTR part
 * geometry (sorted for correct painter's-algorithm layering) into the shared
 * instanced buffer, clips to the channel, and draws via the renderer's main
 * `render()` path (textured high-quality or flat low-quality).
 */
/** Layout / domain parameters for renderTranscript. */
export interface TranscriptRenderParams {
  dataRegionStart: number;
  laneCount: number;
  totalContentHeightCSS: number;
  scrollOffsetCSS: number;
  contentY: number;
  contentHeight: number;
  channelX: number;
  channelWidth: number;
  canvasWidth: number;
  canvasHeight: number;
  domainStart: number;
  domainLength: number;
  mode: "high" | "low";
  /** Optional per-feature-type colour overrides (hex strings) */
  colorOverrides?: { [type: string]: string };
}

export function renderTranscript(
  fr: FeatureRenderer,
  gl: WebGL2RenderingContext,
  records: TranscriptRecord[],
  params: TranscriptRenderParams,
): void {
  if (records.length === 0) return;

  fr.currentPlotType = "transcript";

  const dpr = window.devicePixelRatio || 1;
  const {
    dataRegionStart,
    laneCount,
    totalContentHeightCSS,
    scrollOffsetCSS,
    contentY,
    contentHeight,
    channelX,
    channelWidth,
    canvasWidth,
    canvasHeight,
    domainStart,
    domainLength,
    mode,
  } = params;

  // Total virtual height in device pixels
  const totalH = totalContentHeightCSS * dpr;
  const lanes = Math.max(laneCount, 1);
  const laneHDev = totalH / lanes;
  const scrollDevice = scrollOffsetCSS * dpr;

  const INTRON_H = TX_INTRON_H_FRAC;
  const BODY_FRAC = TX_BODY_FRAC;
  const CENTRE_Y = TX_CENTRE_Y;

  // Build runtime colour lookup with optional overrides
  const overrides = params.colorOverrides;
  const resolveColor = (type: string): [number, number, number] => {
    if (overrides && overrides[type]) {
      return hexToRgb(overrides[type]);
    }
    return txPartColor(type);
  };
  const intronColor: [number, number, number] =
    overrides && overrides["intron"]
      ? hexToRgb(overrides["intron"])
      : txIntronColor;
  // Parts are drawn in order: exon (tallest, behind) → CDS → UTR
  // (smallest, in front).  We sort parts per-transcript so that the
  // GPU painter's algorithm produces the correct layering.
  let totalRects = 0;
  for (const tx of records) {
    totalRects += 1; // intron backbone
    totalRects += tx.parts.length; // exon / CDS / UTR
  }
  if (totalRects === 0) return;

  // Grow reusable arrays
  if (!rectArray || rectArray.length < totalRects * 4) {
    const alloc = Math.ceil(totalRects * 1.5);
    rectArray = new Float32Array(alloc * 4);
    colorArray = new Float32Array(alloc * 4);
  }
  const rectArr = rectArray!;
  const colorArr = colorArray!;
  let idx = 0;

  for (const tx of records) {
    const laneTop = tx.lane * laneHDev;
    const bodyH = laneHDev * BODY_FRAC;
    const centreYDev = laneTop + bodyH * CENTRE_Y;

    // Intron backbone
    {
      const intronH = Math.max(1, laneHDev * INTRON_H);
      const xStartBp = tx.txStart - dataRegionStart;
      const xWidthBp = tx.txEnd - tx.txStart;
      const yNorm = (centreYDev - intronH / 2 - scrollDevice) / contentHeight;
      const hNorm = intronH / contentHeight;

      const base = idx * 4;
      rectArr[base] = xStartBp;
      rectArr[base + 1] = yNorm;
      rectArr[base + 2] = xWidthBp;
      rectArr[base + 3] = hNorm;
      colorArr[base] = intronColor[0];
      colorArr[base + 1] = intronColor[1];
      colorArr[base + 2] = intronColor[2];
      colorArr[base + 3] = 1;
      idx++;
    }

    // Parts — sorted exon(0) → CDS(1) → UTR(2) for correct layering
    const sortedParts = tx.parts
      .slice()
      .sort((a, b) => txPartOrder(a.type) - txPartOrder(b.type));

    for (const part of sortedParts) {
      const hFrac = txPartHeightFrac(part.type);
      const fillH = Math.max(1, laneHDev * hFrac);
      const xStartBp = part.start - dataRegionStart;
      const xWidthBp = part.end - part.start;
      const yNorm = (centreYDev - fillH / 2 - scrollDevice) / contentHeight;
      const hNorm = fillH / contentHeight;

      const [cr, cg, cb] = resolveColor(part.type);
      const base = idx * 4;
      rectArr[base] = xStartBp;
      rectArr[base + 1] = yNorm;
      rectArr[base + 2] = xWidthBp;
      rectArr[base + 3] = hNorm;
      colorArr[base] = cr;
      colorArr[base + 1] = cg;
      colorArr[base + 2] = cb;
      colorArr[base + 3] = 1;
      idx++;
    }
  }

  // ── 2. Upload to persistent GPU buffers ────────────────────────────
  fr.buffers.deleteLineBuffers();
  fr.buffers.numInstances = idx;

  const rectSlice = rectArr.subarray(0, idx * 4);
  const colorSlice = colorArr.subarray(0, idx * 4);

  if (fr.buffers.bufferInfo && idx <= fr.buffers.allocatedInstances) {
    // Fast path: reuse existing GPU buffers
    twgl.setAttribInfoBufferFromArray(
      gl,
      fr.buffers.bufferInfo.attribs!["instance_rect"],
      rectSlice,
      0,
    );
    twgl.setAttribInfoBufferFromArray(
      gl,
      fr.buffers.bufferInfo.attribs!["instance_color"],
      colorSlice,
      0,
    );
  } else {
    // Slow path: reallocate with 1.5× headroom
    fr.buffers.deleteBuffers();
    const alloc = Math.ceil(idx * 1.5);
    fr.buffers.allocatedInstances = alloc;

    const rectAlloc = new Float32Array(alloc * 4);
    const colorAlloc = new Float32Array(alloc * 4);
    rectAlloc.set(rectSlice);
    colorAlloc.set(colorSlice);

    fr.buffers.bufferInfo = twgl.createBufferInfoFromArrays(gl, {
      ...fr.quadArrays,
      instance_rect: { numComponents: 4, data: rectAlloc, divisor: 1 },
      instance_color: { numComponents: 4, data: colorAlloc, divisor: 1 },
    });
    fr.buffers.numInstances = idx;
  }

  // ── 3. Scissor clip to content area ────────────────────────────────
  gl.enable(gl.SCISSOR_TEST);
  const clipGLBottom = Math.max(0, canvasHeight - contentY - contentHeight);
  gl.scissor(channelX, clipGLBottom, channelWidth, contentHeight);

  // ── 4. Render (high-quality textured or low-quality flat) ──────────
  const relativeStart = domainStart - dataRegionStart;
  fr.render(gl, {
    domain: [relativeStart, domainLength],
    resolution: [canvasWidth, canvasHeight],
    layout: [channelX, contentY, channelWidth, contentHeight],
    mode,
  });

  gl.disable(gl.SCISSOR_TEST);
}
