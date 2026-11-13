import type { IAnnotationReference, IDefaultLocus } from "../config/config";
import { Parser } from "../data/parser";
import { transformGffToTranscripts } from "../transcript/transform";
import type { TranscriptRecord } from "../transcript/transform";

/** Window size (bp) scanned per request when looking for the first transcript. */
const WINDOW = 5_000_000;
/** Maximum number of windows to scan per chromosome before giving up. */
const MAX_WINDOWS = 10;

export async function findFirstTranscriptLocus(
  annotation: IAnnotationReference | undefined,
  flank: { up: number; down: number } = { up: 5000, down: 5000 },
): Promise<IDefaultLocus | null> {
  if (!annotation?.url || !annotation?.index) return null;

  let parser: Parser;
  try {
    parser = new Parser({
      type: "gff",
      method: "remote",
      file: annotation.url,
      index: annotation.index,
    });
  } catch {
    return null;
  }

  let refNames: string[] = [];
  try {
    refNames = await parser.parser.indexedData.getReferenceSequenceNames();
  } catch {
    return null;
  }
  if (!refNames || refNames.length === 0) return null;

  const isPrimaryChrom = (name: string): boolean => {
    const bare = name.replace(/^chr/i, "");
    // 1–2 digit numbers, fly arms (2L/3R), single-letter sex chromosomes,
    // roman numerals (worm I–X), and organelles (M/MT/Mt/Pt).
    return /^([0-9]{1,2}|[0-9]{1,2}[LR]|[WXYZ]|M|MT|Pt|[IVX]{1,4})$/i.test(
      bare,
    );
  };
  const orderedRefNames = [...refNames].sort((a, b) => {
    const ra = isPrimaryChrom(a) ? 0 : 1;
    const rb = isPrimaryChrom(b) ? 0 : 1;
    return ra - rb; // stable: keeps original order within each rank
  });

  const toLocus = (chrom: string, t: TranscriptRecord): IDefaultLocus => ({
    mode: "dna",
    rna: {
      trans_name: t.transcriptName || undefined,
      trans_id: t.transcriptId || undefined,
      gene_name: t.geneName || undefined,
      up: flank.up,
      down: flank.down,
    },
    dna: {
      chr: chrom,
      start: Math.max(0, t.txStart - flank.up),
      end: t.txEnd + flank.down,
    },
  });

  // Remember the very first transcript seen (even if part-less) as a last
  // resort, so a reference made entirely of bare features still resolves.
  let firstSeen: { chrom: string; t: TranscriptRecord } | null = null;

  for (const chrom of orderedRefNames) {
    for (let w = 0; w < MAX_WINDOWS; w++) {
      const start = w * WINDOW;
      const end = start + WINDOW;

      let features: any[] = [];
      try {
        features = await parser.recordsParser({ chr: chrom, start, end });
      } catch {
        break; // unreadable chromosome — move to the next one
      }
      if (!features || features.length === 0) continue;

      // transformGffToTranscripts returns records sorted by txStart.
      const transcripts = transformGffToTranscripts(features);
      if (transcripts.length === 0) continue;

      if (!firstSeen) firstSeen = { chrom, t: transcripts[0] };

      const withCds = transcripts.find((t) =>
        t.parts.some((p) => p.type === "CDS"),
      );
      const withExon = transcripts.find((t) =>
        t.parts.some((p) => p.type === "exon"),
      );
      const pick = withCds ?? withExon;
      if (pick) return toLocus(chrom, pick);
    }
  }

  // No transcript with parts anywhere — fall back to the first feature seen.
  if (firstSeen) return toLocus(firstSeen.chrom, firstSeen.t);

  return null;
}
