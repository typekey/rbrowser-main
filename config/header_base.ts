import { IChannel } from "@/renderer/transcript-renderer/channel";

export const headerBase: IChannel[] = [
  {
    name: "Single molecule modifications",
    plot: "transcript",
    pin: true,
    style: {
      height: 100,
      label: {
        color: "#3867d6",
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
  },
  {
    name: "Transcript",
    plot: "rect",
    style: {
      label: {
        color: "#3867d6",
      },
    },
    level: "rna",
    group: {
      name: "RNA Annotation",
      style: {
        color: "#3867d6",
      },
    },
    data: {
      method: "built-in",
      format: "rna",
      url: "rna",
      retain: true,
    },
    annotation: {
      expand: "Element",
      keys: ["Element"],
      sep: "|",
    },
  },
  {
    name: "All Exon of Gene",
    level: "rna",
    plot: "rect",
    style: {
      label: {
        color: "#3867d6",
      },
    },
    group: {
      name: "RNA Annotation",
      style: {
        color: "#3867d6",
      },
    },
    data: {
      method: "built-in",
      format: "exon_expression",
      url: "exon_expression",
      retain: true,
    },
    annotation: {
      expand: "Element",
      keys: ["Element"],
      sep: "|",
    },
  },
  {
    name: "Junction Curve",
    level: "rna",
    plot: "curve",
    style: {
      label: {
        color: "#3867d6",
      },
    },
    group: {
      name: "RNA Annotation",
      style: {
        color: "#3867d6",
      },
    },
    data: {
      method: "built-in",
      format: "junction_expression",
      url: "junction_expression",
    },
    annotation: {
      expand: "Element",
      keys: ["Element"],
      sep: "|",
    },
  },
  // {
  //   name: 'Junction Layer',
  //   level: 'rna',
  //   plot: 'layer',
  //   style: {
  //     label: {
  //       color: '#3867d6'
  //     }
  //   },
  //   group: {
  //     name: 'RNA Annotation',
  //     style: {
  //       color: '#3867d6'
  //     }
  //   },
  //   data: {
  //     method: 'built-in',
  //     format: 'junction_expression',
  //     url: 'junction_expression'
  //   },
  //   annotation: {
  //     expand: 'Element',
  //     keys: ['Element'],
  //     sep: '|'
  //   }
  // },
  {
    name: "CCRE",
    plot: "rect",
    group: {
      name: "DNA Annotation",
      style: {
        color: "#54a24b",
      },
    },
    data: {
      method: "remote",
      format: "bigbed",
      url: "https://data.rbrowser.org/datahub/ccre/all_sim_ccre.bigBed",
    },
    annotation: {
      keys: ["Element", "Element ID", "ENCODE ID", "Feature"],
      expand: "Element", // setting expand disables lazy loading
      // colors: 'yellow', // set a single color
      // colors: 'coolwarm', // set a colormap: coolwarm, Spectral, magma, flare, rocket, viridis
      // colors: ['sky', 'yellow', 'green', 'brown'], // set multiple colors
      colors: {
        custom: {
          CTCF: "purple",
          "Distal Enhancer like": "brown",
          "Proximal Enhancer like": "yellow",
          "Promoter like": "green",
          "Chromatin Accessible": "sky",
        },
      }, // color map for the different elements of the expanded item
      sep: "|",
    },
    filter: "",
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
  },
  {
    name: "narrowPeak (test)",
    plot: "rect",
    group: {
      name: "narrowPeak",
      style: {
        color: "#54a24b",
      },
    },
    data: {
      method: "remote",
      format: "bed",
      url: "https://data.rbrowser.org/datahub/test/WT_R1.macs2_peaks.narrowPeak",
    },
    filter: "",
  },
  {
    name: "bed file (test)",
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
      url: "https://data.rbrowser.org/datahub/test/GSM1003590.clusters.2.0.GRCh38.96.sorted.bed",
    },
    filter: "",
  },
];
