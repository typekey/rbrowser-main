import ExploreOutlinedIcon from "@mui/icons-material/ExploreOutlined";
import ExploreOffOutlinedIcon from "@mui/icons-material/ExploreOffOutlined";
import type { CursorMode } from "@/renderer/transcript-renderer/cursor";
import { Popover, MenuItem, MenuDivider } from "../ui";

export interface CursorButtonProps {
  /** Whether the cursor overlay is enabled. */
  cursorEnabled: boolean;
  /** Active cursor display style. */
  cursorMode: CursorMode;
  /** Set cursor visibility. */
  onSetEnabled: (enabled: boolean) => void;
  /** Set the cursor display style. */
  onSetMode: (mode: CursorMode) => void;
}

const CURSOR_MODES: CursorMode[] = ["compact", "detailed", "each"];

/** Header toolbar popover controlling the cursor overlay visibility and style. */
export function CursorButton({
  cursorEnabled,
  cursorMode,
  onSetEnabled,
  onSetMode,
}: CursorButtonProps) {
  return (
    <Popover
      label={
        cursorEnabled ? (
          <ExploreOutlinedIcon sx={{ fontSize: 20 }} />
        ) : (
          <ExploreOffOutlinedIcon sx={{ fontSize: 20 }} />
        )
      }
      title="Cursor"
      buttonSx={cursorEnabled ? { color: "#3867d6" } : undefined}
    >
      <div
        style={{
          padding: "4px 10px 2px",
          fontSize: 10,
          color: "#888",
          fontWeight: 600,
        }}
      >
        VISIBILITY
      </div>
      <MenuItem active={cursorEnabled} onClick={() => onSetEnabled(true)}>
        Show
      </MenuItem>
      <MenuItem active={!cursorEnabled} onClick={() => onSetEnabled(false)}>
        Hidden
      </MenuItem>
      <MenuDivider />
      <div
        style={{
          padding: "4px 10px 2px",
          fontSize: 10,
          color: "#888",
          fontWeight: 600,
        }}
      >
        STYLE
      </div>
      {CURSOR_MODES.map((m) => (
        <MenuItem
          key={m}
          active={cursorMode === m}
          onClick={() => onSetMode(m)}
        >
          {m.charAt(0).toUpperCase() + m.slice(1)}
        </MenuItem>
      ))}
    </Popover>
  );
}
