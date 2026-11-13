import * as twgl from "twgl.js";
import { mapValueToColor, type ColorMapName } from "../../colors/colors";
import type { FeatureRenderer } from "../feature";

export interface CoverageRenderParams {
  /** Start coordinate of the first bin in bp (data region space). */
  coverageStart: number;
  /** End coordinate of the last bin in bp (data region space). */
  coverageEnd: number;
  dataRegionStart: number;
  /** Y (device px) of the coverage area top. */
  coverageY: number;
  /** Height (device px) of the coverage area. */
  coverageHeight: number;
  channelX: number;
  channelWidth: number;
  canvasWidth: number;
  canvasHeight: number;
  domainStart: number;
  domainLength: number;
  color: [number, number, number];
  /** Optional colormap config for per-bin gradient colouring. */
  colormapConfig?: { colormap?: string; range?: [number, number] };
  /** Coverage bar opacity (0–1). Default 0.7. */
  alpha?: number;
  /** Rendering style. Default "bar". */
  plot?: "bar" | "line" | "heatmap" | "point";
  mode: "high" | "low";
}

/**
 * Renders a BAM read-depth coverage histogram (bar / line / heatmap / point).
 *
 * Owns its own persistent GPU buffer + reusable CPU arrays. To draw it reuses
 * the renderer's shared instanced-quad program by temporarily swapping its
 * buffer into `fr.buffers` around the `fr.render()` call, then restoring.
 */
export class CoverageRenderer {
  private rectArray: Float32Array | null = null;
  private colorArray: Float32Array | null = null;
  private bufferInfo: twgl.BufferInfo | null = null;
  private allocated = 0;
  private numInstances = 0;

  render(
    fr: FeatureRenderer,
    gl: WebGL2RenderingContext,
    coverage: Float32Array,
    maxDepth: number,
    params: CoverageRenderParams,
  ): void {
    if (coverage.length === 0 || maxDepth <= 0) return;

    const numBins = coverage.length;
    const {
      coverageStart,
      coverageEnd,
      dataRegionStart,
      coverageY,
      coverageHeight,
      channelX,
      channelWidth,
      canvasWidth,
      canvasHeight,
      domainStart,
      domainLength,
      color,
      colormapConfig,
      alpha,
      plot,
      mode,
    } = params;

    const plotType = plot ?? "bar";
    const useColormap = !!colormapConfig?.colormap;
    const cmRange: [number, number] = colormapConfig?.range || [
      0,
      maxDepth > 0 ? maxDepth : 1,
    ];
    const covAlpha = alpha ?? 0.7;

    const binWidthBp = (coverageEnd - coverageStart) / numBins;

    // ── 1. Build rect & colour arrays ─────────────────────────────────
    if (!this.rectArray || this.rectArray.length < numBins * 4) {
      const alloc = Math.ceil(numBins * 1.5);
      this.rectArray = new Float32Array(alloc * 4);
      this.colorArray = new Float32Array(alloc * 4);
    }
    const rectArr = this.rectArray!;
    const colorArr = this.colorArray!;
    let idx = 0;

    for (let i = 0; i < numBins; i++) {
      const depth = coverage[i];
      if (depth <= 0) continue;

      const xBp = coverageStart - dataRegionStart + i * binWidthBp;
      const base = idx * 4;

      // Resolve colour for this bin (shared across all plot types)
      let cr: number, cg: number, cb: number;
      if (useColormap) {
        [cr, cg, cb] = mapValueToColor(
          depth,
          colormapConfig!.colormap as ColorMapName,
          cmRange,
        );
      } else if (plotType === "heatmap") {
        const intensity = Math.min(1.0, depth / maxDepth);
        cr = color[0] * intensity;
        cg = color[1] * intensity;
        cb = color[2] * intensity;
      } else {
        cr = color[0];
        cg = color[1];
        cb = color[2];
      }

      if (plotType === "heatmap") {
        // ── Heatmap: full-height bin, colour encodes depth ───────────
        rectArr[base] = xBp;
        rectArr[base + 1] = 0; // top
        rectArr[base + 2] = binWidthBp;
        rectArr[base + 3] = 1.0; // full height
      } else if (plotType === "point") {
        // ── Point: small square centred at bin midpoint ──────────────
        const height = Math.min(1.0, depth / maxDepth);
        const pointSize = Math.max(binWidthBp * 0.6, binWidthBp * 0.5);
        rectArr[base] = xBp + (binWidthBp - pointSize) * 0.5;
        rectArr[base + 1] = 1.0 - height - 0.02; // centre vertically
        rectArr[base + 2] = pointSize;
        rectArr[base + 3] = 0.04; // fixed small height
      } else if (plotType === "line") {
        // ── Line: thin bar spanning to the next bin for connectedness ─
        const height = Math.min(1.0, depth / maxDepth);
        const lineThickness = 0.025;
        rectArr[base] = xBp;
        rectArr[base + 1] = 1.0 - height - lineThickness * 0.5;
        rectArr[base + 2] = binWidthBp * 1.05; // slight overlap for continuity
        rectArr[base + 3] = lineThickness;
      } else {
        // ── Bar: histogram bars grow upward from bottom ──────────────
        const height = Math.min(1.0, depth / maxDepth);
        rectArr[base] = xBp;
        rectArr[base + 1] = 1.0 - height; // y (grows up)
        rectArr[base + 2] = binWidthBp;
        rectArr[base + 3] = height;
      }

      colorArr[base] = cr;
      colorArr[base + 1] = cg;
      colorArr[base + 2] = cb;
      colorArr[base + 3] = covAlpha;
      idx++;
    }

    if (idx === 0) return;

    // ── 2. Upload to GPU ──────────────────────────────────────────────
    this.numInstances = idx;

    const rectSlice = rectArr.subarray(0, idx * 4);
    const colorSlice = colorArr.subarray(0, idx * 4);

    if (this.bufferInfo && idx <= this.allocated) {
      twgl.setAttribInfoBufferFromArray(
        gl,
        this.bufferInfo.attribs!["instance_rect"],
        rectSlice,
        0,
      );
      twgl.setAttribInfoBufferFromArray(
        gl,
        this.bufferInfo.attribs!["instance_color"],
        colorSlice,
        0,
      );
    } else {
      if (this.bufferInfo) {
        const attribs = this.bufferInfo.attribs;
        if (attribs) {
          for (const key of Object.keys(attribs)) {
            const a = attribs[key];
            if (a && a.buffer) gl.deleteBuffer(a.buffer);
          }
        }
      }
      const alloc = Math.ceil(idx * 1.5);
      this.allocated = alloc;

      const rectAlloc = new Float32Array(alloc * 4);
      const colorAlloc = new Float32Array(alloc * 4);
      rectAlloc.set(rectSlice);
      colorAlloc.set(colorSlice);

      this.bufferInfo = twgl.createBufferInfoFromArrays(gl, {
        ...fr.quadArrays,
        instance_rect: { numComponents: 4, data: rectAlloc, divisor: 1 },
        instance_color: { numComponents: 4, data: colorAlloc, divisor: 1 },
      });
    }

    // ── 3. Scissor clip ───────────────────────────────────────────────
    gl.enable(gl.SCISSOR_TEST);
    const clipGLBottom = Math.max(0, canvasHeight - coverageY - coverageHeight);
    gl.scissor(channelX, clipGLBottom, channelWidth, coverageHeight);

    // ── 4. Render (reuse shared instanced-quad program) ───────────────
    const relativeStart = domainStart - dataRegionStart;

    // Temporarily swap bufferInfo / numInstances for the shared render()
    const savedBufferInfo = fr.buffers.bufferInfo;
    const savedInstances = fr.buffers.numInstances;
    const savedPlotType = fr.currentPlotType;

    fr.buffers.bufferInfo = this.bufferInfo;
    fr.buffers.numInstances = this.numInstances;
    fr.currentPlotType = "bam"; // uses instanced-quad path

    fr.render(gl, {
      domain: [relativeStart, domainLength],
      resolution: [canvasWidth, canvasHeight],
      layout: [channelX, coverageY, channelWidth, coverageHeight],
      mode,
    });

    // Restore
    fr.buffers.bufferInfo = savedBufferInfo;
    fr.buffers.numInstances = savedInstances;
    fr.currentPlotType = savedPlotType;

    gl.disable(gl.SCISSOR_TEST);
  }

  /** Free this renderer's GPU buffer. */
  destroy(gl: WebGL2RenderingContext): void {
    if (!this.bufferInfo) return;
    for (const attrib of Object.values(this.bufferInfo.attribs ?? {})) {
      if ((attrib as any).buffer) gl.deleteBuffer((attrib as any).buffer);
    }
    this.bufferInfo = null;
  }
}
