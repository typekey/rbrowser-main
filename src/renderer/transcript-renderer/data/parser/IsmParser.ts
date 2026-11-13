/**
 * ISM (In Silico Mutagenesis) Parser
 *
 * Reads tabix-indexed `.ism.gz` files.  The format is a 10-column TSV:
 *
 *   chr  start  end  name  score  strand  A_score  T_score  C_score  G_score
 *
 * Each record represents a single genomic position (1 bp) with per-base
 * importance scores produced by in-silico mutagenesis.
 *
 * The parser extends IndexedFeatureParser (same as BedParser) to reuse the
 * Tabix line-based fetching, but parses each line directly instead of going
 * through @gmod/bed.
 */

import { IndexedFeatureParser, IParserOpts } from "./base";
import { IFetchOpts } from "./type";
import { getLinesWithAliases } from "./chrom-alias";

export interface IsmRecord {
  chrom: string;
  chromStart: number;
  chromEnd: number;
  name: string;
  score: number;
  strand: string;
  aScore: number;
  tScore: number;
  cScore: number;
  gScore: number;
}

export class IsmParser extends IndexedFeatureParser {
  indexedData: any;

  constructor(opts: IParserOpts) {
    super(opts);
    this.indexedData = this.getIndexedData();
  }

  recordsParser = async (opts: IFetchOpts): Promise<IsmRecord[]> => {
    const { chr, start, end } = opts;
    const records: IsmRecord[] = [];

    try {
      await getLinesWithAliases(
        (c, s, e, onLine) => this.indexedData.getLines(c, s, e, onLine),
        chr,
        start,
        end,
        (line: string) => {
          const fields = line.split("\t");
          if (fields.length < 10) return; // skip malformed lines

          records.push({
            chrom: fields[0],
            chromStart: parseInt(fields[1], 10),
            chromEnd: parseInt(fields[2], 10),
            name: fields[3],
            score: parseFloat(fields[4]),
            strand: fields[5],
            aScore: parseFloat(fields[6]),
            tScore: parseFloat(fields[7]),
            cScore: parseFloat(fields[8]),
            gScore: parseFloat(fields[9]),
          });
        },
      );
    } catch (e: any) {
      throw new Error(e?.message ?? e);
    }

    return records;
  };
}
