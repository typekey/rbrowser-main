import { describe, it, expect } from "vitest";
import { transformGffToTranscripts } from "../../transcript/transform";
import gff from "@gmod/gff";

describe("transformGffToTranscripts", () => {
  it("handles eukaryotic gene → mRNA → exon/CDS hierarchy (regression)", () => {
    const content = `##gff-version 3
chr1\tEnsembl\tgene\t1000\t5000\t.\t+\t.\tID=gene-A;Name=GeneA;gene_name=GeneA
chr1\tEnsembl\tmRNA\t1000\t5000\t.\t+\t.\tID=tx-A;Parent=gene-A;transcript_id=tx-A;transcript_name=GeneA-201;transcript_type=protein_coding
chr1\tEnsembl\texon\t1000\t1500\t.\t+\t.\tID=exon-1;Parent=tx-A
chr1\tEnsembl\texon\t2000\t2500\t.\t+\t.\tID=exon-2;Parent=tx-A
chr1\tEnsembl\tCDS\t1100\t1500\t.\t+\t0\tID=cds-A;Parent=tx-A
chr1\tEnsembl\tCDS\t2000\t2300\t.\t+\t0\tID=cds-A;Parent=tx-A
`;
    const parsed = gff.parseStringSync(content);
    const txs = transformGffToTranscripts(parsed);
    expect(txs).toHaveLength(1);
    expect(txs[0].transcriptId).toBe("tx-A");
    expect(txs[0].transcriptName).toBe("GeneA-201");
    expect(txs[0].geneName).toBe("GeneA");
    expect(txs[0].txStart).toBe(999);
    expect(txs[0].txEnd).toBe(5000);
    const exonCount = txs[0].parts.filter((p) => p.type === "exon").length;
    const cdsCount = txs[0].parts.filter((p) => p.type === "CDS").length;
    expect(exonCount).toBe(2);
    expect(cdsCount).toBe(2);
  });

  it("synthesises an implicit transcript when gene has direct CDS children (SARS-CoV-2 case)", () => {
    // Mirrors the actual NCBI RefSeq GFF for NC_045512.2: gene → CDS directly
    // with no mRNA / transcript wrapper. Without synthesis, transcripts is [].
    const content = `##gff-version 3
NC_045512.2\tRefSeq\tgene\t266\t21555\t.\t+\t.\tID=gene-GU280_gp01;Name=ORF1ab;gene=ORF1ab;gene_biotype=protein_coding;locus_tag=GU280_gp01
NC_045512.2\tRefSeq\tCDS\t266\t13468\t.\t+\t0\tID=cds-YP_009724389.1;Parent=gene-GU280_gp01;Name=YP_009724389.1
NC_045512.2\tRefSeq\tCDS\t13468\t21555\t.\t+\t0\tID=cds-YP_009724389.1;Parent=gene-GU280_gp01;Name=YP_009724389.1
NC_045512.2\tRefSeq\tCDS\t266\t13483\t.\t+\t0\tID=cds-YP_009725295.1;Parent=gene-GU280_gp01;Name=YP_009725295.1
NC_045512.2\tRefSeq\tgene\t21563\t25384\t.\t+\t.\tID=gene-GU280_gp02;Name=S;gene=S;gene_biotype=protein_coding
NC_045512.2\tRefSeq\tCDS\t21563\t25384\t.\t+\t0\tID=cds-YP_009724390.1;Parent=gene-GU280_gp02;Name=YP_009724390.1
`;
    const parsed = gff.parseStringSync(content);
    const txs = transformGffToTranscripts(parsed);

    expect(txs).toHaveLength(2);

    const orf1ab = txs.find((t) => t.geneName === "ORF1ab");
    expect(orf1ab).toBeDefined();
    expect(orf1ab!.txStart).toBe(265);
    expect(orf1ab!.txEnd).toBe(21555);
    expect(orf1ab!.strand).toBe("+");
    // All 3 CDS segments should be preserved as parts (one per GFF row,
    // including the two ribosomal-slippage segments and the alternative pp1a)
    const orf1abCds = orf1ab!.parts.filter((p) => p.type === "CDS");
    expect(orf1abCds).toHaveLength(3);

    const s = txs.find((t) => t.geneName === "S");
    expect(s).toBeDefined();
    expect(s!.txStart).toBe(21562);
    expect(s!.txEnd).toBe(25384);
    expect(s!.parts.filter((p) => p.type === "CDS")).toHaveLength(1);
  });

  it("does not synthesise a transcript when gene already has an mRNA child", () => {
    // gene-A has an mRNA wrapper; gene-B is bare (direct CDS). The fix must
    // produce ONE transcript per gene — not duplicate the mRNA-backed one.
    const content = `##gff-version 3
chr1\tMixed\tgene\t100\t900\t.\t+\t.\tID=gene-A;Name=GeneA
chr1\tMixed\tmRNA\t100\t900\t.\t+\t.\tID=tx-A;Parent=gene-A;transcript_id=tx-A
chr1\tMixed\tCDS\t150\t800\t.\t+\t0\tID=cds-A;Parent=tx-A
chr1\tMixed\tgene\t2000\t3000\t.\t+\t.\tID=gene-B;Name=GeneB
chr1\tMixed\tCDS\t2000\t3000\t.\t+\t0\tID=cds-B;Parent=gene-B
`;
    const parsed = gff.parseStringSync(content);
    const txs = transformGffToTranscripts(parsed);
    expect(txs).toHaveLength(2);
    expect(txs.find((t) => t.transcriptId === "tx-A")).toBeDefined();
    expect(txs.find((t) => t.geneName === "GeneB")).toBeDefined();
  });

  it("skips genes with no renderable children", () => {
    // gene with no CDS/exon/UTR children should NOT be synthesised
    // (we only synthesise when there's structure worth rendering).
    const content = `##gff-version 3
chr1\tRefSeq\tgene\t1000\t2000\t.\t+\t.\tID=gene-empty;Name=Empty
`;
    const parsed = gff.parseStringSync(content);
    const txs = transformGffToTranscripts(parsed);
    expect(txs).toHaveLength(0);
  });

  it("uses gene Name / locus_tag as transcript identifiers for synthesised entries", () => {
    const content = `##gff-version 3
NC_045512.2\tRefSeq\tgene\t266\t21555\t.\t+\t.\tID=gene-GU280_gp01;Name=ORF1ab;gene=ORF1ab;locus_tag=GU280_gp01
NC_045512.2\tRefSeq\tCDS\t266\t13468\t.\t+\t0\tID=cds-X;Parent=gene-GU280_gp01
`;
    const parsed = gff.parseStringSync(content);
    const txs = transformGffToTranscripts(parsed);
    expect(txs).toHaveLength(1);
    // Both gene-name search ("ORF1ab") and gene-id search ("gene-GU280_gp01")
    // need to resolve, so the synthesised transcript should expose the
    // gene name as transcriptName and the gene id as transcriptId.
    expect(txs[0].transcriptId).toBe("gene-GU280_gp01");
    expect(txs[0].transcriptName).toBe("ORF1ab");
    expect(txs[0].geneName).toBe("ORF1ab");
  });
});
