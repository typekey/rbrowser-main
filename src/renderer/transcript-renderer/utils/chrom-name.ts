export function chromNameCandidates(chr: string): string[] {
  const out: string[] = [chr];
  const hasChr = /^chr/i.test(chr);
  const bare = hasChr ? chr.replace(/^chr/i, "") : chr;

  // "chr" prefix toggle.
  out.push(hasChr ? bare : `chr${chr}`);

  // Mitochondrial alias: UCSC "M" ↔ Ensembl/RNAcentral "MT", in both bare
  // and "chr"-prefixed forms.
  if (/^(M|MT)$/i.test(bare)) {
    for (const m of ["M", "MT"]) {
      out.push(m, `chr${m}`);
    }
  }

  return [...new Set(out)];
}

/**
 * Resolve a chromosome size from the chrom.sizes map, tolerating the spelling
 * differences described above. Returns `undefined` when no spelling matches
 * (e.g. the file hasn't loaded yet, or the chromosome is genuinely absent).
 */
export function resolveChromSize(
  chromSizes: ReadonlyMap<string, number>,
  chr: string,
): number | undefined {
  for (const name of chromNameCandidates(chr)) {
    const size = chromSizes.get(name);
    if (size !== undefined) return size;
  }
  return undefined;
}
