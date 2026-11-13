/*
 * @Author: Zheng Lei
 * @Email: baimoc@163.com
 * @Date: 2025-09-24 13:32:51
 * @LastEditTime: 2026-06-03 17:26:25
 * @FilePath: \baimoc-browser\rbrowser\config\transcript-browser-data_mm10.ts
 */
import { IRBrowerConfig } from "@/renderer/transcript-renderer";
// import { headerBase } from "./header_base";

export const rendererRNAConfigTEST: IRBrowerConfig = {
  renderer: {
    containerId: "tb-rna",
    theme: "light",
    resolution: "auto",
    enableInertia: true,
  },
  locus: {
    mode: "rna",
    rna: {
      gene_name: "vamp3",
      gene_id: "ENSMUSG00000028955",
      trans_name: "vamp3-201",
      trans_id: "ENSMUST00000030797",
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
    panels: {
      left: { enabled: true },
      header: {
        enabled: true,
        history: { enabled: true },
        favorites: { enabled: true },
        download: { enabled: true },
        channelLabel: { enabled: true },
        legend: { enabled: true },
        grid: { enabled: true },
        tooltip: { enabled: true },
        highlight: { enabled: true },
        cursor: { enabled: true },
      },
    },
    grid: {
      enabled: true,
      mode: "x+y",
      color: "red",
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
    species: {
      name: "Mus musculus",
      label: "Mouse",
      taxonId: 10090,
    },
    assembly: {
      name: "GRCm38",
      build: "mm10",
      version: "GENCODE M25",
    },
    transcriptome: {
      // api: "https://api.rbrowser.org/api/v1/rna/hg38",
      fasta: {
        url: "https://data.rbrowser.org/datahub/reference/results/Mus_musculus/GRCm38/build/transcriptome.fa.gz",
        fai: "https://data.rbrowser.org/datahub/reference/results/Mus_musculus/GRCm38/build/transcriptome.fa.gz.fai",
        gzi: "https://data.rbrowser.org/datahub/reference/results/Mus_musculus/GRCm38/build/transcriptome.fa.gz.gzi",
      },
      annotation: {
        transcripts:
          "https://data.rbrowser.org/datahub/reference/GRCm38.annotation.rba",
        url: "https://data.rbrowser.org/datahub/reference/results/Mus_musculus/GRCm38/build/annotation.sorted.gff3.gz",
        index:
          "https://data.rbrowser.org/datahub/reference/results/Mus_musculus/GRCm38/build/annotation.sorted.gff3.gz.tbi",
      },
    },
    genome: {
      fasta: {
        url: "https://data.rbrowser.org/datahub/reference/results/Mus_musculus/GRCm38/build/genome.fa.gz",
        fai: "https://data.rbrowser.org/datahub/reference/results/Mus_musculus/GRCm38/build/genome.fa.gz.fai",
        gzi: "https://data.rbrowser.org/datahub/reference/results/Mus_musculus/GRCm38/build/genome.fa.gz.gzi",
      },
      chromSizes: {
        url: "https://data.rbrowser.org/datahub/reference/results/Mus_musculus/GRCm38/build/chrom.sizes",
      },
      // cytoband: {
      //   url: "https://data.rbrowser.org/datahub/rna_reference/Mus_musculus/cytoband/cytoband_GRCm38.txt.gz",
      // },
    },
    defaultLocus: {
      mode: "rna",
      rna: {
        gene_name: "Vamp3",
        gene_id: "ENSMUSG00000028955",
        trans_name: "Vamp3-201",
        trans_id: "ENSMUST00000030797",
        up: 5000,
        down: 5000,
      },
    },
  },
  channels: [
    // {
    //   name: "RNA Binding Protein (StarBase)",
    //   plot: "rect",
    //   data: {
    //     method: "remote",
    //     format: "bigbed",
    //     url: "/www/wwwroot/data.rbrowser.org/datahub/rna_binding_protein/GRCm38/bigbed/curated_merge/rbp_GRCm38_starbase.bigBed",
    //   },
    //   style: {
    //     detailZoom: 1_000_000,
    //     color: "#e17055",
    //     height: 40,
    //     keys: ["Region", "Strand", "Protein", "Method", "Cell line", "Source"],
    //     order: ["Region", "Strand", "Protein", "Method", "Cell line", "Source"],
    //     expand: "Protein",
    //     sep: "|",
    //   },
    // },
    // {
    //   name: "RNA Binding Protein (Curated)",
    //   plot: "rect",
    //   data: {
    //     method: "remote",
    //     format: "bigbed",
    //     url: "/www/wwwroot/data.rbrowser.org/datahub/rna_binding_protein/GRCm38/bigbed/curated_merge/rbp_GRCm38_curated.bigBed",
    //   },
    //   style: {
    //     detailZoom: 1_000_000,
    //     color: "#e17055",
    //     height: 40,
    //     keys: ["Region", "Strand", "Protein", "Method", "Cell line", "Source"],
    //     order: ["Region", "Strand", "Protein", "Method", "Cell line", "Source"],
    //     expand: "Protein",
    //     sep: "|",
    //   },
    // },
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
        url: "https://data.rbrowser.org/datahub/reference/results/Mus_musculus/GRCm38/build/genome.fa.gz",
        index:
          "https://data.rbrowser.org/datahub/reference/results/Mus_musculus/GRCm38/build/genome.fa.gz.fai",
        index2:
          "https://data.rbrowser.org/datahub/reference/results/Mus_musculus/GRCm38/build/genome.fa.gz.gzi",
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
    // {
    //   name: "m6A Modification",
    //   // plot: "rect",
    //   plot: "diamond",
    //   group: {
    //     name: "RNA Modification",
    //     style: {
    //       color: "#f58518",
    //     },
    //   },
    //   data: {
    //     method: "remote",
    //     format: "bigbed",
    //     url: "/www/wwwroot/data.rbrowser.org/datahub/rna_modification/GRCm38/bigbed/curated_merge/m6A_GRCm38_curated.bigBed",
    //   },
    //   style: {
    //     keys: [
    //       "Region",
    //       "Strand",
    //       "Modification",
    //       "Method",
    //       "Biosample",
    //       "Source",
    //     ],
    //     order: [
    //       "Region",
    //       "Strand",
    //       "Modification",
    //       "Method",
    //       "Biosample",
    //       "Source",
    //     ],
    //     expand: ["Biosample", "Method"],
    //     maxHeight: 5,
    //     sep: "|",
    //     size: 0.4,
    //     foreground: {
    //       alpha: 0.9,
    //     },
    //   },
    //   order: 0,
    // },
    // {
    //   name: "Heatmap bigwig caRNA",
    //   plot: "heatmap",
    //   group: {
    //     name: "Expression",
    //     style: {
    //       color: "#f6a385",
    //     },
    //   },
    //   data: {
    //     method: "remote",
    //     format: "bigwig",
    //     url: "https://data.rbrowser.org/datahub/merip/caRNA_MeRIP-seq/Input/1..GM18499..caRNA_MeRIP_Input.bw",
    //     windowingFunction: "mean",
    //   },
    //   style: {
    //     expand: "",
    //     keys: [],
    //     sep: "",
    //     foreground: {
    //       colormap: "viridis",
    //       // range: [0, 50],
    //     },
    //     // padding defaults to '0.1 0' (bar plot)
    //   },
    // },
    // {
    //   name: "Bar bigWig caRNA",
    //   plot: "bar",
    //   group: {
    //     name: "Expression",
    //     number: 1,
    //     stacked: true,
    //     style: {
    //       color: "#f6a385",
    //     },
    //   },
    //   data: {
    //     method: "remote",
    //     format: "bigwig",
    //     url: "https://data.rbrowser.org/datahub/merip/caRNA_MeRIP-seq/Input/1..GM18499..caRNA_MeRIP_Input.bw",
    //     windowingFunction: "mean",
    //   },
    //   style: {
    //     expand: "",
    //     keys: [],
    //     sep: "",
    //     foreground: {
    //       colormap: "viridis",
    //       range: [0, 50],
    //     },
    //     // padding defaults to '0.1 0' (bar plot)
    //   },
    // },
    // {
    //   name: "bigWig mRNA",
    //   plot: "bar",
    //   group: {
    //     name: "Expression",
    //     number: 1,
    //     style: {
    //       color: "#f6a385",
    //     },
    //   },
    //   data: {
    //     method: "remote",
    //     format: "bigwig",
    //     url: "https://data.rbrowser.org/datahub/merip/mRNA_MeRIP-seq/Input/1..GM18499..mRNA_MeRIP_Input.bw",
    //     windowingFunction: "mean",
    //   },
    //   style: {
    //     expand: "",
    //     keys: [],
    //     sep: "",
    //     foreground: {
    //       colormap: "plasma",
    //       range: [0, 130],
    //     },
    //   },
    // },
    // {
    //   name: "Repeats",
    //   plot: "rect",
    //   level: "rna",
    //   style: {
    //     isExpand: true,
    //     detailZoom: 1_000_000,
    //     color: "#e74c3c", // Red color for LINE repeats
    //   },
    //   group: {
    //     name: "Repeats Annotation",
    //     style: {
    //       color: "#00ab5d",
    //     },
    //   },
    //   data: {
    //     method: "remote",
    //     format: "bed",
    //     url: "https://data.rbrowser.org/datahub/reference/results/Mus_musculus/GRCm38/build/repeats.sorted.bed.gz",
    //     index:
    //       "https://data.rbrowser.org/datahub/reference/results/Mus_musculus/GRCm38/build/repeats.sorted.bed.gz.tbi",
    //   },
    //   order: 1,
    // },
  ],
};
