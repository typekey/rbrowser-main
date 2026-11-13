import * as twgl from "twgl.js";
import type { FeatureRenderer } from "../feature";

/** Map ALT allele first-base to [r,g,b] colour. */
function variantBaseColor(base: string): [number, number, number] {
  switch (base.toUpperCase()) {
    case "A":
      return [0x2e / 255, 0xd5 / 255, 0x73 / 255]; // #2ed573
    case "T":
      return [0xff / 255, 0x47 / 255, 0x57 / 255]; // #ff4757
    case "C":
      return [0x3d / 255, 0xc1 / 255, 0xd3 / 255]; // #3dc1d3
    case "G":
      return [0xf5 / 255, 0xcd / 255, 0x79 / 255]; // #f5cd79
    default:
      return [0.6, 0.6, 0.6]; // gray for unknown / structural
  }
}

// Reusable CPU staging arrays (synchronous, non-reentrant rendering).
let rectArray: Float32Array | null = null;
let colorArray: Float32Array | null = null;

/** A single lane-assigned VCF variant record. */
export interface VariantRecord {
  start: number;
  end: number;
  lane: number;
  altDisplay?: string;
  alt?: string[];
}

/** Layout / domain parameters for renderVariant. */
export interface VariantRenderParams {
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
  /** Row height as fraction of lane (default 0.31). */
  rowHeight?: number;
  /** Row padding as fraction of lane height on each side (default 0.01). */
  rowPadding?: number;
}

/**
 * Render VCF variant records as lane-stacked coloured rectangles (colour by
 * ALT base), building geometry into the shared instanced buffer and drawing
 * via the renderer's main `render()` path.
 */
export function renderVariant(
  fr: FeatureRenderer,
  gl: WebGL2RenderingContext,
  records: VariantRecord[],
  params: VariantRenderParams,
): void {
  if (records.length === 0) return;

  fr.currentPlotType = "variant";

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

  const ROW_PAD = params.rowPadding ?? 0.01;
  const totalH = totalContentHeightCSS * dpr;
  const lanes = Math.max(laneCount, 1);
  const laneHDev = totalH / lanes;
  const scrollDevice = scrollOffsetCSS * dpr;
  const fillH = Math.max(1, laneHDev * (1 - 2 * ROW_PAD));
  const padTop = laneHDev * ROW_PAD;

  // ── 1. Build rect & colour arrays ─────────────────────────────────
  const totalRects = records.length;
  if (!rectArray || rectArray.length < totalRects * 4) {
    const alloc = Math.ceil(totalRects * 1.5);
    rectArray = new Float32Array(alloc * 4);
    colorArray = new Float32Array(alloc * 4);
  }
  const rectArr = rectArray!;
  const colorArr = colorArray!;
  let idx = 0;

  for (const rec of records) {
    const laneTop = rec.lane * laneHDev;
    const rectTop = laneTop + padTop;

    const xStartBp = rec.start - dataRegionStart;
    const xWidthBp = rec.end - rec.start;
    const yNorm = (rectTop - scrollDevice) / contentHeight;
    const hNorm = fillH / contentHeight;

    const altBase = (rec.altDisplay || rec.alt?.[0]?.[0] || "N").toUpperCase();
    const color = variantBaseColor(altBase);

    const base = idx * 4;
    rectArr[base] = xStartBp;
    rectArr[base + 1] = yNorm;
    rectArr[base + 2] = xWidthBp;
    rectArr[base + 3] = hNorm;
    colorArr[base] = color[0];
    colorArr[base + 1] = color[1];
    colorArr[base + 2] = color[2];
    colorArr[base + 3] = 1;
    idx++;
  }

  // ── 2. Upload to GPU ──────────────────────────────────────────────
  fr.buffers.deleteLineBuffers();
  fr.buffers.numInstances = idx;

  const rectSlice = rectArr.subarray(0, idx * 4);
  const colorSlice = colorArr.subarray(0, idx * 4);

  if (fr.buffers.bufferInfo && idx <= fr.buffers.allocatedInstances) {
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

  // ── 3. Scissor clip ───────────────────────────────────────────────
  gl.enable(gl.SCISSOR_TEST);
  const clipGLBottom = Math.max(0, canvasHeight - contentY - contentHeight);
  gl.scissor(channelX, clipGLBottom, channelWidth, contentHeight);

  // ── 4. Render ─────────────────────────────────────────────────────
  const relativeStart = domainStart - dataRegionStart;
  fr.render(gl, {
    domain: [relativeStart, domainLength],
    resolution: [canvasWidth, canvasHeight],
    layout: [channelX, contentY, channelWidth, contentHeight],
    mode,
  });

  gl.disable(gl.SCISSOR_TEST);
}
