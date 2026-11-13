import { ChannelView } from "../index";
import { SubChannelGroupView } from "../manager/sub-channel-group-view";
import type { IChannel } from "../channel-types";
import { ChannelStatus } from "../status";
import { ModalDialog } from "../../dialog";
import { assignBamLanes } from "../../feature/plots/bam-lanes";
import {
  transformGffToTranscripts,
  assignLanes,
  extractModifications,
} from "../../transcript/transform";
import { logger } from "../../utils/logger";

/**
 * Channel expand / collapse lifecycle: splits a channel into per-value
 * sub-channels (creating child ChannelViews + a SubChannelGroupView),
 * distributes filtered data to them, and tears them down on collapse.
 * Reads/mutates channel state through the ChannelView back-reference.
 */
export class ChannelExpand {
  constructor(private readonly v: ChannelView) {}

  setReorderCallback(
    cb: ((fromIndex: number, toIndex: number) => void) | undefined,
  ): void {
    this.v.onReorderCallback = cb;
  }

  /** Mount the expand group DOM (called by base-renderer after layout). */
  mountExpandGroup(container: HTMLElement): void {
    if (this.v._expandGroupView) {
      this.v._expandGroupView.mount(container, this.v.trackContainer ?? undefined);
    }
  }

  /**
   * Expand this channel: parse data to find unique values of the expand
   * field(s), create one sub-channel per value, and notify the renderer.
   */
  expand(): void {
    if (this.v._destroyed) return;
    if (this.v._isExpanded || this.v._isSubChannel || !this.v.canExpand) return;

    // Clear any stale sub-channels from a previous partial expand
    if (this.v._subChannels.length > 0) {
      for (const sub of this.v._subChannels) sub.destroy();
      this.v._subChannels = [];
    }
    // Tear down stale expand group view
    if (this.v._expandGroupView) {
      logger.warn(
        `[ChannelView] expand() found stale _expandGroupView for "${this.v.config.name}" — destroying`,
      );
      this.v._expandGroupView.destroy();
      this.v._expandGroupView = null;
    }

    const expandFields = this.v.normalizeExpandFields();
    // Compute from ALL data; filter selection is the sole mechanism that
    // controls which sub-channels are displayed.
    const allValues = this.computeExpandValues(expandFields);

    // Apply filter selection if set
    const uniqueValues = this.v._expandFilterSelection
      ? allValues.filter((v) => this.v._expandFilterSelection!.includes(v))
      : allValues;

    if (uniqueValues.length === 0) return;

    const COMPOSITE_SEP = "\x00";


    // Per-field unique value sets for sample label coloring; each field
    // gets its own color palette partition.
    const fieldValueSets: Map<string, string[]> = new Map();
    for (const field of expandFields) {
      fieldValueSets.set(field, []);
    }
    for (const compositeKey of uniqueValues) {
      const parts =
        expandFields.length === 1
          ? [compositeKey]
          : compositeKey.split(COMPOSITE_SEP);
      for (let f = 0; f < expandFields.length; f++) {
        const fieldValues = fieldValueSets.get(expandFields[f])!;
        if (parts[f] && !fieldValues.includes(parts[f])) {
          fieldValues.push(parts[f]);
        }
      }
    }

    // Create sub-channels
    for (const value of uniqueValues) {
      // Display name: single-field uses the value directly; multi-field
      // joins parts with " · " for readability.
      const displayName =
        expandFields.length === 1
          ? value
          : value.split(COMPOSITE_SEP).join(" · ");

      const subConfig: IChannel = {
        ...this.v.config,
        name: displayName,
        style: {
          ...this.v.config.style,
          expand: undefined, // Sub-channels don't expand further
        },
        sortable: false,
      };

      const sub = new ChannelView(
        this.v.context,
        subConfig,
        0,
        this.v.dataLoader,
        this.v.loadingConfig,
        this.v.channelLabelConfig,
        this.v.onDirtyCallback,
        this.v.getInteractionController,
        undefined,
      );

      sub._isSubChannel = true;
      sub._parentChannel = this.v;
      sub._expandFilterValue = value;
      // Propagate label-hover callback so sub-channel labels also suppress tooltip
      sub._notifyLabelHover = this.v._notifyLabelHover;
      // Propagate menu action so sub-channels can download data/images
      sub.onMenuAction = this.v.onMenuAction;

      this.v._subChannels.push(sub);
    }

    // Create the SubChannelGroupView to manage scrolling & layout
    const parentHeight = this.v.config.style?.height ?? 24;
    const maxVisible = this.v.config.style?.maxHeight ?? 5;
    this.v._expandGroupView = new SubChannelGroupView(
      this.v.context,
      this.v._subChannels,
      parentHeight,
      maxVisible,
      this.v.onDirtyCallback,
      expandFields, // pass expand fields for sample label rendering
      fieldValueSets, // pass field→uniqueValues for color mapping
      this.v.config.name, // channel name shown as tooltip title
    );

    // Wire sub-channel reorder to group-internal reordering
    for (const sub of this.v._subChannels) {
      sub.setReorderCallback((from, to) => {
        this.v._expandGroupView?.reorderSubChannel(from, to);
      });
    }

    this.v._isExpanded = true;

    this.distributeDataToSubChannels();

    // Notify the renderer to re-layout and mount the group
    this.v.onExpandCallback?.(this.v, this.v._subChannels, "expand");
  }

  /** Collapse: destroy all sub-channels and notify the renderer. */
  collapse(): void {
    if (!this.v._isExpanded) return;


    // Capture references before clearing state
    const subs = this.v._subChannels;
    const groupView = this.v._expandGroupView;

    // Clear expand state FIRST so getPreferredHeight returns base height
    this.v._isExpanded = false;
    this.v._expandGroupView = null;

    // Notify renderer to re-layout (uses correct collapsed height)
    this.v.onExpandCallback?.(this.v, subs, "collapse");

    // Destroy group view (removes group container from DOM)
    if (groupView) {
      groupView.destroy();
    }

    for (const sub of subs) {
      sub.destroy();
    }
    this.v._subChannels = [];

    this.v.onDirtyCallback?.();
  }

  /**
   * Toggle expand/collapse. Shows a confirmation dialog when expanding would
   * create a large number of sub-channels.
   */
  async toggleExpand(): Promise<void> {
    if (this.v._isExpanded) {
      this.collapse();
      return;
    }

    // How many sub-channels would be created?
    const fields = this.v.normalizeExpandFields();
    const allValues = this.computeExpandValues(fields);
    const count = this.v._expandFilterSelection
      ? allValues.filter((v) => this.v._expandFilterSelection!.includes(v)).length
      : allValues.length;

    if (count > 20 && !ChannelView._skipExpandConfirm) {
      const result = await ModalDialog.confirm(
        "Too many sub-channels",
        `Expanding "${this.v.config.name}" will create ${count} sub-channels. ` +
          `Too many sub-channels may affect browser performance and user experience.\n\n` +
          `Do you want to continue?`,
        {
          confirmLabel: `Show ${count} channels`,
          checkboxLabel: "Don't remind me again",
        },
      );
      if (!result.confirmed) return;
      if (result.checked) ChannelView._skipExpandConfirm = true;
    }

    this.expand();
  }

  /**
   * Get all unique expand values for the current data.
   * Used by the Filter dialog to show selectable values.
   */
  getExpandValues(): string[] {
    const fields = this.v.normalizeExpandFields();
    return this.computeExpandValues(fields);
  }

  /**
   * Compute the unique (non-empty) composite values for expand field(s).
   * Single field → simple unique values; multiple → composite keys joined
   * by `\x00` (internal separator) so the caller can split them back.
   */
  public computeExpandValues(fieldNames: string[]): string[] {
    if (!this.v.data || this.v.data.length === 0 || fieldNames.length === 0)
      return [];

    const seen = new Set<string>();
    const order: string[] = [];
    const COMPOSITE_SEP = "\x00";

    for (const feature of this.v.data) {
      const parsed = this.v.parseRestFields(feature);
      if (!parsed) continue;

      // Composite key from all expand fields; skip if all parts empty
      const parts = fieldNames.map((f) => parsed[f] ?? "");
      if (parts.every((p) => !p)) continue;

      const compositeKey =
        fieldNames.length === 1 ? parts[0] : parts.join(COMPOSITE_SEP);
      if (compositeKey && !seen.has(compositeKey)) {
        seen.add(compositeKey);
        order.push(compositeKey);
      }
    }

    // Sort by expand fields in order (first field primary, etc.)
    if (fieldNames.length === 1) {
      order.sort((a, b) => a.localeCompare(b));
    } else {
      order.sort((a, b) => {
        const partsA = a.split(COMPOSITE_SEP);
        const partsB = b.split(COMPOSITE_SEP);
        for (let i = 0; i < fieldNames.length; i++) {
          const cmp = (partsA[i] ?? "").localeCompare(partsB[i] ?? "");
          if (cmp !== 0) return cmp;
        }
        return 0;
      });
    }

    return order;
  }

  /**
   * Distribute the parent channel's data to sub-channels, filtering by the
   * expand field value(s). Called after expand and after every data update.
   * Pre-computes expand-field indices so each record needs only a single
   * `split()` + index lookup instead of full `parseRestFields()`.
   */
  public distributeDataToSubChannels(): void {
    if (!this.v._isExpanded || this.v._subChannels.length === 0) return;

    const expandFields = this.v.normalizeExpandFields();
    if (expandFields.length === 0) return;

    const COMPOSITE_SEP = "\x00";
    const keys: string[] | undefined = this.v.config.style?.keys as any;
    const sep: string = (this.v.config.style?.sep as any) || "|";

    // Pre-compute field indices (avoids indexOf per record)
    const fieldIndices: number[] = keys
      ? expandFields.map((f) => keys.indexOf(f))
      : [];
    const allIndicesValid = fieldIndices.every((idx) => idx >= 0);

    // Build per-value buckets in one pass (O(n))
    const buckets = new Map<string, any[]>();
    for (const sub of this.v._subChannels) {
      buckets.set(sub._expandFilterValue!, []);
    }

    // Fast path (keys configured + all indices valid): split once and use
    // direct index access. Guarded on data carrying a `rest` string — BED
    // features from @gmod/bed have no `rest` (extra columns live in `name`,
    // possibly UCSC `Key=Value;` or pipe-delimited), so those fall through to
    // the slow `parseRestFields()` path.
    const firstFeature = this.v.data.length > 0 ? this.v.data[0] : null;
    const hasRestStrings =
      firstFeature &&
      typeof firstFeature.rest === "string" &&
      firstFeature.rest.length > 0;

    if (keys && allIndicesValid && hasRestStrings) {
      const singleField = expandFields.length === 1;
      const idx0 = fieldIndices[0];

      for (const feature of this.v.data) {
        if (typeof feature.rest !== "string" || !feature.rest) continue;
        const tokens = feature._tokens ?? feature.rest.split(sep);

        let compositeKey: string;
        if (singleField) {
          compositeKey = idx0 < tokens.length ? tokens[idx0].trim() : "";
        } else {
          const parts: string[] = [];
          for (let fi = 0; fi < fieldIndices.length; fi++) {
            const idx = fieldIndices[fi];
            parts.push(idx < tokens.length ? tokens[idx].trim() : "");
          }
          compositeKey = parts.join(COMPOSITE_SEP);
        }

        if (compositeKey && buckets.has(compositeKey)) {
          buckets.get(compositeKey)!.push(feature);
        }
      }
    } else {
      // Slow path: parseRestFields for non-standard data shapes
      for (const feature of this.v.data) {
        const parsed = this.v.parseRestFields(feature);
        if (!parsed) continue;

        const parts = expandFields.map((f) => parsed[f] ?? "");
        const compositeKey =
          expandFields.length === 1 ? parts[0] : parts.join(COMPOSITE_SEP);

        if (compositeKey && buckets.has(compositeKey)) {
          buckets.get(compositeKey)!.push(feature);
        }
      }
    }

    // Each sub-channel computes its OWN colormap min/max from its own features
    // rather than sharing a global range. A shared range lets a few
    // high-expression tissues dominate the scale and wash out low-expression
    // ones; per-sub ranges keep faint tissues readable.
    const isScorePlot =
      this.v.config.plot === "score_curve" || this.v.config.plot === "score_rect";
    if (isScorePlot) {
      for (const sub of this.v._subChannels) {
        const bucket = buckets.get(sub._expandFilterValue!) ?? [];
        let subMin = Infinity;
        let subMax = -Infinity;
        for (const feature of bucket) {
          if ((feature as any)._parentAggregate) continue; // skip aggregates
          const s = (feature as any).score ?? 0;
          if (s < subMin) subMin = s;
          if (s > subMax) subMax = s;
        }
        if (!isFinite(subMin)) subMin = 0;
        if (!isFinite(subMax) || subMax <= subMin) subMax = subMin + 1;
        sub._globalScoreRange = [subMin, subMax];
      }
    }

    for (const sub of this.v._subChannels) {
      const filtered = buckets.get(sub._expandFilterValue!) ?? [];
      // Not awaited — sub-channels process concurrently via the microtask
      // queue, spreading work across frames.
      sub.expandCtrl.setFilteredData(filtered, this.v.dataRegion);
    }
  }

  /**
   * Receive pre-filtered data from a parent channel (used by sub-channels).
   * Bypasses the normal fetch/cache pipeline.
   * Uses async yielding to avoid blocking the main thread.
   */
  public async setFilteredData(
    data: any[],
    region: { chr: string; start: number; end: number },
  ): Promise<void> {
    this.v.data = data;
    this.v.dataRegion = { ...region };

    // Detect UCSC Key=Value patterns
    this.v.tryAutoDetectStyle();
    this.v.tryAutoExpand();

    this.v.setState({
      status: ChannelStatus.Completed,
      loadedRecords: data.length,
    });

    if (this.v.featureRenderer && this.v.context.gl) {
      // Sub-channels use the global score range (shared across all
      // sub-channels) so colormap ranges are consistent and comparable.
      // Matters for score_rect since it is aliased to heatmap, which uses
      // maxValue / colors.range for normalization and color mapping.
      let subMaxScore: number | undefined;
      let colorsOverride = this.v.normalizeColorsForRenderer();

      if (
        this.v._isSubChannel &&
        (this.v.config.plot === "score_rect" ||
          this.v.config.plot === "score_curve")
      ) {
        if (this.v._globalScoreRange) {
          // Global range computed by the parent across ALL sub-channels
          subMaxScore = this.v._globalScoreRange[1];
          // Inject range so FeatureRenderer's mapValueToColor uses the same
          // [min, max] for all sub-channels
          colorsOverride = {
            ...colorsOverride,
            range: [this.v._globalScoreRange[0], this.v._globalScoreRange[1]],
          };
        } else {
          const scores = data.map((f: any) => f.score ?? 0).filter(isFinite);
          if (scores.length > 0) subMaxScore = Math.max(...scores);
        }
      }
      this.v.featureRenderer.updateData(
        this.v.context.gl,
        data,
        this.v.config.plot || "rect",
        {
          chr: this.v.dataRegion.chr,
          start: this.v.dataRegion.start,
          end: this.v.dataRegion.end,
        },
        colorsOverride,
        this.v.foregroundColor,
        subMaxScore,
      );
    }

    // Score label for sub-channels (score_rect / score_curve)
    if (
      this.v._isSubChannel &&
      (this.v.config.plot === "score_rect" || this.v.config.plot === "score_curve")
    ) {
      if (this.v._globalScoreRange) {
        this.v.updateScoreLabel(
          this.v._globalScoreRange[0],
          this.v._globalScoreRange[1],
        );
      } else {
        const scores = data.map((f: any) => f.score ?? 0).filter(isFinite);
        if (scores.length > 0) {
          this.v.updateScoreLabel(Math.min(...scores), Math.max(...scores));
        }
      }
    }

    // Yield before heavy transforms
    await this.v.yieldToMain();

    // Transcript transform (sub-channel path)
    const isTranscript =
      this.v.config.plot === "transcript" || this.v.config.plot === "rna";
    const isSimpleRna = this.v.config.plot === "simple_rna";
    if (isTranscript && data.length > 0) {
      const txRecords = transformGffToTranscripts(data);
      const { transcripts: laid, maxLane } = assignLanes(txRecords);
      if (laid.length > 0) {
        this.v._transcriptRecords = laid;
        this.v._transcriptLaneCount = maxLane + 1;
        // this.v._txDataDirty = true;
      }
      // Modification records (m6A, m5C, etc.)
      this.v._modificationRecords = extractModifications(data);
    } else if (isSimpleRna && data.length > 0) {
      // simple_rna: data is already TranscriptRecord-compatible (buildin
      // loader), so use it directly without the GFF→TranscriptRecord transform.
      const records = data.filter((d) => d._buildinTranscript) as any[];
      if (records.length > 0) {
        this.v._transcriptRecords = records;
        this.v._transcriptLaneCount = 1;
        // this.v._txDataDirty = true;
      }
    }

    // Yield before BAM lane assignment
    await this.v.yieldToMain();

    // BAM lane assignment (sub-channel path)
    if (this.v.config.plot === "bam" && data.length > 0) {
      if ((data[0] as any)?._txRemapped) {
        const reads = data as any[];
        let maxLane = 0;
        for (const r of reads) if (r.lane > maxLane) maxLane = r.lane;
        this.v._bamReads = reads;
        this.v._bamLaneCount = maxLane + 1;
      } else {
        const rawReads = data.map((rec: any) => ({
          start: rec.start ?? rec.chromStart ?? 0,
          end: rec.end ?? rec.chromEnd ?? 0,
          strand: rec.strand ?? 1,
          readName: rec.name ?? rec.readName ?? undefined,
          readLength:
            rec.seq_length ?? rec.readLength ?? rec.length_on_ref ?? undefined,
          flags: rec.flags ?? undefined,
          mapq: rec.mq ?? rec.mapq ?? rec.mappingQuality ?? undefined,
          cigar: rec.CIGAR ?? rec.cigar ?? undefined,
          seq: rec.seq ?? rec.sequence ?? undefined,
          qual: rec.qual ?? undefined,
          tags: rec.tags ?? rec._tags ?? undefined,
        }));
        const { reads, maxLane } = assignBamLanes(rawReads, 0);
        this.v._bamReads = reads;
        this.v._bamLaneCount = maxLane + 1;
      }
    }

    this.v.onDirtyCallback?.();
  }
}
