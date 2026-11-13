import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import { Popover, MenuItem, MenuDivider, SectionLabel } from "../ui";

export type DownloadFormat = "PNG" | "SVG" | "PDF";

/**
 * Export theme:
 * - `print`   — the on-screen browser view (WebGL raster + overlays), as-is.
 * - `publish` — a clean, publication-style vector figure (filled-area tracks,
 *   left labels, group brackets, gene model, gene name).
 */
export type DownloadTheme = "print" | "publish";

export interface DownloadButtonProps {
  /** Export the current browser view in the requested theme + format. */
  onExport: (theme: DownloadTheme, format: DownloadFormat) => void;
}

const FORMATS: DownloadFormat[] = ["PNG", "SVG", "PDF"];

const captionWrap = { padding: "2px 14px 0" };

/**
 * Header toolbar popover offering PNG / SVG / PDF export in two themes:
 * Print (current view) and Publish (publication-style figure). The two levels
 * (theme → format) are shown as grouped sections in a single panel.
 */
export function DownloadButton({ onExport }: DownloadButtonProps) {
  return (
    <Popover
      label={<FileDownloadOutlinedIcon sx={{ fontSize: 20 }} />}
      title="Download"
    >
      <div style={captionWrap}>
        <SectionLabel>Print theme</SectionLabel>
      </div>
      {FORMATS.map((f) => (
        <MenuItem key={`print-${f}`} onClick={() => onExport("print", f)}>
          {`Download as ${f}`}
        </MenuItem>
      ))}

      <MenuDivider />

      <div style={captionWrap}>
        <SectionLabel>Publish theme</SectionLabel>
      </div>
      {FORMATS.map((f) => (
        <MenuItem key={`publish-${f}`} onClick={() => onExport("publish", f)}>
          {`Download as ${f}`}
        </MenuItem>
      ))}
    </Popover>
  );
}
