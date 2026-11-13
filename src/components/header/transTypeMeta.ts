/** Transcript-type metadata (badge colour + 2-letter abbreviation). */
export const TRANS_TYPE_META: Record<string, { color: string; label: string }> =
  {
    protein_coding: { color: "#3b4cc0", label: "PC" },
    lncRNA: { color: "#de614b", label: "LN" },
    retained_intron: { color: "#f6a385", label: "RI" },
    protein_coding_CDS_not_defined: { color: "#668dd8", label: "P?" },
    nonsense_mediated_decay: { color: "#9bc7e5", label: "NM" },
    processed_pseudogene: { color: "#b40426", label: "PP" },
    unprocessed_pseudogene: { color: "#a855f7", label: "UP" },
    misc_RNA: { color: "#2db7a3", label: "MS" },
    snRNA: { color: "#6cc04a", label: "SN" },
    miRNA: { color: "#00bcd4", label: "MI" },
    processed_transcript: { color: "#c4a000", label: "PT" },
    TEC: { color: "#7b68ee", label: "TE" },
    transcribed_unprocessed_pseudogene: { color: "#8a2be2", label: "TU" },
    snoRNA: { color: "#00bfa5", label: "SO" },
    transcribed_processed_pseudogene: { color: "#9c27b0", label: "TP" },
  };
