import type {
  ITRConfig,
  IRendererConfigResolved,
  ITargetConfig,
  IRegionConfig,
  IAnnotationConfig,
  IGridConfig,
  IChannelLabelConfig,
  ViewMode,
} from "../../config/config";
import type { IAxisConfig } from "../../axis";
import type { ILoadingConfig } from "../../loading";

/**
 * Internal config shape stored on `this.config`. The public `ITRConfig`
 * exposes only the new `locus` / `reference` / `settings` shape; this
 * resolved view adds the internal `target` / `region` / `annotation` /
 * `grid` / `axis` / `loading` / `channelLabel` / `mode` fields that the
 * renderer implementation still reads. They are derived from `locus` /
 * `reference` / `settings` at construction time.
 */
export type IResolvedConfig = Omit<ITRConfig, "renderer"> & {
  renderer: IRendererConfigResolved;
  target: ITargetConfig;
  region: IRegionConfig;
  annotation?: IAnnotationConfig;
  grid?: IGridConfig;
  axis?: IAxisConfig;
  loading?: ILoadingConfig;
  channelLabel?: IChannelLabelConfig;
  mode?: ViewMode;
};

/**
 * Working draft of the config used inside the constructor and the
 * normalisation helpers. Accepts both the new public shape and the
 * internal-only fields so the normalisers can populate them in-place.
 */
export type IConfigDraft = Omit<ITRConfig, "renderer"> &
  Partial<IResolvedConfig> & {
    renderer: IRendererConfigResolved;
  };

// ── Backward-compat config normalisation ──────────────────────────────────
// The public config now uses `locus` (rna + optional dna) and `reference`
// (structured species / assembly / transcriptome / genome). The renderer
// implementation still reads the legacy `target` / `region` / `annotation`
// fields throughout, so we derive them from the new shape at construction
// time when only the new shape was supplied.

/**
 * Derive `config.target` and `config.region` from `config.locus` in-place,
 * when they have not been supplied by the caller. Required fields fall
 * back to sensible defaults so internal code never sees `undefined`.
 *
 * `dna` is optional in `ILocus` — when absent, the genomic coordinates are
 * resolved asynchronously by `navigateByTranscript` after construction.
 * A placeholder region (chr from locus.dna or first available chromosome,
 * 0..1) is written so chained access (`config.region.chr`) does not crash.
 */
export function normaliseLocusToTargetRegion(config: IConfigDraft): void {
  const locus = config.locus;
  if (!locus) return;

  // ── target ─────────────────────────────────────────────────────────
  if (!config.target) {
    const rna = locus.rna ?? {};
    // Lookup priority: trans_id > trans_name > gene_id > gene_name.
    // IDs are the most reliable lookup key against the SQLite catalogue
    // (the human-readable transcript_name is only stored in the alias
    // index and may collide / miss for certain biotypes). The header
    // input is later re-populated with the resolved `region.trans_name`
    // by `navigateByTranscript*`, so users still see "VAMP3-201" rather
    // than "ENST00000054666".
    const rnaName =
      rna.trans_id ?? rna.trans_name ?? rna.gene_id ?? rna.gene_name ?? "";
    const dnaName = rna.gene_id ?? rna.gene_name ?? "";
    config.target = {
      dna: dnaName,
      rna: rnaName,
      upOffset: rna.up ?? 5000,
      downOffset: rna.down ?? 5000,
    };
  }

  // ── region ─────────────────────────────────────────────────────────
  if (!config.region) {
    // `IRegionConfig.offset` is the single flank value used by the legacy
    // region helpers. The new ILocusRna splits flanks into up/down
    // — collapse them to the larger of the two so the region still
    // contains the transcript even when navigation is asymmetric.
    const regionOffset = Math.max(
      locus.rna?.up ?? 5000,
      locus.rna?.down ?? 5000,
    );
    const dna = locus.dna;
    if (dna && dna.chr != null && dna.start != null && dna.end != null) {
      config.region = {
        chr: dna.chr,
        start: dna.start,
        end: dna.end,
        offset: regionOffset,
      };
    } else {
      // Placeholder — RNA navigation will replace this with the real
      // genomic coords as soon as the transcript API resolves.
      config.region = {
        chr: "",
        start: 0,
        end: 1,
        offset: regionOffset,
      };
    }
  }
}

/**
 * Derive the legacy `config.annotation` from the structured
 * `config.reference` in-place. Reference fields take precedence; any
 * pre-existing `annotation` values are preserved when the reference
 * does not provide them.
 */
export function normaliseReferenceToAnnotation(config: IConfigDraft): void {
  const ref = config.reference;
  if (!ref) return;

  const fromRef: IAnnotationConfig = {};
  if (ref.assembly?.name) fromRef.transcriptome = ref.assembly.name;
  // Prefer the REST `api` URL when present; otherwise fall back to the
  // SQLite catalogue declared under `transcriptome.annotation.transcripts`.
  // Both share the same `config.annotation.transcripts` slot — the renderer
  // dispatches by URL shape (`.sqlite` → SQLite, else REST).
  const refTranscripts =
    ref.transcriptome?.api ?? ref.transcriptome?.annotation?.transcripts;
  if (refTranscripts) fromRef.transcripts = refTranscripts;
  if (ref.genome?.chromSizes?.url)
    fromRef.chromsizes = ref.genome.chromSizes.url;
  if (ref.genome?.cytoband?.url) fromRef.cytoband = ref.genome.cytoband.url;

  config.annotation = fromRef;
}

/**
 * Map the public `config.settings` block onto the internal `grid`,
 * `axis`, `loading`, `channelLabel`, and `renderer.leftPanel` /
 * `renderer.headerPanel` fields the renderer reads.
 *
 * Field name mapping for header buttons (public → internal):
 *   `favorites` → `favourites`, `channelLabel` → `channel_label`.
 *
 * Public `settings.grid` uses `{ enabled, mode, color }`; the internal
 * `grid` uses `{ display, color }`. When `settings.grid.enabled === false`
 * the grid display is forced to `"none"`.
 *
 * When `settings.panels.header.enabled === false`, every header button
 * is forced off.
 */
export function normaliseSettings(config: IConfigDraft): void {
  const s = config.settings;
  if (!s) return;

  // ── grid ─────────────────────────────────────────────────────────
  if (s.grid) {
    const display = s.grid.enabled === false ? "none" : (s.grid.mode ?? "x+y");
    config.grid = { display, color: s.grid.color ?? "gray" };
  }

  // ── axis / loading / channelLabel ───────────────────────────────
  if (s.axis) config.axis = { ...config.axis, ...s.axis };
  if (s.loading) config.loading = { ...config.loading, ...s.loading };
  if (s.channelLabel)
    config.channelLabel = { ...config.channelLabel, ...s.channelLabel };

  // ── panels ──────────────────────────────────────────────────────
  const p = s.panels;
  if (!p) return;
  if (p.left) {
    config.renderer.leftPanel = {
      ...config.renderer.leftPanel,
      enable: p.left.enabled,
    };
  }
  if (p.header) {
    const h = p.header;
    const masterOff = h.enabled === false;
    const flag = (t?: { enabled?: boolean }) =>
      masterOff ? false : t?.enabled;
    config.renderer.headerPanel = {
      history: { enable: flag(h.history) },
      favourites: { enable: flag(h.favorites) },
      download: { enable: flag(h.download) },
      channel_label: { enable: flag(h.channelLabel) },
      legend: { enable: flag(h.legend) },
      grid: { enable: flag(h.grid) },
      tooltip: { enable: flag(h.tooltip) },
      highlight: { enable: flag(h.highlight) },
      cursor: { enable: flag(h.cursor) },
    };
  }
}

/**
 * Promote `locus.mode` to the internal `config.mode` field consumed by
 * the renderer at startup. Defaults to `"rna"` when neither is set.
 */
export function normaliseLocusMode(config: IConfigDraft): void {
  config.mode = config.locus?.mode ?? config.mode ?? "rna";
}
