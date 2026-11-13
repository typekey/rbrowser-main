import MuiIconButton from "@mui/material/IconButton";
import { ActionTooltip } from "../ui/ActionTooltip";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import LabelOffOutlinedIcon from "@mui/icons-material/LabelOffOutlined";
import { headerIconBtnSx, headerIconBtnActiveSx } from "../ui";

export interface ChannelLabelsButtonProps {
  /** Whether channel labels are currently shown. */
  showLabels: boolean;
  /** Toggle channel-label visibility. */
  onToggle: () => void;
}

/** Header toolbar toggle for showing / hiding channel labels. */
export function ChannelLabelsButton({
  showLabels,
  onToggle,
}: ChannelLabelsButtonProps) {
  return (
    <ActionTooltip title="Label" arrow>
      <MuiIconButton
        sx={showLabels ? headerIconBtnActiveSx : headerIconBtnSx}
        onClick={onToggle}
      >
        {showLabels ? (
          <LabelOutlinedIcon sx={{ fontSize: 20 }} />
        ) : (
          <LabelOffOutlinedIcon sx={{ fontSize: 20 }} />
        )}
      </MuiIconButton>
    </ActionTooltip>
  );
}
