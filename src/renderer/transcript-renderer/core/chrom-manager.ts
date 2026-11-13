import { CytobandEntry } from "../axis";
import { resolveChromSize } from "../utils/chrom-name";

/**
 * Owns per-chromosome size and cytoband data loaded from the reference's
 * chrom.sizes / cytoband files.
 */
export class ChromManager {
  /** key = chromosome name (e.g. "chr1"), value = total length in bp. */
  private chromSizes: Map<string, number> = new Map();

  /** key = chromosome name, value = array of cytoband band entries. */
  private cytobandMap: Map<string, CytobandEntry[]> = new Map();

  /**
   * Fetch and parse a UCSC-format chrom.sizes file (tab-separated:
   * `chr\tsize`). Safe to call multiple times; each call replaces the cache.
   * Non-fatal on error — interaction simply lacks hard chromosome boundaries.
   */
  async loadChromSizes(url?: string): Promise<void> {
    if (!url) return;
    try {
      const text = await fetch(url).then((r) => r.text());
      this.chromSizes.clear();
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim() || line.startsWith("#")) continue;
        const [chr, sizeStr] = line.split(/\t/);
        const size = parseInt(sizeStr, 10);
        if (chr && Number.isFinite(size)) {
          this.chromSizes.set(chr.trim(), size);
        }
      }
    } catch {
      // Non-fatal: interaction simply won't have hard chromosome boundaries
    }
  }

  /**
   * Fetch and parse a UCSC-format cytoband file (plain text or gzipped).
   * Non-fatal on error — the ideogram simply won't be shown.
   */
  async loadCytobands(url?: string): Promise<void> {
    if (!url) return;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return;

      let text: string;
      if (url.endsWith(".gz")) {
        // Decompress gzipped response using the browser's DecompressionStream API
        const ds = new DecompressionStream("gzip");
        const decompressed = resp.body!.pipeThrough(ds);
        text = await new Response(decompressed).text();
      } else {
        text = await resp.text();
      }

      this.cytobandMap.clear();
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim() || line.startsWith("#")) continue;
        const cols = line.split(/\t/);
        if (cols.length < 5) continue;
        const chr = cols[0].trim();
        const start = parseInt(cols[1], 10);
        const end = parseInt(cols[2], 10);
        const name = cols[3].trim();
        const stain = cols[4].trim();
        if (!chr || !Number.isFinite(start) || !Number.isFinite(end)) continue;
        let arr = this.cytobandMap.get(chr);
        if (!arr) {
          arr = [];
          this.cytobandMap.set(chr, arr);
        }
        arr.push({ chr, start, end, name, stain });
      }
    } catch {
      // Non-fatal: ideogram simply won't be shown
    }
  }

  /**
   * Resolve a chromosome size in bp from the loaded chrom.sizes map,
   * tolerating spelling differences ("1" ↔ "chr1", "MT" ↔ "chrM", …).
   * Returns `undefined` if not loaded yet or absent.
   */
  getChromSize(chr: string): number | undefined {
    return resolveChromSize(this.chromSizes, chr);
  }

  /** Return `[minStart, maxEnd]` for a chromosome, or a finite fallback. */
  chromBounds(chr: string): { minStart: number; maxEnd: number } {
    const size = this.getChromSize(chr);
    if (size !== undefined) {
      return { minStart: 0, maxEnd: size };
    }
    // Chromsizes file hasn't loaded yet (or this chr is absent). Use a finite
    // fallback so the InteractionController always has a sensible maxSpan —
    // 500 Mbp comfortably covers the longest human chromosome (chr1 ≈ 248 Mbp).
    return { minStart: 0, maxEnd: 500_000_000 };
  }

  /** Cytoband band entries for a chromosome (empty when none loaded). */
  getCytobandBands(chr: string): CytobandEntry[] {
    return this.cytobandMap.get(chr) ?? [];
  }
}
