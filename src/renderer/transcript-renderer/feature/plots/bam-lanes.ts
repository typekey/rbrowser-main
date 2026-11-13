/**
 * Greedy lane assignment for BAM reads.
 *
 * Extracted from feature.ts (was `FeatureRenderer.assignBamLanes`). Pure
 * algorithm with no renderer state, so it lives on its own.
 */

/** A raw BAM read interval with strand (before lane assignment). */
export interface BamReadInput {
  start: number;
  end: number;
  strand: number;
}

/** A BAM read with its assigned lane index. */
export interface BamReadLaned extends BamReadInput {
  lane: number;
}

export function assignBamLanes(
  records: Array<BamReadInput>,
  padding: number = 0,
): {
  reads: Array<BamReadLaned>;
  maxLane: number;
} {
  // Sort by start position for greedy lane assignment
  const sorted = records
    .map((r) => ({ ...r, lane: 0 }))
    .sort((a, b) => a.start - b.start);

  const laneEnds: number[] = [];
  let maxLane = 0;

  for (const read of sorted) {
    let assigned = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] + padding <= read.start) {
        assigned = i;
        break;
      }
    }
    if (assigned === -1) {
      assigned = laneEnds.length;
      laneEnds.push(read.end);
    } else {
      laneEnds[assigned] = read.end;
    }
    read.lane = assigned;
    if (assigned > maxLane) maxLane = assigned;
  }

  return { reads: sorted, maxLane };
}
