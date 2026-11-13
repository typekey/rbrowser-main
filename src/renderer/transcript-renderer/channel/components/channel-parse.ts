import { ChannelView } from "../index";
import { defaultConfig } from "../../../../../config/default_config";

/**
 * Feature-annotation parsing & auto-detection: score-plot detection,
 * auto style/expand inference, and UCSC key-value / REST-field parsing.
 * Reads channel state through the ChannelView back-reference.
 */
export class ChannelParse {
  constructor(private readonly v: ChannelView) {}

  isScorePlot(): boolean {
    const p = this.v.config.plot;
    return (
      p === "bar" ||
      p === "bigwig" ||
      p === "line" ||
      p === "point" ||
      p === "heatmap"
    );
  }

  // ── Rest-field parsing ──────────────────────────────────────────────

  /**
   * Trigger UCSC key=value auto-detection on the first feature, so
   * `config.style.expand` (and the expand button) can be set eagerly
   * without waiting for a tooltip hover.
   */
  public tryAutoDetectStyle(): void {
    if (this.v.config.style?.keys && this.v.config.style.keys.length > 0) return;
    if (this.v._ucscStyleInferred !== undefined) return;
    if (!this.v.data || this.v.data.length === 0) return;

    // parseRestFields sets style.keys/expand/sep and calls createChannelLabel()
    // internally when a UCSC pattern is detected.
    this.parseRestFields(this.v.data[0]);
  }

  /**
   * Auto-expand once after all pending tiles arrive, so the full dataset
   * is available before creating sub-channels (avoids partial expansions
   * and duplicate groups on later data arrivals). Skips if already
   * expanded or if this is a sub-channel.
   */
  public tryAutoExpand(): void {
    if (this.v._destroyed) return;
    if (this.v._autoExpandDone) return;
    if (!this.v.config.style?.isExpand) return;
    if (this.v._isSubChannel) return;
    if (!this.v.canExpand) return;
    if (!this.v.data || this.v.data.length === 0) return;

    // ── KEY FIX: wait for ALL tiles before expanding ──
    // ScreenDataManager delivers data across multiple tile callbacks.
    // Expanding on the first tile would only see a subset of unique field
    // values, and `_autoExpandDone` then blocks re-expansion once more
    // tiles arrive. Deferring until hasPendingRequests() is false
    // guarantees a complete dataset; updateDataFromCacheAsync() re-calls
    // us after each tile, so this check eventually passes.
    if (this.v.screenManager?.hasPendingRequests()) {
      return;
    }

    this.v._autoExpandDone = true;


    this.v.expand();

    // Recreate label so the chevron, splitter & filter icons reflect the
    // newly-expanded state.
    if (this.v._isExpanded) {
      this.v.label.createChannelLabel();
    }
  }

  /**
   * Matches UCSC-style `Key=Value` pairs joined by `;` (trailing `;`
   * optional). Keys start with a letter and are word-chars; values may be
   * empty or any non-`;` chars.
   *   "Name=L1MB5;Class=LINE;Family=L1" → match
   *   "plain text no equals"            → no match
   */
  private static readonly UCSC_KV_RE =
    /^[A-Za-z]\w*=[^;]*(?:;[A-Za-z]\w*=[^;]*)*;?$/;

  /** Parse a UCSC `Key=Value;Key=Value` string, or `null` if it doesn't match. */
  private static tryParseUcscKv(
    str: string,
  ): { keys: string[]; result: Record<string, string> } | null {
    if (!str || !ChannelParse.UCSC_KV_RE.test(str)) return null;

    const pairs = str.split(";").filter((s) => s.includes("="));
    if (pairs.length === 0) return null;

    const keys: string[] = [];
    const result: Record<string, string> = {};
    for (const pair of pairs) {
      const eqIdx = pair.indexOf("=");
      const key = pair.slice(0, eqIdx).trim();
      const val = pair.slice(eqIdx + 1).trim();
      if (!key) continue;
      keys.push(key);
      result[key] = val;
    }
    return keys.length > 0 ? { keys, result } : null;
  }

  /**
   * Parse a feature's `rest`/`name` into a key-value map using `style.sep`
   * and `style.keys`. When `keys` is unconfigured, auto-detect in order:
   *   1. RBrowser pipe-separated (`|`) tokens in `name`/`rest`.
   *   2. UCSC `Key=Value;Key=Value` patterns.
   *   3. Raw — no pattern; returns `null`.
   * On detection, the inferred keys/sep/order/expand are written back into
   * `this.v.config.style` so later calls, expand, and tooltips pick them up.
   */
  parseRestFields(feature: any): Record<string, string> | null {
    const keys = this.v.config.style?.keys;
    const sep = this.v.config.style?.sep || "|";

    // ── Configured keys path ──────────────────────────────────────────
    if (keys && keys.length > 0) {
      // Primary: parse `feature.rest` as a delimiter-separated string (BigBed)
      if (typeof feature.rest === "string" && feature.rest) {
        const tokens = feature.rest.split(sep);
        const result: Record<string, string> = {};
        for (let i = 0; i < keys.length; i++) {
          result[keys[i]] = i < tokens.length ? tokens[i].trim() : "";
        }
        return result;
      }

      // When keys were auto-inferred from feature.name, subsequent features
      // carry their kv in name (not rest). Also handles sub-channels that
      // inherit style.keys but start with _ucscStyleInferred = undefined.
      if (typeof feature.name === "string" && feature.name) {
        // RBrowser pipe-separated
        if (sep === "|" && feature.name.includes("|")) {
          const tokens = feature.name.split("|").map((t: string) => t.trim());
          const result: Record<string, string> = {};
          for (let i = 0; i < keys.length; i++) {
            result[keys[i]] = i < tokens.length ? tokens[i] : "";
          }
          return result;
        }
        // UCSC key=value
        const ucsc = ChannelParse.tryParseUcscKv(feature.name);
        if (ucsc) return ucsc.result;
      }

      // Fallback: read named properties directly off the feature object.
      // Used by builtin formats (exon/junction expression) where features
      // carry named keys like { Tissue: "Adipose Subcutaneous", score: 169 }.
      const hasDirectFields = keys.some((k) => k in feature);
      if (hasDirectFields) {
        const result: Record<string, string> = {};
        for (const key of keys) {
          const v = feature[key];
          result[key] = v !== undefined ? String(v) : "";
        }
        return result;
      }

      return null;
    }

    // ── Auto-detect: attempt once, then skip on all subsequent features ──
    if (this.v._ucscStyleInferred === false) return null;

    // Try feature.name (BED column 4) first, then feature.rest
    const candidates: string[] = [];
    if (typeof feature.name === "string" && feature.name)
      candidates.push(feature.name);
    if (typeof feature.rest === "string" && feature.rest)
      candidates.push(feature.rest);

    // ── 1. RBrowser_key style: pipe-separated fields ─────────────────
    // 2+ pipes → treat as a pipe-delimited record. Keys are generic
    // "Field 1", "Field 2", …; the second-to-last field is the expand field.
    //   "7772879|+|m6A|m6A-seq|peripheral-blood|GSE87190|RMBase"
    //     → expand = ["Field 6"] (second-to-last = "GSE87190")
    for (const candidate of candidates) {
      const pipeCount = (candidate.match(/\|/g) || []).length;
      if (pipeCount >= 2) {
        const tokens = candidate.split("|").map((t) => t.trim());
        if (tokens.length >= 3) {
          const inferredKeys = tokens.map((_, idx) => `Field ${idx + 1}`);
          const style = this.v.ensureMutableStyle();
          const dd = defaultConfig.channels.diamond.style;
          style.keys = inferredKeys;
          style.order = inferredKeys.slice();
          style.sep = "|";
          if (!style.expand) {
            const expandIdx =
              inferredKeys.length >= 2 ? inferredKeys.length - 2 : 0;
            style.expand = [inferredKeys[expandIdx]];
          }
          if (style.maxHeight === undefined) style.maxHeight = dd.maxHeight;
          if (style.size === undefined) style.size = dd.size;

          this.v._ucscStyleInferred = true;

          if (this.v.canExpand) {
            this.v.label.createChannelLabel();
          }

          const result: Record<string, string> = {};
          for (let i = 0; i < inferredKeys.length; i++) {
            result[inferredKeys[i]] = i < tokens.length ? tokens[i] : "";
          }
          return result;
        }
      }
    }

    // ── 2. UCSC_key style: Key=Value;Key=Value pattern ────────────────
    for (const candidate of candidates) {
      const parsed = ChannelParse.tryParseUcscKv(candidate);
      if (parsed) {
        const style = this.v.ensureMutableStyle();
        const dd = defaultConfig.channels.diamond.style;
        style.keys = parsed.keys;
        style.order = parsed.keys.slice(); // same order
        style.sep = ";";
        // Auto-expand by "Class" if present
        if (!style.expand) {
          style.expand = parsed.keys.includes("Class") ? ["Class"] : [];
        }
        if (style.maxHeight === undefined) style.maxHeight = dd.maxHeight;
        if (style.size === undefined) style.size = dd.size;

        this.v._ucscStyleInferred = true;

        if (this.v.canExpand) {
          this.v.label.createChannelLabel();
        }

        return parsed.result;
      }
    }

    // ── 3. No pattern found — fall back to raw display ────────────────
    this.v._ucscStyleInferred = false;
    return null;
  }

  /**
   * Extract a short annotation string for compact tooltip display.
   * Uses parsed rest fields if `keys` is configured, otherwise falls back
   * to the existing heuristic (name → rest tokens → other string fields).
   */
  extractCompactAnnotation(feature: any): string {
    // 1. Keys configured → parse rest, return first meaningful value
    const parsed = this.parseRestFields(feature);
    if (parsed) {
      const order = this.v.config.style?.order ?? this.v.config.style?.keys ?? [];
      for (const key of order) {
        const v = parsed[key];
        if (
          v &&
          v !== "+" &&
          v !== "-" &&
          v !== "." &&
          !/^\d+(\.\d+)?$/.test(v)
        ) {
          return v;
        }
      }
    }

    // 2. Direct name field
    if (feature.name) return feature.name;

    // 3. `rest` field heuristic (no keys configured)
    if (typeof feature.rest === "string" && feature.rest) {
      const tokens = feature.rest.split(/[|\t]/);
      for (const t of tokens) {
        const trimmed = t.trim();
        if (
          !trimmed ||
          trimmed === "+" ||
          trimmed === "-" ||
          trimmed === "." ||
          /^\d+(\.\d+)?$/.test(trimmed)
        )
          continue;
        return trimmed;
      }
      return feature.rest.length > 40
        ? feature.rest.slice(0, 40) + "…"
        : feature.rest;
    }

    // 4. Any other non-trivial string field
    const skip = new Set([
      "chromStart",
      "chromEnd",
      "start",
      "end",
      "chr",
      "chrom",
      "strand",
      "_mergeCount",
      "uniqueId",
    ]);
    for (const [key, value] of Object.entries(feature)) {
      if (skip.has(key) || typeof value !== "string" || !value) continue;
      return value.length > 40 ? value.slice(0, 40) + "…" : value;
    }

    return "";
  }
}
