/**
 * Default configuration for the Transcript Renderer.
 *
 * All hardcoded/magic values that the renderer uses as fallbacks are
 * collected here so that they can be overridden in one place.
 *
 * The user-supplied `ITRConfig` is deep-merged **on top** of this object
 * at startup, so any value the user omits simply inherits the default.
 */

// ══════════════════════════════════════════════════════════════════════
//  Type helpers  (re-exports are kept lightweight – no circular deps)
// ══════════════════════════════════════════════════════════════════════

/** Transcript (GFF) feature part rendering config. */
export interface IFeaturePartConfig {
  color: string;
  height: number;
  order: number;
}

// ══════════════════════════════════════════════════════════════════════
//  Default configuration object
// ══════════════════════════════════════════════════════════════════════

export const defaultConfig = {
  // ────────────────────────────────────────────────────────────────────
  //  Top-level renderer settings
  // ────────────────────────────────────────────────────────────────────
  renderer: {
    theme: "light" as const,
    backgroundColor: "#ffffff",
    resolution: "auto" as const,
    mode: "high" as const,
    /** Enable inertia/momentum scrolling after drag release */
    enableInertia: true,
  },

  grid: {
    display: "x+y" as const,
    color: "gray",
  },

  axis: {
    enabled: true,
    height: 30,
  },

  loading: {
    enabled: true,
    position: "rightBottom" as const,
    size: "small" as const,
    fadeOutDuration: 300,
  },

  // ────────────────────────────────────────────────────────────────────
  //  Channel label badge (top-left corner of every track)
  // ────────────────────────────────────────────────────────────────────
  channelLabel: {
    enabled: true,
    fontSize: 12,
    maxLength: 20,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderColor: "#ced6e0",
    borderWidth: 0.5,
    borderRadius: 0,
    textColor: "#000000",
    padding: 3,
    offset: { x: 0, y: 0 },
  },

  // ────────────────────────────────────────────────────────────────────
  //  Per-plot-type channel defaults
  //
  //  When the user's channel config omits a value, the renderer picks
  //  the matching plot entry below (falling back to `_common`).
  // ────────────────────────────────────────────────────────────────────
  channels: {
    /** Values shared by every plot type (lowest priority). */
    _common: {
      style: {
        height: 40,
        foreground: "#747d8c",
        background: "#ffffff",
        padding: "0.2",
        detailZoom: 0, // 0 = no limit
        label: {
          color: "#747d8c",
        },
      },
      group: {
        style: {
          color: "#ced6e0",
        },
      },
    },

    // ── Sequence (FASTA) ───────────────────────────────────────────
    sequence: {
      style: {
        height: 30,
        padding: "0",
        foreground: "#2f3542",
        detailZoom: 10_000,
        /** Per-base colours (hex) — matches variant palette. */
        baseColors: {
          A: "#2ed573",
          T: "#ff4757",
          C: "#3dc1d3",
          G: "#f5cd79",
          N: "#999999",
        },
        /** Base-letter text colour on the zoomed-in overlay. */
        baseTextColor: "#ffffff",
      },
    },

    // ── Transcript (GFF/GTF) ───────────────────────────────────────
    transcript: {
      style: {
        height: 160,
        padding: "0",
        detailZoom: 5_000_000,
        /** Lane height in CSS px. */
        laneHeight: 28,
        label: {
          color: "#3867d6",
        },
        /** Transcript part colour / height / draw-order table. */
        featureMap: {
          exon: { color: "#a4b0be", height: 0.5, order: 0 },
          CDS: { color: "#747d8c", height: 0.5, order: 1 },
          start_codon: { color: "#2ed573", height: 0.5, order: 1 },
          five_prime_UTR: { color: "#ced6e0", height: 0.5, order: 2 },
          three_prime_UTR: { color: "#ced6e0", height: 0.5, order: 2 },
          stop_codon: { color: "#ff4757", height: 0.5, order: 2 },
          default: { color: "#747d8e", height: 0.38, order: 1 },
        } as Record<string, IFeaturePartConfig>,
        /** Intron backbone colour. */
        intronColor: "#b0b0b0",
        /** Intron backbone height (fraction of lane). */
        intronHeight: 0.04,
        /** Vertical centre of transcript body within the lane (0–1). */
        bodyCentreY: 0.5,
        /** Fraction of lane height for the gene body. */
        bodyFrac: 0.55,
        /** Transcript name label (inside lane). */
        txLabel: {
          fontSize: 9,
          color: "#555555",
        },
        /** Strand direction arrow. */
        strandArrow: {
          fontSize: 7,
          color: "rgba(120,120,120,0.6)",
        },
      },
      group: {
        style: {
          color: "#3867d6",
        },
      },
    },

    // ── BAM alignment reads ────────────────────────────────────────
    bam: {
      style: {
        height: 160,
        padding: "0.05 0",
        detailZoom: 500_000,
        /** Lane height in CSS px. */
        laneHeight: 4,
        label: {
          color: "#3867d6",
        },
        /** Read-strand colours. */
        readsColor: {
          plus: "#f7b731",
          minus: "#eb3b5a",
          other: "#95a5a6",
        },
        /** Read rect height fraction within the lane. */
        readHeightFrac: 0.7,
        /** Coverage histogram defaults. */
        coverage: {
          enabled: true,
          /** Coverage stays visible at larger scales than reads. */
          detailZoom: 5_000_00,
          color: "#8b95a5",
          alpha: 0.7,
          height: 0.2,
          plot: "heatmap" as const,
          /** Score-range label in the top-right of the coverage area. */
          scoreLabel: {
            enabled: true,
            fontSize: 10,
            color: "#555555",
            background: "rgba(255,255,255,0.75)",
          },
        },
      },
      group: {
        style: {
          color: "#3867d6",
        },
      },
    },

    // ── Diamond (BigBed markers) ───────────────────────────────────
    diamond: {
      style: {
        height: 40,
        padding: "0",
        maxHeight: 5,
        sep: "|",
        size: 0.5,
        detailZoom: 0,
      },
      group: {
        style: {
          color: "#f58518",
        },
      },
    },

    // ── Rect (BigBed / BED) ────────────────────────────────────────
    rect: {
      style: {
        height: 40,
        padding: "0.2",
        sep: "|",
        detailZoom: 0,
      },
    },

    // ── Bar (BigWig histogram) ─────────────────────────────────────
    bar: {
      style: {
        height: 40,
        padding: "0.1 0",
        detailZoom: 0,
      },
    },

    // ── Line (BigWig line chart) ───────────────────────────────────
    line: {
      style: {
        height: 40,
        padding: "0.1 0",
        detailZoom: 0,
      },
    },

    // ── Point (BigWig scatter) ─────────────────────────────────────
    point: {
      style: {
        height: 40,
        padding: "0.1 0",
        detailZoom: 0,
      },
    },

    // ── Heatmap (BigWig colour-intensity) ──────────────────────────
    heatmap: {
      style: {
        height: 40,
        padding: "0",
        detailZoom: 0,
      },
    },

    // ── Variant (VCF) ──────────────────────────────────────────────
    variant: {
      style: {
        height: 80,
        /** Height of each variant row as a fraction of a lane. */
        rowHeight: 0.31,
        /** Row padding as a fraction of lane height on each side. */
        rowPadding: 0.01,
        padding: "0.05",
        detailZoom: 50_000,
        label: {
          color: "#3867d6",
        },
        /** Per-base colours for ALT alleles (hex). */
        baseColors: {
          A: "#2ed573", // green
          T: "#ff4757", // red
          C: "#3dc1d3", // cyan
          G: "#f5cd79", // gold
          N: "#999999", // gray
        },
        /** Reference allele colour. */
        refColor: "#a4b0be",
        /** Base-letter text colour on the variant overlay. */
        baseTextColor: "#ffffff",
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────  //  Supported file formats (used by local-picker, remote URL, drag-drop)
  //
  //  These names match the file extension. Aliases such as `bb` (bigbed)
  //  and `bw` (bigwig) are listed alongside their canonical names so a
  //  filename ending in `.bb` is accepted as well. Extension matching is
  //  case-insensitive.
  // ───────────────────────────────────────────────────────────────────
  supportFiles: [
    // Indexed binary
    "bam",
    "cram",
    "bigwig",
    "bw",
    "bigbed",
    "bb",
    // Indexed text (typically .gz / .bgz + .tbi)
    "vcf",
    "vcf.gz",
    "vcf.gz.tbi",
    "bed",
    "bed.gz",
    "gff.gz",
    "gff.gz.tbi",
    "gff3.gz",
    "gff3.gz.tbi",
    "gtf.gz",
    "gtf.gz.tbi",
    "fasta.gz",
    "fasta.gz.fai",
    "fasta.gz.gzi",
    "fna.gz",
    "fna.gz.fai",
    "fna.gz.gzi",
    "fa.gz",
    "fa.gz.fai",
    "fa.gz.gzi",
    "fna.gz",
    "fna.gz.fai",
    "fna.gz.gzi",
    "ism.gz",
    "ism.gz.tbi",
    // Plain-text BED-like (no index, downloaded in full)
    "bed",
    "narrowPeak",
    "broadPeak",
    "bedGraph",
    // Inline content formats (used with method: "local" + content)
    "tsv",
    "json",
  ] as const,

  // ───────────────────────────────────────────────────────────────────  //  Built-in data URL templates
  //
  //  These are URL templates for `method: "buildin"` channels.
  //  Placeholders:
  //    {transcript_id}  — replaced by the current transcript name
  //    {flank}          — replaced by the current flank/offset value
  //  The renderer fills these automatically when navigating to a
  //  transcript, so individual channel configs don't need a `url`.
  // ────────────────────────────────────────────────────────────────────
  buildin: {
    transcript:
      "https://api.rbrowser.org/api/v1/rna/hg38/{transcript_id}/auto/{flank}/1000/",
    exon: "https://api.rbrowser.org/api/v1/exon_expression/hg38/{transcript_id}/auto/",
    junction:
      "https://api.rbrowser.org/api/v1/junction_expression/hg38/{transcript_id}/auto/",
  },

  // ────────────────────────────────────────────────────────────────────
  //  UI chrome (scrollbar, shadows, zoom hints)
  // ────────────────────────────────────────────────────────────────────
  ui: {
    /** Scroll speed multiplier for mouse wheel inside BAM / transcript. */
    scrollSpeedFactor: 0.5,

    scrollbar: {
      width: 6,
      trackColor: "rgba(0,0,0,0.05)",
      thumbColor: "rgba(0,0,0,0.25)",
      thumbHoverColor: "rgba(0,0,0,0.4)",
      thumbDragColor: "rgba(0,0,0,0.5)",
      thumbMinHeight: 20,
    },

    innerShadow:
      "inset 0 8px 6px -6px rgba(0,0,0,0.12), inset 0 -8px 6px -6px rgba(0,0,0,0.12)",

    zoomHint: {
      fontSize: 12,
      color: "#999999",
    },

    /** Group left-border indicator. */
    groupBorder: {
      width: 5,
      fallbackColor: "#ced6e0",
    },

    /** Score-range label defaults (used by bigwig bar/line/point and BAM coverage). */
    scoreLabel: {
      fontSize: 12,
      fontFamily: "monospace",
      color: "#555555",
      background: "rgba(255,255,255,0.75)",
      padding: "1px 3px",
      borderRadius: 2,
      top: 2,
      right: 4,
    },

    /** Sample label coloured blocks shown to the left of expanded sub-channels. */
    sampleLabel: {
      /** Width of each colour strip in CSS px. */
      stripWidth: 10,
      /** Gap between adjacent strips in CSS px. */
      stripGap: 0.5,
    },

    /** Sub-channel grid line colours by theme. */
    gridLine: {
      light: [0.78, 0.78, 0.78, 1.0] as [number, number, number, number],
      dark: [0.35, 0.35, 0.35, 1.0] as [number, number, number, number],
    },
  },
} as const;

// Re-export the shape so other modules can type-check against it.
export type DefaultConfig = typeof defaultConfig;
