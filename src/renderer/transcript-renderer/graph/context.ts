import { RenderQuality } from "../config/config";
import { logger } from "../utils/logger";

/**
 * WebGL rendering context management
 */
export class RenderingContext {
  gl: WebGL2RenderingContext | null = null;
  canvas: HTMLCanvasElement | null = null;
  theme: "light" | "dark" = "light";

  /**
   * Current rendering quality mode.
   * Set by BaseRenderer based on config + WebGL2 detection.
   * Channels / FeatureRenderers read this to choose flat-color vs textured path.
   */
  renderMode: RenderQuality = "high";

  constructor() {}

  initialize(
    container: HTMLElement,
    backgroundColor: string,
    theme: "light" | "dark" = "light",
  ) {
    this.theme = theme;
    const computedStyle = window.getComputedStyle(container);
    if (computedStyle.position === "static") {
      container.style.position = "relative";
    }

    // Prevent scrollbars from appearing during initialization
    container.style.overflow = "hidden";

    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    // Height is set explicitly (not "100%") so the browser never
    // CSS-scales the canvas buffer when the container resizes.
    this.canvas.style.height = "0";
    this.canvas.style.display = "block";
    this.canvas.style.position = "absolute";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.canvas.style.pointerEvents = "auto";

    container.appendChild(this.canvas);

    this.gl = this.canvas.getContext("webgl2", {
      preserveDrawingBuffer: true,
      antialias: false,
    });
    if (!this.gl) {
      logger.error("WebGL2 not supported");
      return;
    }

    const bgColor = this.hexToRgb(backgroundColor);
    this.gl.clearColor(bgColor.r, bgColor.g, bgColor.b, 1.0);
  }

  resize(width: number, height: number) {
    if (!this.gl || !this.canvas) return;

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Keep CSS height in sync with the buffer so the browser
    // never scales the canvas content vertically.
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.height = `${height / dpr}px`;

    this.gl.viewport(0, 0, width, height);
  }

  clear() {
    if (!this.gl) return;
    this.gl.disable(this.gl.SCISSOR_TEST);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
  }

  private hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16) / 255,
          g: parseInt(result[2], 16) / 255,
          b: parseInt(result[3], 16) / 255,
        }
      : { r: 1, g: 1, b: 1 };
  }
}
