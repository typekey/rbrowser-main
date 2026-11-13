import * as twgl from "twgl.js";
import { hexToRgb } from "../../colors/colors";
import type { FeatureRenderer } from "../feature";

/**
 * Colours for BAM reads by strand direction. Edit these hex strings to change
 * the appearance.
 */
const BAM_CONFIG = {
  /** Forward (+) strand read colour. */
  forwardColor: "#f7b731", // amber / orange
  /** Reverse (–) strand read colour. */
  reverseColor: "#eb3b5a", // crimson / red-pink
  /** Read rect height as a fraction of lane height (0–1). */
  readHeightFrac: 0.7,
  /** Lane height in CSS pixels. */
  laneHeightCSS: 4,
};

/** Pre-computed float colours (built once). */
const bamForwardRgb: [number, number, number] = hexToRgb(
  BAM_CONFIG.forwardColor,
);
const bamReverseRgb: [number, number, number] = hexToRgb(
  BAM_CONFIG.reverseColor,
);

// Reusable CPU staging arrays. Rendering is synchronous and non-reentrant, so
// a single module-level scratch buffer is safe across renderer instances.
let rectArray: Float32Array | null = null;
let colorArray: Float32Array | null = null;

/**
 * All-in-one BAM read rendering: builds instance geometry from lane-assigned
 * reads into the renderer's shared instanced-quad buffer, clips to the channel
 * with a scissor rect, and draws via the renderer's main `render()` path (so
 * high/low quality texturing is shared with the other instanced plots).
 */
/** A single lane-assigned BAM read interval. */
export interface BamRead {
  start: number;
  end: number;
  strand: number;
  lane: number;
}

/** Layout / domain parameters for renderBam. */
export interface BamRenderParams {
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
  /** Optional per-strand colours: { plus, minus, other } as [r,g,b] */
  forwardColor?: [number, number, number];
  reverseColor?: [number, number, number];
  otherColor?: [number, number, number];
}

export function renderBam(
  fr: FeatureRenderer,
  gl: WebGL2RenderingContext,
  reads: BamRead[],
  params: BamRenderParams,
): void {
  if (reads.length === 0) return;

  fr.currentPlotType = "bam";

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

  const totalH = totalContentHeightCSS * dpr;
  const lanes = Math.max(laneCount, 1);
  const laneHDev = totalH / lanes;
  const scrollDevice = scrollOffsetCSS * dpr;
  const READ_H = BAM_CONFIG.readHeightFrac;

  // ── 1. Build rect & colour arrays ─────────────────────────────────
  const totalRects = reads.length;
  if (totalRects === 0) return;

  if (!rectArray || rectArray.length < totalRects * 4) {
    const alloc = Math.ceil(totalRects * 1.5);
    rectArray = new Float32Array(alloc * 4);
    colorArray = new Float32Array(alloc * 4);
  }
  const rectArr = rectArray!;
  const colorArr = colorArray!;
  let idx = 0;

  const fwdColor = params.forwardColor ?? bamForwardRgb;
  const revColor = params.reverseColor ?? bamReverseRgb;
  const othColor = params.otherColor ?? fwdColor;

  for (const read of reads) {
    const fillH = Math.max(1, laneHDev * READ_H);
    const laneTop = read.lane * laneHDev;
    const centreY = laneTop + laneHDev * 0.5;

    const xStartBp = read.start - dataRegionStart;
    const xWidthBp = read.end - read.start;
    const yNorm = (centreY - fillH / 2 - scrollDevice) / contentHeight;
    const hNorm = fillH / contentHeight;

    const color =
      read.strand === -1 ? revColor : read.strand === 1 ? fwdColor : othColor;

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
