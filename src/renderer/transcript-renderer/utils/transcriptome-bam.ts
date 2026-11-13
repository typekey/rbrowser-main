import { CDSCoordinateMapper } from "./cds";

export interface GenomicBlock {
  /** 0-based genomic start. */
  start: number;
  /** 0-based half-open genomic end. */
  end: number;
}

export function projectTranscriptIntervalToGenomic(
  mapper: CDSCoordinateMapper,
  txStart: number,
  txEnd: number,
): GenomicBlock[] {
  const exons = mapper.cdsRegions; // sorted ascending by genomic start
  const L = mapper.totalCDSLength;
  if (exons.length === 0 || txEnd <= txStart) return [];

  // Convert transcript coordinates (measured 5'→3') into "exon space" measured
  // from the genomic-leftmost exon.  For a minus-strand transcript the 5' end is
  // the genomic-rightmost base, so the interval is mirrored within [0, L).
  let es: number;
  let ee: number;
  if (mapper.strand === "-") {
    es = L - txEnd;
    ee = L - txStart;
  } else {
    es = txStart;
    ee = txEnd;
  }
  es = Math.max(0, es);
  ee = Math.min(L, ee);
  if (ee <= es) return [];

  const blocks: GenomicBlock[] = [];
  let cum = 0;
  for (const exon of exons) {
    const exonLen = exon.end - exon.start;
    const exonSpaceStart = cum;
    const exonSpaceEnd = cum + exonLen;
    const oStart = Math.max(es, exonSpaceStart);
    const oEnd = Math.min(ee, exonSpaceEnd);
    if (oStart < oEnd) {
      blocks.push({
        start: exon.start + (oStart - exonSpaceStart),
        end: exon.start + (oEnd - exonSpaceStart),
      });
    }
    cum = exonSpaceEnd;
    if (cum >= ee) break;
  }
  return blocks;
}

/** A raw transcriptome read in transcript-relative coordinates. */
export interface RawTranscriptomeRead {
  /** 0-based transcript-relative start. */
  start: number;
  /** 0-based half-open transcript-relative end. */
  end: number;
  /** Read strand on the transcript reference (1 forward, -1 reverse). */
  strand?: number;
  name?: string;
  flags?: number;
  mapq?: number;
  cigar?: string;
  seq?: string;
  qual?: Uint8Array | number[] | string | null;
  tags?: Record<string, unknown>;
}

/**
 * A genomic block of a remapped read, lane-assigned and ready for the BAM
 * renderer.  Each block of a multi-exon read shares the same `lane` so it draws
 * as one stacked read with intron gaps.
 */
export interface RemappedBlockRead {
  start: number;
  end: number;
  strand: number;
  lane: number;
  /** Marks the record as already remapped + lane-assigned. */
  _txRemapped: true;
  readName?: string;
  readLength?: number;
  flags?: number;
  mapq?: number;
  cigar?: string;
  seq?: string;
  qual?: Uint8Array | number[] | string | null;
  tags?: Record<string, unknown>;
}

/**
 * Remap transcriptome reads to genomic coordinates and assign pileup lanes.
 */
export function remapTranscriptomeReads(
  rawReads: RawTranscriptomeRead[],
  mapper: CDSCoordinateMapper,
): { reads: RemappedBlockRead[]; maxLane: number } {
  const projected: Array<{
    read: RawTranscriptomeRead;
    blocks: GenomicBlock[];
    gStart: number;
    gEnd: number;
    genomicStrand: number;
  }> = [];

  for (const read of rawReads) {
    const blocks = projectTranscriptIntervalToGenomic(
      mapper,
      read.start,
      read.end,
    );
    if (blocks.length === 0) continue;
    const gStart = blocks[0].start;
    const gEnd = blocks[blocks.length - 1].end;
    const readStrand = read.strand ?? 1;
    // A minus-strand transcript reverses the read's genomic orientation.
    const genomicStrand = mapper.strand === "-" ? -readStrand : readStrand;
    projected.push({ read, blocks, gStart, gEnd, genomicStrand });
  }

  // Greedy lane assignment on the full genomic span.
  projected.sort((a, b) => a.gStart - b.gStart);
  const laneEnds: number[] = [];
  let maxLane = 0;
  const reads: RemappedBlockRead[] = [];

  for (const p of projected) {
    let assigned = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] <= p.gStart) {
        assigned = i;
        break;
      }
    }
    if (assigned === -1) {
      assigned = laneEnds.length;
      laneEnds.push(p.gEnd);
    } else {
      laneEnds[assigned] = p.gEnd;
    }
    if (assigned > maxLane) maxLane = assigned;

    const readLength = p.read.end - p.read.start;
    for (const b of p.blocks) {
      reads.push({
        start: b.start,
        end: b.end,
        strand: p.genomicStrand,
        lane: assigned,
        _txRemapped: true,
        readName: p.read.name,
        readLength,
        flags: p.read.flags,
        mapq: p.read.mapq,
        cigar: p.read.cigar,
        seq: p.read.seq,
        qual: p.read.qual,
        tags: p.read.tags,
      });
    }
  }

  return { reads, maxLane };
}
