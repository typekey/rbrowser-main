import { ChannelView } from "../index";

/**
 * Channel multi-selection (Ctrl/Cmd+Click + Shift+Click range select).
 * Static registry shared across all ChannelView instances. Reads the live
 * instance set + active-menu flag from ChannelView; applies the selected
 * background via each channel's applySelectionStyle().
 */
export class ChannelSelector {
  // ── Multi-select (Ctrl/Cmd + Click on channel label) ────────────────
  /** Channels currently selected via Ctrl/Cmd+Click on their labels. */
  public static _selectedChannels: Set<ChannelView> = new Set();
  /**
   * Anchor channel for Shift+Click range selection — the channel most
   * recently added to the selection via Ctrl/Cmd+Click. A subsequent
   * Shift+Click extends the selection from this anchor to the clicked
   * channel (Windows Explorer style).
   */
  private static _lastSelectedChannel: ChannelView | null = null;
  /** Light-blue background applied to a selected channel label. */
  public static readonly SELECTED_LABEL_BG = "rgba(33, 150, 243, 0.22)";
  /** Document listener that clears the selection when clicking empty space. */
  private static _selectionClearListener: ((e: MouseEvent) => void) | null =
    null;

  /** Toggle this channel's membership in the multi-selection set. */
  public static toggleSelection(channel: ChannelView): void {
    ChannelSelector.ensureSelectionClearListener();
    if (ChannelSelector._selectedChannels.has(channel)) {
      ChannelSelector._selectedChannels.delete(channel);
      if (ChannelSelector._lastSelectedChannel === channel) {
        ChannelSelector._lastSelectedChannel = null;
      }
    } else {
      ChannelSelector._selectedChannels.add(channel);
      ChannelSelector._lastSelectedChannel = channel;
    }
    channel.applySelectionStyle();
  }

  /**
   * Build the list of currently selectable channels (those with a rendered,
   * connected label) sorted by their on-screen vertical position. Used to
   * resolve the range for Shift+Click selection.
   */
  private static orderedSelectableChannels(): ChannelView[] {
    const list = Array.from(ChannelView._allInstances).filter(
      (c) => !!c.channelLabelEl && c.channelLabelEl.isConnected,
    );
    list.sort(
      (a, b) =>
        a.channelLabelEl!.getBoundingClientRect().top -
        b.channelLabelEl!.getBoundingClientRect().top,
    );
    return list;
  }

  /**
   * Extend the selection to `target` by filling the gap between `target` and
   * the already-selected channel that should serve as the range origin.
   *
   * The origin is chosen from the CURRENT selection (not a separately tracked
   * "last clicked" channel): we prefer the nearest already-selected channel
   * ABOVE the target; if none exists above, we fall back to the nearest
   * already-selected channel below. Every channel between the origin and the
   * target (inclusive) is added to the selection.
   */
  public static selectRangeTo(target: ChannelView): void {
    ChannelSelector.ensureSelectionClearListener();
    const ordered = ChannelSelector.orderedSelectableChannels();
    const ti = ordered.indexOf(target);
    if (ti === -1) {
      ChannelSelector.toggleSelection(target);
      return;
    }

    // Collect the on-screen indices of the currently-selected channels.
    const selectedIdx = ordered
      .map((c, i) => (ChannelSelector._selectedChannels.has(c) ? i : -1))
      .filter((i) => i >= 0 && i !== ti);

    if (selectedIdx.length === 0) {
      ChannelSelector.toggleSelection(target);
      return;
    }

    // Prefer the nearest selected channel ABOVE the target; otherwise the
    // nearest one below.
    const above = selectedIdx.filter((i) => i < ti);
    const originIdx =
      above.length > 0
        ? Math.max(...above) // closest selected above
        : Math.min(...selectedIdx.filter((i) => i > ti)); // closest below

    const lo = Math.min(originIdx, ti);
    const hi = Math.max(originIdx, ti);
    for (let i = lo; i <= hi; i++) {
      const ch = ordered[i];
      if (!ChannelSelector._selectedChannels.has(ch)) {
        ChannelSelector._selectedChannels.add(ch);
        ch.applySelectionStyle();
      }
    }
    ChannelSelector._lastSelectedChannel = target;
  }

  /** Clear the entire multi-selection and restore each label's background. */
  private static clearSelection(): void {
    ChannelSelector._lastSelectedChannel = null;
    if (ChannelSelector._selectedChannels.size === 0) return;
    const selected = Array.from(ChannelSelector._selectedChannels);
    ChannelSelector._selectedChannels.clear();
    for (const ch of selected) ch.applySelectionStyle();
  }

  /**
   * Install (once) a capture-phase mousedown listener on the document that
   * clears the channel selection when the user clicks anywhere that is not a
   * channel label or an open context menu.
   */
  private static ensureSelectionClearListener(): void {
    if (ChannelSelector._selectionClearListener) return;
    const handler = (e: MouseEvent) => {
      if (ChannelSelector._selectedChannels.size === 0) return;
      // While a context menu is open, let the menu's own outside-click
      // handler manage dismissal — keep the selection intact.
      if (ChannelView._activeMenu) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(".channel-label-el")) return;
      if (target?.closest?.(".channel-context-menu")) return;
      ChannelSelector.clearSelection();
    };
    ChannelSelector._selectionClearListener = handler;
    document.addEventListener("mousedown", handler, true);
  }

  /** Drop a destroyed channel from the selection registries. */
  static onChannelDestroyed(channel: ChannelView): void {
    ChannelSelector._selectedChannels.delete(channel);
    if (ChannelSelector._lastSelectedChannel === channel) {
      ChannelSelector._lastSelectedChannel = null;
    }
  }
}
