import VCF from "@gmod/vcf";
import { IndexedFeatureParser, IParserOpts } from "./base";
import { IFetchOpts } from "./type";
import { getLinesWithAliases } from "./chrom-alias";

export class VCFParser extends IndexedFeatureParser {
  indexedData: any;

  constructor(opts: IParserOpts) {
    super(opts);
    this.indexedData = this.getIndexedData();
  }

  recordsParser = async (opts: IFetchOpts) => {
    const { chr, start, end } = opts;
    const lines: any[] = [];
    const headerText = await this.indexedData.getHeader();
    const vcfParser = new VCF({ header: headerText });

    try {
      await getLinesWithAliases(
        (c, s, e, onLine) => this.indexedData.getLines(c, s, e, onLine),
        chr,
        start,
        end,
        (line: string) => {
          lines.push(vcfParser.parseLine(line));
        },
      );
    } catch (e: any) {
      throw new Error(e?.message ?? e);
    }

    return lines;
  };
}
