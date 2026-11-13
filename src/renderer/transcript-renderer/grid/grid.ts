import { GridDisplay } from "../config/config";

export class GridRenderer {
  private gridDisplay: GridDisplay = "none";
  private theme: "light" | "dark" = "light";
  private gridColor: number[] | null = null;

  constructor(theme: "light" | "dark" = "light", gridColor?: string) {
    this.theme = theme;
    if (gridColor) {
      this.gridColor = this.parseColor(gridColor);
    }
  }

  setGridDisplay(display: GridDisplay) {
    this.gridDisplay = display;
  }

  getGridDisplay(): GridDisplay {
    return this.gridDisplay;
  }

  /** Return grid colour as CSS rgba string (for SVG export). */
  getGridColorCSS(): string {
    const c =
      this.gridColor ||
      (this.theme === "light" ? [0.8, 0.8, 0.8, 1.0] : [0.3, 0.3, 0.3, 1.0]);
    return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3]})`;
  }

  /** Return auto-calculated grid interval for a given domain width. */
  getAutoInterval(domainWidth: number): number {
    return this.calculateAutoInterval(domainWidth);
  }

  /**
   * Render grid lines on the canvas
   * @param gl WebGL context
   * @param params Rendering parameters
   */
  render(
    gl: WebGL2RenderingContext,
    params: {
      canvasWidth: number;
      canvasHeight: number;
      tracks: Array<{ y: number; height: number }>; // Track positions for horizontal lines
      domain: { start: number; end: number }; // Genomic coordinates
      gridInterval?: number; // Interval for vertical grid lines (in bp)
    },
  ) {
    if (this.gridDisplay === "none") return;

    const { canvasWidth, canvasHeight, tracks, domain, gridInterval } = params;

    // Save current GL state
    const oldLineWidth = gl.getParameter(gl.LINE_WIDTH);

    // Determine grid color: use configured color if available, otherwise theme default
    const gridColor =
      this.gridColor ||
      (this.theme === "light"
        ? [0.8, 0.8, 0.8, 1.0] // Light gray for light mode
        : [0.3, 0.3, 0.3, 1.0]); // Dark gray for dark mode

    // Draw horizontal lines (between tracks)
    if (this.gridDisplay === "x" || this.gridDisplay === "x+y") {
      this.drawHorizontalLines(
        gl,
        canvasWidth,
        canvasHeight,
        tracks,
        gridColor,
      );
    }

    // Draw vertical lines (at genomic intervals)
    if (this.gridDisplay === "y" || this.gridDisplay === "x+y") {
      const interval =
        gridInterval || this.calculateAutoInterval(domain.end - domain.start);
      this.drawVerticalLines(
        gl,
        canvasWidth,
        canvasHeight,
        domain,
        interval,
        gridColor,
      );
    }

    // Restore GL state
    gl.lineWidth(oldLineWidth);
  }

  private drawHorizontalLines(
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    tracks: Array<{ y: number; height: number }>,
    color: number[],
  ) {
    gl.lineWidth(1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Simple line drawing using basic GL primitives
    // For a more efficient approach, use shader-based line rendering
    // For now, we'll use the simpler immediate mode approach via scissor test workaround

    // Since we're in WebGL2, we need to use a simple rect shader or line primitives
    // For simplicity, draw thin rectangles as lines
    for (const track of tracks) {
      const y = track.y + track.height; // Bottom edge of track
      this.drawSolidLine(gl, 0, y, width, y, color, height);
    }

    gl.disable(gl.BLEND);
  }

  private drawVerticalLines(
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    domain: { start: number; end: number },
    interval: number,
    color: number[],
  ) {
    gl.lineWidth(1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const domainWidth = domain.end - domain.start;
    const startPos = Math.ceil(domain.start / interval) * interval;

    for (let pos = startPos; pos <= domain.end; pos += interval) {
      const x = ((pos - domain.start) / domainWidth) * width;
      // Draw dashed line effect by drawing segments
      this.drawDashedLine(gl, x, 0, x, height, color, height);
    }

    gl.disable(gl.BLEND);
  }

  private drawSolidLine(
    gl: WebGL2RenderingContext,
    x1: number,
    y1: number,
    x2: number,
    _y2: number,
    color: number[],
    canvasHeight: number,
  ) {
    // Convert to clip space and draw a thin rectangle
    // This is a simplified version - ideally use a shader
    const width = Math.max(1, Math.floor(x2 - x1));
    const y = Math.max(0, Math.floor(canvasHeight - y1 - 1));

    // Ensure scissor region is within canvas bounds
    if (width > 0 && y < canvasHeight) {
      gl.scissor(Math.floor(x1), y, width, 1);
      gl.enable(gl.SCISSOR_TEST);
      gl.clearColor(color[0], color[1], color[2], color[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.SCISSOR_TEST);
    }
  }

  private drawDashedLine(
    gl: WebGL2RenderingContext,
    x: number,
    y1: number,
    _x2: number,
    y2: number,
    color: number[],
    canvasHeight: number,
  ) {
    // Draw dashed line by drawing segments with gaps
    const dashLength = 5;
    const gapLength = 5;
    let currentY = y1;

    const floorX = Math.floor(x);

    while (currentY < y2) {
      const segmentEnd = Math.min(currentY + dashLength, y2);
      const segmentHeight = Math.max(1, Math.floor(segmentEnd - currentY));
      const y = Math.max(0, Math.floor(canvasHeight - segmentEnd));

      // Ensure scissor region is within canvas bounds
      if (segmentHeight > 0 && y < canvasHeight && floorX >= 0) {
        gl.scissor(floorX, y, 1, segmentHeight);
        gl.enable(gl.SCISSOR_TEST);
        gl.clearColor(color[0], color[1], color[2], color[3] * 0.6); // Slightly transparent
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.SCISSOR_TEST);
      }

      currentY += dashLength + gapLength;
    }
  }

  private calculateAutoInterval(domainWidth: number): number {
    // Auto-calculate sensible interval based on domain width
    const targetGridLines = 10; // Aim for ~10 grid lines
    const rawInterval = domainWidth / targetGridLines;

    // Round to nice numbers (powers of 10, or 2*10^n, or 5*10^n)
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
    const normalized = rawInterval / magnitude;

    if (normalized < 2) return magnitude;
    if (normalized < 5) return 2 * magnitude;
    return 5 * magnitude;
  }

  /**
   * Parse CSS color string to RGBA array
   * Supports: hex (#rgb, #rrggbb), rgb/rgba, and named colors
   */
  private parseColor(colorStr: string): number[] {
    // Create a temporary element to parse the color
    const div = document.createElement("div");
    div.style.color = colorStr;
    document.body.appendChild(div);
    const computedColor = window.getComputedStyle(div).color;
    document.body.removeChild(div);

    // Parse rgb/rgba format
    const match = computedColor.match(
      /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/,
    );
    if (match) {
      return [
        parseInt(match[1]) / 255,
        parseInt(match[2]) / 255,
        parseInt(match[3]) / 255,
        match[4] ? parseFloat(match[4]) : 1.0,
      ];
    }

    // Default to gray if parsing fails
    return [0.5, 0.5, 0.5, 1.0];
  }
}
