/*
 * @Author: Zheng Lei
 * @Email: baimoc@163.com
 * @Date: 2025-09-24 13:32:51
 * @LastEditTime: 2026-05-26 17:43:35
 * @FilePath: \baimoc-browser\rbrowser\config\transcript-browser-data_QTLs.ts
 */
import { ITRConfig as IRNAConfig } from "@/renderer/transcript-renderer";
// import { headerBase } from "./header_base";

export const rendererRNAConfigTEST: IRNAConfig = {
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
  channels: [
    {
      name: "eQTLs",
      plot: "diamond",
      group: {
        name: "QTLs Annotation",
        style: {
          color: "#c7ecee",
        },
      },
      data: {
        method: "remote",
        format: "bigbed",
        url: "https://data.rbrowser.org/datahub/qtls/GRCh38/bigbed/gtex_eqtls.bigBed",
      },
      style: {
        detailZoom: 1_000_000_000,
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
        sep: "|",
        size: 0.4,
        foreground: {
          filterGene: "Gene id",
          // filterTranscript: "Transcript id",
          // colormap: "frost-coral",
          colormap: "coolwarm",
          colorBy: "Slope",
          range: [-0.8, 0.8],
          // sizeBy: "Slope",
          // sizeRange: [-0.8, 0.8],
          alpha: 0.9,
          // alphaBy: "Slope",
          // alphaRange: [1, 1],
        },
      },
    },
    {
      name: "sQTLs",
      plot: "diamond",
      group: {
        name: "QTLs Annotation",
        style: {
          color: "#c7ecee",
        },
      },
      data: {
        method: "remote",
        format: "bigbed",
        url: "https://data.rbrowser.org/datahub/qtls/GRCh38/bigbed/gtex_sqtls.bigBed",
      },
      style: {
        detailZoom: 1_000_000_000,
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
        sep: "|",
        size: 0.4,
        foreground: {
          filterGene: "Gene id",
          // filterTranscript: "Transcript id",
          // colormap: "frost-coral",
          colormap: "coolwarm",
          colorBy: "Slope",
          range: [-0.8, 0.8],
          // sizeBy: "Slope",
          // sizeRange: [-0.8, 0.8],
          alpha: 0.9,
          // alphaBy: "Slope",
          // alphaRange: [1, 1],
        },
      },
    },
    {
      name: "Sequence",
      plot: "sequence",
      group: {
        name: "Expression",
        style: {
          color: "#f6a385",
        },
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
      style: {
        pinned: true,
        padding: "0",
        // foreground: "#2f3542",
        // foreground: {
        //   colormap: "viridis",
        //   range: [0, 50],
        // },
        // padding defaults to '0.1 0' (bar plot)
      },
      order: 1,
    },
    {
      name: "Transcript",
      plot: "transcript",
      style: {
        pinned: true,
        height: 160,
        padding: "0.05",
        label: {
          color: "#3867d6",
        },
        modification: {
          enabled: true,
          color: {
            colormap: "coolwarm",
          },
          alpha: 1,
          height: 0.1,
          plot: "triangle",
        },
      },
      group: {
        name: "RNA Annotation",
        style: {
          color: "#3867d6",
        },
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
  ],
};
