import { IndexedFeatureParser, IParserOpts } from "./base";
import { IFetchOpts } from "./type";
import { getChromAliases } from "./chrom-alias";

export class FastaParser extends IndexedFeatureParser {
  indexedData: any;

  constructor(opts: IParserOpts) {
    super(opts);
    // Use BgzipIndexedFasta when a .gzi secondary index is provided,
    // otherwise fall back to plain IndexedFasta.
    if (opts.gindex) {
      this.indexedData = this.getGzFastaIndexedData();
    } else {
      this.indexedData = this.getFastaIndexedData();
    }
  }

  /**
   * Fetch the nucleotide sequence for the given region and return it as
   * an array of per-base feature records compatible with the FeatureRenderer.
   *
   * Each record: { start, end, base, score }
   *   - base  : single character (A / T / C / G / N)
   *   - score : unused (0)
   */
  recordsParser = async (opts: IFetchOpts) => {
    const { chr, start, end } = opts;
    try {
      let sequence: string | undefined;
      let lastErr: unknown = undefined;
      for (const cand of getChromAliases(chr)) {
        try {
          sequence = await this.indexedData.getSequence(cand, start, end);
          if (sequence) break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!sequence) {
        if (lastErr) throw lastErr;
        return [];
      }

      // Convert the raw string into per-base records
      const records: Array<{
        start: number;
        end: number;
        base: string;
        score: number;
      }> = [];

      for (let i = 0; i < sequence.length; i++) {
        records.push({
          start: start + i,
          end: start + i + 1,
          base: sequence[i].toUpperCase(),
          score: 0,
        });
      }

      return records;
    } catch (e: any) {
      throw new Error(e?.message ?? e);
    }
  };

  /** Fetch sequence plus metadata (chromSize, sequence names, all sizes). */
  recordsPlusParser = async (opts: IFetchOpts) => {
    const { chr, start, end } = opts;
    try {
      const seqNames: string[] = await this.indexedData.getSequenceNames();
      // Resolve chr against the FASTA's own sequence list.
      const nameSet = new Set(seqNames);
      let resolved: string | undefined;
      for (const cand of getChromAliases(chr)) {
        if (nameSet.has(cand)) {
          resolved = cand;
          break;
        }
      }
      const queryChr = resolved ?? chr;
      const [sequence, chromSize, allSizes] = await Promise.all([
        this.indexedData.getSequence(queryChr, start, end),
        this.indexedData.getSequenceSize(queryChr),
        this.indexedData.getSequenceSizes(),
      ]);
      return { sequence, chromSize, seqNames, allSizes };
    } catch (e: any) {
      throw new Error(e?.message ?? e);
    }
  };
}
