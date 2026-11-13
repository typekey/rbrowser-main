import type { ITRConfig, IDefaultLocus } from "../config/config";
import { ChannelView, IChannel } from "../channel/index";
import { COLORMAP_GRADIENTS } from "../colors/color_map";
import { buildPublishFigureSVG, type PublishTrackFragment } from "./publish-figure";
import { buildPublishScoreDiamonds } from "./publish-diamonds";
import * as XLSX from "xlsx";
import type { BaseRenderer } from "../core/base-renderer";
import { logger } from "../utils/logger";

/**
 * Data / image / figure export subsystem: per-channel data downloads (CSV /
 * JSON / XML / XLSX / FASTA / BED), image export (PNG / SVG / PDF), the
 * isolated- and hybrid-channel SVG builders, the publication figure pipeline,
 * the SVG→PNG / SVG→PDF rasterisers, and the config snapshot (exportConfig).
 */
export class ExportManager {
  /** Monotonic counter for unique SVG <clipPath> ids across one export. */
  private _svgClipCounter = 0;

  constructor(private readonly r: BaseRenderer) {}

  /**
   * Download the current channel's data in the specified format.
   * All formats include the chromosome id from the data region.
   *
   * Format availability is per-plot-type (menu is already filtered):
   *  - sequence  → FASTA only
   *  - transcript → CSV / JSON / XML / XLSX (structured transcript records)
   *  - variant   → all (detailed; nested INFO flattened)
   *  - bam       → export disabled (menu hidden)
   *  - others    → all formats (BED / CSV / JSON / XML / XLSX)
   */
  public downloadTrackData(channel: ChannelView, format: string): void {
    const channelConfig = channel.getChannelConfig();
    const plotType = channelConfig.plot ?? "rect";
    const dataMethod = channelConfig.data?.method ?? "remote";
    void channelConfig.data?.format; // available for format-specific logic

    const region = channel.getDataRegion();
    const chrId = region.chr || "unknown";

    // ── FASTA export (sequence plot) ────────────────────────────────────
    if (format === "FASTA") {
      const data = channel.getRawData();
      if (!data || data.length === 0) {
        logger.warn(`[Download] No data available for "${channel.name}"`);
        return;
      }
      // Use the current visible viewport region
      const vd = this.r.getViewDomain();
      const regionStart = Math.round(vd.start);
      const regionEnd = Math.round(vd.end);
      const regionStr = `${chrId}:${regionStart.toLocaleString()}-${regionEnd.toLocaleString()}`;

      // data records: { start, end, base, score }
      const sorted = [...data].sort(
        (a: any, b: any) => (a.start ?? 0) - (b.start ?? 0),
      );
      const seq = sorted.map((d: any) => d.base ?? "N").join("");
      const header = `>RBrowser_${regionStr}`;
      // Wrap sequence at 80 chars per line
      const lines = [header];
      for (let i = 0; i < seq.length; i += 80) {
        lines.push(seq.substring(i, i + 80));
      }
      const content = lines.join("\n");
      const safeRegion = regionStr.replace(/[<>:"/\\|?*]/g, "_");
      this.triggerDownload(content, `RBrowser_${safeRegion}.fa`, "text/plain");
      return;
    }

    // ── Transcript plot: export structured transcript records ────────────
    if (plotType === "transcript") {
      const transcripts = channel.getTranscriptRecords();
      if (!transcripts || transcripts.length === 0) {
        logger.warn(
          `[Download] No transcript data available for "${channel.name}"`,
        );
        return;
      }
      // Flatten each TranscriptRecord into rows with parts expanded
      const enriched = transcripts.map((tx: any) => ({
        chr: chrId,
        transcriptId: tx.transcriptId ?? "",
        transcriptName: tx.transcriptName ?? "",
        geneName: tx.geneName ?? "",
        strand: tx.strand ?? ".",
        transcriptType: tx.transcriptType ?? "",
        txStart: tx.txStart ?? 0,
        txEnd: tx.txEnd ?? 0,
        lane: tx.lane ?? 0,
        parts: Array.isArray(tx.parts)
          ? tx.parts
              .map((p: any) => `${p.type ?? ""}:${p.start ?? 0}-${p.end ?? 0}`)
              .join("; ")
          : "",
      }));
      this.exportFormattedData(channel, enriched, format);
      return;
    }

    // ── Standard data export ────────────────────────────────────────────
    const data = channel.getRawData();
    if (!data || data.length === 0) {
      logger.warn(`[Download] No data available for "${channel.name}"`);
      return;
    }

    // Enrich, fix strand, flatten objects
    const enriched = data.map((d: any) => {
      const out: any = !d.chr && !d.chrom ? { chr: chrId, ...d } : { ...d };

      // Convert numeric strand back to symbolic "+"/"-"/"."
      if ("strand" in out) {
        const s = out.strand;
        if (s === 1 || s === "1") out.strand = "+";
        else if (s === -1 || s === "-1") out.strand = "-";
        else if (
          s === 0 ||
          s === "0" ||
          s === "." ||
          s === null ||
          s === undefined
        )
          out.strand = ".";
      }

      // ── Variant: flatten INFO and arrays ──────────────────────────────
      if (plotType === "variant") {
        if (out.INFO && typeof out.INFO === "object") {
          const info = out.INFO;
          for (const [k, v] of Object.entries(info)) {
            out[`INFO_${k}`] = Array.isArray(v) ? v.join(",") : String(v ?? "");
          }
          delete out.INFO;
        }
        if (Array.isArray(out.alt)) out.alt = out.alt.join(",");
        if (Array.isArray(out.ALT)) out.ALT = out.ALT.join(",");
        if (Array.isArray(out.ID)) out.id = out.ID.join(";");

        // Remove @gmod/vcf internal fields
        delete out.CHROM;
        delete out.POS;
        delete out.REF;
        delete out.ALT;
        delete out.ID;
        delete out.QUAL;
        delete out.FILTER;
        delete out.FORMAT;
      }

      // ── Buildin channels: clean up name column ────────────────────────
      if (dataMethod === "buildin" || dataMethod === "built-in") {
        const buildinFormat = channelConfig.data?.format ?? "";
        if (buildinFormat === "exon" || buildinFormat === "junction") {
          // Name = {Tissue}_{ID} for per-tissue, or just {ID} for aggregate
          const id = out.id ?? "";
          if (out.Tissue) {
            out.name = `${out.Tissue}_${id}`;
          } else {
            out.name = id || ".";
          }
        } else if (buildinFormat === "transcript") {
          // Use featureType as the name column for transcript structure
          if (!out.name || out.name === ".") {
            out.name = out.featureType ?? out.annotation ?? ".";
          }
        } else {
          // Generic fallback
          if (!out.name || out.name === ".") {
            out.name =
              out.featureType ?? out.annotation ?? out.type ?? out.name ?? ".";
          }
        }
        delete out._buildinTranscript;
        delete out._parentAggregate;
      }

      return out;
    });

    // ── Remove internal / junk keys ─────────────────────────────────────
    // Keys that are never useful in exports
    const internalKeys = new Set([
      "uniqueId",
      "_key",
      "_generation",
      "_tileIdx",
      "_index",
      "_parentAggregate",
      "_buildinTranscript",
      "rest", // BigBed raw rest (we already parsed it)
    ]);

    const cleaned = enriched.map((d: any) => {
      const row: any = {};
      for (const [k, v] of Object.entries(d)) {
        if (internalKeys.has(k)) continue;
        // Stringify any remaining nested objects/arrays
        if (v !== null && v !== undefined && typeof v === "object") {
          if (Array.isArray(v)) {
            row[k] = v.join(",");
          } else {
            row[k] = JSON.stringify(v);
          }
        } else {
          row[k] = v;
        }
      }
      return row;
    });

    this.exportFormattedData(channel, cleaned, format);
  }

  /** Generic helper: export an array of flat record objects in the given format. */
  private exportFormattedData(
    channel: ChannelView,
    enriched: any[],
    format: string,
  ): void {
    const chrId = enriched[0]?.chr ?? channel.getDataRegion().chr ?? "unknown";

    let content: string;
    let mimeType: string;
    let ext: string;

    switch (format) {
      case "BED": {
        const lines = enriched.map((d: any) => {
          const chr = d.chr ?? d.chrom ?? chrId;
          const start = d.start ?? d.chromStart ?? 0;
          const end = d.end ?? d.chromEnd ?? 0;
          const name = d.name ?? d.annotation ?? ".";
          const score = d.score ?? 0;
          const strand = d.strand ?? ".";
          return `${chr}\t${start}\t${end}\t${name}\t${score}\t${strand}`;
        });
        content = lines.join("\n");
        mimeType = "text/tab-separated-values";
        ext = "bed";
        break;
      }
      case "CSV": {
        const keys = Object.keys(enriched[0]);
        const header = keys.join(",");
        const rows = enriched.map((d: any) =>
          keys
            .map((k) => {
              const v = d[k];
              if (v === null || v === undefined) return "";
              const s = String(v);
              return s.includes(",") || s.includes('"') || s.includes("\n")
                ? `"${s.replace(/"/g, '""')}"`
                : s;
            })
            .join(","),
        );
        content = [header, ...rows].join("\n");
        mimeType = "text/csv";
        ext = "csv";
        break;
      }
      case "JSON": {
        content = JSON.stringify(enriched, null, 2);
        mimeType = "application/json";
        ext = "json";
        break;
      }
      case "XML": {
        const xmlRows = enriched.map((d: any) => {
          const fields = Object.entries(d)
            .map(([k, v]) => `    <${k}>${this.escXml(String(v ?? ""))}</${k}>`)
            .join("\n");
          return `  <record>\n${fields}\n  </record>`;
        });
        content = `<?xml version="1.0" encoding="UTF-8"?>\n<tracks>\n${xmlRows.join("\n")}\n</tracks>`;
        mimeType = "application/xml";
        ext = "xml";
        break;
      }
      case "XLSX": {
        try {
          const keys = Object.keys(enriched[0]);
          const wsData = [
            keys,
            ...enriched.map((d: any) =>
              keys.map((k) => {
                const v = d[k];
                if (v === null || v === undefined) return "";
                if (typeof v === "object") return JSON.stringify(v);
                return v;
              }),
            ),
          ];
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.aoa_to_sheet(wsData);
          XLSX.utils.book_append_sheet(wb, ws, channel.name.substring(0, 31));
          const xlsxBuf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
          const blob = new Blob([xlsxBuf], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = this.formatExportFilename(channel.name, "xlsx");
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (e) {
          logger.error("[Download] XLSX export error:", e);
        }
        return;
      }
      default:
        logger.warn(`[Download] Unknown format: ${format}`);
        return;
    }

    this.triggerDownload(
      content,
      this.formatExportFilename(channel.name, ext),
      mimeType,
    );
  }

  /**
   * Export all visible channels as a single combined image.
   * Uses the same hybrid SVG pipeline as the per-channel "Download track image"
   * menu (raster WebGL pixels + vector text overlays at 4× scale).
   */
  public exportBrowser(
    format: "PNG" | "SVG" | "PDF",
    theme: "print" | "publish" = "print",
  ): void {
    if (theme === "publish") {
      this.exportBrowserPublish(format);
      return;
    }
    const channelViews = this.r.rootView.children.filter(
      (c: any) => c instanceof ChannelView,
    ) as ChannelView[];
    if (channelViews.length === 0) return;

    // Sort channels to match visual render order: pinned first, then scrollable.
    // Within each group the relative order from rootView.children is preserved.
    channelViews.sort((a, b) => {
      const ap = a.isPinned ? 0 : 1;
      const bp = b.isPinned ? 0 : 1;
      return ap - bp;
    });

    const fragments: { svg: string; w: number; h: number }[] = [];

    // Helper: parse SVG dimensions from markup
    const parseDims = (svg: string) => {
      const wm = svg.match(/width="([\d.]+)"/);
      const hm = svg.match(/height="([\d.]+)"/);
      return {
        w: parseFloat(wm?.[1] || "800"),
        h: parseFloat(hm?.[1] || "100"),
      };
    };

    // Use buildIsolatedChannelSVG for ALL channels — it repositions each
    // channel to Y=0 before capture, so off-screen channels are captured
    // correctly regardless of scroll position.
    for (const ch of channelViews) {
      // ── Expanded channel: export parent + ALL sub-channels ─────────
      if (ch.isExpanded && ch.subChannels.length > 0) {
        // Parent channel
        const parentSvg = this.buildIsolatedChannelSVG(ch);
        if (parentSvg) {
          const d = parseDims(parentSvg);
          fragments.push({ svg: parentSvg, ...d });
        }

        // ALL sub-channels (not limited to those visible in scroll viewport)
        const allSubs = ch.subChannels as ChannelView[];
        for (const sub of allSubs) {
          const subSvg = this.buildIsolatedChannelSVG(sub, ch);
          if (subSvg) {
            const d = parseDims(subSvg);
            fragments.push({ svg: subSvg, ...d });
          }
        }
        continue;
      }

      // ── Normal (non-expanded) channel ──────────────────────────────
      const svg = this.buildIsolatedChannelSVG(ch);
      if (svg) {
        const d = parseDims(svg);
        fragments.push({ svg, ...d });
      }
    }
    if (fragments.length === 0) return;

    // Restore full screen rendering after isolated captures
    this.r.renderForExport();

    // Prepend axis as the first fragment
    if (this.r._axisView) {
      const axW = Math.max(...fragments.map((fr) => fr.w));
      const axResult = this.r._axisView.buildSVGElements(axW);
      if (axResult && axResult.height > 0) {
        const axSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${axW}" height="${axResult.height}">${axResult.elements}</svg>`;
        fragments.unshift({ svg: axSvg, w: axW, h: axResult.height });
      }
    }

    const f = (n: number) => n.toFixed(2);
    const maxW = Math.max(...fragments.map((fr) => fr.w));
    const totalH = fragments.reduce((s, fr) => s + fr.h, 0);
    const out: string[] = [];
    out.push(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
      `     width="${f(maxW)}" height="${f(totalH)}"`,
      `     viewBox="0 0 ${f(maxW)} ${f(totalH)}"`,
      `     font-family="Arial,Helvetica,sans-serif">`,
    );
    out.push(`<rect width="${f(maxW)}" height="${f(totalH)}" fill="#fff"/>`);
    let yOff = 0;
    for (const fr of fragments) {
      const openEnd = fr.svg.indexOf(">", fr.svg.indexOf("<svg")) + 1;
      const closeStart = fr.svg.lastIndexOf("</svg>");
      const inner = fr.svg.substring(openEnd, closeStart);
      out.push(`<g transform="translate(0,${f(yOff)})">`);
      out.push(inner);
      out.push(`</g>`);
      yOff += fr.h;
    }
    out.push(`</svg>`);
    let combined = out.join("\n");

    // Add title bar and highlight overlay
    combined = this.wrapWithTitle(combined);
    combined = this.appendHighlightOverlayToSVG(combined);

    if (format === "SVG") {
      this.triggerDownload(
        combined,
        this.formatExportFilename("full", "svg"),
        "image/svg+xml",
      );
    } else if (format === "PDF") {
      this.exportSVGtoPDF(combined, "full");
    } else {
      this.rasterizeSVGtoPNG(combined, "full");
    }
  }

  /** Compose every channel using its native renderer and publication framing. */
  private async exportBrowserPublish(
    format: "PNG" | "SVG" | "PDF",
  ): Promise<void> {
    const allViews = this.r.rootView.children.filter(
      (c): c is ChannelView => c instanceof ChannelView,
    );
    const pairs: { ch: ChannelView; parent?: ChannelView }[] = [];
    const append = (ch: ChannelView, parent?: ChannelView) => {
      pairs.push({ ch, parent });
      if (ch.isExpanded)
        for (const sub of ch.subChannels as ChannelView[]) append(sub, ch);
    };
    allViews.forEach((ch) => append(ch));
    const plotWidth = Math.min(600, this.r.browserWidth || 600);
    const fragments: PublishTrackFragment[] = [];
    try {
      for (const { ch, parent } of pairs) {
        const raw = this.buildIsolatedChannelSVG(ch, parent, true, plotWidth);
        if (!raw) continue;
        const width = Number(raw.match(/width="([\d.]+)"/)?.[1]);
        const height = Number(raw.match(/height="([\d.]+)"/)?.[1]);
        if (!(width > 0 && height > 0)) continue;
        fragments.push({
          innerSvg: raw.substring(
            raw.indexOf(">", raw.indexOf("<svg")) + 1,
            raw.lastIndexOf("</svg>"),
          ),
          width,
          height,
          label: ch.plotType === "sequence" ? "Reference sequence" : ch.name,
          group:
            parent?.groupName ||
            ch.groupName ||
            (parent ? parent.name : undefined),
        });
      }
    } finally {
      this.r.renderForExport();
    }
    const controller = this.r.axisController;
    const rna = controller.rnaInfo;
    const cds = controller.cdsMapper;
    const info = rna ?? controller.cdsInfo;
    const domain = this.r.getViewDomain();
    const chr =
      this.r.config.region?.chr ||
      (this.r.viewRegion || this.r.region || "").split(":")[0];
    const svg = buildPublishFigureSVG({
      title: info?.name || chr,
      axis: {
        ...domain,
        mode: cds ? "CDS" : rna ? "RNA" : "DNA",
        origin: cds
          ? cds.strand === "-"
            ? cds.totalCDSLength
            : 0
          : (rna?.tssPos ?? 0),
        strand: info?.strand ?? "+",
        band: cds
          ? { start: 0, end: cds.totalCDSLength, color: "#f58518" }
          : rna
            ? { start: rna.txStart, end: rna.txEnd, color: "#00b894" }
            : undefined,
      },
      tracks: fragments,
      plotWidth,
      highlights: this.r.highlightManager.regions
        .filter(
          (region) =>
            !region.assembly?.name ||
            region.assembly.name ===
              this.r.referenceManager?.getConfig()?.assembly?.name,
        )
        .map((region) => ({
          start: cds ? cds.genomicToCDS(region.start) : region.start,
          end: cds ? cds.genomicToCDS(region.end) : region.end,
          color: region.color,
        })),
    });
    if (format === "SVG")
      this.triggerDownload(
        svg,
        this.formatExportFilename("publish", "svg"),
        "image/svg+xml",
      );
    else if (format === "PDF") this.exportSVGtoPDF(svg, "publish");
    else this.rasterizeSVGtoPNG(svg, "publish");
  }

  /**
   * Download a track image for a specific channel.
   *
   * PNG:       raster capture from the WebGL canvas (pixel-perfect).
   * SVG / PDF: raster features (WebGL capture) + vector text overlays
   *            (channel label, transcript labels & strand arrows,
   *             base characters, score labels).
   */
  public downloadTrackImage(channel: ChannelView, format: string): void {
    const plot = channel.plotType;

    // ── Case A: Expanded parent → export parent + ALL subChannels ────
    if (channel.isExpanded && channel.subChannels.length > 0) {
      // Collect parent + ALL sub-channels (not just visible)
      const allSubs = channel.subChannels as ChannelView[];
      this.exportExpandedChannel(channel, allSubs, format);
      return;
    }

    // ── Case B: Single subChannel → export just this sub ─────────────
    if (channel.isSubChannel) {
      this.exportSingleSubChannel(channel, format);
      return;
    }

    // ── Case C: Scrollable transcript → full-scroll export ───────────
    const isScrollable =
      (plot === "transcript" || plot === "rna") &&
      channel.getTranscriptNeedsScroll();
    if (
      isScrollable &&
      (format === "PNG" || format === "SVG" || format === "PDF")
    ) {
      this.exportFullScrollTranscript(channel, [], format);
      return;
    }

    // ── Case D: Normal single channel ────────────────────────────────
    switch (format) {
      case "PNG": {
        let svg = this.buildHybridSVG(channel);
        if (svg) {
          svg = this.wrapWithAxis(svg);
          svg = this.wrapWithTitle(svg);
          svg = this.appendHighlightOverlayToSVG(svg);
          this.rasterizeSVGtoPNG(svg, channel.name);
        }
        break;
      }
      case "SVG": {
        let svg = this.buildHybridSVG(channel);
        if (svg) {
          svg = this.wrapWithAxis(svg);
          svg = this.wrapWithTitle(svg);
          svg = this.appendHighlightOverlayToSVG(svg);
          this.triggerDownload(
            svg,
            this.formatExportFilename(channel.name, "svg"),
            "image/svg+xml",
          );
        }
        break;
      }
      case "PDF": {
        let svg = this.buildHybridSVG(channel);
        if (svg) {
          svg = this.wrapWithAxis(svg);
          svg = this.wrapWithTitle(svg);
          svg = this.appendHighlightOverlayToSVG(svg);
          this.exportSVGtoPDF(svg, channel.name);
        }
        break;
      }
      default:
        logger.warn(`[Download] Unknown image format: ${format}`);
    }
  }

  /**
   * Export several channels as ONE combined image (used by the multi-select
   * group menu). Each channel is captured as an individual hybrid SVG and the
   * fragments are stacked vertically, with the shared genome axis on top, then
   * dispatched as a single download.
   */
  public downloadChannelsImage(channels: ChannelView[], format: string): void {
    if (!channels || channels.length === 0) return;

    // A single channel → reuse the regular single-channel export.
    if (channels.length === 1) {
      this.downloadTrackImage(channels[0], format);
      return;
    }

    const fragments: { svg: string; w: number; h: number }[] = [];
    const pushFragment = (svg: string | null) => {
      if (!svg) return;
      const wm = svg.match(/width="([\d.]+)"/);
      const hm = svg.match(/height="([\d.]+)"/);
      fragments.push({
        svg,
        w: parseFloat(wm?.[1] || "800"),
        h: parseFloat(hm?.[1] || "100"),
      });
    };

    for (const ch of channels) {
      // Expanded parents contribute the parent + every sub-channel.
      if (ch.isExpanded && ch.subChannels.length > 0) {
        pushFragment(this.buildHybridSVG(ch));
        for (const sub of ch.subChannels as ChannelView[]) {
          pushFragment(this.buildIsolatedSubHybridSVG(sub, ch));
        }
      } else {
        pushFragment(this.buildHybridSVG(ch));
      }
    }

    if (fragments.length === 0) return;

    // Prepend the genome axis as the first fragment.
    if (this.r._axisView) {
      const axW = Math.max(...fragments.map((fr) => fr.w));
      const axResult = this.r._axisView.buildSVGElements(axW);
      if (axResult && axResult.height > 0) {
        const axSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${axW}" height="${axResult.height}">${axResult.elements}</svg>`;
        fragments.unshift({ svg: axSvg, w: axW, h: axResult.height });
      }
    }

    // Combine all fragments into one tall SVG.
    const f = (n: number) => n.toFixed(2);
    const maxW = Math.max(...fragments.map((fr) => fr.w));
    const totalH = fragments.reduce((s, fr) => s + fr.h, 0);
    const out: string[] = [];
    out.push(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
      `     width="${f(maxW)}" height="${f(totalH)}"`,
      `     viewBox="0 0 ${f(maxW)} ${f(totalH)}"`,
      `     font-family="Arial,Helvetica,sans-serif">`,
    );
    out.push(`<rect width="${f(maxW)}" height="${f(totalH)}" fill="#fff"/>`);
    let yOff = 0;
    for (const fr of fragments) {
      const openEnd = fr.svg.indexOf(">", fr.svg.indexOf("<svg")) + 1;
      const closeStart = fr.svg.lastIndexOf("</svg>");
      const inner = fr.svg.substring(openEnd, closeStart);
      out.push(`<g transform="translate(0,${f(yOff)})">`);
      out.push(inner);
      out.push(`</g>`);
      yOff += fr.h;
    }
    out.push(`</svg>`);
    let combinedSvg = out.join("\n");

    combinedSvg = this.wrapWithTitle(combinedSvg);
    combinedSvg = this.appendHighlightOverlayToSVG(combinedSvg);

    const baseName = `channels_${channels.length}`;
    if (format === "SVG") {
      this.triggerDownload(
        combinedSvg,
        this.formatExportFilename(baseName, "svg"),
        "image/svg+xml",
      );
    } else if (format === "PDF") {
      this.exportSVGtoPDF(combinedSvg, baseName);
    } else {
      this.rasterizeSVGtoPNG(combinedSvg, baseName);
    }
  }

  // ── Expanded channel export ────────────────────────────────────────

  /**
   * Export an expanded channel: capture the parent + every sub-channel
   * by rendering each sub individually at an isolated canvas position,
   * ensuring no content from other channels leaks into the capture.
   */
  private exportExpandedChannel(
    parent: ChannelView,
    subs: ChannelView[],
    format: string,
  ): void {
    // Build individual hybrid SVGs for parent + every sub-channel.
    // Each buildHybridSVG / buildIsolatedSubHybridSVG call handles its own
    // grid suppression and WebGL capture internally.
    const fragments: { svg: string; w: number; h: number }[] = [];

    const parentSvg = this.buildHybridSVG(parent);
    if (parentSvg) {
      const wm = parentSvg.match(/width="([\d.]+)"/);
      const hm = parentSvg.match(/height="([\d.]+)"/);
      fragments.push({
        svg: parentSvg,
        w: parseFloat(wm?.[1] || "800"),
        h: parseFloat(hm?.[1] || "100"),
      });
    }

    for (const sub of subs) {
      const svg = this.buildIsolatedSubHybridSVG(sub, parent);
      if (svg) {
        const wm = svg.match(/width="([\d.]+)"/);
        const hm = svg.match(/height="([\d.]+)"/);
        fragments.push({
          svg,
          w: parseFloat(wm?.[1] || "800"),
          h: parseFloat(hm?.[1] || "100"),
        });
      }
    }

    if (fragments.length === 0) return;

    // Prepend axis as the first fragment
    if (this.r._axisView && fragments.length > 0) {
      const axW = Math.max(...fragments.map((fr) => fr.w));
      const axResult = this.r._axisView.buildSVGElements(axW);
      if (axResult && axResult.height > 0) {
        const axSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${axW}" height="${axResult.height}">${axResult.elements}</svg>`;
        fragments.unshift({ svg: axSvg, w: axW, h: axResult.height });
      }
    }

    // Single fragment → dispatch directly
    if (fragments.length === 1) {
      let svg = fragments[0].svg;
      svg = this.wrapWithTitle(svg);
      svg = this.appendHighlightOverlayToSVG(svg);
      if (format === "SVG")
        this.triggerDownload(
          svg,
          this.formatExportFilename(parent.name, "svg"),
          "image/svg+xml",
        );
      else if (format === "PDF") this.exportSVGtoPDF(svg, parent.name);
      else this.rasterizeSVGtoPNG(svg, parent.name);
      return;
    }

    // Combine multiple fragments into one tall SVG
    const f = (n: number) => n.toFixed(2);
    const maxW = Math.max(...fragments.map((fr) => fr.w));
    const svgTotalH = fragments.reduce((s, fr) => s + fr.h, 0);
    const out: string[] = [];
    out.push(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
      `     width="${f(maxW)}" height="${f(svgTotalH)}"`,
      `     viewBox="0 0 ${f(maxW)} ${f(svgTotalH)}"`,
      `     font-family="Arial,Helvetica,sans-serif">`,
    );
    out.push(`<rect width="${f(maxW)}" height="${f(svgTotalH)}" fill="#fff"/>`);
    let yOff = 0;
    for (const fr of fragments) {
      const openEnd = fr.svg.indexOf(">", fr.svg.indexOf("<svg")) + 1;
      const closeStart = fr.svg.lastIndexOf("</svg>");
      const inner = fr.svg.substring(openEnd, closeStart);
      out.push(`<g transform="translate(0,${f(yOff)})">`);
      out.push(inner);
      out.push(`</g>`);
      yOff += fr.h;
    }
    out.push(`</svg>`);
    let combinedSvg = out.join("\n");

    // Add title bar and highlight overlay
    combinedSvg = this.wrapWithTitle(combinedSvg);
    combinedSvg = this.appendHighlightOverlayToSVG(combinedSvg);

    if (format === "SVG")
      this.triggerDownload(
        combinedSvg,
        this.formatExportFilename(parent.name, "svg"),
        "image/svg+xml",
      );
    else if (format === "PDF") this.exportSVGtoPDF(combinedSvg, parent.name);
    else this.rasterizeSVGtoPNG(combinedSvg, parent.name);
  }

  /**
   * Build a hybrid SVG for a sub-channel by temporarily repositioning it
   * to a safe canvas location, rendering without clip bounds, and capturing.
   */
  private buildIsolatedSubHybridSVG(
    sub: ChannelView,
    parent: ChannelView,
  ): string | null {
    const gl = this.r.context.gl;
    const glCanvas = this.r.context.canvas;
    if (!gl || !glCanvas) return null;

    const dpr = window.devicePixelRatio || 1;

    const origBounds = sub.getBounds();
    const origClip = sub._clipBounds;
    const parentBounds = parent.getBounds();
    const subH =
      origBounds.height > 0
        ? origBounds.height
        : Math.round(parentBounds.height);

    // Reposition in WebGL coordinate space ONLY (no DOM movement)
    sub.setRenderBounds(parentBounds.x, 0, parentBounds.width, subH);
    sub._clipBounds = null;

    // Suppress grid, render, capture
    const savedGridDisplay = this.r.gridRenderer?.getGridDisplay() ?? "none";
    if (this.r.gridRenderer && savedGridDisplay !== "none") {
      this.r.gridRenderer.setGridDisplay("none");
    }

    const state = {
      domain: { start: this.r.viewDomain.start, end: this.r.viewDomain.end },
    };
    sub.render(state);
    gl.finish();

    const cx = Math.round(parentBounds.x);
    const cw = Math.round(parentBounds.width);
    const ch = subH;
    const pixels = new Uint8Array(cw * ch * 4);
    gl.readPixels(
      cx,
      glCanvas.height - ch,
      cw,
      ch,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );

    // Flip into temp canvas
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = cw;
    tmpCanvas.height = ch;
    const tmpCtx = tmpCanvas.getContext("2d")!;
    const imgData = tmpCtx.createImageData(cw, ch);
    for (let row = 0; row < ch; row++) {
      const srcOff = (ch - 1 - row) * cw * 4;
      const dstOff = row * cw * 4;
      imgData.data.set(pixels.subarray(srcOff, srcOff + cw * 4), dstOff);
    }
    tmpCtx.putImageData(imgData, 0, 0);

    // Arc overlay (score_curve) is blitted to the WebGL canvas via
    // renderOverlayTexture, so it is captured by gl.readPixels above.

    const rasterDataUrl = tmpCanvas.toDataURL("image/png");

    // Restore grid
    if (this.r.gridRenderer && savedGridDisplay !== "none") {
      this.r.gridRenderer.setGridDisplay(savedGridDisplay);
    }

    // Restore original WebGL coordinates
    sub.setRenderBounds(
      origBounds.x,
      origBounds.y,
      origBounds.width,
      origBounds.height,
    );
    sub._clipBounds = origClip;

    const widthCSS = cw / dpr;
    const heightCSS = ch / dpr;
    const labelH = 24;
    const totalH = heightCSS + labelH;
    const f = (n: number) => n.toFixed(2);
    const plot = sub.plotType;

    const domStart = this.r.viewDomain.start;
    const domEnd = this.r.viewDomain.end;
    const domLen = domEnd - domStart;
    if (domLen <= 0) return null;

    const pad = sub.getPadding();
    const padTopCSS = heightCSS * pad.top;
    const contentTop = labelH + padTopCSS;

    const lines: string[] = [];
    lines.push(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
      `     width="${f(widthCSS)}" height="${f(totalH)}"`,
      `     viewBox="0 0 ${f(widthCSS)} ${f(totalH)}"`,
      `     font-family="Arial,Helvetica,sans-serif">`,
    );
    lines.push(
      `<rect width="${f(widthCSS)}" height="${f(totalH)}" fill="#fff"/>`,
    );

    // Channel label — group colour tag + sample label colour strips
    let labelTextX = 8;
    let sx = 4;
    // Show parent's group colour tag first
    const subGroupColor = parent.groupColor;
    if (subGroupColor) {
      const tagW = 4;
      const tagH = labelH - 4;
      const tagY = 2;
      lines.push(
        `<rect x="3" y="${f(tagY)}" width="${tagW}" height="${f(tagH)}" rx="1" fill="${subGroupColor}"/>`,
      );
      sx = 3 + tagW + 2;
    }
    // Then sample label colour strips
    const sampleLabelStrips = parent.getSampleLabelColors(sub);
    if (sampleLabelStrips.length > 0) {
      const stripW = 4; // CSS px per colour strip
      const stripGap = 1;
      const stripH = labelH - 4; // leave 2px top/bottom margin
      const stripY = 2;
      for (const strip of sampleLabelStrips) {
        lines.push(
          `<rect x="${f(sx)}" y="${f(stripY)}" width="${stripW}" height="${f(stripH)}" rx="1" fill="${strip.color}"/>`,
        );
        sx += stripW + stripGap;
      }
    }
    labelTextX = sx + 4;
    lines.push(
      `<text x="${f(labelTextX)}" y="${f(labelH / 2 + 1)}" font-size="13" font-weight="600" fill="#1d1d1f" dominant-baseline="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">${this.escXml(sub.name)}</text>`,
    );
    lines.push(
      `<line x1="0" y1="${labelH}" x2="${f(widthCSS)}" y2="${labelH}" stroke="#e0e0e0" stroke-width="1"/>`,
    );

    // Raster
    lines.push(
      `<image x="0" y="${labelH}" width="${f(widthCSS)}" height="${f(heightCSS)}" xlink:href="${rasterDataUrl}" image-rendering="auto"/>`,
    );

    // Grid
    this.appendGridSVG(lines, sub, widthCSS, labelH, heightCSS);

    // Score labels
    if (plot === "bam") {
      const covMax = sub.getBamCoverageMax();
      if (covMax > 0 && sub.isBamCoverageEnabled()) {
        const fmt = (v: number) =>
          Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
        const scoreTxt = `[0, ${fmt(covMax)}]`;
        this.appendScoreLabelSVG(lines, scoreTxt, 10, widthCSS, contentTop + 4);
      }
    }
    if (
      plot === "bar" ||
      plot === "bigwig" ||
      plot === "line" ||
      plot === "point" ||
      plot === "heatmap" ||
      plot === "score_rect" ||
      plot === "score_curve" ||
      plot === "diamond"
    ) {
      const cmInfo = sub.getColormapInfo();
      if (cmInfo) {
        this.appendColorbarLabelSVG(
          lines,
          cmInfo.colormap,
          cmInfo.min,
          cmInfo.max,
          11,
          widthCSS,
          labelH + 4,
          cmInfo.reversed,
        );
      } else {
        const scoreTxt = sub.getScoreLabelText();
        if (scoreTxt) {
          this.appendScoreLabelSVG(lines, scoreTxt, 12, widthCSS, labelH + 4);
        }
      }
    }

    lines.push(`</svg>`);
    return lines.join("\n");
  }

  /** Export a single sub-channel image by rendering it in isolation. */
  private exportSingleSubChannel(sub: ChannelView, format: string): void {
    const parent = sub.parentChannel;
    if (!parent) {
      // Fallback: treat as normal channel
      switch (format) {
        case "PNG": {
          let svg = this.buildHybridSVG(sub);
          if (svg) {
            svg = this.wrapWithAxis(svg);
            svg = this.wrapWithTitle(svg);
            svg = this.appendHighlightOverlayToSVG(svg);
            this.rasterizeSVGtoPNG(svg, sub.name);
          }
          break;
        }
        case "SVG": {
          let svg = this.buildHybridSVG(sub);
          if (svg) {
            svg = this.wrapWithAxis(svg);
            svg = this.wrapWithTitle(svg);
            svg = this.appendHighlightOverlayToSVG(svg);
            this.triggerDownload(
              svg,
              this.formatExportFilename(sub.name, "svg"),
              "image/svg+xml",
            );
          }
          break;
        }
        case "PDF": {
          let svg = this.buildHybridSVG(sub);
          if (svg) {
            svg = this.wrapWithAxis(svg);
            svg = this.wrapWithTitle(svg);
            svg = this.appendHighlightOverlayToSVG(svg);
            this.exportSVGtoPDF(svg, sub.name);
          }
          break;
        }
      }
      return;
    }

    switch (format) {
      case "PNG": {
        let svg = this.buildIsolatedSubHybridSVG(sub, parent);
        if (svg) {
          svg = this.wrapWithAxis(svg);
          svg = this.wrapWithTitle(svg);
          svg = this.appendHighlightOverlayToSVG(svg);
          this.rasterizeSVGtoPNG(svg, sub.name);
        }
        // Restore screen
        this.r.renderForExport();
        break;
      }
      case "SVG": {
        let svg = this.buildIsolatedSubHybridSVG(sub, parent);
        if (svg) {
          svg = this.wrapWithAxis(svg);
          svg = this.wrapWithTitle(svg);
          svg = this.appendHighlightOverlayToSVG(svg);
          this.triggerDownload(
            svg,
            this.formatExportFilename(sub.name, "svg"),
            "image/svg+xml",
          );
        }
        // Restore screen
        this.r.renderForExport();
        break;
      }
      case "PDF": {
        let svg = this.buildIsolatedSubHybridSVG(sub, parent);
        if (svg) {
          svg = this.wrapWithAxis(svg);
          svg = this.wrapWithTitle(svg);
          svg = this.appendHighlightOverlayToSVG(svg);
          this.exportSVGtoPDF(svg, sub.name);
        }
        // Restore screen
        this.r.renderForExport();
        break;
      }
    }
  }

  // ── Full-scroll transcript export ──────────────────────────────────

  /**
   * Export a scrollable transcript channel showing ALL lanes.
   *
   * Strategy:
   *   1. Save current scroll offset
   *   2. Set scroll to 0, re-render, capture the raster strip
   *   3. Advance scroll by one page, re-render, capture again  — repeat
   *   4. Stitch all raster strips vertically into one tall image
   *   5. Build a hybrid SVG with the tall raster + vector overlays for ALL lanes
   *   6. Restore original scroll, re-render to repair the screen
   *   7. Dispatch the download (PNG / SVG / PDF)
   */
  private exportFullScrollTranscript(
    channel: ChannelView,
    _channels: ChannelView[],
    format: string,
  ): void {
    const gl = this.r.context.gl;
    const glCanvas = this.r.context.canvas;
    if (!gl || !glCanvas) return;

    const dpr = window.devicePixelRatio || 1;
    const bounds = channel.getBounds();
    const cxDev = Math.round(bounds.x);
    const cyDev = Math.round(bounds.y);
    const cwDev = Math.round(bounds.width);
    const chDev = Math.round(bounds.height);
    if (cwDev <= 0 || chDev <= 0) return;

    const pad = channel.getPadding();
    const paddingTopDev = Math.round(chDev * pad.top);
    const paddingBotDev = Math.round(chDev * pad.bottom);
    const contentHeightDev = chDev - paddingTopDev - paddingBotDev;
    const contentHeightCSS = contentHeightDev / dpr;

    const totalContentCSS = channel.getTranscriptTotalHeightCSS();
    // How many pages we need to capture
    const numPages = Math.ceil(totalContentCSS / contentHeightCSS);

    // Save original scroll
    const origScroll = channel.getTranscriptScrollOffset();

    // Suppress grid for raster capture (vector grid added separately)
    const savedGridDisplay = this.r.gridRenderer?.getGridDisplay() ?? "none";
    if (this.r.gridRenderer && savedGridDisplay !== "none") {
      this.r.gridRenderer.setGridDisplay("none");
    }

    // Capture each page of scrolled content
    const strips: ImageData[] = [];
    for (let page = 0; page < numPages; page++) {
      const scrollCSS = page * contentHeightCSS;
      channel.setTranscriptScrollOffset(scrollCSS);
      // Full scene re-render ensures no stale content from other channels
      this.r.renderForExport();
      gl.finish();

      // Read pixels for the content area of this page
      const readY = glCanvas.height - cyDev - chDev + paddingBotDev;
      const readH = contentHeightDev;
      const pixels = new Uint8Array(cwDev * readH * 4);
      gl.readPixels(
        cxDev,
        readY,
        cwDev,
        readH,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );

      // Flip vertically into an ImageData
      const thisStripH =
        page === numPages - 1
          ? Math.round((totalContentCSS - page * contentHeightCSS) * dpr)
          : readH;
      const imgData = new ImageData(cwDev, thisStripH);
      for (let row = 0; row < thisStripH; row++) {
        const srcRow = readH - 1 - row; // flip
        const srcOff = srcRow * cwDev * 4;
        const dstOff = row * cwDev * 4;
        imgData.data.set(pixels.subarray(srcOff, srcOff + cwDev * 4), dstOff);
      }
      strips.push(imgData);
    }

    // Restore original scroll, grid display, and re-render to repair the screen
    channel.setTranscriptScrollOffset(origScroll);
    if (this.r.gridRenderer && savedGridDisplay !== "none") {
      this.r.gridRenderer.setGridDisplay(savedGridDisplay);
    }
    this.r.renderForExport();

    // Stitch strips into one tall canvas
    const stitchedH = strips.reduce((sum, s) => sum + s.height, 0);
    const stitchedCanvas = document.createElement("canvas");
    stitchedCanvas.width = cwDev;
    stitchedCanvas.height = stitchedH;
    const sCtx = stitchedCanvas.getContext("2d")!;
    let yOff = 0;
    for (const strip of strips) {
      sCtx.putImageData(strip, 0, yOff);
      yOff += strip.height;
    }

    // Build the tall raster data URL
    const rasterDataUrl = stitchedCanvas.toDataURL("image/png");

    // Now build a hybrid SVG using the stitched raster + all-lane labels
    const widthCSS = cwDev / dpr;
    const fullContentHeightCSS = stitchedH / dpr;
    const labelH = 24;
    const totalH = fullContentHeightCSS + labelH;
    const contentTop = labelH; // content starts right after label
    const f = (n: number) => n.toFixed(2);

    const domStart = this.r.viewDomain.start;
    const domEnd = this.r.viewDomain.end;
    const domLen = domEnd - domStart;
    const xScale = (bp: number) => ((bp - domStart) / domLen) * widthCSS;

    const lines: string[] = [];
    lines.push(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
      `     width="${f(widthCSS)}" height="${f(totalH)}"`,
      `     viewBox="0 0 ${f(widthCSS)} ${f(totalH)}"`,
      `     font-family="Arial,Helvetica,sans-serif">`,
    );
    lines.push(
      `<rect width="${f(widthCSS)}" height="${f(totalH)}" fill="#fff"/>`,
    );

    // Channel label
    lines.push(
      `<text x="8" y="${f(labelH / 2 + 1)}" font-size="13" font-weight="600" fill="#1d1d1f" dominant-baseline="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">${this.escXml(channel.name)}</text>`,
    );
    lines.push(
      `<line x1="0" y1="${labelH}" x2="${f(widthCSS)}" y2="${labelH}" stroke="#e0e0e0" stroke-width="1"/>`,
    );

    // Stitched raster
    lines.push(
      `<image x="0" y="${labelH}" width="${f(widthCSS)}" height="${f(fullContentHeightCSS)}" xlink:href="${rasterDataUrl}" image-rendering="auto"/>`,
    );

    // Vector grid lines
    this.appendGridSVG(lines, channel, widthCSS, labelH, fullContentHeightCSS);

    // Clip-path for text overlays
    const clipId = `clip-${++this._svgClipCounter}`;
    lines.push(
      `<defs><clipPath id="${clipId}"><rect x="0" y="${f(labelH)}" width="${f(widthCSS)}" height="${f(fullContentHeightCSS)}"/></clipPath></defs>`,
    );
    lines.push(`<g clip-path="url(#${clipId})">`);

    // Transcript labels + strand arrows for ALL lanes (scrollCSS = 0)
    const txRecords = channel.getTranscriptRecords();
    const laneH = 28;
    for (const tx of txRecords) {
      const laneTop = tx.lane * laneH; // no scroll offset
      const txX1 = xScale(tx.txStart);
      const txX2 = xScale(tx.txEnd);

      const labelY = contentTop + laneTop + laneH * 0.55 + 2;
      if (labelY > totalH) continue;

      const strandChar = tx.strand === "-" ? "< " : "";
      const strandSuffix = tx.strand === "+" ? " >" : "";
      const geneName = `${strandChar}${tx.geneName}${strandSuffix}`;

      const visLeft = Math.max(txX1, 0);
      const visRight = Math.min(txX2, widthCSS);
      const visW = visRight - visLeft;
      if (visW < 10) continue;

      const labelX = visLeft + visW / 2;
      lines.push(
        `<text x="${f(labelX)}" y="${f(labelY)}" font-size="9" fill="#555" text-anchor="middle" dominant-baseline="hanging">${this.escXml(geneName)}</text>`,
      );

      // Strand arrows
      const arrowY = contentTop + laneTop + laneH * 0.275 - 3;
      const arrowChar = tx.strand === "-" ? "❮" : "❯";
      const arrowSpan = visRight - visLeft;
      const numArrows = Math.max(0, Math.floor(arrowSpan / 40) - 1);
      if (numArrows > 0) {
        const step = arrowSpan / (numArrows + 1);
        for (let j = 1; j <= numArrows; j++) {
          const ax = visLeft + step * j;
          lines.push(
            `<text x="${f(ax)}" y="${f(arrowY)}" font-size="7" fill="rgba(120,120,120,0.6)" text-anchor="middle" dominant-baseline="hanging">${arrowChar}</text>`,
          );
        }
      }
    }

    lines.push(`</g>`);
    lines.push(`</svg>`);
    const svgString = lines.join("\n");

    // Wrap with axis, title and highlight overlay
    let finalSvg = this.wrapWithAxis(svgString);
    finalSvg = this.wrapWithTitle(finalSvg);
    finalSvg = this.appendHighlightOverlayToSVG(finalSvg);

    // Dispatch based on format
    switch (format) {
      case "SVG":
        this.triggerDownload(
          finalSvg,
          this.formatExportFilename(channel.name, "svg"),
          "image/svg+xml",
        );
        break;
      case "PDF":
        this.exportSVGtoPDF(finalSvg, channel.name);
        break;
      case "PNG":
        this.rasterizeSVGtoPNG(finalSvg, channel.name);
        break;
    }
  }

  // ── SVG → PNG rasterizer ──────────────────────────────────────────

  /** Rasterize an SVG string to a PNG by rendering it on a canvas at 4× scale. */
  private rasterizeSVGtoPNG(svgString: string, trackName: string): void {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
    const svgEl = svgDoc.documentElement;
    const svgW = parseFloat(svgEl.getAttribute("width") || "800");
    const svgH = parseFloat(svgEl.getAttribute("height") || "200");

    const svgB64 = btoa(unescape(encodeURIComponent(svgString)));
    const img = new Image();
    img.onload = () => {
      const scale = 4;
      const canvas = document.createElement("canvas");
      canvas.width = svgW * scale;
      canvas.height = svgH * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, svgW, svgH);
      this.downloadCanvasAsPNG(canvas, trackName);
    };
    img.src = `data:image/svg+xml;base64,${svgB64}`;
  }

  // ── PNG download ───────────────────────────────────────────────────

  private downloadCanvasAsPNG(
    canvas: HTMLCanvasElement,
    trackName: string,
  ): void {
    const filename = this.formatExportFilename(trackName, "png");
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Axis wrapper for image exports
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Prepend a vector axis to a complete SVG string.
   * The original SVG content is shifted down by the axis height.
   * Returns the original SVG unchanged when no axis view is available.
   */
  private wrapWithAxis(svgString: string): string {
    if (!this.r._axisView) return svgString;

    const wMatch = svgString.match(/width="([\d.]+)"/);
    const hMatch = svgString.match(/height="([\d.]+)"/);
    if (!wMatch || !hMatch) return svgString;

    const widthCSS = parseFloat(wMatch[1]);
    const heightCSS = parseFloat(hMatch[1]);

    const axisResult = this.r._axisView.buildSVGElements(widthCSS);
    if (!axisResult || axisResult.height <= 0) return svgString;

    const totalH = heightCSS + axisResult.height;
    const f = (n: number) => n.toFixed(2);

    // Extract inner content from the original SVG
    const openEnd = svgString.indexOf(">", svgString.indexOf("<svg")) + 1;
    const closeStart = svgString.lastIndexOf("</svg>");
    const inner = svgString.substring(openEnd, closeStart);

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
      `     width="${f(widthCSS)}" height="${f(totalH)}"`,
      `     viewBox="0 0 ${f(widthCSS)} ${f(totalH)}"`,
      `     font-family="Arial,Helvetica,sans-serif">`,
      `<rect width="${f(widthCSS)}" height="${f(totalH)}" fill="#fff"/>`,
      axisResult.elements,
      `<g transform="translate(0,${f(axisResult.height)})">`,
      inner,
      `</g>`,
      `</svg>`,
    ].join("\n");
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Export title bar
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Prepend a title bar to a complete SVG string.
   * The title bar shows the current mode (RNA / CDS / DNA) with relevant info.
   * Returns the original SVG unchanged when the mode cannot be determined.
   */
  private wrapWithTitle(svgString: string): string {
    const wMatch = svgString.match(/width="([\d.]+)"/);
    const hMatch = svgString.match(/height="([\d.]+)"/);
    if (!wMatch || !hMatch) return svgString;

    const widthCSS = parseFloat(wMatch[1]);
    const heightCSS = parseFloat(hMatch[1]);
    const titleH = 28;
    const totalH = heightCSS + titleH;
    const f = (n: number) => n.toFixed(2);

    // ── Determine mode & build left / right labels ──────────────────
    let leftText: string;
    let unit = "bp";

    if (this.r.axisController.isRnaMode && this.r._rnaInfo) {
      const txInfo = this.r._transcriptInfo;
      const name = txInfo?.trans_name || this.r._rnaInfo.name;
      const strand = this.r._rnaInfo.strand;
      const up = Math.max(
        0,
        Math.round(this.r._rnaInfo.txStart - this.r.viewDomain.start),
      );
      const down = Math.max(
        0,
        Math.round(this.r.viewDomain.end - this.r._rnaInfo.txEnd),
      );
      leftText = `RNA: ${name}:${up}:${down} (${strand})`;
      unit = "nt";
    } else if (this.r.axisController.isCdsMode && this.r._cdsInfo) {
      const txInfo = this.r._transcriptInfo;
      const name = txInfo?.trans_name || this.r._cdsInfo.name;
      const strand = this.r._cdsInfo.strand;
      const gd = this.r._cdsInfo.genomicDomain;
      const up = gd
        ? Math.max(0, Math.round(gd.start - this.r.viewDomain.start))
        : this.r._buildinUpstream;
      const down = gd
        ? Math.max(0, Math.round(this.r.viewDomain.end - gd.end))
        : this.r._buildinDownstream;
      leftText = `CDS: ${name}:${up}:${down} (${strand})`;
      unit = "nt";
    } else {
      const chr = this.r.config.region?.chr ?? "";
      const start = Math.round(this.r.viewDomain.start);
      const end = Math.round(this.r.viewDomain.end);
      leftText = `DNA: ${chr}:${start.toLocaleString()}-${end.toLocaleString()}`;
      unit = "bp";
    }

    const domLen = this.r.viewDomain.end - this.r.viewDomain.start;
    let rightText: string;
    if (domLen >= 1_000_000) {
      rightText = `${(domLen / 1_000_000).toFixed(1)} M${unit}`;
    } else if (domLen >= 1000) {
      rightText = `${(domLen / 1000).toFixed(1)} k${unit}`;
    } else {
      rightText = `${Math.round(domLen)} ${unit}`;
    }

    // ── Extract inner content and re-wrap ────────────────────────────
    const openEnd = svgString.indexOf(">", svgString.indexOf("<svg")) + 1;
    const closeStart = svgString.lastIndexOf("</svg>");
    const inner = svgString.substring(openEnd, closeStart);

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
      `     width="${f(widthCSS)}" height="${f(totalH)}"`,
      `     viewBox="0 0 ${f(widthCSS)} ${f(totalH)}"`,
      `     font-family="Arial,Helvetica,sans-serif">`,
      `<rect width="${f(widthCSS)}" height="${f(totalH)}" fill="#fff"/>`,
      // Title bar background
      `<rect width="${f(widthCSS)}" height="${titleH}" fill="#f5f5f7"/>`,
      `<line x1="0" y1="${titleH}" x2="${f(widthCSS)}" y2="${titleH}" stroke="#d2d2d7" stroke-width="1"/>`,
      `<text x="10" y="${f(titleH / 2 + 1)}" font-size="12" font-weight="600" fill="#1d1d1f" dominant-baseline="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">${this.escXml(leftText)}</text>`,
      `<text x="${f(widthCSS - 10)}" y="${f(titleH / 2 + 1)}" font-size="12" font-weight="600" fill="#1d1d1f" dominant-baseline="middle" text-anchor="end" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">${this.escXml(rightText)}</text>`,
      // Original content shifted down
      `<g transform="translate(0,${titleH})">`,
      inner,
      `</g>`,
      `</svg>`,
    ].join("\n");
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Export highlight overlay
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Append highlight region overlays (translucent rectangles + distance labels)
   * to a completed SVG string.  The overlay spans the full height of the SVG.
   * Returns the original SVG unchanged when there are no highlight regions.
   */
  private appendHighlightOverlayToSVG(svgString: string): string {
    const regions = this.r.highlightManager.regions;
    if (regions.length === 0) return svgString;

    const domStart = this.r.viewDomain.start;
    const domEnd = this.r.viewDomain.end;
    const domLen = domEnd - domStart;
    if (domLen <= 0) return svgString;

    const wm = svgString.match(/width="([\d.]+)"/);
    const hm = svgString.match(/height="([\d.]+)"/);
    if (!wm || !hm) return svgString;

    const widthCSS = parseFloat(wm[1]);
    const totalH = parseFloat(hm[1]);
    const f = (n: number) => n.toFixed(2);

    const xScale = (bp: number) =>
      Math.max(0, Math.min(widthCSS, ((bp - domStart) / domLen) * widthCSS));

    const unit =
      this.r.axisController.isRnaMode || this.r.axisController.isCdsMode
        ? "nt"
        : "bp";
    const overlay: string[] = [];

    for (const region of regions) {
      const x1 = xScale(region.start);
      const x2 = xScale(region.end);
      const w = Math.max(1, x2 - x1);

      // Parse hex color → rgba fill
      const hex = region.color.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);

      // Translucent fill + solid stroke
      overlay.push(
        `<rect x="${f(x1)}" y="0" width="${f(w)}" height="${f(totalH)}" fill="rgba(${r},${g},${b},0.15)" stroke="${region.color}" stroke-width="1"/>`,
      );

      // Distance label at top of highlight
      const regionLen = region.end - region.start;
      let widthLabel: string;
      if (regionLen >= 1_000_000) {
        widthLabel = `${(regionLen / 1_000_000).toFixed(1)} M${unit}`;
      } else if (regionLen >= 1000) {
        widthLabel = `${(regionLen / 1000).toFixed(1)} k${unit}`;
      } else {
        widthLabel = `${Math.round(regionLen)} ${unit}`;
      }
      const indicatorText = `\u2190 ${widthLabel} \u2192`;
      const centerX = x1 + w / 2;
      overlay.push(
        `<text x="${f(centerX)}" y="6" font-size="10" fill="${region.color}" text-anchor="middle" dominant-baseline="hanging" font-family="Calibre,Roboto,Helvetica,sans-serif">${indicatorText}</text>`,
      );
    }

    // Insert just before </svg>
    const closeIdx = svgString.lastIndexOf("</svg>");
    if (closeIdx < 0) return svgString;

    return svgString.substring(0, closeIdx) + overlay.join("\n") + "\n</svg>";
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Isolated channel SVG builder  (for browser-wide export)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Build a hybrid SVG for ANY channel (parent, sub, or normal) by
   * temporarily repositioning it to canvas Y=0 before capture.
   *
   * This ensures off-screen channels (below the visible scroll viewport)
   * are captured correctly — unlike `buildHybridSVG` which reads pixels
   * at the channel's current position.
   *
   * @param parent   If this is a sub-channel, pass the parent so sample
   *                 label colour strips are included in the label row.
   */
  private buildIsolatedChannelSVG(
    channel: ChannelView,
    parent?: ChannelView,
    omitLabel: boolean = false,
    publishWidth?: number,
  ): string | null {
    const gl = this.r.context.gl;
    const glCanvas = this.r.context.canvas;
    if (!gl || !glCanvas) return null;

    const dpr = window.devicePixelRatio || 1;

    // ── 0. Save & reposition ────────────────────────────────────────
    const origBounds = channel.getBounds();
    const origClip = channel._clipBounds;
    const origScrollClip = (channel as any)._scrollClipBounds;
    const cwDev = Math.round(
      publishWidth ? publishWidth * dpr : origBounds.width,
    );

    // Save the actual channel height (parent-only device px) before any
    // modification, because getBounds().height may include expand-group height
    // and we need to restore the exact parent height afterwards.
    const origChannelHeight = channel.ownHeight;

    // For expanded parent channels, getBounds() includes the expand group
    // height.  We only want the parent's own height for capture.
    const isExpandedParent =
      channel.isExpanded && channel.subChannels.length > 0;
    const nativeHeight = isExpandedParent
      ? Math.round(channel.ownHeight) // parent-only height (device px)
      : Math.round(origBounds.height);
    const chDev = publishWidth && nativeHeight <= 0
      ? Math.round((channel.getChannelConfig().style?.height || 50) * dpr)
      : nativeHeight;
    if (cwDev <= 0 || chDev <= 0) return null;

    // Use the full canvas width for rendering (ignore scroll-reserved width)
    const renderX = Math.round(origBounds.x);

    // Reposition to Y=0 and remove all clip bounds
    const savedBackground = channel._backgroundColor;
    const savedGridDisplay = this.r.gridRenderer?.getGridDisplay() ?? "none";
    const savedExpandGroup = (channel as any)._expandGroupView;
    let rasterDataUrl: string;
    try {
      if (publishWidth) channel._backgroundColor = "#f2f9fb";
      channel.setRenderBounds(renderX, 0, cwDev, chDev);

      // For expanded parents, temporarily hide the expand group view so
      // sub-channels are NOT rendered into the parent's capture area.
      if (isExpandedParent) {
        (channel as any)._expandGroupView = null;
      }
      channel._clipBounds = null;
      (channel as any)._scrollClipBounds = null;

      // ── 1. Capture WebGL pixels ─────────────────────────────────────
      if (this.r.gridRenderer && savedGridDisplay !== "none") {
        this.r.gridRenderer.setGridDisplay("none");
      }

      const state = {
        domain: { start: this.r.viewDomain.start, end: this.r.viewDomain.end },
      };
      channel.render(state);
      gl.finish();

      const pixels = new Uint8Array(cwDev * chDev * 4);
      gl.readPixels(
        renderX,
        glCanvas.height - chDev,
        cwDev,
        chDev,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );

      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = cwDev;
      tmpCanvas.height = chDev;
      const tmpCtx = tmpCanvas.getContext("2d")!;
      const imgData = tmpCtx.createImageData(cwDev, chDev);
      for (let row = 0; row < chDev; row++) {
        const srcOff = (chDev - 1 - row) * cwDev * 4;
        const dstOff = row * cwDev * 4;
        imgData.data.set(pixels.subarray(srcOff, srcOff + cwDev * 4), dstOff);
      }
      tmpCtx.putImageData(imgData, 0, 0);
      rasterDataUrl = tmpCanvas.toDataURL("image/png");
    } finally {
      channel._backgroundColor = savedBackground;

      // ── Restore ─────────────────────────────────────────────────────
      if (this.r.gridRenderer && savedGridDisplay !== "none") {
        this.r.gridRenderer.setGridDisplay(savedGridDisplay);
      }
      // Restore expand group view before restoring bounds
      if (isExpandedParent) {
        (channel as any)._expandGroupView = savedExpandGroup;
      }
      channel.setRenderBounds(
        origBounds.x,
        origBounds.y,
        origBounds.width,
        origChannelHeight,
      );
      channel._clipBounds = origClip;
      (channel as any)._scrollClipBounds = origScrollClip;
    }

    // ── 2. Build SVG ────────────────────────────────────────────────
    const widthCSS = cwDev / dpr;
    const heightCSS = chDev / dpr;
    // Publish theme omits the in-track header (label lives in the left gutter).
    const labelH = omitLabel ? 0 : 24;
    const bodyOffset = publishWidth ? Math.max(0, (54 - heightCSS) / 2) : 0;
    const totalH = heightCSS + labelH + bodyOffset * 2;
    const plot = channel.plotType;
    const f = (n: number) => n.toFixed(2);

    const domStart = this.r.viewDomain.start;
    const domEnd = this.r.viewDomain.end;
    const domLen = domEnd - domStart;
    if (domLen <= 0) return null;

    const pad = channel.getPadding();
    const padTopCSS = heightCSS * pad.top;
    const contentH = heightCSS - padTopCSS - heightCSS * pad.bottom;
    const contentTop = labelH + padTopCSS + bodyOffset;
    const pxPerBp = widthCSS / domLen;
    const xScale = (bp: number) => ((bp - domStart) / domLen) * widthCSS;

    const lines: string[] = [];
    lines.push(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
      `     width="${f(widthCSS)}" height="${f(totalH)}"`,
      `     viewBox="0 0 ${f(widthCSS)} ${f(totalH)}"`,
      `     font-family="Arial,Helvetica,sans-serif">`,
    );
    lines.push(
      `<rect width="${f(widthCSS)}" height="${f(totalH)}" fill="${publishWidth ? "#f2f9fb" : "#fff"}"/>`,
    );

    // ── 3. Channel label with colour tag (skipped when omitLabel) ───
    if (!omitLabel) {
      let labelTextX = 8;

      // Always show group colour tag (left border bar) for ALL channels
      const groupColor = parent ? parent.groupColor : channel.groupColor;
      let sx = 4;
      if (groupColor) {
        const tagW = 4;
        const tagH = labelH - 4;
        const tagY = 2;
        lines.push(
          `<rect x="3" y="${f(tagY)}" width="${tagW}" height="${f(tagH)}" rx="1" fill="${groupColor}"/>`,
        );
        sx = 3 + tagW + 2;
      }

      if (parent) {
        // Sub-channel: show sample label colour strips AFTER group tag
        const sampleLabelStrips = parent.getSampleLabelColors(channel);
        if (sampleLabelStrips.length > 0) {
          const stripW = 4;
          const stripGap = 1;
          const stripH = labelH - 4;
          const stripY = 2;
          for (const strip of sampleLabelStrips) {
            lines.push(
              `<rect x="${f(sx)}" y="${f(stripY)}" width="${stripW}" height="${f(stripH)}" rx="1" fill="${strip.color}"/>`,
            );
            sx += stripW + stripGap;
          }
        }
      }
      labelTextX = sx + 4;

      lines.push(
        `<text x="${f(labelTextX)}" y="${f(labelH / 2 + 1)}" font-size="13" font-weight="600" fill="#1d1d1f" dominant-baseline="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">${this.escXml(channel.name)}</text>`,
      );
      lines.push(
        `<line x1="0" y1="${labelH}" x2="${f(widthCSS)}" y2="${labelH}" stroke="#e0e0e0" stroke-width="1"/>`,
      );
    }

    const foreground = channel.getChannelConfig().style?.foreground as any;
    const scorePalette =
      publishWidth &&
      plot === "diamond" &&
      foreground?.colormap &&
      !foreground.colorBy &&
      !foreground.sizeBy &&
      !foreground.alphaBy
        ? channel.getColormapInfo()
        : null;
    const scoreDiamonds = scorePalette
      ? buildPublishScoreDiamonds(
          channel.getData(),
          { start: domStart, end: domEnd },
          {
            width: widthCSS,
            top: contentTop,
            height: contentH,
            size: channel.getChannelConfig().style?.size ?? 0.4,
          },
          { ...scorePalette, alpha: foreground.alpha },
        )
      : null;

    // ── 4. Raster feature image ─────────────────────────────────────
    if (scoreDiamonds !== null) lines.push(scoreDiamonds);
    else
      lines.push(
        `<image x="0" y="${f(labelH + bodyOffset)}" width="${f(widthCSS)}" height="${f(heightCSS)}" xlink:href="${rasterDataUrl}" image-rendering="auto"/>`,
      );

    // ── 5. Vector grid lines ────────────────────────────────────────
    if (!publishWidth)
      this.appendGridSVG(lines, channel, widthCSS, labelH, heightCSS);

    const colorbarDefs: string[] = [];

    // ── 6. Vector text overlays (clipped to content area) ───────────
    const clipId = `clip-${++this._svgClipCounter}`;
    lines.push(
      `<defs><clipPath id="${clipId}"><rect x="0" y="${f(labelH)}" width="${f(widthCSS)}" height="${f(totalH - labelH)}"/></clipPath></defs>`,
    );
    lines.push(`<g clip-path="url(#${clipId})">`);

    // 6a. Transcript labels + strand arrows
    if (plot === "transcript" || plot === "rna") {
      const txRecords = channel.getTranscriptRecords();
      const laneH = 28;
      const scrollCSS = channel.getTranscriptScrollOffset();
      for (const tx of txRecords) {
        const laneTop = tx.lane * laneH - scrollCSS;
        const txX1 = xScale(tx.txStart);
        const txX2 = xScale(tx.txEnd);
        const labelY = contentTop + laneTop + laneH * 0.55 + 2;
        if (labelY < labelH - 5 || labelY > totalH) continue;
        const strandChar = tx.strand === "-" ? "< " : "";
        const strandSuffix = tx.strand === "+" ? " >" : "";
        const geneName = `${strandChar}${tx.geneName}${strandSuffix}`;
        const visLeft = Math.max(txX1, 0);
        const visRight = Math.min(txX2, widthCSS);
        const visW = visRight - visLeft;
        if (visW < 10) continue;
        const labelX = visLeft + visW / 2;
        lines.push(
          `<text x="${f(labelX)}" y="${f(labelY)}" font-size="9" fill="#555" text-anchor="middle" dominant-baseline="hanging">${this.escXml(geneName)}</text>`,
        );
        const arrowY = contentTop + laneTop + laneH * 0.275 - 3;
        const arrowChar = tx.strand === "-" ? "❮" : "❯";
        const arrowSpacing = 40;
        const arrowSpan = visRight - visLeft;
        const numArrows = Math.max(0, Math.floor(arrowSpan / arrowSpacing) - 1);
        if (numArrows > 0) {
          const step = arrowSpan / (numArrows + 1);
          for (let j = 1; j <= numArrows; j++) {
            const ax = visLeft + step * j;
            lines.push(
              `<text x="${f(ax)}" y="${f(arrowY)}" font-size="7" fill="rgba(120,120,120,0.6)" text-anchor="middle" dominant-baseline="hanging">${arrowChar}</text>`,
            );
          }
        }
      }
    }

    // 6b. Sequence base characters
    if (plot === "sequence" && domLen <= 100 && pxPerBp >= 4) {
      const data = channel.getData();
      const fontSize = Math.min(
        Math.floor(pxPerBp * 0.8),
        Math.floor(contentH * 0.75),
      );
      if (fontSize >= 6) {
        for (const d of data) {
          const s = d.chromStart ?? d.start ?? 0;
          let base = (d.base || "N").toUpperCase();
          if (channel.isComplementStrand)
            base =
              (
                { A: "T", T: "A", U: "A", G: "C", C: "G" } as Record<
                  string,
                  string
                >
              )[base] || base;
          if (
            publishWidth &&
            (this.r.axisController.isRnaMode || this.r.axisController.isCdsMode)
          )
            base = base.replace(/T/g, "U");
          const cx = xScale(s) + pxPerBp / 2;
          const cy = contentTop + contentH / 2;
          lines.push(
            `<text x="${f(cx)}" y="${f(cy)}" font-size="${fontSize}" font-weight="400" fill="#fff" text-anchor="middle" dominant-baseline="central">${base}</text>`,
          );
        }
      }
    }

    if (publishWidth && plot === "sequence" && (domLen > 100 || pxPerBp < 4)) {
      lines.push(
        `<text x="${f(widthCSS / 2)}" y="${f(totalH / 2)}" font-size="17" fill="#667085" text-anchor="middle" dominant-baseline="central">Zoom in to view sequence</text>`,
      );
    }

    // 6c. Rect / diamond name labels (when "Show name" is active)
    if (
      ["rect", "diamond", "score_rect", ""].includes(plot) &&
      channel.getShowName()
    ) {
      const data = channel.getData();
      const defaultFS = 9;
      const charW = defaultFS * 0.58;
      // Labels sit below the shortened rect body.
      // The rect was rendered with 30% extra bottom padding, so its
      // bottom edge is at contentTop + contentH * 0.7.
      const rectBodyH = contentH * 0.7;
      const labelArea = contentH - rectBodyH;
      const labelBaseY = contentTop + rectBodyH + (labelArea + defaultFS) / 2;
      for (const feature of data) {
        const rawName =
          (feature as any).geneName ??
          (feature as any).name ??
          (feature as any).gene_name ??
          "";
        if (!rawName || typeof rawName !== "string") continue;

        const rawStrand = feature.strand;
        const isForward = rawStrand === "+" || rawStrand === 1;
        const isReverse = rawStrand === "-" || rawStrand === -1;
        const displayName = `${isReverse ? "< " : ""}${rawName}${isForward ? " >" : ""}`;

        const fStart = feature.chromStart ?? feature.start ?? 0;
        const fEnd = feature.chromEnd ?? feature.end ?? fStart;

        const x1 = xScale(fStart);
        const x2 = xScale(fEnd);
        const visL = Math.max(x1, 0);
        const visR = Math.min(x2, widthCSS);
        const visW = visR - visL;
        if (visW <= 0) continue;

        const labelW = displayName.length * charW;
        let fs = defaultFS;

        if (labelW > visW && visW > 0) {
          fs = defaultFS * (visW / labelW);
        }
        if (fs < 4) continue;

        const cx = visL + visW / 2;
        lines.push(
          `<text x="${f(cx)}" y="${f(labelBaseY)}" font-size="${f(fs)}" fill="#000" text-anchor="middle" dominant-baseline="central">${this.escXml(displayName)}</text>`,
        );
      }
    }

    // 6d. Variant alt-allele base letters
    if (plot === "variant" && domLen <= 5000 && pxPerBp >= 4) {
      const varRecords = channel.getVariantRecords();
      const varLanes = Math.max(channel.getVariantLaneCount(), 1);
      const varTotalCSS = channel.getVariantTotalHeightCSS();
      const varScrollCSS = channel.getVariantScrollOffset();
      const rowH = varTotalCSS / varLanes;
      const fillH = rowH * 0.8;
      const fontSize = Math.min(
        Math.floor(pxPerBp * 0.8),
        Math.floor(fillH * 0.75),
      );
      if (fontSize >= 6) {
        for (const rec of varRecords) {
          const rectTopCSS =
            contentTop + rec.lane * rowH + rowH * 0.1 - varScrollCSS;
          if (rectTopCSS + fillH < labelH || rectTopCSS > totalH) continue;
          const varW = rec.end - rec.start || 1;
          const cx = xScale(rec.start) + (varW * pxPerBp) / 2;
          const cy = contentTop + rec.lane * rowH + rowH / 2 - varScrollCSS;
          const altText = rec.altDisplay || rec.alt?.[0] || "";
          const display =
            altText.length > 3 ? altText.charAt(0) + "…" : altText;
          lines.push(
            `<text x="${f(cx)}" y="${f(cy)}" font-size="${fontSize}" font-weight="400" fill="#fff" text-anchor="middle" dominant-baseline="central">${this.escXml(display)}</text>`,
          );
        }
      }
    }

    // 6d. Score labels / colorbars
    if (plot === "bam") {
      const bamCmInfo = channel.getBamCoverageColormapInfo();
      if (bamCmInfo) {
        this.appendColorbarLabelSVG(
          lines,
          bamCmInfo.colormap,
          bamCmInfo.min,
          bamCmInfo.max,
          10,
          widthCSS,
          contentTop + 4,
          false,
          colorbarDefs,
        );
      } else {
        const covMax = channel.getBamCoverageMax();
        if (covMax > 0 && channel.isBamCoverageEnabled()) {
          const fmt = (v: number) =>
            Number.isInteger(v)
              ? String(v)
              : v.toFixed(2).replace(/\.?0+$/, "");
          const scoreTxt = `[0, ${fmt(covMax)}]`;
          this.appendScoreLabelSVG(
            lines,
            scoreTxt,
            10,
            widthCSS,
            contentTop + 4,
          );
        }
      }
    }
    if (
      plot === "bar" ||
      plot === "bigwig" ||
      plot === "line" ||
      plot === "point" ||
      plot === "heatmap" ||
      plot === "score_rect" ||
      plot === "score_curve" ||
      plot === "diamond"
    ) {
      const cmInfo = channel.getColormapInfo();
      if (cmInfo) {
        this.appendColorbarLabelSVG(
          lines,
          cmInfo.colormap,
          cmInfo.min,
          cmInfo.max,
          publishWidth ? 17 : 11,
          widthCSS,
          labelH + 4,
          cmInfo.reversed,
          colorbarDefs,
          publishWidth && plot === "diamond"
            ? this.publishDiamondScores(channel, domStart, domEnd)
            : [],
        );
      } else {
        const scoreTxt = channel.getScoreLabelText();
        if (scoreTxt) {
          this.appendScoreLabelSVG(
            lines,
            scoreTxt,
            publishWidth ? 17 : 12,
            widthCSS,
            labelH + 4,
          );
        }
      }
    }
    if (plot === "transcript" || plot === "rna") {
      const modCmInfo = channel.getModificationColormapInfo();
      if (modCmInfo) {
        this.appendColorbarLabelSVG(
          lines,
          modCmInfo.colormap,
          modCmInfo.min,
          modCmInfo.max,
          10,
          widthCSS,
          labelH + 4,
          false,
          colorbarDefs,
        );
      }
    }

    // 6e. Rect/diamond strand direction arrows
    if (
      scoreDiamonds === null &&
      (plot === "rect" || plot === "diamond" || plot === "score_rect")
    ) {
      const featureData = channel.getData();
      if (featureData && featureData.length > 0) {
        const arrowSpacing = 30;
        const arrowFontSize = 8;
        const arrowY = contentTop + contentH * 0.5;
        for (const feature of featureData) {
          const rawStrand = feature.strand;
          if (!rawStrand || rawStrand === "." || rawStrand === 0) continue;
          const isForward =
            rawStrand === "+" || rawStrand === 1 || rawStrand === "1";
          const isReverse =
            rawStrand === "-" || rawStrand === -1 || rawStrand === "-1";
          if (!isForward && !isReverse) continue;
          const arrowChar = isReverse ? "❮" : "❯";
          const fStart = feature.chromStart ?? feature.start ?? 0;
          const fEnd = feature.chromEnd ?? feature.end ?? fStart;
          let xStart = xScale(fStart);
          let xEnd = xScale(fEnd);
          xStart = Math.max(0, xStart);
          xEnd = Math.min(widthCSS, xEnd);
          const featureW = xEnd - xStart;
          if (featureW < 14) continue;
          const numArrows = Math.max(1, Math.floor(featureW / arrowSpacing));
          const step = featureW / (numArrows + 1);
          for (let ai = 1; ai <= numArrows; ai++) {
            const ax = xStart + step * ai;
            lines.push(
              `<text x="${f(ax)}" y="${f(arrowY)}" font-size="${arrowFontSize}" fill="rgba(255,255,255,0.75)" text-anchor="middle" dominant-baseline="central">${arrowChar}</text>`,
            );
          }
        }
      }
    }

    lines.push(`</g>`);

    if (colorbarDefs.length > 0) {
      lines.push(...colorbarDefs);
    }

    lines.push(`</svg>`);
    return lines.join("\n");
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Hybrid SVG builder  (raster features + vector text)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Build a hybrid SVG:
   *   • Feature layer  — WebGL pixel capture embedded as `<image>`
   *   • Text layer     — vector `<text>` elements for:
   *       channel label, transcript gene labels & strand arrows,
   *       sequence base characters, variant alt letters, score labels.
   *
   * This gives pixel-perfect feature rendering (identical to PNG)
   * while keeping all text fully editable / scalable.
   */
  private buildHybridSVG(channel: ChannelView): string | null {
    const gl = this.r.context.gl;
    const glCanvas = this.r.context.canvas;
    if (!gl || !glCanvas) return null;

    const dpr = window.devicePixelRatio || 1;
    const bounds = channel.getBounds();
    const cxDev = Math.round(bounds.x);
    const cyDev = Math.round(bounds.y);
    const cwDev = Math.round(bounds.width);

    // For expanded parent channels, getBounds() includes expand-group height.
    // We only want the parent's own height for capture.
    const isExpandedParent =
      channel.isExpanded && channel.subChannels.length > 0;
    const chDev = isExpandedParent
      ? Math.round(channel.ownHeight)
      : Math.round(bounds.height);
    if (cwDev <= 0 || chDev <= 0) return null;

    const widthCSS = cwDev / dpr;
    const heightCSS = chDev / dpr;
    const labelH = 24; // CSS px – label area at top
    const totalH = heightCSS + labelH;
    const plot = channel.plotType;
    const f = (n: number) => n.toFixed(2);

    // ── 1. Capture WebGL pixels → data-URL ──────────────────────────
    // Temporarily suppress grid so it won't appear in the raster capture.
    // Vector grid lines are added separately via appendGridSVG().
    const savedGridDisplay = this.r.gridRenderer?.getGridDisplay() ?? "none";
    if (this.r.gridRenderer && savedGridDisplay !== "none") {
      this.r.gridRenderer.setGridDisplay("none");
    }

    // For expanded parents, temporarily hide the expand group view so
    // sub-channels are NOT rendered into the parent's capture area.
    const savedExpandGroup = (channel as any)._expandGroupView;
    if (isExpandedParent) {
      (channel as any)._expandGroupView = null;
    }
    this.r.renderForExport();
    gl.finish();

    const pixels = new Uint8Array(cwDev * chDev * 4);
    gl.readPixels(
      cxDev,
      glCanvas.height - cyDev - chDev,
      cwDev,
      chDev,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );

    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = cwDev;
    tmpCanvas.height = chDev;
    const tmpCtx = tmpCanvas.getContext("2d")!;
    const imgData = tmpCtx.createImageData(cwDev, chDev);
    for (let row = 0; row < chDev; row++) {
      const srcOff = (chDev - 1 - row) * cwDev * 4;
      const dstOff = row * cwDev * 4;
      imgData.data.set(pixels.subarray(srcOff, srcOff + cwDev * 4), dstOff);
    }
    tmpCtx.putImageData(imgData, 0, 0);

    // Arc overlay (score_curve) is blitted to the WebGL canvas via
    // renderOverlayTexture, so it is captured by gl.readPixels above.

    const rasterDataUrl = tmpCanvas.toDataURL("image/png");

    // Restore expand group view and grid
    if (isExpandedParent) {
      (channel as any)._expandGroupView = savedExpandGroup;
    }
    if (this.r.gridRenderer && savedGridDisplay !== "none") {
      this.r.gridRenderer.setGridDisplay(savedGridDisplay);
    }
    this.r.renderForExport();

    // ── 2. Domain / padding ─────────────────────────────────────────
    const domStart = this.r.viewDomain.start;
    const domEnd = this.r.viewDomain.end;
    const domLen = domEnd - domStart;
    if (domLen <= 0) return null;

    const pad = channel.getPadding();
    const padTopCSS = heightCSS * pad.top;
    const contentH = heightCSS - padTopCSS - heightCSS * pad.bottom;
    const contentTop = labelH + padTopCSS; // CSS Y of content area start
    const pxPerBp = widthCSS / domLen;

    const xScale = (bp: number) => ((bp - domStart) / domLen) * widthCSS;

    // ── 3. Start SVG ────────────────────────────────────────────────
    const lines: string[] = [];
    lines.push(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
      `     width="${f(widthCSS)}" height="${f(totalH)}"`,
      `     viewBox="0 0 ${f(widthCSS)} ${f(totalH)}"`,
      `     font-family="Arial,Helvetica,sans-serif">`,
    );

    // Background
    lines.push(
      `<rect width="${f(widthCSS)}" height="${f(totalH)}" fill="#fff"/>`,
    );

    // ── 4. Channel label (vector) with group colour tag ────────────
    let chLabelX = 8;
    const chGroupColor = channel.groupColor;
    if (chGroupColor) {
      const tagW = 4;
      const tagH = labelH - 4;
      const tagY = 2;
      lines.push(
        `<rect x="3" y="${f(tagY)}" width="${tagW}" height="${f(tagH)}" rx="1" fill="${chGroupColor}"/>`,
      );
      chLabelX = 3 + tagW + 5;
    }
    lines.push(
      `<text x="${f(chLabelX)}" y="${f(labelH / 2 + 1)}" font-size="13" font-weight="600" fill="#1d1d1f" dominant-baseline="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">${this.escXml(channel.name)}</text>`,
    );
    lines.push(
      `<line x1="0" y1="${labelH}" x2="${f(widthCSS)}" y2="${labelH}" stroke="#e0e0e0" stroke-width="1"/>`,
    );

    // ── 5. Raster feature image ─────────────────────────────────────
    lines.push(
      `<image x="0" y="${labelH}" width="${f(widthCSS)}" height="${f(heightCSS)}" xlink:href="${rasterDataUrl}" image-rendering="auto"/>`,
    );

    // ── 5b. Vector grid lines ───────────────────────────────────────
    this.appendGridSVG(lines, channel, widthCSS, labelH, heightCSS);

    // Collect gradient <defs> outside the clip group so they are
    // resolved correctly when the SVG is rasterised via data-URL.
    const colorbarDefs: string[] = [];

    // ── 6. Vector text overlays (clipped to content area) ───────────
    const clipId = `clip-${++this._svgClipCounter}`;
    lines.push(
      `<defs><clipPath id="${clipId}"><rect x="0" y="${f(labelH)}" width="${f(widthCSS)}" height="${f(heightCSS)}"/></clipPath></defs>`,
    );
    lines.push(`<g clip-path="url(#${clipId})">`);

    // ── 6a. Transcript labels + strand arrows ───────────────────────
    if (plot === "transcript" || plot === "rna") {
      const txRecords = channel.getTranscriptRecords();
      const laneH = 28; // TX_LANE_HEIGHT_CSS
      const scrollCSS = channel.getTranscriptScrollOffset();

      for (const tx of txRecords) {
        const laneTop = tx.lane * laneH - scrollCSS;
        const txX1 = xScale(tx.txStart);
        const txX2 = xScale(tx.txEnd);

        // Visibility check
        const labelY = contentTop + laneTop + laneH * 0.55 + 2;
        if (labelY < labelH - 5 || labelY > totalH) continue;

        // Gene name with strand indicator
        const strandChar = tx.strand === "-" ? "< " : "";
        const strandSuffix = tx.strand === "+" ? " >" : "";
        const geneName = `${strandChar}${tx.geneName}${strandSuffix}`;

        // Centre label within visible transcript extent
        const visLeft = Math.max(txX1, 0);
        const visRight = Math.min(txX2, widthCSS);
        const visW = visRight - visLeft;
        if (visW < 10) continue;

        const labelX = visLeft + visW / 2;
        lines.push(
          `<text x="${f(labelX)}" y="${f(labelY)}" font-size="9" fill="#555" text-anchor="middle" dominant-baseline="hanging">${this.escXml(geneName)}</text>`,
        );

        // Strand direction arrows along the intron backbone
        const arrowY = contentTop + laneTop + laneH * 0.275 - 3;
        const arrowChar = tx.strand === "-" ? "❮" : "❯";
        const arrowSpacing = 40;
        const arrowSpan = visRight - visLeft;
        const numArrows = Math.max(0, Math.floor(arrowSpan / arrowSpacing) - 1);
        if (numArrows > 0) {
          const step = arrowSpan / (numArrows + 1);
          for (let j = 1; j <= numArrows; j++) {
            const ax = visLeft + step * j;
            lines.push(
              `<text x="${f(ax)}" y="${f(arrowY)}" font-size="7" fill="rgba(120,120,120,0.6)" text-anchor="middle" dominant-baseline="hanging">${arrowChar}</text>`,
            );
          }
        }
      }
    }

    // ── 6b. Sequence base characters ─────────────────────────────────
    if (plot === "sequence" && domLen <= 100 && pxPerBp >= 4) {
      const data = channel.getData();
      const fontSize = Math.min(
        Math.floor(pxPerBp * 0.8),
        Math.floor(contentH * 0.75),
      );
      if (fontSize >= 6) {
        for (const d of data) {
          const s = d.chromStart ?? d.start ?? 0;
          const base = (d.base || "N").toUpperCase();
          const cx = xScale(s) + pxPerBp / 2;
          const cy = contentTop + contentH / 2;
          lines.push(
            `<text x="${f(cx)}" y="${f(cy)}" font-size="${fontSize}" font-weight="400" fill="#fff" text-anchor="middle" dominant-baseline="central">${base}</text>`,
          );
        }
      }
    }

    // ── 6c. Variant alt-allele base letters ──────────────────────────
    if (plot === "variant" && domLen <= 5000 && pxPerBp >= 4) {
      const varRecords = channel.getVariantRecords();
      const varLanes = Math.max(channel.getVariantLaneCount(), 1);
      const varTotalCSS = channel.getVariantTotalHeightCSS();
      const varScrollCSS = channel.getVariantScrollOffset();
      const rowH = varTotalCSS / varLanes;
      const fillH = rowH * 0.8;
      const fontSize = Math.min(
        Math.floor(pxPerBp * 0.8),
        Math.floor(fillH * 0.75),
      );

      if (fontSize >= 6) {
        for (const rec of varRecords) {
          const rectTopCSS =
            contentTop + rec.lane * rowH + rowH * 0.1 - varScrollCSS;
          if (rectTopCSS + fillH < labelH || rectTopCSS > totalH) continue;

          const varW = rec.end - rec.start || 1;
          const cx = xScale(rec.start) + (varW * pxPerBp) / 2;
          const cy = contentTop + rec.lane * rowH + rowH / 2 - varScrollCSS;
          const altText = rec.altDisplay || rec.alt?.[0] || "";
          const display =
            altText.length > 3 ? altText.charAt(0) + "…" : altText;
          lines.push(
            `<text x="${f(cx)}" y="${f(cy)}" font-size="${fontSize}" font-weight="400" fill="#fff" text-anchor="middle" dominant-baseline="central">${this.escXml(display)}</text>`,
          );
        }
      }
    }

    // ── 6d. Score labels ─────────────────────────────────────────────
    // BAM coverage score label + colorbar
    if (plot === "bam") {
      const bamCmInfo = channel.getBamCoverageColormapInfo();
      if (bamCmInfo) {
        this.appendColorbarLabelSVG(
          lines,
          bamCmInfo.colormap,
          bamCmInfo.min,
          bamCmInfo.max,
          10,
          widthCSS,
          contentTop + 4,
          false,
          colorbarDefs,
        );
      } else {
        const covMax = channel.getBamCoverageMax();
        if (covMax > 0 && channel.isBamCoverageEnabled()) {
          const fmt = (v: number) =>
            Number.isInteger(v)
              ? String(v)
              : v.toFixed(2).replace(/\.?0+$/, "");
          const scoreTxt = `[0, ${fmt(covMax)}]`;
          this.appendScoreLabelSVG(
            lines,
            scoreTxt,
            10,
            widthCSS,
            contentTop + 4,
          );
        }
      }
    }

    // Bigwig/bar/line/point/heatmap/score_rect/score_curve/diamond score label
    if (
      plot === "bar" ||
      plot === "bigwig" ||
      plot === "line" ||
      plot === "point" ||
      plot === "heatmap" ||
      plot === "score_rect" ||
      plot === "score_curve" ||
      plot === "diamond"
    ) {
      const cmInfo = channel.getColormapInfo();
      if (cmInfo) {
        this.appendColorbarLabelSVG(
          lines,
          cmInfo.colormap,
          cmInfo.min,
          cmInfo.max,
          11,
          widthCSS,
          labelH + 4,
          cmInfo.reversed,
          colorbarDefs,
        );
      } else {
        const scoreTxt = channel.getScoreLabelText();
        if (scoreTxt) {
          this.appendScoreLabelSVG(lines, scoreTxt, 12, widthCSS, labelH + 4);
        }
      }
    }

    // Transcript modification colorbar
    if (plot === "transcript" || plot === "rna") {
      const modCmInfo = channel.getModificationColormapInfo();
      if (modCmInfo) {
        this.appendColorbarLabelSVG(
          lines,
          modCmInfo.colormap,
          modCmInfo.min,
          modCmInfo.max,
          10,
          widthCSS,
          labelH + 4,
          false,
          colorbarDefs,
        );
      }
    }

    // ── 6e. Rect/diamond strand direction arrows ─────────────────
    if (plot === "rect" || plot === "diamond" || plot === "score_rect") {
      const featureData = channel.getData();
      if (featureData && featureData.length > 0) {
        const arrowSpacing = 30;
        const arrowFontSize = 8;
        const arrowY = contentTop + contentH * 0.5;

        for (const feature of featureData) {
          const rawStrand = feature.strand;
          if (!rawStrand || rawStrand === "." || rawStrand === 0) continue;
          const isForward =
            rawStrand === "+" || rawStrand === 1 || rawStrand === "1";
          const isReverse =
            rawStrand === "-" || rawStrand === -1 || rawStrand === "-1";
          if (!isForward && !isReverse) continue;
          const arrowChar = isReverse ? "❮" : "❯";

          const fStart = feature.chromStart ?? feature.start ?? 0;
          const fEnd = feature.chromEnd ?? feature.end ?? fStart;

          let xStart = xScale(fStart);
          let xEnd = xScale(fEnd);
          xStart = Math.max(0, xStart);
          xEnd = Math.min(widthCSS, xEnd);
          const featureW = xEnd - xStart;
          if (featureW < 14) continue;

          const numArrows = Math.max(1, Math.floor(featureW / arrowSpacing));
          const step = featureW / (numArrows + 1);
          for (let ai = 1; ai <= numArrows; ai++) {
            const ax = xStart + step * ai;
            lines.push(
              `<text x="${f(ax)}" y="${f(arrowY)}" font-size="${arrowFontSize}" fill="rgba(255,255,255,0.75)" text-anchor="middle" dominant-baseline="central">${arrowChar}</text>`,
            );
          }
        }
      }
    }

    lines.push(`</g>`); // close clip-path group

    // Insert gradient defs collected during colorbar rendering
    if (colorbarDefs.length > 0) {
      lines.push(...colorbarDefs);
    }

    lines.push(`</svg>`);
    return lines.join("\n");
  }

  // ── Score-label SVG helper ────────────────────────────────────────

  /**
   * Append a score label with a semi-transparent rounded-rect background.
   * The label is right-aligned at `(canvasW - margin, topY)`.
   */
  private appendScoreLabelSVG(
    lines: string[],
    text: string,
    fontSize: number,
    canvasW: number,
    topY: number,
  ): void {
    const f = (n: number) => n.toFixed(2);
    const charW = fontSize * 0.62; // monospace char width estimate
    const textW = text.length * charW;
    const padH = 5; // horizontal padding
    const padV = 3; // vertical padding
    const margin = 4; // right margin from canvas edge
    const rectW = textW + padH * 2;
    const rectH = fontSize + padV * 2;
    const rectX = canvasW - margin - rectW;
    const rectY = topY;
    const textX = canvasW - margin - padH;
    const textY = topY + padV + fontSize * 0.8; // baseline ≈ top + padV + ascent

    lines.push(
      `<rect x="${f(rectX)}" y="${f(rectY)}" width="${f(rectW)}" height="${f(rectH)}" rx="3" ry="3" fill="rgba(255,255,255,0.75)"/>`,
      `<text x="${f(textX)}" y="${f(textY)}" font-size="${fontSize}" font-family="monospace" fill="#555" text-anchor="end" dominant-baseline="auto">${this.escXml(text)}</text>`,
    );
  }

  /** Visible measurements on the same numerical scale as the channel colormap. */
  private publishDiamondScores(
    channel: ChannelView,
    start: number,
    end: number,
  ): number[] {
    const style = channel.getChannelConfig().style as any;
    const colorBy = style?.foreground?.colorBy;
    const index = colorBy ? (style?.keys?.indexOf(colorBy) ?? -1) : -1;
    const values = channel
      .getData()
      .filter(
        (record) =>
          (record.chromEnd ?? record.end) > start &&
          (record.chromStart ?? record.start) < end,
      )
      .map((record) => {
        const raw = colorBy
          ? (record._tokens ??
              String(record.rest ?? "").split(style?.sep || "|"))[index]
          : record.score;
        return raw === "" || raw == null ? NaN : Number(raw);
      })
      .filter(Number.isFinite);
    return [...new Set(values)];
  }

  /**
   * Append a compact colorbar legend with gradient + min/max labels.
   * Layout:  min [gradient-bar] max   — right-aligned.
   */
  private appendColorbarLabelSVG(
    lines: string[],
    colormapName: string,
    minVal: number,
    maxVal: number,
    fontSize: number,
    canvasW: number,
    topY: number,
    reversed: boolean = false,
    defsLines?: string[],
    currentValues: number[] = [],
  ): void {
    const rawColors =
      COLORMAP_GRADIENTS[colormapName as keyof typeof COLORMAP_GRADIENTS];
    if (!rawColors || rawColors.length === 0) {
      // Fall back to plain text
      const fmt = (v: number) =>
        Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
      this.appendScoreLabelSVG(
        lines,
        `[${fmt(minVal)}, ${fmt(maxVal)}]`,
        fontSize,
        canvasW,
        topY,
      );
      return;
    }

    const f = (n: number) => n.toFixed(2);
    const fmt = (v: number) =>
      Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");

    // Reverse the color stops when the colormap is reversed
    const colors = reversed ? [...rawColors].reverse() : rawColors;

    const minText = fmt(minVal);
    const maxText = fmt(maxVal);
    const charW = fontSize * 0.62;
    const barW = fontSize >= 17 ? fontSize * 3.6 : 40; // larger publication legends
    const barH = Math.max(6, fontSize * 0.55); // gradient bar height
    const gap = 2; // gap between text and bar
    const padH = 4;
    const padV = 3;
    const margin = 4;

    const minTextW = minText.length * charW;
    const maxTextW = maxText.length * charW;
    const totalContentW = minTextW + gap + barW + gap + maxTextW;
    const rectW = totalContentW + padH * 2;
    const rectH = fontSize + padV * 2;
    const rectX = canvasW - margin - rectW;
    const rectY = topY;

    // Background
    lines.push(
      `<rect x="${f(rectX)}" y="${f(rectY)}" width="${f(rectW)}" height="${f(rectH)}" rx="3" ry="3" fill="rgba(255,255,255,0.75)"/>`,
    );

    // Gradient definition
    const gradId = `cbar_${Math.random().toString(36).slice(2, 8)}`;
    const stops = colors
      .map(
        (c, i) =>
          `<stop offset="${((i / (colors.length - 1)) * 100).toFixed(1)}%" stop-color="${c}"/>`,
      )
      .join("");
    const defStr = `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs>`;
    (defsLines ?? lines).push(defStr);

    const textY = rectY + padV + fontSize * 0.8;
    let cx = rectX + padH;

    // Min text
    lines.push(
      `<text x="${f(cx)}" y="${f(textY)}" font-size="${fontSize}" font-family="monospace" fill="#555" text-anchor="start" dominant-baseline="auto">${this.escXml(minText)}</text>`,
    );
    cx += minTextW + gap;

    // Gradient bar
    const barY = rectY + (rectH - barH) / 2;
    lines.push(
      `<rect x="${f(cx)}" y="${f(barY)}" width="${f(barW)}" height="${f(barH)}" rx="1" ry="1" fill="url(#${gradId})"/>`,
    );
    if (maxVal > minVal && currentValues.length <= 16) {
      for (const value of currentValues) {
        const markerX =
          cx +
          Math.max(0, Math.min(1, (value - minVal) / (maxVal - minVal))) * barW;
        lines.push(
          `<line x1="${f(markerX)}" x2="${f(markerX)}" y1="${f(barY - 3)}" y2="${f(barY + barH + 3)}" stroke="#ff3b30" stroke-width="2.5" data-current-score="${value}"/>`,
        );
      }
      if (currentValues.length === 1) {
        lines.push(
          `<text x="${f(canvasW - margin)}" y="${f(rectY + rectH + fontSize)}" font-size="${fontSize}" font-family="monospace" fill="#555" text-anchor="end">${Number(currentValues[0].toPrecision(4))}</text>`,
        );
      }
    }
    cx += barW + gap;

    // Max text
    lines.push(
      `<text x="${f(cx)}" y="${f(textY)}" font-size="${fontSize}" font-family="monospace" fill="#555" text-anchor="start" dominant-baseline="auto">${this.escXml(maxText)}</text>`,
    );
  }

  // ── Vector grid SVG helper ────────────────────────────────────────

  /**
   * Append vector grid lines (horizontal between-track + vertical dashed)
   * for the current channel in the SVG export.
   */
  private appendGridSVG(
    lines: string[],
    _channel: ChannelView,
    canvasW: number,
    labelH: number,
    channelH: number,
  ): void {
    if (!this.r.gridRenderer) return;
    const display = this.r.gridRenderer.getGridDisplay();
    if (display === "none") return;

    const f = (n: number) => n.toFixed(2);
    const color = this.r.gridRenderer.getGridColorCSS();

    // ── Horizontal line at bottom of this channel ────────────────────
    if (display === "x" || display === "x+y") {
      const hy = labelH + channelH;
      lines.push(
        `<line x1="0" y1="${f(hy)}" x2="${f(canvasW)}" y2="${f(hy)}" stroke="${color}" stroke-width="1"/>`,
      );
    }

    // ── Vertical dashed lines at genomic intervals ──────────────────
    if (display === "y" || display === "x+y") {
      const domLen = this.r.viewDomain.end - this.r.viewDomain.start;
      if (domLen > 0) {
        const interval = this.r.gridRenderer.getAutoInterval(domLen);
        const startPos =
          Math.ceil(this.r.viewDomain.start / interval) * interval;
        const gridTop = labelH;
        const gridBot = labelH + channelH;
        const dashLen = 5;
        const gapLen = 5;
        // Vertical dashed line opacity matches WebGL (alpha * 0.6)
        const vColor = color.replace(/,\s*[\d.]+\)$/, ",0.6)");

        for (
          let pos = startPos;
          pos <= this.r.viewDomain.end;
          pos += interval
        ) {
          const x = ((pos - this.r.viewDomain.start) / domLen) * canvasW;
          // Build dash pattern as stroke-dasharray
          lines.push(
            `<line x1="${f(x)}" y1="${f(gridTop)}" x2="${f(x)}" y2="${f(gridBot)}" stroke="${vColor}" stroke-width="1" stroke-dasharray="${dashLen} ${gapLen}"/>`,
          );
        }
      }
    }
  }

  // ── SVG → PDF conversion ──────────────────────────────────────────

  /** Convert an SVG string to PDF: render to canvas at 4× scale, then embed the result as a JPEG in a minimal PDF. */
  private exportSVGtoPDF(svgString: string, trackName: string): void {
    const pdfFilename = this.formatExportFilename(trackName, "pdf");
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
    const svgEl = svgDoc.documentElement;
    const svgW = parseFloat(svgEl.getAttribute("width") || "800");
    const svgH = parseFloat(svgEl.getAttribute("height") || "200");

    const svgB64 = btoa(unescape(encodeURIComponent(svgString)));
    const img = new Image();
    img.onload = () => {
      const scale = 4;
      const canvas = document.createElement("canvas");
      canvas.width = svgW * scale;
      canvas.height = svgH * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, svgW, svgH);

      canvas.toBlob(
        (jpegBlob) => {
          if (!jpegBlob) return;
          const reader = new FileReader();
          reader.onload = () => {
            const jpegData = new Uint8Array(reader.result as ArrayBuffer);
            const pdfBytes = this.buildMinimalPDF(
              jpegData,
              svgW,
              svgH,
              canvas.width,
              canvas.height,
            );
            const pdfBuf = pdfBytes.buffer.slice(
              pdfBytes.byteOffset,
              pdfBytes.byteOffset + pdfBytes.byteLength,
            ) as ArrayBuffer;
            const blob = new Blob([pdfBuf], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = pdfFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          };
          reader.readAsArrayBuffer(jpegBlob);
        },
        "image/jpeg",
        0.97,
      );
    };
    img.src = `data:image/svg+xml;base64,${svgB64}`;
  }

  // ── Minimal PDF builder ────────────────────────────────────────────

  /** Build a minimal single-page PDF with an embedded JPEG image. */
  private buildMinimalPDF(
    jpegData: Uint8Array,
    pageW: number,
    pageH: number,
    imgW: number,
    imgH: number,
  ): Uint8Array {
    const enc = new TextEncoder();
    const parts: Uint8Array[] = [];
    const offsets: number[] = [];
    let pos = 0;

    const write = (s: string) => {
      const b = enc.encode(s);
      parts.push(b);
      pos += b.length;
    };
    const recordObj = () => {
      offsets.push(pos);
    };

    // Header
    write("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

    // 1: Catalog
    recordObj();
    write("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

    // 2: Pages
    recordObj();
    write(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`);

    // 3: Page
    recordObj();
    write(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /XObject << /Img 5 0 R >> >> >>\nendobj\n`,
    );

    // 4: Content stream (draw the image full-page)
    const stream = `q ${pageW} 0 0 ${pageH} 0 0 cm /Img Do Q`;
    recordObj();
    write(
      `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );

    // 5: Image XObject — JPEG data with DCTDecode filter
    recordObj();
    write(
      `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegData.length} >>\nstream\n`,
    );
    parts.push(jpegData);
    pos += jpegData.length;
    write("\nendstream\nendobj\n");

    // Cross-reference table
    const xrefPos = pos;
    write("xref\n");
    write(`0 ${offsets.length + 1}\n`);
    write("0000000000 65535 f \n");
    for (const off of offsets) {
      write(`${String(off).padStart(10, "0")} 00000 n \n`);
    }

    // Trailer
    write(
      `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`,
    );

    // Concatenate
    const total = parts.reduce((s, p) => s + p.length, 0);
    const result = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      result.set(p, off);
      off += p.length;
    }
    return result;
  }
  private escXml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * Build an export filename with RBrowser_ prefix and datetime suffix.
   * Format: `RBrowser_{name}_{MMDDYYYYHHmmss}.{ext}`
   */
  private formatExportFilename(name: string, ext: string): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts =
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      now.getFullYear() +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds());
    // Sanitise name: replace characters invalid in filenames
    const safe = name.replace(/[<>:"/\\|?*]/g, "_");
    return `RBrowser_${safe}_${ts}.${ext}`;
  }

  /** Trigger a file download in the browser. */
  private triggerDownload(
    content: string,
    filename: string,
    mimeType: string,
  ): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Export the **current** browser configuration as an `ITRConfig` object.
   *
   * The exported config reflects live state:
   * - `region` uses the current visible domain (pan/zoom) rather than the
   *   initially loaded region.
   * - `channels` respects the current display order, height, style
   *   overrides and any channels added/removed at runtime.
   * - `grid` reads the live grid display/color settings.
   *
   * The returned object is a plain JSON-serialisable snapshot that can be
   * fed back into the renderer constructor to reproduce the current view.
   */
  public exportConfig(): ITRConfig {
    const chr = this.r.config.region.chr;
    const { minStart, maxEnd } = this.r.chrom.chromBounds(chr);
    const vStart = Math.round(Math.max(minStart, this.r.viewDomain.start));
    const vEnd = Math.round(Math.min(maxEnd, this.r.viewDomain.end));

    // ── Channels — current display order ────────────────────────────
    const channelViews = this.r.rootView.children.filter(
      (c: any) => c instanceof ChannelView,
    ) as ChannelView[];
    const channels: IChannel[] = channelViews.map((ch, idx) => {
      const cfg = { ...ch.getChannelConfig() };
      // Persist current display order
      cfg.order = idx;
      return cfg;
    });

    // ── Grid ────────────────────────────────────────────────────────
    const gridDisplay = this.r.gridRenderer?.getGridDisplay() ?? "none";
    const gridColor = this.r.gridRenderer?.getGridColorCSS() ?? "gray";

    // ── Live offsets — reflect current pan/zoom in RNA / CDS mode ──
    let liveUp = this.r._buildinUpstream ?? this.r.config.target.upOffset;
    let liveDown = this.r._buildinDownstream ?? this.r.config.target.downOffset;
    if (this.r._rnaInfo) {
      liveUp = Math.max(
        0,
        Math.round(this.r._rnaInfo.txStart - this.r.viewDomain.start),
      );
      liveDown = Math.max(
        0,
        Math.round(this.r.viewDomain.end - this.r._rnaInfo.txEnd),
      );
    } else if (this.r._cdsInfo && this.r._cdsMapper) {
      // viewDomain is in CDS space — convert back to genomic
      const gStart = this.r._cdsMapper.cdsToGenomic(this.r.viewDomain.start);
      const gEnd = this.r._cdsMapper.cdsToGenomic(this.r.viewDomain.end);
      liveUp = Math.max(
        0,
        Math.round(this.r._cdsInfo.txStart - Math.min(gStart, gEnd)),
      );
      liveDown = Math.max(
        0,
        Math.round(Math.max(gStart, gEnd) - this.r._cdsInfo.txEnd),
      );
    }

    // ── Live locus — current transcript + visible genomic window ────
    // Preserves asymmetric upstream / downstream flanks so an exported
    // config can round-trip back into the renderer with the same view.
    const liveLocus: IDefaultLocus = {
      rna: {
        gene_name:
          this.r._transcriptInfo?.gene_name ||
          this.r.config.locus.rna?.gene_name ||
          undefined,
        gene_id:
          this.r._transcriptInfo?.gene_id ||
          this.r.config.locus.rna?.gene_id ||
          undefined,
        trans_name:
          this.r._rnaInfo?.name ||
          this.r._cdsInfo?.name ||
          this.r._transcriptInfo?.trans_name ||
          this.r.config.locus.rna?.trans_name ||
          undefined,
        trans_id:
          this.r._transcriptInfo?.trans_id ||
          this.r.config.locus.rna?.trans_id ||
          undefined,
        up: liveUp,
        down: liveDown,
      },
      dna: { chr: chr, start: vStart, end: vEnd },
      // ── Mode — current coordinate mode ──────────────────────────
      mode: this.r.axisController.isCdsMode
        ? "cds"
        : this.r.axisController.isRnaMode
          ? "rna"
          : "dna",
    };

    // ── Renderer — strip internal panel fields (exposed via settings)
    const {
      leftPanel: _lp,
      headerPanel: _hp,
      ...rendererPublic
    } = this.r.config.renderer;

    // ── Settings — panels + grid + axis + loading + channelLabel ───
    const hp = this.r.config.renderer.headerPanel;
    const headerSettings = {
      history: { enabled: hp?.history?.enable !== false },
      favorites: { enabled: hp?.favourites?.enable !== false },
      download: { enabled: hp?.download?.enable !== false },
      channelLabel: { enabled: hp?.channel_label?.enable !== false },
      legend: { enabled: hp?.legend?.enable !== false },
      grid: { enabled: hp?.grid?.enable !== false },
      tooltip: { enabled: hp?.tooltip?.enable !== false },
      highlight: { enabled: hp?.highlight?.enable !== false },
      cursor: { enabled: hp?.cursor?.enable !== false },
    };
    const settings: ITRConfig["settings"] = {
      panels: {
        left: { enabled: this.r.config.renderer.leftPanel?.enable === true },
        header: headerSettings,
      },
      grid: {
        enabled: gridDisplay !== "none",
        mode: gridDisplay,
        color: gridColor,
      },
      ...(this.r.config.axis ? { axis: { ...this.r.config.axis } } : {}),
      ...(this.r.config.loading
        ? { loading: { ...this.r.config.loading } }
        : {}),
      ...(this.r.config.channelLabel
        ? { channelLabel: { ...this.r.config.channelLabel } }
        : {}),
    };

    // ── Highlight regions ───────────────────────────────────────────
    // Strip the derived `featureRegions` cache — only the persistent fields
    // belong in an exported config.
    const highlightRegions = this.r.highlightManager.regions;
    const highlight: ITRConfig["highlight"] =
      highlightRegions.length > 0
        ? highlightRegions.map(
            ({ featureRegions: _featureRegions, ...rest }) => rest,
          )
        : undefined;

    const exported: ITRConfig = {
      renderer: { ...rendererPublic } as ITRConfig["renderer"],
      locus: liveLocus,
      ...(this.r.config.reference
        ? { reference: { ...this.r.config.reference } }
        : {}),
      settings,
      ...(highlight ? { highlight } : {}),
      channels,
    };

    return exported;
  }
}
