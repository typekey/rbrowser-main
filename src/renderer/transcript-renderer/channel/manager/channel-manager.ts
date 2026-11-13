import type { IChannel } from "../index";
import { logger } from "../../utils/logger";

// Delegate interface ──────────────────────────────────────────────────────
// The renderer implements this to wire low-level view-tree operations into
// the manager without exposing renderer internals.

export interface IChannelManagerDelegate {
  /** Add a fully-configured channel config with confirmation dialog. */
  addChannel(config: IChannel): void;

  /** Add a fully-configured channel config without confirmation dialog. */
  addChannelDirect(config: IChannel): void;

  /** Add multiple channels with a batch confirmation dialog. */
  addManyChannels(configs: IChannel[]): void;

  /**
   * Remove a channel by its current index (0-based, channel-only order).
   * @param index   Channel index.
   * @param silent  If `true`, skip the confirmation dialog.
   * @returns `true` if the channel was actually removed.
   */
  removeChannelByIndex(index: number, silent?: boolean): Promise<boolean>;

  /** Swap channel positions. */
  reorderChannels(fromIndex: number, toIndex: number): void;

  /** Return the live config array managed by the renderer. */
  getChannelConfigs(): IChannel[];

  /** Return the current channel count (from the view tree). */
  getChannelCount(): number;

  /**
   * Return the runtime (loaded) data records for the channel at `index`
   * (0-based, channel-only order). Returns `undefined` if the index is out
   * of range or the channel view has not loaded data yet.
   */
  getChannelData(index: number): unknown[] | undefined;

  /** Reload data for all channels in the current viewport. */
  reloadAll(): void;

  /**
   * Destroy all existing channel views, replace the config, and
   * re-initialise views for the new channel set.
   */
  replaceAllChannels(channels: IChannel[]): void;

  /**
   * Re-render a single channel after its config has been updated in-place.
   * The delegate should find the corresponding ChannelView, reload its data
   * using the current viewport, and repaint.
   */
  updateChannel(index: number): void;
}

// Event types

export type ChannelManagerEvent =
  "add" | "remove" | "update" | "reorder" | "clear" | "replace" | "reload";

export type ChannelManagerListener = (
  event: ChannelManagerEvent,
  detail?: { index?: number; channel?: IChannel; channels?: IChannel[] },
) => void;

// ChannelManager ──────────────────────────────────────────────────────────
export class ChannelManager {
  private _delegate: IChannelManagerDelegate;
  private _listeners: ChannelManagerListener[] = [];

  constructor(delegate: IChannelManagerDelegate) {
    this._delegate = delegate;
  }

  // Event helpers
  on(listener: ChannelManagerListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  private _emit(
    event: ChannelManagerEvent,
    detail?: { index?: number; channel?: IChannel; channels?: IChannel[] },
  ): void {
    const enriched = {
      ...detail,
      channels: this.getAll(),
    };
    for (const l of this._listeners) {
      try {
        l(event, enriched);
      } catch (e) {
        logger.error("[ChannelManager] listener error:", e);
      }
    }
  }

  // Create
  add(config: IChannel): void {
    this._delegate.addChannel(config);
    this._emit("add", { channel: config, index: this.count - 1 });
  }

  addDirect(config: IChannel): void {
    this._delegate.addChannelDirect(config);
    this._emit("add", { channel: config, index: this.count - 1 });
  }

  addMany(configs: IChannel[]): void {
    this._delegate.addManyChannels(configs);
    // Note: the "add" event is emitted after user confirms in the dialog.
  }

  // Read
  get(index: number): IChannel | undefined {
    const all = this._delegate.getChannelConfigs();
    return index >= 0 && index < all.length ? all[index] : undefined;
  }

  findByName(name: string): IChannel | undefined {
    return this._delegate.getChannelConfigs().find((c) => c.name === name);
  }

  indexOfName(name: string): number {
    return this._delegate.getChannelConfigs().findIndex((c) => c.name === name);
  }

  findDuplicates(configs: IChannel[]): IChannel[] {
    if (!configs.length) return [];
    const existing = this._delegate.getChannelConfigs();
    if (!existing.length) return [];
    return configs.filter((cfg) =>
      existing.some((ex) => ChannelManager._isSameSource(ex, cfg)),
    );
  }

  private static _isSameSource(a: IChannel, b: IChannel): boolean {
    if (a.name !== b.name) return false;
    const da = a.data;
    const db = b.data;
    if (!da || !db) return false;
    if (da.method !== db.method || da.format !== db.format) return false;
    const aBlob = typeof da.url === "string" && da.url.startsWith("blob:");
    const bBlob = typeof db.url === "string" && db.url.startsWith("blob:");
    if (aBlob && bBlob) return true;
    if (aBlob !== bBlob) return false;
    return da.url === db.url;
  }

  getAll(): IChannel[] {
    return [...this._delegate.getChannelConfigs()];
  }

  getConfig(): IChannel[] {
    return [...this._delegate.getChannelConfigs()];
  }

  getDataByIndex(channelIndex: number): unknown[] | undefined {
    const configs = this._delegate.getChannelConfigs();
    if (channelIndex < 0 || channelIndex >= configs.length) return undefined;
    return this._delegate.getChannelData(channelIndex) ?? [];
  }

  getDataByName(channelName: string): unknown[] | undefined {
    const index = this.indexOfName(channelName);
    if (index === -1) return undefined;
    return this.getDataByIndex(index);
  }

  getDataList(): Array<{
    channelIndex: number;
    channelName: string;
    channelData: unknown[];
  }> {
    const configs = this._delegate.getChannelConfigs();
    return configs.map((cfg, channelIndex) => ({
      channelIndex,
      channelName: cfg.name,
      channelData: this._delegate.getChannelData(channelIndex) ?? [],
    }));
  }

  /**
   * The number of channels currently loaded.
   */
  get count(): number {
    return this._delegate.getChannelCount();
  }

  // Update

  update(index: number, partial: Partial<IChannel>): boolean {
    const configs = this._delegate.getChannelConfigs();
    if (index < 0 || index >= configs.length) return false;

    const existing = configs[index];

    // Merge top-level scalar fields
    if (partial.name !== undefined) existing.name = partial.name;
    if (partial.plot !== undefined) existing.plot = partial.plot;
    if (partial.level !== undefined) existing.level = partial.level;
    if (partial.filter !== undefined) existing.filter = partial.filter;
    if (partial.pin !== undefined) existing.pin = partial.pin;
    if (partial.order !== undefined) existing.order = partial.order;
    if (partial.sortable !== undefined) existing.sortable = partial.sortable;

    // Merge nested objects (shallow spread)
    if (partial.style) {
      existing.style = { ...existing.style, ...partial.style };
    }
    if (partial.data) {
      existing.data = { ...existing.data, ...partial.data };
    }
    if (partial.group) {
      existing.group = { ...existing.group, ...partial.group };
    }
    if (partial.annotation) {
      existing.annotation = { ...existing.annotation, ...partial.annotation };
    }

    // Trigger re-render for the updated channel
    this._delegate.updateChannel(index);

    this._emit("update", { index, channel: existing });
    return true;
  }

  // Delete
  async remove(index: number, silent = false): Promise<boolean> {
    const removed = await this._delegate.removeChannelByIndex(index, silent);
    if (removed) {
      this._emit("remove", { index });
    }
    return removed;
  }

  async removeByName(name: string, silent = true): Promise<number> {
    let count = 0;
    // Remove from the end to keep indices stable
    const configs = this._delegate.getChannelConfigs();
    for (let i = configs.length - 1; i >= 0; i--) {
      if (configs[i].name === name) {
        const ok = await this._delegate.removeChannelByIndex(i, silent);
        if (ok) count++;
      }
    }
    if (count > 0) this._emit("remove");
    return count;
  }

  async clear(silent = true): Promise<void> {
    const configs = this._delegate.getChannelConfigs();
    for (let i = configs.length - 1; i >= 0; i--) {
      await this._delegate.removeChannelByIndex(i, silent);
    }
    this._emit("clear");
  }

  // Reorder

  reorder(fromIndex: number, toIndex: number): void {
    this._delegate.reorderChannels(fromIndex, toIndex);
    this._emit("reorder", { index: toIndex });
  }

  moveUp(index: number): boolean {
    if (index <= 0) return false;
    this.reorder(index, index - 1);
    return true;
  }

  moveDown(index: number): boolean {
    if (index >= this.count - 1) return false;
    this.reorder(index, index + 1);
    return true;
  }

  // Bulk operations ─────────────────────────────────────────────────────
  async replaceAll(channels: IChannel[]): Promise<void> {
    this._delegate.replaceAllChannels(channels);
    this._emit("replace", { channels });
  }

  reload(): void {
    this._delegate.reloadAll();
    this._emit("reload");
  }

  // Export
  exportConfigs(): IChannel[] {
    return this._delegate.getChannelConfigs().map((c, i) => ({
      ...c,
      order: i,
    }));
  }
}
