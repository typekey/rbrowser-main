import { IChannel } from "../channel/index";
import type {
  IReferenceConfig,
  IAnnotationReference,
  ITranscriptomeReference,
  IGenomeReference,
  IFastaReference,
} from "../config/config";
import { registerLocalBlob } from "../data/parser/local-blob-registry";
import { defaultConfig } from "../../../../config/default_config";

// ══════════════════════════════════════════════════════════════════════
//  Style constants (matching dialog/index.ts)
// ══════════════════════════════════════════════════════════════════════

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const TRANSITION = "0.22s cubic-bezier(0.25,0.46,0.45,0.94)";
const PRIMARY_COLOR = "#007aff";
const TEXT_COLOR = "#1d1d1f";
const SUBTITLE_COLOR = "#6e6e73";
const BORDER_COLOR = "#d2d2d7";
const INPUT_BG = "#f5f5f7";
const DIALOG_BG = "#fff";
const DIALOG_RADIUS = "12px";
const DIALOG_SHADOW =
  "0 20px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.08)";
const BACKDROP_BG = "rgba(0,0,0,0.35)";
const BACKDROP_BLUR = "blur(6px)";

// ══════════════════════════════════════════════════════════════════════
//  Track info detection (mirrors App.tsx detectTrackInfo)
// ══════════════════════════════════════════════════════════════════════

/**
 * Full list of supported file extensions (lowercase), sourced from
 * `defaultConfig.supportFiles`. Includes compound forms such as
 * `vcf.gz`, `fasta.gz.fai`, etc.
 */
const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set(
  defaultConfig.supportFiles.map((s) => s.toLowerCase()),
);

/**
 * Canonical format names (the leading dot-segment of each entry), used by
 * `_addChannelDirect` to validate `channel.data.format`. For example,
 * `vcf.gz.tbi` → `vcf`, `fasta.gz.fai` → `fasta`, `broadPeak` → `broadpeak`.
 */
export const SUPPORTED_FORMATS: ReadonlySet<string> = new Set(
  defaultConfig.supportFiles.map((s) => s.toLowerCase().split(".")[0]),
);

/**
 * Case-insensitive filename check. Matches the filename against every
 * entry in `defaultConfig.supportFiles` (allowing compound extensions
 * like `.vcf.gz` or `.fasta.gz.fai`).
 */
export function isSupportedFile(filename: string): boolean {
  const lower = filename.toLowerCase().split("?")[0];
  for (const ext of SUPPORTED_EXTENSIONS) {
    if (lower.endsWith("." + ext)) return true;
  }
  return false;
}

export interface TrackInfo {
  format: string;
  plot: string;
  needsIndex: string[]; // e.g. [".bai"] or [".fai", ".gzi"]
  /** `true` when the extension was not recognised. */
  unsupported?: boolean;
}

export function detectTrackInfo(filename: string): TrackInfo {
  const f = filename.toLowerCase();
  if (f.endsWith(".bam"))
    return { format: "bam", plot: "bam", needsIndex: [".bai"] };
  if (f.endsWith(".cram"))
    return { format: "cram", plot: "bam", needsIndex: [".crai"] };
  if (f.endsWith(".vcf.gz") || f.endsWith(".vcf.bgz"))
    return { format: "vcf", plot: "variant", needsIndex: [".tbi"] };
  if (f.endsWith(".bed.gz") || f.endsWith(".bed.bgz"))
    return { format: "bed", plot: "rect", needsIndex: [".tbi"] };
  if (f.endsWith(".bigwig") || f.endsWith(".bw"))
    return { format: "bigwig", plot: "bar", needsIndex: [] };
  if (f.endsWith(".bigbed") || f.endsWith(".bb"))
    return { format: "bigbed", plot: "rect", needsIndex: [] };
  if (f.match(/\.(gff3?|gtf)\.gz$/))
    return { format: "gff", plot: "transcript", needsIndex: [".tbi"] };
  if (f.match(/\.(fasta|fa|fna)\.gz$/))
    return { format: "fasta", plot: "sequence", needsIndex: [".fai", ".gzi"] };
  if (f.match(/\.(fasta|fa|fna)$/))
    return { format: "fasta", plot: "sequence", needsIndex: [".fai"] };
  if (f.endsWith(".ism.gz"))
    return { format: "ism", plot: "motif", needsIndex: [".tbi"] };
  // Plain-text BED-like (no index)
  if (f.endsWith(".narrowpeak"))
    return { format: "narrowPeak", plot: "rect", needsIndex: [] };
  if (f.endsWith(".broadpeak"))
    return { format: "broadPeak", plot: "rect", needsIndex: [] };
  if (f.endsWith(".bedgraph") || f.endsWith(".bg"))
    return { format: "bedGraph", plot: "bar", needsIndex: [] };
  if (f.endsWith(".bed"))
    return { format: "bed", plot: "rect", needsIndex: [] };
  // Unrecognised extension — extract it for the error message
  const ext = f.includes(".") ? f.slice(f.lastIndexOf(".")) : f;
  return { format: ext, plot: "rect", needsIndex: [], unsupported: true };
}

/** Build format-specific default channel config. */
export function buildDefaultChannelConfig(info: TrackInfo): Partial<IChannel> {
  const fmt = info.format;
  const dc = defaultConfig.channels;

  if (fmt === "bam" || fmt === "cram") {
    const d = dc.bam;
    return {
      plot: "bam",
      style: {
        height: d.style.height,
        padding: d.style.padding,
        readsColor: { ...d.style.readsColor },
        coverage: { ...d.style.coverage },
        label: { ...d.style.label },
      },
      group: {
        name: "BAM",
        style: { color: d.group?.style?.color ?? "#3867d6" },
      },
    };
  }

  if (fmt === "vcf") {
    const d = dc.variant;
    return {
      plot: "variant",
      style: {
        height: d.style.height,
        rowHeight: d.style.rowHeight,
        rowPadding: d.style.rowPadding,
        padding: d.style.padding,
        label: { ...d.style.label },
      },
      group: {
        name: "Variants",
        style: { color: dc._common.group.style.color },
      },
    };
  }

  if (fmt === "bigwig") {
    const d = dc.bar;
    return {
      plot: "bar",
      style: {
        height: d.style.height,
        padding: d.style.padding,
        foreground: dc._common.style.foreground,
      },
      group: {
        name: "Expression",
        style: { color: dc._common.group.style.color },
      },
      data: {
        method: "remote",
        format: "bigwig",
        url: "",
        windowingFunction: "mean",
      } as IChannel["data"],
    };
  }

  if (fmt === "bigbed" || fmt === "bed") {
    const d = dc.rect;
    return {
      plot: "rect",
      style: {
        height: d.style.height,
        padding: d.style.padding,
        sep: d.style.sep,
      },
      group: {
        name: "Annotation",
        style: { color: dc._common.group.style.color },
      },
    };
  }

  if (fmt === "gff") {
    const d = dc.transcript;
    return {
      plot: "transcript",
      style: {
        height: d.style.height,
        padding: d.style.padding,
        label: { ...d.style.label },
      },
      group: { name: "RNA Annotation", style: { color: d.group.style.color } },
    };
  }

  if (fmt === "fasta") {
    const d = dc.sequence;
    return {
      plot: "sequence",
      style: {
        height: d.style.height,
        padding: d.style.padding,
      },
    };
  }

  if (fmt === "ism") {
    return {
      plot: "motif",
      style: {
        height: 40,
        padding: "0.05",
        detailZoom: 1000000000000,
        label: { color: "#3867d6" },
      },
      group: {
        name: "ISM",
        style: { color: dc._common.group.style.color },
      },
    };
  }

  return {
    plot: info.plot as IChannel["plot"],
    style: { height: dc._common.style.height },
  };
}

// ══════════════════════════════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════════════════════════════

/** Strip known extensions from a filename to get a base/display name. */
export function baseName(filename: string): string {
  return filename.replace(
    /\.(bam|cram|vcf\.gz|vcf\.bgz|bed\.gz|bed\.bgz|bigwig|bw|bigbed|bb|gff3?\.gz|gtf\.gz|fasta\.gz|fa\.gz|fna\.gz|fasta|fa|fna|ism\.gz)$/i,
    "",
  );
}

/** Create a styled element. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Format badge colours by format type. */
const FORMAT_COLORS: Record<string, string> = {
  bam: "#e17055",
  cram: "#e17055",
  vcf: "#6c5ce7",
  bed: "#00b894",
  bigwig: "#0984e3",
  bigbed: "#00b894",
  gff: "#fdcb6e",
  fasta: "#55efc4",
  ism: "#a29bfe",
};

// ══════════════════════════════════════════════════════════════════════
//  Pending file entry (matches App.tsx LocalEntry)
// ══════════════════════════════════════════════════════════════════════

interface DropEntry {
  id: number;
  mainFile: File;
  info: TrackInfo;
  indexFiles: (File | null)[]; // one slot per needsIndex
  /** True if all required index files have been provided. */
  ready: boolean;
}

let _dropEntryId = 0;

// ══════════════════════════════════════════════════════════════════════
//  Drag-and-drop overlay
// ══════════════════════════════════════════════════════════════════════

/** Attach drag-and-drop file import to a container; returns a cleanup function. */
export function attachDragDrop(
  container: HTMLElement,
  onAdd: (config: IChannel) => void,
  onAddReference?: (config: IReferenceConfig) => void,
): () => void {
  let overlay: HTMLDivElement | null = null;
  /** Ref-count for nested dragenter/dragleave (child elements fire extra events). */
  let dragDepth = 0;

  // ── Create overlay ─────────────────────────────────────────────────

  function showOverlay(): void {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.style.cssText = [
      "position:absolute",
      "inset:0",
      "z-index:100000",
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "justify-content:center",
      "background:rgba(255,255,255,0.55)",
      "backdrop-filter:blur(12px)",
      "-webkit-backdrop-filter:blur(12px)",
      "border:2.5px dashed rgba(0,122,255,0.45)",
      "border-radius:8px",
      "pointer-events:none",
      "opacity:0",
      `transition:opacity ${TRANSITION}`,
    ].join(";");

    const iconSvg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    iconSvg.setAttribute("viewBox", "0 0 24 24");
    iconSvg.setAttribute("width", "48");
    iconSvg.setAttribute("height", "48");
    iconSvg.style.cssText =
      "color:rgba(0,122,255,0.6);margin-bottom:12px;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.08));";
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z",
    );
    path.setAttribute("fill", "currentColor");
    iconSvg.appendChild(path);
    overlay.appendChild(iconSvg);

    const label = document.createElement("div");
    label.textContent = "Drop to load new Channel";
    label.style.cssText = [
      `font-family:${FONT}`,
      "font-size:16px",
      "font-weight:600",
      "color:rgba(0,122,255,0.75)",
      "letter-spacing:0.02em",
      "text-shadow:0 1px 4px rgba(255,255,255,0.5)",
      "pointer-events:none",
      "user-select:none",
    ].join(";");
    overlay.appendChild(label);

    // Overlay is absolutely positioned, so the container must be a positioning context.
    const pos = getComputedStyle(container).position;
    if (pos === "static" || pos === "") {
      container.style.position = "relative";
    }
    container.appendChild(overlay);

    requestAnimationFrame(() => {
      if (overlay) overlay.style.opacity = "1";
    });
  }

  function hideOverlay(): void {
    if (!overlay) return;
    const ov = overlay;
    ov.style.opacity = "0";
    setTimeout(() => ov.remove(), 250);
    overlay = null;
  }

  // ── Drag events ────────────────────────────────────────────────────

  function onDragEnter(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    dragDepth++;
    if (dragDepth === 1) showOverlay();
  }

  function onDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    dragDepth--;
    if (dragDepth <= 0) {
      dragDepth = 0;
      hideOverlay();
    }
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    dragDepth = 0;
    hideOverlay();

    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;

    // A dropped `.rbi` / `.rba` / `.sqlite` catalogue means the user is loading
    // a genome reference, not a channel. Ask whether to import it as a Custom
    // Reference; on confirm, open the Import Custom Reference dialog (pre-filled
    // with every dropped file). Channels are imported via the normal path.
    if (onAddReference && files.some((f) => isReferenceCatalogueFile(f.name))) {
      confirmCustomReferenceDialog(files, onAddReference);
      return;
    }

    showImportDialog(files, onAdd);
  }

  // ── Attach ─────────────────────────────────────────────────────────

  container.addEventListener("dragenter", onDragEnter);
  container.addEventListener("dragover", onDragOver);
  container.addEventListener("dragleave", onDragLeave);
  container.addEventListener("drop", onDrop);

  return () => {
    container.removeEventListener("dragenter", onDragEnter);
    container.removeEventListener("dragover", onDragOver);
    container.removeEventListener("dragleave", onDragLeave);
    container.removeEventListener("drop", onDrop);
    hideOverlay();
  };
}

// ══════════════════════════════════════════════════════════════════════
//  Import dialog
// ══════════════════════════════════════════════════════════════════════

/** Animate-in helper for the dialog. */
function animateIn(backdrop: HTMLElement, dialog: HTMLElement): void {
  backdrop.style.opacity = "0";
  dialog.style.transform = "scale(0.95) translateY(8px)";
  dialog.style.opacity = "0";
  requestAnimationFrame(() => {
    backdrop.style.transition = `opacity ${TRANSITION}`;
    backdrop.style.opacity = "1";
    dialog.style.transition = `transform ${TRANSITION}, opacity ${TRANSITION}`;
    dialog.style.transform = "scale(1) translateY(0)";
    dialog.style.opacity = "1";
  });
}

/** Animate-out helper. */
function animateOut(backdrop: HTMLElement, dialog: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    backdrop.style.transition = `opacity ${TRANSITION}`;
    backdrop.style.opacity = "0";
    dialog.style.transition = `transform ${TRANSITION}, opacity ${TRANSITION}`;
    dialog.style.transform = "scale(0.95) translateY(8px)";
    dialog.style.opacity = "0";
    setTimeout(() => {
      backdrop.remove();
      resolve();
    }, 220);
  });
}

/**
 * Show the file-import dialog.
 *
 * Dropped files are auto-grouped: index files (`.tbi`, `.bai`, `.fai`, `.gzi`,
 * `.crai`, `.csi`) are matched to their main data file by name and merged into
 * one row. An entry becomes "ready" once all its required index slots are
 * filled; only ready entries are imported.
 */
export function showImportDialog(
  files: File[],
  onAdd: (config: IChannel) => void,
): void {
  // ── Classify files into "main" and "index" buckets ───────────────
  const INDEX_EXTS = [".bai", ".crai", ".tbi", ".csi", ".fai", ".gzi"];

  /** Check whether a filename looks like a standalone index file. */
  function isIndexFile(name: string): boolean {
    const lower = name.toLowerCase();
    return INDEX_EXTS.some((ext) => lower.endsWith(ext));
  }

  const mainFiles: File[] = [];
  const indexPool: File[] = [];

  for (const f of files) {
    if (isIndexFile(f.name)) {
      indexPool.push(f);
    } else {
      mainFiles.push(f);
    }
  }

  // ── Build entries for main files ─────────────────────────────────
  const entries: DropEntry[] = mainFiles.map((f) => {
    const info = detectTrackInfo(f.name);
    return {
      id: ++_dropEntryId,
      mainFile: f,
      info,
      indexFiles: info.needsIndex.map(() => null),
      ready: info.needsIndex.length === 0,
    };
  });

  // ── Auto-match index files to their main file ────────────────────
  // For each entry, try to find index files in the pool whose name
  // equals mainFile.name + ext  (e.g. "sample.bam" + ".bai" → "sample.bam.bai").
  // Also match by stripped name: "sample.bai" → "sample.bam" (BAM convention).
  const usedIndices = new Set<File>();

  for (const entry of entries) {
    const mainName = entry.mainFile.name;

    entry.info.needsIndex.forEach((ext, slotIdx) => {
      // Already filled (shouldn't happen, but guard)
      if (entry.indexFiles[slotIdx] !== null) return;

      // BAM accepts either a `.bai` (linear) or `.csi` (coordinate-sorted)
      // index, so try both extensions for that slot.
      const acceptedExts = ext === ".bai" ? [".bai", ".csi"] : [ext];

      // Strategy 1: mainName + ext  (e.g. "reads.bam" + ".bai" → "reads.bam.bai")
      // Strategy 2: for BAM/CRAM, strip the main ext then add index ext
      //   e.g. "reads.bam" → "reads" + ".bai" → "reads.bai"
      const dotPos = mainName.lastIndexOf(".");
      const candidates: string[] = [];
      for (const e of acceptedExts) {
        candidates.push((mainName + e).toLowerCase());
        if (dotPos > 0)
          candidates.push((mainName.slice(0, dotPos) + e).toLowerCase());
      }

      for (const idx of indexPool) {
        if (usedIndices.has(idx)) continue;
        const idxNameLower = idx.name.toLowerCase();
        if (candidates.includes(idxNameLower)) {
          entry.indexFiles[slotIdx] = idx;
          usedIndices.add(idx);
          break;
        }
      }
    });

    // Re-check readiness after auto-matching.
    if (
      entry.info.needsIndex.length > 0 &&
      entry.indexFiles.every((ix) => ix !== null)
    ) {
      entry.ready = true;
    }
  }

  // ── Orphan index files (no matching main file) → show as fallback rows ──
  for (const idx of indexPool) {
    if (usedIndices.has(idx)) continue;
    // Treat orphan index files as standalone entries so the user sees them
    const info = detectTrackInfo(idx.name);
    entries.push({
      id: ++_dropEntryId,
      mainFile: idx,
      info,
      indexFiles: info.needsIndex.map(() => null),
      ready: info.needsIndex.length === 0,
    });
  }

  /** Guard: prevent close() from running twice (fixes double-click). */
  let closing = false;

  // ── Shell (backdrop + card) ──────────────────────────────────────
  const backdrop = el(
    "div",
    [
      "position:fixed",
      "inset:0",
      "z-index:200000",
      `background:${BACKDROP_BG}`,
      `backdrop-filter:${BACKDROP_BLUR}`,
      `-webkit-backdrop-filter:${BACKDROP_BLUR}`,
      "display:flex",
      "align-items:center",
      "justify-content:center",
      `font-family:${FONT}`,
    ].join(";"),
  );

  const card = el(
    "div",
    [
      "min-width:480px",
      "max-width:640px",
      "width:92%",
      `background:${DIALOG_BG}`,
      `border-radius:${DIALOG_RADIUS}`,
      `box-shadow:${DIALOG_SHADOW}`,
      "padding:28px 32px 24px",
      "box-sizing:border-box",
      "outline:none",
      "max-height:80vh",
      "display:flex",
      "flex-direction:column",
    ].join(";"),
  );

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
  animateIn(backdrop, card);

  // ── Title ────────────────────────────────────────────────────────
  card.appendChild(
    el(
      "div",
      `font-size:17px;font-weight:700;color:${TEXT_COLOR};margin-bottom:4px;`,
      "Import Channels",
    ),
  );
  const autoMatchedCount = [...usedIndices].length;
  const subtitleParts: string[] = [
    `${files.length} file${files.length > 1 ? "s" : ""} detected`,
  ];
  if (autoMatchedCount > 0) {
    subtitleParts[0] += ` (${autoMatchedCount} index file${autoMatchedCount > 1 ? "s" : ""} auto-matched)`;
  }
  // List the unique extensions still required across all entries so the user
  // can see at a glance what to click.
  const pendingExts = Array.from(
    new Set(
      entries.flatMap((e) =>
        e.info.needsIndex.filter((_, i) => e.indexFiles[i] === null),
      ),
    ),
  );
  if (pendingExts.length > 0) {
    subtitleParts.push(
      `Click the colored ${pendingExts.join(" / ")} tag${pendingExts.length > 1 ? "s" : ""} in each row below to add the required index file${pendingExts.length > 1 ? "s" : ""}. Files in red are not ready.`,
    );
  } else {
    subtitleParts.push(
      "Files requiring an index must have all index files provided before import.",
    );
  }
  card.appendChild(
    el(
      "div",
      `font-size:13px;color:${SUBTITLE_COLOR};margin-bottom:14px;line-height:1.5;`,
      subtitleParts.join(". "),
    ),
  );

  // ── Table container (scrollable) ─────────────────────────────────
  const tableWrap = el(
    "div",
    [
      "flex:1",
      "overflow-y:auto",
      "margin-bottom:18px",
      `border:1px solid ${BORDER_COLOR}`,
      "border-radius:8px",
    ].join(";"),
  );
  card.appendChild(tableWrap);

  const table = el(
    "table",
    [
      "width:100%",
      "border-collapse:collapse",
      "font-size:12px",
      `color:${TEXT_COLOR}`,
    ].join(";"),
  );
  tableWrap.appendChild(table);

  // ── Table header ─────────────────────────────────────────────────
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.style.cssText = [
    `background:${INPUT_BG}`,
    `border-bottom:1.5px solid ${BORDER_COLOR}`,
    "position:sticky",
    "top:0",
    "z-index:1",
  ].join(";");

  const thStyle = [
    "padding:7px 10px",
    "text-align:left",
    "font-weight:700",
    "font-size:11px",
    `color:${SUBTITLE_COLOR}`,
    "text-transform:uppercase",
    "letter-spacing:0.04em",
    "white-space:nowrap",
  ].join(";");

  for (const label of ["File", "Format", "Plot", "Size", "Index", "Status"]) {
    const th = document.createElement("th");
    th.style.cssText = thStyle;
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  // ── Table body ───────────────────────────────────────────────────
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  /** Re-check whether the Add button should be enabled. */
  function updateAddButton(): void {
    const someReady = entries.some((e) => e.ready);
    addBtn.disabled = !someReady;
    addBtn.style.opacity = someReady ? "1" : "0.45";
    addBtn.style.cursor = someReady ? "pointer" : "not-allowed";
    const readyCount = entries.filter((e) => e.ready).length;
    addBtn.textContent = `Add ${readyCount} Channel${readyCount !== 1 ? "s" : ""}`;
  }

  const tdStyle = [
    "padding:6px 10px",
    "vertical-align:middle",
    `border-bottom:1px solid ${BORDER_COLOR}`,
    "white-space:nowrap",
  ].join(";");

  /**
   * Color used for each index-file extension tag, so different index types
   * (`.tbi`, `.fai`, `.gzi`, `.bai`, `.crai`, `.csi`) are visually
   * distinguishable both in the table and in the subtitle hint.
   */
  const INDEX_TAG_COLORS: Record<string, string> = {
    ".tbi": "#0984e3", // blue
    ".csi": "#5f27cd", // indigo
    ".bai": "#6c5ce7", // purple
    ".crai": "#a55eea", // magenta
    ".fai": "#00b894", // teal
    ".gzi": "#e67e22", // orange
  };
  function renderRow(entry: DropEntry): HTMLTableRowElement {
    const tr = document.createElement("tr");
    tr.style.cssText = `transition:background ${TRANSITION};`;

    // ── File name cell ─────────────────────────────────────────
    const tdFile = document.createElement("td");
    tdFile.style.cssText =
      tdStyle +
      ";max-width:180px;overflow:hidden;text-overflow:ellipsis;font-weight:500;";
    tdFile.title = entry.mainFile.name;
    tdFile.textContent = entry.mainFile.name;
    tr.appendChild(tdFile);

    // ── Format badge cell ──────────────────────────────────────
    const tdFormat = document.createElement("td");
    tdFormat.style.cssText = tdStyle;
    const badgeColor = entry.info.unsupported
      ? "#d63031"
      : (FORMAT_COLORS[entry.info.format] ?? SUBTITLE_COLOR);
    const badgeLabel = entry.info.unsupported
      ? `${entry.info.format} ✕`
      : entry.info.format;
    const badge = el(
      "span",
      [
        `background:${badgeColor}`,
        "color:#fff",
        "font-size:10px",
        "font-weight:700",
        "text-transform:uppercase",
        "padding:1px 6px",
        "border-radius:3px",
        "letter-spacing:0.03em",
      ].join(";"),
      badgeLabel,
    );
    tdFormat.appendChild(badge);
    tr.appendChild(tdFormat);

    // ── Plot type cell ─────────────────────────────────────────
    const tdPlot = document.createElement("td");
    tdPlot.style.cssText = tdStyle + `;color:${SUBTITLE_COLOR};`;
    tdPlot.textContent = entry.info.plot;
    tr.appendChild(tdPlot);

    // ── Size cell ──────────────────────────────────────────────
    const tdSize = document.createElement("td");
    tdSize.style.cssText =
      tdStyle + `;color:${SUBTITLE_COLOR};font-variant-numeric:tabular-nums;`;
    tdSize.textContent = formatFileSize(entry.mainFile.size);
    tr.appendChild(tdSize);

    // ── Index cell ─────────────────────────────────────────────
    const tdIndex = document.createElement("td");
    tdIndex.style.cssText = tdStyle;

    if (entry.info.needsIndex.length === 0) {
      tdIndex.textContent = "—";
      tdIndex.style.color = SUBTITLE_COLOR;
    } else {
      const indexWrap = el(
        "div",
        "display:flex;flex-direction:column;gap:3px;",
      );
      entry.info.needsIndex.forEach((ext, slotIdx) => {
        const slotRow = el("div", "display:flex;align-items:center;gap:5px;");
        const filled = entry.indexFiles[slotIdx] !== null;

        if (filled) {
          const check = el(
            "span",
            "color:#00b894;font-size:11px;font-weight:700;",
            "✓",
          );
          slotRow.appendChild(check);
          const fname = el(
            "span",
            `font-size:11px;color:${TEXT_COLOR};max-width:100px;overflow:hidden;text-overflow:ellipsis;`,
            entry.indexFiles[slotIdx]!.name,
          );
          fname.title = entry.indexFiles[slotIdx]!.name;
          slotRow.appendChild(fname);
        } else {
          const tagColor = INDEX_TAG_COLORS[ext.toLowerCase()] ?? PRIMARY_COLOR;
          // BAM accepts either a `.bai` or `.csi` index — hint both.
          const slotLabel =
            entry.info.format === "bam" && ext === ".bai" ? ".bai/.csi" : ext;
          const pickBtn = el(
            "button",
            [
              `background:${tagColor}`,
              "color:#fff",
              "border:none",
              "border-radius:3px",
              "padding:1px 7px",
              "font-size:10px",
              "font-weight:700",
              "cursor:pointer",
              `font-family:${FONT}`,
              `transition:filter ${TRANSITION}`,
              "letter-spacing:0.02em",
            ].join(";"),
            `${slotLabel}`,
          );
          pickBtn.title = `Click to choose the ${slotLabel} index file for ${entry.mainFile.name}`;
          pickBtn.addEventListener("mouseenter", () => {
            pickBtn.style.filter = "brightness(1.08)";
          });
          pickBtn.addEventListener("mouseleave", () => {
            pickBtn.style.filter = "";
          });

          const fileInput = document.createElement("input");
          fileInput.type = "file";
          fileInput.style.display = "none";
          fileInput.addEventListener("change", () => {
            const f = fileInput.files?.[0];
            if (!f) return;
            entry.indexFiles[slotIdx] = f;
            if (entry.indexFiles.every((ix) => ix !== null)) {
              entry.ready = true;
            }
            const newTr = renderRow(entry);
            tr.replaceWith(newTr);
            updateAddButton();
          });

          pickBtn.addEventListener("click", () => fileInput.click());
          slotRow.appendChild(pickBtn);
          slotRow.appendChild(fileInput);
        }

        indexWrap.appendChild(slotRow);
      });
      tdIndex.appendChild(indexWrap);
    }
    tr.appendChild(tdIndex);

    // ── Status cell ────────────────────────────────────────────
    const tdStatus = document.createElement("td");
    tdStatus.style.cssText = tdStyle + ";text-align:center;";
    if (entry.ready) {
      const dot = el(
        "span",
        "display:inline-block;width:8px;height:8px;border-radius:50%;background:#00b894;",
      );
      dot.title = "Ready";
      tdStatus.appendChild(dot);
    } else {
      const dot = el(
        "span",
        `display:inline-block;width:8px;height:8px;border-radius:50%;background:#d63031;border:1.5px solid #d63031;`,
      );
      dot.title =
        "Missing index file(s) \u2014 click the colored tag(s) on the left to add them";
      tdStatus.appendChild(dot);
    }
    tr.appendChild(tdStatus);

    tr.addEventListener("mouseenter", () => {
      tr.style.background = "rgba(0,122,255,0.04)";
    });
    tr.addEventListener("mouseleave", () => {
      tr.style.background = "";
    });

    return tr;
  }

  entries.forEach((entry) => {
    tbody.appendChild(renderRow(entry));
  });

  // ── Button row ───────────────────────────────────────────────────
  const btnRow = el(
    "div",
    "display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;",
  );

  const cancelBtn = el(
    "button",
    [
      "background:transparent",
      `color:${SUBTITLE_COLOR}`,
      `border:1px solid ${BORDER_COLOR}`,
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:500",
      "cursor:pointer",
      `font-family:${FONT}`,
      `transition:background ${TRANSITION}`,
      "line-height:1.4",
    ].join(";"),
    "Cancel",
  );
  cancelBtn.addEventListener("mouseenter", () => {
    cancelBtn.style.background = "rgba(0,0,0,0.04)";
  });
  cancelBtn.addEventListener("mouseleave", () => {
    cancelBtn.style.background = "transparent";
  });

  const addBtn = el(
    "button",
    [
      `background:${PRIMARY_COLOR}`,
      "color:#fff",
      "border:none",
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:600",
      "cursor:pointer",
      `font-family:${FONT}`,
      `transition:background ${TRANSITION}, opacity ${TRANSITION}`,
      "line-height:1.4",
    ].join(";"),
    "Add",
  );
  addBtn.addEventListener("mouseenter", () => {
    if (!addBtn.disabled) addBtn.style.filter = "brightness(1.08)";
  });
  addBtn.addEventListener("mouseleave", () => {
    addBtn.style.filter = "";
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(addBtn);
  card.appendChild(btnRow);

  updateAddButton();

  // ── Actions ──────────────────────────────────────────────────────

  function close(): void {
    if (closing) return;
    closing = true;
    document.removeEventListener("keydown", onKey);
    animateOut(backdrop, card);
  }

  cancelBtn.addEventListener("click", () => close());

  addBtn.addEventListener("click", () => {
    if (closing) return;
    for (const entry of entries) {
      if (!entry.ready) continue;
      const bname = baseName(entry.mainFile.name);
      const defaults = buildDefaultChannelConfig(entry.info);
      const baseData = defaults.data ?? {};
      const dataConfig: IChannel["data"] = {
        ...baseData,
        method: "remote" as const,
        format: entry.info.format,
        url: URL.createObjectURL(entry.mainFile),
        ...(entry.indexFiles[0]
          ? { index: URL.createObjectURL(entry.indexFiles[0]!) }
          : {}),
        ...(entry.indexFiles[1]
          ? { index2: URL.createObjectURL(entry.indexFiles[1]!) }
          : {}),
        // Blob URLs carry no extension, so record the BAM index variant
        // explicitly from the original filename for the parser to honour.
        ...(entry.info.format === "bam" && entry.indexFiles[0]
          ? {
              indexFormat: entry.indexFiles[0]!.name.toLowerCase().endsWith(
                ".csi",
              )
                ? ("csi" as const)
                : ("bai" as const),
            }
          : {}),
      };
      const channelConfig: IChannel = {
        ...defaults,
        name: bname,
        data: dataConfig,
      } as IChannel;
      onAdd(channelConfig);
    }
    close();
  });

  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close();
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
}

// ══════════════════════════════════════════════════════════════════════
//  Remote URL Import Dialog
// ══════════════════════════════════════════════════════════════════════

interface RemoteEntry {
  url: string;
  indexUrl: string;
  index2Url: string;
  name: string;
  info: TrackInfo;
}

// ── URL validation helpers ───────────────────────────────────────────

/**
 * Check whether a URL ends with a recognised data-file extension.
 * Delegates to `isSupportedFile`, which is driven by
 * `defaultConfig.supportFiles` (single source of truth).
 */
function hasValidExtension(url: string): boolean {
  return isSupportedFile(url);
}

type CheckState = "idle" | "checking" | "ok" | "ok-proxied" | "fail";

// ── CORS proxy (matches backend CORS_PROXY_ALLOWED_HOSTS) ────────────
const CORS_PROXY_BASE = "https://api.rbrowser.org/api/v1/cors-proxy/";
const CORS_PROXY_HOSTS = new Set([
  "cgl.gi.ucsc.edu",
  "hgdownload.soe.ucsc.edu",
  "hgdownload.cse.ucsc.edu",
  "www.encodeproject.org",
]);

/** Whether the URL's host is served by our CORS proxy. */
function isProxiedHost(url: string): boolean {
  try {
    return CORS_PROXY_HOSTS.has(new URL(url).host);
  } catch {
    return false;
  }
}

/** Rewrite a URL to go through the CORS proxy. */
function buildProxyUrl(url: string): string {
  return CORS_PROXY_BASE + url;
}

/** Try a HEAD then a Range GET. Returns true if either succeeds. */
async function tryFetch(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      mode: "cors",
      cache: "no-cache",
    });
    if (res.ok) return true;
  } catch {
    // fall through to GET attempt
  }
  try {
    const res2 = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-cache",
      headers: { Range: "bytes=0-0" },
    });
    return res2.ok || res2.status === 206;
  } catch {
    return false;
  }
}

/**
 * Check whether a URL is accessible. Hosts in `CORS_PROXY_HOSTS` are checked
 * via the proxy (they don't serve CORS headers directly).
 * Returns `{ok, proxied}` so the UI can indicate that the proxy was used.
 */
async function checkUrlAccessible(
  url: string,
): Promise<{ ok: boolean; proxied: boolean }> {
  if (isProxiedHost(url)) {
    const ok = await tryFetch(buildProxyUrl(url));
    return { ok, proxied: true };
  }
  const ok = await tryFetch(url);
  return { ok, proxied: false };
}

/**
 * Show the remote-URL channel import dialog. Pre-fills format/plot/index from
 * URL detection, validates the extension, and probes URL accessibility (main
 * plus auto-detected index URLs).
 */
export function showRemoteImportDialog(
  onAdd: (config: IChannel) => void,
  /** Pre-fill values (optional). */
  prefill?: {
    url?: string;
    indexUrl?: string;
    index2Url?: string;
    name?: string;
  },
): void {
  const entry: RemoteEntry = {
    url: prefill?.url ?? "",
    indexUrl: prefill?.indexUrl ?? "",
    index2Url: prefill?.index2Url ?? "",
    name: prefill?.name ?? "",
    info: prefill?.url
      ? detectTrackInfo(
          prefill.url.split("?")[0].split("/").pop() ?? prefill.url,
        )
      : { format: "bed", plot: "rect", needsIndex: [] },
  };

  let closing = false;

  // ── Accessibility-check state ──────────────────────────────────────
  let urlCheck: CheckState = "idle";
  let indexCheck: CheckState = "idle";
  let index2Check: CheckState = "idle";
  let extValid = entry.url ? hasValidExtension(entry.url) : true;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const indexDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const index2DebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Shell ──────────────────────────────────────────────────────────
  const backdrop = el(
    "div",
    [
      "position:fixed",
      "inset:0",
      "z-index:200000",
      `background:${BACKDROP_BG}`,
      `backdrop-filter:${BACKDROP_BLUR}`,
      `-webkit-backdrop-filter:${BACKDROP_BLUR}`,
      "display:flex",
      "align-items:center",
      "justify-content:center",
      `font-family:${FONT}`,
    ].join(";"),
  );

  const card = el(
    "div",
    [
      "min-width:480px",
      "max-width:600px",
      "width:90%",
      `background:${DIALOG_BG}`,
      `border-radius:${DIALOG_RADIUS}`,
      `box-shadow:${DIALOG_SHADOW}`,
      "padding:28px 32px 24px",
      "box-sizing:border-box",
      "outline:none",
    ].join(";"),
  );

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
  animateIn(backdrop, card);

  // ── Title ──────────────────────────────────────────────────────────
  card.appendChild(
    el(
      "div",
      `font-size:17px;font-weight:700;color:${TEXT_COLOR};margin-bottom:4px;`,
      "Import Remote Channel",
    ),
  );
  card.appendChild(
    el(
      "div",
      `font-size:12px;color:${SUBTITLE_COLOR};margin-bottom:16px;line-height:1.5;`,
      "Enter a remote file URL. Format, plot type, and required index files are auto-detected from the file extension.",
    ),
  );

  // ── Helpers ────────────────────────────────────────────────────────
  const labelStyle = `font-size:11px;font-weight:600;color:${SUBTITLE_COLOR};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;`;
  const inputCss = [
    "width:100%",
    "box-sizing:border-box",
    "font-size:13px",
    "padding:8px 10px",
    `border:1.5px solid ${BORDER_COLOR}`,
    "border-radius:6px",
    `background:${INPUT_BG}`,
    `font-family:${FONT}`,
    "outline:none",
    `transition:border-color ${TRANSITION}`,
  ].join(";");

  /** Render a small status indicator (dot + text). */
  function statusIndicator(
    state: CheckState,
    extraMsg?: string,
  ): HTMLDivElement {
    const wrap = el(
      "div",
      state === "idle"
        ? ""
        : "display:flex;align-items:center;gap:5px;margin-top:3px;",
    );
    if (state === "idle") return wrap;

    const dot = el(
      "span",
      `display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0;${
        state === "checking"
          ? "background:#f39c12;animation:pulse 1s infinite alternate;"
          : state === "ok"
            ? "background:#00b894;"
            : state === "ok-proxied"
              ? "background:#0984e3;"
              : "background:#e74c3c;"
      }`,
    );
    wrap.appendChild(dot);

    const label =
      state === "checking"
        ? "Checking…"
        : state === "ok"
          ? "Accessible ✓"
          : state === "ok-proxied"
            ? "Not directly accessible — served via CORS proxy ✓"
            : `Not accessible${extraMsg ? " — " + extraMsg : ""}`;
    wrap.appendChild(
      el(
        "span",
        `font-size:11px;color:${
          state === "ok"
            ? "#00b894"
            : state === "ok-proxied"
              ? "#0984e3"
              : state === "fail"
                ? "#e74c3c"
                : SUBTITLE_COLOR
        };`,
        label,
      ),
    );
    return wrap;
  }

  // Inject pulse animation (once)
  if (!document.getElementById("rbrowser-pulse-anim")) {
    const style = document.createElement("style");
    style.id = "rbrowser-pulse-anim";
    style.textContent = "@keyframes pulse{from{opacity:1}to{opacity:0.35}}";
    document.head.appendChild(style);
  }

  // ── URL field ──────────────────────────────────────────────────────
  const urlWrap = el("div", "margin-bottom:12px;");

  urlWrap.appendChild(el("div", labelStyle, "Remote File URL"));

  const urlInput = el("input", inputCss) as HTMLInputElement;
  urlInput.type = "text";
  urlInput.placeholder = "https://example.com/sample.bam";
  urlInput.value = entry.url;
  urlWrap.appendChild(urlInput);

  // Extension hint (no min-height — hidden when empty)
  const extHint = el("div", "margin-top:3px;");
  urlWrap.appendChild(extHint);

  // URL accessibility status (no min-height — hidden when empty)
  const urlStatus = el("div", "");
  urlWrap.appendChild(urlStatus);

  card.appendChild(urlWrap);

  function renderExtHint(): void {
    extHint.innerHTML = "";
    const u = entry.url.trim();
    if (!u) return;
    if (!extValid) {
      const hint = el("div", "display:flex;align-items:center;gap:4px;");
      hint.appendChild(
        el("span", "font-size:11px;color:#e74c3c;font-weight:600;", "⚠"),
      );
      hint.appendChild(
        el(
          "span",
          "font-size:11px;color:#e74c3c;",
          "Unsupported file extension. Supported: " +
            defaultConfig.supportFiles.join(", "),
        ),
      );
      extHint.appendChild(hint);
    }
  }

  function renderUrlStatus(): void {
    urlStatus.innerHTML = "";
    urlStatus.appendChild(statusIndicator(urlCheck));
  }

  async function runUrlCheck(): Promise<void> {
    const u = entry.url.trim();
    if (!u || !u.startsWith("http")) {
      urlCheck = "idle";
      renderUrlStatus();
      return;
    }
    urlCheck = "checking";
    renderUrlStatus();
    updateAddBtn();
    const { ok, proxied } = await checkUrlAccessible(u);
    // Guard: user may have changed the URL while we were checking
    if (entry.url.trim() !== u) return;
    urlCheck = ok ? (proxied ? "ok-proxied" : "ok") : "fail";
    renderUrlStatus();
    updateAddBtn();
  }

  urlInput.addEventListener("input", () => {
    entry.url = urlInput.value;
    const filename = urlInput.value.trim().split("?")[0].split("/").pop() ?? "";
    if (filename) entry.info = detectTrackInfo(filename);
    extValid = urlInput.value.trim()
      ? hasValidExtension(urlInput.value.trim())
      : true;
    renderExtHint();
    updateIndexFields();
    updateBadge();
    updateAddBtn();

    // Debounced accessibility check
    if (debounceTimer) clearTimeout(debounceTimer);
    urlCheck = "idle";
    renderUrlStatus();
    if (urlInput.value.trim() && urlInput.value.trim().startsWith("http")) {
      debounceTimer = setTimeout(() => runUrlCheck(), 600);
    }
  });
  urlInput.addEventListener("focus", () => {
    urlInput.style.borderColor = PRIMARY_COLOR;
  });
  urlInput.addEventListener("blur", () => {
    urlInput.style.borderColor = BORDER_COLOR;
  });

  // ── Format badge ───────────────────────────────────────────────────
  const badgeWrap = el("div", "");
  card.appendChild(badgeWrap);

  function updateBadge(): void {
    badgeWrap.innerHTML = "";
    const u = entry.url.trim();
    if (!u) {
      badgeWrap.style.cssText = "";
      return;
    }
    badgeWrap.style.cssText =
      "display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap;";

    const badgeColor = entry.info.unsupported
      ? "#d63031"
      : (FORMAT_COLORS[entry.info.format] ?? SUBTITLE_COLOR);
    const badgeLabel = entry.info.unsupported
      ? `${entry.info.format} ✕`
      : entry.info.format;
    const badge = el(
      "span",
      [
        `background:${badgeColor}`,
        "color:#fff",
        "font-size:10px",
        "font-weight:700",
        "text-transform:uppercase",
        "padding:2px 8px",
        "border-radius:4px",
        "letter-spacing:0.03em",
      ].join(";"),
      badgeLabel,
    );
    badgeWrap.appendChild(badge);
    badgeWrap.appendChild(
      el(
        "span",
        `font-size:11px;color:${SUBTITLE_COLOR};`,
        `plot: ${entry.info.plot}`,
      ),
    );
    if (entry.info.needsIndex.length > 0) {
      badgeWrap.appendChild(
        el(
          "span",
          "font-size:11px;color:#f39c12;font-weight:500;",
          `requires index: ${entry.info.needsIndex.join(", ")}`,
        ),
      );
    }
  }

  // ── Index fields (dynamically shown) ───────────────────────────────
  const indexContainer = el("div", "");
  card.appendChild(indexContainer);

  function makeIndexField(
    labelText: string,
    value: string,
    placeholder: string,
    onValue: (v: string) => void,
    onCheck: (state: CheckState) => void,
    timerRef: { timer: ReturnType<typeof setTimeout> | null },
    autoFilled = false,
  ): HTMLDivElement {
    const wrap = el("div", "margin-bottom:10px;");

    // Compact "auto-detected" indicator (shown when the auto-guessed index
    // URL has been probed successfully — keeps the form short).
    const compactRow = el(
      "div",
      "display:none;align-items:center;gap:8px;font-size:12px;margin-top:2px;flex-wrap:wrap;",
    );
    wrap.appendChild(compactRow);

    // Full input mode (label + text input + status indicator)
    const labelDiv = el("div", labelStyle, labelText);
    const inp = el("input", inputCss) as HTMLInputElement;
    inp.type = "text";
    inp.placeholder = placeholder;
    inp.value = value;
    const sts = el("div", "");
    wrap.appendChild(labelDiv);
    wrap.appendChild(inp);
    wrap.appendChild(sts);

    let currentState: CheckState = "idle";

    function showFullMode(): void {
      compactRow.style.display = "none";
      labelDiv.style.display = "";
      inp.style.display = "";
      sts.style.display = "";
    }

    function showCompactMode(basename: string): void {
      compactRow.innerHTML = "";
      compactRow.style.display = "flex";
      compactRow.appendChild(
        el("span", "color:#00b894;font-weight:700;", "\u2713"),
      );
      compactRow.appendChild(
        el(
          "span",
          `color:${SUBTITLE_COLOR};`,
          `Auto-detected index (${labelText.replace(/^.*\((.*)\).*$/, "$1") || "index"}):`,
        ),
      );
      compactRow.appendChild(
        el(
          "span",
          `color:${TEXT_COLOR};font-family:monospace;max-width:260px;overflow:hidden;text-overflow:ellipsis;`,
          basename,
        ),
      );
      const editLink = el(
        "a",
        `color:${PRIMARY_COLOR};cursor:pointer;text-decoration:underline;font-size:11px;`,
        "Edit",
      );
      editLink.addEventListener("click", () => showFullMode());
      compactRow.appendChild(editLink);
      labelDiv.style.display = "none";
      inp.style.display = "none";
      sts.style.display = "none";
    }

    function showCompactChecking(): void {
      compactRow.innerHTML = "";
      compactRow.style.display = "flex";
      compactRow.appendChild(
        el(
          "span",
          `display:inline-block;width:8px;height:8px;border-radius:50%;background:#f39c12;animation:pulse 1s infinite alternate;`,
        ),
      );
      compactRow.appendChild(
        el(
          "span",
          `color:${SUBTITLE_COLOR};`,
          `Probing auto-detected ${labelText}…`,
        ),
      );
      labelDiv.style.display = "none";
      inp.style.display = "none";
      sts.style.display = "none";
    }

    function renderSts(): void {
      sts.innerHTML = "";
      sts.appendChild(statusIndicator(currentState));
    }

    inp.addEventListener("input", () => {
      onValue(inp.value);
      if (timerRef.timer) clearTimeout(timerRef.timer);
      currentState = "idle";
      onCheck("idle");
      renderSts();
      updateAddBtn();

      const v = inp.value.trim();
      if (v && v.startsWith("http")) {
        timerRef.timer = setTimeout(async () => {
          currentState = "checking";
          onCheck("checking");
          renderSts();
          updateAddBtn();
          const { ok, proxied } = await checkUrlAccessible(v);
          if (inp.value.trim() !== v) return;
          currentState = ok ? (proxied ? "ok-proxied" : "ok") : "fail";
          onCheck(currentState);
          renderSts();
          updateAddBtn();
        }, 600);
      }
    });
    inp.addEventListener("focus", () => {
      inp.style.borderColor = PRIMARY_COLOR;
    });
    inp.addEventListener("blur", () => {
      inp.style.borderColor = BORDER_COLOR;
    });

    // When the value was auto-guessed from the main URL, silently probe it.
    // Show a compact "✓ Auto-detected" row on success, or expand to the full
    // input with a "not accessible" warning on failure.
    if (autoFilled && value.trim().startsWith("http")) {
      currentState = "checking";
      onCheck("checking");
      showCompactChecking();
      updateAddBtn();
      setTimeout(async () => {
        const { ok, proxied } = await checkUrlAccessible(value);
        if (inp.value.trim() !== value) {
          // User started typing while we were probing → bail to full mode.
          showFullMode();
          return;
        }
        currentState = ok ? (proxied ? "ok-proxied" : "ok") : "fail";
        onCheck(currentState);
        if (ok) {
          const basename = value.split("?")[0].split("/").pop() || value;
          showCompactMode(basename);
        } else {
          showFullMode();
          renderSts();
        }
        updateAddBtn();
      }, 50);
    }

    return wrap;
  }

  const idxTimer1 = { timer: indexDebounceTimer };
  const idxTimer2 = { timer: index2DebounceTimer };

  function updateIndexFields(): void {
    indexContainer.innerHTML = "";
    indexCheck = "idle";
    index2Check = "idle";

    if (entry.info.needsIndex.length >= 1) {
      // Auto-guess index URL from main URL
      let wasAutoFilled1 = false;
      if (!entry.indexUrl && entry.url.trim()) {
        const base = entry.url.trim().split("?")[0];
        entry.indexUrl = base + entry.info.needsIndex[0];
        wasAutoFilled1 = true;
      }
      indexContainer.appendChild(
        makeIndexField(
          `Index URL (${entry.info.needsIndex[0]})`,
          entry.indexUrl,
          `https://example.com/data${entry.info.needsIndex[0]}`,
          (v) => {
            entry.indexUrl = v;
          },
          (s) => {
            indexCheck = s;
          },
          idxTimer1,
          wasAutoFilled1,
        ),
      );
    } else {
      entry.indexUrl = "";
    }

    if (entry.info.needsIndex.length >= 2) {
      let wasAutoFilled2 = false;
      if (!entry.index2Url && entry.url.trim()) {
        const base = entry.url.trim().split("?")[0];
        entry.index2Url = base + entry.info.needsIndex[1];
        wasAutoFilled2 = true;
      }
      indexContainer.appendChild(
        makeIndexField(
          `Index2 URL (${entry.info.needsIndex[1]})`,
          entry.index2Url,
          `https://example.com/data${entry.info.needsIndex[1]}`,
          (v) => {
            entry.index2Url = v;
          },
          (s) => {
            index2Check = s;
          },
          idxTimer2,
          wasAutoFilled2,
        ),
      );
    } else {
      entry.index2Url = "";
    }
  }

  // ── Name field ─────────────────────────────────────────────────────
  const nameWrap = el("div", "margin-bottom:16px;");
  nameWrap.appendChild(el("div", labelStyle, "Channel name (optional)"));
  const nameInput = el("input", inputCss) as HTMLInputElement;
  nameInput.type = "text";
  nameInput.placeholder = "My channel";
  nameInput.value = entry.name;
  nameInput.addEventListener("input", () => {
    entry.name = nameInput.value;
  });
  nameInput.addEventListener("focus", () => {
    nameInput.style.borderColor = PRIMARY_COLOR;
  });
  nameInput.addEventListener("blur", () => {
    nameInput.style.borderColor = BORDER_COLOR;
  });
  nameWrap.appendChild(nameInput);
  card.appendChild(nameWrap);

  // ── Supported formats note ─────────────────────────────────────────
  card.appendChild(
    el(
      "div",
      `font-size:11px;color:${SUBTITLE_COLOR};margin-bottom:14px;line-height:1.5;`,
      `Supported: ${defaultConfig.supportFiles.join(" ")} (auto-detected, case-insensitive; .gz / .bgz allowed)`,
    ),
  );

  updateBadge();
  updateIndexFields();
  renderExtHint();
  renderUrlStatus();

  if (entry.url.trim()) {
    runUrlCheck();
  }

  // ── Buttons ────────────────────────────────────────────────────────
  const btnRow = el(
    "div",
    "display:flex;justify-content:flex-end;gap:10px;margin-top:4px;",
  );

  const cancelBtn = el(
    "button",
    [
      "background:transparent",
      `color:${SUBTITLE_COLOR}`,
      `border:1px solid ${BORDER_COLOR}`,
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:500",
      "cursor:pointer",
      `font-family:${FONT}`,
      `transition:background ${TRANSITION}`,
      "line-height:1.4",
    ].join(";"),
    "Cancel",
  );
  cancelBtn.addEventListener("mouseenter", () => {
    cancelBtn.style.background = "rgba(0,0,0,0.04)";
  });
  cancelBtn.addEventListener("mouseleave", () => {
    cancelBtn.style.background = "transparent";
  });

  const addBtn = el(
    "button",
    [
      `background:${PRIMARY_COLOR}`,
      "color:#fff",
      "border:none",
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:600",
      "cursor:pointer",
      `font-family:${FONT}`,
      `transition:background ${TRANSITION}, opacity ${TRANSITION}`,
      "line-height:1.4",
    ].join(";"),
    "Add Channel",
  );
  addBtn.addEventListener("mouseenter", () => {
    if (!addBtn.disabled) addBtn.style.filter = "brightness(1.08)";
  });
  addBtn.addEventListener("mouseleave", () => {
    addBtn.style.filter = "";
  });

  function updateAddBtn(): void {
    const u = entry.url.trim();
    if (!u) {
      addBtn.disabled = true;
      addBtn.style.opacity = "0.45";
      addBtn.style.cursor = "not-allowed";
      addBtn.title = "Enter a URL";
      return;
    }
    if (!extValid) {
      addBtn.disabled = true;
      addBtn.style.opacity = "0.45";
      addBtn.style.cursor = "not-allowed";
      addBtn.title = "Unsupported file extension";
      return;
    }
    if (urlCheck === "checking") {
      addBtn.disabled = true;
      addBtn.style.opacity = "0.65";
      addBtn.style.cursor = "wait";
      addBtn.title = "Checking URL…";
      return;
    }
    // A failed URL check does not block submission — only an in-flight one does.
    if (indexCheck === "checking" || index2Check === "checking") {
      addBtn.disabled = true;
      addBtn.style.opacity = "0.65";
      addBtn.style.cursor = "wait";
      addBtn.title = "Checking index URL…";
      return;
    }

    addBtn.disabled = false;
    addBtn.style.opacity = "1";
    addBtn.style.cursor = "pointer";
    addBtn.title = "";

    // Warn visually if URL check failed but still allow submission
    if (urlCheck === "fail") {
      addBtn.title =
        "URL may not be accessible (CORS or network issue). Click to add anyway.";
    }
  }
  updateAddBtn();

  const EXAMPLE_COLOR = "#00b894";
  const exampleBtn = el(
    "button",
    [
      `background:${EXAMPLE_COLOR}`,
      "color:#fff",
      "border:none",
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:600",
      "cursor:pointer",
      `font-family:${FONT}`,
      `transition:background ${TRANSITION}, filter ${TRANSITION}`,
      "line-height:1.4",
    ].join(";"),
    "Example",
  );
  exampleBtn.addEventListener("mouseenter", () => {
    exampleBtn.style.filter = "brightness(1.08)";
  });
  exampleBtn.addEventListener("mouseleave", () => {
    exampleBtn.style.filter = "";
  });
  exampleBtn.addEventListener("click", () => {
    const exUrl =
      "https://data.rbrowser.org/datahub/rna_reference/Homo_sapiens/bed/repeats.bed.gz";
    const exIdx =
      "https://data.rbrowser.org/datahub/rna_reference/Homo_sapiens/bed/repeats.bed.gz.tbi";
    entry.url = exUrl;
    entry.indexUrl = exIdx;
    entry.index2Url = "";
    urlInput.value = exUrl;
    const filename = exUrl.split("?")[0].split("/").pop() ?? "";
    if (filename) entry.info = detectTrackInfo(filename);
    extValid = hasValidExtension(exUrl);
    renderExtHint();
    updateIndexFields();
    updateBadge();
    updateAddBtn();
    if (debounceTimer) clearTimeout(debounceTimer);
    urlCheck = "idle";
    renderUrlStatus();
    debounceTimer = setTimeout(() => runUrlCheck(), 300);
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(exampleBtn);
  btnRow.appendChild(addBtn);
  card.appendChild(btnRow);

  // ── Actions ────────────────────────────────────────────────────────
  function close(): void {
    if (closing) return;
    closing = true;
    document.removeEventListener("keydown", onKey);
    animateOut(backdrop, card);
  }

  cancelBtn.addEventListener("click", () => close());

  addBtn.addEventListener("click", () => {
    if (closing || addBtn.disabled) return;
    const url = entry.url.trim();
    if (!url) return;
    const filename = url.split("?")[0].split("/").pop() ?? url;
    const info = detectTrackInfo(filename);
    const defaults = buildDefaultChannelConfig(info);
    const displayName = entry.name.trim() || baseName(filename);
    const baseData = defaults.data ?? {};
    const channelConfig: IChannel = {
      ...defaults,
      name: displayName,
      data: {
        ...baseData,
        method: "remote" as const,
        format: info.format,
        url,
        ...(entry.indexUrl.trim() ? { index: entry.indexUrl.trim() } : {}),
        ...(entry.index2Url.trim() ? { index2: entry.index2Url.trim() } : {}),
      },
    } as IChannel;
    onAdd(channelConfig);
    close();
  });

  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close();
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);

  setTimeout(() => urlInput.focus(), 100);
}

// ══════════════════════════════════════════════════════════════════════
//  Unsupported Format Dialog
// ══════════════════════════════════════════════════════════════════════

/**
 * Show an error dialog when a channel has an unsupported data format.
 * Lists the detected format and the supported formats.
 */
export function showUnsupportedFormatDialog(
  format: string,
  filename?: string,
): void {
  let closing = false;

  const backdrop = el(
    "div",
    [
      "position:fixed",
      "inset:0",
      "z-index:200000",
      `background:${BACKDROP_BG}`,
      `backdrop-filter:${BACKDROP_BLUR}`,
      `-webkit-backdrop-filter:${BACKDROP_BLUR}`,
      "display:flex",
      "align-items:center",
      "justify-content:center",
      `font-family:${FONT}`,
    ].join(";"),
  );

  const card = el(
    "div",
    [
      "min-width:380px",
      "max-width:500px",
      "width:84%",
      `background:${DIALOG_BG}`,
      `border-radius:${DIALOG_RADIUS}`,
      `box-shadow:${DIALOG_SHADOW}`,
      "padding:24px 28px 20px",
      "box-sizing:border-box",
      "outline:none",
    ].join(";"),
  );

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
  animateIn(backdrop, card);

  card.appendChild(
    el(
      "div",
      `font-size:17px;font-weight:700;color:#d63031;margin-bottom:14px;`,
      "Unsupported Format",
    ),
  );

  const msg = filename
    ? `The file "${filename}" has an unsupported format "${format}".`
    : `The data format "${format}" is not supported.`;
  card.appendChild(
    el("div", `font-size:13px;color:${TEXT_COLOR};margin-bottom:8px;`, msg),
  );

  // Supported formats derived from defaultConfig.supportFiles (single source).
  const supported = defaultConfig.supportFiles.join(", ");
  card.appendChild(
    el(
      "div",
      `font-size:12px;color:${SUBTITLE_COLOR};margin-bottom:18px;line-height:1.5;`,
      `Supported formats: ${supported}`,
    ),
  );

  const close = () => {
    if (closing) return;
    closing = true;
    animateOut(backdrop, card);
  };

  const okBtn = el(
    "button",
    [
      "border:none",
      `background:${PRIMARY_COLOR}`,
      "color:#fff",
      "font-size:14px",
      "font-weight:600",
      "padding:8px 28px",
      "border-radius:8px",
      "cursor:pointer",
      "outline:none",
      "float:right",
    ].join(";"),
    "OK",
  );
  okBtn.addEventListener("click", close);
  card.appendChild(okBtn);

  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) close();
  });
  backdrop.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" || ev.key === "Enter") close();
  });
  backdrop.tabIndex = -1;
  requestAnimationFrame(() => backdrop.focus());
}

// ══════════════════════════════════════════════════════════════════════
//  Channel Confirmation Dialog
//  Shown every time addChannel() is called so the user can review
//  the channel config before it is actually added.
// ══════════════════════════════════════════════════════════════════════

/**
 * Show a confirmation dialog for a channel about to be added.
 *
 * Displays the channel name, format, plot type, and data URL in a
 * small Apple-style dialog. The user clicks "Add" to confirm or
 * "Cancel" to discard.
 */
export function showChannelConfirmDialog(
  config: IChannel,
  onConfirm: () => void,
): void {
  let closing = false;

  const format = config.data?.format ?? "unknown";
  const plot = config.plot ?? "—";
  const url = config.data?.url ?? "";
  const name =
    config.name ?? baseName(url.split("?")[0].split("/").pop() ?? "Channel");

  // ── Shell ──────────────────────────────────────────────────────────
  const backdrop = el(
    "div",
    [
      "position:fixed",
      "inset:0",
      "z-index:200000",
      `background:${BACKDROP_BG}`,
      `backdrop-filter:${BACKDROP_BLUR}`,
      `-webkit-backdrop-filter:${BACKDROP_BLUR}`,
      "display:flex",
      "align-items:center",
      "justify-content:center",
      `font-family:${FONT}`,
    ].join(";"),
  );

  const card = el(
    "div",
    [
      "min-width:380px",
      "max-width:500px",
      "width:84%",
      `background:${DIALOG_BG}`,
      `border-radius:${DIALOG_RADIUS}`,
      `box-shadow:${DIALOG_SHADOW}`,
      "padding:24px 28px 20px",
      "box-sizing:border-box",
      "outline:none",
    ].join(";"),
  );

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
  animateIn(backdrop, card);

  // ── Title ──────────────────────────────────────────────────────────
  card.appendChild(
    el(
      "div",
      `font-size:17px;font-weight:700;color:${TEXT_COLOR};margin-bottom:14px;`,
      "Import Channel",
    ),
  );

  // ── Info rows ──────────────────────────────────────────────────────
  const rowStyle = `display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;color:${TEXT_COLOR};`;
  const labelStyle = `font-weight:600;color:${SUBTITLE_COLOR};min-width:56px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;`;
  const valueStyle = `flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;

  const rowName = el("div", rowStyle);
  rowName.appendChild(el("span", labelStyle, "Name"));
  rowName.appendChild(el("span", valueStyle + "font-weight:600;", name));
  card.appendChild(rowName);

  const rowFormat = el("div", rowStyle);
  rowFormat.appendChild(el("span", labelStyle, "Format"));
  const badgeColor = FORMAT_COLORS[format] ?? SUBTITLE_COLOR;
  const badge = el(
    "span",
    [
      `background:${badgeColor}`,
      "color:#fff",
      "font-size:10px",
      "font-weight:700",
      "text-transform:uppercase",
      "padding:1px 6px",
      "border-radius:3px",
      "letter-spacing:0.03em",
    ].join(";"),
    format,
  );
  rowFormat.appendChild(badge);
  rowFormat.appendChild(
    el(
      "span",
      `font-size:11px;color:${SUBTITLE_COLOR};margin-left:4px;`,
      `plot: ${plot}`,
    ),
  );
  card.appendChild(rowFormat);

  if (url) {
    const isBlob = url.startsWith("blob:");
    const displayUrl = isBlob ? "(local file)" : url;
    const rowUrl = el("div", rowStyle);
    rowUrl.appendChild(el("span", labelStyle, "URL"));
    const urlSpan = el(
      "span",
      valueStyle +
        `font-size:11px;color:${isBlob ? SUBTITLE_COLOR : TEXT_COLOR};`,
      displayUrl,
    );
    urlSpan.title = url;
    rowUrl.appendChild(urlSpan);
    card.appendChild(rowUrl);
  }

  const indexUrl = config.data?.index;
  if (indexUrl) {
    const isBlob = typeof indexUrl === "string" && indexUrl.startsWith("blob:");
    const rowIdx = el("div", rowStyle);
    rowIdx.appendChild(el("span", labelStyle, "Index"));
    rowIdx.appendChild(
      el(
        "span",
        valueStyle +
          `font-size:11px;color:${isBlob ? SUBTITLE_COLOR : TEXT_COLOR};`,
        isBlob ? "(local file)" : String(indexUrl),
      ),
    );
    card.appendChild(rowIdx);
  }

  // ── Buttons ────────────────────────────────────────────────────────
  const btnRow = el(
    "div",
    "display:flex;justify-content:flex-end;gap:10px;margin-top:18px;",
  );

  const cancelBtn = el(
    "button",
    [
      "background:transparent",
      `color:${SUBTITLE_COLOR}`,
      `border:1px solid ${BORDER_COLOR}`,
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:500",
      "cursor:pointer",
      `font-family:${FONT}`,
      `transition:background ${TRANSITION}`,
      "line-height:1.4",
    ].join(";"),
    "Cancel",
  );
  cancelBtn.addEventListener("mouseenter", () => {
    cancelBtn.style.background = "rgba(0,0,0,0.04)";
  });
  cancelBtn.addEventListener("mouseleave", () => {
    cancelBtn.style.background = "transparent";
  });

  const addBtn = el(
    "button",
    [
      `background:${PRIMARY_COLOR}`,
      "color:#fff",
      "border:none",
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:600",
      "cursor:pointer",
      `font-family:${FONT}`,
      `transition:background ${TRANSITION}`,
      "line-height:1.4",
    ].join(";"),
    "Add Channel",
  );
  addBtn.addEventListener("mouseenter", () => {
    addBtn.style.filter = "brightness(1.08)";
  });
  addBtn.addEventListener("mouseleave", () => {
    addBtn.style.filter = "";
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(addBtn);
  card.appendChild(btnRow);

  // ── Actions ────────────────────────────────────────────────────────
  function close(): void {
    if (closing) return;
    closing = true;
    document.removeEventListener("keydown", onKey);
    animateOut(backdrop, card);
  }

  cancelBtn.addEventListener("click", () => close());

  addBtn.addEventListener("click", () => {
    if (closing) return;
    onConfirm();
    close();
  });

  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close();
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
}

// ══════════════════════════════════════════════════════════════════════
//  Batch Channel Confirmation Dialog
//  Shown when addMany() is called — lists all channels in a table
//  similar to the drag-drop import dialog.
// ══════════════════════════════════════════════════════════════════════

/**
 * Show a batch confirmation dialog for multiple channels about to be added.
 *
 * Displays a table with Name, Format, Plot, URL columns. The user clicks
 * "Add N Channels" to confirm or "Cancel" to discard.
 */
export function showBatchConfirmDialog(
  configs: IChannel[],
  onConfirm: (confirmed: IChannel[]) => void,
): void {
  if (!configs.length) return;

  // Single channel → reuse the single-channel dialog
  if (configs.length === 1) {
    showChannelConfirmDialog(configs[0], () => onConfirm(configs));
    return;
  }

  let closing = false;

  // ── Shell ──────────────────────────────────────────────────────────
  const backdrop = el(
    "div",
    [
      "position:fixed",
      "inset:0",
      "z-index:200000",
      `background:${BACKDROP_BG}`,
      `backdrop-filter:${BACKDROP_BLUR}`,
      `-webkit-backdrop-filter:${BACKDROP_BLUR}`,
      "display:flex",
      "align-items:center",
      "justify-content:center",
      `font-family:${FONT}`,
    ].join(";"),
  );

  const card = el(
    "div",
    [
      "min-width:460px",
      "max-width:640px",
      "width:90%",
      `background:${DIALOG_BG}`,
      `border-radius:${DIALOG_RADIUS}`,
      `box-shadow:${DIALOG_SHADOW}`,
      "padding:28px 32px 24px",
      "box-sizing:border-box",
      "outline:none",
      "max-height:80vh",
      "display:flex",
      "flex-direction:column",
    ].join(";"),
  );

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
  animateIn(backdrop, card);

  // ── Title ──────────────────────────────────────────────────────────
  card.appendChild(
    el(
      "div",
      `font-size:17px;font-weight:700;color:${TEXT_COLOR};margin-bottom:4px;`,
      "Import Channels",
    ),
  );
  card.appendChild(
    el(
      "div",
      `font-size:13px;color:${SUBTITLE_COLOR};margin-bottom:14px;line-height:1.5;`,
      `${configs.length} channel${configs.length > 1 ? "s" : ""} will be added. Review before confirming.`,
    ),
  );

  // ── Table ──────────────────────────────────────────────────────────
  const tableWrap = el(
    "div",
    [
      "flex:1",
      "overflow-y:auto",
      "margin-bottom:18px",
      `border:1px solid ${BORDER_COLOR}`,
      "border-radius:8px",
    ].join(";"),
  );
  card.appendChild(tableWrap);

  const table = el(
    "table",
    [
      "width:100%",
      "border-collapse:collapse",
      "font-size:12px",
      `color:${TEXT_COLOR}`,
    ].join(";"),
  );
  tableWrap.appendChild(table);

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.style.cssText = [
    `background:${INPUT_BG}`,
    `border-bottom:1.5px solid ${BORDER_COLOR}`,
    "position:sticky",
    "top:0",
    "z-index:1",
  ].join(";");

  const thStyle = [
    "padding:7px 10px",
    "text-align:left",
    "font-weight:700",
    "font-size:11px",
    `color:${SUBTITLE_COLOR}`,
    "text-transform:uppercase",
    "letter-spacing:0.04em",
    "white-space:nowrap",
  ].join(";");

  for (const label of ["Name", "Format", "Plot", "URL"]) {
    const th = document.createElement("th");
    th.style.cssText = thStyle;
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  const tdStyle = [
    "padding:6px 10px",
    "vertical-align:middle",
    `border-bottom:1px solid ${BORDER_COLOR}`,
    "white-space:nowrap",
  ].join(";");

  for (const cfg of configs) {
    const tr = document.createElement("tr");
    tr.style.cssText = `transition:background ${TRANSITION};`;
    tr.addEventListener("mouseenter", () => {
      tr.style.background = "rgba(0,122,255,0.04)";
    });
    tr.addEventListener("mouseleave", () => {
      tr.style.background = "";
    });

    const tdName = document.createElement("td");
    tdName.style.cssText =
      tdStyle +
      ";max-width:180px;overflow:hidden;text-overflow:ellipsis;font-weight:500;";
    tdName.textContent = cfg.name ?? "—";
    tdName.title = cfg.name ?? "";
    tr.appendChild(tdName);

    const tdFormat = document.createElement("td");
    tdFormat.style.cssText = tdStyle;
    const fmt = cfg.data?.format ?? "unknown";
    const badgeColor = FORMAT_COLORS[fmt] ?? SUBTITLE_COLOR;
    const badge = el(
      "span",
      [
        `background:${badgeColor}`,
        "color:#fff",
        "font-size:10px",
        "font-weight:700",
        "text-transform:uppercase",
        "padding:1px 6px",
        "border-radius:3px",
        "letter-spacing:0.03em",
      ].join(";"),
      fmt,
    );
    tdFormat.appendChild(badge);
    tr.appendChild(tdFormat);

    const tdPlot = document.createElement("td");
    tdPlot.style.cssText = tdStyle + `;color:${SUBTITLE_COLOR};`;
    tdPlot.textContent = cfg.plot ?? "—";
    tr.appendChild(tdPlot);

    const tdUrl = document.createElement("td");
    tdUrl.style.cssText =
      tdStyle +
      `;max-width:200px;overflow:hidden;text-overflow:ellipsis;font-size:11px;color:${SUBTITLE_COLOR};`;
    const rawUrl = cfg.data?.url ?? "";
    const isBlob = rawUrl.startsWith("blob:");
    tdUrl.textContent = isBlob ? "(local file)" : rawUrl;
    tdUrl.title = rawUrl;
    tr.appendChild(tdUrl);

    tbody.appendChild(tr);
  }

  // ── Buttons ────────────────────────────────────────────────────────
  const btnRow = el(
    "div",
    "display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;",
  );

  const cancelBtn = el(
    "button",
    [
      "background:transparent",
      `color:${SUBTITLE_COLOR}`,
      `border:1px solid ${BORDER_COLOR}`,
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:500",
      "cursor:pointer",
      `font-family:${FONT}`,
      `transition:background ${TRANSITION}`,
      "line-height:1.4",
    ].join(";"),
    "Cancel",
  );
  cancelBtn.addEventListener("mouseenter", () => {
    cancelBtn.style.background = "rgba(0,0,0,0.04)";
  });
  cancelBtn.addEventListener("mouseleave", () => {
    cancelBtn.style.background = "transparent";
  });

  const addBtn = el(
    "button",
    [
      `background:${PRIMARY_COLOR}`,
      "color:#fff",
      "border:none",
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:600",
      "cursor:pointer",
      `font-family:${FONT}`,
      `transition:background ${TRANSITION}`,
      "line-height:1.4",
    ].join(";"),
    `Add ${configs.length} Channel${configs.length !== 1 ? "s" : ""}`,
  );
  addBtn.addEventListener("mouseenter", () => {
    addBtn.style.filter = "brightness(1.08)";
  });
  addBtn.addEventListener("mouseleave", () => {
    addBtn.style.filter = "";
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(addBtn);
  card.appendChild(btnRow);

  // ── Actions ────────────────────────────────────────────────────────
  function close(): void {
    if (closing) return;
    closing = true;
    document.removeEventListener("keydown", onKey);
    animateOut(backdrop, card);
  }

  cancelBtn.addEventListener("click", () => close());

  addBtn.addEventListener("click", () => {
    if (closing) return;
    onConfirm(configs);
    close();
  });

  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close();
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
}

// ══════════════════════════════════════════════════════════════════════
//  Duplicate Channel Confirmation Dialog
//  Shown by addChannel / addManyChannels when the incoming configs
//  duplicate channels that are already loaded (same name + same data
//  source). Uses the same visual shell as showBatchConfirmDialog with
//  an amber-tinted warning header and a "Force Load" primary button.
// ══════════════════════════════════════════════════════════════════════

const WARN_COLOR = "#f58518";

/**
 * Show a duplicate-detected confirmation dialog.
 *
 * @param duplicates The channel configs that are already loaded.
 * @param onForce    Called when the user clicks "Force Load".
 * @param onCancel   Optional callback when the user dismisses (Cancel /
 *                   Esc / click-outside).
 */
export function showDuplicateConfirmDialog(
  duplicates: IChannel[],
  onForce: () => void,
  onCancel?: () => void,
): void {
  if (!duplicates.length) {
    // No duplicates — nothing to confirm. Treat as accepting the load.
    onForce();
    return;
  }

  let closing = false;
  let resolved = false;

  // ── Shell ──────────────────────────────────────────────────────────
  const backdrop = el(
    "div",
    [
      "position:fixed",
      "inset:0",
      "z-index:200000",
      `background:${BACKDROP_BG}`,
      `backdrop-filter:${BACKDROP_BLUR}`,
      `-webkit-backdrop-filter:${BACKDROP_BLUR}`,
      "display:flex",
      "align-items:center",
      "justify-content:center",
      `font-family:${FONT}`,
    ].join(";"),
  );

  const card = el(
    "div",
    [
      "min-width:460px",
      "max-width:640px",
      "width:90%",
      `background:${DIALOG_BG}`,
      `border-radius:${DIALOG_RADIUS}`,
      `box-shadow:${DIALOG_SHADOW}`,
      "padding:28px 32px 24px",
      "box-sizing:border-box",
      "outline:none",
      "max-height:80vh",
      "display:flex",
      "flex-direction:column",
    ].join(";"),
  );

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
  animateIn(backdrop, card);

  // ── Title (warning-tinted) ─────────────────────────────────────────
  const titleRow = el(
    "div",
    "display:flex;align-items:center;gap:10px;margin-bottom:4px;",
  );
  // Warning glyph chip — same look-and-feel as the mode badges so the
  // dialog reads as part of the existing design language.
  titleRow.appendChild(
    el(
      "span",
      [
        `background:${WARN_COLOR}`,
        "color:#fff",
        "width:24px",
        "height:24px",
        "border-radius:6px",
        "display:inline-flex",
        "align-items:center",
        "justify-content:center",
        "font-size:14px",
        "font-weight:800",
        "flex-shrink:0",
      ].join(";"),
      "!",
    ),
  );
  titleRow.appendChild(
    el(
      "div",
      `font-size:17px;font-weight:700;color:${TEXT_COLOR};`,
      "Channels already loaded",
    ),
  );
  card.appendChild(titleRow);

  card.appendChild(
    el(
      "div",
      `font-size:13px;color:${SUBTITLE_COLOR};margin-bottom:14px;line-height:1.5;`,
      `${duplicates.length} of the channels you are importing match an existing ` +
        `channel by name and data source. Force load will add another copy; ` +
        `cancel to keep the current view unchanged.`,
    ),
  );

  // ── Table ──────────────────────────────────────────────────────────
  const tableWrap = el(
    "div",
    [
      "flex:1",
      "overflow-y:auto",
      "margin-bottom:18px",
      `border:1px solid ${BORDER_COLOR}`,
      "border-radius:8px",
    ].join(";"),
  );
  card.appendChild(tableWrap);

  const table = el(
    "table",
    [
      "width:100%",
      "border-collapse:collapse",
      "font-size:12px",
      `color:${TEXT_COLOR}`,
    ].join(";"),
  );
  tableWrap.appendChild(table);

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.style.cssText = [
    `background:${INPUT_BG}`,
    `border-bottom:1.5px solid ${BORDER_COLOR}`,
    "position:sticky",
    "top:0",
    "z-index:1",
  ].join(";");

  const thStyle = [
    "padding:7px 10px",
    "text-align:left",
    "font-weight:700",
    "font-size:11px",
    `color:${SUBTITLE_COLOR}`,
    "text-transform:uppercase",
    "letter-spacing:0.04em",
    "white-space:nowrap",
  ].join(";");

  for (const label of ["Name", "Format", "Plot", "URL"]) {
    const th = document.createElement("th");
    th.style.cssText = thStyle;
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  const tdStyle = [
    "padding:6px 10px",
    "vertical-align:middle",
    `border-bottom:1px solid ${BORDER_COLOR}`,
    "white-space:nowrap",
  ].join(";");

  for (const cfg of duplicates) {
    const tr = document.createElement("tr");
    tr.style.cssText = `transition:background ${TRANSITION};`;
    tr.addEventListener("mouseenter", () => {
      tr.style.background = "rgba(245,133,24,0.06)";
    });
    tr.addEventListener("mouseleave", () => {
      tr.style.background = "";
    });

    const tdName = document.createElement("td");
    tdName.style.cssText =
      tdStyle +
      ";max-width:180px;overflow:hidden;text-overflow:ellipsis;font-weight:500;";
    tdName.textContent = cfg.name ?? "—";
    tdName.title = cfg.name ?? "";
    tr.appendChild(tdName);

    const tdFormat = document.createElement("td");
    tdFormat.style.cssText = tdStyle;
    const fmt = cfg.data?.format ?? "unknown";
    const badgeColor = FORMAT_COLORS[fmt] ?? SUBTITLE_COLOR;
    const badge = el(
      "span",
      [
        `background:${badgeColor}`,
        "color:#fff",
        "font-size:10px",
        "font-weight:700",
        "text-transform:uppercase",
        "padding:1px 6px",
        "border-radius:3px",
        "letter-spacing:0.03em",
      ].join(";"),
      fmt,
    );
    tdFormat.appendChild(badge);
    tr.appendChild(tdFormat);

    const tdPlot = document.createElement("td");
    tdPlot.style.cssText = tdStyle + `;color:${SUBTITLE_COLOR};`;
    tdPlot.textContent = cfg.plot ?? "—";
    tr.appendChild(tdPlot);

    const tdUrl = document.createElement("td");
    tdUrl.style.cssText =
      tdStyle +
      `;max-width:200px;overflow:hidden;text-overflow:ellipsis;font-size:11px;color:${SUBTITLE_COLOR};`;
    const rawUrl = cfg.data?.url ?? "";
    const isBlob = rawUrl.startsWith("blob:");
    tdUrl.textContent = isBlob ? "(local file)" : rawUrl;
    tdUrl.title = rawUrl;
    tr.appendChild(tdUrl);

    tbody.appendChild(tr);
  }

  // ── Buttons ────────────────────────────────────────────────────────
  const btnRow = el(
    "div",
    "display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;",
  );

  const cancelBtn = el(
    "button",
    [
      "background:transparent",
      `color:${SUBTITLE_COLOR}`,
      `border:1px solid ${BORDER_COLOR}`,
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:500",
      "cursor:pointer",
      `font-family:${FONT}`,
      `transition:background ${TRANSITION}`,
      "line-height:1.4",
    ].join(";"),
    "Cancel",
  );
  cancelBtn.addEventListener("mouseenter", () => {
    cancelBtn.style.background = "rgba(0,0,0,0.04)";
  });
  cancelBtn.addEventListener("mouseleave", () => {
    cancelBtn.style.background = "transparent";
  });

  // "Force Load" — uses the warning colour to signal the irregularity
  // (rather than the default primary blue) without blocking the action.
  const forceBtn = el(
    "button",
    [
      `background:${WARN_COLOR}`,
      "color:#fff",
      "border:none",
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:600",
      "cursor:pointer",
      `font-family:${FONT}`,
      `transition:filter ${TRANSITION}`,
      "line-height:1.4",
    ].join(";"),
    "Force Load",
  );
  forceBtn.addEventListener("mouseenter", () => {
    forceBtn.style.filter = "brightness(1.08)";
  });
  forceBtn.addEventListener("mouseleave", () => {
    forceBtn.style.filter = "";
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(forceBtn);
  card.appendChild(btnRow);

  // ── Actions ────────────────────────────────────────────────────────
  function close(): void {
    if (closing) return;
    closing = true;
    document.removeEventListener("keydown", onKey);
    animateOut(backdrop, card);
  }

  cancelBtn.addEventListener("click", () => {
    if (resolved) return;
    resolved = true;
    onCancel?.();
    close();
  });

  forceBtn.addEventListener("click", () => {
    if (resolved) return;
    resolved = true;
    onForce();
    close();
  });

  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) {
      if (resolved) return;
      resolved = true;
      onCancel?.();
      close();
    }
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (resolved) return;
      resolved = true;
      onCancel?.();
      close();
    }
  };
  document.addEventListener("keydown", onKey);
}

// ══════════════════════════════════════════════════════════════════════
//  Utility
// ══════════════════════════════════════════════════════════════════════

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ══════════════════════════════════════════════════════════════════════
//  Custom Reference Import
//
//  Lets the user assemble an `IReferenceConfig` from LOCAL files and load it
//  as a "Custom" genome reference. Triggered either by dropping a `.rbi` /
//  `.rba` / `.sqlite` catalogue onto the canvas, or via the "Custom" entry at
//  the bottom of the reference menu.
//
//  Required:  a GFF3 / GTF annotation + its tabix index (.tbi).
//  Optional:  the `.rbi`/`.rba` search catalogue, chrom.sizes, a genome FASTA
//             (.fa.gz + .fai + .gzi) and a transcriptome FASTA (.fa.gz + .fai
//             + .gzi).
// ══════════════════════════════════════════════════════════════════════

/** Match a `.rbi` / `.rba` / `.sqlite` transcript-search catalogue. */
export function isReferenceCatalogueFile(name: string): boolean {
  return /\.(rbi|rba|sqlite)$/i.test(name.split("?")[0]);
}

const reAnnotation = (n: string) => /\.(gff3?|gtf)(\.b?gz)?$/i.test(n);
const reTabix = (n: string) => /\.(tbi|csi)$/i.test(n);
const reChromSizes = (n: string) => /(chrom\.?sizes|\.sizes)$/i.test(n);
const reFasta = (n: string) => /\.(fa|fasta|fna)(\.b?gz)?$/i.test(n);
const reFai = (n: string) => /\.fai$/i.test(n);
const reGzi = (n: string) => /\.gzi$/i.test(n);
const looksTranscriptome = (n: string) =>
  /transcriptome|transcript|\bcdna\b|\bmrna\b|\brna\b/i.test(n);

interface RefFileSlots {
  catalogue: File | null;
  annotation: File | null;
  annotationIndex: File | null;
  chromSizes: File | null;
  genomeFa: File | null;
  genomeFai: File | null;
  genomeGzi: File | null;
  txFa: File | null;
  txFai: File | null;
  txGzi: File | null;
}

function emptyRefSlots(): RefFileSlots {
  return {
    catalogue: null,
    annotation: null,
    annotationIndex: null,
    chromSizes: null,
    genomeFa: null,
    genomeFai: null,
    genomeGzi: null,
    txFa: null,
    txFai: null,
    txGzi: null,
  };
}

/**
 * Best-effort assignment of a dropped file list into reference slots.
 * Index files (`.fai`/`.gzi`/`.tbi`) are matched first (most specific), then
 * FASTA files are split into genome vs transcriptome by filename hint.
 */
function autoFillRefSlots(files: File[]): RefFileSlots {
  const slots = emptyRefSlots();
  const pool = [...files];
  const take = (pred: (n: string) => boolean): File | null => {
    const i = pool.findIndex((f) => pred(f.name.split("?")[0]));
    return i >= 0 ? pool.splice(i, 1)[0] : null;
  };

  slots.catalogue = take(isReferenceCatalogueFile);
  slots.annotationIndex = take(reTabix);
  slots.annotation = take((n) => reAnnotation(n) && !reTabix(n));
  slots.chromSizes = take(reChromSizes);

  // Collect remaining FASTA + index files.
  const fais: File[] = [];
  for (let f = take(reFai); f; f = take(reFai)) fais.push(f);
  const gzis: File[] = [];
  for (let f = take(reGzi); f; f = take(reGzi)) gzis.push(f);
  const fastas: File[] = [];
  for (let f = take(reFasta); f; f = take(reFasta)) fastas.push(f);

  for (const fa of fastas) {
    if (looksTranscriptome(fa.name) && !slots.txFa) slots.txFa = fa;
    else if (!slots.genomeFa) slots.genomeFa = fa;
    else if (!slots.txFa) slots.txFa = fa;
  }

  const baseOf = (n: string) => n.replace(/\.(fai|gzi)$/i, "");
  const assignIndex = (
    list: File[],
    set: (kind: "genome" | "tx", f: File) => void,
  ) => {
    for (const ix of list) {
      const b = baseOf(ix.name);
      if (slots.genomeFa && slots.genomeFa.name === b) set("genome", ix);
      else if (slots.txFa && slots.txFa.name === b) set("tx", ix);
      else if (slots.genomeFa) set("genome", ix);
      else if (slots.txFa) set("tx", ix);
    }
  };
  assignIndex(fais, (kind, f) => {
    if (kind === "genome" && !slots.genomeFai) slots.genomeFai = f;
    else if (kind === "tx" && !slots.txFai) slots.txFai = f;
  });
  assignIndex(gzis, (kind, f) => {
    if (kind === "genome" && !slots.genomeGzi) slots.genomeGzi = f;
    else if (kind === "tx" && !slots.txGzi) slots.txGzi = f;
  });

  return slots;
}

/**
 * Build a `blob:` URL for a local file, appending the original filename as a
 * fragment so the URL-based format detectors (`isGtfUrl`,
 * `isSqliteTranscriptUrl`, `isRbiIndexUrl`, …) still recognise the extension.
 * The fragment is ignored when the blob is fetched, so the resource resolves
 * normally.
 */
function blobUrlFor(f: File): string {
  const url = `${URL.createObjectURL(f)}#${encodeURIComponent(f.name)}`;
  // Register so whole-file consumers (e.g. local `.rbi` SQLite search) can read
  // the File bytes directly instead of fetching the fragmented blob URL.
  registerLocalBlob(url, f);
  return url;
}

/** Derive a default reference name from the catalogue / annotation filename. */
function deriveRefName(slots: RefFileSlots): string {
  const f = slots.catalogue ?? slots.annotation ?? slots.genomeFa;
  if (!f) return "";
  return f.name
    .replace(/\.(rbi|rba|sqlite)$/i, "")
    .replace(/\.(gff3?|gtf)(\.b?gz)?$/i, "")
    .replace(/\.(fa|fasta|fna)(\.b?gz)?$/i, "")
    .replace(/\.annotation.*$/i, "")
    .replace(/[._-]+$/g, "");
}

/**
 * Assemble an `IReferenceConfig` from per-slot URLs (local `blob:` URLs or
 * remote http(s) URLs), or return `null` when a required slot is missing.
 *
 * Required: name + annotation + annotation index + search catalogue
 * (`.rbi`/`.rba`). FASTA pairs are only emitted when all three of their parts
 * (`.fa.gz` + `.fai` + `.gzi`) are present.
 */
function buildCustomReference(
  name: string,
  getUrl: (key: keyof RefFileSlots) => string | null,
  defaultLocusName?: string,
): IReferenceConfig | null {
  const annUrl = getUrl("annotation");
  const annIdx = getUrl("annotationIndex");
  const catalogue = getUrl("catalogue");
  if (!name.trim() || !annUrl || !annIdx || !catalogue) return null;

  const annotation: IAnnotationReference = {
    url: annUrl,
    index: annIdx,
    transcripts: catalogue,
  };

  const transcriptome: ITranscriptomeReference = { annotation };
  const txFa = getUrl("txFa");
  const txFai = getUrl("txFai");
  const txGzi = getUrl("txGzi");
  if (txFa && txFai && txGzi) {
    transcriptome.fasta = {
      url: txFa,
      fai: txFai,
      gzi: txGzi,
    } as IFastaReference;
  }

  const genome: IGenomeReference = {};
  const gFa = getUrl("genomeFa");
  const gFai = getUrl("genomeFai");
  const gGzi = getUrl("genomeGzi");
  if (gFa && gFai && gGzi) {
    genome.fasta = { url: gFa, fai: gFai, gzi: gGzi } as IFastaReference;
  }
  const chrom = getUrl("chromSizes");
  if (chrom) genome.chromSizes = { url: chrom };

  const config: IReferenceConfig = {
    assembly: { name: name.trim() },
    transcriptome,
    genome,
    custom: true,
  };

  // Optional default locus — a gene / transcript name to jump to when the
  // reference becomes active. Resolved against the `.rbi`/`.rba` catalogue
  // (RNA-name navigation) by `ReferenceManager.resolveDefaultLocus`.
  const locusName = defaultLocusName?.trim();
  if (locusName) {
    config.defaultLocus = { rna: { trans_name: locusName }, mode: "rna" };
  }

  return config;
}

/**
 * Small yes/no dialog asking whether dropped `.rbi`/`.rba` files should be
 * loaded as a Custom Reference. On confirm, opens the full import dialog
 * pre-filled with the dropped files.
 */
export function confirmCustomReferenceDialog(
  files: File[],
  onAdd: (config: IReferenceConfig) => void,
): void {
  let closing = false;

  const backdrop = el(
    "div",
    [
      "position:fixed",
      "inset:0",
      "z-index:200000",
      `background:${BACKDROP_BG}`,
      `backdrop-filter:${BACKDROP_BLUR}`,
      `-webkit-backdrop-filter:${BACKDROP_BLUR}`,
      "display:flex",
      "align-items:center",
      "justify-content:center",
      `font-family:${FONT}`,
    ].join(";"),
  );
  const card = el(
    "div",
    [
      "min-width:380px",
      "max-width:500px",
      "width:84%",
      `background:${DIALOG_BG}`,
      `border-radius:${DIALOG_RADIUS}`,
      `box-shadow:${DIALOG_SHADOW}`,
      "padding:24px 28px 20px",
      "box-sizing:border-box",
      "outline:none",
    ].join(";"),
  );
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
  animateIn(backdrop, card);

  card.appendChild(
    el(
      "div",
      `font-size:17px;font-weight:700;color:${TEXT_COLOR};margin-bottom:8px;`,
      "Load as Custom Reference?",
    ),
  );
  const cat = files.find((f) => isReferenceCatalogueFile(f.name));
  card.appendChild(
    el(
      "div",
      `font-size:13px;color:${SUBTITLE_COLOR};margin-bottom:18px;line-height:1.5;`,
      `Detected a reference catalogue${cat ? ` "${cat.name}"` : ""}. Load it as a custom genome reference? You'll be asked to also provide a matching GFF3 / GTF annotation.`,
    ),
  );

  const btnRow = el(
    "div",
    "display:flex;justify-content:flex-end;gap:10px;margin-top:4px;",
  );
  const cancelBtn = el(
    "button",
    [
      "background:transparent",
      `color:${SUBTITLE_COLOR}`,
      `border:1px solid ${BORDER_COLOR}`,
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:500",
      "cursor:pointer",
      `font-family:${FONT}`,
      "line-height:1.4",
    ].join(";"),
    "Cancel",
  );
  const okBtn = el(
    "button",
    [
      `background:${PRIMARY_COLOR}`,
      "color:#fff",
      "border:none",
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:600",
      "cursor:pointer",
      `font-family:${FONT}`,
      "line-height:1.4",
    ].join(";"),
    "Load as Reference",
  );
  okBtn.addEventListener("mouseenter", () => {
    okBtn.style.filter = "brightness(1.08)";
  });
  okBtn.addEventListener("mouseleave", () => {
    okBtn.style.filter = "";
  });
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(okBtn);
  card.appendChild(btnRow);

  const close = () => {
    if (closing) return;
    closing = true;
    document.removeEventListener("keydown", onKey);
    animateOut(backdrop, card);
  };
  cancelBtn.addEventListener("click", () => close());
  okBtn.addEventListener("click", () => {
    if (closing) return;
    close();
    showCustomReferenceDialog(files, onAdd);
  });
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
}

type RefSlotKey = keyof RefFileSlots;

/** Per-slot filename / URL extension validator (operates on the path only). */
const SLOT_EXT: Record<RefSlotKey, (n: string) => boolean> = {
  catalogue: isReferenceCatalogueFile,
  annotation: (n) => reAnnotation(n) && !reTabix(n),
  annotationIndex: reTabix,
  chromSizes: reChromSizes,
  genomeFa: reFasta,
  genomeFai: reFai,
  genomeGzi: reGzi,
  txFa: reFasta,
  txFai: reFai,
  txGzi: reGzi,
};

/** Required slots — a custom reference cannot be built without these. */
const REQUIRED_SLOTS: RefSlotKey[] = [
  "annotation",
  "annotationIndex",
  "catalogue",
];

/** Strip query string + fragment to expose the URL/file path for ext checks. */
function stripUrlPath(u: string): string {
  return u.split("?")[0].split("#")[0];
}

/**
 * Example remote reference (Schizosaccharomyces pombe / ASM294v2), used by the
 * "Example" button to pre-fill the remote URL fields. Kept in sync with
 * `config/references/Schizosaccharomyces_pombe/ASM294v2.ts`.
 */
const EXAMPLE_REF_BASE =
  "https://data.rbrowser.org/datahub/reference/Schizosaccharomyces_pombe/ASM294v2";
const EXAMPLE_REF: {
  name: string;
  defaultLocus: string;
  urls: Record<RefSlotKey, string>;
} = {
  name: "ASM294v2",
  defaultLocus: "MSF1",
  urls: {
    annotation: `${EXAMPLE_REF_BASE}/ASM294v2.annotation.sorted.gff3.gz`,
    annotationIndex: `${EXAMPLE_REF_BASE}/ASM294v2.annotation.sorted.gff3.gz.tbi`,
    catalogue: `${EXAMPLE_REF_BASE}/annotation.rbi`,
    chromSizes: `${EXAMPLE_REF_BASE}/ASM294v2.chrom.sizes`,
    genomeFa: `${EXAMPLE_REF_BASE}/ASM294v2.genome.fa.gz`,
    genomeFai: `${EXAMPLE_REF_BASE}/ASM294v2.genome.fa.gz.fai`,
    genomeGzi: `${EXAMPLE_REF_BASE}/ASM294v2.genome.fa.gz.gzi`,
    txFa: `${EXAMPLE_REF_BASE}/ASM294v2.transcriptome.derived.fa.gz`,
    txFai: `${EXAMPLE_REF_BASE}/ASM294v2.transcriptome.derived.fa.gz.fai`,
    txGzi: `${EXAMPLE_REF_BASE}/ASM294v2.transcriptome.derived.fa.gz.gzi`,
  },
};

/**
 * Show the "Import Custom Reference" dialog. Modeled on `showImportDialog`.
 *
 * Supports two input modes:
 *  - **Local**  — file pickers; values become `blob:` URLs.
 *  - **Remote** — URL text fields with extension validation + accessibility
 *    checks (like the Import Remote Channel dialog).
 *
 * Required slots: GFF3/GTF annotation, its tabix index, and the `.rbi`/`.rba`
 * search catalogue. The chrom.sizes + genome/transcriptome FASTA slots live in
 * a collapsible "Optional" section.
 *
 * @param files  Optional files to pre-fill the local slots (e.g. from drag-drop).
 * @param onAdd  Called with the assembled `IReferenceConfig` on confirm.
 */
export function showCustomReferenceDialog(
  files: File[],
  onAdd: (config: IReferenceConfig) => void,
): void {
  const fileSlots = autoFillRefSlots(files ?? []);
  let refName = deriveRefName(fileSlots);
  let defaultLocusName = "";
  let closing = false;
  // Default to local file pickers (drag-drop supplies local files).
  let mode: "local" | "remote" = "local";
  let optionalOpen = false;

  const ALL_SLOTS = Object.keys(SLOT_EXT) as RefSlotKey[];
  const urls: Record<RefSlotKey, string> = ALL_SLOTS.reduce(
    (acc, k) => ((acc[k] = ""), acc),
    {} as Record<RefSlotKey, string>,
  );
  const urlChecks: Record<RefSlotKey, CheckState> = ALL_SLOTS.reduce(
    (acc, k) => ((acc[k] = "idle"), acc),
    {} as Record<RefSlotKey, CheckState>,
  );
  const urlTimers: Partial<Record<RefSlotKey, ReturnType<typeof setTimeout>>> =
    {};

  // ── Shell ──────────────────────────────────────────────────────────
  const backdrop = el(
    "div",
    [
      "position:fixed",
      "inset:0",
      "z-index:200000",
      `background:${BACKDROP_BG}`,
      `backdrop-filter:${BACKDROP_BLUR}`,
      `-webkit-backdrop-filter:${BACKDROP_BLUR}`,
      "display:flex",
      "align-items:center",
      "justify-content:center",
      `font-family:${FONT}`,
    ].join(";"),
  );
  const card = el(
    "div",
    [
      "min-width:480px",
      "max-width:560px",
      "width:92%",
      `background:${DIALOG_BG}`,
      `border-radius:${DIALOG_RADIUS}`,
      `box-shadow:${DIALOG_SHADOW}`,
      "padding:28px 32px 24px",
      "box-sizing:border-box",
      "outline:none",
      "max-height:86vh",
      "display:flex",
      "flex-direction:column",
    ].join(";"),
  );
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
  animateIn(backdrop, card);

  // Pulse animation (shared with the remote channel dialog).
  if (!document.getElementById("rbrowser-pulse-anim")) {
    const style = document.createElement("style");
    style.id = "rbrowser-pulse-anim";
    style.textContent = "@keyframes pulse{from{opacity:1}to{opacity:0.35}}";
    document.head.appendChild(style);
  }

  // ── Title ────────────────────────────────────────────────────────
  card.appendChild(
    el(
      "div",
      `font-size:17px;font-weight:700;color:${TEXT_COLOR};margin-bottom:4px;`,
      "Import Custom Reference",
    ),
  );
  card.appendChild(
    el(
      "div",
      `font-size:13px;color:${SUBTITLE_COLOR};margin-bottom:14px;line-height:1.5;`,
      "Build a genome reference from local files or remote URLs. A GFF3 / GTF annotation, its tabix index, and a .rbi / .rba search catalogue are required.",
    ),
  );

  const labelStyle = `font-size:11px;font-weight:600;color:${SUBTITLE_COLOR};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;`;
  const inputCss = [
    "width:100%",
    "box-sizing:border-box",
    "font-size:13px",
    "padding:8px 10px",
    `border:1.5px solid ${BORDER_COLOR}`,
    "border-radius:6px",
    `background:${INPUT_BG}`,
    `font-family:${FONT}`,
    "outline:none",
    `transition:border-color ${TRANSITION}`,
  ].join(";");

  // ── Mode toggle (Local / Remote) ─────────────────────────────────
  const segWrap = el(
    "div",
    [
      "display:inline-flex",
      "padding:2px",
      `background:${INPUT_BG}`,
      `border:1px solid ${BORDER_COLOR}`,
      "border-radius:8px",
      "margin-bottom:14px",
      "gap:2px",
    ].join(";"),
  );
  function segBtn(label: string, value: "local" | "remote"): HTMLButtonElement {
    const b = el(
      "button",
      [
        "border:none",
        "border-radius:6px",
        "padding:5px 16px",
        "font-size:12px",
        "font-weight:600",
        "cursor:pointer",
        `font-family:${FONT}`,
        `transition:background ${TRANSITION}, color ${TRANSITION}`,
      ].join(";"),
      label,
    );
    const paint = () => {
      const active = mode === value;
      b.style.background = active ? "#fff" : "transparent";
      b.style.color = active ? PRIMARY_COLOR : SUBTITLE_COLOR;
      b.style.boxShadow = active ? "0 1px 3px rgba(0,0,0,0.12)" : "none";
    };
    paint();
    b.addEventListener("click", () => {
      if (mode === value) return;
      mode = value;
      segBtns.forEach((fn) => fn());
      rebuild();
    });
    segBtns.push(paint);
    return b;
  }
  const segBtns: Array<() => void> = [];
  const localBtn = segBtn("Local files", "local");
  const remoteBtn = segBtn("Remote URLs", "remote");
  segWrap.appendChild(localBtn);
  segWrap.appendChild(remoteBtn);
  card.appendChild(segWrap);

  // ── Scrollable body ──────────────────────────────────────────────
  const body = el(
    "div",
    "flex:1;overflow-y:auto;margin-bottom:18px;padding-right:2px;",
  );
  card.appendChild(body);

  // ── Name field ───────────────────────────────────────────────────
  const nameWrap = el("div", "margin-bottom:14px;");
  nameWrap.appendChild(el("div", labelStyle, "Reference name *"));
  const nameInput = el("input", inputCss) as HTMLInputElement;
  nameInput.type = "text";
  nameInput.placeholder = "e.g. MyGenome v1";
  nameInput.value = refName;
  nameInput.addEventListener("input", () => {
    refName = nameInput.value;
    updateAddBtn();
  });
  nameInput.addEventListener("focus", () => {
    nameInput.style.borderColor = PRIMARY_COLOR;
  });
  nameInput.addEventListener("blur", () => {
    nameInput.style.borderColor = BORDER_COLOR;
  });
  nameWrap.appendChild(nameInput);
  body.appendChild(nameWrap);

  // ── Default locus field (optional) ───────────────────────────────
  const locusWrap = el("div", "margin-bottom:14px;");
  locusWrap.appendChild(el("div", labelStyle, "Default locus (optional)"));
  const locusInput = el("input", inputCss) as HTMLInputElement;
  locusInput.type = "text";
  locusInput.placeholder = "Gene / transcript to open on load, e.g. MSF1";
  locusInput.value = defaultLocusName;
  locusInput.addEventListener("input", () => {
    defaultLocusName = locusInput.value;
  });
  locusInput.addEventListener("focus", () => {
    locusInput.style.borderColor = PRIMARY_COLOR;
  });
  locusInput.addEventListener("blur", () => {
    locusInput.style.borderColor = BORDER_COLOR;
  });
  locusWrap.appendChild(locusInput);
  locusWrap.appendChild(
    el(
      "div",
      `font-size:10.5px;color:${SUBTITLE_COLOR};margin-top:3px;line-height:1.4;`,
      "Searched in the .rbi / .rba catalogue and shown when the reference is selected.",
    ),
  );
  body.appendChild(locusWrap);

  const slotsContainer = el("div", "");
  body.appendChild(slotsContainer);

  // ── Status indicator (mirrors the remote channel dialog) ─────────
  function statusEl(state: CheckState): HTMLElement {
    const wrap = el(
      "div",
      state === "idle"
        ? ""
        : "display:flex;align-items:center;gap:5px;margin-top:3px;",
    );
    if (state === "idle") return wrap;
    const dot = el(
      "span",
      `display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0;${
        state === "checking"
          ? "background:#f39c12;animation:pulse 1s infinite alternate;"
          : state === "ok"
            ? "background:#00b894;"
            : state === "ok-proxied"
              ? "background:#0984e3;"
              : "background:#e74c3c;"
      }`,
    );
    wrap.appendChild(dot);
    const label =
      state === "checking"
        ? "Checking…"
        : state === "ok"
          ? "Accessible ✓"
          : state === "ok-proxied"
            ? "Served via CORS proxy ✓"
            : "Not accessible";
    wrap.appendChild(
      el(
        "span",
        `font-size:11px;color:${
          state === "ok"
            ? "#00b894"
            : state === "ok-proxied"
              ? "#0984e3"
              : state === "fail"
                ? "#e74c3c"
                : SUBTITLE_COLOR
        };`,
        label,
      ),
    );
    return wrap;
  }

  // ── Local file slot row ──────────────────────────────────────────
  function fileRow(
    label: string,
    key: RefSlotKey,
    required: boolean,
    accept: string,
    hint?: string,
  ): HTMLDivElement {
    const wrap = el("div", "margin-bottom:10px;");
    wrap.appendChild(el("div", labelStyle, `${label}${required ? " *" : ""}`));
    const row = el(
      "div",
      [
        "display:flex",
        "align-items:center",
        "gap:8px",
        "padding:7px 10px",
        `border:1.5px solid ${BORDER_COLOR}`,
        "border-radius:6px",
        `background:${INPUT_BG}`,
      ].join(";"),
    );
    const current = fileSlots[key];
    if (current) {
      row.appendChild(
        el("span", "color:#00b894;font-size:12px;font-weight:700;", "✓"),
      );
      const fname = el(
        "span",
        `flex:1;font-size:12px;color:${TEXT_COLOR};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`,
        current.name,
      );
      fname.title = current.name;
      row.appendChild(fname);
      row.appendChild(
        el(
          "span",
          `font-size:11px;color:${SUBTITLE_COLOR};font-variant-numeric:tabular-nums;`,
          formatFileSize(current.size),
        ),
      );
      const removeBtn = el(
        "button",
        [
          "background:transparent",
          `color:${SUBTITLE_COLOR}`,
          "border:none",
          "cursor:pointer",
          "font-size:14px",
          "line-height:1",
          "padding:0 2px",
        ].join(";"),
        "✕",
      );
      removeBtn.title = "Remove";
      removeBtn.addEventListener("click", () => {
        fileSlots[key] = null;
        rebuild();
      });
      row.appendChild(removeBtn);
    } else {
      row.appendChild(
        el(
          "span",
          `flex:1;font-size:12px;color:${SUBTITLE_COLOR};`,
          required ? "Required — choose a file" : "Optional",
        ),
      );
      const pickBtn = el(
        "button",
        [
          `background:${required ? PRIMARY_COLOR : "transparent"}`,
          `color:${required ? "#fff" : PRIMARY_COLOR}`,
          `border:1px solid ${PRIMARY_COLOR}`,
          "border-radius:6px",
          "padding:4px 12px",
          "font-size:12px",
          "font-weight:600",
          "cursor:pointer",
          `font-family:${FONT}`,
        ].join(";"),
        "Choose…",
      );
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.style.display = "none";
      input.addEventListener("change", () => {
        const f = input.files?.[0];
        if (f) {
          fileSlots[key] = f;
          if (!refName.trim()) {
            refName = deriveRefName(fileSlots);
            nameInput.value = refName;
          }
          rebuild();
        }
      });
      pickBtn.addEventListener("click", () => input.click());
      row.appendChild(pickBtn);
      row.appendChild(input);
    }
    wrap.appendChild(row);
    if (hint) {
      wrap.appendChild(
        el(
          "div",
          `font-size:10.5px;color:${SUBTITLE_COLOR};margin-top:3px;line-height:1.4;`,
          hint,
        ),
      );
    }
    return wrap;
  }

  // ── Remote URL slot row ──────────────────────────────────────────
  function urlRow(
    label: string,
    key: RefSlotKey,
    required: boolean,
    placeholder: string,
    hint?: string,
  ): HTMLDivElement {
    const wrap = el("div", "margin-bottom:10px;");
    wrap.appendChild(el("div", labelStyle, `${label}${required ? " *" : ""}`));
    const input = el("input", inputCss) as HTMLInputElement;
    input.type = "text";
    input.placeholder = placeholder;
    input.value = urls[key];
    wrap.appendChild(input);

    const extHint = el("div", "");
    wrap.appendChild(extHint);
    const sts = el("div", "");
    wrap.appendChild(sts);

    const renderExt = () => {
      extHint.innerHTML = "";
      const v = urls[key].trim();
      if (!v) return;
      if (!SLOT_EXT[key](stripUrlPath(v))) {
        extHint.appendChild(
          el(
            "div",
            "font-size:11px;color:#e74c3c;margin-top:3px;",
            "⚠ Unexpected file extension for this slot",
          ),
        );
      }
    };
    const renderSts = () => {
      sts.innerHTML = "";
      sts.appendChild(statusEl(urlChecks[key]));
    };
    renderExt();
    renderSts();

    input.addEventListener("input", () => {
      urls[key] = input.value;
      urlChecks[key] = "idle";
      renderExt();
      renderSts();
      updateAddBtn();
      const t = urlTimers[key];
      if (t) clearTimeout(t);
      const v = input.value.trim();
      if (v.startsWith("http")) {
        urlTimers[key] = setTimeout(async () => {
          urlChecks[key] = "checking";
          renderSts();
          updateAddBtn();
          const { ok, proxied } = await checkUrlAccessible(v);
          if (urls[key].trim() !== v) return;
          urlChecks[key] = ok ? (proxied ? "ok-proxied" : "ok") : "fail";
          renderSts();
          updateAddBtn();
        }, 600);
      }
    });
    input.addEventListener("focus", () => {
      input.style.borderColor = PRIMARY_COLOR;
    });
    input.addEventListener("blur", () => {
      input.style.borderColor = BORDER_COLOR;
    });
    if (hint) {
      wrap.appendChild(
        el(
          "div",
          `font-size:10.5px;color:${SUBTITLE_COLOR};margin-top:3px;line-height:1.4;`,
          hint,
        ),
      );
    }
    return wrap;
  }

  /** Render a slot in the current mode. */
  function slotRow(
    label: string,
    key: RefSlotKey,
    required: boolean,
    accept: string,
    placeholder: string,
    hint?: string,
  ): HTMLDivElement {
    return mode === "local"
      ? fileRow(label, key, required, accept, hint)
      : urlRow(label, key, required, placeholder, hint);
  }

  function sectionTitle(text: string): HTMLDivElement {
    return el(
      "div",
      `font-size:11px;font-weight:700;color:${TEXT_COLOR};text-transform:uppercase;letter-spacing:0.05em;margin:14px 0 8px;`,
      text,
    );
  }

  /** Re-render slot rows for the current mode + refresh the Add button. */
  function rebuild(): void {
    slotsContainer.innerHTML = "";

    // ── Required ──────────────────────────────────────────────────
    slotsContainer.appendChild(sectionTitle("Required"));
    slotsContainer.appendChild(
      slotRow(
        "GFF3 / GTF annotation",
        "annotation",
        true,
        ".gff,.gff3,.gtf,.gz",
        `${EXAMPLE_REF_BASE}/…annotation.sorted.gff3.gz`,
        "The transcript model source (bgzipped + tabix-indexed).",
      ),
    );
    slotsContainer.appendChild(
      slotRow(
        "Annotation index (.tbi)",
        "annotationIndex",
        true,
        ".tbi,.csi",
        `${EXAMPLE_REF_BASE}/…annotation.sorted.gff3.gz.tbi`,
      ),
    );
    slotsContainer.appendChild(
      slotRow(
        "Search catalogue (.rbi / .rba)",
        "catalogue",
        true,
        ".rbi,.rba,.sqlite",
        `${EXAMPLE_REF_BASE}/annotation.rbi`,
        "Enables transcript / gene name search.",
      ),
    );

    // ── Optional (collapsible) ────────────────────────────────────
    const optHeader = el(
      "div",
      [
        "display:flex",
        "align-items:center",
        "gap:6px",
        "cursor:pointer",
        "user-select:none",
        "margin:16px 0 6px",
      ].join(";"),
    );
    const chevron = el(
      "span",
      `font-size:11px;color:${SUBTITLE_COLOR};transition:transform 0.15s;transform:rotate(${optionalOpen ? 90 : 0}deg);`,
      "▶",
    );
    optHeader.appendChild(chevron);
    optHeader.appendChild(
      el(
        "div",
        `font-size:11px;font-weight:700;color:${TEXT_COLOR};text-transform:uppercase;letter-spacing:0.05em;`,
        "Optional (chrom.sizes, genome & transcriptome FASTA)",
      ),
    );
    optHeader.addEventListener("click", () => {
      optionalOpen = !optionalOpen;
      rebuild();
    });
    slotsContainer.appendChild(optHeader);

    if (optionalOpen) {
      const opt = el("div", "");
      opt.appendChild(
        slotRow(
          "chrom.sizes",
          "chromSizes",
          false,
          ".sizes,.chrom.sizes,.txt",
          `${EXAMPLE_REF_BASE}/…chrom.sizes`,
        ),
      );

      opt.appendChild(sectionTitle("Genome FASTA"));
      opt.appendChild(
        slotRow(
          "genome .fa.gz",
          "genomeFa",
          false,
          ".fa,.fasta,.fna,.gz",
          `${EXAMPLE_REF_BASE}/…genome.fa.gz`,
        ),
      );
      opt.appendChild(
        slotRow("genome .fai", "genomeFai", false, ".fai", `…genome.fa.gz.fai`),
      );
      opt.appendChild(
        slotRow("genome .gzi", "genomeGzi", false, ".gzi", `…genome.fa.gz.gzi`),
      );
      if (
        mode === "local" &&
        fileSlots.genomeFa &&
        (!fileSlots.genomeFai || !fileSlots.genomeGzi)
      ) {
        opt.appendChild(
          el(
            "div",
            "font-size:10.5px;color:#e67e22;margin:-4px 0 6px;line-height:1.4;",
            "⚠ Genome FASTA needs both .fai and .gzi to render the Sequence channel — it will be skipped otherwise.",
          ),
        );
      }

      opt.appendChild(sectionTitle("Transcriptome FASTA"));
      opt.appendChild(
        slotRow(
          "transcriptome .fa.gz",
          "txFa",
          false,
          ".fa,.fasta,.fna,.gz",
          `${EXAMPLE_REF_BASE}/…transcriptome.derived.fa.gz`,
        ),
      );
      opt.appendChild(
        slotRow("transcriptome .fai", "txFai", false, ".fai", `…fa.gz.fai`),
      );
      opt.appendChild(
        slotRow("transcriptome .gzi", "txGzi", false, ".gzi", `…fa.gz.gzi`),
      );
      if (
        mode === "local" &&
        fileSlots.txFa &&
        (!fileSlots.txFai || !fileSlots.txGzi)
      ) {
        opt.appendChild(
          el(
            "div",
            "font-size:10.5px;color:#e67e22;margin:-4px 0 6px;line-height:1.4;",
            "⚠ Transcriptome FASTA needs both .fai and .gzi — it will be skipped otherwise.",
          ),
        );
      }
      slotsContainer.appendChild(opt);
    }

    updateAddBtn();
  }

  // ── Buttons ──────────────────────────────────────────────────────
  const btnRow = el(
    "div",
    "display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;",
  );
  const cancelBtn = el(
    "button",
    [
      "background:transparent",
      `color:${SUBTITLE_COLOR}`,
      `border:1px solid ${BORDER_COLOR}`,
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:500",
      "cursor:pointer",
      `font-family:${FONT}`,
      "line-height:1.4",
    ].join(";"),
    "Cancel",
  );
  cancelBtn.addEventListener("mouseenter", () => {
    cancelBtn.style.background = "rgba(0,0,0,0.04)";
  });
  cancelBtn.addEventListener("mouseleave", () => {
    cancelBtn.style.background = "transparent";
  });

  // Example button — fills the remote URL fields from the ASM294v2 reference.
  const EXAMPLE_COLOR = "#00b894";
  const exampleBtn = el(
    "button",
    [
      `background:${EXAMPLE_COLOR}`,
      "color:#fff",
      "border:none",
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:600",
      "cursor:pointer",
      `font-family:${FONT}`,
      `transition:filter ${TRANSITION}`,
      "line-height:1.4",
      "margin-right:auto",
    ].join(";"),
    "Example",
  );
  exampleBtn.title = "Fill remote URLs with the ASM294v2 example reference";
  exampleBtn.addEventListener("mouseenter", () => {
    exampleBtn.style.filter = "brightness(1.08)";
  });
  exampleBtn.addEventListener("mouseleave", () => {
    exampleBtn.style.filter = "";
  });
  exampleBtn.addEventListener("click", () => {
    mode = "remote";
    segBtns.forEach((fn) => fn());
    refName = EXAMPLE_REF.name;
    nameInput.value = refName;
    defaultLocusName = EXAMPLE_REF.defaultLocus;
    locusInput.value = defaultLocusName;
    for (const k of ALL_SLOTS) {
      urls[k] = EXAMPLE_REF.urls[k];
      urlChecks[k] = "idle";
    }
    optionalOpen = true;
    rebuild();
    // Kick off accessibility checks for the filled URLs.
    for (const k of ALL_SLOTS) {
      const v = urls[k].trim();
      if (!v.startsWith("http")) continue;
      urlChecks[k] = "checking";
      void checkUrlAccessible(v).then(({ ok, proxied }) => {
        if (urls[k].trim() !== v) return;
        urlChecks[k] = ok ? (proxied ? "ok-proxied" : "ok") : "fail";
        rebuild();
      });
    }
    rebuild();
  });

  const addBtn = el(
    "button",
    [
      `background:${PRIMARY_COLOR}`,
      "color:#fff",
      "border:none",
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:600",
      "cursor:pointer",
      `font-family:${FONT}`,
      `transition:background ${TRANSITION}, opacity ${TRANSITION}`,
      "line-height:1.4",
    ].join(";"),
    "Add Reference",
  );
  addBtn.addEventListener("mouseenter", () => {
    if (!addBtn.disabled) addBtn.style.filter = "brightness(1.08)";
  });
  addBtn.addEventListener("mouseleave", () => {
    addBtn.style.filter = "";
  });
  btnRow.appendChild(exampleBtn);
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(addBtn);
  card.appendChild(btnRow);

  /** Resolve the effective URL for a slot in the current mode. */
  function resolveUrl(key: RefSlotKey): string | null {
    if (mode === "local") {
      const f = fileSlots[key];
      return f ? blobUrlFor(f) : null;
    }
    const v = urls[key].trim();
    return v || null;
  }

  function slotFilled(key: RefSlotKey): boolean {
    return mode === "local" ? !!fileSlots[key] : !!urls[key].trim();
  }

  function updateAddBtn(): void {
    const nameOk = !!refName.trim();
    const reqOk = REQUIRED_SLOTS.every(slotFilled);
    let extOk = true;
    let checking = false;
    if (mode === "remote") {
      for (const k of ALL_SLOTS) {
        const v = urls[k].trim();
        if (v && !SLOT_EXT[k](stripUrlPath(v))) extOk = false;
        if (urlChecks[k] === "checking") checking = true;
      }
    }
    const ok = nameOk && reqOk && extOk && !checking;
    addBtn.disabled = !ok;
    addBtn.style.opacity = ok ? "1" : "0.45";
    addBtn.style.cursor = ok ? "pointer" : checking ? "wait" : "not-allowed";
    addBtn.title = ok
      ? ""
      : checking
        ? "Checking URLs…"
        : "A name, a GFF3/GTF annotation, its index, and a .rbi/.rba catalogue are required";
  }

  // ── Actions ──────────────────────────────────────────────────────
  function close(): void {
    if (closing) return;
    closing = true;
    document.removeEventListener("keydown", onKey);
    animateOut(backdrop, card);
  }
  cancelBtn.addEventListener("click", () => close());
  addBtn.addEventListener("click", () => {
    if (closing || addBtn.disabled) return;
    const config = buildCustomReference(refName, resolveUrl, defaultLocusName);
    if (!config) return;
    onAdd(config);
    close();
  });
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);

  rebuild();
  setTimeout(() => nameInput.focus(), 100);
}
