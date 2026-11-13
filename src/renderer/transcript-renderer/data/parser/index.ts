import { AnnotationParser } from "./gff";
import { GtfParser } from "./gtf";
import { BedParser } from "./bed";
import { PlainBedParser } from "./plain-bed";
import { BigBedParser } from "./BigBedParser";
import { BigwigParser } from "./BigwigParser";
import { VCFParser } from "./VCFParser";
import { BamParser } from "./BamParser";
import { CramParser } from "./CramParser";
import { FastaParser } from "./FastaParser";
import { IsmParser } from "./IsmParser";
import { IParserOpts } from "./base";
import { IFetchOpts } from "./type";
import { logger } from "../../utils/logger";

export type { IFetchOpts } from "./type";
export type { IParserOpts } from "./base";

export type ParserType =
  | "gff"
  | "gff3"
  | "bed"
  | "bigbed"
  | "bb"
  | "bigwig"
  | "bw"
  | "vcf"
  | "bam"
  | "cram"
  | "fasta"
  | "fa"
  | "fna"
  | "ism"
  | "tsv"
  | "json";

/**
 * Detect a GTF (GFF2) annotation by its file URL / path.
 *
 * Matches `.gtf` / `.gtf.gz` (optionally followed by a query string), so
 * tabix-indexed GTF references are routed to GtfParser even when the
 * caller requests the generic `format: "gff"`.
 */
function isGtfUrl(file: string | undefined): boolean {
  return typeof file === "string" && /\.gtf(\.gz)?(\?|$)/i.test(file);
}

export class Parser {
  parser: any;
  type: string;

  constructor(opts: IParserOpts & { type: ParserType | string }) {
    const { type } = opts;
    this.type = type;

    switch (type) {
      case "gff":
      case "gff3":
        // The `transcript` / buildin channels always request annotations with
        // `format: "gff"`, but some references ship `.gtf.gz` (GFF2) instead
        // of GFF3.  Route those to the GTF parser by inspecting the file URL
        // so both formats render through the same downstream pipeline.
        this.parser = isGtfUrl(opts.file)
          ? new GtfParser(opts)
          : new AnnotationParser(opts);
        break;
      case "bed":
        this.parser = new BedParser(opts);
        break;
      case "bigbed":
      case "bb":
        this.parser = new BigBedParser(opts);
        break;
      case "bigwig":
      case "bw":
        this.parser = new BigwigParser(opts);
        break;
      case "vcf":
        this.parser = new VCFParser(opts);
        break;
      case "bam":
        this.parser = new BamParser(opts);
        break;
      case "cram":
        this.parser = new CramParser(opts);
        break;
      case "fasta":
      case "fa":
      case "fna":
        this.parser = new FastaParser(opts);
        break;
      case "ism":
        this.parser = new IsmParser(opts);
        break;
      case "tsv":
        // Inline tab-separated BED6/BED12 text. Always uses PlainBedParser
        // (no index path); subFormat is forced to "bed" so @gmod/bed parses
        // each line.
        this.parser = new PlainBedParser(opts, "bed");
        break;
      case "json":
        // Inline JSON: a single record object or an array of record objects
        // already in normalised shape (chrom, start, end, name, score, …).
        this.parser = new PlainBedParser(opts, "json");
        break;
      default:
        logger.warn(`Parser type "${type}" is not supported yet.`);
    }
  }

  /** Fetch records for the given region. Passes scale to BigWig/BigBed parsers. */
  recordsParser = async (opts: IFetchOpts) => {
    if (this.parser) {
      return await this.parser.recordsParser(opts);
    }
    return [];
  };

  /** Stream interface (BigWig / BigBed only). Returns a feature stream. */
  recordsStreamParser = async (opts: IFetchOpts) => {
    if (this.parser?.recordsStreamParser) {
      return await this.parser.recordsStreamParser(opts);
    }
    logger.warn(
      `recordsStreamParser is not supported for type "${this.type}".`,
    );
    return null;
  };
}
