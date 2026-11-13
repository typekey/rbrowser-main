import type { WheelMode } from "../events/wheel-mode";
import { IChannel } from "../channel";
import { ILoadingConfig } from "../loading";
import { IAxisConfig } from "../axis";
import type { IHighlightRegion } from "../highlight";

export type GridDisplay = "x" | "y" | "x+y" | "none";

/**
 * Determines which coordinate mode the renderer starts in.
 * - `"dna"` — genomic coordinates from `config.locus.dna`.
 * - `"rna"` — TSS-relative coordinates; navigates by `config.locus.rna` (default).
 * - `"cds"` — CDS-relative coordinates; navigates by `config.locus.rna` in CDS mode.
 */
export type ViewMode = "dna" | "rna" | "cds";

export interface IGridConfig {
  display?: GridDisplay;
  color?: string;
}

export type RenderQuality = "high" | "low";

// ── Panel visibility (legacy internal shape) ───────────────────────────────
// These types describe the internal shape consumed by the renderer.
// Public callers should use `IRBrowerConfig.settings.panels` instead;
// the constructor maps `settings.panels` onto these fields at startup.

/** Internal: left Control Panel sidebar visibility. */
export interface ILeftPanelConfig {
  /** Show/hide the entire left sidebar (default: false). */
  enable?: boolean;
}

/** Internal: individual Header toolbar button visibility. */
export interface IHeaderPanelConfig {
  history?: { enable?: boolean };
  favourites?: { enable?: boolean };
  download?: { enable?: boolean };
  channel_label?: { enable?: boolean };
  legend?: { enable?: boolean };
  grid?: { enable?: boolean };
  tooltip?: { enable?: boolean };
  highlight?: { enable?: boolean };
  cursor?: { enable?: boolean };
}

/**
 * Public renderer configuration. Visibility of the left sidebar and
 * the header toolbar buttons is configured via
 * `IRBrowerConfig.settings.panels`, not here.
 */
export interface IRendererConfig {
  containerId: string;
  theme?: "light" | "dark";
  backgroundColor?: string;
  resolution: "auto" | number;
  maxConcurrentWorkers?: number;
  /** Enable inertia/momentum scrolling after drag release (default: true) */
  enableInertia?: boolean;
  /** Primary wheel action. Ctrl/Cmd temporarily selects the other action. Default: zoom. */
  wheelMode?: WheelMode;
  /**
   * Rendering quality mode.
   * - "high": textured rendering using ele_grays asset for richer visuals.
   * - "low": flat-color rendering (scissor+clear / plain instanced quads).
   * Defaults to "high". Falls back to "low" automatically when WebGL2 is not
   * available.
   */
  mode?: RenderQuality;
}

/**
 * Internal renderer configuration shape stored on `this.config.renderer`.
 * Extends the public `IRendererConfig` with the resolved panel-visibility
 * fields that the renderer code reads directly.
 */
export interface IRendererConfigResolved extends IRendererConfig {
  leftPanel?: ILeftPanelConfig;
  headerPanel?: IHeaderPanelConfig;
}

export interface ITargetConfig {
  dna: string;
  rna: string;
  /** Upstream offset in bp (distance before transcript start). */
  upOffset: number;
  /** Downstream offset in bp (distance after transcript end). */
  downOffset: number;
}

export interface IRegionConfig {
  chr: string;
  start: number;
  end: number;
  offset: number;
}

// ── Locus (renderer's authoritative current-region shape) ────────────────

/**
 * RNA-side locus. All transcript / gene identity fields are optional —
 * they are populated when a navigation resolved them. `up` / `down` are
 * the upstream / downstream flank distances (bp) from the transcript
 * boundary, in transcript-strand orientation; in RNA mode the renderer
 * computes them live from the visible window relative to TSS / TES.
 */
export interface ILocusRna {
  /** Signed viewport boundaries relative to TSS=0; up/down remain legacy flanks. */
  tssStart?: number;
  tssEnd?: number;
  up?: number;
  down?: number;
  strand?: string;
  trans_id?: string;
  trans_name?: string;
  trans_type?: string;
  gene_id?: string;
  gene_name?: string;
  gene_type?: string;
  assembly: string;
}

/**
 * DNA-side locus. All fields required — the genomic coordinates are always
 * known (initial config or current view), and `assembly` mirrors the active
 * reference so a Locus snapshot is self-describing.
 */
export interface ILocusDna {
  chr: string;
  start: number;
  end: number;
  /**
   * Strand of the current view. `"."` for plain genomic (DNA-mode) windows,
   * which are strandless; in RNA / CDS mode it mirrors the active transcript's
   * strand. Optional so existing DNA snapshots without it remain valid.
   */
  strand?: string;
  assembly: string;
}

/**
 * Snapshot of the renderer's current locus (via LocusManager.getLocus).
 * Carries both DNA coordinates and RNA transcript identity regardless of
 * `mode`; `mode` marks the primary intent. `id` changes on any material change,
 * `time` is its ISO timestamp, and `isFavorite` comes from FavouriteManager.
 */
export interface ILocus {
  id: string;
  rna: ILocusRna;
  dna: ILocusDna;
  mode: ViewMode;
  time: string;
  isFavorite: boolean;
}

/**
 * Config-input form of ILocus: authors specify only identity
 * (transcript / gene names) and/or coordinates; `id` / `time` / `isFavorite`
 * and `assembly` are filled in at runtime.
 */
export interface IDefaultLocus {
  mode?: ViewMode;
  rna?: Partial<ILocusRna>;
  dna?: Partial<ILocusDna>;
}

export interface IAnnotationConfig {
  /** Reference genome assembly name, e.g. "GRCh38" */
  transcriptome?: string;
  /**
   * URL or path to a UCSC-format chromsizes file (tab-separated: chr\tsize).
   * Used to set per-chromosome hard pan/zoom boundaries.
   */
  chromsizes?: string;
  /**
   * Base URL for the RNA transcript API endpoint.
   * Used to resolve "TRANSCRIPT-NAME:FLANK" region notation.
   * e.g. "https://api.rbrowser.org/api/v1/rna/hg38"
   */
  transcripts?: string;
  /**
   * URL to a UCSC-format cytoband file (plain text or gzipped).
   * Tab-separated: chr  start  end  name  stain
   * Rendered as an ideogram on the axis navigation bar.
   */
  cytoband?: string;
}

// ── Reference (species + assembly + transcriptome + genome) ────────────────

/** Species metadata. All sub-fields optional. */
export interface ISpeciesInfo {
  /** Scientific name, e.g. "Homo sapiens". */
  name?: string;
  /** Display label, e.g. "Human". */
  label?: string;
  /** NCBI taxonomy ID, e.g. 9606. */
  taxonId?: number;
  /** Optional icon URL for the species, shown in the reference menu. */
  icon?: string;
}

/** Genome assembly metadata. `name` is required. */
export interface IAssemblyInfo {
  /** Required canonical assembly name, e.g. "GRCh38". */
  name: string;
  /** UCSC-style short build name, e.g. "hg38". */
  build?: string;
  /** Annotation release version, e.g. "GENCODE v44". */
  version?: string;
}

/** Bgzipped + indexed FASTA reference (url + fai + gzi). */
export interface IFastaReference {
  url: string;
  fai: string;
  gzi: string;
}

/** Indexed annotation file (.gff3.gz / .gtf.gz + .tbi). */
export interface IAnnotationReference {
  url: string;
  index: string;
  /**
   * Optional URL (remote or relative) to a read-only SQLite catalogue
   * used for transcript / gene / alias name-based lookup
   * (`hg38.gencode.rbrowser.sqlite` etc). Queried in the browser via
   * `sql.js-httpvfs` over HTTP Range requests.
   */
  transcripts?: string;
}

/**
 * Transcriptome reference. Either an API base URL or a local fasta +
 * annotation pair. When `api` is present it takes precedence over
 * `IAnnotationConfig.transcripts` and the per-file fallbacks below.
 */
export interface ITranscriptomeReference {
  /**
   * Optional REST API base URL (preferred when set).
   * e.g. "https://api.rbrowser.org/api/v1/rna/hg38"
   */
  api?: string;
  /** Transcriptome FASTA (bgzipped + .fai + .gzi). Optional for references that
   * lack a derived transcriptome (e.g. viral genomes). */
  fasta?: IFastaReference;
  /** Required transcriptome annotation (gff3.gz or gtf.gz + tabix index). */
  annotation: IAnnotationReference;
  /**
   * Whether api serves per-tissue expression scores for the buildin
   * Exon + Splice Junction channels. `true` → those channels render in
   * `score_rect` / `score_curve` (colour-mapped) mode; otherwise plain GFF3
   * rects / arcs. Only GRCh38 has this data today, so it is an explicit flag —
   * the presence of `api` alone is not a reliable signal.
   */
  scoreExonJunction?: boolean;
}

/** Per-chromosome size table (tab-separated chr\tsize). */
export interface IChromSizesReference {
  url: string;
}

/** Cytoband table (plain text or gzipped). */
export interface ICytobandReference {
  url: string;
}

/**
 * Genome reference. `fasta` is required; `chromSizes` (optional, derived
 * from the FASTA index when absent) and `cytoband` (optional, ideogram
 * disabled when absent).
 */
export interface IGenomeReference {
  /**
   * Genome FASTA (bgzipped + .fai + .gzi). Optional: custom references loaded
   * from local files may omit it (the genome Sequence channel is then simply
   * not rendered). All consumers access it via optional chaining.
   */
  fasta?: IFastaReference;
  chromSizes?: IChromSizesReference;
  cytoband?: ICytobandReference;
}

/**
 * Top-level reference configuration grouping species, assembly,
 * transcriptome and genome reference resources. Replaces the
 * loosely-typed `annotation` field; both may coexist for backward
 * compatibility, but `reference` takes precedence when both are set.
 */
export interface IReferenceConfig {
  /** Optional species metadata. */
  species?: ISpeciesInfo;
  /** Required assembly metadata. */
  assembly: IAssemblyInfo;
  /** Required transcriptome reference. */
  transcriptome: ITranscriptomeReference;
  /** Required genome reference. */
  genome: IGenomeReference;
  /**
   * Default locus to navigate to when this reference becomes active.
   * Uses IDefaultLocus — a partial form of ILocus where
   * config authors specify identity / coordinates, and the runtime fills
   * in the rest. Used by `ReferenceManager.switchTo()` to jump to a
   * meaningful gene after a reference switch.
   */
  defaultLocus?: IDefaultLocus;
  /**
   * Whether this reference is "curated" (featured). Curated references are
   * marked with a star badge and sorted to the top of the reference menu.
   */
  curated?: boolean;
  /**
   * Whether this reference was assembled at runtime from local files (the
   * "Import Custom Reference" dialog). Uses `blob:` URLs, is grouped under
   * "Custom" in the reference menu, and is not persisted across reloads.
   */
  custom?: boolean;
}

export interface IChannelLabelConfig {
  /** Enable channel label display (default: true) */
  enabled?: boolean;
  /** Font size in pixels (default: 10) */
  fontSize?: number;
  /** Maximum characters to display before truncating (default: 20) */
  maxLength?: number;
  /** Background color (default: rgba(255, 255, 255, 0.8)) */
  backgroundColor?: string;
  /** Border color (default: #000000) */
  borderColor?: string;
  /** Border width in pixels (default: 0.5) */
  borderWidth?: number;
  /** Border radius in pixels (default: 0) */
  borderRadius?: number;
  /** Text color (default: #000000) */
  textColor?: string;
  /** Padding in pixels (default: 4) */
  padding?: number;
  /** Position offset from top-left corner in pixels (default: { x: 8, y: 8 }) */
  offset?: { x: number; y: number };
}

/**
 * Top-level renderer configuration consumed by `TranscriptBrowserRenderer`.
 *
 * Historically named `ITRConfig`; renamed to `IRBrowerConfig` to better
 * reflect that the renderer is a general genome / transcript browser.
 * The old name is kept as a type alias for backward compatibility.
 */
export interface IRBrowerConfig {
  renderer: IRendererConfig;
  /**
   * Initial coordinate. `rna` is required (trans_name or trans_id);
   * `dna` is optional and will be derived from the transcript
   * annotation/API when omitted. `locus.mode` selects the startup
   * coordinate space (default: `"rna"`).
   */
  locus: IDefaultLocus;
  /**
   * Structured reference description grouping species, assembly,
   * transcriptome and genome resources.
   */
  reference?: IReferenceConfig;
  /**
   * Behavioural / visual settings: panel visibility, grid, axis,
   * loading indicator and channel-label badge.
   */
  settings?: ISettingsConfig;
  /**
   * Pre-defined highlight regions to load at initialisation.
   * Each entry is drawn as a coloured translucent vertical band
   * over the channel content area.
   */
  highlight?: IHighlightRegion[];
  channels: IChannel[];
}

// ── Settings (panel visibility + grid + axis + loading + channelLabel) ─────

/** Generic on/off toggle for a panel/button. */
export interface IPanelToggle {
  /** Visible / enabled (default: true). */
  enabled?: boolean;
}

/** Header toolbar button visibility. */
export interface IHeaderPanelsSettings {
  /**
   * Master switch for the entire header toolbar (default: true).
   * When `false`, all sub-button toggles are forced off.
   */
  enabled?: boolean;
  history?: IPanelToggle;
  favorites?: IPanelToggle;
  download?: IPanelToggle;
  channelLabel?: IPanelToggle;
  legend?: IPanelToggle;
  grid?: IPanelToggle;
  tooltip?: IPanelToggle;
  highlight?: IPanelToggle;
  cursor?: IPanelToggle;
}

/** Panel visibility (left sidebar + header toolbar). */
export interface IPanelsSettings {
  /** Left Control Panel sidebar (default: hidden). */
  left?: IPanelToggle;
  /** Header toolbar buttons (default: all visible). */
  header?: IHeaderPanelsSettings;
}

/** Grid overlay configuration (public shape). */
export interface IGridSettings {
  /** Enable the grid overlay (default: true). */
  enabled?: boolean;
  /** Which axes to draw grid lines for. */
  mode?: GridDisplay;
  /** Grid line color (CSS color string). */
  color?: string;
}

/** Top-level settings block. */
export interface ISettingsConfig {
  /** Panel visibility (left sidebar + header toolbar). */
  panels?: IPanelsSettings;
  /** Grid overlay configuration. */
  grid?: IGridSettings;
  /** Bottom axis configuration. */
  axis?: IAxisConfig;
  /** Loading indicator configuration. */
  loading?: ILoadingConfig;
  /** Channel-label badge configuration. */
  channelLabel?: IChannelLabelConfig;
}

/**
 * @deprecated Use `IRBrowerConfig` instead. Kept as a transitional alias
 * so existing callers and exported configs continue to type-check.
 */
export type ITRConfig = IRBrowerConfig;
