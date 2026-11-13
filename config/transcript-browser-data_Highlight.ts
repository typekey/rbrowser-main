/*
 * @Author: Zheng Lei
 * @Email: baimoc@163.com
 * @Date: 2026-03-12 00:00:00
 * @LastEditTime: 2026-03-12 14:04:32
 * @FilePath: \baimoc-browser\rbrowser\config\transcript-browser-data_Highlight.ts
 */
import { ITRConfig as IRNAConfig } from "@/renderer/transcript-renderer";

/**
 * Test configuration with pre-defined highlight regions.
 *
 * Based on VAMP3-201 (chr1:7769296-7783432) with three highlight bands
 * demonstrating different colours and region sizes.
 */
export const rendererHighlightConfig: IRNAConfig = {
  renderer: {
    containerId: "tb-rna",
    theme: "light",
    backgroundColor: "#ffffff",
    resolution: "auto",
  },
  locus: {
    rna: {
      gene_name: "VAMP3",
      trans_name: "VAMP3-201",
      up: 5000,
      down: 5000,
    },
    dna: {
      chr: "chr1",
      start: 7769296,
      end: 7783432,
    },
    mode: "dna",
  },
  settings: {
    grid: {
      enabled: true,
      mode: "x+y",
      color: "gray",
    },
    axis: {
      enabled: true,
      height: 30,
    },
    loading: {
      enabled: true,
      position: "rightBottom",
      size: "small",
      fadeOutDuration: 300,
    },
  },
  reference: {
    assembly: { name: "GRCh38", build: "hg38" },
    transcriptome: {
      api: "https://api.rbrowser.org/api/v1/rna/hg38",
      fasta: {
        url: "https://data.rbrowser.org/datahub/base_annotation/Homo_sapiens/GRCh38.transcriptome.fa.gz",
        fai: "https://data.rbrowser.org/datahub/base_annotation/Homo_sapiens/GRCh38.transcriptome.fa.gz.fai",
        gzi: "https://data.rbrowser.org/datahub/base_annotation/Homo_sapiens/GRCh38.transcriptome.fa.gz.gzi",
      },
      annotation: {
        url: "https://data.rbrowser.org/datahub/rna_modification_sm/gencode_with_m6a.gff3.gz",
        index:
          "https://data.rbrowser.org/datahub/rna_modification_sm/gencode_with_m6a.gff3.gz.tbi",
      },
    },
    genome: {
      fasta: {
        url: "https://data.rbrowser.org/datahub/base_annotation/Homo_sapiens/GRCh38.genome.fa.gz",
        fai: "https://data.rbrowser.org/datahub/base_annotation/Homo_sapiens/GRCh38.genome.fa.gz.fai",
        gzi: "https://data.rbrowser.org/datahub/base_annotation/Homo_sapiens/GRCh38.genome.fa.gz.gzi",
      },
      chromSizes: {
        url: "https://data.rbrowser.org/datahub/base_annotation/Homo_sapiens/hg38.chromsizes",
      },
    },
  },
  // ── Pre-defined highlight regions ──────────────────────────────────
  highlight: [
    {
      name: "Exon 1 region",
      start: 7770500,
      end: 7771200,
      color: "#ff4757",
    },
    {
      name: "Promoter region",
      start: 7768800,
      end: 7769400,
      color: "#3867d6",
    },
    {
      name: "Exon 3 region",
      start: 7779000,
      end: 7780500,
      color: "#2ed573",
    },
  ],
  channels: [
    {
      name: "eQTLs",
      plot: "diamond",
      style: {
        height: 40,
        foreground: {
          filterGene: "Gene id",
          colormap: "coolwarm",
          colorBy: "Slope",
          range: [-0.8, 0.8],
          alpha: 0.9,
        },
        background: "#ffffff",
        label: { color: "#747d8c" },
        padding: "0",
        detailZoom: 1000000,
        maxHeight: 5,
        sep: "|",
        size: 0.4,
        keys: [
          "Variant id",
          "Gene id",
          "Tissue",
          "Slope",
          "-log10(P)",
          "tss_distance",
        ],
        order: [
          "Variant id",
          "Gene id",
          "Tissue",
          "Slope",
          "-log10(P)",
          "tss_distance",
        ],
        expand: "Tissue",
      },
      group: {
        style: { color: "#c7ecee" },
        name: "QTLs Annotation",
      },
      data: {
        method: "remote",
        format: "bigbed",
        url: "https://data.rbrowser.org/datahub/qtls/GRCh38/bigbed/gtex_eqtls.bigBed",
      },
      order: 0,
    },
    {
      name: "Sequence",
      plot: "sequence",
      style: {
        height: 30,
        foreground: "#2f3542",
        background: "#ffffff",
        label: { color: "#747d8c" },
        padding: "0",
        detailZoom: 10000,
        baseColors: {
          A: "#2ed573",
          T: "#ff4757",
          C: "#3dc1d3",
          G: "#f5cd79",
          N: "#999999",
        },
        baseTextColor: "#ffffff",
        pinned: true,
      },
      data: {
        method: "remote",
        format: "fasta",
        url: "https://data.rbrowser.org/datahub/base_annotation/Homo_sapiens/GRCh38.genome.fa.gz",
        index:
          "https://data.rbrowser.org/datahub/base_annotation/Homo_sapiens/GRCh38.genome.fa.gz.fai",
        index2:
          "https://data.rbrowser.org/datahub/base_annotation/Homo_sapiens/GRCh38.genome.fa.gz.gzi",
      },
      order: 1,
    },
    {
      name: "Transcript",
      plot: "transcript",
      style: {
        height: 160,
        foreground: "#747d8c",
        background: "#ffffff",
        label: { color: "#3867d6" },
        padding: "0.05",
        detailZoom: 5000000,
        pinned: true,
      },
      group: {
        style: { color: "#3867d6" },
        name: "RNA Annotation",
      },
      data: {
        method: "remote",
        format: "gff",
        url: "https://data.rbrowser.org/datahub/rna_modification_sm/gencode_with_m6a.gff3.gz",
        index:
          "https://data.rbrowser.org/datahub/rna_modification_sm/gencode_with_m6a.gff3.gz.tbi",
      },
      order: 2,
    },
    {
      name: "Transcript Structure",
      plot: "rect",
      style: {
        height: 40,
        foreground: "#a4b0be",
        background: "#ffffff",
        label: { color: "#3867d6" },
        padding: "0.1",
        detailZoom: 0,
        sep: "|",
        maxHeight: 7,
        keys: ["featureType"],
        expand: ["featureType"],
      },
      group: {
        name: "RNA Annotation",
        style: { color: "#3867d6" },
      },
      data: {
        method: "buildin",
        format: "transcript",
      },
      order: 3,
    },
    {
      name: "Exon Expression",
      plot: "score_rect",
      style: {
        height: 40,
        foreground: { colormap: "coolwarm" },
        background: "#ffffff",
        label: { color: "#00b894" },
        padding: "0.2",
        detailZoom: 0,
        maxHeight: 5,
        keys: ["Tissue"],
        expand: ["Tissue"],
        sep: "|",
      },
      group: {
        name: "RNA Expression",
        style: { color: "#00b894" },
      },
      data: {
        method: "buildin",
        format: "exon",
      },
      order: 4,
    },
    {
      name: "Junction Expression",
      plot: "score_curve",
      style: {
        height: 40,
        foreground: { colormap: "coolwarm" },
        background: "#ffffff",
        label: { color: "#00b894" },
        padding: "0",
        detailZoom: 0,
        maxHeight: 5,
        keys: ["Tissue"],
        expand: ["Tissue"],
        sep: "|",
      },
      group: {
        name: "RNA Expression",
        style: { color: "#00b894" },
      },
      data: {
        method: "buildin",
        format: "junction",
      },
      order: 5,
    },
  ],
};
