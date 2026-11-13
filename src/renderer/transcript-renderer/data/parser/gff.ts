import { IndexedFeatureParser, IParserOpts } from "./base";
import { IFetchOpts } from "./type";
import gff from "@gmod/gff";
import { getLinesWithAliases } from "./chrom-alias";

export class AnnotationParser extends IndexedFeatureParser {
  indexedData: any;

  constructor(opts: IParserOpts) {
    super(opts);
    this.indexedData = this.getIndexedData();
  }

  recordsParser = async (opts: IFetchOpts) => {
    const { chr, start, end } = opts;

    let content = "";
    try {
      await getLinesWithAliases(
        (c, s, e, onLine) => this.indexedData.getLines(c, s, e, onLine),
        chr,
        start,
        end,
        (line: string) => {
          content += line + "\n";
        },
      );
    } catch (e: any) {
      throw new Error(e?.message ?? e);
    }

    if (!content) return [];

    // Parse GFF
    // @gmod/gff parseStringSync returns an array of features
    const res = gff.parseStringSync(content);
    return res;
  };
}
