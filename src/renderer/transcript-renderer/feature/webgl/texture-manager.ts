import * as twgl from "twgl.js";
import { logger } from "../../utils/logger";

export class TextureManager {
  private _diamond: WebGLTexture | null = null;
  private _diamondLoaded = false;
  private _eleGrays: WebGLTexture | null = null;
  private _eleGraysLoaded = false;

  constructor(private readonly gl: WebGL2RenderingContext) {}

  /** The diamond sprite texture (null until loadDiamond). */
  get diamond(): WebGLTexture | null {
    return this._diamond;
  }
  /** Whether the diamond sprite texture has finished loading. */
  get isDiamondReady(): boolean {
    return this._diamondLoaded;
  }
  /** The ele_grays high-quality texture (null until loadEleGrays). */
  get eleGrays(): WebGLTexture | null {
    return this._eleGrays;
  }
  /** Whether the ele_grays texture has finished loading. */
  get isEleGraysReady(): boolean {
    return this._eleGraysLoaded;
  }

  /** Load the diamond sprite texture (transparent placeholder until ready). */
  loadDiamond(url: string): Promise<void> {
    if (this._diamondLoaded) return Promise.resolve();
    const { texture, ready } = this.load(url, [255, 255, 255, 0], "texture");
    this._diamond = texture;
    return ready.then(() => {
      this._diamondLoaded = true;
    });
  }

  /** Load the ele_grays high-quality texture (white placeholder until ready). */
  loadEleGrays(url: string): Promise<void> {
    if (this._eleGraysLoaded) return Promise.resolve();
    const { texture, ready } = this.load(
      url,
      [255, 255, 255, 255],
      "ele_grays texture",
    );
    this._eleGrays = texture;
    return ready.then(() => {
      this._eleGraysLoaded = true;
    });
  }

  private load(
    url: string,
    placeholder: [number, number, number, number],
    label: string,
  ): { texture: WebGLTexture; ready: Promise<void> } {
    const gl = this.gl;
    const texture = twgl.createTexture(gl, {
      min: gl.LINEAR,
      mag: gl.LINEAR,
      wrap: gl.CLAMP_TO_EDGE,
      src: placeholder,
    });

    const ready = new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          img,
        );
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(
          gl.TEXTURE_2D,
          gl.TEXTURE_MIN_FILTER,
          gl.LINEAR_MIPMAP_LINEAR,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        resolve();
      };
      img.onerror = () => {
        logger.warn(`[FeatureRenderer] Failed to load ${label}: ${url}`);
        reject(new Error(`Texture load failed: ${url}`));
      };
      img.src = url;
    });

    return { texture, ready };
  }

  /** Free both textures and reset their loaded flags. */
  destroy(): void {
    if (this._diamond) {
      this.gl.deleteTexture(this._diamond);
      this._diamond = null;
      this._diamondLoaded = false;
    }
    if (this._eleGrays) {
      this.gl.deleteTexture(this._eleGrays);
      this._eleGrays = null;
      this._eleGraysLoaded = false;
    }
  }
}
