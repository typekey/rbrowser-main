import { hasTssInterval, parseTssRegion } from "../utils/tss-region";
import type { ILocus, ILocusDna, ILocusRna, ViewMode } from "../config/config";
import type { FavouriteManager } from "../favourite";
import { locusKey } from "./locus-key";
import { logger } from "../utils/logger";

export interface ILocusRendererLike {
  readonly viewRegion: string;
  readonly viewRnaRegion: string;
  /** Coordinate-mode read state (owned by the renderer's AxisController). */
  readonly axisController: {
    readonly isRnaMode: boolean;
    readonly isCdsMode: boolean;
    readonly rnaInfo: {
      strand: "+" | "-";
      chr: string;
      name: string;
      txStart: number;
      txEnd: number;
      tssPos: number;
    } | null;
    readonly cdsInfo: {
      strand: "+" | "-";
      chr: string;
      name: string;
    } | null;
  };
  readonly transcriptInfo: {
    gene_id: string;
    trans_id: string;
    trans_name: string;
    gene_name: string;
    trans_type: string;
    gene_type: string;
  } | null;
  readonly referenceManager: {
    getConfig(): { assembly?: { name?: string } } | undefined;
    /**
     * Optional: switch the active reference by assembly name.
     * Returns the new reference, or `undefined` if not loaded.
     */
    switchByName?(name: string): { assembly?: { name?: string } } | undefined;
    /**
     * Optional: promise that resolves once the last `switchTo()` finished
     * applying the reference (chrom sizes / annotation loaded).
     */
    readonly lastSyncPromise?: Promise<void> | undefined;
  };
  // Mode toggles
  disableRnaMode(): void;
  disableCdsMode(): void;
  incrementModeGeneration(): void;
  // Navigation entry points
  navigateByTranscript(name: string, flank: number): Promise<unknown>;
  /**
   * Optional asymmetric variant — when supplied the manager uses this for
   * RNA-mode navigation so up/down flanks survive a round-trip through
   * history / favourites. Falls back to `navigateByTranscript` with
   * `max(up, down)` when absent.
   */
  navigateByTranscriptAsymmetric?(
    name: string,
    up: number,
    down: number,
  ): Promise<unknown>;
  navigateByTranscriptTss?(name: string, start: number, end: number): Promise<unknown>;
  navigateByTranscriptCDS(name: string, flank: number): Promise<unknown>;
  navigateTo(chr: string, start: number, end: number): void;
}

// ── Public types ────────────────────────────────────────────────────────

export type LocusListener = (locus: ILocus) => void;

export interface ILocusSetInput {
  mode?: ViewMode;
  trans_id?: string;
  trans_name?: string;
  gene_id?: string;
  gene_name?: string;
  up?: number;
  down?: number;
  // DNA-mode navigation
  chr?: string;
  start?: number;
  end?: number;
}

/**
 * 10-char base36 random id. Cryptographic randomness is not needed (the id
 * just labels a snapshot for change-detection in subscribers).
 */
function defaultGenId(): string {
  return Math.random().toString(36).slice(2, 12);
}

function defaultNow(): string {
  return new Date().toISOString();
}

/** Parse a UCSC-style "chr:start-end" region; returns null on mismatch. */
function parseDnaRegion(
  s: string,
): { chr: string; start: number; end: number } | null {
  const m = s.match(/^([\w.]+):(\d+)-(\d+)$/);
  if (!m) return null;
  return { chr: m[1], start: parseInt(m[2], 10), end: parseInt(m[3], 10) };
}

// ── LocusManager ────────────────────────────────────────────────────────

export class LocusManager {
  private readonly _renderer: ILocusRendererLike;
  private readonly _favouriteManager: FavouriteManager;
  private readonly _genId: () => string;
  private readonly _now: () => string;

  /** Last cached snapshot — returned by `getLocus` between content changes. */
  private _cached: ILocus | null = null;
  /**
   * JSON of the last seen "content" fields (everything except id / time /
   * isFavorite). When `tick()` recomputes and this string is unchanged,
   * no new id is minted.
   */
  private _lastContentJson: string = "";

  private _sigViewRegion: string = "";
  private _sigViewRnaRegion: string = "";
  private _sigMode: ViewMode | "" = "";
  private _sigAssembly: string = "";
  private _sigTransId: string | undefined = undefined;
  private _sigGeneId: string | undefined = undefined;

  private _listeners: LocusListener[] = [];

  constructor(
    renderer: ILocusRendererLike,
    favouriteManager: FavouriteManager,
    opts?: { genId?: () => string; now?: () => string },
  ) {
    this._renderer = renderer;
    this._favouriteManager = favouriteManager;
    this._genId = opts?.genId ?? defaultGenId;
    this._now = opts?.now ?? defaultNow;
  }

  // ── Read API ──────────────────────────────────────────────────────────

  /**
   * Full ILocus snapshot. Lazily composes on first call and after
   * any `tick()` that detected a content change; otherwise returns the
   * cached object (referentially stable, so consumers can use it as a
   * React dependency).
   */
  getLocus(): ILocus {
    if (!this._cached) {
      // Force a first compute; tick() always returns a fresh locus when
      // the cache is empty.
      const fresh = this.tick();
      // tick() may have refused to emit (e.g. mid-construction) — fall
      // back to a direct compose so callers always get a valid object.
      return fresh ?? this._compose();
    }
    // Always refresh isFavorite on read — cheap and lets the card stay
    // accurate even between content-changing ticks.
    return { ...this._cached, isFavorite: this.getIsFavorite() };
  }

  /** Current axis mode (DNA / RNA / CDS). */
  getMode(): ViewMode {
    return this._renderer.axisController.isCdsMode
      ? "cds"
      : this._renderer.axisController.isRnaMode
        ? "rna"
        : "dna";
  }

  /** Active reference assembly name (e.g. "GRCh38"). Empty string if none. */
  getAssembly(): string {
    return this._renderer.referenceManager.getConfig()?.assembly?.name ?? "";
  }

  /** RNA-side identity sub-object (transcript / gene metadata + offset). */
  getRNALocus(): ILocusRna {
    return this._composeRna();
  }

  /** DNA-side coordinate sub-object (chr / start / end + assembly). */
  getDNALocus(): ILocusDna {
    return this._composeDna();
  }

  getIsFavorite(): boolean {
    // Cheap path: if we have a cached locus and only the favourite
    // status could have changed, key from the cache.
    const cached = this._cached;
    if (cached) return this._favouriteManager.hasKey(locusKey(cached));
    // Pre-tick path (first call before any compose): build a minimal
    // probe locus from the cheap content fields. id / time aren't part
    // of locusKey so any dummy values work.
    const probe: ILocus = {
      id: "",
      time: "",
      isFavorite: false,
      mode: this.getMode(),
      rna: this._composeRna(),
      dna: this._composeDna(),
    };
    return this._favouriteManager.hasKey(locusKey(probe));
  }

  setMode(mode: ViewMode): void {
    const r = this._renderer;
    const current = this.getMode();
    if (mode === current) return;

    r.incrementModeGeneration();

    if (mode === "dna") {
      if (r.axisController.isRnaMode) r.disableRnaMode();
      if (r.axisController.isCdsMode) r.disableCdsMode();
      return;
    }

    // For RNA / CDS we need a transcript name; reach for the active one
    // (rnaInfo) before falling back to the cached transcriptInfo.
    const txName =
      r.axisController.rnaInfo?.name ??
      r.axisController.cdsInfo?.name ??
      r.transcriptInfo?.trans_name ??
      r.transcriptInfo?.trans_id;
    if (!txName) return; // no transcript context — can't switch into RNA / CDS

    // Underlying navigation accepts a single `flank` value, so collapse
    // up / down to their max (preserves asymmetric flanks as far as the
    // renderer's existing API allows).
    const flanks = this._currentFlanks();
    const flank = Math.max(flanks?.up ?? 5000, flanks?.down ?? 5000);
    if (mode === "rna") {
      if (r.axisController.isCdsMode) r.disableCdsMode();
      void r.navigateByTranscript(txName, flank);
    } else if (mode === "cds") {
      if (r.axisController.isRnaMode) r.disableRnaMode();
      void r.navigateByTranscriptCDS(txName, flank);
    }
  }

  async setLocus(input: ILocusSetInput): Promise<void> {
    const r = this._renderer;
    const mode =
      input.mode ?? (this._hasTranscriptInput(input) ? "rna" : "dna");

    if (
      mode === "dna" &&
      input.chr &&
      input.start != null &&
      input.end != null
    ) {
      r.navigateTo(input.chr, input.start, input.end);
      return;
    }

    const txName =
      input.trans_id ?? input.trans_name ?? input.gene_id ?? input.gene_name;
    if (!txName) return; // nothing to navigate to

    const flank = Math.max(input.up ?? 5000, input.down ?? 5000);
    if (mode === "cds") {
      await r.navigateByTranscriptCDS(txName, flank);
    } else {
      await r.navigateByTranscript(txName, flank);
    }
  }

  async navigateToLocus(locus: ILocus): Promise<boolean> {
    const r = this._renderer;

    // ── 1. Assembly check ────────────────────────────────────────────
    const desiredAssembly = locus.dna.assembly || locus.rna.assembly || "";
    const currentAssembly = this.getAssembly();
    if (
      desiredAssembly &&
      currentAssembly &&
      desiredAssembly !== currentAssembly
    ) {
      const refMgr = r.referenceManager;
      const switched = refMgr.switchByName?.(desiredAssembly);
      if (!switched) {
        logger.warn(
          `[LocusManager] cannot navigate to locus on assembly "${desiredAssembly}": ` +
            `reference not loaded (current: "${currentAssembly}").`,
        );
        return false;
      }
      // Wait for the reference's channels / chrom sizes to land before
      // we try to navigate against them.
      try {
        await refMgr.lastSyncPromise;
      } catch {
        /* reference sync errors fall through — best effort */
      }
    }

    // ── 2 + 3. Mode + identity dispatch ──────────────────────────────
    if (locus.mode === "dna") {
      if (!locus.dna.chr) {
        logger.warn(
          `[LocusManager] cannot navigate to DNA locus without chr.`,
        );
        return false;
      }
      if (r.axisController.isRnaMode) r.disableRnaMode();
      if (r.axisController.isCdsMode) r.disableCdsMode();
      r.incrementModeGeneration();
      r.navigateTo(locus.dna.chr, locus.dna.start, locus.dna.end);
      return true;
    }

    const txName =
      locus.rna.trans_id ??
      locus.rna.trans_name ??
      locus.rna.gene_id ??
      locus.rna.gene_name;
    if (!txName) {
      logger.warn(
        `[LocusManager] cannot navigate to ${locus.mode.toUpperCase()} locus: ` +
          `no transcript identity (trans_id / trans_name / gene_id / gene_name).`,
      );
      return false;
    }
    if (locus.mode === "rna" && hasTssInterval(locus.rna)) {
      if (!r.navigateByTranscriptTss) return false;
      await r.navigateByTranscriptTss(txName, locus.rna.tssStart, locus.rna.tssEnd);
      return true;
    }
    const up = locus.rna.up ?? 5000;
    const down = locus.rna.down ?? 5000;
    r.incrementModeGeneration();
    if (locus.mode === "cds") {
      if (r.axisController.isRnaMode) r.disableRnaMode();
      await r.navigateByTranscriptCDS(txName, Math.max(up, down));
    } else {
      if (r.axisController.isCdsMode) r.disableCdsMode();
      if (r.navigateByTranscriptAsymmetric) {
        await r.navigateByTranscriptAsymmetric(txName, up, down);
      } else {
        await r.navigateByTranscript(txName, Math.max(up, down));
      }
    }
    return true;
  }

  on(listener: LocusListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  tick(): ILocus | null {
    const r = this._renderer;

    const mode: ViewMode = r.axisController.isCdsMode
      ? "cds"
      : r.axisController.isRnaMode
        ? "rna"
        : "dna";
    const viewRegion = r.viewRegion;
    const viewRnaRegion = r.viewRnaRegion;
    const assembly = this.getAssembly();
    const tx = r.transcriptInfo;
    const transId = tx?.trans_id;
    const geneId = tx?.gene_id;

    if (
      this._cached &&
      mode === this._sigMode &&
      viewRegion === this._sigViewRegion &&
      viewRnaRegion === this._sigViewRnaRegion &&
      assembly === this._sigAssembly &&
      transId === this._sigTransId &&
      geneId === this._sigGeneId
    ) {
      const fav = this.getIsFavorite();
      if (fav !== this._cached.isFavorite) {
        this._cached = { ...this._cached, isFavorite: fav };
      }
      return null;
    }

    const content = this._composeContent();
    const json = JSON.stringify(content);
    if (json === this._lastContentJson && this._cached) {
      this._sigMode = mode;
      this._sigViewRegion = viewRegion;
      this._sigViewRnaRegion = viewRnaRegion;
      this._sigAssembly = assembly;
      this._sigTransId = transId;
      this._sigGeneId = geneId;
      const fav = this.getIsFavorite();
      if (fav !== this._cached.isFavorite) {
        this._cached = { ...this._cached, isFavorite: fav };
      }
      return null;
    }
    this._lastContentJson = json;
    this._sigMode = mode;
    this._sigViewRegion = viewRegion;
    this._sigViewRnaRegion = viewRnaRegion;
    this._sigAssembly = assembly;
    this._sigTransId = transId;
    this._sigGeneId = geneId;
    const id = this._genId();
    const time = this._now();
    const locus: ILocus = {
      id,
      time,
      isFavorite: this.getIsFavorite(),
      rna: content.rna,
      dna: content.dna,
      mode: content.mode,
    };
    this._cached = locus;
    for (const l of this._listeners) l(locus);
    return locus;
  }

  // ── Internals ─────────────────────────────────────────────────────────

  /** Compose the content fields used for change detection. */
  private _composeContent(): {
    rna: ILocusRna;
    dna: ILocusDna;
    mode: ViewMode;
  } {
    return {
      rna: this._composeRna(),
      dna: this._composeDna(),
      mode: this.getMode(),
    };
  }

  /** Compose a fresh ILocus directly from renderer state. */
  private _compose(): ILocus {
    const content = this._composeContent();
    return {
      id: this._genId(),
      time: this._now(),
      isFavorite: this.getIsFavorite(),
      ...content,
    };
  }

  private _composeRna(): ILocusRna {
    const r = this._renderer;
    const tx = r.transcriptInfo;
    const out: ILocusRna = { assembly: this.getAssembly() };
    const strand =
      r.axisController.rnaInfo?.strand ?? r.axisController.cdsInfo?.strand;
    if (strand) out.strand = strand;
    if (tx?.trans_id) out.trans_id = tx.trans_id;
    if (tx?.trans_name) out.trans_name = tx.trans_name;
    if (tx?.trans_type) out.trans_type = tx.trans_type;
    if (tx?.gene_id) out.gene_id = tx.gene_id;
    if (tx?.gene_name) out.gene_name = tx.gene_name;
    if (tx?.gene_type) out.gene_type = tx.gene_type;
    if (r.axisController.isRnaMode) {
      const interval = parseTssRegion(r.viewRnaRegion);
      if (interval) {
        out.tssStart = interval.start;
        out.tssEnd = interval.end;
      }
    }
    const flanks = this._currentFlanks();
    if (flanks) {
      out.up = flanks.up;
      out.down = flanks.down;
    }
    return out;
  }

  private _composeDna(): ILocusDna {
    const r = this._renderer;
    const assembly = this.getAssembly();
    // viewRegion is "chr:start-end" — the same string the search input shows
    // in DNA mode. In RNA / CDS mode it still reflects the underlying
    // genomic window (the renderer clamps it to chromosome bounds).
    const parsed = parseDnaRegion(r.viewRegion);
    if (parsed) {
      return { ...parsed, assembly };
    }
    // Fallback: pull what we can from rnaInfo (which carries the genomic
    // transcript span); cdsInfo lacks txStart/txEnd so it can't backfill.
    if (r.axisController.rnaInfo) {
      return {
        chr: r.axisController.rnaInfo.chr,
        start: r.axisController.rnaInfo.txStart,
        end: r.axisController.rnaInfo.txEnd,
        assembly,
      };
    }
    if (r.axisController.cdsInfo) {
      return { chr: r.axisController.cdsInfo.chr, start: 0, end: 0, assembly };
    }
    return { chr: "", start: 0, end: 0, assembly };
  }

  private _currentFlanks(): { up: number; down: number } | null {
    const r = this._renderer;
    if (r.axisController.isRnaMode && r.axisController.rnaInfo) {
      const domain = parseDnaRegion(r.viewRegion);
      if (!domain) return null;
      return { up: Math.max(0, r.axisController.rnaInfo.txStart - domain.start), down: Math.max(0, domain.end - r.axisController.rnaInfo.txEnd) };
    }
    const m = r.viewRnaRegion.match(/^[\w][\w.-]*:(\d+):(\d+)$/);
    if (m) return { up: parseInt(m[1], 10), down: parseInt(m[2], 10) };
    return null;
  }

  private _hasTranscriptInput(input: ILocusSetInput): boolean {
    return !!(
      input.trans_id ??
      input.trans_name ??
      input.gene_id ??
      input.gene_name
    );
  }
}
