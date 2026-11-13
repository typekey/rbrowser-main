import SpeakerNotesOutlinedIcon from "@mui/icons-material/SpeakerNotesOutlined";
import SpeakerNotesOffOutlinedIcon from "@mui/icons-material/SpeakerNotesOffOutlined";
import type { TooltipMode } from "@/renderer/transcript-renderer/tooltip";
import { Popover, MenuItem, MenuDivider } from "../ui";

export type TooltipTriggerKind = "hover" | "click";

export interface TooltipButtonProps {
  /** Whether tooltips are enabled. */
  tooltipVisible: boolean;
  /** Trigger mode for tooltips. */
  tooltipTrigger: TooltipTriggerKind;
  /** Tooltip content density. */
  tooltipMode: TooltipMode;
  /** Set tooltip visibility. */
  onSetVisible: (visible: boolean) => void;
  /** Set tooltip trigger. */
  onSetTrigger: (trigger: TooltipTriggerKind) => void;
  /** Set tooltip content mode. */
  onSetMode: (mode: TooltipMode) => void;
}

const groupLabelStyle: React.CSSProperties = {
  padding: "4px 10px 2px",
  fontSize: 10,
  color: "#888",
  fontWeight: 600,
};

export function TooltipButton({
  tooltipVisible,
  tooltipTrigger,
  tooltipMode,
  onSetVisible,
  onSetTrigger,
  onSetMode,
}: TooltipButtonProps) {
  return (
    <Popover
      label={
        tooltipVisible ? (
          <SpeakerNotesOutlinedIcon sx={{ fontSize: 20 }} />
        ) : (
          <SpeakerNotesOffOutlinedIcon sx={{ fontSize: 20 }} />
        )
      }
      title="Tooltip"
      buttonSx={tooltipVisible ? { color: "#3867d6" } : undefined}
    >
      <div style={groupLabelStyle}>VISIBILITY</div>
      <MenuItem active={tooltipVisible} onClick={() => onSetVisible(true)}>
        {tooltipVisible ? "✓" : "○"} Show
      </MenuItem>
      <MenuItem active={!tooltipVisible} onClick={() => onSetVisible(false)}>
        {!tooltipVisible ? "✓" : "○"} Hidden
      </MenuItem>
      <MenuDivider />
      <div style={groupLabelStyle}>TRIGGER</div>
      <MenuItem
        active={tooltipTrigger === "hover"}
        onClick={() => onSetTrigger("hover")}
      >
        {tooltipTrigger === "hover" ? "✓" : "○"} Hover
      </MenuItem>
      <MenuItem
        active={tooltipTrigger === "click"}
        onClick={() => onSetTrigger("click")}
      >
        {tooltipTrigger === "click" ? "✓" : "○"} Click
      </MenuItem>
      <MenuDivider />
      <div style={groupLabelStyle}>CONTENT</div>
      <MenuItem
        active={tooltipMode === "compact"}
        onClick={() => onSetMode("compact")}
      >
        {tooltipMode === "compact" ? "✓" : "○"} Compact
      </MenuItem>
      <MenuItem
        active={tooltipMode === "detailed"}
        onClick={() => onSetMode("detailed")}
      >
        {tooltipMode === "detailed" ? "✓" : "○"} Detailed
      </MenuItem>
    </Popover>
  );
}
