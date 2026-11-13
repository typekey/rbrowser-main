import { IndexedFeatureParser, IParserOpts } from "./base";
import { IFetchOpts } from "./type";
import { resolveChromFromSet } from "./chrom-alias";

export class CramParser extends IndexedFeatureParser {
  indexedData: any;

  constructor(opts: IParserOpts) {
    super(opts);
    this.indexedData = this.getCramIndexedData();
  }

  recordsParser = async (opts: IFetchOpts) => {
    const { chr, start, end } = opts;

    try {
      const header = await this.indexedData.cram.getSamHeader();
      const sqLines = header.filter((l: any) => l.tag === "SQ");

      const nameToId: Record<string, number> = {};
      sqLines.forEach((sqLine: any, refId: number) => {
        sqLine.data.forEach((item: any) => {
          if (item.tag === "SN") {
            nameToId[item.value] = refId;
          }
        });
      });

      // Resolve chromosome name via alias (chr1 ↔ 1, chrM ↔ MT, …)
      const resolved = resolveChromFromSet(chr, Object.keys(nameToId));
      const refId = resolved !== undefined ? nameToId[resolved] : undefined;

      if (refId === undefined) {
        throw new Error(`Reference sequence "${chr}" not found in CRAM header`);
      }

      return await this.indexedData.getRecordsForRange(refId, start, end);
    } catch (e: any) {
      throw new Error(e?.message ?? e);
    }
  };
}
