import type { IReferenceConfig, IDefaultLocus } from "../config/config";
import type { IChannel } from "../channel";
import {
  openTranscriptSearch,
  type TranscriptSearch,
  type ITranscriptSearchHit,
} from "../data/parser/TranscriptSearchParser";
import { isSqliteTranscriptUrl } from "../data/parser/transcript-from-sqlite";
import { findFirstTranscriptLocus } from "./first-transcript";

export type DefaultLocusPlan =
  | { kind: "rna-name"; locus: IDefaultLocus }
  | { kind: "rna-annotation"; locus: IDefaultLocus }
  | { kind: "dna"; locus: IDefaultLocus };

export interface ITrans {
  /** Ensembl transcript / gene identifier (e.g. `ENST00000054666.11`). */
  trans_id: string;
  /** Display name (e.g. `VAMP3-201` or `VAMP3`). */
  trans_name: string;
  trans_type: string;
  level: "gene" | "transcript";
  strand?: string;
}

interface IRendererLike {
  applyReference(ref: IReferenceConfig): void | Promise<void>;
  /** True once the renderer has been destroyed (React Strict Mode teardown). */
  readonly isDestroyed?: boolean;
  readonly channelManager: {
    replaceAll(channels: IChannel[]): Promise<void> | void;
    addDirect(channel: IChannel): void;
  };
}

// ── Event types ──────────────────────────────────────────────────────────────

export type ReferenceManagerEvent =
  "add" | "remove" | "update" | "switch" | "replace";

export type ReferenceManagerListener = (
  event: ReferenceManagerEvent,
  detail?: {
    index?: number;
    ref?: IReferenceConfig;
    refs?: IReferenceConfig[];
    activeIndex?: number;
  },
) => void;

export class ReferenceManager {
  private _refs: IReferenceConfig[] = [];
  private _activeIndex = 0;
  private _listeners: ReferenceManagerListener[] = [];
  private readonly _renderer: IRendererLike;

  constructor(
    renderer: IRendererLike,
    initial?: IReferenceConfig | IReferenceConfig[],
  ) {
    this._renderer = renderer;
    if (initial) {
      if (Array.isArray(initial)) {
        this._refs = [...initial];
      } else {
        this._refs = [initial];
      }
    }
  }

  on(listener: ReferenceManagerListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  private _emit(
    event: ReferenceManagerEvent,
    detail?: Parameters<ReferenceManagerListener>[1],
  ) {
    for (const l of this._listeners) l(event, detail);
  }

  /** All loaded reference configurations (ordered). */
  getAll(): IReferenceConfig[] {
    return [...this._refs];
  }

  getConfig(): IReferenceConfig | undefined {
    return this._refs[this._activeIndex];
  }

  /** Index of the currently active reference. */
  getActiveIndex(): number {
    return this._activeIndex;
  }

  /** Number of loaded references. */
  get count(): number {
    return this._refs.length;
  }

  get active(): IReferenceConfig | undefined {
    return this._refs[this._activeIndex];
  }

  /** Index of the currently active reference. */
  get activeIndex(): number {
    return this._activeIndex;
  }

  /** Return the reference at `index`, or `undefined`. */
  get(index: number): IReferenceConfig | undefined {
    return this._refs[index];
  }

  add(ref: IReferenceConfig): number {
    this._refs.push(ref);
    const index = this._refs.length - 1;
    this._emit("add", { index, ref });
    return index;
  }

  update(index: number, ref: IReferenceConfig): void {
    if (index < 0 || index >= this._refs.length) return;
    this._refs[index] = ref;
    this._emit("update", { index, ref });
    if (index === this._activeIndex) {
      // Active reference mutated — drop cached transcript-search handle.
      this._transcriptSearch = null;
      this._emit("switch", {
        index,
        ref,
        activeIndex: this._activeIndex,
      });
    }
  }

  remove(index: number): void {
    if (index < 0 || index >= this._refs.length) return;
    const removed = this._refs[index];
    this._refs.splice(index, 1);

    // Keep _activeIndex valid
    if (this._refs.length === 0) {
      this._activeIndex = 0;
    } else if (index < this._activeIndex) {
      this._activeIndex = Math.max(0, this._activeIndex - 1);
    } else if (this._activeIndex >= this._refs.length) {
      this._activeIndex = this._refs.length - 1;
    }

    this._emit("remove", { index, ref: removed });
  }

  /**
   * Replace the entire reference list.
   * Active index is clamped to the new list length.
   * A "switch" event is emitted after replacement.
   */
  replaceAll(refs: IReferenceConfig[]): void {
    this._refs = [...refs];
    this._activeIndex = Math.min(
      this._activeIndex,
      Math.max(0, refs.length - 1),
    );
    // Wholesale list swap — any cached search handle is stale.
    this._transcriptSearch = null;
    this._emit("replace", {
      refs: this.getAll(),
      activeIndex: this._activeIndex,
    });
    if (this._refs.length > 0) {
      this._emit("switch", {
        index: this._activeIndex,
        ref: this._refs[this._activeIndex],
        activeIndex: this._activeIndex,
      });
    }
  }

  switchTo(index: number): IReferenceConfig | undefined {
    if (index < 0 || index >= this._refs.length) return undefined;
    this._activeIndex = index;
    const ref = this._refs[index];
    this._transcriptSearch = null;
    this._emit("switch", { index, ref, activeIndex: index });
    void this._renderer.applyReference(ref);
    this._lastSyncPromise = this.syncChannels();
    return ref;
  }

  get lastSyncPromise(): Promise<void> | undefined {
    return this._lastSyncPromise;
  }
  private _lastSyncPromise: Promise<void> | undefined;

  async resolveDefaultLocus(): Promise<DefaultLocusPlan | undefined> {
    const ref = this.active;
    if (!ref) return undefined;

    const dl = ref.defaultLocus;
    const rna = dl?.rna;
    const hasRnaName =
      !!rna &&
      !!(rna.trans_id || rna.trans_name || rna.gene_id || rna.gene_name);

    // A transcript name is only resolvable when the reference exposes a REST
    // API or a SQLite catalogue (`.rba` / `.sqlite`). `.rbi` index files are
    // not name-searchable.
    const tx = ref.transcriptome;
    const hasUsableCatalogue =
      !!tx?.api ||
      (!!tx?.annotation?.transcripts &&
        isSqliteTranscriptUrl(tx.annotation.transcripts));
    const hasGff = !!tx?.annotation?.url;

    if (hasRnaName && hasUsableCatalogue) {
      return { kind: "rna-name", locus: dl! };
    }

    if (hasRnaName && dl?.dna && hasGff) {
      return { kind: "rna-annotation", locus: { ...dl, mode: "rna" } };
    }

    if (dl?.dna) {
      return { kind: "dna", locus: { ...dl, mode: "dna" } };
    }
    const fallback = await findFirstTranscriptLocus(
      ref.transcriptome?.annotation,
    );
    if (!fallback) return undefined;
    const fbName =
      fallback.rna?.trans_id ??
      fallback.rna?.trans_name ??
      fallback.rna?.gene_id ??
      fallback.rna?.gene_name;
    if (fbName && fallback.dna && hasGff) {
      return { kind: "rna-annotation", locus: { ...fallback, mode: "rna" } };
    }
    return { kind: "dna", locus: { ...fallback, mode: "dna" } };
  }

  switchByName(name: string): IReferenceConfig | undefined {
    const idx = this._refs.findIndex(
      (r) => r.assembly.name.toLowerCase() === name.toLowerCase(),
    );
    if (idx === -1) return undefined;
    return this.switchTo(idx);
  }

  labelFor(index: number): string {
    const r = this._refs[index];
    if (!r) return "";
    const asmName = r.assembly.name;
    if (!r.species) return asmName;
    const parts: string[] = [];
    if (r.species.name) parts.push(r.species.name);
    if (r.species.label) parts.push(`(${r.species.label})`);
    return parts.length > 0 ? `${asmName} — ${parts.join(" ")}` : asmName;
  }

  async syncChannels(): Promise<void> {
    const ref = this.active;
    if (!ref) return;
    const channelManager = this._renderer.channelManager;

    const channels: IChannel[] = [];

    if (this._renderer.isDestroyed) return;

    const hasScoreData = !!ref.transcriptome?.scoreExonJunction;

    const faUrl = ref.genome?.fasta?.url;
    const faFai = ref.genome?.fasta?.fai;
    const faGzi = ref.genome?.fasta?.gzi;
    if (faUrl) {
      channels.push({
        name: "Sequence",
        plot: "sequence",
        style: { pinned: true, padding: "0" },
        group: { name: "Expression", style: { color: "#f6a385" } },
        data: {
          method: "remote",
          format: "fasta",
          url: faUrl,
          index: faFai,
          index2: faGzi,
        },
        order: 1,
      });
    }

    const gffUrl = ref.transcriptome?.annotation?.url;
    const gffIndex = ref.transcriptome?.annotation?.index;
    if (gffUrl) {
      channels.push({
        name: "Transcript",
        plot: "transcript",
        style: {
          pinned: true,
          height: 160,
          padding: "0.05",
          label: { color: "#3867d6" },
        },
        group: { name: "RNA Annotation", style: { color: "#3867d6" } },
        data: { method: "remote", format: "gff", url: gffUrl, index: gffIndex },
        order: 2,
      });
    }

    channels.push({
      name: "Transcript Structure",
      plot: "rect",
      group: { name: "RNA Annotation", style: { color: "#3867d6" } },
      style: {
        height: 40,
        maxHeight: 7,
        padding: "0.1",
        keys: ["featureType"],
        expand: ["featureType"],
        sep: "|",
        foreground: "#a4b0be",
        label: { color: "#3867d6" },
      },
      data: { method: "buildin", format: "transcript", source: "annotation" },
      order: 10,
    });

    channels.push({
      name: "Exon",
      plot: hasScoreData ? "score_rect" : "rect",
      group: { name: "RNA Annotation", style: { color: "#00b894" } },
      style: hasScoreData
        ? {
            height: 40,
            maxHeight: 5,
            keys: ["Tissue"],
            expand: ["Tissue"],
            sep: "|",
            foreground: { colormap: "coolwarm" },
            label: { color: "#00b894" },
          }
        : {
            height: 40,
            maxHeight: 5,
            foreground: "#00b894",
            label: { color: "#00b894" },
          },
      data: hasScoreData
        ? { method: "buildin", format: "exon" }
        : { method: "buildin", format: "exon", source: "annotation" },
      order: 11,
    });

    channels.push({
      name: "Splice Junction",
      plot: "score_curve",
      group: { name: "RNA Annotation", style: { color: "#00b894" } },
      style: hasScoreData
        ? {
            height: 40,
            maxHeight: 5,
            padding: "0",
            keys: ["Tissue"],
            expand: ["Tissue"],
            sep: "|",
            foreground: { colormap: "coolwarm" },
            label: { color: "#00b894" },
          }
        : {
            height: 40,
            maxHeight: 5,
            padding: "0",
            foreground: "#00b894",
            label: { color: "#00b894" },
          },
      data: hasScoreData
        ? { method: "buildin", format: "junction" }
        : { method: "buildin", format: "junction", source: "annotation" },
      order: 12,
    });
    await channelManager.replaceAll(channels);
  }

  get activeTooltip(): string {
    const r = this.active;
    if (!r) return "";
    const name = r.species?.name ?? "";
    const label = r.species?.label ?? "";
    if (name && label) return `${name} (${label})`;
    if (name) return name;
    if (r.assembly.version) return r.assembly.version;
    return "";
  }

  private _transcriptSearch: Promise<TranscriptSearch> | null = null;

  /**
   * Map a SQLite search hit into the UI-facing suggestion shape.
   */
  private _hitToSuggestion(h: ITranscriptSearchHit): ITrans | null {
    const isTranscript = !!(h.transcript_name || h.transcript_id);
    const name = h.transcript_name ?? h.gene_name ?? null;
    const id = h.transcript_id ?? h.gene_id ?? null;
    if (!name || !id) return null;
    const type =
      (h.biotype && h.biotype.length > 0 ? h.biotype : h.feature_type) ??
      "unknown";
    return {
      trans_id: id,
      trans_name: name,
      trans_type: type,
      level: isTranscript ? "transcript" : "gene",
    };
  }

  async searchTranscripts(query: string, limit = 20): Promise<ITrans[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const ref = this.active;
    if (!ref) return [];

    const apiBase = ref.transcriptome?.api;
    const sqliteUrl = ref.transcriptome?.annotation?.transcripts;
    const assembly = ref.assembly?.build ?? ref.assembly?.name ?? "";

    try {
      if (apiBase) {
        // ── 1. REST API (preferred) ────────────────────────────────────
        const resp = await fetch(
          `https://api.rbrowser.org/api/v1/trans/${encodeURIComponent(q)}/${assembly}/`,
        );
        const data = await resp.json();
        if (data.status !== 1 || !Array.isArray(data.results)) return [];
        return (data.results as any[]).slice(0, limit).map((r) => {
          const id = String(r.trans_id ?? "");
          const type = String(r.trans_type ?? "");
          const isGene =
            /^ENSG/i.test(id) || /gene/i.test(type) || id === r.gene_id;
          return {
            trans_id: id,
            trans_name: String(r.trans_name ?? id),
            trans_type: type || "unknown",
            level: isGene ? "gene" : "transcript",
          };
        });
      }

      if (sqliteUrl) {
        // ── 2. SQLite over HTTP Range ──────────────────────────────────
        if (!this._transcriptSearch) {
          this._transcriptSearch = openTranscriptSearch(sqliteUrl);
        }
        const search = await this._transcriptSearch;
        const hits = await search.search(q, limit);
        // The SQLite index aliases `gene_name` only against the
        // gene-level feature, so a gene-name search returns one gene row
        // and no transcripts. Fan out each gene hit to its child
        // transcripts so both appear in the dropdown.
        const geneHits = hits.filter(
          (h) => h.feature_type === "gene" && h.gene_id,
        );
        const expanded = await Promise.all(
          geneHits.map((g) => search.transcriptsOfGene(g.gene_id!, 50)),
        );
        const seen = new Set<string>();
        const all: ITranscriptSearchHit[] = [];
        for (const h of [...hits, ...expanded.flat()]) {
          const k = `${h.feature_type}\0${h.transcript_id ?? ""}\0${h.gene_id ?? ""}\0${h.chrom}:${h.start}-${h.end}`;
          if (seen.has(k)) continue;
          seen.add(k);
          all.push(h);
        }
        return all
          .map((h) => this._hitToSuggestion(h))
          .filter((s): s is ITrans => s !== null);
      }
      return [];
    } catch {
      return [];
    }
  }
}
