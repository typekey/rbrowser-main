import { FeatureParser, IFeatureParserOpts } from "./base";
import { IFetchOpts } from "./type";
import { getChromAliases, resolveChromFromSet } from "./chrom-alias";

export class BigwigParser extends FeatureParser {
  featureData: any;

  /** Cached chromosome name set from the file header (lazy-loaded). */
  private _chrNames: Set<string> | null = null;
  private _chrNamesPromise: Promise<Set<string>> | null = null;

  constructor(opts: IFeatureParserOpts) {
    super(opts);
    this.featureData = this.getBigWigData();
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
          // Fallback: empty set — will use the simple heuristic
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
      // Header unavailable — fall back to first plausible alias.
      return getChromAliases(chr)[0] ?? chr;
    }
    return resolveChromFromSet(chr, names) ?? chr;
  }

  recordsParser = async (opts: IFetchOpts) => {
    const { chr, start, end, scale } = opts;
    const _scale = scale ?? 1;
    const currentChr = await this._resolveChr(chr);
    try {
      return await this.featureData.getFeatures(currentChr, start, end, {
        scale: _scale,
      });
    } catch (e: any) {
      throw new Error(e?.message ?? e);
    }
  };

  recordsStreamParser = async (opts: IFetchOpts) => {
    const { chr, start, end, scale } = opts;
    const _scale = scale ?? 1;
    const currentChr = await this._resolveChr(chr);
    try {
      return await this.featureData.getFeatureStream(currentChr, start, end, {
        scale: _scale,
      });
    } catch (e: any) {
      throw new Error(e?.message ?? e);
    }
  };

  getHeader = async () => this.featureData.getHeader();
}
