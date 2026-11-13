import { hasTssInterval, parseTssRegion } from "../utils/tss-region";
import type { ILocus, ViewMode } from "../config/config";

export function locusKey(locus: ILocus): string {
  const assembly = locus.dna.assembly || locus.rna.assembly || "";
  if (locus.mode === "dna") {
    return `${assembly}|dna|${locus.dna.chr}:${locus.dna.start}-${locus.dna.end}`;
  }
  if (hasTssInterval(locus.rna)) return `${assembly}|${locus.mode}|tss|${locusToRegionString(locus)}`;
  const txKey =
    locus.rna.trans_name ??
    locus.rna.trans_id ??
    locus.rna.gene_name ??
    locus.rna.gene_id ??
    "";
  const up = locus.rna.up ?? 5000;
  const down = locus.rna.down ?? 5000;
  return `${assembly}|${locus.mode}|${txKey}:${up}:${down}`;
}

export function locusToRegionString(locus: ILocus): string {
  if (locus.mode === "dna") {
    const { chr, start, end } = locus.dna;
    if (!chr) return "";
    return `${chr}:${start}-${end}`;
  }
  const txName =
    locus.rna.trans_name ??
    locus.rna.trans_id ??
    locus.rna.gene_name ??
    locus.rna.gene_id;
  if (!txName) return "";
  if (hasTssInterval(locus.rna)) return `${txName}:${locus.rna.tssStart}:${locus.rna.tssEnd}`;
  if (locus.mode === "rna") return txName; // Legacy flanks require transcript lookup before display.
  const up = locus.rna.up ?? 5000;
  const down = locus.rna.down ?? 5000;
  return `${txName}:${up}:${down}`;
}

export function regionStringToLocus(
  region: string,
  opts: {
    assembly?: string;
    /** Set only for current user input; persisted legacy strings retain flank meaning. */
    tss?: boolean;
    /** Override `time` (e.g. preserve legacy timestamps). */
    time?: string;
    /** Override `id`. Defaults to a base36 random id. */
    id?: string;
    /** Override `isFavorite`. Defaults to false. */
    isFavorite?: boolean;
    /** Override `mode`. Defaults to sniffing from the region format. */
    mode?: ViewMode;
  } = {},
): ILocus {
  const assembly = opts.assembly ?? "";
  const id = opts.id ?? Math.random().toString(36).slice(2, 12);
  const time = opts.time ?? new Date().toISOString();
  const isFavorite = opts.isFavorite ?? false;

  // "chr:start-end" form
  const dnaMatch = region.match(/^([\w.]+):(\d+)-(\d+)$/);
  if (dnaMatch) {
    return {
      id,
      time,
      isFavorite,
      mode: opts.mode ?? "dna",
      dna: {
        chr: dnaMatch[1],
        start: parseInt(dnaMatch[2], 10),
        end: parseInt(dnaMatch[3], 10),
        assembly,
      },
      rna: { assembly },
    };
  }

  if (opts.tss) {
    const interval = parseTssRegion(region);
    if (interval) return {
      id, time, isFavorite, mode: opts.mode ?? "rna",
      rna: { trans_name: interval.name, tssStart: interval.start, tssEnd: interval.end, assembly },
      dna: { chr: "", start: 0, end: 0, assembly },
    };
  }
  // "NAME:up:down" form
  const rnaSplit = region.match(/^([\w][\w.-]*):(\d+):(\d+)$/);
  if (rnaSplit) {
    return {
      id,
      time,
      isFavorite,
      mode: opts.mode ?? "rna",
      rna: {
        trans_name: rnaSplit[1],
        up: parseInt(rnaSplit[2], 10),
        down: parseInt(rnaSplit[3], 10),
        assembly,
      },
      dna: { chr: "", start: 0, end: 0, assembly },
    };
  }

  // "NAME:flank" form — same flank on both sides
  const rnaSingle = region.match(/^([\w][\w.-]*):(\d+)$/);
  if (rnaSingle) {
    const flank = parseInt(rnaSingle[2], 10);
    return {
      id,
      time,
      isFavorite,
      mode: opts.mode ?? "rna",
      rna: {
        trans_name: rnaSingle[1],
        up: flank,
        down: flank,
        assembly,
      },
      dna: { chr: "", start: 0, end: 0, assembly },
    };
  }

  return {
    id,
    time,
    isFavorite,
    mode: opts.mode ?? "dna",
    dna: { chr: "", start: 0, end: 0, assembly },
    rna: { assembly },
  };
}
