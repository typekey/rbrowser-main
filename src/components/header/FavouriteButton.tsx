import MuiIconButton from "@mui/material/IconButton";
import { ActionTooltip } from "../ui/ActionTooltip";
import StarOutlineIcon from "@mui/icons-material/StarOutline";
import StarIcon from "@mui/icons-material/Star";
import { headerIconBtnSx } from "../ui";

export interface FavouriteButtonProps {
  /** Whether the current region is saved as a favourite. */
  isFav: boolean;
  /** Toggle the current region's favourite state. */
  onToggle: () => void;
}

/** Header toolbar star button for adding / removing the current region from favourites. */
export function FavouriteButton({ isFav, onToggle }: FavouriteButtonProps) {
  return (
    <ActionTooltip
      title={isFav ? "Remove from favourites" : "Add to favourites"}
      arrow
    >
      <MuiIconButton
        sx={{ ...headerIconBtnSx, color: isFav ? "#f39c12" : "#999" }}
        onClick={onToggle}
      >
        {isFav ? (
          <StarIcon sx={{ fontSize: 20 }} />
        ) : (
          <StarOutlineIcon sx={{ fontSize: 20 }} />
        )}
      </MuiIconButton>
    </ActionTooltip>
  );
}
