import { IndexedFeatureParser, IParserOpts } from "./base";
import { IFetchOpts } from "./type";
import BED from "@gmod/bed";
import { normaliseBedRecord } from "./bed-normalise";
import { PlainBedParser } from "./plain-bed";
import { getLinesWithAliases } from "./chrom-alias";

/**
 * BED parser dispatcher.
 *
 *  - If `opts.index` is present (typical `.bed.gz` + `.tbi`), use the Tabix
 *    indexed flow.
 *  - Otherwise treat the file as a plain-text BED-like file (`.bed`,
 *    `.bedGraph`, `.narrowPeak`, `.broadPeak`) and download it in full via
 *    `PlainBedParser`.
 */
export class BedParser {
  private impl: IndexedBedParser | PlainBedParser;

  constructor(opts: IParserOpts) {
    if (opts.index) {
      this.impl = new IndexedBedParser(opts);
    } else {
      this.impl = new PlainBedParser(opts);
    }
  }

  recordsParser = (opts: IFetchOpts): Promise<any[]> => {
    return this.impl.recordsParser(opts);
  };
}

export class IndexedBedParser extends IndexedFeatureParser {
  indexedData: any;
  bedParser: any;

  constructor(opts: IParserOpts) {
    super(opts);
    this.indexedData = this.getIndexedData();
    this.bedParser = new BED();
  }

  recordsParser = async (opts: IFetchOpts) => {
    const { chr, start, end } = opts;
    const lines: any[] = [];

    try {
      await getLinesWithAliases(
        (c, s, e, onLine) => this.indexedData.getLines(c, s, e, onLine),
        chr,
        start,
        end,
        (line: string) => {
          const parsed = this.bedParser.parseLine(line);
          lines.push(normaliseBedRecord(parsed));
        },
      );
    } catch (e: any) {
      throw new Error(e?.message ?? e);
    }

    return lines;
  };
}
