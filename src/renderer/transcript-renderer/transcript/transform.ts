/** A single renderable element inside a transcript. */
export interface TranscriptPart {
  /** Feature type: "exon" | "CDS" | "five_prime_UTR" | "three_prime_UTR" |
   *                "start_codon" | "stop_codon" | "intron" */
  type: string;
  start: number;
  end: number;
}

/** One transcript ready for rendering. */
export interface TranscriptRecord {
  /** Transcript id (from GFF attributes). */
  transcriptId: string;
  transcriptName: string;
  /** Gene name (parent gene's gene_name attribute). */
  geneName: string;
  /** Strand: "+" | "-" */
  strand: string;
  /** Transcript type (e.g. protein_coding, lncRNA). */
  transcriptType: string;
  /** Overall transcript span start (TSS) and end. */
  txStart: number;
  txEnd: number;
  /** Lane index assigned by the pileup algorithm (0-based). */
  lane: number;
  /** Child parts (exons, CDS, UTRs, codons). */
  parts: TranscriptPart[];
}

// ── Modification types ────────────────────────────────────────────────────
export const MODIFICATION_TYPES = new Set([
  "m6A",
  "m5C",
  "m1A",
  "m7G",
  "pseudoU",
  "m6Am",
  "t6A",
  "modification",
]);

/** A single RNA modification site to render on a transcript. */
export interface ModificationRecord {
  /** Modification type (e.g. "m6A", "m5C") */
  type: string;
  /** Full ID string from GFF (e.g. "m6A:ENST00000054666:7781354") */
  id: string;
  /** Parent transcript ID (e.g. "ENST00000054666") */
  parentId: string;
  /** Transcript-relative position (1-based) */
  transcriptPosition: number;
  genomicStart: number;
  genomicEnd: number;
  /** Number of reads supporting the modification */
  nReads: number;
  probability: number;
  /** k-mer sequence context */
  kmer: string;
  modRatio: number;
  /** Transcript ID (same as parentId for linking) */
  transcriptId: string;
  /** All raw attributes for tooltip display */
  rawAttributes: Record<string, string>;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Safe extraction of GFF attribute (always an array in @gmod/gff). */
function attr(feature: any, key: string): string {
  const val = feature?.attributes?.[key];
  if (Array.isArray(val)) return val[0] ?? "";
  return val ?? "";
}

/** Recognised transcript-level types in GFF3 (second-level children of genes). */
const TRANSCRIPT_TYPES = new Set([
  "mRNA",
  "transcript",
  "lnc_RNA",
  "lncRNA",
  "miRNA",
  "snRNA",
  "snoRNA",
  "rRNA",
  "scRNA",
  "pre_miRNA",
  "SRP_RNA",
  "RNase_P_RNA",
  "RNase_MRP_RNA",
  "telomerase_RNA",
  "vault_RNA",
  "Y_RNA",
  "pseudogenic_transcript",
  "unconfirmed_transcript",
  "NMD_transcript_variant",
  "primary_transcript",
  // GENCODE specific
  "processed_transcript",
  "unprocessed_pseudogene",
  "processed_pseudogene",
  "transcribed_unprocessed_pseudogene",
  "transcribed_processed_pseudogene",
  "translated_processed_pseudogene",
  "translated_unprocessed_pseudogene",
  "unitary_pseudogene",
  "polymorphic_pseudogene",
  "pseudogene",
]);

/** Sub-feature types rendered as transcript parts; anything else is ignored. */
const PART_TYPES = new Set([
  "exon",
  "CDS",
  "five_prime_UTR",
  "three_prime_UTR",
  "start_codon",
  "stop_codon",
]);

const GENE_TYPES = new Set(["gene", "ncRNA_gene"]);

// ── Transform pipeline ───────────────────────────────────────────────────
function collectAllFeatures(gffFeatures: any[]): any[] {
  const all: any[] = [];
  const queue: any[] = [...gffFeatures];

  while (queue.length > 0) {
    const item = queue.pop();
    if (!item) continue;
    if (item.directive) continue; // skip directives

    // An array of variants / feature groups: unwrap into the queue.
    if (Array.isArray(item)) {
      for (const sub of item) queue.push(sub);
      continue;
    }

    if (item.type) {
      all.push(item);
      // Descend into child_features so nested exons/CDS are collected too.
      if (item.child_features && Array.isArray(item.child_features)) {
        for (const cg of item.child_features) queue.push(cg);
      }
    }
  }

  return all;
}

export function transformGffToTranscripts(
  gffFeatures: any[],
): TranscriptRecord[] {
  // ── flatten into individual feature objects ──────────────────
  const allFeatures = collectAllFeatures(gffFeatures);

  // Index features by ID for parent look-up
  const byId = new Map<string, any>();
  for (const f of allFeatures) {
    const id = attr(f, "ID");
    if (id) byId.set(id, f);
  }

  // ── extract transcript records ──────────────────────────────
  const txMap = new Map<string, TranscriptRecord>();

  const genesWithTranscripts = new Set<string>();

  for (const f of allFeatures) {
    if (!TRANSCRIPT_TYPES.has(f.type)) continue;

    const txId =
      attr(f, "transcript_id") || attr(f, "ID") || attr(f, "Name") || "";
    if (!txId) continue;

    // GFF3 uses 1-based closed [start, end].  Convert start to 0-based
    // half-open [start-1, end) to match BED / internal coordinate system.
    const txStart: number = (f.start ?? 1) - 1;
    const txEnd: number = f.end ?? 0;
    if (txEnd <= txStart) continue;

    // Resolve gene name from parent
    const parentId = attr(f, "Parent");
    if (parentId) genesWithTranscripts.add(parentId);
    const parentFeature = parentId ? byId.get(parentId) : undefined;
    const geneName =
      attr(f, "gene_name") ||
      (parentFeature
        ? attr(parentFeature, "gene_name") ||
          attr(parentFeature, "Name") ||
          attr(parentFeature, "ID")
        : "") ||
      attr(f, "Name") ||
      "";

    const txName = attr(f, "transcript_name") || attr(f, "Name") || txId;
    const strand: string = f.strand ?? parentFeature?.strand ?? "+";
    const txType =
      attr(f, "transcript_type") || attr(f, "biotype") || f.type || "";

    // Collect child parts from child_features
    const parts: TranscriptPart[] = [];
    const childFeatures = f.child_features;
    if (childFeatures && Array.isArray(childFeatures)) {
      for (const childGroup of childFeatures) {
        const childArr = Array.isArray(childGroup) ? childGroup : [childGroup];
        for (const child of childArr) {
          if (!child || !child.type) continue;
          if (PART_TYPES.has(child.type)) {
            // GFF3 1-based start → 0-based
            parts.push({
              type: child.type,
              start: (child.start ?? 1) - 1,
              end: child.end ?? 0,
            });
          }
        }
      }
    }

    // ── Deduplicate: merge into existing record if same transcript ID ──
    const existing = txMap.get(txId);
    if (existing) {
      // Extend span if this copy is wider
      if (txStart < existing.txStart) existing.txStart = txStart;
      if (txEnd > existing.txEnd) existing.txEnd = txEnd;
      // Merge parts (avoid exact duplicates)
      for (const p of parts) {
        const dup = existing.parts.some(
          (ep) =>
            ep.type === p.type && ep.start === p.start && ep.end === p.end,
        );
        if (!dup) existing.parts.push(p);
      }
    } else {
      txMap.set(txId, {
        transcriptId: txId,
        transcriptName: txName,
        geneName,
        strand,
        transcriptType: txType,
        txStart,
        txEnd,
        lane: 0,
        parts,
      });
    }
  }

  for (const f of allFeatures) {
    if (!GENE_TYPES.has(f.type)) continue;
    const geneId = attr(f, "ID");
    if (!geneId) continue;
    if (genesWithTranscripts.has(geneId)) continue;

    const txStart: number = (f.start ?? 1) - 1;
    const txEnd: number = f.end ?? 0;
    if (txEnd <= txStart) continue;

    const parts: TranscriptPart[] = [];
    const childFeatures = f.child_features;
    if (childFeatures && Array.isArray(childFeatures)) {
      for (const childGroup of childFeatures) {
        const childArr = Array.isArray(childGroup) ? childGroup : [childGroup];
        for (const child of childArr) {
          if (!child || !child.type) continue;
          if (PART_TYPES.has(child.type)) {
            parts.push({
              type: child.type,
              start: (child.start ?? 1) - 1,
              end: child.end ?? 0,
            });
          }
        }
      }
    }
    // No renderable structure → don't synthesise an empty transcript.
    if (parts.length === 0) continue;

    const geneName =
      attr(f, "gene_name") || attr(f, "Name") || attr(f, "gene") || "";
    const txName = geneName || geneId;
    const strand: string = f.strand ?? "+";
    const txType =
      attr(f, "gene_biotype") || attr(f, "biotype") || f.type || "";

    const existing = txMap.get(geneId);
    if (existing) {
      if (txStart < existing.txStart) existing.txStart = txStart;
      if (txEnd > existing.txEnd) existing.txEnd = txEnd;
      for (const p of parts) {
        const dup = existing.parts.some(
          (ep) =>
            ep.type === p.type && ep.start === p.start && ep.end === p.end,
        );
        if (!dup) existing.parts.push(p);
      }
    } else {
      txMap.set(geneId, {
        transcriptId: geneId,
        transcriptName: txName,
        geneName: geneName || txName,
        strand,
        transcriptType: txType,
        txStart,
        txEnd,
        lane: 0,
        parts,
      });
    }
  }

  // ── sort parts within each transcript, then sort transcripts ─
  const transcripts = Array.from(txMap.values());
  for (const tx of transcripts) {
    tx.parts.sort((a, b) => a.start - b.start);
  }
  transcripts.sort((a, b) => a.txStart - b.txStart || a.txEnd - b.txEnd);

  return transcripts;
}

// ── Pileup layout ────────────────────────────────────────────────────────

export function assignLanes(
  transcripts: TranscriptRecord[],
  padding: number = 200,
): { transcripts: TranscriptRecord[]; maxLane: number } {
  // laneEnds[i] = the rightmost end position currently assigned to lane i
  const laneEnds: number[] = [];
  let maxLane = 0;

  for (const tx of transcripts) {
    let assigned = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] + padding <= tx.txStart) {
        assigned = i;
        break;
      }
    }
    if (assigned === -1) {
      assigned = laneEnds.length;
      laneEnds.push(tx.txEnd);
    } else {
      laneEnds[assigned] = tx.txEnd;
    }
    tx.lane = assigned;
    if (assigned > maxLane) maxLane = assigned;
  }

  return { transcripts, maxLane };
}

// ── Modification extraction ──────────────────────────────────────────────
export function extractModifications(gffFeatures: any[]): ModificationRecord[] {
  const allFeatures = collectAllFeatures(gffFeatures);
  const mods: ModificationRecord[] = [];

  for (const f of allFeatures) {
    if (!f.type || !MODIFICATION_TYPES.has(f.type)) continue;

    const parentId = attr(f, "Parent") || attr(f, "transcript_id") || "";
    if (!parentId) continue;

    const txPos = attr(f, "transcript_position");
    // GFF3 1-based start → 0-based
    const genomicStart: number = (f.start ?? 1) - 1;
    const genomicEnd: number = f.end ?? genomicStart + 1;

    // Build raw attributes map for tooltip
    const rawAttributes: Record<string, string> = {};
    if (f.attributes) {
      for (const [key, val] of Object.entries(f.attributes)) {
        rawAttributes[key] = Array.isArray(val) ? val.join(",") : String(val);
      }
    }

    mods.push({
      type: f.type,
      id: attr(f, "ID") || `${f.type}:${parentId}:${genomicStart}`,
      parentId,
      transcriptPosition: txPos ? parseInt(txPos, 10) : 0,
      genomicStart,
      genomicEnd,
      nReads: parseInt(attr(f, "n_reads") || "0", 10),
      probability: parseFloat(attr(f, "probability_modified") || "0"),
      kmer: attr(f, "kmer") || "",
      modRatio: parseFloat(attr(f, "mod_ratio") || "0"),
      transcriptId: attr(f, "transcript_id") || parentId,
      rawAttributes,
    });
  }

  return mods;
}
