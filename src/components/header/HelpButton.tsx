import MuiIconButton from "@mui/material/IconButton";
import { ActionTooltip } from "../ui/ActionTooltip";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import { headerIconBtnSx } from "../ui";

export interface HelpButtonProps {
  /** Toggle the help modal. */
  onClick: () => void;
}

/** Header toolbar button that opens the keyboard-shortcut / help modal. */
export function HelpButton({ onClick }: HelpButtonProps) {
  return (
    <ActionTooltip title="Help" arrow>
      <MuiIconButton sx={headerIconBtnSx} onClick={onClick}>
        <HelpOutlineOutlinedIcon sx={{ fontSize: 20 }} />
      </MuiIconButton>
    </ActionTooltip>
  );
}
