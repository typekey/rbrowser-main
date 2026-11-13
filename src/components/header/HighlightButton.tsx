import FlashlightOnOutlinedIcon from "@mui/icons-material/FlashlightOnOutlined";
import FlashlightOffOutlinedIcon from "@mui/icons-material/FlashlightOffOutlined";
import { Popover, MenuItem, MenuDivider } from "../ui";

export interface HighlightButtonProps {
  /** Whether highlights are visible. */
  highlightVisible: boolean;
  /** Whether the distance overlay is shown. */
  highlightShowDistance: boolean;
  /** Set highlight visibility. */
  onSetVisible: (visible: boolean) => void;
  /** Toggle the distance overlay. */
  onToggleDistance: () => void;
  /** Remove all highlights. */
  onClearAll: () => void;
}

/** Header toolbar popover controlling highlight visibility and distance overlay. */
export function HighlightButton({
  highlightVisible,
  highlightShowDistance,
  onSetVisible,
  onToggleDistance,
  onClearAll,
}: HighlightButtonProps) {
  return (
    <Popover
      label={
        highlightVisible ? (
          <FlashlightOnOutlinedIcon sx={{ fontSize: 20 }} />
        ) : (
          <FlashlightOffOutlinedIcon sx={{ fontSize: 20 }} />
        )
      }
      title="Highlight"
      buttonSx={highlightVisible ? { color: "#3867d6" } : undefined}
    >
      <MenuItem active={highlightVisible} onClick={() => onSetVisible(true)}>
        Show
      </MenuItem>
      <MenuItem active={!highlightVisible} onClick={() => onSetVisible(false)}>
        Hidden
      </MenuItem>
      <MenuDivider />
      <MenuItem active={highlightShowDistance} onClick={onToggleDistance}>
        {highlightShowDistance ? "✓" : "○"} Show Distance
      </MenuItem>
      <MenuDivider />
      <MenuItem onClick={onClearAll}>
        <span style={{ color: "#e55039" }}>Clear all</span>
      </MenuItem>
    </Popover>
  );
}
