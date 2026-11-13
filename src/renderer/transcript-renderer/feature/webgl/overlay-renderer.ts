import * as twgl from "twgl.js";
import { vsOverlay, fsOverlay } from "./shaders";

/**
 * Blits an offscreen Canvas 2D rendering onto the WebGL canvas as a single
 * textured quad covering the track layout area.
 */
export class OverlayRenderer {
  private readonly programInfo: twgl.ProgramInfo;
  private readonly bufferInfo: twgl.BufferInfo;
  private texture: WebGLTexture | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.programInfo = twgl.createProgramInfo(gl, [vsOverlay, fsOverlay]);
    // Overlay quad — unit quad, non-instanced (2 triangles, 6 vertices)
    this.bufferInfo = twgl.createBufferInfoFromArrays(gl, {
      position: {
        numComponents: 2,
        data: new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      },
    });
  }

  render(
    gl: WebGL2RenderingContext,
    canvas: HTMLCanvasElement,
    params: {
      resolution: [number, number];
      layout: [number, number, number, number];
    },
    /** When true and a texture already exists, skip re-uploading the canvas pixels. */
    skipUpload?: boolean,
  ): void {
    // 1. Create / update texture from the canvas pixels
    if (!this.texture) {
      this.texture = gl.createTexture();
      skipUpload = false; // must upload on first create
    }
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    if (!skipUpload) {
      // Ensure non-premultiplied alpha upload so blending is correct
      // when the canvas content has semi-transparent strokes.
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        canvas,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    // 2. Draw a single textured quad over the track area
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.programInfo.program);
    twgl.setBuffersAndAttributes(gl, this.programInfo, this.bufferInfo);
    twgl.setUniforms(this.programInfo, {
      u_resolution: params.resolution,
      u_layout: params.layout,
      u_texture: this.texture,
    });
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.disable(gl.BLEND);
  }
}
