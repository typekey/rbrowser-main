/*
 * @Author: Zheng Lei
 * @Email: baimoc@163.com
 * @Date: 2026-06-16 16:09:21
 * @LastEditTime: 2026-06-23 14:17:43
 * @FilePath: \baimoc-browser\rbrowser\config\references\Danio_rerio\GRCz11.ts
 */

import type { IReferenceConfig } from "@rbrowser/main";

export const GRCz11Reference: IReferenceConfig = {
  species: {
    name: "Danio rerio",
    label: "Zebrafish",
    taxonId: 7955,
    icon: "https://data.rbrowser.org/datahub/reference/images/Danio_rerio.png",
  },
  assembly: {
    name: "GRCz11",
    build: "danRer11",
  },
  transcriptome: {
    api: "https://api.rbrowser.org/api/v1/rna/danRer11",
    fasta: {
      url: "https://data.rbrowser.org/datahub/reference/Danio_rerio/GRCz11/GRCz11.transcriptome.derived.fa.gz",
      fai: "https://data.rbrowser.org/datahub/reference/Danio_rerio/GRCz11/GRCz11.transcriptome.derived.fa.gz.fai",
      gzi: "https://data.rbrowser.org/datahub/reference/Danio_rerio/GRCz11/GRCz11.transcriptome.derived.fa.gz.gzi",
    },
    annotation: {
      transcripts:
        "https://data.rbrowser.org/datahub/reference/Danio_rerio/GRCz11/annotation.rbi",
      url: "https://data.rbrowser.org/datahub/reference/Danio_rerio/GRCz11/GRCz11.annotation.sorted.gff3.gz",
      index:
        "https://data.rbrowser.org/datahub/reference/Danio_rerio/GRCz11/GRCz11.annotation.sorted.gff3.gz.tbi",
    },
  },
  genome: {
    fasta: {
      url: "https://data.rbrowser.org/datahub/reference/Danio_rerio/GRCz11/GRCz11.genome.fa.gz",
      fai: "https://data.rbrowser.org/datahub/reference/Danio_rerio/GRCz11/GRCz11.genome.fa.gz.fai",
      gzi: "https://data.rbrowser.org/datahub/reference/Danio_rerio/GRCz11/GRCz11.genome.fa.gz.gzi",
    },
    chromSizes: {
      url: "https://data.rbrowser.org/datahub/reference/Danio_rerio/GRCz11/GRCz11.chrom.sizes",
    },
  },
  defaultLocus: {
    mode: "rna",
    rna: {
      gene_name: "nsun2",
      gene_id: "ENSDARG00000056665",
      trans_name: "nsun2-201",
      trans_id: "ENSDART00000134160",
      up: 5000,
      down: 5000,
    },
  },
};
