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
      gene_name: "VAMP3",
      gene_id: "ENSG00000049245",
      trans_name: "VAMP3-201",
      trans_id: "ENST00000054666",
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
      name: "Homo sapiens",
      label: "Human",
      taxonId: 9606,
    },
    assembly: {
      name: "GRCh38",
      build: "hg38",
      version: "GENCODE v44",
    },
    transcriptome: {
      api: "https://api.rbrowser.org/api/v1/rna/hg38",
      fasta: {
        url: "https://data.rbrowser.org/datahub/reference/results/Homo_sapiens/GRCh38/transcriptome.derived.fa.gz",
        fai: "https://data.rbrowser.org/datahub/reference/results/Homo_sapiens/GRCh38/transcriptome.derived.fa.gz.fai",
        gzi: "https://data.rbrowser.org/datahub/reference/results/Homo_sapiens/GRCh38/transcriptome.derived.fa.gz.gzi",
      },
      annotation: {
        // transcripts:
        //   "https://data.rbrowser.org/datahub/reference/GRCh38.annotation.rba",
        url: "https://data.rbrowser.org/datahub/reference/results/Homo_sapiens/GRCh38/annotation.sorted.gff3.gz",
        index:
          "https://data.rbrowser.org/datahub/reference/results/Homo_sapiens/GRCh38/annotation.sorted.gff3.gz.tbi",
      },
    },
    genome: {
      fasta: {
        url: "https://data.rbrowser.org/datahub/reference/results/Homo_sapiens/GRCh38/genome.fa.gz",
        fai: "https://data.rbrowser.org/datahub/reference/results/Homo_sapiens/GRCh38/genome.fa.gz.fai",
        gzi: "https://data.rbrowser.org/datahub/reference/results/Homo_sapiens/GRCh38/genome.fa.gz.gzi",
      },
      chromSizes: {
        url: "https://data.rbrowser.org/datahub/base_annotation/Homo_sapiens/hg38.chromsizes",
      },
      cytoband: {
        url: "https://data.rbrowser.org/datahub/rna_reference/Homo_sapiens/cytoband/cytoband_hg38.txt.gz",
      },
    },
    defaultLocus: {
      mode: "rna",
      rna: {
        gene_name: "VAMP3",
        gene_id: "ENSG00000049245",
        trans_name: "VAMP3-201",
        trans_id: "ENST00000054666",
        up: 5000,
        down: 5000,
      },
      dna: {
        chr: "chr1",
        start: 7769296,
        end: 7783432,
      },
    },
  },
  channels: [
    // Channel ordering rules:
    // 1. Default to the order in this config file
    // 2. Channels with an `order` value come before those without
    // 3. Smaller `order` values come first
    // Example: order: 1 before order: 2; order: 2 before order: undefined
    {
      name: "Bam (transcriptome)",
      plot: "bam",
      style: {
        height: 160,
        // detailZoom: 10000000,
        coverage: {
          enabled: true,
          // color: "#6b7484",
          color: {
            colormap: "viridis",
            // range: [0, 50],
          },
          alpha: 1,
          height: 0.15,
          plot: "bar", // coverage can also be set individually to bar/heatmap
        },
        readsColor: {
          // plus: "#55efc4",
          // minus: "#ffeaa7",
          plus: "#fab1a0",
          minus: "#81ecec",
          other: "#95a5a6",
        },
        padding: "0.05 0",
        label: {
          color: "#3867d6",
        },
      },
      group: {
        name: "BAM Annotation",
        style: {
          color: "#3867d6",
        },
      },
      data: {
        method: "remote",
        format: "bam",
        url: "https://data.rbrowser.org/datahub/test/SGNex_K562_directRNA_replicate1_run1.bam",
        index:
          "https://data.rbrowser.org/datahub/test/SGNex_K562_directRNA_replicate1_run1.bam.bai",
      },
      order: 1,
    },
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
        detailZoom: 1_000_000,
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
        detailZoom: 1_000_000,
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
      name: "RNA Binding Protein",
      plot: "rect",
      data: {
        method: "remote",
        format: "bigbed",
        url: "https://data.rbrowser.org/datahub/rna_binding_protein/human.bigbed",
      },
      style: {
        detailZoom: 1_000_000,
        color: "#e17055",
        height: 40,
        keys: ["Region", "Strand", "Protein", "Method", "Cell line", "Source"],
        order: ["Region", "Strand", "Protein", "Method", "Cell line", "Source"],
        expand: "Protein",
        sep: "|",
      },
    },
    {
      name: "ISM",
      plot: "motif",
      style: {
        detailZoom: 100_000,
        height: 40,
        padding: "0.05",
        label: {
          color: "#3867d6",
        },
      },
      group: {
        name: "ISM",
        style: {
          color: "#3867d6",
        },
      },
      data: {
        method: "remote",
        format: "ism",
        url: "https://data.rbrowser.org/datahub/ism/ism_result_CL-0000047.v2.ism.gz",
        index:
          "https://data.rbrowser.org/datahub/ism/ism_result_CL-0000047.v2.ism.gz.tbi",
      },
      order: 4,
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
    {
      name: "Transcript Structure",
      plot: "rect",
      group: {
        name: "RNA Annotation",
        style: {
          color: "#3867d6",
        },
      },
      style: {
        height: 40,
        maxHeight: 7,
        padding: "0.1",
        keys: ["featureType"],
        expand: ["featureType"],
        sep: "|",
        foreground: "#a4b0be",
        label: {
          color: "#3867d6",
        },
      },
      data: {
        method: "buildin",
        format: "transcript",
      },
      order: 10,
    },
    {
      name: "Exon Expression (GTEx)",
      plot: "score_rect",
      group: {
        name: "RNA Expression",
        style: {
          color: "#00b894",
        },
      },
      style: {
        height: 40,
        maxHeight: 5,
        keys: ["Tissue"],
        expand: ["Tissue"],
        sep: "|",
        foreground: {
          colormap: "coolwarm",
        },
        label: {
          color: "#00b894",
        },
      },
      data: {
        method: "buildin",
        format: "exon",
      },
      order: 11,
    },
    {
      name: "Junction Expression (GTEx)",
      plot: "score_curve",
      group: {
        name: "RNA Expression",
        style: {
          color: "#00b894",
        },
      },
      style: {
        height: 40,
        maxHeight: 5,
        padding: "0",
        keys: ["Tissue"],
        expand: ["Tissue"],
        sep: "|",
        foreground: {
          colormap: "coolwarm",
        },
        label: {
          color: "#00b894",
        },
      },
      data: {
        method: "buildin",
        format: "junction",
      },
      order: 12,
    },
    {
      // test:chr1:74,236,067-74,236,265
      name: "VCF Variants",
      plot: "variant",
      style: {
        height: 80,
        rowHeight: 0.32,
        rowPadding: 0.08,
        padding: "0.05",
        label: {
          color: "#3867d6",
        },
      },
      group: {
        name: "Variants",
        style: {
          color: "#3867d6",
        },
      },
      data: {
        method: "remote",
        format: "vcf",
        url: "https://data.rbrowser.org/datahub/base_annotation/Homo_sapiens/hg38.clinvar.vcf.gz",
        index:
          "https://data.rbrowser.org/datahub/base_annotation/Homo_sapiens/hg38.clinvar.vcf.gz.tbi",
      },
      order: 4,
    },
    {
      name: "Bam TEST",
      plot: "bam",
      style: {
        height: 160,
        // detailZoom: 10000000,
        coverage: {
          enabled: true,
          // color: "#6b7484",
          color: {
            colormap: "viridis",
            // range: [0, 50],
          },
          alpha: 1,
          height: 0.15,
          plot: "bar", // coverage can also be set individually to bar/heatmap
        },
        readsColor: {
          // plus: "#55efc4",
          // minus: "#ffeaa7",
          plus: "#fab1a0",
          minus: "#81ecec",
          other: "#95a5a6",
        },
        padding: "0.05 0",
        label: {
          color: "#3867d6",
        },
      },
      group: {
        name: "BAM Annotation",
        style: {
          color: "#3867d6",
        },
      },
      data: {
        method: "remote",
        format: "bam",
        url: "https://data.rbrowser.org/datahub/base_annotation/Homo_sapiens/ENCFF827RKM.bam",
        index:
          "https://data.rbrowser.org/datahub/base_annotation/Homo_sapiens/ENCFF827RKM.bam.bai",
      },
      order: 3,
    },

    {
      name: "m6A Modification",
      // plot: "rect",
      plot: "diamond",
      group: {
        name: "RNA Modification",
        style: {
          color: "#f58518",
        },
      },
      data: {
        method: "remote",
        format: "bigbed",
        url: "https://data.rbrowser.org/datahub/rna_modification/GRCh38/bigbed/curated_merge/rna_modification_m6A_single_base.v2.bigBed",
      },
      style: {
        keys: [
          "Region",
          "Strand",
          "Modification",
          "Method",
          "Biosample",
          "Source",
        ],
        order: [
          "Region",
          "Strand",
          "Modification",
          "Method",
          "Biosample",
          "Source",
        ],
        expand: ["Biosample", "Method"],
        maxHeight: 5,
        sep: "|",
        size: 0.4,
        foreground: {
          alpha: 0.9,
        },
      },
      order: 0,
    },
    {
      name: "broadPeak (test)",
      plot: "rect",
      group: {
        name: "broadPeak",
        style: {
          color: "#54a24b",
        },
      },
      data: {
        method: "remote",
        format: "bed",
        url: "https://data.rbrowser.org/datahub/test/WT_R1.macs2_peaks.broadPeak",
      },
      filter: "",
      order: 1,
    },
    // {
    //   name: "narrowPeak (test)",
    //   plot: "rect",
    //   group: {
    //     name: "narrowPeak",
    //     style: {
    //       color: "#54a24b",
    //     },
    //   },
    //   data: {
    //     method: "remote",
    //     format: "bed",
    //     url: "https://data.rbrowser.org/datahub/test/WT_R1.macs2_peaks.narrowPeak",
    //   },
    //   filter: "",
    //   order: 1,
    // },
    // {
    //   name: "bed file (test)",
    //   plot: "rect",
    //   group: {
    //     name: "bed",
    //     style: {
    //       color: "#54a24b",
    //     },
    //   },
    //   data: {
    //     method: "remote",
    //     format: "bed",
    //     // url: "https://data.rbrowser.org/datahub/test/GSM1003590.clusters.2.0.GRCh38.96.sorted.bed",
    //     url: "https://data.rbrowser.org/datahub/test/test.sorted.bed",
    //     // url: "https://data.rbrowser.org/datahub/test/GSM1003590.clusters.2.0.GRCh38.96.sorted.bed.gz",
    //   },
    //   filter: "",
    //   order: 1,
    // },
    {
      name: "bedgz file (test)",
      plot: "rect",
      group: {
        name: "bed",
        style: {
          color: "#54a24b",
        },
      },
      data: {
        method: "remote",
        format: "bed",
        url: "https://data.rbrowser.org/datahub/test/test.sorted.bed.gz",
        index: "https://data.rbrowser.org/datahub/test/test.sorted.bed.gz.tbi",
      },
      filter: "",
      order: 1,
    },
    // {
    //   name: "bedGraph file (test)",
    //   plot: "rect",
    //   group: {
    //     name: "bedGraph",
    //     style: {
    //       color: "#54a24b",
    //     },
    //   },
    //   data: {
    //     method: "remote",
    //     format: "bed",
    //     url: "https://data.rbrowser.org/datahub/test/WT_R1.sorted.bedGraph",
    //   },
    //   filter: "",
    //   order: 1,
    // },
    {
      name: "bigWig ENCODE (test)",
      plot: "bar",
      group: {
        name: "ATAC Annotation",
        style: {
          color: "#54a24b",
        },
      },
      data: {
        method: "remote",
        format: "bigbed",
        // url: "https://www.encodeproject.org/files/ENCFF079CVS/@@download/ENCFF079CVS.bigBed",
        url: "https://www.encodeproject.org/files/ENCFF252GZO/@@download/ENCFF252GZO.bigWig",
      },
      style: {
        sep: "|",
        // padding: "0.2" // use default (rect defaults to 0.2)
      },
      order: 1,
      filter: "",
    },
    {
      name: "Json Data (test)",
      plot: "rect",
      group: {
        name: "Json Data",
        style: {
          color: "#54a24b",
        },
      },
      data: {
        method: "local",
        format: "json",
        content: JSON.stringify([
          {
            chrom: "chr1",
            start: 7774393,
            end: 7777338,
            name: "test_region",
            score: 100,
            strand: "+",
            thickStart: 1200,
            thickEnd: 1800,
            itemRgb: "0",
            blockCount: 3,
            blockSizes: "100,200,150",
            blockStarts: "0,500,850",
          },
        ]),
      },
      order: 1,
    },
    {
      name: "TSV Data (test)",
      plot: "rect",
      group: {
        name: "TSV Data",
        style: {
          color: "#54a24b",
        },
      },
      data: {
        method: "local",
        format: "tsv",
        content:
          "chr1\t7774393\t7775338\ttest_region\t100\t+\t1200\t1800\t0\t3\t100,200,150\t0,500,850",
      },
      order: 1,
    },
    // {
    //   name: "bigBed LRGASP (test)",
    //   plot: "rect",
    //   group: {
    //     name: "DNA Annotation",
    //     style: {
    //       color: "#54a24b",
    //     },
    //   },
    //   data: {
    //     method: "remote",
    //     format: "bigbed",
    //     url: "https://cgl.gi.ucsc.edu/data/LRGASP/hub/hg38/human_H1_mix_R2C2_ONT.bb",
    //   },
    //   style: {
    //     sep: "|",
    //     // padding: "0.2" // use default (rect defaults to 0.2)
    //   },
    //   order: 1,
    //   filter: "",
    // },
    // {
    //   name: "mod BAM (test)",
    //   plot: "bam",
    //   group: {
    //     name: "BAM Annotation",
    //     style: {
    //       color: "#54a24b",
    //     },
    //   },
    //   data: {
    //     method: "remote",
    //     format: "bam",
    //     url: "https://data.rbrowser.org/datahub/test/m6A_DRACH.bam",
    //     index: "https://data.rbrowser.org/datahub/test/m6A_DRACH.bam.bai",
    //   },
    //   filter: "",
    //   order: 1,
    // },
    // {
    //   name: "bigBed TEST",
    //   plot: "rect",
    //   group: {
    //     name: "DNA Annotation",
    //     style: {
    //       color: "#54a24b",
    //     },
    //   },
    //   data: {
    //     method: "remote",
    //     format: "bigbed",
    //     url: "https://data.rbrowser.org/datahub/ccre/all_sim_ccre.bigBed",
    //   },
    //   style: {
    //     keys: ["Element", "Element ID", "ENCODE ID", "Feature"],
    //     expand: "Element", // setting expand disables lazy loading
    //     // foreground: "#747d8c",
    //     // background: "#e8f4f8",
    //     // foreground: ["sky", "yellow", "green", "brown"], // set multiple colors
    //     sep: "|",
    //     padding: "0.2",
    //   },
    //   // order: 2, // Channel display order
    //   // sortable: true, // Can be sorted
    //   filter: "",
    // },
    // {
    //   name: "bigBed TEST2",
    //   plot: "rect",
    //   group: {
    //     name: "DNA Annotation",
    //     style: {
    //       color: "#54a24b",
    //     },
    //   },
    //   data: {
    //     method: "remote",
    //     format: "bigbed",
    //     url: "https://www.encodeproject.org/files/ENCFF079CVS/@@download/ENCFF079CVS.bigBed",
    //   },
    //   style: {
    //     sep: "|",
    //     // padding: "0.2" // use default (rect defaults to 0.2)
    //   },
    //   order: 1,
    //   filter: "",
    // },
    // {
    //   name: "Point bigwig caRNA",
    //   plot: "point",
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
    //     foreground: "#2f3542",
    //     // foreground: {
    //     //   colormap: "viridis",
    //     //   range: [0, 50],
    //     // },
    //     // padding defaults to '0.1 0' (bar plot)
    //   },
    // },
    // {
    //   name: "Line bigwig caRNA",
    //   plot: "line",
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
    //     foreground: "#2f3542",
    //     // foreground: {
    //     //   colormap: "viridis",
    //     //   range: [0, 50],
    //     // },
    //     // padding defaults to '0.1 0' (bar plot)
    //   },
    // },
    {
      name: "Heatmap bigwig caRNA",
      plot: "heatmap",
      group: {
        name: "Expression",
        style: {
          color: "#f6a385",
        },
      },
      data: {
        method: "remote",
        format: "bigwig",
        url: "https://data.rbrowser.org/datahub/merip/caRNA_MeRIP-seq/Input/1..GM18499..caRNA_MeRIP_Input.bw",
        windowingFunction: "mean",
      },
      style: {
        expand: "",
        keys: [],
        sep: "",
        foreground: {
          colormap: "viridis",
          // range: [0, 50],
        },
        // padding defaults to '0.1 0' (bar plot)
      },
    },
    {
      name: "Bar bigWig caRNA",
      plot: "bar",
      group: {
        name: "Expression",
        number: 1,
        stacked: true,
        style: {
          color: "#f6a385",
        },
      },
      data: {
        method: "remote",
        format: "bigwig",
        url: "https://data.rbrowser.org/datahub/merip/caRNA_MeRIP-seq/Input/1..GM18499..caRNA_MeRIP_Input.bw",
        windowingFunction: "mean",
      },
      style: {
        expand: "",
        keys: [],
        sep: "",
        foreground: {
          colormap: "viridis",
          range: [0, 50],
        },
        // padding defaults to '0.1 0' (bar plot)
      },
    },
    {
      name: "bigWig mRNA",
      plot: "bar",
      group: {
        name: "Expression",
        number: 1,
        style: {
          color: "#f6a385",
        },
      },
      data: {
        method: "remote",
        format: "bigwig",
        url: "https://data.rbrowser.org/datahub/merip/mRNA_MeRIP-seq/Input/1..GM18499..mRNA_MeRIP_Input.bw",
        windowingFunction: "mean",
      },
      style: {
        expand: "",
        keys: [],
        sep: "",
        foreground: {
          colormap: "plasma",
          range: [0, 130],
        },
      },
    },
    {
      name: "ICM bigWig",
      plot: "bar",
      group: {
        name: "Expression",
        style: {
          color: "#f6a385",
        },
      },
      data: {
        method: "remote",
        format: "bigwig",
        url: "https://data.rbrowser.org/datahub/variant_effect/ICM_R2.mLb.clN.bigWig",
        windowingFunction: "mean",
      },
      style: {
        expand: "",
        keys: [],
        sep: "",
        foreground: {
          colormap: "plasma",
          range: [0, 130],
        },
      },
    },
    {
      name: "Repeats",
      plot: "rect",
      level: "rna",
      style: {
        isExpand: true,
        detailZoom: 1_000_000,
        color: "#e74c3c", // Red color for LINE repeats
      },
      group: {
        name: "Repeats Annotation",
        style: {
          color: "#00ab5d",
        },
      },
      data: {
        method: "remote",
        format: "bed",
        url: "https://data.rbrowser.org/datahub/rna_reference/Homo_sapiens/bed/repeats.bed.gz",
        index:
          "https://data.rbrowser.org/datahub/rna_reference/Homo_sapiens/bed/repeats.bed.gz.tbi",
      },
      order: 1,
    },
    // {
    //   name: "SINE (Repeats)",
    //   plot: "rect",
    //   level: "rna",
    //   style: {
    //     color: "#3498db", // Blue color for SINE repeats
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
    //     url: "https://data.rbrowser.org/datahub/rna_reference/Homo_sapiens/bed/SINE.bed.gz",
    //     index:
    //       "https://data.rbrowser.org/datahub/rna_reference/Homo_sapiens/bed/SINE.bed.gz.tbi",
    //   },
    // },
    // {
    //   name: "ERROR",
    //   plot: "rect",
    //   level: "rna",
    //   style: {
    //     color: "#3498db", // Blue color for SINE repeats
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
    //     url: "https://data.rbrowser.org/datahub/rna_reference/Homo_sapiens/bed/SINE.bed.gz1",
    //     index:
    //       "https://data.rbrowser.org/datahub/rna_reference/Homo_sapiens/bed/SINE.bed.gz.tbi",
    //   },
    // },
  ],
};
