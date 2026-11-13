import { IndexedFeatureParser, IParserOpts } from "./base";
import { IFetchOpts } from "./type";
import { getRecordsWithAliases } from "./chrom-alias";

export class BamParser extends IndexedFeatureParser {
  indexedData: any;

  constructor(opts: IParserOpts) {
    super(opts);
    // Lazy: defer file-handle construction (and any "missing index"
    // validation) until the first recordsParser call, so that errors
    // surface inside the async data-loading pipeline where the channel
    // can display a user-friendly message instead of crashing the
    // synchronous `new Parser(...)` call site.
  }

  recordsParser = async (opts: IFetchOpts) => {
    const { chr, start, end } = opts;

    try {
      if (!this.indexedData) {
        this.indexedData = this.getBamIndexedData();
      }
      return await getRecordsWithAliases(
        (c, s, e) => this.indexedData.getRecordsForRange(c, s, e),
        chr,
        start,
        end,
      );
    } catch (e: any) {
      throw new Error(e?.message ?? e);
    }
  };

  /** Lazily build the BAM file handle and ensure its header is parsed. */
  private async ensureIndexedData() {
    if (!this.indexedData) {
      this.indexedData = this.getBamIndexedData();
    }
    await this.indexedData.getHeader();
    return this.indexedData;
  }

  /**
   * Reference sequences declared in the BAM header.
   *
   * For a transcriptome-aligned BAM these are transcript IDs (e.g.
   * `ENST00000456328`) rather than chromosome names; the caller uses this to
   * decide whether to remap reads from transcript-relative to genomic
   * coordinates.
   */
  async getRefInfo(): Promise<Array<{ refName: string; length: number }>> {
    const data = await this.ensureIndexedData();
    return (data.indexToChr ?? []) as Array<{
      refName: string;
      length: number;
    }>;
  }

  /**
   * Fetch records for an exact reference name (no chromosome-alias fallback),
   * used when querying a transcriptome BAM by transcript ID.
   */
  async getRecordsForRef(refName: string, start: number, end: number) {
    const data = await this.ensureIndexedData();
    return await data.getRecordsForRange(refName, start, end);
  }
}
