import MuiIconButton from "@mui/material/IconButton";
import { ActionTooltip } from "../ui/ActionTooltip";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { headerIconBtnSx } from "../ui";

export interface ResetButtonProps {
  onReset: () => void;
}

export function ResetButton({ onReset }: ResetButtonProps) {
  return (
    <ActionTooltip title="Reset to initial view" arrow>
      <MuiIconButton sx={headerIconBtnSx} onClick={onReset}>
        <RestartAltIcon sx={{ fontSize: 20 }} />
      </MuiIconButton>
    </ActionTooltip>
  );
}
