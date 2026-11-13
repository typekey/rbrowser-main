import { ChannelView, IChannel } from "../index";
import { BamParser } from "../../data/parser/BamParser";
import { remapTranscriptomeReads } from "../../utils/transcriptome-bam";
import {
  showChannelConfirmDialog,
  showBatchConfirmDialog,
  showDuplicateConfirmDialog,
  showUnsupportedFormatDialog,
  SUPPORTED_FORMATS,
} from "../../drag-drop/index";
import { ModalDialog } from "../../dialog";
import { buildPromise } from "../../data/promises";
import { initChannelConfig, initChannelsConfig } from "../init";
import { RendererStatus } from "../../core/status";
import { defaultConfig } from "../../../../../config/default_config";
import type { BaseRenderer } from "../../core/base-renderer";
import { logger } from "../../utils/logger";

/**
 * Channel lifecycle: add / remove / reorder / replace in the view tree, group
 * score-range + stacked-group sync, the per-channel data-loader pipeline (incl.
 * transcriptome-BAM remap), and load/error bookkeeping. Concrete implementation
 * behind the public ChannelManager facade (IChannelManagerDelegate).
 */
export class ChannelController {
  /** When true, skip the delete-channel confirmation dialog. */
  private _skipDeleteConfirm = false;

  /** Manual unpin is retained until the next drag or channel-set replacement. */
  private manuallyUnpinnedTop = false;

  /**
   * Cached BAM parsers for transcriptome-coordinate remapping, keyed by
   * `url\0index`. Re-used across pan/zoom so the BAM header is parsed once.
   */
  private _txBamParsers: Map<string, BamParser> = new Map();

  constructor(private readonly r: BaseRenderer) {}

  /** Keep config, view and DOM order identical to pinned-first layout order. */
  public syncChannelOrder(views?: ChannelView[]): void {
    const channels =
      views ??
      (this.r.rootView.children.filter(
        (c) => c instanceof ChannelView,
      ) as ChannelView[]);
    const ordered = [
      ...channels.filter((c) => c.isPinned),
      ...channels.filter((c) => !c.isPinned),
    ];
    if (ordered.length && !this.manuallyUnpinnedTop) ordered[0].isPinned = true;
    const others = this.r.rootView.children.filter(
      (c) => !(c instanceof ChannelView) && c !== this.r.addChannelView,
    );
    this.r.rootView.children = [...others, ...ordered, this.r.addChannelView];
    this.r.config.channels = ordered.map((channel, index) => {
      const config = channel.getChannelConfig();
      config.order = index;
      return config;
    });
    this.r.state.totalChannels = ordered.length;
    for (const channel of ordered) {
      // External config updates can change style.pinned without its setter.
      // Synchronise the DOM state and pin icon through the same setter.
      channel.isPinned = channel.isPinned;
      const track = channel.trackContainer;
      if (track?.parentElement) track.parentElement.appendChild(track);
      const group = channel._expandGroupView?.groupContainer;
      if (group?.parentElement) group.parentElement.appendChild(group);
    }
  }

  /** Commit position and pinned state together, then perform one layout. */
  public reorderChannels(
    fromIndex: number,
    toIndex: number,
    pinned?: boolean,
  ): void {
    const channelViews = this.r.rootView.children.filter(
      (c) => c instanceof ChannelView,
    ) as ChannelView[];
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= channelViews.length ||
      toIndex >= channelViews.length
    )
      return;
    const channel = channelViews[fromIndex];
    const nextPinned =
      toIndex === 0 || (pinned ?? channelViews[toIndex].isPinned);
    if (fromIndex === toIndex && channel.isPinned === nextPinned) return;
    this.manuallyUnpinnedTop = false;
    channel.isPinned = nextPinned;
    channelViews.splice(fromIndex, 1);
    channelViews.splice(toIndex, 0, channel);
    this.syncChannelOrder(channelViews);

    // Trigger layout and re-render (transition is "none" at this point,
    // so setting top values here causes no animation).
    if (this.r.context.canvas) {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.r.container?.getBoundingClientRect();
      if (rect) {
        this.r.rootView.layout(0, 0, rect.width * dpr, rect.height * dpr);
        this.r.scrollbar.update();
      }
    }

    this.r.requestRepaint?.();

    // Restore transition for future drag animations AFTER the browser has
    // painted the new positions (requestAnimationFrame ensures one frame delay).
    requestAnimationFrame(() => {
      for (const view of channelViews) {
        const tc = (view as any).trackContainer as HTMLElement | null;
        if (tc) tc.style.transition = "none";
      }
    });
  }

  /**
   * Handle the expand / collapse callback from a ChannelView.
   *
   * The parent ChannelView owns its SubChannelGroupView internally, so:
   * - **expand**: re-run layout (parent's getPreferredHeight now includes
   *   the group), then mount the group's DOM.
   * - **collapse**: re-run layout (height shrinks back to base).
   */
  public handleChannelExpand(
    parent: ChannelView,
    _subChannels: ChannelView[],
    action: "expand" | "collapse",
  ): void {
    // Re-run layout — parent's getPreferredHeight now accounts for the group
    if (this.r.context.canvas) {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.r.container?.getBoundingClientRect();
      if (rect) {
        this.r.rootView.layout(0, 0, rect.width * dpr, rect.height * dpr);
      }
    }

    // Re-check whether the channel scrollbar is needed (height changed)
    this.r.scrollbar.update();

    if (action === "expand" && this.r.container) {
      // Mount after layout so positions are correct
      parent.mountExpandGroup(this.r.container);
    }

    this.r.requestRepaint?.();
  }

  // ── Channel context menu actions ────────────────────────────────────

  /** Handle a menu action dispatched from a ChannelView's context menu. */
  public handleChannelMenuAction(
    channel: ChannelView,
    action: string,
    _payload?: any,
  ): void {
    const channelViews = this.r.rootView.children.filter(
      (c) => c instanceof ChannelView,
    ) as ChannelView[];
    const idx = channelViews.indexOf(channel);

    switch (action) {
      case "togglePin": {
        if (idx < 0) break;
        channel.isPinned = !channel.isPinned;
        this.manuallyUnpinnedTop = !channelViews.some((view) => view.isPinned);
        this.syncChannelOrder();
        this.r._relayoutAndRepaint();
        this.r.requestRepaint?.();
        break;
      }

      case "moveUp":
        if (idx > 0) this.reorderChannels(idx, idx - 1);
        break;

      case "moveDown":
        if (idx >= 0 && idx < channelViews.length - 1)
          this.reorderChannels(idx, idx + 1);
        break;

      case "deleteTrack":
        this.deleteChannel(channel, idx);
        break;

      case "deleteChannels": {
        // Batch delete for the multi-select group menu.
        const list = (_payload?.channels as ChannelView[]) ?? [channel];
        void this.deleteChannels(list);
        break;
      }

      case "mapToRegions": {
        const plot = channel.plotType;
        const data = channel.getData();
        if (!data || data.length === 0) break;

        // Visible genomic range for filtering
        let visStart: number;
        let visEnd: number;
        if (this.r.axisController.isCdsMode && this.r._cdsMapper) {
          visStart = this.r._cdsMapper.cdsToGenomic(this.r.viewDomain.start);
          visEnd = this.r._cdsMapper.cdsToGenomic(this.r.viewDomain.end);
        } else {
          visStart = this.r.viewDomain.start;
          visEnd = this.r.viewDomain.end;
        }

        // Clear ALL highlights before populating map-to-regions
        this.r.highlightManager.clear();
        const mtrPrefix = `mtr_${channel.name}_`;
        const isJunction = plot === "score_curve";
        const mtrAssembly = this.r.referenceManager?.getConfig()?.assembly;
        let hIdx = 0;
        for (const feat of data) {
          const fStart = feat.chromStart ?? feat.start ?? null;
          const fEnd = feat.chromEnd ?? feat.end ?? null;
          if (fStart == null || fEnd == null) continue;
          // Only features overlapping the visible domain
          if (fEnd <= visStart || fStart >= visEnd) continue;
          if (isJunction) {
            // Highlight only the junction endpoints — 1 bp wide each
            this.r.highlightManager.setRegion(
              `${mtrPrefix}${hIdx++}_s`,
              fStart,
              fStart + 1,
              "#3867d6",
              mtrAssembly,
            );
            this.r.highlightManager.setRegion(
              `${mtrPrefix}${hIdx++}_e`,
              fEnd,
              fEnd + 1,
              "#3867d6",
              mtrAssembly,
            );
          } else {
            this.r.highlightManager.setRegion(
              `${mtrPrefix}${hIdx++}`,
              fStart,
              fEnd,
              "#3867d6",
              mtrAssembly,
            );
          }
        }
        this.r.requestRepaint?.();
        break;
      }

      // Download actions
      case "downloadBED":
      case "downloadCSV":
      case "downloadXLSX":
      case "downloadJSON":
      case "downloadXML":
      case "downloadFASTA":
        this.r.exporter.downloadTrackData(
          channel,
          action.replace("download", "").toUpperCase(),
        );
        break;

      case "downloadPNG":
      case "downloadSVG":
      case "downloadPDF":
        this.r.exporter.downloadTrackImage(
          channel,
          action.replace("download", "").toUpperCase(),
        );
        break;

      case "downloadChannelsImage": {
        // Batch image export for the multi-select group menu: stitch every
        // selected channel into one combined image so a single download
        // carries them all.
        const list = (_payload?.channels as ChannelView[]) ?? [channel];
        const fmt = (_payload?.format as string) ?? "PNG";
        this.r.exporter.downloadChannelsImage(list, fmt);
        break;
      }

      case "setPlotType": {
        // config.plot was already updated by the ChannelView before forwarding.
        // Reload using the CURRENT viewport region so pan/zoom is preserved.
        const chr = this.r.config.region?.chr ?? "";
        const { start, end } = this.r.viewDomain;
        channel.loadData({ chr, start, end });
        this.r.requestRepaint?.();
        break;
      }

      case "relayout":
        this.syncChannelOrder();
        // Sync stacked groups FIRST so hidden channels report height = 0
        // during the layout pass.
        this.syncStackedGroups();
        if (this.r.context.canvas && this.r.container) {
          const dpr = window.devicePixelRatio || 1;
          const rect = this.r.container.getBoundingClientRect();
          this.r.rootView.layout(0, 0, rect.width * dpr, rect.height * dpr);
          this.r.scrollbar.update();
        }
        this.syncGroupScoreRanges();
        this.r.requestRepaint?.();
        break;

      case "syncGroupRange":
        // A grouped channel's visible data range changed (pan / zoom).
        // Re-compute the group's union range off the critical path so the
        // triggering reload is not blocked.
        this.scheduleGroupSync();
        break;

      default:
        logger.warn(`[BaseRenderer] Unhandled menu action: ${action}`);
    }
  }

  /** Set while a deferred group-range sync is already queued. */
  private _groupSyncScheduled = false;

  /**
   * Schedule a debounced group score-range sync off the critical path.
   * Multiple channels reloading after one pan / zoom each emit a
   * `syncGroupRange`; coalescing them into a single microtask-deferred pass
   * keeps the heavy union computation + GPU re-upload from blocking the
   * synchronous reload work.
   */
  private scheduleGroupSync(): void {
    if (this._groupSyncScheduled) return;
    this._groupSyncScheduled = true;
    Promise.resolve().then(() => {
      this._groupSyncScheduled = false;
      this.syncGroupScoreRanges();
      this.r.requestRepaint?.();
    });
  }

  /**
   * Synchronise the score range across channels sharing the same
   * `group.number` so they use a common scale. Called after a data load or
   * when a group number changes.
   */
  protected syncGroupScoreRanges(): void {
    const channelViews = this.r.rootView.children.filter(
      (c) => c instanceof ChannelView,
    ) as ChannelView[];

    // Group channels by group.number (skip channels without one)
    const groups = new Map<number, ChannelView[]>();
    for (const ch of channelViews) {
      const num = ch.getChannelConfig().group?.number;
      if (num === undefined) {
        // Clear any previously set group range
        ch.setGroupScoreRange(null);
        continue;
      }
      if (!groups.has(num)) groups.set(num, []);
      groups.get(num)!.push(ch);
    }

    // Compute each group's union score range and push it to members
    for (const [, members] of groups) {
      const isAutoscale = members.some(
        (m) => m.getChannelConfig().group?.autoscale === true,
      );
      if (members.length < 2) {
        // Only one channel — clear the group range so it uses its own
        members[0].setGroupScoreRange(null);
        continue;
      }
      let gMin = Infinity;
      let gMax = -Infinity;
      for (const ch of members) {
        // Use each channel's OWN visible-window data range (NOT the shared
        // range it may currently be displaying) so the union reflects the
        // real data of every selected channel and updates on pan / zoom.
        const sr = ch.getOwnScoreRange();
        if (!sr) continue;
        if (sr[0] < gMin) gMin = sr[0];
        if (sr[1] > gMax) gMax = sr[1];
      }
      if (!isFinite(gMin) || !isFinite(gMax) || gMax <= gMin) continue;
      const range: [number, number] = [gMin, gMax];
      for (const ch of members) {
        // Force re-apply for autoscale groups so the shared scale survives
        // the data reload that pan / zoom triggers (the reload re-uploads
        // each channel with its own scale, and an unchanged-range early
        // return would otherwise leave the group constraint broken).
        ch.setGroupScoreRange(range, isAutoscale);
      }
    }
  }

  /**
   * For each `group.number` group where any member has `stacked: true`, make
   * the first channel the "host" (renders all members overlaid) and hide the
   * rest in layout via `_isStackedHidden = true`.
   */
  protected syncStackedGroups(): void {
    const channelViews = this.r.rootView.children.filter(
      (c) => c instanceof ChannelView,
    ) as ChannelView[];

    // Group channels by group.number
    const groups = new Map<number, ChannelView[]>();
    for (const ch of channelViews) {
      const num = ch.getChannelConfig().group?.number;
      if (num === undefined) {
        // Not in a numbered group — clear any stacking state
        ch._isStackedHidden = false;
        ch.setStackedChannels([]);
        continue;
      }
      if (!groups.has(num)) groups.set(num, []);
      groups.get(num)!.push(ch);
    }

    for (const [, members] of groups) {
      const isStacked = members.some(
        (ch) => ch.getChannelConfig().group?.stacked === true,
      );
      if (!isStacked || members.length < 2) {
        // No stacking — clear state & ensure config consistency
        for (const ch of members) {
          ch._isStackedHidden = false;
          ch.setStackedChannels([]);
          const cfg = ch.getChannelConfig();
          if (cfg.group) cfg.group.stacked = false;
        }
        continue;
      }

      // Ensure ALL members have stacked=true in their config
      // (even if only one originally triggered the stack).
      for (const ch of members) {
        const cfg = ch.getChannelConfig();
        if (cfg.group) {
          cfg.group.stacked = true;
          if (cfg.group.alpha === undefined) cfg.group.alpha = 0.8;
        }
      }

      const host = members[0];
      const hidden = members.slice(1);
      host._isStackedHidden = false;
      host.setStackedChannels(hidden);
      for (const ch of hidden) {
        ch._isStackedHidden = true;
        ch.setStackedChannels([]);
      }
      // Recreate host label to show stacked name + "S" badge
      host.createChannelLabel();
    }
  }

  /**
   * Dynamically add a new channel at runtime, showing a confirmation dialog.
   *
   * The config should contain `data.method`, `data.format`, `data.url` and
   * optionally `data.index` / `data.index2`. For **local files**, pass
   * `data.url` as a `blob:` object URL (`URL.createObjectURL(file)`) with
   * `data.method = "remote"`; the caller must revoke the URL when done.
   *
   * Callers that already presented their own dialog (import-local,
   * import-remote, drag-drop) should use `_addChannelDirect()` instead.
   */
  public addChannel(channelConfig: IChannel): void {
    // Duplicate-source guard: when the incoming channel matches an existing
    // one by name + data source, prompt with the warning dialog instead of
    // silently re-importing. "Force Load" routes back to the regular
    // confirm dialog so the user can review before adding the duplicate;
    // "Cancel" aborts the whole add.
    const duplicates = this.r.channelManager.findDuplicates([channelConfig]);
    if (duplicates.length > 0) {
      showDuplicateConfirmDialog(duplicates, () => {
        showChannelConfirmDialog(channelConfig, () => {
          this._addChannelDirect(channelConfig);
        });
      });
      return;
    }
    showChannelConfirmDialog(channelConfig, () => {
      this._addChannelDirect(channelConfig);
    });
  }

  /**
   * Pending-add buffer for {@link _addChannelWithDuplicateGuard}'s
   * microtask-coalescing path — synchronous bursts of guard calls accumulate
   * here so the user sees ONE consolidated "Channels already loaded" dialog
   * instead of N sequential prompts.
   */
  private _addGuardQueue: IChannel[] = [];
  private _addGuardScheduled = false;

  /**
   * Add a channel that has **already cleared a per-source confirmation
   * dialog** (drag-drop, `importLocalFiles`, `importRemoteUrl`'s single
   * mode, etc.) but should still hit the duplicate-source guard.
   *
   * Synchronous bursts (one Add click committing N files) are coalesced via
   * a microtask: the whole batch runs `findDuplicates` once and a single
   * warning dialog lists every duplicate. "Force Load" commits the FULL
   * batch (including duplicates); "Cancel" commits nothing.
   *
   * Keeps the duplicate dialog consistent across every user-facing add path —
   * only `_addChannelDirect()` (system-initiated loads such as
   * `referenceManager.syncChannels()`) bypasses it.
   */
  public _addChannelWithDuplicateGuard(channelConfig: IChannel): void {
    this._addGuardQueue.push(channelConfig);
    if (this._addGuardScheduled) return;
    this._addGuardScheduled = true;
    Promise.resolve().then(() => {
      this._addGuardScheduled = false;
      const batch = this._addGuardQueue.slice();
      this._addGuardQueue.length = 0;
      if (batch.length === 0) return;
      const duplicates = this.r.channelManager.findDuplicates(batch);
      const commit = () => {
        for (const cfg of batch) this._addChannelDirect(cfg);
      };
      if (duplicates.length > 0) {
        showDuplicateConfirmDialog(duplicates, commit);
      } else {
        commit();
      }
    });
  }

  /**
   * Internal: add a channel **without** any confirmation dialog (no
   * per-source confirm, no duplicate guard). Reserved for system-initiated
   * programmatic loads — e.g. `referenceManager.syncChannels()` rebuilding
   * the pinned channels after a reference switch. User-driven paths should
   * go through {@link _addChannelWithDuplicateGuard} instead.
   */
  public _addChannelDirect(channelConfig: IChannel): void {
    if (!this.r.config.channels) this.r.config.channels = [];

    // ── Validate format ─────────────────────────────────────────────────
    // Buildin channels (transcript / exon / junction) use virtual format
    // names that are not file formats, so they bypass this check.
    const method = channelConfig.data?.method;
    const isBuildin = method === "buildin" || method === "built-in";
    const fmt = (channelConfig.data?.format ?? "").toLowerCase();
    if (!isBuildin && fmt && !SUPPORTED_FORMATS.has(fmt)) {
      const url = channelConfig.data?.url ?? "";
      const filename = url.split("?")[0].split("/").pop() || undefined;
      showUnsupportedFormatDialog(fmt, filename);
      return;
    }

    // Normalise the config the same way initializeViews/replaceAllChannels
    // do — fills in missing defaults (height, background, label, detailZoom,
    // plot-specific overrides, format aliases, etc.)
    const normalised = initChannelConfig(channelConfig);

    // Append without resorting so existing order is preserved
    this.r.config.channels.push(normalised);

    const channelIndex = this.r.config.channels.length - 1;
    const loadingConfig = {
      enabled: true,
      position: "rightBottom" as const,
      size: "small" as const,
      fadeOutDuration: 300,
      ...this.r.config.loading,
    };
    const channelLabelConfig = {
      enabled: true,
      ...this.r.config.channelLabel,
    };

    const dataLoader = this.createDataLoader(normalised, channelIndex);
    const channelView = new ChannelView(
      this.r.context,
      normalised,
      channelIndex,
      dataLoader,
      loadingConfig,
      channelLabelConfig,
      () => this.r.requestRepaint?.(),
      () => this.r.interactionController,
      (fromIndex: number, toIndex: number, pinned?: boolean) =>
        this.reorderChannels(fromIndex, toIndex, pinned),
    );

    channelView.onExpandCallback = (parent, subs, action) =>
      this.handleChannelExpand(parent, subs, action);
    channelView.onMenuAction = (ch, action, payload) =>
      this.handleChannelMenuAction(ch, action, payload);
    channelView.getTranscriptInfo = () => this.r.transcriptInfo;

    this.r.rootView.addChild(channelView);
    this.syncChannelOrder();

    // Layout first so the channel knows its dimensions before mount
    if (this.r.context.canvas && this.r.container) {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.r.container.getBoundingClientRect();
      this.r.rootView.layout(0, 0, rect.width * dpr, rect.height * dpr);
      this.r.scrollbar.update();
    }

    // Mount the channel's DOM (required — without it the track container and
    // label overlays never appear and the channel renders empty).
    if (this.r.container) {
      channelView.mount(this.r.container);
      this.syncChannelOrder();
    }

    this.r.requestRepaint?.();

    // Load using the CURRENT viewport region (viewDomain), not the static
    // config.region, so the user's pan/zoom position is preserved.
    const chr = this.r.config.region?.chr ?? "";
    const { start, end } = this.r.viewDomain;
    if (chr) {
      channelView.loadData({ chr, start, end });
    } else {
      logger.warn(
        `[addChannel] "${normalised.name}" skipped loadData — no chr in config.region`,
      );
    }
  }

  /**
   * Add multiple channels with a batch confirmation dialog listing them all.
   */
  public addManyChannels(configs: IChannel[]): void {
    if (!configs.length) return;
    // Duplicate-source guard: warn the user when any incoming channel
    // matches an existing one by name + data source. "Force Load"
    // proceeds to the regular batch-confirm dialog so the full set
    // (including duplicates) is reviewed before commit. "Cancel" aborts.
    const duplicates = this.r.channelManager.findDuplicates(configs);
    if (duplicates.length > 0) {
      showDuplicateConfirmDialog(duplicates, () => {
        showBatchConfirmDialog(configs, (confirmed) => {
          for (const c of confirmed) {
            this._addChannelDirect(c);
          }
        });
      });
      return;
    }
    showBatchConfirmDialog(configs, (confirmed) => {
      for (const c of confirmed) {
        this._addChannelDirect(c);
      }
    });
  }

  /** Remove a channel from the config and view tree, then relayout. */
  private async deleteChannel(
    channel: ChannelView,
    _index: number,
  ): Promise<void> {
    if ((this.r.config.channels?.length ?? 0) <= 1) return;
    if (!this._skipDeleteConfirm) {
      const result = await ModalDialog.confirm(
        `Delete Channel "${channel.name}"?`,
        "The channel and its data will be removed.",
        {
          confirmLabel: "Delete",
          danger: true,
          checkboxLabel: "Don't remind me again",
        },
      );
      if (!result.confirmed) return;
      if (result.checked) this._skipDeleteConfirm = true;
    }
    // The channel may have moved while the confirmation dialog was open.
    const views = this.r.rootView.children.filter(
      (c) => c instanceof ChannelView,
    );
    await this.removeChannelByIndex(views.indexOf(channel), true);
  }

  /**
   * Delete several channels at once (used by the multi-select group menu).
   * A single confirmation dialog covers the whole batch. Sub-channels in the
   * selection are ignored — only top-level channels are removed.
   */
  private async deleteChannels(channels: ChannelView[]): Promise<void> {
    if (!this.r.config.channels || channels.length === 0) return;

    const channelViews = this.r.rootView.children.filter(
      (c) => c instanceof ChannelView,
    ) as ChannelView[];

    // Resolve each selected channel to its top-level index; drop any that are
    // not present in the root view (e.g. sub-channels).
    const targets = channels
      .map((ch) => ({ ch, idx: channelViews.indexOf(ch) }))
      .filter((e) => e.idx >= 0);
    // When every channel is selected, retain the first one and confirm only
    // the channels that can actually be deleted.
    if (targets.length === channelViews.length) {
      const first = targets.findIndex(
        (target) => target.ch === channelViews[0],
      );
      if (first >= 0) targets.splice(first, 1);
    }
    if (targets.length === 0) return;

    if (!this._skipDeleteConfirm) {
      const result = await ModalDialog.confirm(
        `Delete ${targets.length} channel${targets.length > 1 ? "s" : ""}?`,
        "This action cannot be undone. The selected channels and their data will be permanently removed.",
        {
          confirmLabel: "Delete",
          danger: true,
          checkboxLabel: "Don't remind me again",
        },
      );
      if (!result.confirmed) return;
      if (result.checked) this._skipDeleteConfirm = true;
    }

    // Resolve identities again after confirmation; the final channel is kept.
    targets.sort((a, b) => b.idx - a.idx);
    for (const { ch } of targets) {
      const views = this.r.rootView.children.filter(
        (c) => c instanceof ChannelView,
      );
      await this.removeChannelByIndex(views.indexOf(ch), true);
    }
  }

  /**
   * Remove a channel by its 0-based index (channel-only, excluding axis).
   * Used by the ChannelManager delegate. `silent` skips the confirmation
   * dialog. Returns `true` if a channel was actually removed.
   */
  public async removeChannelByIndex(
    index: number,
    silent = false,
  ): Promise<boolean> {
    let views = this.r.rootView.children.filter(
      (c) => c instanceof ChannelView,
    ) as ChannelView[];
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= views.length ||
      views.length <= 1
    )
      return false;
    const channel = views[index];
    if (!silent) {
      const result = await ModalDialog.confirm(
        `Delete Channel "${channel.name}"?`,
        "The channel and its data will be removed.",
        { confirmLabel: "Delete", danger: true },
      );
      if (!result) return false;
    }
    views = this.r.rootView.children.filter(
      (c) => c instanceof ChannelView,
    ) as ChannelView[];
    if (views.length <= 1 || !views.includes(channel)) return false;
    if (channel.isExpanded) channel.collapse();
    this.r.rootView.removeChild(channel);
    channel.destroy();
    this.syncChannelOrder();
    this.r._relayoutAndRepaint();
    this.r.requestRepaint?.();
    return true;
  }

  /**
   * Re-render a single channel after its config was mutated: reload using the
   * current viewport, then repaint. Used by ChannelManager.update().
   */
  public _updateChannelByIndex(index: number): void {
    const channelViews = this.r.rootView.children.filter(
      (c) => c instanceof ChannelView,
    ) as ChannelView[];
    if (index < 0 || index >= channelViews.length) return;

    const channel = channelViews[index];
    this.syncChannelOrder();
    const chr = this.r.config.region?.chr ?? "";
    const { start, end } = this.r.viewDomain;

    channel.loadData({ chr, start, end });

    // Relayout in case style changes affected height
    if (this.r.context.canvas && this.r.container) {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.r.container.getBoundingClientRect();
      this.r.rootView.layout(0, 0, rect.width * dpr, rect.height * dpr);
      this.r.scrollbar.update();
    }
    this.r.requestRepaint?.();
  }

  /**
   * Destroy all existing channel views, apply a fresh channel set,
   * re-initialise views, and load data. Used by ChannelManager.replaceAll().
   */
  public replaceAllChannels(channels: IChannel[]): void {
    this.manuallyUnpinnedTop = false;
    const replacement = initChannelsConfig(
      channels.length ? channels : this.r.config.channels.slice(0, 1),
    );
    // ── Destroy existing channel views ──────────────────────────────────
    const existingViews = this.r.rootView.children.filter(
      (c) => c instanceof ChannelView,
    );
    for (const cv of existingViews) {
      if (typeof (cv as any).destroy === "function") {
        (cv as any).destroy();
      }
    }
    // Remove ONLY channel views from rootView (keep axis)
    this.r.rootView.children = this.r.rootView.children.filter(
      (c) => !(c instanceof ChannelView),
    );

    // ── Apply new channel configs ───────────────────────────────────────
    this.r.config.channels = replacement;
    this.r.state.totalChannels = this.r.config.channels.length;
    this.r.state.loadedChannels = 0;

    // ── Create new ChannelViews WITHOUT re-adding the axis ─────────────
    const loadingConfig = {
      enabled: true,
      position: "rightBottom" as const,
      size: "small" as const,
      fadeOutDuration: 300,
      ...this.r.config.loading,
    };
    const channelLabelConfig = {
      enabled: true,
      ...this.r.config.channelLabel,
    };
    const sortedChannels = ChannelView.sortChannels(this.r.config.channels);
    sortedChannels.forEach((channel, index) => {
      const dataLoader = this.createDataLoader(channel, index);
      const channelView = new ChannelView(
        this.r.context,
        channel,
        index,
        dataLoader,
        loadingConfig,
        channelLabelConfig,
        () => this.r.requestRepaint?.(),
        () => this.r.interactionController,
        (fromIndex: number, toIndex: number, pinned?: boolean) =>
          this.reorderChannels(fromIndex, toIndex, pinned),
      );
      channelView.onExpandCallback = (parent, subs, action) =>
        this.handleChannelExpand(parent, subs, action);
      channelView.onMenuAction = (ch, action, payload) =>
        this.handleChannelMenuAction(ch, action, payload);
      channelView.getTranscriptInfo = () => this.r.transcriptInfo;
      this.r.rootView.addChild(channelView);
    });

    this.syncChannelOrder();

    // Mount all new channels into the DOM
    if (this.r.container) {
      for (const child of this.r.rootView.children) {
        if (child instanceof ChannelView) {
          child.mount(this.r.container);
        }
      }
    }

    // Layout and load data
    if (this.r.context.canvas && this.r.container) {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.r.container.getBoundingClientRect();
      this.r.rootView.layout(0, 0, rect.width * dpr, rect.height * dpr);
      this.r.scrollbar.update();
    }
    this.loadData();
    this.r.requestRepaint?.();
  }

  /**
   * Lazily build and cache a BAM parser for transcriptome-coordinate
   * remapping. Keyed by `url\0index` so the BAM header is parsed only once.
   */
  private getTxBamParser(channel: IChannel): BamParser | null {
    const url = channel.data?.url;
    if (!url) return null;
    const key = `${url}\0${channel.data?.index ?? ""}`;
    let parser = this._txBamParsers.get(key);
    if (!parser) {
      try {
        parser = new BamParser({
          method: "remote",
          file: url,
          index: channel.data?.index,
          indexFormat: channel.data?.indexFormat,
        });
      } catch (err) {
        logger.warn("[transcriptome-bam] failed to create BAM parser:", err);
        return null;
      }
      this._txBamParsers.set(key, parser);
    }
    return parser;
  }

  /**
   * Candidate identifiers for the active transcript, used to match a
   * transcriptome BAM's reference names.  Includes version-stripped forms
   * (e.g. `ENST00000456328.2` → `ENST00000456328`).
   */
  private resolveActiveTranscriptIds(): string[] {
    const ids: string[] = [];
    const push = (v?: string | null) => {
      if (v && !ids.includes(v)) ids.push(v);
    };
    push(this.r._transcriptInfo?.trans_id);
    push(this.r._transcriptInfo?.trans_name);
    push(this.r._rnaInfo?.name);
    push(this.r._cdsInfo?.name);
    push(this.r._buildinTranscriptId);
    for (const id of [...ids]) {
      const stripped = id.replace(/\.\d+$/, "");
      if (stripped !== id) push(stripped);
    }
    return ids;
  }

  /**
   * Load and remap a transcriptome-aligned BAM for the active transcript.
   *
   * Returns genomic, lane-assigned block records when the renderer is in
   * RNA/CDS mode, the active transcript's exon structure is available, and
   * the BAM's reference names include the active transcript ID. Returns
   * `null` for genome-aligned BAMs (or no match), so the caller falls back to
   * the normal genomic query.
   */
  private async loadTranscriptomeBam(
    channel: IChannel,
    _region: { chr: string; start: number; end: number },
  ): Promise<any[] | null> {
    const exonMapper = this.r._exportExonMapper;
    if (!exonMapper || exonMapper.cdsRegions.length === 0) return null;
    if (!(this.r.axisController.isRnaMode || this.r.axisController.isCdsMode))
      return null;

    const parser = this.getTxBamParser(channel);
    if (!parser) return null;

    let refInfo: Array<{ refName: string; length: number }>;
    try {
      refInfo = await parser.getRefInfo();
    } catch (err) {
      logger.warn("[transcriptome-bam] failed to read BAM header:", err);
      return null;
    }
    if (!refInfo || refInfo.length === 0) return null;

    // Match the active transcript against the BAM reference names. Try exact
    // matches first, then version-tolerant matches on both sides.
    const candidates = this.resolveActiveTranscriptIds();
    const refByName = new Map(refInfo.map((r) => [r.refName, r]));
    let matched: { refName: string; length: number } | undefined;
    for (const c of candidates) {
      const hit = refByName.get(c);
      if (hit) {
        matched = hit;
        break;
      }
    }
    if (!matched) {
      const strip = (s: string) => s.replace(/\.\d+$/, "");
      const candSet = new Set(candidates.map(strip));
      for (const r of refInfo) {
        if (candSet.has(strip(r.refName))) {
          matched = r;
          break;
        }
      }
    }
    // Not a transcriptome BAM for this transcript → use the genomic path.
    if (!matched) return null;

    let raw: any[];
    try {
      raw = await parser.getRecordsForRef(matched.refName, 0, matched.length);
    } catch (err) {
      logger.warn(
        `[transcriptome-bam] failed to fetch reads for "${matched.refName}":`,
        err,
      );
      return null;
    }

    const rawReads = (raw ?? []).map((rec: any) => ({
      start: rec.start ?? 0,
      end: rec.end ?? 0,
      strand: rec.strand ?? 1,
      name: rec.name ?? rec.readName ?? undefined,
      flags: rec.flags ?? undefined,
      mapq: rec.mq ?? rec.mapq ?? rec.mappingQuality ?? undefined,
      cigar: rec.CIGAR ?? rec.cigar ?? undefined,
      seq: rec.seq ?? rec.sequence ?? undefined,
      qual: rec.qual ?? undefined,
      tags: rec.tags ?? rec._tags ?? undefined,
    }));

    const { reads } = remapTranscriptomeReads(rawReads, exonMapper);
    return reads;
  }

  /**
   * Create a data loader that fetches directly on the main thread — no Worker
   * overhead, no cross-thread serialisation; parsed records go straight to
   * the GPU.
   */
  public createDataLoader(
    channel: IChannel,
    channelIndex: number,
  ): (region: {
    chr: string;
    start: number;
    end: number;
    scale?: number;
  }) => Promise<any[]> {
    // These built-in APIs return the full transcript, independent of zoom.
    // Keep one source/transcript entry, including an in-flight request.
    let transcriptCache: { key: string; data: Promise<any[]> } | undefined;
    return async (region) => {
      if (!channel.data) {
        throw new Error(`Channel ${channel.name}: no data configuration`);
      }
      try {
        // Transcriptome-aligned BAM: in RNA/CDS mode with transcript-ID
        // reference names, fetch reads by transcript ID and remap their
        // transcript-relative coordinates onto the genome. `null` (genome-
        // aligned or no active transcript) falls through to the genomic query.
        if (channel.data.format === "bam") {
          const txReads = await this.loadTranscriptomeBam(channel, region);
          if (txReads) {
            this.onChannelLoaded();
            return txReads;
          }
        }

        // For buildin channels, resolve the URL from templates if not set
        const isBuildin =
          channel.data.method === "buildin" ||
          channel.data.method === "built-in";
        const url = isBuildin
          ? (this.resolveBuildinUrl(channel) ?? channel.data.url)
          : channel.data.url;
        const transcriptScoped = isBuildin &&
          (channel.data.format === "exon" || channel.data.format === "junction");
        let transcriptRegion: { chr: string; start: number; end: number } | undefined;
        if (transcriptScoped) {
          const coords = this.r._lastTranscriptCoords;
          const chr = this.r._rnaInfo?.chr ?? this.r._cdsInfo?.chr ?? this.r._tssContext?.chr;
          const domain = this.r.viewDomain;
          const start = this.r._cdsMapper ? this.r._cdsMapper.cdsToGenomic(domain.start) : domain.start;
          const end = this.r._cdsMapper ? this.r._cdsMapper.cdsToGenomic(domain.end) : domain.end;
          // Check the actual viewport, not a prefetch tile: a tile can be
          // outside the transcript while the visible window still overlaps it.
          if (!coords || !chr || !this.r._buildinTranscriptId ||
              chr !== this.r.config.region.chr || end <= coords.txStart || start >= coords.txEnd) {
            this.onChannelLoaded();
            return [];
          }
          transcriptRegion = { chr, start: coords.txStart, end: coords.txEnd };
        }

        // For buildin transcript / exon / junction channels, prefer the active
        // reference's GFF3 annotation over the legacy expression API. When
        // available, pass a `buildinGff` source so the parser reads the active
        // RNA's structure, exons and computed splice junctions from the GFF3.
        let buildinGff:
          | {
              url: string;
              index?: string;
              transcriptId?: string | null;
              region?: { chr: string; start: number; end: number };
            }
          | undefined;
        // Structure-API fallback URL for buildin transcript/exon/junction
        // channels, used when their primary source returns nothing usable for
        // the active transcript (e.g. an RNAcentral mito tRNA absent from the
        // GFF3, or non-genomic expression coordinates). Resolved from the
        // active reference's `transcriptome.api` so it is species-correct.
        let structureFallbackUrl: string | undefined;
        if (isBuildin) {
          const fmt = channel.data.format;
          // Only annotation-derived structure channels (`data.source ===
          // "annotation"`) read from the reference GFF3. Legacy expression
          // channels keep using the templated expression API.
          const isAnnotationSource = channel.data.source === "annotation";
          if (fmt === "transcript" || fmt === "exon" || fmt === "junction") {
            // Build from the ACTIVE reference's RNA api base
            // (`transcriptome.api`), NOT the hardcoded hg38 buildin template —
            // otherwise a non-human transcript would hit the human API. Mirrors
            // the `transcript` template shape: `<api>/<id>/auto/<flank>/1000/`.
            const apiBase =
              this.r.referenceManager?.getConfig()?.transcriptome?.api;
            if (apiBase && this.r._buildinTranscriptId) {
              const flank = transcriptScoped ? 0 : Math.max(
                this.r._buildinUpstream,
                this.r._buildinDownstream,
              );
              structureFallbackUrl = `${apiBase.replace(/\/+$/, "")}/${encodeURIComponent(
                this.r._buildinTranscriptId,
              )}/auto/${flank}/1000/`;
            }
          }
          if (
            isAnnotationSource &&
            (fmt === "transcript" || fmt === "exon" || fmt === "junction")
          ) {
            const activeRef = this.r.referenceManager?.getConfig();
            const annUrl = activeRef?.transcriptome?.annotation?.url;
            const annIndex = activeRef?.transcriptome?.annotation?.index;
            if (annUrl) {
              // Query the active transcript's full genomic span (± flank) so
              // the structure stays loaded regardless of pan/zoom. The parser
              // filters by gene name to discard neighbouring genes pulled in by
              // the padded region.
              let gffRegion:
                { chr: string; start: number; end: number } | undefined;
              const coords = this.r._lastTranscriptCoords;
              const chr =
                this.r._rnaInfo?.chr ??
                this.r._cdsInfo?.chr ??
                this.r.config.region?.chr;
              if (coords && chr) {
                const up = this.r._buildinUpstream ?? 5000;
                const down = this.r._buildinDownstream ?? 5000;
                gffRegion = {
                  chr,
                  start: Math.max(0, coords.txStart - up),
                  end: coords.txEnd + down,
                };
              }
              buildinGff = {
                url: annUrl,
                index: annIndex,
                transcriptId:
                  this.r._buildinTranscriptId ??
                  this.r._transcriptInfo?.trans_name ??
                  this.r._transcriptInfo?.trans_id ??
                  null,
                region: transcriptRegion ?? gffRegion,
              };
            } else {
              logger.warn(
                `[createDataLoader] buildin fmt=${fmt} but no annotation url on active reference`,
              );
            }
          }
        }

        const request = {
          url,
          index: channel.data.index,
          index2: channel.data.index2,
          indexFormat: channel.data.indexFormat,
          method: channel.data.method,
          content: channel.data.content,
          format:
            channel.data.format || (url?.endsWith("bed.gz") ? "bed" : "gff"),
          viewWidth: this.r.context.canvas?.width ?? 1000,
          scale: region.scale,
          buildinGff,
          structureFallbackUrl,
          // Validate expression coordinates against the complete transcript.
          // An intronic or partially overlapping viewport must not force the
          // parser to replace valid expression data with structure fallback.
          region: transcriptRegion ?? {
            chr: region.chr,
            start: region.start,
            end: region.end,
          },
        };
        let data: any[];
        if (transcriptRegion) {
          const key = JSON.stringify([
            this.r.referenceManager?.getConfig()?.assembly?.name,
            this.r._buildinTranscriptId, transcriptRegion, channel.data,
            url, buildinGff, structureFallbackUrl,
          ]);
          if (transcriptCache?.key !== key) {
            const entry = { key, data: buildPromise(request) };
            transcriptCache = entry;
            entry.data.catch(() => {
              if (transcriptCache === entry) transcriptCache = undefined;
            });
          }
          // ScreenDataManager clears its arrays; rendering can annotate records.
          // Each consumer owns its copy, including concurrent tile requests.
          data = structuredClone(await transcriptCache!.data);
        } else {
          data = await buildPromise(request);
        }
        this.onChannelLoaded();
        return data;
      } catch (error: any) {
        this.onChannelError(channelIndex, error.message);
        throw error;
      }
    };
  }

  /** Load data for all channels. */
  public async loadData() {
    if (!this.r.config.region || this.r.isDestroyed) return;

    this.r.setState({ status: RendererStatus.Loading, loadedChannels: 0 });

    this.r.rootView.children.forEach((child) => {
      if (child instanceof ChannelView) {
        child.loadData(this.r.config.region);
      }
    });
  }

  /** Handle a channel finishing its load. */
  private onChannelLoaded() {
    this.r.state.loadedChannels = (this.r.state.loadedChannels || 0) + 1;

    if (this.r.state.loadedChannels === this.r.state.totalChannels) {
      this.r.setState({ status: RendererStatus.Loaded });
      // All channels loaded: sync stacked groups, then re-layout so hidden
      // channels collapse.
      this.syncStackedGroups();
      if (this.r.context.canvas && this.r.container) {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.r.container.getBoundingClientRect();
        this.r.rootView.layout(0, 0, rect.width * dpr, rect.height * dpr);
        this.r.scrollbar.update();
      }
      this.syncGroupScoreRanges();
      this.r.requestRepaint?.();
    }
  }

  /** Handle a channel load error. */
  private onChannelError(channelIndex: number, error: string) {
    const channelErrors = this.r.state.error?.channelErrors || {};
    channelErrors[channelIndex] = error;

    this.r.setState({
      status: RendererStatus.Error,
      error: {
        message: "One or more channels failed to load",
        channelErrors,
      },
    });
  }

  // ── Buildin channel URLs + channel lookup (moved from BaseRenderer) ──
  /**
   * After transcriptInfo becomes available, re-fetch every channel with
   * filterGene / filterTranscript configured. Re-initializing the
   * ScreenDataManager lets the dataLoader apply the filter BEFORE
   * downsampling, so cached tiles only hold relevant records.
   */
  public notifyFilterGeneChannels(): void {
    const channelViews = this.r.rootView.children.filter(
      (ch: any) => ch instanceof ChannelView,
    ) as ChannelView[];

    for (const ch of channelViews) {
      const fg = (ch as any).config?.style?.foreground;
      if (fg && (fg.filterGene || fg.filterTranscript)) {
        // Re-initialize ScreenDataManager so tiles are re-fetched with the
        // filter applied at the cache level.
        const sm = (ch as any).screenManager;
        if (sm) {
          const state = sm.getState();
          if (state && state.region) {
            sm.initialize({
              chr: state.region.chr,
              start: state.region.start,
              end: state.region.end,
            });
          } else {
            // Fallback: reprocess cached data
            ch.reprocessCachedData();
          }
        }
      }
    }
  }

  /**
   * Resolve the data URL for a buildin channel. Uses an explicit `data.url`
   * when present; otherwise builds it from the `defaultConfig.buildin`
   * template using `_buildinTranscriptId` and `_buildinUpstream`/`Downstream`.
   */
  public resolveBuildinUrl(channel: IChannel): string | undefined {
    if (channel.data?.url) return channel.data.url;

    const format = channel.data?.format;
    if (!format || !this.r._buildinTranscriptId) return undefined;

    const templates = (defaultConfig as any).buildin as
      Record<string, string> | undefined;
    const template = templates?.[format];
    if (!template) return undefined;

    return template
      .replace(/\{transcript_id\}/g, this.r._buildinTranscriptId)
      .replace(
        /\{flank\}/g,
        String(Math.max(this.r._buildinUpstream, this.r._buildinDownstream)),
      );
  }

  /**
   * Choose the buildin / structure identifier for a resolved transcript.
   *
   * Prefers `trans_name` when it is a unique, friendly GENCODE/Ensembl label
   * (e.g. "SOX2-201") — the reference GFF3 matcher keys on transcript_name
   * first. But RNAcentral entries (`URS…` accessions) carry a NON-UNIQUE
   * `trans_name` shared by many isoforms — both spaced descriptions ("18S
   * ribosomal RNA") and clean tokens ("tRNA-Gln") — that resolves ambiguously
   * to an arbitrary isoform. For those, use the unique `trans_id` (e.g.
   * "URS000250C58C_9606") so the buildin / structure channels fetch THIS exact
   * transcript. See [[feedback_identity_vs_navigation_priority]].
   */
  public _resolveBuildinId(
    region: { trans_name?: string; trans_id?: string } | null | undefined,
    fallbackName: string,
  ): string {
    const name = region?.trans_name;
    const id = region?.trans_id;
    const isRnaCentralId =
      typeof id === "string" && /^URS[0-9A-F]+(_\d+)?$/i.test(id);
    if (
      !isRnaCentralId &&
      typeof name === "string" &&
      /^[\w][\w.-]*$/.test(name)
    ) {
      return name;
    }
    return id || name || fallbackName;
  }

  /**
   * Update buildin channel state for a new transcript: store the transcript
   * ID and flank for `resolveBuildinUrl()`, and patch any channel whose
   * explicit `data.url` contains the old name.
   */
  public updateBuildinChannelUrls(
    newTranscriptName: string,
    flank?: number,
  ): void {
    const oldName = this.r._buildinTranscriptId;

    this.r._buildinTranscriptId = newTranscriptName;
    if (flank !== undefined) {
      this.r._buildinUpstream = flank;
      this.r._buildinDownstream = flank;
    }

    // Backward compat: patch channels that have an explicit URL
    if (oldName && oldName !== newTranscriptName) {
      for (const ch of this.r.config.channels) {
        if (
          ch.data?.method === "buildin" &&
          ch.data.url &&
          ch.data.url.includes(oldName)
        ) {
          ch.data.url = ch.data.url.split(oldName).join(newTranscriptName);
        }
      }
    }
  }

  /**
   * Find the ChannelView under y (device pixels from canvas top).
   * Checks both top-level channels and expanded sub-channels.
   */
  public findChannelAtY(y: number): ChannelView | null {
    const channels = this.r.rootView.children.filter(
      (c: any) => c instanceof ChannelView,
    ) as ChannelView[];

    for (const ch of channels) {
      const b = ch.getBounds();
      if (y >= b.y && y < b.y + b.height) {
        return ch;
      }
      // Check expanded sub-channel group
      if (ch.isExpanded && ch._expandGroupView) {
        const gv = ch._expandGroupView;
        if (y >= gv.y && y < gv.y + gv.height) {
          for (const sub of ch.subChannels) {
            const sb = sub.getBounds();
            if (y >= sb.y && y < sb.y + sb.height) {
              return sub;
            }
          }
          // Mouse is in the group area but not directly over a sub
          // — treat as the parent channel for group-level scrolling
          return ch;
        }
      }
    }
    return null;
  }
}
