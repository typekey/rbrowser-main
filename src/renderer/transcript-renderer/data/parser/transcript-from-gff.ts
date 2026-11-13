import { Parser } from "./index";
import {
  transformGffToTranscripts,
  type TranscriptRecord,
} from "../../transcript/transform";
import type { ITranscriptApiResponse } from "./transcript-from-sqlite";
import { logger } from "../../utils/logger";

/**
 * Strip a leading GFF3 `type:` prefix (Ensembl-style IDs such as
 * `transcript:ENST00000054666` / `gene:ENSG...`) and lower-case. The
 * trailing `.N` is KEPT — for plant annotations (Araport/TAIR) `.N` is the
 * isoform number, not a version, so it must stay for an exact match.
 */
const bareId = (s: string) => s.replace(/^[A-Za-z_]+:/, "").toLowerCase();

/**
 * Like bareId but also drops a trailing `.<digits>` suffix — used as
 * a version-tolerant fallback for Ensembl vertebrate IDs (`ENST...\.6`).
 */
const normId = (s: string) => bareId(s).replace(/\.\d+$/, "");

export async function loadTranscriptFromGff(
  gffUrl: string,
  gffIndex: string | undefined,
  name: string,
  region: { chrom: string; start: number; end: number },
): Promise<ITranscriptApiResponse | null> {
  let parser: Parser;
  try {
    // Route through the Parser facade (not AnnotationParser directly) so that
    // GTF (`.gtf.gz`) references — e.g. ce11, dm3, GRCz10 — are parsed by the
    // GTF-aware parser instead of `@gmod/gff`, which would otherwise yield
    // features with empty attributes (no transcript id/name) and resolve no
    // transcript structure. Both parsers emit the same hierarchical shape, so
    // `transformGffToTranscripts` works for GTF and GFF3 alike.
    parser = new Parser({
      type: "gff",
      method: "remote",
      file: gffUrl,
      index: gffIndex,
    });
  } catch {
    return null;
  }

  let features: any[] = [];
  try {
    features = await parser.recordsParser({
      chr: region.chrom,
      start: Math.max(0, region.start),
      end: region.end,
    });
  } catch {
    return null;
  }
  if (!features || features.length === 0) return null;

  const transcripts = transformGffToTranscripts(features);
  if (transcripts.length === 0) return null;

  const want = (name ?? "").trim();
  let active: TranscriptRecord | undefined;
  if (want) {
    const wantBare = bareId(want);
    const wantNorm = normId(want);
    // 1. Exact match (prefix-stripped, isoform/version preserved).
    active = transcripts.find(
      (t) =>
        bareId(t.transcriptId) === wantBare ||
        bareId(t.transcriptName) === wantBare ||
        bareId(t.geneName) === wantBare,
    );
    // 2. Version-tolerant fallback (Ensembl vertebrate `.version`).
    if (!active) {
      active = transcripts.find(
        (t) =>
          normId(t.transcriptId) === wantNorm ||
          normId(t.transcriptName) === wantNorm ||
          normId(t.geneName) === wantNorm,
      );
    }
    // A name was requested but not found in the queried window. Do NOT
    // substitute a neighbouring transcript — the rendered transcript must be
    // deterministic and traceable to the requested id. Fail explicitly so the
    // caller surfaces "no record" rather than silently showing the wrong gene
    // (e.g. CAMTA1 pulled in by VAMP3's padded flank).
    if (!active) {
      logger.warn(
        `[loadTranscriptFromGff] no transcript matching "${name}" in ${region.chrom}:${region.start}-${region.end}`,
      );
      return null;
    }
  } else {
    // No name supplied: pick the left-most transcript in the window.
    active = transcripts[0];
  }
  if (!active) return null;

  return recordToApiShape(active, region.chrom);
}

/**
 * Convert a TranscriptRecord (0-based half-open parts) into the
 * transcript-API response shape. Mirrors the coordinate contract the
 * downstream parsers expect:
 *   • exon / 5'UTR / 3'UTR positions → 1-based closed
 *   • CDS positions                  → 0-based half-open
 */
function recordToApiShape(
  tx: TranscriptRecord,
  chrom: string,
): ITranscriptApiResponse {
  const exonPos: number[] = [];
  const cdsPos: number[] = [];
  const utr5Pos: number[] = [];
  const utr3Pos: number[] = [];

  for (const p of tx.parts) {
    switch (p.type) {
      case "exon":
        // 0-based half-open → 1-based closed
        exonPos.push(p.start + 1, p.end);
        break;
      case "CDS":
        // keep 0-based half-open
        cdsPos.push(p.start, p.end);
        break;
      case "five_prime_UTR":
        utr5Pos.push(p.start + 1, p.end);
        break;
      case "three_prime_UTR":
        utr3Pos.push(p.start + 1, p.end);
        break;
      default:
        break;
    }
  }

  return {
    status: 1,
    results: {
      region: {
        chrom,
        // TranscriptRecord txStart is 0-based half-open → 1-based inclusive
        start: tx.txStart + 1,
        end: tx.txEnd,
        strand: tx.strand || "+",
        gene_id: "",
        gene_name: tx.geneName ?? "",
        trans_id: tx.transcriptId ?? "",
        trans_name: tx.transcriptName ?? tx.transcriptId ?? "",
        trans_type: tx.transcriptType ?? "",
      },
      base: {
        exon: { position: exonPos },
        CDS: { position: cdsPos },
        five_prime_UTR: { position: utr5Pos },
        three_prime_UTR: { position: utr3Pos },
      },
    },
  };
}
