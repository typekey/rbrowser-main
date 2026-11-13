import type { ITrans } from "../reference/reference-manager";

export interface ISearchSource {
  searchTranscripts(query: string, limit?: number): Promise<ITrans[]>;
}

export interface ITransGroup {
  /** The biotype / feature-type label shared by every entry. */
  type: string;
  /** Suggestions in this biotype group, preserving input order. */
  items: ITrans[];
}

export class SearchManager {
  private readonly _source: ISearchSource;

  constructor(source: ISearchSource) {
    this._source = source;
  }

  async search(query: string, limit = 20): Promise<ITrans[]> {
    return this._source.searchTranscripts(query, limit);
  }

  async searchGrouped(query: string, limit = 20): Promise<ITransGroup[]> {
    const flat = await this.search(query, limit);
    if (flat.length === 0) return [];
    const buckets = new Map<string, ITrans[]>();
    for (const s of flat) {
      const type = s.trans_type || "unknown";
      const existing = buckets.get(type);
      if (existing) existing.push(s);
      else buckets.set(type, [s]);
    }
    return [...buckets.entries()].map(([type, items]) => ({ type, items }));
  }

  async searchByLevel(
    query: string,
    level: ITrans["level"],
    limit = 20,
  ): Promise<ITrans[]> {
    const flat = await this.search(query, limit);
    return flat.filter((s) => s.level === level);
  }
}
