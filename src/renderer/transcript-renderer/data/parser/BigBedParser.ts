import { FeatureParser, IFeatureParserOpts } from "./base";
import { IFetchOpts } from "./type";
import { parseBigBedRest } from "./bed-normalise";
import { getChromAliases, resolveChromFromSet } from "./chrom-alias";
import { logger } from "../../utils/logger";

export class BigBedParser extends FeatureParser {
  featureData: any;

  /** Cached chromosome name set from the file header (lazy-loaded). */
  private _chrNames: Set<string> | null = null;
  private _chrNamesPromise: Promise<Set<string>> | null = null;

  constructor(opts: IFeatureParserOpts) {
    super(opts);
    this.featureData = this.getBigBedData();
  }

  /**
   * Lazily fetch the set of chromosome names present in the file header.
   * Result is cached so the header is only read once.
   */
  private async _getChrNames(): Promise<Set<string>> {
    if (this._chrNames) return this._chrNames;
    if (!this._chrNamesPromise) {
      this._chrNamesPromise = (async () => {
        try {
          const header = await this.featureData.getHeader();
          const names = new Set<string>(
            Object.keys(header?.refsByName ?? header?.chromosomes ?? {}),
          );
          this._chrNames = names;
          return names;
        } catch {
          this._chrNames = new Set();
          return this._chrNames;
        }
      })();
    }
    return this._chrNamesPromise;
  }

  /**
   * Resolve the chromosome name so it matches what the file actually contains.
   * Handles both directions: "chr1" ↔ "1", plus mito aliases (chrM ↔ MT).
   */
  private async _resolveChr(chr: string): Promise<string> {
    const names = await this._getChrNames();
    if (names.size === 0) {
      return getChromAliases(chr)[0] ?? chr;
    }
    return resolveChromFromSet(chr, names) ?? chr;
  }

  recordsParser = async (opts: IFetchOpts) => {
    const { chr, start, end, scale } = opts;
    const _scale = scale ?? 1;
    const currentChr = await this._resolveChr(chr);


    try {
      // Use original scale - no adjustment, let BigBed return full data
      // Merge algorithm at channel level will handle data reduction while preserving density
      const features = await this.featureData.getFeatures(
        currentChr,
        start,
        end,
        {
          scale: _scale,
        },
      );


      // Parse BigBed `rest` string into named BED fields (name, score, strand)
      return (features ?? []).map(parseBigBedRest);
    } catch (e: any) {
      logger.error(`[BigBedParser.recordsParser] Error:`, e);
      throw new Error(e?.message ?? e);
    }
  };

  recordsStreamParser = async (opts: IFetchOpts) => {
    const { chr, start, end, scale } = opts;
    const _scale = scale ?? 1;
    const currentChr = await this._resolveChr(chr);
    try {
      const stream = await this.featureData.getFeatureStream(
        currentChr,
        start,
        end,
        {
          scale: _scale,
        },
      );

      // Wrap the stream to parse BigBed `rest` into named fields
      return (async function* () {
        for await (const chunk of stream) {
          if (Array.isArray(chunk)) {
            yield chunk.map(parseBigBedRest);
          } else {
            yield chunk;
          }
        }
      })();
    } catch (e: any) {
      throw new Error(e?.message ?? e);
    }
  };

  getHeader = async () => this.featureData.getHeader();
}
