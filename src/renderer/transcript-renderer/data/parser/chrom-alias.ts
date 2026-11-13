/**
 * Chromosome-name alias helpers.
 *
 * Different reference genomes / data providers use different conventions:
 *   - UCSC-style:    "chr1", "chrX", "chrM"
 *   - Ensembl/NCBI:  "1",    "X",    "MT"
 *
 * When the caller queries with one convention but the underlying file
 * uses the other, the query returns 0 records and the channel renders
 * empty. To make the browser tolerant of this, every data-fetch call
 * site is routed through these helpers, which try every plausible
 * spelling of a chromosome until one returns data (or all fail).
 *
 * NOTE: aliases are tried in priority order — the caller's original
 * spelling is always tried first, so this adds no latency in the
 * common case where the names already match.
 */

/**
 * Return ordered candidate names for a given chromosome.
 * The original name is always first; duplicates are removed.
 */
export function getChromAliases(chr: string): string[] {
  if (!chr) return [];
  const out: string[] = [chr];
  const add = (name: string) => {
    if (name && !out.includes(name)) out.push(name);
  };

  // Mitochondrial special-cases
  if (chr === "chrM" || chr === "chrMT") {
    add("MT");
    add("M");
    add("chrMT");
    add("chrM");
  } else if (chr === "MT" || chr === "M") {
    add("chrM");
    add("chrMT");
    add("MT");
    add("M");
  }

  // UCSC <-> Ensembl/NCBI prefix toggle
  if (chr.startsWith("chr")) {
    add(chr.slice(3));
  } else {
    add("chr" + chr);
  }

  return out;
}

/**
 * Pick the first alias of `chr` that appears in the supplied list/set
 * of chromosome names. Returns `undefined` when none match.
 */
export function resolveChromFromSet(
  chr: string,
  available: Set<string> | Iterable<string>,
): string | undefined {
  const set = available instanceof Set ? available : new Set<string>(available);
  for (const cand of getChromAliases(chr)) {
    if (set.has(cand)) return cand;
  }
  return undefined;
}

/**
 * Helper for tabix-style `getLines(chr, start, end, onLine)` APIs that
 * don't cheaply expose a list of contigs.
 *
 * Tries each chromosome alias in turn:
 *   - if a call succeeds AND yields at least one line, those lines are
 *     forwarded to `onLine` and we return immediately;
 *   - if a call succeeds but yields zero lines, we keep trying the next
 *     alias (the contig probably doesn't exist under that spelling);
 *   - errors from individual aliases (e.g. "unknown contig") are
 *     swallowed and the next alias is tried;
 *   - if EVERY alias errors and none succeeded, the last error is rethrown.
 *
 * Returns the alias that yielded data, or `undefined` if all aliases
 * produced empty results without errors.
 */
export async function getLinesWithAliases(
  getLines: (
    chr: string,
    start: number,
    end: number,
    onLine: (line: string) => void,
  ) => Promise<unknown>,
  chr: string,
  start: number,
  end: number,
  onLine: (line: string) => void,
): Promise<string | undefined> {
  const aliases = getChromAliases(chr);
  let lastErr: unknown = undefined;
  let anySucceeded = false;

  for (const cand of aliases) {
    const buffer: string[] = [];
    try {
      await getLines(cand, start, end, (line: string) => buffer.push(line));
      anySucceeded = true;
      if (buffer.length > 0) {
        for (const line of buffer) onLine(line);
        return cand;
      }
      // succeeded but empty — try next alias
    } catch (e) {
      lastErr = e;
    }
  }

  if (!anySucceeded && lastErr) throw lastErr;
  return undefined;
}

/**
 * Helper for record-returning APIs such as BAM `getRecordsForRange` or
 * BBI `getFeatures`. Tries each alias and returns the first non-empty
 * result. Behaves like getLinesWithAliases w.r.t. error handling.
 *
 * `T` is the record type returned by `getRecords`.
 */
export async function getRecordsWithAliases<T>(
  getRecords: (chr: string, start: number, end: number) => Promise<T[]>,
  chr: string,
  start: number,
  end: number,
): Promise<T[]> {
  const aliases = getChromAliases(chr);
  let lastErr: unknown = undefined;
  let anySucceeded = false;
  let firstEmpty: T[] | undefined = undefined;

  for (const cand of aliases) {
    try {
      const records = await getRecords(cand, start, end);
      anySucceeded = true;
      if (records && records.length > 0) return records;
      if (firstEmpty === undefined) firstEmpty = records ?? [];
    } catch (e) {
      lastErr = e;
    }
  }

  if (!anySucceeded && lastErr) throw lastErr;
  return firstEmpty ?? [];
}
