import * as twgl from "twgl.js";
import {
  hexToRgb,
  mapValueToColor,
  type ColorMapName,
} from "../../colors/colors";
import type {
  ModificationRecord,
  TranscriptRecord,
} from "../../transcript/transform";
import { TX_BODY_FRAC, TX_CENTRE_Y } from "./transcript-renderer";

/** Default marker colour (colormap mode with no probability, or fallback). */
const MOD_DEFAULT_COLOR = "#e74c3c";

/** Layout / domain parameters for ModificationRenderer.render. */
export interface ModRenderParams {
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
  /** Channel height in device pixels (used for height fraction). */
  channelHeight: number;
  /** Modification rendering config from channel style. */
  modConfig?: {
    enabled?: boolean;
    color?: string | { colormap?: string; range?: [number, number] };
    alpha?: number;
    height?: number;
    plot?: string;
  };
}

export class ModificationRenderer {
  private rectArray: Float32Array | null = null;
  private colorArray: Float32Array | null = null;
  private numInstances = 0;
  private bufferInfo: twgl.BufferInfo | null = null;
  private allocated = 0;

  /** Inverted-triangle geometry (3 vertices forming ▼). */
  private triangleArrays: any | null = null;

  private getTriangleArrays() {
    if (!this.triangleArrays) {
      this.triangleArrays = {
        position: {
          numComponents: 2,
          // ▼ shape: top-left(0,0), top-right(1,0), bottom-center(0.5,1)
          data: new Float32Array([0, 0, 1, 0, 0.5, 1]),
        },
      };
    }
    return this.triangleArrays;
  }

  render(
    gl: WebGL2RenderingContext,
    programInfo: twgl.ProgramInfo,
    mods: ModificationRecord[],
    transcripts: TranscriptRecord[],
    params: ModRenderParams,
  ): void {
    if (mods.length === 0) return;

    const modCfg = params.modConfig ?? {};
    if (modCfg.enabled === false) return;

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
      channelHeight,
    } = params;

    // ── Resolve colour strategy ───────────────────────────────────────
    const alpha = modCfg.alpha ?? 1;
    const heightFrac = modCfg.height ?? 0.05;

    // Determine colouring mode:
    //   1. colormap object → use probability_modified for mapping
    //   2. string → fixed single colour
    //   3. undefined → default colormap "coolwarm"
    let useColormap = true;
    let colormapName: ColorMapName = "coolwarm";
    let colormapRange: [number, number] = [0, 1];
    let fixedColor: [number, number, number] = hexToRgb(MOD_DEFAULT_COLOR);

    if (modCfg.color !== undefined) {
      if (typeof modCfg.color === "string") {
        // Single colour mode
        useColormap = false;
        fixedColor = hexToRgb(modCfg.color);
      } else {
        // Colormap mode
        useColormap = true;
        colormapName = (modCfg.color.colormap ?? "coolwarm") as ColorMapName;
        colormapRange = modCfg.color.range ?? [0, 1];
      }
    }

    // Lane geometry (mirroring renderTranscript)
    const totalH = totalContentHeightCSS * dpr;
    const lanes = Math.max(laneCount, 1);
    const laneHDev = totalH / lanes;
    const scrollDevice = scrollOffsetCSS * dpr;
    const BODY_FRAC = TX_BODY_FRAC;
    const CENTRE_Y = TX_CENTRE_Y;

    // Build transcript lookup: parentId → TranscriptRecord
    const txById = new Map<string, TranscriptRecord>();
    for (const tx of transcripts) {
      if (tx.transcriptId) txById.set(tx.transcriptId, tx);
      if (tx.transcriptName) txById.set(tx.transcriptName, tx);
    }

    // Desired marker height in device pixels (fraction of channel height)
    const desiredSizeDev = channelHeight * heightFrac;

    // ── Stack overlapping mods at the same position on the same transcript ──
    // Key = "parentId:genomicStart" → stack index (0 = first, 1 = second, ...)
    const stackMap = new Map<string, number>();

    // Pre-allocate arrays
    const n = mods.length;
    if (!this.rectArray || this.rectArray.length < n * 4) {
      const alloc = Math.ceil(n * 1.5);
      this.rectArray = new Float32Array(alloc * 4);
      this.colorArray = new Float32Array(alloc * 4);
    }
    const rectArr = this.rectArray!;
    const colorArr = this.colorArray!;
    let idx = 0;

    for (const mod of mods) {
      // Find parent transcript
      const tx = txById.get(mod.parentId) ?? txById.get(mod.transcriptId);
      if (!tx) continue;

      // Stacking: count how many mods share this position on same transcript
      const stackKey = `${mod.parentId}:${mod.genomicStart}`;
      const stackIdx = stackMap.get(stackKey) ?? 0;
      stackMap.set(stackKey, stackIdx + 1);

      // Lane geometry
      const laneTop = tx.lane * laneHDev;
      const bodyH = laneHDev * BODY_FRAC;
      const centreYDev = laneTop + bodyH * CENTRE_Y;

      // ▼ triangle: point (bottom) at exon centre, body extends upward.
      // Clamp height to the available space so the triangle stays within
      // the lane and is always visible.
      const upperSpace = centreYDev - laneTop; // space from lane top to exon centre
      const markerH = Math.min(desiredSizeDev, Math.max(1, upperSpace));

      // Stacking shifts the entire marker upward
      const stackOffsetDev = stackIdx * (markerH + 1);
      const markerTopY = centreYDev - markerH - stackOffsetDev;

      // Width proportional to actual displayed height (equilateral-ish triangle)
      const markerWidthBp = (markerH / channelWidth) * domainLength;
      // Shift +0.5bp to align with base center (axis ticks render at base+0.5)
      const xBp = mod.genomicStart - dataRegionStart + 0.5 - markerWidthBp / 2;
      const yNorm = (markerTopY - scrollDevice) / contentHeight;
      const hNorm = markerH / contentHeight;

      // Resolve colour for this marker
      let cr: number, cg: number, cb: number;
      if (useColormap && mod.probability > 0) {
        [cr, cg, cb] = mapValueToColor(
          mod.probability,
          colormapName,
          colormapRange,
        );
      } else if (!useColormap) {
        [cr, cg, cb] = fixedColor;
      } else {
        // Colormap mode but no probability — fall back to default red
        [cr, cg, cb] = hexToRgb(MOD_DEFAULT_COLOR);
      }

      const base = idx * 4;
      rectArr[base] = xBp;
      rectArr[base + 1] = yNorm;
      rectArr[base + 2] = markerWidthBp;
      rectArr[base + 3] = hNorm;
      colorArr[base] = cr;
      colorArr[base + 1] = cg;
      colorArr[base + 2] = cb;
      colorArr[base + 3] = alpha;
      idx++;
    }

    if (idx === 0) return;

    // ── Upload to GPU ──────────────────────────────────────────────────
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
            if ((attribs as any)[key]?.buffer) {
              gl.deleteBuffer((attribs as any)[key].buffer);
            }
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
        ...this.getTriangleArrays(),
        instance_rect: { numComponents: 4, data: rectAlloc, divisor: 1 },
        instance_color: { numComponents: 4, data: colorAlloc, divisor: 1 },
      });
    }

    // ── Scissor + Render ───────────────────────────────────────────────
    gl.enable(gl.SCISSOR_TEST);
    const clipGLBottom = Math.max(0, canvasHeight - contentY - contentHeight);
    gl.scissor(channelX, clipGLBottom, channelWidth, contentHeight);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const relativeStart = domainStart - dataRegionStart;

    gl.useProgram(programInfo.program);
    twgl.setBuffersAndAttributes(gl, programInfo, this.bufferInfo!);
    twgl.setUniforms(programInfo, {
      u_domain: [relativeStart, domainLength],
      u_resolution: [canvasWidth, canvasHeight],
      u_layout: [channelX, contentY, channelWidth, contentHeight],
      u_alpha: alpha,
    });
    twgl.drawBufferInfo(
      gl,
      this.bufferInfo!,
      gl.TRIANGLES,
      this.bufferInfo!.numElements,
      0,
      this.numInstances,
    );

    gl.disable(gl.BLEND);
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
