/*
 * @Author: Zheng Lei
 * @Email: baimoc@163.com
 * @Date: 2026-06-15 18:55:23
 * @LastEditTime: 2026-06-23 13:22:21
 * @FilePath: \baimoc-browser\rbrowser\config\references\Mus_musculus\GRCm38.ts
 */
import type { IReferenceConfig } from "@rbrowser/main";

export const GRCm38Reference: IReferenceConfig = {
  species: {
    name: "Mus musculus",
    label: "Mouse",
    taxonId: 10090,
    icon: "https://data.rbrowser.org/datahub/reference/images/Mus_musculus.png",
  },
  assembly: {
    name: "GRCm38",
    build: "mm10",
  },
  transcriptome: {
    api: "https://api.rbrowser.org/api/v1/rna/mm10",
    fasta: {
      url: "https://data.rbrowser.org/datahub/reference/Mus_musculus/GRCm38/GRCm38.transcriptome.derived.fa.gz",
      fai: "https://data.rbrowser.org/datahub/reference/Mus_musculus/GRCm38/GRCm38.transcriptome.derived.fa.gz.fai",
      gzi: "https://data.rbrowser.org/datahub/reference/Mus_musculus/GRCm38/GRCm38.transcriptome.derived.fa.gz.gzi",
    },
    annotation: {
      transcripts:
        "https://data.rbrowser.org/datahub/reference/GRCm38.annotation.rba",
      url: "https://data.rbrowser.org/datahub/reference/Mus_musculus/GRCm38/GRCm38.annotation.sorted.gff3.gz",
      index:
        "https://data.rbrowser.org/datahub/reference/Mus_musculus/GRCm38/GRCm38.annotation.sorted.gff3.gz.tbi",
    },
  },
  genome: {
    fasta: {
      url: "https://data.rbrowser.org/datahub/reference/Mus_musculus/GRCm38/GRCm38.genome.fa.gz",
      fai: "https://data.rbrowser.org/datahub/reference/Mus_musculus/GRCm38/GRCm38.genome.fa.gz.fai",
      gzi: "https://data.rbrowser.org/datahub/reference/Mus_musculus/GRCm38/GRCm38.genome.fa.gz.gzi",
    },
    chromSizes: {
      url: "https://data.rbrowser.org/datahub/reference/Mus_musculus/GRCm38/GRCm38.chrom.sizes",
    },
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
  curated: true,
};
