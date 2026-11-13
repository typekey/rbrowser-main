import { IndexedFeatureParser, IParserOpts } from "./base";
import { IFetchOpts } from "./type";
import { getLinesWithAliases } from "./chrom-alias";

/**
 * GTF (GFF2 / Gene Transfer Format) annotation parser.
 *
 * Several references on the data hub ship their annotation as a bgzipped,
 * tabix-indexed `.gtf.gz` (NCBI RefSeq / UCSC style) rather than GFF3 — e.g.
 * `T2T-CHM13v2`, `mm9`, `ce11`, `rn6`, `bosTau8/9`, `dm3`, `GRCz10`, …  GTF
 * cannot be parsed by `@gmod/gff` (its attribute syntax is `key "value";`,
 * not GFF3's `key=value;`, and it has no explicit `ID` / `Parent` hierarchy —
 * features are grouped implicitly by their shared `transcript_id`).
 *
 * To avoid touching the downstream pipeline, this parser converts GTF lines
 * into the SAME feature-object shape that `@gmod/gff`'s `parseStringSync`
 * produces (each transcript a top-level feature with `attributes` and a
 * `child_features` array), so `transformGffToTranscripts` — and therefore the
 * `Transcript`, `Transcript Structure`, `Exon` and `Splice Junction` channels —
 * work unchanged.
 */
export class GtfParser extends IndexedFeatureParser {
  indexedData: any;

  constructor(opts: IParserOpts) {
    super(opts);
    this.indexedData = this.getIndexedData();
  }

  recordsParser = async (opts: IFetchOpts) => {
    const { chr, start, end } = opts;

    const lines: string[] = [];
    try {
      await getLinesWithAliases(
        (c, s, e, onLine) => this.indexedData.getLines(c, s, e, onLine),
        chr,
        start,
        end,
        (line: string) => {
          lines.push(line);
        },
      );
    } catch (e: any) {
      throw new Error(e?.message ?? e);
    }

    if (lines.length === 0) return [];
    return parseGtfLines(lines);
  };
}

/**
 * GTF feature-type aliases → GFF3 canonical names so the rendered structure
 * matches GFF3 references (e.g. UCSC refGene emits `5UTR` / `3UTR`).
 */
const GTF_TYPE_ALIASES: Record<string, string> = {
  "5UTR": "five_prime_UTR",
  "3UTR": "three_prime_UTR",
  UTR5: "five_prime_UTR",
  UTR3: "three_prime_UTR",
  "5'UTR": "five_prime_UTR",
  "3'UTR": "three_prime_UTR",
};

const TRANSCRIPT_LEVEL = new Set(["transcript", "mRNA"]);

interface GtfRow {
  type: string;
  start: number;
  end: number;
  strand: "+" | "-";
  attributes: Record<string, string[]>;
}

/** Parse a GTF attribute column (`gene_id "X"; transcript_id "Y"; …`). */
function parseGtfAttributes(raw: string): Record<string, string[]> {
  const attrs: Record<string, string[]> = {};
  const re = /(\S+)\s+"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const key = m[1];
    const val = m[2];
    (attrs[key] ??= []).push(val);
  }
  return attrs;
}

/**
 * Convert tabix GTF lines into GFF3-compatible feature objects.
 *
 * Lines are grouped by `transcript_id`; each group becomes one transcript
 * feature whose `child_features` are its exon / CDS / UTR / codon parts. When
 * the queried window does not include the transcript's own line (e.g. panning
 * inside a long transcript), the span is synthesised from the min/max of its
 * parts so the transcript still renders.
 */
export function parseGtfLines(lines: string[]): any[] {
  const groups = new Map<
    string,
    { transcriptRow: GtfRow | null; parts: GtfRow[] }
  >();

  for (const line of lines) {
    if (!line || line[0] === "#") continue;
    const cols = line.split("\t");
    if (cols.length < 9) continue;

    const start = parseInt(cols[3], 10);
    const end = parseInt(cols[4], 10);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    const attributes = parseGtfAttributes(cols[8]);
    const txId = attributes.transcript_id?.[0];
    // Skip gene-level lines (no transcript_id → nothing to group on).
    if (!txId) continue;

    const rawType = cols[2];
    const row: GtfRow = {
      type: GTF_TYPE_ALIASES[rawType] ?? rawType,
      start,
      end,
      strand: cols[6] === "-" ? "-" : "+",
      attributes,
    };

    let g = groups.get(txId);
    if (!g) {
      g = { transcriptRow: null, parts: [] };
      groups.set(txId, g);
    }
    if (TRANSCRIPT_LEVEL.has(row.type)) {
      g.transcriptRow = row;
    } else {
      g.parts.push(row);
    }
  }

  const features: any[] = [];
  for (const g of groups.values()) {
    let txRow = g.transcriptRow;
    if (!txRow) {
      if (g.parts.length === 0) continue;
      // Synthesise the transcript span from its parts.
      let s = Infinity;
      let e = -Infinity;
      for (const p of g.parts) {
        if (p.start < s) s = p.start;
        if (p.end > e) e = p.end;
      }
      txRow = {
        type: "transcript",
        start: s,
        end: e,
        strand: g.parts[0].strand,
        attributes: g.parts[0].attributes,
      };
    }
    features.push({
      type: txRow.type,
      start: txRow.start,
      end: txRow.end,
      strand: txRow.strand,
      attributes: txRow.attributes,
      child_features: g.parts.map((p) => ({
        type: p.type,
        start: p.start,
        end: p.end,
        strand: p.strand,
        attributes: p.attributes,
      })),
    });
  }
  return features;
}
