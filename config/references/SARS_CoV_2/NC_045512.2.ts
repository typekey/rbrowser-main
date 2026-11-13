/*
 * @Author: Zheng Lei
 * @Email: baimoc@163.com
 * @Date: 2026-06-09 02:45:49
 * @LastEditTime: 2026-06-09 12:22:18
 * @FilePath: \baimoc-browser\rbrowser\config\references\SARS_CoV_2\NC_045512.2.ts
 */
/*
 * Species: SARS-CoV-2
 * Build:   NC_045512.2
 */
import type { IReferenceConfig } from "@rbrowser/main";

export const NC_045512_2Reference: IReferenceConfig = {
  species: {
    name: "Severe acute respiratory syndrome coronavirus 2",
    label: "SARS-CoV-2",
    taxonId: 2697049,
    icon: "https://data.rbrowser.org/datahub/reference/images/SARS_CoV_2.png",
  },
  assembly: { 
    name: "NC_045512.2",
    build: "NC_045512.2",
  },
  transcriptome: {
    annotation: {
      transcripts:
        "https://data.rbrowser.org/datahub/reference/SARS_CoV_2/NC_045512.2/annotation.rbi",
      url: "https://data.rbrowser.org/datahub/reference/SARS_CoV_2/NC_045512.2/NC_045512.2.annotation.sorted.gff3.gz",
      index:
        "https://data.rbrowser.org/datahub/reference/SARS_CoV_2/NC_045512.2/NC_045512.2.annotation.sorted.gff3.gz.tbi",
    },
  },
  genome: {
    fasta: {
      url: "https://data.rbrowser.org/datahub/reference/SARS_CoV_2/NC_045512.2/NC_045512.2.genome.fa.gz",
      fai: "https://data.rbrowser.org/datahub/reference/SARS_CoV_2/NC_045512.2/NC_045512.2.genome.fa.gz.fai",
      gzi: "https://data.rbrowser.org/datahub/reference/SARS_CoV_2/NC_045512.2/NC_045512.2.genome.fa.gz.gzi",
    },
    chromSizes: {
      url: "https://data.rbrowser.org/datahub/reference/SARS_CoV_2/NC_045512.2/NC_045512.2.chrom.sizes",
    },
  },
};
