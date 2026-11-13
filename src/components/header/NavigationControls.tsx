import Box from "@mui/material/Box";
import MuiIconButton from "@mui/material/IconButton";
import { ActionTooltip } from "../ui/ActionTooltip";
import KeyboardArrowLeftRoundedIcon from "@mui/icons-material/KeyboardArrowLeftRounded";
import KeyboardDoubleArrowLeftRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowLeftRounded";
import KeyboardArrowRightRoundedIcon from "@mui/icons-material/KeyboardArrowRightRounded";
import KeyboardDoubleArrowRightRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowRightRounded";
import { headerIconBtnSx } from "../ui";
import { ModeToggle, type ViewMode } from "./ModeToggle";

export interface NavigationControlsProps {
  /** Current view mode (for the embedded mode toggle). */
  viewMode: ViewMode;
  /** Switch view mode. */
  onSwitchMode: (mode: ViewMode) => void;
  /** Pan the view by a fraction of the visible span (negative = left). */
  onPan: (frac: number) => void;
}

/**
 * Centre navigation cluster: pan buttons surrounding the DNA / RNA / CDS
 * mode toggle. Sits between the scenario spacer and the zoom group.
 */
export function NavigationControls({
  viewMode,
  onSwitchMode,
  onPan,
}: NavigationControlsProps) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <ActionTooltip title="Move 100% to left" arrow>
        <MuiIconButton sx={headerIconBtnSx} onClick={() => onPan(-1)}>
          <KeyboardDoubleArrowLeftRoundedIcon sx={{ fontSize: 20 }} />
        </MuiIconButton>
      </ActionTooltip>
      <ActionTooltip title="Move 50% to left" arrow>
        <MuiIconButton sx={headerIconBtnSx} onClick={() => onPan(-0.5)}>
          <KeyboardArrowLeftRoundedIcon sx={{ fontSize: 20 }} />
        </MuiIconButton>
      </ActionTooltip>

      <ModeToggle viewMode={viewMode} onSwitchMode={onSwitchMode} />

      <ActionTooltip title="Move 50% to right" arrow>
        <MuiIconButton sx={headerIconBtnSx} onClick={() => onPan(0.5)}>
          <KeyboardArrowRightRoundedIcon sx={{ fontSize: 20 }} />
        </MuiIconButton>
      </ActionTooltip>
      <ActionTooltip title="Move 100% to right" arrow>
        <MuiIconButton sx={headerIconBtnSx} onClick={() => onPan(1)}>
          <KeyboardDoubleArrowRightRoundedIcon sx={{ fontSize: 20 }} />
        </MuiIconButton>
      </ActionTooltip>
    </Box>
  );
}
