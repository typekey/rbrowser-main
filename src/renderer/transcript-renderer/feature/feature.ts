import * as twgl from "twgl.js";
import {
  mapValueToColor,
  ColorMapName,
  SequentialScale,
  type IFeatureColorConfig,
} from "../colors/colors";
import type {
  TranscriptRecord,
  ModificationRecord,
} from "../transcript/transform";
import {
  vs2,
  fs,
  vsTexture,
  fsTexture,
  vsTexturedRect,
  fsTexturedRect,
  vsLine,
} from "./webgl/shaders";
import { OverlayRenderer } from "./webgl/overlay-renderer";
import { BuffersManager } from "./webgl/buffers-manager";
import { TextureManager } from "./webgl/texture-manager";
import type { PlotBuildCtx } from "./plots/color";
import { buildRectInstance } from "./plots/rect-renderer";
import { buildBarInstance } from "./plots/bar-renderer";
import { buildPointInstance } from "./plots/point-renderer";
import { buildHeatmapInstance, heatmapColor } from "./plots/heatmap-renderer";
import {
  scoreColor,
  makeDiamondColorCtx,
  diamondColorInto,
} from "./plots/color";
import {
  buildDiamondInstance,
  finalizeDiamondScores,
} from "./plots/diamond-renderer";
import { buildDiamondXInstance } from "./plots/diamondX-renderer";
import { buildSequenceInstance } from "./plots/sequence-renderer";
import {
  ModificationRenderer,
  type ModRenderParams,
} from "./plots/modification-renderer";
import {
  renderBam as _renderBam,
  type BamRead,
  type BamRenderParams,
} from "./plots/bam-renderer";
import {
  renderTranscript as _renderTranscript,
  type TranscriptRenderParams,
} from "./plots/transcript-renderer";
import {
  renderVariant as _renderVariant,
  type VariantRecord,
  type VariantRenderParams,
} from "./plots/variant-renderer";
import {
  CoverageRenderer,
  type CoverageRenderParams,
} from "./plots/coverage-renderer";
import { logger } from "../utils/logger";

export type { IFeatureColorConfig };

export class FeatureRenderer {
  private programInfo: twgl.ProgramInfo;
  private lineProgramInfo: twgl.ProgramInfo;

  // GPU + CPU geometry buffers (instanced-quad + line), owned by the manager
  // so the buffer lifecycle lives outside this file.
  readonly buffers: BuffersManager;

  // ── Diamond (textured) state ─────────────────────────────────────────
  private textureProgramInfo: twgl.ProgramInfo;

  // ── Textured rect (high-quality) state ─────────────────────────────
  private texturedRectProgramInfo: twgl.ProgramInfo;

  // ── GPU textures (diamond sprite + ele_grays), owned by the manager ──
  // Public so channels can drive texture loading directly.
  readonly textures: TextureManager;

  // ── Canvas-overlay (offscreen → WebGL texture) — self-contained sub-renderer ──
  private readonly overlayRenderer: OverlayRenderer;

  /** Which render path the current data uses */
  currentPlotType: string = "";

  /** Whether to apply base complement mapping for sequence rendering */
  public complementMode: boolean = false;

  // The quad geometry – never changes, created once in the constructor
  readonly quadArrays: any;

  // Keep a reference to gl for cleanup
  private gl: WebGL2RenderingContext;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.programInfo = twgl.createProgramInfo(gl, [vs2, fs]);
    this.lineProgramInfo = twgl.createProgramInfo(gl, [vsLine, fs]);
    this.textureProgramInfo = twgl.createProgramInfo(gl, [
      vsTexture,
      fsTexture,
    ]);
    this.texturedRectProgramInfo = twgl.createProgramInfo(gl, [
      vsTexturedRect,
      fsTexturedRect,
    ]);
    // Canvas-overlay blitting is a self-contained sub-renderer (owns its own
    // program / quad buffer / texture).
    this.overlayRenderer = new OverlayRenderer(gl);
    this.textures = new TextureManager(gl);
    this.buffers = new BuffersManager(gl);
    this.modRenderer = new ModificationRenderer();
    this.covRenderer = new CoverageRenderer();

    // Basic Unit Quad – 2 triangles, 6 vertices
    this.quadArrays = {
      position: {
        numComponents: 2,
        data: new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      },
    };
  }

  /** Free all WebGL resources. Must be called when the channel is destroyed. */
  destroy(): void {
    this.buffers.destroy();
    this.textures.destroy();
    this.modRenderer.destroy(this.gl);
    this.covRenderer.destroy(this.gl);
  }

  renderModifications(
    gl: WebGL2RenderingContext,
    mods: ModificationRecord[],
    transcripts: TranscriptRecord[],
    params: ModRenderParams,
  ): void {
    this.modRenderer.render(gl, this.programInfo, mods, transcripts, params);
  }

  /**
   * Re-compute only the colour array and re-upload the colour GPU buffer,
   */
  refreshColorsOnly(
    gl: WebGL2RenderingContext,
    data: any[],
    plotType: string,
    colors?: IFeatureColorConfig,
    defaultColor?: string,
    maxValue?: number,
  ): void {
    if (this.buffers.numInstances === 0 && this.buffers.lineVertexCount === 0)
      return;

    // Normalise plot-type aliases before any branching.
    if (plotType === "score_rect") plotType = "heatmap";

    // Parse default color once
    let defaultR = 0.5,
      defaultG = 0.5,
      defaultB = 0.5;
    if (defaultColor) {
      const hexMatch = defaultColor.match(
        /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i,
      );
      if (hexMatch) {
        defaultR = parseInt(hexMatch[1], 16) / 255;
        defaultG = parseInt(hexMatch[2], 16) / 255;
        defaultB = parseInt(hexMatch[3], 16) / 255;
      }
    }

    /** Resolve the effective [min, max] range, respecting the reversed flag. */
    const resolveRange = (
      base: [number, number] | undefined,
    ): [number, number] => {
      const r: [number, number] = base ?? [
        0,
        maxValue && maxValue > 0 ? maxValue : 100,
      ];
      return colors?.reversed ? [r[1], r[0]] : r;
    };

    // ── LINE plot: re-compute line colour array ──
    if (
      plotType === "line" &&
      this.buffers.lineBufferInfo &&
      this.buffers.lineVertexCount > 0
    ) {
      let vtxCount = 0;
      for (let i = 0; i < data.length; i++) {
        const record = data[i];
        const score = record.score || 0;
        let lr = defaultR,
          lg = defaultG,
          lb = defaultB;
        if (colors?.colormap) {
          const effectiveRange = resolveRange(colors.range);
          const [cr, cg, cb] = mapValueToColor(
            score,
            colors.colormap as ColorMapName,
            effectiveRange,
          );
          lr = cr;
          lg = cg;
          lb = cb;
        }
        const cb2 = vtxCount * 4;
        this.buffers.lineColorArray[cb2] = lr;
        this.buffers.lineColorArray[cb2 + 1] = lg;
        this.buffers.lineColorArray[cb2 + 2] = lb;
        this.buffers.lineColorArray[cb2 + 3] = 1;
        vtxCount++;
      }
      const colSlice = this.buffers.lineColorArray.subarray(0, vtxCount * 4);
      twgl.setAttribInfoBufferFromArray(
        gl,
        this.buffers.lineBufferInfo.attribs!["a_color"],
        colSlice,
        0,
      );
      return;
    }

    // ── Instanced-quad plots (bar, bigwig, heatmap, point, diamond, rect) ──
    if (!this.buffers.bufferInfo || this.buffers.numInstances === 0) return;

    // Base alpha from config (default 1.0 = fully opaque)
    const baseAlpha = Math.min(1, Math.max(0, colors?.alpha ?? 1));

    // Diamond colour context (colorBy/alphaBy) computed once; rect and other
    // non-diamond types get an inactive ctx and fall back to (r, g, b).
    const dcCtx = makeDiamondColorCtx(
      plotType === "diamond" ? colors : undefined,
    );
    const colorOut: [number, number, number, number] = [0, 0, 0, 0];

    let idx = 0;
    for (let i = 0; i < data.length; i++) {
      if (idx >= this.buffers.numInstances) break;
      const record = data[i];
      const r = defaultColor ? defaultR : ((i * 30) % 255) / 255;
      const g = defaultColor ? defaultG : ((i * 60) % 255) / 255;
      const b = defaultColor ? defaultB : ((i * 90) % 255) / 255;

      if (plotType === "bar" || plotType === "bigwig" || plotType === "point") {
        const [R, G, B] = scoreColor(
          record.score || 0,
          r,
          g,
          b,
          colors,
          resolveRange,
        );
        const base = idx * 4;
        this.buffers.colorArray[base] = R;
        this.buffers.colorArray[base + 1] = G;
        this.buffers.colorArray[base + 2] = B;
        this.buffers.colorArray[base + 3] = baseAlpha;
        idx++;
      } else if (plotType === "heatmap") {
        const [R, G, B] = heatmapColor(
          record.score || 0,
          colors,
          resolveRange,
          maxValue,
        );
        const base = idx * 4;
        this.buffers.colorArray[base] = R;
        this.buffers.colorArray[base + 1] = G;
        this.buffers.colorArray[base + 2] = B;
        this.buffers.colorArray[base + 3] = baseAlpha;
        idx++;
      } else {
        // rect, diamond, etc. — diamondColorInto applies data-driven
        // colorBy/alphaBy when the ctx is active, else writes (r, g, b).
        diamondColorInto(colorOut, record, r, g, b, baseAlpha, dcCtx);
        const base = idx * 4;
        this.buffers.colorArray[base] = colorOut[0];
        this.buffers.colorArray[base + 1] = colorOut[1];
        this.buffers.colorArray[base + 2] = colorOut[2];
        this.buffers.colorArray[base + 3] = colorOut[3];
        idx++;
      }
    }

    // Upload only the colour buffer
    const colorSlice = this.buffers.colorArray.subarray(
      0,
      this.buffers.numInstances * 4,
    );
    twgl.setAttribInfoBufferFromArray(
      gl,
      this.buffers.bufferInfo.attribs!["instance_color"],
      colorSlice,
      0,
    );
  }

  updateData(
    gl: WebGL2RenderingContext,
    data: any[],
    plotType: string,
    region: { chr: string; start: number; end: number },
    colors?: IFeatureColorConfig,
    defaultColor?: string,
    maxValue?: number,
  ) {
    // ── Parse default color once ──
    // Normalise plot-type aliases before any branching.
    if (plotType === "score_rect") plotType = "heatmap";

    let defaultR = 0.5,
      defaultG = 0.5,
      defaultB = 0.5;
    if (defaultColor) {
      const hexMatch = defaultColor.match(
        /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i,
      );
      if (hexMatch) {
        defaultR = parseInt(hexMatch[1], 16) / 255;
        defaultG = parseInt(hexMatch[2], 16) / 255;
        defaultB = parseInt(hexMatch[3], 16) / 255;
      }
    }

    /** Resolve the effective [min, max] range, swapped when reversed. */
    const resolveRange = (
      base: [number, number] | undefined,
    ): [number, number] => {
      const r: [number, number] = base ?? [
        0,
        maxValue && maxValue > 0 ? maxValue : 100,
      ];
      return colors?.reversed ? [r[1], r[0]] : r;
    };

    // ── Grow reusable JS arrays if needed (no GC on normal frames) ──
    const needed = data.length;
    if (needed > this.buffers.rectArray.length / 4) {
      // Pre-allocate 1.5× to amortise future growth (same as genome-spy pattern)
      const alloc = Math.ceil(needed * 1.5);
      this.buffers.rectArray = new Float32Array(alloc * 4);
      this.buffers.colorArray = new Float32Array(alloc * 4);
    }

    // Base alpha from config (default 1.0 = fully opaque)
    const baseAlpha = Math.min(1, Math.max(0, colors?.alpha ?? 1));

    // ── Pre-compute diamond data-driven field indices ONCE ──────────
    // Avoids calling keys.indexOf() on every record in the hot loop.
    let dmColorByIdx = -1;
    let dmSizeByIdx = -1;
    let dmAlphaByIdx = -1;
    let dmHasDataDriven = false;
    let dmEffectiveRange: [number, number] = [0, 1];
    let dmSizeRange: [number, number] = [0.1, 1];
    let dmAlphaRange: [number, number] = [0.1, 1];
    let dmColormap: string | undefined;
    let dmReversedRange: [number, number] | undefined;
    let dmScale: SequentialScale | null = null;

    if (
      colors &&
      (colors.colorBy || colors.sizeBy || colors.alphaBy) &&
      colors._keys &&
      colors._sep
    ) {
      dmHasDataDriven = true;
      dmEffectiveRange = colors.range ?? [0, 1];
      if (colors.colorBy) {
        dmColorByIdx = colors._keys.indexOf(colors.colorBy);
        dmColormap = colors.colormap;
        dmReversedRange = colors.reversed
          ? [dmEffectiveRange[1], dmEffectiveRange[0]]
          : undefined;
        // Pre-create the SequentialScale ONCE so the hot loop avoids
        // constructing a new scale (+ hexToRgb regex) per record.
        if (dmColormap) {
          dmScale = new SequentialScale(
            dmColormap as ColorMapName,
            dmReversedRange ?? dmEffectiveRange,
          );
        }
      }
      if (colors.sizeBy) {
        dmSizeByIdx = colors._keys.indexOf(colors.sizeBy);
        dmSizeRange = colors.sizeRange ?? [0.1, 1];
      }
      if (colors.alphaBy) {
        dmAlphaByIdx = colors._keys.indexOf(colors.alphaBy);
        dmAlphaRange = colors.alphaRange ?? [0.1, 1];
      }
    }
    // Pre-compute range denominators to avoid division in the loop
    const dmRangeDenom = dmEffectiveRange[1] - dmEffectiveRange[0] || 1;

    // ── Fill the typed arrays directly (no intermediate number[]) ──
    const regionStartOffset = region.start;
    let instanceCount = 0;

    // Shared context for the per-plot-type geometry builders. Built once and
    // reused across every record (no per-record allocation). Each builder
    // fills a slice of rectArray/colorArray and returns the new instanceCount.
    const plotCtx: PlotBuildCtx = {
      rectArray: this.buffers.rectArray,
      colorArray: this.buffers.colorArray,
      baseAlpha,
      colors,
      maxValue,
      resolveRange,
      complementMode: this.complementMode,
      diamond: {
        hasDataDriven: dmHasDataDriven,
        colorByIdx: dmColorByIdx,
        scale: dmScale,
        sizeByIdx: dmSizeByIdx,
        sizeRange: dmSizeRange,
        alphaByIdx: dmAlphaByIdx,
        alphaRange: dmAlphaRange,
        effectiveRange: dmEffectiveRange,
        rangeDenom: dmRangeDenom,
      },
    };

    for (let i = 0; i < data.length; i++) {
      const record = data[i];

      const r = defaultColor ? defaultR : ((i * 30) % 255) / 255;
      const g = defaultColor ? defaultG : ((i * 60) % 255) / 255;
      const b = defaultColor ? defaultB : ((i * 90) % 255) / 255;

      const recordStart = record.chromStart ?? record.start ?? 0;
      const recordEnd = record.chromEnd ?? record.end ?? 0;
      const recStart = recordStart - regionStartOffset;
      const recWidth = recordEnd - recordStart;

      if (plotType === "transcript" || plotType === "rna") {
        // Dedicated renderTranscript() path — raw records are not processed
        // here; TranscriptRecord[] goes straight to renderTranscript().
        this.currentPlotType = "transcript";
        return;
      } else if (plotType === "bam") {
        // BAM uses a dedicated renderBam() path with lane-based layout.
        // Raw BamRecord[] are processed in the channel layer.
        this.currentPlotType = "bam";
        return;
      } else if (plotType === "motif") {
        // Motif uses a dedicated Canvas 2D overlay — no WebGL geometry.
        this.currentPlotType = "motif";
        return;
      } else if (plotType === "rect") {
        instanceCount = buildRectInstance(
          record,
          recStart,
          recWidth,
          r,
          g,
          b,
          instanceCount,
          plotCtx,
        );
      } else if (plotType === "bar" || plotType === "bigwig") {
        instanceCount = buildBarInstance(
          record,
          recStart,
          recWidth,
          r,
          g,
          b,
          instanceCount,
          plotCtx,
        );
      } else if (plotType === "line") {
        // Dedicated LINE_STRIP path handled below after the loop — skip the
        // instanced-quad path here.
      } else if (plotType === "point") {
        instanceCount = buildPointInstance(
          record,
          recStart,
          recWidth,
          r,
          g,
          b,
          instanceCount,
          plotCtx,
        );
      } else if (plotType === "heatmap") {
        instanceCount = buildHeatmapInstance(
          record,
          recStart,
          recWidth,
          r,
          g,
          b,
          instanceCount,
          plotCtx,
        );
      } else if (plotType === "diamond") {
        instanceCount = buildDiamondInstance(
          record,
          recStart,
          recWidth,
          r,
          g,
          b,
          instanceCount,
          plotCtx,
        );
      } else if (plotType === "diamondX") {
        instanceCount = buildDiamondXInstance(
          record,
          recStart,
          recWidth,
          r,
          g,
          b,
          instanceCount,
          plotCtx,
        );
      } else if (plotType === "sequence") {
        instanceCount = buildSequenceInstance(
          record,
          recStart,
          recWidth,
          r,
          g,
          b,
          instanceCount,
          plotCtx,
        );
      } else if (plotType === "variant") {
        // Variant uses a dedicated renderVariant() path with lane-based layout.
        // VCF records are lane-assigned in the channel layer.
        this.currentPlotType = "variant";
        return;
      } else if (plotType === "score_curve") {
        // ScoreCurveView draws arcs to a 2D canvas blitted via
        // renderOverlayTexture() — it never uses the quad buffers built here.
        this.currentPlotType = "score_curve";
        return;
      } else {
        logger.warn(`[FeatureRenderer] Unknown plot type: ${plotType}`);
      }
    }

    this.currentPlotType = plotType;

    // Diamond post-pass: assign golden-ratio quasi-random semantic scores.
    if (plotType === "diamond" && instanceCount > 0) {
      finalizeDiamondScores(this.buffers.rectArray, instanceCount);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LINE plot: build a LINE_STRIP vertex buffer (separate from quads)
    // ═══════════════════════════════════════════════════════════════════════
    if (plotType === "line") {
      this.buffers.deleteBuffers(); // not using instanced quads
      this.buffers.numInstances = 0;

      const n = data.length;
      if (n === 0) {
        this.buffers.deleteLineBuffers();
        return;
      }

      // Grow reusable arrays lazily
      if (n > this.buffers.linePosArray.length / 2) {
        const alloc = Math.ceil(n * 1.5);
        this.buffers.linePosArray = new Float32Array(alloc * 2);
        this.buffers.lineColorArray = new Float32Array(alloc * 4);
      }

      const norm =
        maxValue && maxValue > 0 ? maxValue : (colors?.range?.[1] ?? 100);
      let vtxCount = 0;

      for (let i = 0; i < n; i++) {
        const rec = data[i];
        const recStart2 =
          (rec.chromStart ?? rec.start ?? 0) - regionStartOffset;
        const recEnd2 = (rec.chromEnd ?? rec.end ?? 0) - regionStartOffset;
        const midX = recStart2 + (recEnd2 - recStart2) * 0.5;
        const score = rec.score || 0;
        const yNorm = 1.0 - Math.min(1.0, Math.max(0, score) / norm);

        let lr = defaultR,
          lg = defaultG,
          lb = defaultB;
        if (colors?.colormap) {
          const effectiveRange = resolveRange(colors.range);
          const [cr, cg, cb] = mapValueToColor(
            score,
            colors.colormap as ColorMapName,
            effectiveRange,
          );
          lr = cr;
          lg = cg;
          lb = cb;
        }

        const pb = vtxCount * 2;
        this.buffers.linePosArray[pb] = midX;
        this.buffers.linePosArray[pb + 1] = yNorm;

        const cb2 = vtxCount * 4;
        this.buffers.lineColorArray[cb2] = lr;
        this.buffers.lineColorArray[cb2 + 1] = lg;
        this.buffers.lineColorArray[cb2 + 2] = lb;
        this.buffers.lineColorArray[cb2 + 3] = 1;
        vtxCount++;
      }

      this.buffers.lineVertexCount = vtxCount;

      // Upload to GPU
      const posSlice = this.buffers.linePosArray.subarray(0, vtxCount * 2);
      const colSlice = this.buffers.lineColorArray.subarray(0, vtxCount * 4);

      if (
        this.buffers.lineBufferInfo &&
        vtxCount <= this.buffers.allocatedLineVertices
      ) {
        twgl.setAttribInfoBufferFromArray(
          gl,
          this.buffers.lineBufferInfo.attribs!["a_pos"],
          posSlice,
          0,
        );
        twgl.setAttribInfoBufferFromArray(
          gl,
          this.buffers.lineBufferInfo.attribs!["a_color"],
          colSlice,
          0,
        );
      } else {
        this.buffers.deleteLineBuffers();
        const alloc = Math.ceil(vtxCount * 1.5);
        this.buffers.allocatedLineVertices = alloc;
        const posAlloc = new Float32Array(alloc * 2);
        const colAlloc = new Float32Array(alloc * 4);
        posAlloc.set(posSlice);
        colAlloc.set(colSlice);

        this.buffers.lineBufferInfo = twgl.createBufferInfoFromArrays(gl, {
          a_pos: { numComponents: 2, data: posAlloc },
          a_color: { numComponents: 4, data: colAlloc },
        });
        this.buffers.lineVertexCount = vtxCount;
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Non-line plots: instanced quads
    // ═══════════════════════════════════════════════════════════════════════
    this.buffers.deleteLineBuffers(); // not using line buffer
    this.buffers.numInstances = instanceCount;

    if (instanceCount === 0) {
      this.buffers.deleteBuffers();
      return;
    }

    // ── Upload to GPU ─────────────────────────────────────────────
    const rectSlice = this.buffers.rectArray.subarray(0, instanceCount * 4);
    const colorSlice = this.buffers.colorArray.subarray(0, instanceCount * 4);

    if (
      this.buffers.bufferInfo &&
      instanceCount <= this.buffers.allocatedInstances
    ) {
      twgl.setAttribInfoBufferFromArray(
        gl,
        this.buffers.bufferInfo.attribs!["instance_rect"],
        rectSlice,
        0,
      );
      twgl.setAttribInfoBufferFromArray(
        gl,
        this.buffers.bufferInfo.attribs!["instance_color"],
        colorSlice,
        0,
      );
    } else {
      this.buffers.deleteBuffers();
      const alloc = Math.ceil(instanceCount * 1.5);
      this.buffers.allocatedInstances = alloc;

      const rectAlloc = new Float32Array(alloc * 4);
      const colorAlloc = new Float32Array(alloc * 4);
      rectAlloc.set(rectSlice);
      colorAlloc.set(colorSlice);

      this.buffers.bufferInfo = twgl.createBufferInfoFromArrays(gl, {
        ...this.quadArrays,
        instance_rect: { numComponents: 4, data: rectAlloc, divisor: 1 },
        instance_color: { numComponents: 4, data: colorAlloc, divisor: 1 },
      });

      this.buffers.numInstances = instanceCount;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Transcript rendering — unified in FeatureRenderer
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * All-in-one transcript rendering (intron backbone + exon/CDS/UTR parts).
   * Delegates to the transcript renderer, which builds geometry into the shared
   * instanced buffer and draws via `render()`.
   */
  renderTranscript(
    gl: WebGL2RenderingContext,
    records: TranscriptRecord[],
    params: TranscriptRenderParams,
  ): void {
    _renderTranscript(this, gl, records, params);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Modification marker rendering (inverted triangles on transcript)
  // ═══════════════════════════════════════════════════════════════════════

  // RNA modification markers (▼) are rendered by their own sub-renderer.
  private readonly modRenderer: ModificationRenderer;

  // BAM coverage histogram is rendered by its own sub-renderer.
  private readonly covRenderer: CoverageRenderer;

  /**
   * All-in-one BAM read rendering. Delegates to the BAM renderer, which builds
   * geometry into the shared instanced buffer and draws via `render()`.
   */
  renderBam(
    gl: WebGL2RenderingContext,
    reads: BamRead[],
    params: BamRenderParams,
  ): void {
    _renderBam(this, gl, reads, params);
  }

  /**
   * Render VCF variant records as lane-stacked coloured rectangles (colour by
   * ALT base). Delegates to the variant renderer.
   */
  renderVariant(
    gl: WebGL2RenderingContext,
    records: VariantRecord[],
    params: VariantRenderParams,
  ): void {
    _renderVariant(this, gl, records, params);
  }

  /**
   * Render a BAM read-depth coverage histogram (bar / line / heatmap / point).
   * Delegates to CoverageRenderer.
   */
  renderBamCoverage(
    gl: WebGL2RenderingContext,
    coverage: Float32Array,
    maxDepth: number,
    params: CoverageRenderParams,
  ): void {
    this.covRenderer.render(this, gl, coverage, maxDepth, params);
  }

  render(
    gl: WebGL2RenderingContext,
    params: {
      domain: [number, number]; // start, length
      resolution: [number, number];
      layout: [number, number, number, number]; // x, y, w, h
      diamondSize?: number; // diamond size in pixels
      semanticThreshold?: number; // semantic zoom threshold (0 = all visible, 1 = none)
      mode?: "high" | "low"; // rendering quality mode
      alpha?: number; // global alpha multiplier for stacked rendering (default 1.0)
    },
  ) {
    const globalAlpha = params.alpha ?? 1.0;
    const uniforms = {
      u_domain: params.domain,
      u_resolution: params.resolution,
      u_layout: params.layout,
      u_alpha: globalAlpha,
    };

    const highQuality =
      params.mode === "high" &&
      this.textures.isEleGraysReady &&
      !!this.textures.eleGrays;

    // ── LINE_STRIP path ────────────────────────────────────────────────
    if (this.currentPlotType === "line") {
      if (!this.buffers.lineBufferInfo || this.buffers.lineVertexCount === 0)
        return;
      gl.useProgram(this.lineProgramInfo.program);
      twgl.setBuffersAndAttributes(
        gl,
        this.lineProgramInfo,
        this.buffers.lineBufferInfo,
      );
      twgl.setUniforms(this.lineProgramInfo, uniforms);
      gl.drawArrays(gl.LINE_STRIP, 0, this.buffers.lineVertexCount);
      return;
    }

    // ── Diamond (textured instanced-quad) path ─────────────────────────
    if (this.currentPlotType === "diamond") {
      if (!this.buffers.bufferInfo || this.buffers.numInstances === 0) {
        return;
      }
      if (!this.textures.diamond) {
        return;
      }

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(this.textureProgramInfo.program);
      twgl.setBuffersAndAttributes(
        gl,
        this.textureProgramInfo,
        this.buffers.bufferInfo,
      );
      twgl.setUniforms(this.textureProgramInfo, {
        ...uniforms,
        u_texture: this.textures.diamond,
        u_diamondSize: params.diamondSize ?? 16.0,
        u_semanticThreshold: params.semanticThreshold ?? 0.0,
      });
      twgl.drawBufferInfo(
        gl,
        this.buffers.bufferInfo,
        gl.TRIANGLES,
        this.buffers.bufferInfo.numElements,
        0,
        this.buffers.numInstances,
      );

      gl.disable(gl.BLEND);
      return;
    }

    // ── Instanced-quad path (rect / bar / heatmap / etc.) ──────────────
    if (!this.buffers.bufferInfo || this.buffers.numInstances === 0) return;

    if (highQuality) {
      // High-quality: use textured rect shader with ele_grays texture
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(this.texturedRectProgramInfo.program);
      twgl.setBuffersAndAttributes(
        gl,
        this.texturedRectProgramInfo,
        this.buffers.bufferInfo,
      );
      twgl.setUniforms(this.texturedRectProgramInfo, {
        ...uniforms,
        u_texture: this.textures.eleGrays,
      });
      twgl.drawBufferInfo(
        gl,
        this.buffers.bufferInfo,
        gl.TRIANGLES,
        this.buffers.bufferInfo.numElements,
        0,
        this.buffers.numInstances,
      );

      gl.disable(gl.BLEND);
    } else {
      // Low-quality: plain flat-color instanced quads
      gl.useProgram(this.programInfo.program);
      twgl.setBuffersAndAttributes(
        gl,
        this.programInfo,
        this.buffers.bufferInfo,
      );
      twgl.setUniforms(this.programInfo, uniforms);
      twgl.drawBufferInfo(
        gl,
        this.buffers.bufferInfo,
        gl.TRIANGLES,
        this.buffers.bufferInfo.numElements,
        0,
        this.buffers.numInstances,
      );
    }
  }
  renderOverlayTexture(
    gl: WebGL2RenderingContext,
    canvas: HTMLCanvasElement,
    params: {
      resolution: [number, number];
      layout: [number, number, number, number];
    },
    /** When true and a texture already exists, skip re-uploading the canvas pixels. */
    skipUpload?: boolean,
  ): void {
    this.overlayRenderer.render(gl, canvas, params, skipUpload);
  }
}
