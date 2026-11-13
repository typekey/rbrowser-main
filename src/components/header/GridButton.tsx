import GridOnOutlinedIcon from "@mui/icons-material/GridOnOutlined";
import GridOffOutlinedIcon from "@mui/icons-material/GridOffOutlined";
import { Popover, MenuItem, MenuDivider } from "../ui";

export interface GridButtonProps {
  /** Whether any grid line is currently displayed (drives the icon / accent). */
  gridActive: boolean;
  /** Horizontal (x) grid lines enabled. */
  gridX: boolean;
  /** Vertical (y) grid lines enabled. */
  gridY: boolean;
  /** Toggle horizontal grid lines. */
  onToggleX: () => void;
  /** Toggle vertical grid lines. */
  onToggleY: () => void;
  /** Show all grid lines. */
  onShowAll: () => void;
  /** Hide all grid lines. */
  onHideAll: () => void;
}

/** Header toolbar popover controlling grid-line visibility. */
export function GridButton({
  gridActive,
  gridX,
  gridY,
  onToggleX,
  onToggleY,
  onShowAll,
  onHideAll,
}: GridButtonProps) {
  return (
    <Popover
      label={
        gridActive ? (
          <GridOnOutlinedIcon sx={{ fontSize: 20 }} />
        ) : (
          <GridOffOutlinedIcon sx={{ fontSize: 20 }} />
        )
      }
      title="Grid"
      buttonSx={gridActive ? { color: "#3867d6" } : undefined}
    >
      <div
        style={{
          padding: "4px 10px 2px",
          fontSize: 10,
          color: "#888",
          fontWeight: 600,
        }}
      >
        GRID LINES
      </div>
      <MenuItem active={gridX} onClick={onToggleX}>
        {gridX ? "✓" : "○"} Horizontal lines
      </MenuItem>
      <MenuItem active={gridY} onClick={onToggleY}>
        {gridY ? "✓" : "○"} Vertical lines
      </MenuItem>
      <MenuDivider />
      <MenuItem onClick={onShowAll}>Show all</MenuItem>
      <MenuItem onClick={onHideAll}>Hide all</MenuItem>
    </Popover>
  );
}
