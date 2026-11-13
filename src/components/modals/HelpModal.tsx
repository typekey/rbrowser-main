import type { WheelMode } from "../../renderer/transcript-renderer/events/wheel-mode";
import SwapVertOutlinedIcon from "@mui/icons-material/SwapVertOutlined";
import type { ReactNode } from "react";
import MouseOutlinedIcon from "@mui/icons-material/MouseOutlined";
import SwipeOutlinedIcon from "@mui/icons-material/SwipeOutlined";
import HighlightAltOutlinedIcon from "@mui/icons-material/HighlightAltOutlined";
import FlashlightOnOutlinedIcon from "@mui/icons-material/FlashlightOnOutlined";
import KeyboardReturnOutlinedIcon from "@mui/icons-material/KeyboardReturnOutlined";
import KeyboardDoubleArrowLeftRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowLeftRounded";
import KeyboardArrowLeftRoundedIcon from "@mui/icons-material/KeyboardArrowLeftRounded";
import KeyboardArrowRightRoundedIcon from "@mui/icons-material/KeyboardArrowRightRounded";
import KeyboardDoubleArrowRightRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowRightRounded";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import StarOutlineIcon from "@mui/icons-material/StarOutline";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import GradientOutlinedIcon from "@mui/icons-material/GradientOutlined";
import GridOnOutlinedIcon from "@mui/icons-material/GridOnOutlined";
import SpeakerNotesOutlinedIcon from "@mui/icons-material/SpeakerNotesOutlined";
import ExploreOutlinedIcon from "@mui/icons-material/ExploreOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import { renderKbd } from "../help/renderKbd";
import { btnBase } from "../ui/styles";

type Row = [ReactNode, string, string, string];

const SECTION_HEADER_STYLE = (paddingTop: number): React.CSSProperties => ({
  fontSize: 10,
  fontWeight: 700,
  color: "#999",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  paddingBottom: 4,
  paddingTop,
});

function ShortcutRows({ rows, keyPrefix }: { rows: Row[]; keyPrefix: string }) {
  return (
    <>
      {rows.map(([icon, label, shortcut, desc], i) => (
        <tr key={`${keyPrefix}${i}`}>
          <td
            style={{
              padding: "3px 0",
              color: "#3867d6",
              verticalAlign: "middle",
            }}
          >
            {icon}
          </td>
          <td
            style={{
              padding: "3px 4px",
              fontWeight: 600,
              color: "#333",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </td>
          <td style={{ padding: "3px 4px" }}>{renderKbd(shortcut)}</td>
          <td style={{ padding: "3px 4px", color: "#666" }}>{desc}</td>
        </tr>
      ))}
    </>
  );
}

export function HelpModal({
  open,
  onClose,
  wheelMode = "zoom",
}: {
  open: boolean;
  onClose: () => void;
  wheelMode?: WheelMode;
}) {
  if (!open) return null;

  const mouseRows: Row[] = [
    [
      <MouseOutlinedIcon sx={{ fontSize: 16 }} />,
      "Mouse Drag",
      "",
      "Pan the genome view",
    ],
    [
      <SwipeOutlinedIcon sx={{ fontSize: 16 }} />,
      "Mouse Scroll",
      "",
      wheelMode === "zoom"
        ? "Zoom in / out"
        : "Scroll the (non-pinned) channel list",
    ],
    [
      <SwipeOutlinedIcon sx={{ fontSize: 16 }} />,
      "Mouse Scroll",
      "Ctrl + Scroll",
      wheelMode === "zoom"
        ? "Scroll the (non-pinned) channel list"
        : "Zoom in / out",
    ],
    [
      <SwipeOutlinedIcon sx={{ fontSize: 16 }} />,
      "Mouse Scroll",
      "Alt + Scroll",
      "Scroll the SubChannel list",
    ],
    [
      <HighlightAltOutlinedIcon sx={{ fontSize: 16 }} />,
      "Mouse Right-drag axis",
      "",
      "Select a region to zoom",
    ],
    [
      <FlashlightOnOutlinedIcon sx={{ fontSize: 16 }} />,
      "Mouse Right-drag track",
      "",
      "Add a highlight region",
    ],
    [
      <LabelOutlinedIcon sx={{ fontSize: 16 }} />,
      "Click channel label",
      "Ctrl + Click",
      "Select / deselect channels",
    ],
    [
      <LabelOutlinedIcon sx={{ fontSize: 16 }} />,
      "Click channel label",
      "Shift + Click",
      "Select a range of channels",
    ],
    [
      <MouseOutlinedIcon sx={{ fontSize: 16 }} />,
      "Right-click selected label",
      "",
      "Open the multi-channel menu",
    ],
  ];

  const navRows: Row[] = [
    [
      <KeyboardReturnOutlinedIcon sx={{ fontSize: 16 }} />,
      "Enter",
      "",
      "Navigate to region",
    ],
    [
      <KeyboardDoubleArrowLeftRoundedIcon sx={{ fontSize: 16 }} />,
      "Pan ← 100%",
      "Alt+Shift+←",
      "Move one full screen left",
    ],
    [
      <KeyboardArrowLeftRoundedIcon sx={{ fontSize: 16 }} />,
      "Pan ← 50%",
      "←",
      "Move half screen left",
    ],
    [
      <KeyboardArrowRightRoundedIcon sx={{ fontSize: 16 }} />,
      "Pan → 50%",
      "→",
      "Move half screen right",
    ],
    [
      <KeyboardDoubleArrowRightRoundedIcon sx={{ fontSize: 16 }} />,
      "Pan → 100%",
      "Alt+Shift+→",
      "Move one full screen right",
    ],
    [<ZoomInIcon sx={{ fontSize: 16 }} />, "Zoom in", "Alt+]", "Zoom in ×2"],
    [<ZoomOutIcon sx={{ fontSize: 16 }} />, "Zoom out", "Alt+[", "Zoom out ×2"],
  ];

  const toolbarRows: Row[] = [
    [
      <StarOutlineIcon sx={{ fontSize: 16 }} />,
      "Favourite",
      "Alt+F",
      "Toggle favourite region",
    ],
    [
      <HistoryOutlinedIcon sx={{ fontSize: 16 }} />,
      "History",
      "",
      "Recent navigations",
    ],
    [
      <FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />,
      "Download",
      "",
      "Export as PNG / SVG / PDF",
    ],
  ];

  const displayRows: Row[] = [
    [
      <LabelOutlinedIcon sx={{ fontSize: 16 }} />,
      "Labels",
      "Alt+L",
      "Show / hide channel labels",
    ],
    [
      <GradientOutlinedIcon sx={{ fontSize: 16 }} />,
      "Legend",
      "Alt+G",
      "Show / hide legend",
    ],
    [
      <GridOnOutlinedIcon sx={{ fontSize: 16 }} />,
      "Grid",
      "Alt+D",
      "Show / hide grid lines",
    ],
    [
      <SpeakerNotesOutlinedIcon sx={{ fontSize: 16 }} />,
      "Tooltip",
      "Alt+T",
      "Show / hide tooltip",
    ],
    [
      <FlashlightOnOutlinedIcon sx={{ fontSize: 16 }} />,
      "Highlight",
      "Alt+I",
      "Show / hide highlight",
    ],
    [
      <ExploreOutlinedIcon sx={{ fontSize: 16 }} />,
      "Cursor",
      "Alt+K",
      "Show / hide cursor",
    ],
    [
      <SwapVertOutlinedIcon sx={{ fontSize: 16 }} />,
      "Wheel mode",
      "",
      "Swap wheel zoom and channel scrolling",
    ],
    [
      <HelpOutlineOutlinedIcon sx={{ fontSize: 16 }} />,
      "Help",
      "Alt+H",
      "Open this dialog",
    ],
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
          maxHeight: "calc(100vh - 32px)",
          overflow: "hidden",
          borderRadius: 10,
          padding: "28px 32px",
          maxWidth: 684,
          width: "90vw",
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
          fontSize: 12,
          lineHeight: 1.6,
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Help & Shortcuts"
      >
        <h3
          style={{
            margin: "0 0 16px",
            flexShrink: 0,
            fontSize: 16,
            fontWeight: 700,
            color: "#222",
          }}
        >
          Help & Shortcuts
        </h3>

        <div
          className="help-scroll-body"
          role="region"
          aria-label="Help shortcuts"
          tabIndex={0}
          style={{
            overflowY: "auto",
            minHeight: 0,
            overscrollBehavior: "contain",
            scrollbarGutter: "stable",
            paddingRight: 8,
          }}
        >
          {/* Single table with fixed column widths for cross-section alignment */}
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              tableLayout: "fixed",
            }}
          >
            <colgroup>
              <col style={{ width: 32 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 130 }} />
              <col />
            </colgroup>
            <tbody>
              <tr>
                <td colSpan={4} style={SECTION_HEADER_STYLE(2)}>
                  Mouse
                </td>
              </tr>
              <ShortcutRows rows={mouseRows} keyPrefix="m" />

              <tr>
                <td colSpan={4} style={SECTION_HEADER_STYLE(14)}>
                  Navigation
                </td>
              </tr>
              <ShortcutRows rows={navRows} keyPrefix="n" />

              <tr>
                <td colSpan={4} style={SECTION_HEADER_STYLE(14)}>
                  Toolbar Shortcuts
                </td>
              </tr>
              <ShortcutRows rows={toolbarRows} keyPrefix="t" />

              <tr>
                <td colSpan={4} style={SECTION_HEADER_STYLE(14)}>
                  Display Toggles
                </td>
              </tr>
              <ShortcutRows rows={displayRows} keyPrefix="d" />
            </tbody>
          </table>

          {/* ── Documentation link ───────────────────────────────── */}
          <div
            style={{
              marginTop: 16,
              textAlign: "center",
              fontSize: 11,
              color: "#888",
            }}
          >
            More at{" "}
            <a
              href="https://doc.rbrowser.org/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#3867d6",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              doc.rbrowser.org
            </a>
          </div>
        </div>
        <button
          style={{
            ...btnBase,
            flexShrink: 0,
            marginTop: 12,
            width: "100%",
            padding: "6px 8px",
            fontSize: 12,
          }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
