export interface TssContext {
  tssPos: number;
  strand: "+" | "-";
}
/** Half-open viewport boundaries relative to TSS=0, in transcription direction. */
export function tssInterval(info: TssContext, domain: { start: number; end: number }) {
  return info.strand === "-"
    ? { start: Math.round(info.tssPos - domain.end), end: Math.round(info.tssPos - domain.start) }
    : { start: Math.round(domain.start - info.tssPos), end: Math.round(domain.end - info.tssPos) };
}
export function tssGenomicInterval(info: TssContext, start: number, end: number) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= end)
    throw new Error("TSS interval requires integer boundaries with start < end.");
  return info.strand === "-"
    ? { start: info.tssPos - end, end: info.tssPos - start }
    : { start: info.tssPos + start, end: info.tssPos + end };
}
export function parseTssRegion(value: string) {
  const match = value.trim().replace(/,/g, "").match(/^([\w][\w.-]*):([+-]?\d+):([+-]?\d+)$/);
  if (!match) return null;
  const start = Number(match[2]), end = Number(match[3]);
  tssGenomicInterval({ tssPos: 0, strand: "+" }, start, end);
  return { name: match[1], start, end };
}
export function hasTssInterval(rna: { tssStart?: number; tssEnd?: number }): rna is { tssStart: number; tssEnd: number } {
  return Number.isSafeInteger(rna.tssStart) && Number.isSafeInteger(rna.tssEnd) && rna.tssStart! < rna.tssEnd!;
}
