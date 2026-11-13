import { ChannelView } from "../index";
import { ChannelSelector } from "./channel-selector";
import { ModalDialog } from "../../dialog";
import { defaultConfig } from "../../../../../config/default_config";
import { DIAMOND_TEXTURE_URL } from "../../assets/textures";
import { logger } from "../../utils/logger";

/**
 * Builds and drives the channel context menus (per-channel + multi-select
 * group) and their action dispatch, mutating channel state via ChannelView.
 */
export class ChannelMenu {
  constructor(private readonly v: ChannelView) {}

  private static isSelectionAutoscaled(channels: ChannelView[]): boolean {
    if (channels.length === 0) return false;
    return channels.some((c) => c.config.group?.autoscale === true);
  }

  /** Show the channel context menu anchored to the given button element. */
  public showChannelMenu(anchor: Element): void {
    ChannelView.hideActiveMenu();

    const menu = document.createElement("div");
    menu.className = "channel-context-menu";
    menu.style.cssText = [
      "position:fixed",
      "z-index:100000",
      "min-width:190px",
      "background:#fff",
      "border-radius:7px",
      "box-shadow:0 4px 24px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)",
      "padding:3px 0",
      "font:12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      "color:#333",
      "user-select:none",
      "overflow:visible",
    ].join(";");

    // ── Menu items definition ─────────────────────────────────────────
    type MenuItem =
      | {
          type: "item";
          label: string;
          icon: string;
          action: string;
          disabled?: boolean;
        }
      | {
          type: "submenu";
          label: string;
          icon: string;
          children: { label: string; icon: string; action: string }[];
        }
      | { type: "separator" };

    const isSubChannel = this.v._isSubChannel;
    const isExpanded = this.v._isExpanded;
    const items: MenuItem[] = [];

    // "Map to regions" — only for plot types that produce discrete features
    // with meaningful genomic spans. Hidden for signal/bigwig/BAM/sequence plots.
    const mapToRegionsPlots = new Set([
      "variant",
      "rect",
      "diamond",
      "score_rect",
      "score_curve",
    ]);
    if (mapToRegionsPlots.has(this.v.config.plot || "rect")) {
      items.push({
        type: "item",
        label: "Map to regions",
        icon: "M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4m8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7",
        action: "mapToRegions",
      });
    }

    // Set track name — hidden for subChannels
    if (!isSubChannel && this.v.config.isRenameEnabled !== false) {
      items.push({
        type: "item",
        label: "Set channel name",
        icon: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z",
        action: "setName",
      });
    }

    // Colors
    if (this.v.config.isBackgroundColorEnabled !== false) {
      items.push({
        type: "item",
        label: "Set channel background color",
        icon: "M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15a1.49 1.49 0 0 0 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12M5.21 10L10 5.21 14.79 10zM19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5",
        action: "setBackgroundColor",
      });
    }
    if (this.v.config.isForegroundColorEnabled !== false) {
      items.push({
        type: "item",
        label: "Set channel foreground color",
        icon: "M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15a1.49 1.49 0 0 0 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12M5.21 10L10 5.21 14.79 10zM19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5",
        action: "setForegroundColor",
      });
    }

    // Modification colour is now part of the foreground dialog for transcript/rna plots

    // ── Plot Type submenu (format-dependent) ─────────────────────────
    {
      const dataFormat = (this.v.config.data?.format ?? "").toLowerCase();
      const currentPlot = (this.v.config.plot ?? "").toLowerCase();
      const isBigWig =
        dataFormat === "bigwig" ||
        ["bar", "line", "heatmap", "point"].includes(currentPlot);
      const isBigBed =
        ["bigbed", "bed"].includes(dataFormat) ||
        ["rect", "diamond", "score_rect"].includes(currentPlot);

      if (isBigWig) {
        items.push({
          type: "submenu",
          label: "Plot type",
          icon: "M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z",
          children: [
            {
              label: "Bar",
              icon: "M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z",
              action: "setPlotType:bar",
            },
            {
              label: "Line",
              icon: "M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z",
              action: "setPlotType:line",
            },
            {
              label: "Heatmap",
              icon: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-7 3h5v5h-5zm-7 0h5v5H5zm7 11H5v-5h7zm7 0h-5v-5h5z",
              action: "setPlotType:heatmap",
            },
            {
              label: "Point",
              icon: "M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2",
              action: "setPlotType:point",
            },
          ],
        });
      } else if (isBigBed) {
        items.push({
          type: "submenu",
          label: "Plot type",
          icon: "M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z",
          children: [
            {
              label: "Rect",
              icon: "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12z",
              action: "setPlotType:rect",
            },
            {
              label: "Diamond",
              icon: "M12 2L2 12l10 10 10-10L12 2zm0 2.83L19.17 12 12 19.17 4.83 12 12 4.83z",
              action: "setPlotType:diamond",
            },
          ],
        });
      }

      // Show / Hide name toggle (only for rect-family plots)
      if (
        isBigBed &&
        ["rect", "diamond", "score_rect", ""].includes(currentPlot)
      ) {
        items.push({
          type: "item",
          label: this.v._showName ? "Hide name" : "Show name",
          icon: "M2.5 4v3h5v12h3V7h5V4zm19 5h-9v3h3v7h3v-7h3z",
          action: "toggleShowName",
        });
      }
    }

    // ── Coverage Plot Type submenu (BAM only) ─────────────────────────
    if (
      (this.v.config.plot ?? "").toLowerCase() === "bam" &&
      this.v.bamCoverageEnabled
    ) {
      items.push({
        type: "submenu",
        label: "Coverage plot type",
        icon: "M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z",
        children: [
          {
            label: "Bar",
            icon: "M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z",
            action: "setCoveragePlotType:bar",
          },
          {
            label: "Line",
            icon: "M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z",
            action: "setCoveragePlotType:line",
          },
          {
            label: "Heatmap",
            icon: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-7 3h5v5h-5zm-7 0h5v5H5zm7 11H5v-5h7zm7 0h-5v-5h5z",
            action: "setCoveragePlotType:heatmap",
          },
          {
            label: "Point",
            icon: "M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2",
            action: "setCoveragePlotType:point",
          },
        ],
      });
    }

    // ── Channel Height ────────────────────────────────────────────────
    if (this.v.config.isChannelHeightEnabled !== false) {
      items.push({
        type: "item",
        label: "Set channel height",
        icon: "M13 6.99h3L12 3 8 6.99h3v10.02H8L12 21l4-3.99h-3z",
        action: "setChannelHeight",
      });
    }

    // ── Set Group number ──────────────────────────────────────────────
    if (!isSubChannel && this.v.config.isGroupEnabled !== false) {
      const currentGroupNum = this.v.config.group?.number;
      items.push({
        type: "item",
        label:
          currentGroupNum !== undefined
            ? `Set group (${currentGroupNum})`
            : "Set group",
        icon: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3m-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3m0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5m8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5",
        action: "setGroupNumber",
      });

      // ── Stack / Split toggle ────────────────────────────────────────
      if (currentGroupNum !== undefined) {
        const isStacked = this.v._stackedChannels.length > 0;
        items.push({
          type: "item",
          label: isStacked ? "Set split" : "Set stack channel",
          // layers icon for stack, call_split icon for split
          icon: isStacked
            ? "M14 4l2.29 2.29-2.88 2.88 1.42 1.42 2.88-2.88L20 10V4zm-4 0H4v6l2.29-2.29 4.71 4.7V20h2v-8.41l-5.29-5.3z"
            : "M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z",
          action: isStacked ? "splitStackedChannels" : "stackGroupChannels",
        });
      }
    }

    items.push({ type: "separator" });

    // Splitter & Filter — only shown when expanded AND not a subChannel
    if (isExpanded && !isSubChannel) {
      items.push(
        {
          type: "item",
          label: "Splitter",
          icon: "M4 11h5V5H4v6zm0 7h5v-6H4v6zm6 0h5v-6h-5v6zm6 0h5v-6h-5v6zm-6-7h5V5h-5v6zm6-6v6h5V5h-5z",
          action: "splitter",
        },
        {
          type: "item",
          label: "Filter",
          icon: "M10 18h4v-2h-4v2zM3 6v2h18V6zm3 7h12v-2H6v2z",
          action: "filter",
          disabled: !this.v.canExpand,
        },
        {
          type: "item",
          label: "Set subChannel container height",
          icon: "M13 6.99h3L12 3 8 6.99h3v10.02H8L12 21l4-3.99h-3z",
          action: "setSubChannelContainerHeight",
        },
        { type: "separator" },
      );
    }

    // Move track up/down — enabled for subChannels too
    if (this.v.config.isSortEnabled !== false) {
      items.push(
        {
          type: "item",
          label: "Move channel up",
          icon: "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z",
          action: "moveUp",
        },
        {
          type: "item",
          label: "Move channel down",
          icon: "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z",
          action: "moveDown",
        },
      );
    }

    // Pin / unpin track — not for subChannels
    if (!isSubChannel && this.v.config.isPinEnabled !== false) {
      items.push({
        type: "item",
        label: this.v.isPinned ? "Unpin channel" : "Pin channel to top",
        icon: this.v.isPinned
          ? "M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3"
          : "M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4zm3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1",
        action: "togglePin",
      });
    }

    items.push({ type: "separator" });

    // ── Build per-plot-type download children ──────────────────────
    const fileIcon =
      "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm4 18H6V4h7v5h5z";
    const plotType = this.v.config.plot ?? "rect";

    // ── Sequence complement strand toggle ────────────────────────────
    if (plotType === "sequence") {
      items.push(
        {
          type: "item",
          label: this.v._isComplementStrand
            ? "Show sense strand (5'→3')"
            : "Show complement strand (3'→5')",
          icon: this.v._isComplementStrand
            ? "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
            : "M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z",
          action: "toggleComplement",
        },
        { type: "separator" },
      );
    }

    let downloadDataChildren: any[] = [];

    if (plotType === "sequence") {
      // Sequence → only FASTA
      downloadDataChildren = [
        { label: "Download as FASTA", icon: fileIcon, action: "downloadFASTA" },
      ];
    } else if (plotType === "transcript") {
      // Transcript → CSV, JSON, XML, XLSX (no BED)
      downloadDataChildren = [
        { label: "Download as CSV", icon: fileIcon, action: "downloadCSV" },
        { label: "Download as JSON", icon: fileIcon, action: "downloadJSON" },
        { label: "Download as XML", icon: fileIcon, action: "downloadXML" },
        { label: "Download as XLSX", icon: fileIcon, action: "downloadXLSX" },
      ];
    } else if (plotType === "bam") {
      // BAM → no data export (skip adding "Download channel data" entirely)
      downloadDataChildren = [];
    } else {
      // Default: all formats
      downloadDataChildren = [
        { label: "Download as BED", icon: fileIcon, action: "downloadBED" },
        { label: "Download as CSV", icon: fileIcon, action: "downloadCSV" },
        { label: "Download as XLSX", icon: fileIcon, action: "downloadXLSX" },
        { label: "Download as JSON", icon: fileIcon, action: "downloadJSON" },
        { label: "Download as XML", icon: fileIcon, action: "downloadXML" },
      ];
    }

    // Download submenus
    if (
      downloadDataChildren.length > 0 &&
      this.v.config.isDataDownloadEnabled !== false
    ) {
      items.push({
        type: "submenu",
        label: "Download channel data",
        icon: "M19 9h-4V3H9v6H5l7 7zm-8 2V5h2v6h1.17L12 13.17 9.83 11zm-6 7h14v2H5z",
        children: downloadDataChildren,
      });
    }

    if (this.v.config.isImageDownloadEnabled !== false) {
      items.push({
        type: "submenu",
        label: "Download channel image",
        icon: "M19 9h-4V3H9v6H5l7 7zm-8 2V5h2v6h1.17L12 13.17 9.83 11zm-6 7h14v2H5z",
        children: [
          {
            label: "Download as PNG",
            icon: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2M8.5 13.5l2.5 3.01L14.5 12l4.5 6H5z",
            action: "downloadPNG",
          },
          {
            label: "Download as SVG",
            icon: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2M8.5 13.5l2.5 3.01L14.5 12l4.5 6H5z",
            action: "downloadSVG",
          },
          {
            label: "Download as PDF",
            icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm4 18H6V4h7v5h5z",
            action: "downloadPDF",
          },
        ],
      });
    }

    items.push({ type: "separator" });

    // Delete track — hidden for subChannels
    if (!isSubChannel && this.v.config.isDeleteEnabled !== false) {
      items.push({
        type: "item",
        label: "Delete channel",
        icon: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4z",
        action: "deleteTrack",
      });
    }

    items.push({
      type: "item",
      label: "Cancel",
      icon: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
      action: "cancel",
    });

    // ── Build DOM ─────────────────────────────────────────────────────
    const makeSvgIcon = (pathD: string, color?: string): SVGSVGElement => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "18");
      svg.setAttribute("height", "18");
      svg.style.cssText = `flex-shrink:0;margin-right:8px;color:${color ?? "#555"};`;
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("d", pathD);
      path.setAttribute("fill", "currentColor");
      svg.appendChild(path);
      return svg;
    };

    const handleAction = (action: string) => {
      ChannelView.hideActiveMenu();
      if (action === "cancel") return;
      this.handleMenuAction(action);
    };

    const createRow = (
      label: string,
      iconPath: string,
      opts: {
        action?: string;
        disabled?: boolean;
        hasSubmenu?: boolean;
        color?: string;
      } = {},
    ): HTMLElement => {
      const row = document.createElement("div");
      row.style.cssText = [
        "display:flex",
        "align-items:center",
        "padding:4px 12px",
        "cursor:" + (opts.disabled ? "default" : "pointer"),
        "transition:background 0.1s",
        opts.disabled ? "opacity:0.38" : "",
        opts.color ? `color:${opts.color}` : "",
      ].join(";");

      row.appendChild(makeSvgIcon(iconPath, opts.color));

      const span = document.createElement("span");
      span.style.cssText = "flex:1;white-space:nowrap;";
      span.textContent = label;
      row.appendChild(span);

      if (opts.hasSubmenu) {
        const chevron = document.createElement("span");
        chevron.textContent = "›";
        chevron.style.cssText = "margin-left:8px;font-size:16px;color:#999;";
        row.appendChild(chevron);
      }

      if (!opts.disabled && opts.action) {
        const act = opts.action;
        row.addEventListener("click", (e) => {
          e.stopPropagation();
          handleAction(act);
        });
      }

      // Hover effect
      if (!opts.disabled) {
        row.addEventListener("mouseenter", () => {
          row.style.background = "rgba(0,0,0,0.04)";
        });
        row.addEventListener("mouseleave", () => {
          row.style.background = "none";
        });
      }

      return row;
    };

    for (const item of items) {
      if (item.type === "separator") {
        const sep = document.createElement("div");
        sep.style.cssText = "height:1px;background:#e8e8e8;margin:4px 0;";
        menu.appendChild(sep);
      } else if (item.type === "item") {
        const color = item.action === "deleteTrack" ? "#e15759" : undefined;
        const row = createRow(item.label, item.icon, {
          action: item.action,
          disabled: item.disabled,
          color,
        });
        menu.appendChild(row);
      } else if (item.type === "submenu") {
        const parentRow = createRow(item.label, item.icon, {
          hasSubmenu: true,
        });
        parentRow.style.position = "relative";

        // Build submenu
        const submenu = document.createElement("div");
        submenu.style.cssText = [
          "position:absolute",
          "left:100%",
          "top:-4px",
          "min-width:180px",
          "background:#fff",
          "border-radius:8px",
          "box-shadow:0 4px 24px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)",
          "padding:4px 0",
          "display:none",
          "z-index:100001",
        ].join(";");

        for (const child of item.children) {
          const childRow = createRow(child.label, child.icon, {
            action: child.action,
          });
          submenu.appendChild(childRow);
        }

        parentRow.appendChild(submenu);

        // Show/hide submenu on hover
        parentRow.addEventListener("mouseenter", () => {
          parentRow.style.background = "rgba(0,122,255,0.08)";
          (parentRow.querySelector("span") as HTMLElement).style.color =
            "#007aff";
          submenu.style.display = "block";
        });
        parentRow.addEventListener("mouseleave", () => {
          parentRow.style.background = "none";
          (parentRow.querySelector("span") as HTMLElement).style.color = "";
          submenu.style.display = "none";
        });

        menu.appendChild(parentRow);
      }
    }

    // Position the menu
    document.body.appendChild(menu);
    ChannelView._activeMenu = menu;

    const anchorRect = anchor.getBoundingClientRect();
    let left = anchorRect.right + 4;
    let top = anchorRect.top;

    // Clamp to viewport
    const menuRect = menu.getBoundingClientRect();
    if (left + menuRect.width > window.innerWidth - 8) {
      left = anchorRect.left - menuRect.width - 4;
    }
    if (top + menuRect.height > window.innerHeight - 8) {
      top = window.innerHeight - 8 - menuRect.height;
    }
    if (top < 4) top = 4;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    // Close on outside click
    const outsideHandler = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        ChannelView.hideActiveMenu();
      }
    };
    ChannelView._menuOutsideListener = outsideHandler;
    // Delay attachment to avoid the current click from closing the menu
    requestAnimationFrame(() => {
      document.addEventListener("mousedown", outsideHandler, true);
    });
  }

  // ── Multi-select group context menu ─────────────────────────────────

  /**
   * Classify this channel for the purpose of the multi-select group menu.
   *  • "bigwig" — signal tracks (bigwig data or bar/line/heatmap/point plots)
   *  • "rect"   — interval tracks drawn as rectangles / diamonds
   *  • "other"  — everything else (transcript, bam, sequence, variant, …)
   */
  public groupChannelType(): "bigwig" | "rect" | "other" {
    const fmt = (this.v.config.data as any)?.format;
    const plot = this.v.config.plot || "rect";
    if (
      fmt === "bigwig" ||
      plot === "bar" ||
      plot === "line" ||
      plot === "heatmap" ||
      plot === "point"
    ) {
      return "bigwig";
    }
    // rect and diamond are the same interval-drawing family — keeping them
    // together means the "Plot type" item stays available after a
    // rect → diamond switch (and lets the user switch back).
    if (plot === "rect" || plot === "diamond") return "rect";
    return "other";
  }

  /** Set a solid foreground colour and re-render (used by the group menu). */
  setForegroundColorSolid(color: string): void {
    const style = this.v.ensureMutableStyle();
    style.foreground = color;
    this.v._foregroundColor = color;
    this.v.refreshGpuColors();
    this.v.refreshScoreLabels();
    this.v.onDirtyCallback?.();
  }

  /**
   * Change the plot type without going through a dialog (used by the group
   * menu). Mirrors the core of the single-channel `setPlotType:` handler,
   * including diamond style defaults and texture pre-loading.
   */
  setPlotTypeDirect(newPlot: string): void {
    this.v.config.plot = newPlot as any;
    if (newPlot === "diamond") {
      const style = this.v.ensureMutableStyle();
      const dd = defaultConfig.channels.diamond.style;
      if (style.size === undefined) style.size = dd.size;
      if (style.maxHeight === undefined) style.maxHeight = dd.maxHeight;
      if (style.sep === undefined) style.sep = dd.sep;
      if (style.padding === undefined) style.padding = dd.padding;
      this.v._ucscStyleInferred = undefined;
      if (this.v.data && this.v.data.length > 0) {
        this.v.tryAutoDetectStyle();
        this.v.tryAutoExpand();
      }
      if (
        this.v.featureRenderer &&
        !this.v.featureRenderer.textures.isDiamondReady
      ) {
        this.v.featureRenderer.textures
          .loadDiamond(DIAMOND_TEXTURE_URL)
          .then(() => {
            this.v.onMenuAction?.(this.v, "setPlotType", newPlot);
          })
          .catch(() => {});
        return;
      }
    }
    this.v.onMenuAction?.(this.v, "setPlotType", newPlot);
  }

  /**
   * Apply a group-menu action to ALL currently selected channels at once.
   * Dialogs are shown once; the chosen value is then applied uniformly.
   */
  private async handleGroupAction(action: string): Promise<void> {
    const channels = Array.from(ChannelSelector._selectedChannels);
    if (channels.length === 0) return;
    const first = channels[0];
    const autoscaled = ChannelMenu.isSelectionAutoscaled(channels);

    if (action === "groupAutoscale") {
      if (autoscaled) {
        // Toggle OFF — clear the autoscale flag and snap each channel back to
        // its own current-region min/max scale. setGroupScoreRange(null)
        // re-uploads the local scale immediately, no reload needed.
        for (const ch of channels) {
          if (ch.config.group) {
            // Only drop the group number when it was created by autoscale.
            if (ch.config.group.autoscale) delete ch.config.group.number;
            delete ch.config.group.autoscale;
            delete ch.config.group.autoscaleRange;
          }
          ch.setGroupScoreRange(null, true);
          ch.createChannelLabel();
        }
        first.onMenuAction?.(first, "relayout");
        return;
      }
      // Toggle ON — assign a fresh shared group number + persistent
      // autoscale flag so the selected channels are grouped together and
      // share a common min/max scale that survives pan / zoom / reorder.
      let maxNum = 0;
      for (const inst of ChannelView._allInstances) {
        const num = inst.config.group?.number;
        if (typeof num === "number" && num > maxNum) maxNum = num;
      }
      const groupNum = maxNum + 1;
      for (const ch of channels) {
        if (!ch.config.group) ch.config.group = { name: ch.config.name };
        ch.config.group.number = groupNum;
        ch.config.group.autoscale = true;
        ch._groupScoreRange = null;
        ch.createChannelLabel();
      }
      // Relayout triggers syncGroupScoreRanges() → shared scale.
      first.onMenuAction?.(first, "relayout");
      return;
    }

    if (action === "setBackgroundColor") {
      const color = await ModalDialog.colorPicker(
        "Set channels background color",
        first.backgroundColor,
      );
      if (!color) return;
      for (const ch of channels) ch.backgroundColor = color;
      ChannelMenu.reapplyAutoscale(channels);
      return;
    }

    if (action === "setForegroundColor") {
      const color = await ModalDialog.colorPicker(
        "Set channels foreground color",
        first.getForegroundColor(),
      );
      if (!color) return;
      for (const ch of channels) ch.menu.setForegroundColorSolid(color);
      ChannelMenu.reapplyAutoscale(channels);
      return;
    }

    if (action === "setChannelHeight") {
      const cur = String(first.config.style?.height ?? 80);
      const input = await ModalDialog.prompt("Set channels height", cur, {
        subtitle: "Enter height in pixels (e.g. 80, 160).",
        placeholder: "pixels",
      });
      if (input === null) return;
      const h = parseInt(input, 10);
      if (!isFinite(h) || h < 10) return;
      for (const ch of channels) {
        ch.ensureMutableStyle();
        ch.config.style!.height = h;
      }
      first.onMenuAction?.(first, "relayout");
      return;
    }

    if (action.startsWith("setPlotType:")) {
      const newPlot = action.slice("setPlotType:".length);
      for (const ch of channels) ch.menu.setPlotTypeDirect(newPlot);
      return;
    }

    if (action === "deleteChannels") {
      // Forward the whole selection so the renderer can remove every selected
      // channel in one batch (with a single confirmation dialog).
      first.onMenuAction?.(first, "deleteChannels", { channels });
      return;
    }

    if (
      action === "downloadPNG" ||
      action === "downloadSVG" ||
      action === "downloadPDF"
    ) {
      // Forward the WHOLE selection so the renderer can stitch every
      // channel into a single combined image (a synchronous per-channel
      // download loop only yields one file because the browser blocks
      // rapid successive downloads).
      const format = action.replace("download", "").toUpperCase();
      first.onMenuAction?.(first, "downloadChannelsImage", {
        format,
        channels,
      });
      return;
    }
  }

  /**
   * Re-apply the shared autoscale range to a selection after an operation
   * (e.g. colour change) that may have re-uploaded GPU data with each
   * channel's own scale. No-op when the selection is not autoscaled.
   */
  private static reapplyAutoscale(channels: ChannelView[]): void {
    if (!ChannelMenu.isSelectionAutoscaled(channels)) return;
    // Clear the cached range so syncGroupScoreRanges() re-uploads instead of
    // hitting its unchanged-range early-return.
    for (const ch of channels) ch._groupScoreRange = null;
    channels[0].onMenuAction?.(channels[0], "relayout");
  }

  /**
   * Show the multi-select group context menu at the given viewport
   * coordinates. The available items depend on the combined type of the
   * currently selected channels.
   */
  public showGroupChannelMenu(x: number, y: number): void {
    ChannelView.hideActiveMenu();

    const channels = Array.from(ChannelSelector._selectedChannels);
    if (channels.length === 0) return;

    const types = new Set(channels.map((c) => c.menu.groupChannelType()));
    const allBigwig = types.size === 1 && types.has("bigwig");
    const allRect = types.size === 1 && types.has("rect");
    const autoscaleActive = ChannelMenu.isSelectionAutoscaled(channels);

    // ── Icons (Material Design paths) ─────────────────────────────────
    const ICON_AUTOSCALE =
      "M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z";
    const ICON_BG =
      "M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15c-.59.59-.59 1.54 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10L10 5.21 14.79 10H5.21zM19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5z";
    const ICON_FG =
      "M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z";
    const ICON_PLOT =
      "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14H7v-7h3v7zm4 0h-3V7h3v10zm4 0h-3v-4h3v4z";
    const ICON_HEIGHT =
      "M9 3L5 6.99h3V14h2V6.99h3L9 3zm7 14.01V10h-2v7.01h-3L15 21l4-3.99h-3z";
    const ICON_IMG =
      "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2M8.5 13.5l2.5 3.01L14.5 12l4.5 6H5z";

    type GroupItem =
      | {
          type: "item";
          label: string;
          icon: string;
          action: string;
          active?: boolean;
        }
      | {
          type: "submenu";
          label: string;
          icon: string;
          children: { label: string; icon: string; action: string }[];
        }
      | { type: "separator" };

    const items: GroupItem[] = [];

    if (allBigwig) {
      items.push({
        type: "item",
        label: "Group Autoscale",
        icon: ICON_AUTOSCALE,
        action: "groupAutoscale",
        active: autoscaleActive,
      });
    }

    items.push({
      type: "item",
      label: "Set channels background color",
      icon: ICON_BG,
      action: "setBackgroundColor",
    });
    items.push({
      type: "item",
      label: "Set channels foreground color",
      icon: ICON_FG,
      action: "setForegroundColor",
    });

    if (allBigwig) {
      items.push({
        type: "submenu",
        label: "Plot type",
        icon: ICON_PLOT,
        children: [
          { label: "Bar", icon: ICON_PLOT, action: "setPlotType:bar" },
          { label: "Line", icon: ICON_PLOT, action: "setPlotType:line" },
          { label: "Heatmap", icon: ICON_PLOT, action: "setPlotType:heatmap" },
          { label: "Point", icon: ICON_PLOT, action: "setPlotType:point" },
        ],
      });
    } else if (allRect) {
      items.push({
        type: "submenu",
        label: "Plot type",
        icon: ICON_PLOT,
        children: [
          { label: "Rect", icon: ICON_PLOT, action: "setPlotType:rect" },
          {
            label: "Diamond",
            icon: ICON_PLOT,
            action: "setPlotType:diamond",
          },
        ],
      });
    }

    items.push({
      type: "item",
      label: "Set channels height",
      icon: ICON_HEIGHT,
      action: "setChannelHeight",
    });
    items.push({
      type: "submenu",
      label: "Download channels images",
      icon: ICON_IMG,
      children: [
        { label: "Download as PNG", icon: ICON_IMG, action: "downloadPNG" },
        { label: "Download as SVG", icon: ICON_IMG, action: "downloadSVG" },
        { label: "Download as PDF", icon: ICON_IMG, action: "downloadPDF" },
      ],
    });

    // Delete the whole selection (shown in red, like the single-channel menu).
    items.push({ type: "separator" });
    items.push({
      type: "item",
      label: `Delete ${channels.length} channel${channels.length > 1 ? "s" : ""}`,
      icon: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4z",
      action: "deleteChannels",
    });

    // ── Build the menu DOM ────────────────────────────────────────────
    const menu = document.createElement("div");
    menu.className = "channel-context-menu";
    menu.style.cssText = [
      "position:fixed",
      "z-index:100000",
      "min-width:210px",
      "background:#fff",
      "border-radius:7px",
      "box-shadow:0 4px 24px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)",
      "padding:3px 0",
      "font:12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      "color:#333",
      "user-select:none",
      "overflow:visible",
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText =
      "padding:4px 12px 6px;font-size:11px;font-weight:600;color:#888;border-bottom:1px solid #eee;margin-bottom:3px;";
    header.textContent = `${channels.length} channel${channels.length > 1 ? "s" : ""} selected`;
    menu.appendChild(header);

    const makeSvgIcon = (pathD: string, color?: string): SVGSVGElement => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "18");
      svg.setAttribute("height", "18");
      svg.style.cssText = `flex-shrink:0;margin-right:8px;color:${color ?? "#555"};`;
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("d", pathD);
      path.setAttribute("fill", "currentColor");
      svg.appendChild(path);
      return svg;
    };

    const handleAction = (action: string) => {
      ChannelView.hideActiveMenu();
      void this.handleGroupAction(action);
    };

    const createRow = (
      label: string,
      iconPath: string,
      opts: {
        action?: string;
        hasSubmenu?: boolean;
        active?: boolean;
        color?: string;
      } = {},
    ): HTMLElement => {
      const row = document.createElement("div");
      const activeColor = "#1976d2";
      row.style.cssText = [
        "display:flex",
        "align-items:center",
        "padding:4px 12px",
        "cursor:pointer",
        "transition:background 0.1s",
        opts.active ? "background:rgba(33,150,243,0.12)" : "",
        opts.color ? `color:${opts.color}` : "",
      ].join(";");
      row.appendChild(
        makeSvgIcon(
          iconPath,
          opts.color ?? (opts.active ? activeColor : undefined),
        ),
      );
      const span = document.createElement("span");
      span.style.cssText = `flex:1;white-space:nowrap;${opts.active ? `color:${activeColor};font-weight:600;` : opts.color ? `color:${opts.color};` : ""}`;
      span.textContent = label;
      row.appendChild(span);
      if (opts.active) {
        // Trailing check mark indicating the toggle is currently ON.
        const check = document.createElement("span");
        check.textContent = "✓";
        check.style.cssText = `margin-left:8px;font-size:13px;color:${activeColor};font-weight:700;`;
        row.appendChild(check);
      }
      if (opts.hasSubmenu) {
        const chevron = document.createElement("span");
        chevron.textContent = "›";
        chevron.style.cssText = "margin-left:8px;font-size:16px;color:#999;";
        row.appendChild(chevron);
      }
      if (opts.action) {
        const act = opts.action;
        row.addEventListener("click", (e) => {
          e.stopPropagation();
          handleAction(act);
        });
      }
      row.addEventListener("mouseenter", () => {
        row.style.background = opts.active
          ? "rgba(33,150,243,0.2)"
          : "rgba(0,0,0,0.04)";
      });
      row.addEventListener("mouseleave", () => {
        row.style.background = opts.active ? "rgba(33,150,243,0.12)" : "none";
      });
      return row;
    };

    for (const item of items) {
      if (item.type === "separator") {
        const sep = document.createElement("div");
        sep.style.cssText = "height:1px;background:#e8e8e8;margin:4px 0;";
        menu.appendChild(sep);
      } else if (item.type === "item") {
        menu.appendChild(
          createRow(item.label, item.icon, {
            action: item.action,
            active: item.active,
            color: item.action === "deleteChannels" ? "#e15759" : undefined,
          }),
        );
      } else {
        const parentRow = createRow(item.label, item.icon, {
          hasSubmenu: true,
        });
        parentRow.style.position = "relative";
        const submenu = document.createElement("div");
        submenu.style.cssText = [
          "position:absolute",
          "left:100%",
          "top:-4px",
          "min-width:180px",
          "background:#fff",
          "border-radius:8px",
          "box-shadow:0 4px 24px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)",
          "padding:4px 0",
          "display:none",
          "z-index:100001",
        ].join(";");
        for (const child of item.children) {
          submenu.appendChild(
            createRow(child.label, child.icon, { action: child.action }),
          );
        }
        parentRow.appendChild(submenu);
        parentRow.addEventListener("mouseenter", () => {
          parentRow.style.background = "rgba(0,122,255,0.08)";
          (parentRow.querySelector("span") as HTMLElement).style.color =
            "#007aff";
          submenu.style.display = "block";
        });
        parentRow.addEventListener("mouseleave", () => {
          parentRow.style.background = "none";
          (parentRow.querySelector("span") as HTMLElement).style.color = "";
          submenu.style.display = "none";
        });
        menu.appendChild(parentRow);
      }
    }

    // ── Position the menu at the cursor, clamped to the viewport ───────
    document.body.appendChild(menu);
    ChannelView._activeMenu = menu;

    let left = x;
    let top = y;
    const menuRect = menu.getBoundingClientRect();
    if (left + menuRect.width > window.innerWidth - 8) {
      left = window.innerWidth - 8 - menuRect.width;
    }
    if (top + menuRect.height > window.innerHeight - 8) {
      top = window.innerHeight - 8 - menuRect.height;
    }
    if (left < 4) left = 4;
    if (top < 4) top = 4;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const outsideHandler = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        ChannelView.hideActiveMenu();
      }
    };
    ChannelView._menuOutsideListener = outsideHandler;
    requestAnimationFrame(() => {
      document.addEventListener("mousedown", outsideHandler, true);
    });
  }

  /**
   * Handle a channel menu action.
   * Actions that only affect this channel are handled inline;
   * actions requiring renderer interaction (move, delete, download)
   * are forwarded via `onMenuAction`.
   */
  public handleMenuAction(action: string): void {
    switch (action) {
      case "mapToRegions":
        this.v.onMenuAction?.(this.v, "mapToRegions");
        break;

      case "setName": {
        ModalDialog.prompt("Set track name", this.v.config.name, {
          subtitle: "Enter a new display name for this track.",
          placeholder: "Track name",
        }).then((newName) => {
          if (newName !== null && newName.trim() !== "") {
            this.v.name = newName.trim();
            this.v.createChannelLabel();
            this.v.onDirtyCallback?.();
          }
        });
        break;
      }

      case "setBackgroundColor": {
        ModalDialog.colorPicker(
          "Set track background color",
          this.v._backgroundColor,
        ).then((color) => {
          if (color) {
            this.v.backgroundColor = color;
            this.v.onDirtyCallback?.();
          }
        });
        break;
      }

      case "setForegroundColor": {
        const plotType = this.v.config.plot || "bar";
        const styleFg = this.v.config.style?.foreground;

        // Build current state for the dialog
        const currentFg: {
          color?: string;
          colormap?: string;
          range?: [number, number];
          reversed?: boolean;
          readsColor?: { plus?: string; minus?: string; other?: string };
          baseColors?: { [base: string]: string };
          refColor?: string;
          baseTextColor?: string;
          transcriptColors?: { [type: string]: string };
          coverageColor?: string;
          coverageColormap?: string;
          coverageRange?: [number, number];
          modificationColor?: string;
          modificationColormap?: string;
          modificationRange?: [number, number];
        } = {
          color: this.v._foregroundColor,
        };

        // Populate colormap info if present
        if (styleFg && typeof styleFg === "object" && !Array.isArray(styleFg)) {
          currentFg.colormap = styleFg.colormap;
          currentFg.range = styleFg.range;
          currentFg.reversed = (styleFg as any).reversed;
          // Populate transcript feature colour overrides
          if ((styleFg as any).custom) {
            currentFg.transcriptColors = (styleFg as any).custom;
          }
        }

        // Populate BAM strand colours + coverage colours
        if (plotType === "bam") {
          currentFg.readsColor = this.v.config.style?.readsColor;
          const covCfg = this.v.bamCoverageConfig;
          if (covCfg.color) {
            if (typeof covCfg.color === "string") {
              currentFg.coverageColor = covCfg.color;
            } else if (typeof covCfg.color === "object") {
              currentFg.coverageColormap = covCfg.color.colormap;
              currentFg.coverageRange = covCfg.color.range;
            }
          }
        }

        // Populate variant / sequence base colours
        if (plotType === "variant" || plotType === "sequence") {
          currentFg.baseColors = this.v.config.style?.baseColors as
            { [base: string]: string } | undefined;
        }
        if (plotType === "variant") {
          currentFg.refColor = this.v.config.style?.refColor;
          currentFg.baseTextColor = this.v.config.style?.baseTextColor;
        }

        // Populate modification colour for transcript/rna plots
        if (plotType === "transcript" || plotType === "rna") {
          const modCfg = this.v.config.style?.modification;
          if (modCfg?.color !== undefined) {
            if (typeof modCfg.color === "string") {
              currentFg.modificationColor = modCfg.color;
            } else if (typeof modCfg.color === "object") {
              currentFg.modificationColormap = modCfg.color.colormap;
              currentFg.modificationRange = modCfg.color.range;
            }
          } else {
            // Default: coolwarm colormap
            currentFg.modificationColormap = "coolwarm";
          }
        }

        // Build stacked channel data for the dialog
        const isStackedHost = this.v._stackedChannels.length > 0;
        const stackedChannelsForDialog = isStackedHost
          ? this.v._stackedChannels.map((sch) => {
              const schConfig = sch.getChannelConfig();
              const schFg = schConfig.style?.foreground;
              const schCurrent: {
                color?: string;
                colormap?: string;
                range?: [number, number];
                reversed?: boolean;
              } = {
                color: sch.getForegroundColor(),
              };
              if (schFg && typeof schFg === "object" && !Array.isArray(schFg)) {
                schCurrent.colormap = schFg.colormap;
                schCurrent.range = schFg.range;
                schCurrent.reversed = (schFg as any).reversed;
              }
              return {
                name: schConfig.name,
                plotType: schConfig.plot || "bar",
                current: schCurrent,
                alpha: schConfig.group?.alpha ?? 0.8,
              };
            })
          : undefined;

        ModalDialog.foregroundColor(
          this.v.config.name || "Set track foreground color",
          plotType,
          currentFg,
          {
            grouped: this.v.config.group?.number !== undefined,
            stackedChannels: stackedChannelsForDialog,
            hostAlpha: isStackedHost
              ? (this.v.config.group?.alpha ?? 0.8)
              : undefined,
          },
        ).then((result) => {
          if (!result) return;
          const style = this.v.ensureMutableStyle();

          if (result.mode === "solid" && result.color) {
            // Solid colour — store as string (for diamond, preserve data-mapping fields)
            if (
              plotType === "diamond" &&
              style.foreground &&
              typeof style.foreground === "object" &&
              !Array.isArray(style.foreground)
            ) {
              // Remove colormap fields, keep data-driven fields
              const existing = style.foreground as any;
              delete existing.colormap;
              delete existing.range;
              delete existing.reversed;
            } else {
              style.foreground = result.color;
            }
            this.v._foregroundColor = result.color;
          } else if (result.mode === "colormap" && result.colormap) {
            // Gradient / colormap — preserve diamond data-mapping fields
            if (
              plotType === "diamond" &&
              style.foreground &&
              typeof style.foreground === "object" &&
              !Array.isArray(style.foreground)
            ) {
              const existing = style.foreground as any;
              existing.colormap = result.colormap;
              existing.range = result.range;
              existing.reversed = result.reversed;
            } else {
              style.foreground = {
                colormap: result.colormap,
                range: result.range,
                reversed: result.reversed,
              };
            }
            this.v._foregroundColor = this.v.extractForegroundColor();
          } else if (result.mode === "feature") {
            // Feature-specific colours
            if (result.readsColor) {
              style.readsColor = result.readsColor;
            }
            if (result.baseColors) {
              style.baseColors = result.baseColors;
            }
            if (result.refColor !== undefined) {
              style.refColor = result.refColor;
            }
            if (result.baseTextColor !== undefined) {
              style.baseTextColor = result.baseTextColor;
            }
            // Transcript feature colours → store in foreground.custom
            if (result.transcriptColors) {
              const existing =
                style.foreground &&
                typeof style.foreground === "object" &&
                !Array.isArray(style.foreground)
                  ? style.foreground
                  : {};
              style.foreground = {
                ...existing,
                custom: result.transcriptColors,
              };
            }
            // BAM coverage colour
            if (result.coverageColor !== undefined) {
              if (!style.coverage || typeof style.coverage === "boolean") {
                style.coverage = { enabled: true };
              }
              (style.coverage as any).color = result.coverageColor;
            }
            if (result.coverageColormap) {
              if (!style.coverage || typeof style.coverage === "boolean") {
                style.coverage = { enabled: true };
              }
              (style.coverage as any).color = {
                colormap: result.coverageColormap,
                range: result.coverageRange,
              };
            }
            // Modification colour (transcript / rna)
            if (result.modificationColor !== undefined) {
              if (!style.modification) {
                style.modification = {};
              }
              style.modification.color = result.modificationColor;
            }
            if (result.modificationColormap) {
              if (!style.modification) {
                style.modification = {};
              }
              style.modification.color = {
                colormap: result.modificationColormap,
                range: result.modificationRange,
              };
            }
          }

          // ── Apply stacked channel results ─────────────────────────
          if (result.alpha !== undefined && this.v.config.group) {
            this.v.config.group.alpha = result.alpha;
          }
          if (result.stackedResults && this.v._stackedChannels.length > 0) {
            for (const sr of result.stackedResults) {
              const target = this.v._stackedChannels.find(
                (sc) => sc.getChannelConfig().name === sr.name,
              );
              if (!target) continue;
              const tCfg = target.getChannelConfig();
              if (!tCfg.style) tCfg.style = {};
              else if (Object.isFrozen(tCfg.style))
                tCfg.style = { ...tCfg.style };
              // Apply alpha
              if (sr.alpha !== undefined && tCfg.group) {
                tCfg.group.alpha = sr.alpha;
              }
              // Apply foreground colour
              if (sr.mode === "solid" && sr.color) {
                tCfg.style.foreground = sr.color;
              } else if (sr.mode === "colormap" && sr.colormap) {
                tCfg.style.foreground = {
                  colormap: sr.colormap,
                  range: sr.range,
                  reversed: sr.reversed,
                };
              }
              // Re-upload stacked channel GPU data
              target.refreshGpuColors();
              target.refreshScoreLabels();
            }
          }

          // Re-upload GPU data with new colours for score plots
          this.v.refreshGpuColors();
          this.v.refreshScoreLabels();
          this.v.onDirtyCallback?.();
        });
        break;
      }

      case "splitter": {
        ModalDialog.splitter("Splitter", {
          sep: this.v.config.style?.sep,
          keys: this.v.config.style?.keys,
          expand: this.v.config.style?.expand,
          order: this.v.config.style?.order,
        }).then(async (result) => {
          if (!result) return;
          const style = this.v.ensureMutableStyle();

          // ── Smart filter carry-over on Splitter change ──
          // Each sub-channel has an implicit condition: the expand field(s)
          // and their value(s).  When the Splitter fields change we try to
          // preserve the user's Filter intent:
          //
          //  • If ALL old expand fields are still present in the new fields
          //    (i.e. user ADDED fields), the old filter conditions are still
          //    meaningful.  We project the old filter's per-field values onto
          //    the new composite keys and keep only matching ones.
          //
          //  • If ANY old expand field was removed, the old filter conditions
          //    are invalid → clear the filter (show all sub-channels).
          const COMPOSITE_SEP = "\x00";
          const oldExpandFields = this.v.normalizeExpandFields();
          const oldFilter = this.v._expandFilterSelection;

          // Apply new config FIRST so normalizeExpandFields() returns the
          // new fields for computeExpandValues() below.
          style.sep = result.sep || undefined;
          style.keys = result.keys.length > 0 ? result.keys : undefined;
          style.expand =
            result.expand.length > 0
              ? result.expand.length === 1
                ? result.expand[0]
                : result.expand
              : undefined;
          style.order = result.order.length > 0 ? result.order : undefined;

          const newExpandFields = this.v.normalizeExpandFields();

          if (oldFilter && oldFilter.length > 0 && oldExpandFields.length > 0) {
            // Check: are ALL old fields still present in the new fields?
            const allOldFieldsKept = oldExpandFields.every((f) =>
              newExpandFields.includes(f),
            );

            if (allOldFieldsKept) {
              // Old fields are a subset of new fields → carry over filter.
              // Extract per-old-field value sets from the old composite keys.
              const oldFieldValueSets = new Map<string, Set<string>>();
              for (const f of oldExpandFields)
                oldFieldValueSets.set(f, new Set());
              for (const ck of oldFilter) {
                const parts =
                  oldExpandFields.length === 1 ? [ck] : ck.split(COMPOSITE_SEP);
                for (let i = 0; i < oldExpandFields.length; i++) {
                  if (parts[i])
                    oldFieldValueSets.get(oldExpandFields[i])!.add(parts[i]);
                }
              }

              // Compute all new composite values and keep those whose
              // old-field parts ALL match the old filter.
              const allNewValues = this.v.computeExpandValues(newExpandFields);
              const carried = allNewValues.filter((ck) => {
                const parts =
                  newExpandFields.length === 1 ? [ck] : ck.split(COMPOSITE_SEP);
                for (let i = 0; i < newExpandFields.length; i++) {
                  const field = newExpandFields[i];
                  const allowed = oldFieldValueSets.get(field);
                  if (allowed && !allowed.has(parts[i] ?? "")) return false;
                }
                return true;
              });

              this.v._expandFilterSelection =
                carried.length > 0 && carried.length < allNewValues.length
                  ? carried
                  : null; // all matched or none → show all
            } else {
              // Some old field was removed → filter is invalid
              this.v._expandFilterSelection = null;
            }
          } else {
            // No active filter → nothing to carry over
            this.v._expandFilterSelection = null;
          }

          // Re-expand with new config if currently expanded, or expand if now possible
          if (this.v._isExpanded) {
            this.v.collapse();
          }
          if (this.v.canExpand) {
            // Pre-check: warn if too many sub-channels would be created
            const fields = this.v.normalizeExpandFields();
            const allValues = this.v.computeExpandValues(fields);
            const effectiveValues = this.v._expandFilterSelection
              ? allValues.filter((v) =>
                  this.v._expandFilterSelection!.includes(v),
                )
              : allValues;
            const count = effectiveValues.length;
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
              if (!result.confirmed) {
                this.v.onDirtyCallback?.();
                return;
              }
              if (result.checked) ChannelView._skipExpandConfirm = true;
            }
            this.v.expand();
          }
          this.v.onDirtyCallback?.();
        });
        break;
      }

      case "filter": {
        const expandFields = this.v.normalizeExpandFields();
        // Always show ALL values — Splitter operates on the full dataset.
        // Filter is the sole mechanism controlling which sub-channels display.
        const allValues = this.v.computeExpandValues(expandFields);
        if (allValues.length === 0) {
          logger.warn("[ChannelMenu] No expand values to filter");
          break;
        }
        const currentSelection = this.v._expandFilterSelection ?? allValues;

        // Build color map matching SubChannelGroupView's sample-label colors.
        const COMPOSITE_SEP = "\x00";
        const PALETTE = [
          [
            "#4e79a7",
            "#f28e2b",
            "#e15759",
            "#76b7b2",
            "#59a14f",
            "#edc948",
            "#b07aa1",
            "#ff9da7",
            "#9c755f",
            "#bab0ac",
          ],
          [
            "#1b9e77",
            "#d95f02",
            "#7570b3",
            "#e7298a",
            "#66a61e",
            "#e6ab02",
            "#a6761d",
            "#666666",
            "#1f78b4",
            "#b2df8a",
          ],
          [
            "#8dd3c7",
            "#ffffb3",
            "#bebada",
            "#fb8072",
            "#80b1d3",
            "#fdb462",
            "#b3de69",
            "#fccde5",
            "#d9d9d9",
            "#bc80bd",
          ],
        ];
        // Build per-field unique value sets (same order as expand())
        const fieldValueSets = new Map<string, string[]>();
        for (const f of expandFields) fieldValueSets.set(f, []);
        for (const ck of allValues) {
          const parts =
            expandFields.length === 1 ? [ck] : ck.split(COMPOSITE_SEP);
          for (let fi = 0; fi < expandFields.length; fi++) {
            const arr = fieldValueSets.get(expandFields[fi])!;
            if (parts[fi] && !arr.includes(parts[fi])) arr.push(parts[fi]);
          }
        }
        // Build per-field color maps
        const fieldColorMaps = new Map<string, Map<string, string>>();
        expandFields.forEach((f, fi) => {
          const vals = fieldValueSets.get(f) ?? [];
          const pal = PALETTE[Math.min(fi, PALETTE.length - 1)];
          const cm = new Map<string, string>();
          vals.forEach((v, i) => cm.set(v, pal[i % pal.length]));
          fieldColorMaps.set(f, cm);
        });
        // Map composite value → first expand field's color (primary swatch)
        const colorMap = new Map<string, string>();
        // Map composite value → human-readable display name
        const displayMap = new Map<string, string>();
        for (const ck of allValues) {
          const parts =
            expandFields.length === 1 ? [ck] : ck.split(COMPOSITE_SEP);
          const firstField = expandFields[0];
          const c = fieldColorMaps.get(firstField)?.get(parts[0]) ?? "#999";
          colorMap.set(ck, c);
          if (expandFields.length > 1) {
            displayMap.set(ck, parts.join(" · "));
          }
        }

        // Build per-field dropdown definitions for the Filter dialog
        const fieldDropdowns = expandFields.map((f) => ({
          field: f,
          values: fieldValueSets.get(f) ?? [],
          colorMap: fieldColorMaps.get(f),
        }));

        ModalDialog.filter("Filter", {
          values: allValues,
          selected: currentSelection,
          subtitle: `Select which sub-channels to display (${allValues.length} total).`,
          colorMap,
          displayMap: expandFields.length > 1 ? displayMap : undefined,
          fieldDropdowns,
          compositeSep: COMPOSITE_SEP,
        }).then((selected) => {
          if (!selected) return;
          // If all selected, clear filter (show all)
          this.v._expandFilterSelection =
            selected.length === allValues.length ? null : selected;
          // Re-expand with new filter
          if (this.v._isExpanded) {
            this.v.collapse();
          }
          if (this.v.canExpand) {
            this.v.expand();
          }
          this.v.onDirtyCallback?.();
        });
        break;
      }

      case "moveUp":
        this.v.onMenuAction?.(this.v, "moveUp");
        break;

      case "moveDown":
        this.v.onMenuAction?.(this.v, "moveDown");
        break;

      case "togglePin":
        this.v.onMenuAction?.(this.v, "togglePin");
        break;

      case "toggleShowName": {
        this.v._showName = !this.v._showName;
        const style = this.v.ensureMutableStyle();
        style.showName = this.v._showName;
        if (!this.v._showName && this.v._rectNameOverlay) {
          this.v._rectNameOverlay.innerHTML = "";
          this.v._rectNameOverlay.style.display = "none";
        }
        this.v.onDirtyCallback?.();
        break;
      }

      case "toggleComplement":
        this.v.toggleComplementStrand();
        break;

      case "downloadBED":
      case "downloadCSV":
      case "downloadXLSX":
      case "downloadJSON":
      case "downloadXML":
      case "downloadPNG":
      case "downloadSVG":
      case "downloadPDF":
        this.v.onMenuAction?.(this.v, action);
        break;

      case "deleteTrack":
        this.v.onMenuAction?.(this.v, "deleteTrack");
        break;

      case "setChannelHeight": {
        const currentH = String(this.v.config.style?.height ?? 80);
        ModalDialog.prompt("Set channel height", currentH, {
          subtitle: "Enter height in pixels (e.g. 80, 160).",
          placeholder: "pixels",
        }).then((input) => {
          if (input === null) return;
          const h = parseInt(input, 10);
          if (!isFinite(h) || h < 10) return;
          this.v.ensureMutableStyle();
          this.v.config.style!.height = h;
          this.v.onMenuAction?.(this.v, "relayout");
        });
        break;
      }

      case "setSubChannelContainerHeight": {
        const currentMaxHeight = String(this.v.config.style?.maxHeight ?? 5);
        ModalDialog.prompt(
          "Set subChannel container height",
          currentMaxHeight,
          {
            subtitle: "Enter maximum visible sub-channels number.",
            placeholder: "number of channels",
          },
        ).then((input) => {
          if (input === null) return;
          const maxH = parseInt(input, 10);
          if (!isFinite(maxH) || maxH < 1) return;
          this.v.ensureMutableStyle();
          this.v.config.style!.maxHeight = maxH;
          // Re-expand to apply new container height
          if (this.v._isExpanded) {
            this.v.collapse();
            this.v.expand();
          }
          this.v.onMenuAction?.(this.v, "relayout");
        });
        break;
      }

      // ── Split stacked channels back to individual ───────────────────
      case "splitStackedChannels": {
        // Save refs before relayout clears them
        const splitMembers = [...this.v._stackedChannels];
        // Set stacked = false and alpha = 1 on all channels in the group
        if (this.v.config.group) {
          this.v.config.group.stacked = false;
          this.v.config.group.alpha = 1;
        }
        for (const sch of splitMembers) {
          const cfg = sch.getChannelConfig();
          if (cfg.group) {
            cfg.group.stacked = false;
            cfg.group.alpha = 1;
          }
        }
        // Trigger relayout which will call syncStackedGroups → clear stacking
        this.v.onMenuAction?.(this.v, "relayout");
        // Recreate labels for all affected channels (after relayout)
        requestAnimationFrame(() => {
          this.v.createChannelLabel();
          for (const sch of splitMembers) {
            sch.createChannelLabel();
          }
        });
        break;
      }

      // ── Stack grouped channels together ────────────────────────────
      case "stackGroupChannels": {
        // Set stacked = true on this channel → syncStackedGroups (in
        // relayout) will set stacked=true on ALL group members and
        // assign host + hidden, then recreate the host label.
        if (this.v.config.group) {
          this.v.config.group.stacked = true;
          this.v.config.group.alpha = 0.8;
        }
        // Trigger relayout → syncStackedGroups + layout + syncGroupScoreRanges
        this.v.onMenuAction?.(this.v, "relayout");
        break;
      }

      case "setGroupNumber": {
        const curNum = this.v.config.group?.number;
        const curStr = curNum !== undefined ? String(curNum) : "";
        const hasGroup = curNum !== undefined;
        ModalDialog.prompt("Set group number", curStr, {
          subtitle:
            "Channels with the same group number share a common value scale.",
          placeholder: "e.g. 1, 2, 3 …",
          removeLabel: hasGroup ? "Remove Group" : undefined,
        }).then((input) => {
          if (input === null) return; // cancelled

          if (input === "") {
            // "Remove Group" button was clicked — clear the group
            if (this.v.config.group) {
              delete this.v.config.group.number;
            }
            this.v._groupScoreRange = null;
            this.v.createChannelLabel();
            this.v.onMenuAction?.(this.v, "relayout");
            return;
          }

          if (!this.v.config.group)
            this.v.config.group = { name: this.v.config.name };
          const n = parseInt(input.trim(), 10);
          if (!isFinite(n)) return;
          this.v.config.group.number = n;
          // Recreate channel label to show/update badge
          this.v.createChannelLabel();
          this.v.onMenuAction?.(this.v, "relayout");
        });
        break;
      }

      default:
        // Handle "setPlotType:<type>" actions
        if (action.startsWith("setPlotType:")) {
          const newPlot = action.slice("setPlotType:".length) as any;

          /** Apply the plot-type change and trigger data reload. When
           *  switching TO diamond, the texture must load first — otherwise the
           *  renderer skips the draw call — plus diamond style defaults and
           *  pipe-separated field detection are applied. */
          const applyPlotType = () => {
            this.v.config.plot = newPlot;

            // ── Diamond defaults: apply diamond config from defaultConfig ──
            if (newPlot === "diamond") {
              const style = this.v.ensureMutableStyle();
              const dd = defaultConfig.channels.diamond.style;
              if (style.size === undefined) style.size = dd.size;
              if (style.maxHeight === undefined) style.maxHeight = dd.maxHeight;
              if (style.sep === undefined) style.sep = dd.sep;
              if (style.padding === undefined) style.padding = dd.padding;

              // Reset auto-detection flag so that the next data arrival
              // will re-probe for pipe-separated keys in name/rest.
              this.v._ucscStyleInferred = undefined;
              if (this.v.data && this.v.data.length > 0) {
                this.v.tryAutoDetectStyle();
                this.v.tryAutoExpand();
              }
            }

            if (
              newPlot === "diamond" &&
              this.v.featureRenderer &&
              !this.v.featureRenderer.textures.isDiamondReady
            ) {
              this.v.featureRenderer.textures
                .loadDiamond(DIAMOND_TEXTURE_URL)
                .then(() => {
                  this.v.onMenuAction?.(this.v, "setPlotType", newPlot);
                })
                .catch((err) =>
                  logger.error(
                    `[ChannelView] ${this.v.config.name} diamond texture load error:`,
                    err,
                  ),
                );
            } else {
              this.v.onMenuAction?.(this.v, "setPlotType", newPlot);
            }
          };

          if (newPlot === "diamond") {
            ModalDialog.prompt("Switch to Diamond?", "", {
              subtitle:
                "⚠ Diamond plot is designed for single-site data only. " +
                "Using it with interval data may produce unexpected results. " +
                'Type "ok" to confirm.',
              placeholder: "ok",
            }).then((confirm) => {
              if (confirm?.toLowerCase().trim() !== "ok") return;
              applyPlotType();
            });
          } else {
            applyPlotType();
          }
          return;
        }

        // Handle "setCoveragePlotType:<type>" actions (BAM coverage)
        if (action.startsWith("setCoveragePlotType:")) {
          const newCovPlot = action.slice("setCoveragePlotType:".length) as
            "bar" | "line" | "heatmap" | "point";
          const style = this.v.ensureMutableStyle();
          if (!style.coverage || typeof style.coverage === "boolean") {
            style.coverage = { enabled: true, plot: newCovPlot };
          } else {
            style.coverage.plot = newCovPlot;
          }
          this.v.onDirtyCallback?.();
          return;
        }

        logger.warn(`[ChannelMenu] Unknown action: ${action}`);
    }
  }
}
