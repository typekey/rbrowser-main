import GradientOutlinedIcon from "@mui/icons-material/GradientOutlined";
import { Popover, MenuItem, MenuDivider } from "../ui";

export type LegendStyle = "auto" | "text" | "colorbar";

export interface ChannelLegendProps {
  /** Whether the channel legend is shown. */
  showLegend: boolean;
  /** Active legend display style. */
  legendStyle: LegendStyle;
  /** Toggle legend visibility. */
  onToggleLegend: () => void;
  /** Set the legend display style. */
  onSetStyle: (style: LegendStyle) => void;
}

const groupLabelStyle: React.CSSProperties = {
  padding: "4px 10px 2px",
  fontSize: 10,
  color: "#888",
  fontWeight: 600,
};

/** Header toolbar popover controlling the channel legend (score labels / colour bars). */
export function ChannelLegend({
  showLegend,
  legendStyle,
  onToggleLegend,
  onSetStyle,
}: ChannelLegendProps) {
  return (
    <Popover
      label={<GradientOutlinedIcon sx={{ fontSize: 20 }} />}
      title="Legend"
      buttonSx={showLegend ? { color: "#3867d6" } : undefined}
    >
      <div style={groupLabelStyle}>CHANNEL LEGEND</div>
      <MenuItem active={showLegend} onClick={onToggleLegend}>
        {showLegend ? "✓" : "○"} Show legend
      </MenuItem>
      <MenuDivider />
      <div style={groupLabelStyle}>DISPLAY STYLE</div>
      <MenuItem
        active={legendStyle === "auto"}
        onClick={() => onSetStyle("auto")}
      >
        {legendStyle === "auto" ? "●" : "○"} Auto
      </MenuItem>
      <MenuItem
        active={legendStyle === "text"}
        onClick={() => onSetStyle("text")}
      >
        {legendStyle === "text" ? "●" : "○"} Text only
      </MenuItem>
      <MenuItem
        active={legendStyle === "colorbar"}
        onClick={() => onSetStyle("colorbar")}
      >
        {legendStyle === "colorbar" ? "●" : "○"} Color bar
      </MenuItem>
    </Popover>
  );
}
