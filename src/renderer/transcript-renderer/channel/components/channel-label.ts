import {
  ChannelControlHints,
  createChannelHint,
  positionChannelHint,
  lucideChannelIcon,
} from "./channel-control-hints";
import { ChannelView } from "../index";
import { ChannelSelector } from "./channel-selector";

/**
 * Builds the channel label DOM (name, badges, expand/complement/group
 * controls, drag handle) and wires its interactions: drag-to-reorder,
 * label click -> context menu / multi-select. Reads channel state via `v`.
 */
export class ChannelLabel {
  constructor(private readonly v: ChannelView) {}

  private readonly hints = new ChannelControlHints();

  private cancelDrag: (() => void) | null = null;

  destroy(): void {
    this.hints.destroy();
    this.cancelDrag?.();
  }

  private setupDragHandleEvents(
    dragHandle: SVGElement,
    label: HTMLDivElement,
  ): void {
    if (!this.v.trackContainer || !this.v.onReorderCallback) return;

    let active = false;
    let fromIndex = -1;
    let targetIndex = -1;
    let targetPinned = false;
    let startY = 0;
    let labelTop = 0;
    let indicator: HTMLDivElement | null = null;
    let tooltip: HTMLDivElement | null = null;
    let tracks: HTMLElement[] = [];
    let snapshots: Array<{
      top: number;
      bottom: number;
      midY: number;
      pinned: boolean;
      name: string;
    }> = [];

    const preview = (e: MouseEvent) => {
      if (!active || !indicator || !tooltip) return;
      const remaining = snapshots.filter((_, index) => index !== fromIndex);
      const pinnedBottom = snapshots.reduce(
        (bottom, snap) =>
          snap.pinned ? Math.max(bottom, snap.bottom) : bottom,
        -Infinity,
      );
      if (this.v._isSubChannel) {
        targetIndex = remaining.filter((snap) => e.clientY >= snap.midY).length;
        targetPinned = false;
      } else {
        // Scrolled channels can sit behind the pinned area. Hit-test each
        // section separately so those hidden rows cannot steal a pinned slot.
        const pinned = remaining.filter((snap) => snap.pinned);
        const ordinary = remaining.filter((snap) => !snap.pinned);
        targetPinned = e.clientY < pinnedBottom;
        targetIndex = targetPinned
          ? pinned.filter((snap) => e.clientY >= snap.midY).length
          : pinned.length +
            ordinary.filter((snap) => e.clientY >= snap.midY).length;
        if (targetIndex === 0) targetPinned = true;
      }
      const next = remaining[targetIndex];
      const previous = remaining[targetIndex - 1];
      const source = snapshots[fromIndex];
      const boundary =
        targetIndex === fromIndex
          ? source.top
          : targetIndex > fromIndex
            ? previous.bottom - (source.bottom - source.top)
            : next.top;
      const rect = this.v.trackContainer!.getBoundingClientRect();
      Object.assign(indicator.style, {
        top: `${boundary}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
      });
      const shortName = (name: string) =>
        name.length > 28 ? `${name.slice(0, 27)}…` : name;
      const location = next
        ? `Before ${shortName(next.name)}`
        : previous
          ? `After ${shortName(previous.name)}`
          : "Keep position";
      const pinHint = this.v._isSubChannel
        ? ""
        : targetPinned === this.v.isPinned
          ? targetPinned
            ? " · Keep pinned"
            : " · Keep unpinned"
          : targetPinned
            ? " · Pin on drop"
            : " · Unpin on drop";
      tooltip.textContent = `${location}${pinHint} · Release to move`;
      positionChannelHint(tooltip, e.clientX, e.clientY);
    };

    const finish = (commit: boolean) => {
      if (!active) return;
      active = false;
      indicator?.remove();
      tooltip?.remove();
      indicator = null;
      tooltip = null;
      document.body.style.cursor = "";
      dragHandle.style.cursor = "grab";
      label.style.top = `${labelTop}px`;
      label.style.zIndex = "1000";
      label.style.opacity = "1";
      label.style.transform = "";
      label.style.boxShadow =
        "rgba(0, 0, 0, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.1) 0px 4px 10px";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("wheel", onCancel, true);
      window.removeEventListener("blur", onCancel);
      window.removeEventListener("resize", onCancel);
      this.cancelDrag = null;
      if (
        commit &&
        (targetIndex !== fromIndex ||
          (!this.v._isSubChannel && targetPinned !== this.v.isPinned))
      ) {
        if (this.v._isSubChannel)
          this.v.onReorderCallback?.(fromIndex, targetIndex);
        else this.v.onReorderCallback?.(fromIndex, targetIndex, targetPinned);
      }
      tracks = [];
      snapshots = [];
    };
    const onMove = (e: MouseEvent) => {
      if (!active) return;
      label.style.top = `${labelTop + e.clientY - startY}px`;
      preview(e);
      e.preventDefault();
    };
    const onUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      preview(e);
      finish(true);
    };
    const onCancel = () => finish(false);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };

    dragHandle.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || active) return;
      const parent = this.v.trackContainer?.parentElement;
      if (!parent) return;
      // Sub-channels remain within their own group; top-level channels can
      // cross the pinned boundary. DOM order and config order are kept in sync.
      tracks = Array.from(
        parent.querySelectorAll<HTMLElement>(":scope > .track-container"),
      );
      fromIndex = tracks.indexOf(this.v.trackContainer!);
      if (fromIndex < 0) return;
      snapshots = tracks.map((track) => {
        const rect = track.getBoundingClientRect();
        const group =
          !this.v._isSubChannel &&
          track.nextElementSibling?.classList.contains(
            "subchannel-group-container",
          )
            ? track.nextElementSibling.getBoundingClientRect().height
            : 0;
        const bottom = rect.bottom + group;
        return {
          top: rect.top,
          bottom,
          midY: (rect.top + bottom) / 2,
          pinned: track.dataset.pinned === "true",
          name:
            track.dataset.channelName ??
            track.querySelector(".channel-label-el span")?.textContent ??
            "channel",
        };
      });
      active = true;
      targetIndex = fromIndex;
      startY = e.clientY;
      labelTop = parseFloat(label.style.top) || 0;
      this.cancelDrag = onCancel;
      indicator = document.createElement("div");
      indicator.className = "channel-drop-indicator";
      indicator.setAttribute("aria-hidden", "true");
      Object.assign(indicator.style, {
        position: "fixed",
        height: "3px",
        background: "#2563eb",
        pointerEvents: "none",
        zIndex: "9999998",
        transform: "translateY(-50%)",
      });
      this.hints.hide();
      tooltip = createChannelHint("channel-drag-tooltip");
      document.body.append(indicator, tooltip);
      document.body.style.cursor = "grabbing";
      dragHandle.style.cursor = "grabbing";
      label.style.zIndex = "2000";
      label.style.opacity = "0.9";
      preview(e);
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("keydown", onKeyDown);
      document.addEventListener("wheel", onCancel, true);
      window.addEventListener("blur", onCancel);
      window.addEventListener("resize", onCancel);
      e.preventDefault();
      e.stopPropagation();
    });
  }

  createChannelLabel(): void {
    this.destroy();
    if (!this.v.trackContainer || this.v.channelLabelConfig.enabled === false) {
      return;
    }

    // Remove existing label element if present (allows re-creation)
    if (this.v.channelLabelEl) {
      this.v.channelLabelEl.remove();
      this.v.channelLabelEl = null;
    }

    const label = document.createElement("div");
    const maxLength = this.v.channelLabelConfig.maxLength ?? 20;
    const displayName =
      this.v.config.name.length > maxLength
        ? this.v.config.name.substring(0, maxLength)
        : this.v.config.name;

    // Styles
    const fontSize = this.v.channelLabelConfig.fontSize ?? 12;
    const bgColor =
      this.v.channelLabelConfig.backgroundColor ?? "rgba(255, 255, 255, 0.8)";
    const borderColor = this.v.channelLabelConfig.borderColor ?? "#ced6e0";
    const borderWidth = this.v.channelLabelConfig.borderWidth ?? 0.5;
    const textColor = this.v.channelLabelConfig.textColor ?? "#000000";
    const padding = this.v.channelLabelConfig.padding ?? 3;
    const offset = this.v.channelLabelConfig.offset ?? { x: 0, y: 0 };

    // Get group color for left border
    const groupColor = this.v.config.group?.style?.color ?? borderColor;
    const leftBorderWidth = 5; // Thick left border

    const dragHandle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    dragHandle.setAttribute("viewBox", "0 0 24 24");
    dragHandle.setAttribute("focusable", "false");
    dragHandle.setAttribute("aria-hidden", "true");
    dragHandle.style.cssText = `
      font-size: 16px;
      color: rgb(102, 102, 102);
      cursor: grab;
      margin-right: 2px;
      margin-left: -4px;
      opacity: 0.7;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
      width: 14px;
      height: 14px;
    `;

    const dragPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    dragPath.setAttribute(
      "d",
      "M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2m-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2m0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2",
    );
    dragPath.setAttribute("fill", "currentColor");
    dragHandle.appendChild(dragPath);

    this.setupDragHandleEvents(dragHandle, label);

    const textContainer = document.createElement("span");
    textContainer.textContent = displayName;
    textContainer.style.fontWeight = "600";
    textContainer.style.verticalAlign = "middle";

    const menuButton = lucideChannelIcon("sliders-horizontal");
    menuButton.dataset.channelAction = "settings";
    menuButton.setAttribute("viewBox", "0 0 24 24");
    menuButton.setAttribute("focusable", "false");
    menuButton.setAttribute("aria-hidden", "true");
    menuButton.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
      width: 16px;
      height: 16px;
      margin-left: 6px;
      cursor: pointer;
      opacity: 0.6;
      transition: opacity 0.2s;
      color: ${textColor};
    `;

    menuButton.addEventListener("mouseenter", () => {
      menuButton.style.opacity = "1";
    });
    menuButton.addEventListener("mouseleave", () => {
      menuButton.style.opacity = "0.6";
    });

    // Opens the channel context menu.
    menuButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.v.menu.showChannelMenu(menuButton);
    });

    // ── Expand / Collapse button (only for channels with expand config) ──
    let expandButton: SVGSVGElement | null = null;
    if (this.v.canExpand) {
      expandButton = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      expandButton.setAttribute("viewBox", "0 0 24 24");
      expandButton.setAttribute("focusable", "false");
      expandButton.setAttribute("aria-hidden", "true");
      expandButton.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        vertical-align: middle;
        width: 16px;
        height: 16px;
        margin-left: 4px;
        cursor: pointer;
        opacity: 0.6;
        transition: opacity 0.2s, transform 0.2s;
        color: ${textColor};
      `;

      const expandPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      // Chevron-down icon (▼) — rotated when expanded
      expandPath.setAttribute(
        "d",
        "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z",
      );
      expandPath.setAttribute("fill", "currentColor");
      expandButton.appendChild(expandPath);

      expandButton.addEventListener("mouseenter", () => {
        expandButton!.style.opacity = "1";
      });
      expandButton.addEventListener("mouseleave", () => {
        expandButton!.style.opacity = "0.6";
      });

      expandButton.addEventListener("click", async (e) => {
        e.stopPropagation();
        await this.v.toggleExpand();
        // Rotate chevron: 180° when expanded, 0° when collapsed
        expandButton!.style.transform = this.v._isExpanded
          ? "rotate(180deg)"
          : "";
        // Show/hide splitter & filter icons based on expanded state
        if (splitterBtn)
          splitterBtn.style.display = this.v._isExpanded
            ? "inline-flex"
            : "none";
        if (filterBtn)
          filterBtn.style.display = this.v._isExpanded ? "inline-flex" : "none";
      });
    }

    // ── Splitter & Filter quick-action icons (shown when expanded) ────
    let splitterBtn: SVGSVGElement | null = null;
    let filterBtn: SVGSVGElement | null = null;

    if (this.v.canExpand && !this.v._isSubChannel) {
      // Helper: create a small icon button
      const makeIconBtn = (
        pathD: string,
        title: string,
        onClick: () => void,
      ): SVGSVGElement => {
        const svg = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("focusable", "false");
        svg.setAttribute("aria-hidden", "true");
        svg.style.cssText = `
          display: ${this.v._isExpanded ? "inline-flex" : "none"};
          align-items: center;
          justify-content: center;
          vertical-align: middle;
          width: 14px;
          height: 14px;
          margin-left: 3px;
          cursor: pointer;
          opacity: 0.5;
          transition: opacity 0.2s;
          color: ${textColor};
        `;
        const p = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path",
        );
        p.setAttribute("d", pathD);
        p.setAttribute("fill", "currentColor");
        svg.appendChild(p);
        svg.addEventListener("mouseenter", () => {
          svg.style.opacity = "1";
        });
        svg.addEventListener("mouseleave", () => {
          svg.style.opacity = "0.5";
        });
        svg.addEventListener("click", (e) => {
          e.stopPropagation();
          onClick();
        });
        svg.dataset.channelAction = title.toLowerCase();
        this.hints.attach(svg, () =>
          title === "Splitter"
            ? "Split channel into groups"
            : "Filter sub-channels",
        );
        return svg;
      };

      // Splitter icon (grid/split)
      splitterBtn = makeIconBtn(
        "M4 11h5V5H4v6zm0 7h5v-6H4v6zm6 0h5v-6h-5v6zm6 0h5v-6h-5v6zm-6-7h5V5h-5v6zm6-6v6h5V5h-5z",
        "Splitter",
        () => this.v.menu.handleMenuAction("splitter"),
      );

      // Filter icon (funnel)
      filterBtn = makeIconBtn(
        "M10 18h4v-2h-4v2zM3 6v2h18V6zm3 7h12v-2H6v2z",
        "Filter",
        () => this.v.menu.handleMenuAction("filter"),
      );
    }

    // Append elements

    label.appendChild(dragHandle);

    // ── Group number badge (after drag handle) ───────────────────────
    const groupNum = this.v.config.group?.number;
    if (groupNum !== undefined && !this.v._isSubChannel) {
      const badge = document.createElement("span");
      const badgeColor = this.v.config.group?.style?.color ?? "#4e79a7";
      badge.textContent = String(groupNum);
      badge.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 12px;
        height: 12px;
        border-radius: 2px;
        background: ${badgeColor};
        color: #fff;
        font-size: 9px;
        font-weight: 700;
        margin-right: 2px;
        padding: 0 2px;
        line-height: 1;
        vertical-align: middle;
        flex-shrink: 0;
        text-shadow: 0 0 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3);
      `;
      label.appendChild(badge);

      // ── "S" stacked badge ──────────────────────────────────────────
      if (this.v._stackedChannels.length > 0) {
        const sBadge = document.createElement("span");
        sBadge.textContent = "S";
        sBadge.style.cssText = `
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 12px;
          height: 12px;
          border-radius: 2px;
          background: ${badgeColor};
          color: #fff;
          font-size: 9px;
          font-weight: 700;
          margin-right: 2px;
          padding: 0 2px;
          line-height: 1;
          vertical-align: middle;
          flex-shrink: 0;
          text-shadow: 0 0 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3);
        `;
        label.appendChild(sBadge);
      }
    }

    // ── Stacked name concatenation ───────────────────────────────────
    if (this.v._stackedChannels.length > 0) {
      const allNames = [
        this.v.config.name,
        ...this.v._stackedChannels.map((ch) => ch.getChannelConfig().name),
      ];
      const joined = allNames.join(" + ");
      const truncated =
        joined.length > maxLength
          ? joined.substring(0, maxLength) + "…"
          : joined;
      textContainer.textContent = truncated;
    }

    label.appendChild(textContainer);
    if (expandButton) label.appendChild(expandButton);
    if (splitterBtn) label.appendChild(splitterBtn);
    if (filterBtn) label.appendChild(filterBtn);

    // ── Complement strand icon button (sequence plot only) ─────────
    if ((this.v.config.plot ?? "rect") === "sequence") {
      const compBtn = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      compBtn.setAttribute("viewBox", "0 0 24 24");
      compBtn.setAttribute("focusable", "false");
      compBtn.setAttribute("aria-hidden", "true");
      compBtn.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        vertical-align: middle;
        width: 14px;
        height: 14px;
        margin-left: 4px;
        cursor: pointer;
        opacity: 0.6;
        transition: opacity 0.2s;
        color: ${textColor};
      `;
      const compPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      // Arrow right = sense strand (5'→3'), arrow left = complement (3'→5')
      compPath.setAttribute(
        "d",
        this.v._isComplementStrand
          ? "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          : "M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z",
      );
      compPath.setAttribute("fill", "currentColor");
      compBtn.appendChild(compPath);

      compBtn.addEventListener("mouseenter", () => {
        compBtn.style.opacity = "1";
      });
      compBtn.addEventListener("mouseleave", () => {
        compBtn.style.opacity = "0.6";
      });
      compBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.v.toggleComplementStrand();
        // Label rebuild + icon update is handled inside toggleComplementStrand().
      });

      compBtn.dataset.channelAction = "complement";
      this.hints.attach(compBtn, () =>
        this.v._isComplementStrand
          ? "Show sense strand"
          : "Show complement strand",
      );
      label.appendChild(compBtn);
    }

    if (this.v.isPinned && !this.v._isSubChannel) {
      const pinButton = lucideChannelIcon("pin");
      pinButton.classList.add("channel-pin-button");
      pinButton.dataset.channelAction = "unpin";
      Object.assign(pinButton.style, {
        width: "16px",
        height: "16px",
        marginLeft: "6px",
        color: "#2563eb",
        cursor: "pointer",
        flexShrink: "0",
      });
      pinButton.addEventListener("click", (e) => {
        e.stopPropagation();
        this.v.menu.handleMenuAction("togglePin");
      });
      this.hints.attach(pinButton, () => "Unpin channel");
      label.appendChild(pinButton);
    }
    label.appendChild(menuButton);
    dragHandle.dataset.channelAction = "drag";
    this.hints.attach(dragHandle, () =>
      this.v._isSubChannel
        ? "Drag to reorder within group"
        : "Drag to move · Cross pinned area to pin or unpin",
    );
    this.hints.attach(menuButton, () => "Channel settings");
    if (expandButton) {
      expandButton.dataset.channelAction = "expand";
      this.hints.attach(expandButton, () =>
        this.v._isExpanded ? "Collapse sub-channels" : "Expand sub-channels",
      );
    }

    // Action hints use custom overlays, so native title tooltips stay disabled.
    label.className = "channel-label-el";
    label.style.position = "absolute";
    // Sub-channels: no indent because their trackContainer is already offset
    // by the sample label width; the label sits flush at the left of the track.
    const indentPx = 0;
    label.style.left = `${offset.x + indentPx}px`;
    label.style.top = `${offset.y}px`;
    label.style.fontSize = `${fontSize}px`;
    label.style.color = textColor;
    label.style.backgroundColor = bgColor;

    // Thick group-colored left border, thin borders elsewhere. Sub-channels
    // skip the left border since sample labels already separate them visually.
    if (this.v._isSubChannel) {
      label.style.borderLeft = "none";
    } else {
      label.style.borderLeft = `${leftBorderWidth}px solid ${groupColor}`;
    }
    label.style.borderTop = `${borderWidth}px solid ${borderColor}`;
    label.style.borderRight = `${borderWidth}px solid ${borderColor}`;
    label.style.borderBottom = `${borderWidth}px solid ${borderColor}`;

    // Square left corners, rounded bottom-right.
    label.style.borderRadius = `0 0 4px 0`;

    label.style.padding = `${padding}px`;
    label.style.paddingLeft = `${padding + 2}px`; // Extra padding on left for drag handle
    label.style.paddingRight = `${padding}px`; // Normal padding on right for menu button
    label.style.pointerEvents = "auto";
    label.style.whiteSpace = "nowrap";
    label.style.overflow = "hidden";
    label.style.textOverflow = "ellipsis";
    label.style.backdropFilter = "blur(4px)";
    // Add webkit prefix for Safari support
    (label.style as any).WebkitBackdropFilter = "blur(4px)";
    label.style.boxShadow =
      "rgba(0, 0, 0, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.1) 0px 4px 10px";
    label.style.userSelect = "none";
    label.style.zIndex = "1000";
    label.style.display = "flex";
    label.style.alignItems = "center";

    this.v.trackContainer.dataset.channelName = this.v.config.name;
    this.v.trackContainer.appendChild(label);
    this.v.channelLabelEl = label;

    // ── Multi-select: restore the light-blue background if this channel is
    // currently part of the Ctrl/Cmd+Click selection (persists across the
    // label re-creation that happens on relayout / config changes).
    if (ChannelSelector._selectedChannels.has(this.v)) {
      label.style.backgroundColor = ChannelSelector.SELECTED_LABEL_BG;
    }

    // Ctrl/Cmd + Click toggles this channel's multi-selection membership.
    // Shift + Click (when at least one channel is already selected) extends
    // the selection from the anchor channel to this one (Windows-style range
    // select).
    label.addEventListener("click", (e) => {
      if (
        e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        ChannelSelector._selectedChannels.size > 0
      ) {
        e.preventDefault();
        e.stopPropagation();
        ChannelSelector.selectRangeTo(this.v);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        ChannelSelector.toggleSelection(this.v);
      }
    });

    // Right-click on a selected label opens the group (batch) context menu.
    label.addEventListener("contextmenu", (e) => {
      if (ChannelSelector._selectedChannels.has(this.v)) {
        e.preventDefault();
        e.stopPropagation();
        this.v.menu.showGroupChannelMenu(e.clientX, e.clientY);
      }
    });

    // Only action icons show hover hints; the label itself does not show data.
  }
}
