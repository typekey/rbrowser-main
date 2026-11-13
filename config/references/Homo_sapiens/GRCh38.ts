/*
 * @Author: Zheng Lei
 * @Email: baimoc@163.com
 * @Date: 2025-09-24 13:32:51
 * @FilePath: \baimoc-browser\rbrowser\config\references\Homo_sapiens\GRCh38.ts
 */
import type { IReferenceConfig } from "@rbrowser/main";

export const GRCh38Reference: IReferenceConfig = {
  species: {
    name: "Homo sapiens",
    label: "Human",
    taxonId: 9606,
    icon: "https://data.rbrowser.org/datahub/reference/images/Homo_sapiens.png",
  },
  assembly: {
    name: "GRCh38",
    build: "hg38",
    version: "GENCODE v44",
  },
  transcriptome: {
    api: "https://api.rbrowser.org/api/v1/rna/hg38",
    scoreExonJunction: true,
    fasta: {
      url: "https://data.rbrowser.org/datahub/reference/Homo_sapiens/GRCh38/GRCh38.transcriptome.derived.fa.gz",
      fai: "https://data.rbrowser.org/datahub/reference/Homo_sapiens/GRCh38/GRCh38.transcriptome.derived.fa.gz.fai",
      gzi: "https://data.rbrowser.org/datahub/reference/Homo_sapiens/GRCh38/GRCh38.transcriptome.derived.fa.gz.gzi",
    },
    annotation: {
      transcripts:
        "https://data.rbrowser.org/datahub/reference/GRCh38.annotation.rba",
      url: "https://data.rbrowser.org/datahub/reference/Homo_sapiens/GRCh38/GRCh38.annotation.sorted.gff3.gz",
      index:
        "https://data.rbrowser.org/datahub/reference/Homo_sapiens/GRCh38/GRCh38.annotation.sorted.gff3.gz.tbi",
    },
  },
  genome: {
    fasta: {
      url: "https://data.rbrowser.org/datahub/reference/Homo_sapiens/GRCh38/GRCh38.genome.fa.gz",
      fai: "https://data.rbrowser.org/datahub/reference/Homo_sapiens/GRCh38/GRCh38.genome.fa.gz.fai",
      gzi: "https://data.rbrowser.org/datahub/reference/Homo_sapiens/GRCh38/GRCh38.genome.fa.gz.gzi",
    },
    chromSizes: {
      url: "https://data.rbrowser.org/datahub/reference/Homo_sapiens/GRCh38/GRCh38.chrom.sizes",
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
  curated: true,
};
