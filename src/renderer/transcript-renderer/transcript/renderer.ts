/**
 * TranscriptRenderer — WebGL2 instanced-quad renderer for GFF3 transcript
 * structures.
 */

import * as twgl from "twgl.js";
import { TranscriptRecord } from "./transform";
import { logger } from "../utils/logger";

// ── Color map ─────────────────────────────────────────────────────────────

interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RGB {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)!;
  return {
    r: parseInt(m[1], 16) / 255,
    g: parseInt(m[2], 16) / 255,
    b: parseInt(m[3], 16) / 255,
  };
}

const COLOR_INTRON = hexToRgb("#b0b0b0");
const COLOR_EXON_FILL = hexToRgb("#747d8c");
const COLOR_CDS = hexToRgb("#ffbf79");
const COLOR_UTR5 = hexToRgb("#83bcb6");
const COLOR_UTR3 = hexToRgb("#d6a5c9");

function partColor(type: string): RGB {
  switch (type) {
    case "CDS":
    case "start_codon":
      return COLOR_CDS;
    case "five_prime_UTR":
      return COLOR_UTR5;
    case "three_prime_UTR":
    case "stop_codon":
      return COLOR_UTR3;
    case "exon":
      return COLOR_EXON_FILL;
    default:
      return COLOR_INTRON;
  }
}

// ── Shader sources ────────────────────────────────────────────────────────

const VS = `#version 300 es
in vec2 position;
in vec4 instance_rect;  // x_bp, y_norm, width_bp, height_norm
in vec4 instance_color;

uniform vec2 u_domain;     // domain start, domain length
uniform vec2 u_resolution; // canvas pixel width, height
uniform vec4 u_layout;     // track x, y, w, h (in pixels)

out vec4 v_color;

void main() {
    float width_bp = instance_rect.z;
    float width_px = (width_bp / u_domain.y) * u_layout.z;

    float actual_width_bp = width_bp;
    float x_start_bp = instance_rect.x;

    // Enforce minimum 1-pixel width
    if (width_px > 0.0 && width_px < 1.0) {
        float center_bp = instance_rect.x + width_bp * 0.5;
        float min_bp = (1.0 / u_layout.z) * u_domain.y;
        x_start_bp = center_bp - min_bp * 0.5;
        actual_width_bp = min_bp;
    }

    float x_bp = x_start_bp + position.x * actual_width_bp;
    float x_norm = (x_bp - u_domain.x) / u_domain.y;
    float y_norm = instance_rect.y + position.y * instance_rect.w;

    float screenX = u_layout.x + x_norm * u_layout.z;
    float screenY = u_layout.y + y_norm * u_layout.w;

    float clipX = (screenX / u_resolution.x) * 2.0 - 1.0;
    float clipY = 1.0 - (screenY / u_resolution.y) * 2.0;

    gl_Position = vec4(clipX, clipY, 0.0, 1.0);
    v_color = instance_color;
}
`;

const FS = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 fragColor;
void main() {
    fragColor = v_color;
}
`;

// ── Constants ─────────────────────────────────────────────────────────────

/** Height of the thin intron backbone as a fraction of lane height. */
const INTRON_HEIGHT_FRAC = 0.04;
/** Height of exon / CDS / UTR rects as a fraction of lane height. */
const EXON_HEIGHT_FRAC = 0.5;

/** Vertical centre of the transcript within its lane (0–1). */
const CENTRE_Y = 0.5;
/** Amount of lane used for the gene body (rest is label space below). */
const BODY_FRAC = 0.55;

// ── Renderer class ────────────────────────────────────────────────────────

export class TranscriptRenderer {
  private gl: WebGL2RenderingContext;
  private programInfo: twgl.ProgramInfo;

  // Reusable CPU-side arrays (amortised growth)
  private rectArray: Float32Array = new Float32Array(0);
  private colorArray: Float32Array = new Float32Array(0);
  private allocatedInstances = 0;

  private bufferInfo: twgl.BufferInfo | null = null;
  private numInstances = 0;

  /** Transcript records currently uploaded (needed for label overlay). */
  private _transcripts: TranscriptRecord[] = [];

  /** Number of lanes (max lane + 1). */
  private _laneCount = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.programInfo = twgl.createProgramInfo(gl, [VS, FS]);
  }

  // ── Public getters ──────────────────────────────────────────────────

  get transcripts(): TranscriptRecord[] {
    return this._transcripts;
  }

  get laneCount(): number {
    return this._laneCount;
  }

  // ── Data upload ─────────────────────────────────────────────────────

  /**
   * Build instanced-quad geometry from transcript records.
   *
   * Each transcript produces:
   *   1. One thin intron backbone rect (txStart→txEnd)
   *   2. Per-part rects: exon outline strokes (top + bottom), then fill
   *   3. CDS / UTR fills (drawn over exon fills)
   */
  updateData(
    transcripts: TranscriptRecord[],
    laneCount: number,
    regionStart: number,
  ): void {
    this._transcripts = transcripts;
    this._laneCount = Math.max(laneCount, 1);

    const laneH = 1 / this._laneCount; // normalised lane height

    // Estimate instance count (backbone + fill per part)
    let estimatedInstances = 0;
    for (const tx of transcripts) {
      estimatedInstances += 1; // backbone
      estimatedInstances += tx.parts.length; // one fill rect per part
    }

    this.ensureCapacity(estimatedInstances);

    let idx = 0;

    for (const tx of transcripts) {
      const laneTop = tx.lane * laneH;
      // Vertical centre for the body of this transcript
      const bodyTop = laneTop;
      const bodyH = laneH * BODY_FRAC;
      const centreY = bodyTop + bodyH * CENTRE_Y;

      // 1) Intron backbone — thin line through centre
      const intronH = laneH * INTRON_HEIGHT_FRAC;
      idx = this.pushRect(
        idx,
        tx.txStart - regionStart,
        centreY - intronH / 2,
        tx.txEnd - tx.txStart,
        intronH,
        COLOR_INTRON,
      );

      // 2) Parts
      for (const part of tx.parts) {
        const pStart = part.start - regionStart;
        const pWidth = part.end - part.start;

        {
          // All parts: single color-filled rectangle (no stroke)
          const fillH = laneH * EXON_HEIGHT_FRAC;
          const fillTop = centreY - fillH / 2;
          const color = partColor(part.type);
          idx = this.pushRect(idx, pStart, fillTop, pWidth, fillH, color);
        }
      }
    }

    this.numInstances = idx;
    this.uploadToGpu();
  }

  // ── GPU upload ──────────────────────────────────────────────────────

  private uploadToGpu(): void {
    const gl = this.gl;
    const count = this.numInstances;

    if (count === 0) {
      this.deleteBuffers();
      return;
    }

    // Quad vertices (two triangles)
    const quadPositions = new Float32Array([
      0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1,
    ]);

    if (this.bufferInfo && count <= this.allocatedInstances) {
      // Reuse existing GPU allocation, just subData
      const rectBuf = (this.bufferInfo.attribs!.instance_rect as any).buffer;
      const colorBuf = (this.bufferInfo.attribs!.instance_color as any).buffer;
      gl.bindBuffer(gl.ARRAY_BUFFER, rectBuf);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        this.rectArray.subarray(0, count * 4),
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        this.colorArray.subarray(0, count * 4),
      );
      return;
    }

    this.deleteBuffers();

    this.bufferInfo = twgl.createBufferInfoFromArrays(gl, {
      position: { numComponents: 2, data: quadPositions },
      instance_rect: {
        numComponents: 4,
        data: this.rectArray.subarray(0, count * 4),
        divisor: 1,
      },
      instance_color: {
        numComponents: 4,
        data: this.colorArray.subarray(0, count * 4),
        divisor: 1,
      },
    });
    this.allocatedInstances = count;
  }

  // ── Render ──────────────────────────────────────────────────────────

  render(
    gl: WebGL2RenderingContext,
    params: {
      domain: [number, number]; // [start, length]
      resolution: [number, number]; // [canvasW, canvasH]
      layout: [number, number, number, number]; // [x, y, w, h]
    },
  ): void {
    if (!this.bufferInfo || this.numInstances === 0) {
      logger.warn(
        `[TranscriptRenderer] render skipped: bufferInfo=${!!this.bufferInfo}, numInstances=${this.numInstances}`,
      );
      return;
    }

    gl.useProgram(this.programInfo.program);
    twgl.setBuffersAndAttributes(gl, this.programInfo, this.bufferInfo);
    twgl.setUniforms(this.programInfo, {
      u_domain: params.domain,
      u_resolution: params.resolution,
      u_layout: params.layout,
    });

    twgl.drawBufferInfo(
      gl,
      this.bufferInfo,
      gl.TRIANGLES,
      this.bufferInfo.numElements,
      0,
      this.numInstances,
    );

    // Check for WebGL errors after draw
    const err = gl.getError();
    if (err !== gl.NO_ERROR) {
      logger.error(`[TranscriptRenderer] GL error after draw: ${err}`);
    }
  }

  // ── Capacity management ─────────────────────────────────────────────

  private ensureCapacity(needed: number): void {
    if (needed <= this.rectArray.length / 4) return;
    const size =
      Math.max(needed, Math.ceil((this.rectArray.length / 4) * 1.5)) * 4;
    this.rectArray = new Float32Array(size);
    this.colorArray = new Float32Array(size);
  }

  private pushRect(
    idx: number,
    x: number,
    y: number,
    w: number,
    h: number,
    color: RGB,
  ): number {
    const base = idx * 4;
    this.rectArray[base] = x;
    this.rectArray[base + 1] = y;
    this.rectArray[base + 2] = w;
    this.rectArray[base + 3] = h;
    this.colorArray[base] = color.r;
    this.colorArray[base + 1] = color.g;
    this.colorArray[base + 2] = color.b;
    this.colorArray[base + 3] = 1;
    return idx + 1;
  }

  // ── Cleanup ─────────────────────────────────────────────────────────

  private deleteBuffers(): void {
    if (!this.bufferInfo) return;
    const gl = this.gl;
    for (const attrib of Object.values(this.bufferInfo.attribs ?? {})) {
      if ((attrib as any).buffer) {
        gl.deleteBuffer((attrib as any).buffer);
      }
    }
    if (this.bufferInfo.indices) {
      gl.deleteBuffer(this.bufferInfo.indices as WebGLBuffer);
    }
    this.bufferInfo = null;
    this.numInstances = 0;
  }

  destroy(): void {
    this.deleteBuffers();
  }
}
