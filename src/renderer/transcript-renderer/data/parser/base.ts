import { TabixIndexedFile } from "@gmod/tabix";
import { BamFile } from "@gmod/bam";
import { IndexedCramFile, CraiIndex } from "@gmod/cram";
import { IndexedFasta, BgzipIndexedFasta } from "@gmod/indexedfasta";
import { BlobFile } from "generic-filehandle";
import { BigWig, BigBed } from "@gmod/bbi";
import { CompatRemoteFile } from "./compat-remote-file";

export interface IParserOpts {
  method: "remote" | "local";
  file: string; // URL (remote) or file path (local Node.js) or FileReader event (local browser)
  index?: string; // URL or path for the index file (.tbi / .bai / .crai / .fai …)
  gindex?: string; // secondary index (e.g. .gzi for bgzipped FASTA)
  /**
   * Explicit index variant for BAM. Disambiguates `.bai` vs `.csi` when the
   * index URL doesn't carry a recognisable extension (e.g. blob URLs created
   * from drag-and-drop uploads). When omitted, the type is inferred from the
   * index filename / URL suffix.
   */
  indexFormat?: "bai" | "csi";
  /**
   * Inline raw content (used with `method: "local"` + format "tsv" / "json" /
   * "bed" / "bedgraph" / "narrowpeak" / "broadpeak"). When set, the parser
   * skips any URL/file I/O and parses this string directly.
   */
  content?: string;
}

// ---------------------------------------------------------------------------
// IndexedFeatureParser – Tabix / BAM / CRAM / FASTA
// ---------------------------------------------------------------------------

export class IndexedFeatureParser {
  opts: IParserOpts;

  constructor(opts: IParserOpts) {
    this.opts = opts;
  }

  /** Resolve a file handle for local browser files (FileReader ArrayBuffer). */
  protected getFilehandle(fileOrEvent: any): BlobFile {
    const result = fileOrEvent?.target?.result ?? fileOrEvent;
    const arrayBuffer = result as ArrayBuffer;
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));
    return new BlobFile(
      new Blob([buffer], { type: "application/octet-stream" }),
    );
  }

  /**
   * Validate that an index file was supplied; throw a user-friendly,
   * format-specific error when it is missing.  This avoids cryptic
   * downstream messages such as "Not a BAI file" that show up when the
   * underlying parser tries to read an absent index.
   *
   * @param kind  Short label shown to the user (e.g. "BAM", "CRAM").
   * @param ext   Conventional index file extension for that format
   *              (e.g. ".bai", ".crai"); appended as a hint.
   */
  protected requireIndex(kind: string, ext: string): string {
    const { index, file } = this.opts;
    if (!index) {
      const hint =
        typeof file === "string" && file
          ? ` (expected: ${file}${ext})`
          : ` (please provide a ${ext} index file)`;
      throw new Error(`Missing ${kind} index file${hint}`);
    }
    return index;
  }

  /** Tabix-indexed file (GFF / GFF3 / BED / VCF …) */
  getIndexedData(): TabixIndexedFile {
    const { method, file } = this.opts;
    const index = this.requireIndex("Tabix", ".tbi");
    switch (method) {
      case "remote":
        return new TabixIndexedFile({
          filehandle: new CompatRemoteFile(file) as any,
          tbiFilehandle: new CompatRemoteFile(index) as any,
        });
      case "local":
        return new TabixIndexedFile({
          filehandle: this.getFilehandle(file) as any,
          tbiFilehandle: this.getFilehandle(index) as any,
        });
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  /**
   * BAM file.
   *
   * Accepts both `.bai` (legacy linear index) and `.csi` (coordinate-sorted
   * index, required for chromosomes longer than 2^29 bp). The index type is
   * detected from the supplied index filename / URL so that `@gmod/bam`
   * receives the matching `baiFilehandle` or `csiFilehandle`.
   */
  getBamIndexedData(): BamFile {
    const { method, file } = this.opts;
    const index = this.requireIndex("BAM", ".bai");
    const isCsi = this.isCsiIndex(index);
    switch (method) {
      case "remote": {
        const bamFilehandle = new CompatRemoteFile(file) as any;
        const indexHandle = new CompatRemoteFile(index) as any;
        return new BamFile(
          isCsi
            ? { bamFilehandle, csiFilehandle: indexHandle }
            : { bamFilehandle, baiFilehandle: indexHandle },
        );
      }
      case "local": {
        const bamFilehandle = this.getFilehandle(file) as any;
        const indexHandle = this.getFilehandle(index) as any;
        return new BamFile(
          isCsi
            ? { bamFilehandle, csiFilehandle: indexHandle }
            : { bamFilehandle, baiFilehandle: indexHandle },
        );
      }
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  /**
   * Decide whether an index path/URL points at a CSI index.
   *
   * Prefers the explicit `opts.indexFormat` hint (set by drag-and-drop, where
   * blob URLs carry no extension). Otherwise strips any query string (`?…`)
   * and checks the `.csi` suffix so remote URLs with cache-busting params
   * (e.g. `reads.bam.csi?v=2`) are detected correctly.
   */
  protected isCsiIndex(index: unknown): boolean {
    if (this.opts.indexFormat === "csi") return true;
    if (this.opts.indexFormat === "bai") return false;
    if (typeof index !== "string") return false;
    return index.split("?")[0].toLowerCase().endsWith(".csi");
  }

  /** CRAM file */
  getCramIndexedData(): IndexedCramFile {
    const { method, file } = this.opts;
    const index = this.requireIndex("CRAM", ".crai");
    switch (method) {
      case "remote":
        return new IndexedCramFile({
          cramFilehandle: new CompatRemoteFile(file) as any,
          index: new CraiIndex({
            filehandle: new CompatRemoteFile(index) as any,
          }),
        });
      case "local":
        return new IndexedCramFile({
          cramFilehandle: this.getFilehandle(file) as any,
          index: new CraiIndex({
            filehandle: this.getFilehandle(index) as any,
          }),
        });
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  /** FASTA file with .fai index */
  getFastaIndexedData(): IndexedFasta {
    const { method, file } = this.opts;
    const index = this.requireIndex("FASTA", ".fai");
    switch (method) {
      case "remote":
        return new IndexedFasta({
          fasta: new CompatRemoteFile(file) as any,
          fai: new CompatRemoteFile(index) as any,
        });
      case "local":
        return new IndexedFasta({
          fasta: this.getFilehandle(file) as any,
          fai: this.getFilehandle(index) as any,
        });
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  /** bgzipped FASTA with .fai + .gzi indexes */
  getGzFastaIndexedData(): BgzipIndexedFasta {
    const { method, file, index, gindex } = this.opts;
    switch (method) {
      case "remote":
        return new BgzipIndexedFasta({
          fasta: new CompatRemoteFile(file) as any,
          fai: new CompatRemoteFile(index!) as any,
          gzi: new CompatRemoteFile(gindex!) as any,
        });
      case "local":
        return new BgzipIndexedFasta({
          fasta: this.getFilehandle(file) as any,
          fai: this.getFilehandle(index!) as any,
          gzi: this.getFilehandle(gindex!) as any,
        });
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }
}

// ---------------------------------------------------------------------------
// FeatureParser – BigWig / BigBed
// ---------------------------------------------------------------------------

export interface IFeatureParserOpts {
  method: "remote" | "local";
  file: string;
}

export class FeatureParser {
  opts: IFeatureParserOpts;

  constructor(opts: IFeatureParserOpts) {
    this.opts = opts;
  }

  /** Resolve a BlobFile from a local FileReader ArrayBuffer event or raw ArrayBuffer. */
  protected getFilehandle(fileOrEvent: any): BlobFile {
    const result = fileOrEvent?.target?.result ?? fileOrEvent;
    const buffer = Buffer.from(new Uint8Array(result as ArrayBuffer));
    return new BlobFile(
      new Blob([buffer], { type: "application/octet-stream" }),
    );
  }

  getBigWigData(): BigWig {
    const { method, file } = this.opts;
    switch (method) {
      case "remote":
        return new BigWig({ filehandle: new CompatRemoteFile(file) as any });
      case "local":
        return new BigWig({ filehandle: this.getFilehandle(file) as any });
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  getBigBedData(): BigBed {
    const { method, file } = this.opts;
    switch (method) {
      case "remote":
        return new BigBed({ filehandle: new CompatRemoteFile(file) as any });
      case "local":
        return new BigBed({ filehandle: this.getFilehandle(file) as any });
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }
}
