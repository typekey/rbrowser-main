import * as twgl from "twgl.js";

function deleteBufferInfo(
  gl: WebGL2RenderingContext,
  bufferInfo: twgl.BufferInfo | null,
): void {
  if (!bufferInfo) return;
  for (const attrib of Object.values(bufferInfo.attribs ?? {})) {
    if ((attrib as any).buffer) {
      gl.deleteBuffer((attrib as any).buffer);
    }
  }
  if (bufferInfo.indices) {
    gl.deleteBuffer(bufferInfo.indices as WebGLBuffer);
  }
}

/**
 * the FeatureRenderer's GPU + CPU-side geometry buffers:
 */
export class BuffersManager {
  // ── Instanced-quad buffers ──────────────────────────────────────────
  bufferInfo: twgl.BufferInfo | null = null;
  numInstances = 0;
  /** How many instances the currently-allocated GPU buffers can hold. */
  allocatedInstances = 0;
  /** Reusable CPU-side instance rect data ([start,y,w,h] × N). */
  rectArray = new Float32Array(0);
  /** Reusable CPU-side instance colour data ([r,g,b,a] × N). */
  colorArray = new Float32Array(0);

  // ── LINE_STRIP buffers ──────────────────────────────────────────────
  lineBufferInfo: twgl.BufferInfo | null = null;
  lineVertexCount = 0;
  allocatedLineVertices = 0;
  linePosArray = new Float32Array(0); // (x, y) per vertex
  lineColorArray = new Float32Array(0); // (r, g, b, a) per vertex

  constructor(private readonly gl: WebGL2RenderingContext) {}

  /** Free the current instanced-quad BufferInfo's GPU buffers. */
  deleteBuffers(): void {
    if (!this.bufferInfo) return;
    deleteBufferInfo(this.gl, this.bufferInfo);
    this.bufferInfo = null;
    this.numInstances = 0;
    this.allocatedInstances = 0;
  }

  /** Free line-specific GPU buffers. */
  deleteLineBuffers(): void {
    if (!this.lineBufferInfo) return;
    deleteBufferInfo(this.gl, this.lineBufferInfo);
    this.lineBufferInfo = null;
    this.lineVertexCount = 0;
    this.allocatedLineVertices = 0;
  }

  /** Free all GPU buffers held by this manager. */
  destroy(): void {
    this.deleteBuffers();
    this.deleteLineBuffers();
  }
}
