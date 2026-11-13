import MuiTooltip, {
  type TooltipProps,
  tooltipClasses,
} from "@mui/material/Tooltip";
import { styled } from "@mui/material/styles";
import { ACTION_TOOLTIP_STYLE } from "../../renderer/transcript-renderer/tooltip/action-tooltip-style";

/** The shared dark, translucent, 11px tooltip used across the browser header. */
export const ActionTooltip = styled(
  ({ className, classes, ...props }: TooltipProps & { className?: string }) => (
    <MuiTooltip
      arrow
      disableInteractive
      slotProps={{
        popper: {
          modifiers: [{ name: "preventOverflow", options: { padding: 8 } }],
        },
      }}
      {...props}
      classes={{
        ...classes,
        popper: [classes?.popper, className].filter(Boolean).join(" "),
        tooltip: [classes?.tooltip, "rbrowser-action-tooltip"]
          .filter(Boolean)
          .join(" "),
      }}
    />
  ),
)(() => ({
  [`& .${tooltipClasses.tooltip}`]: ACTION_TOOLTIP_STYLE,
  [`& .${tooltipClasses.arrow}`]: {
    color: ACTION_TOOLTIP_STYLE.backgroundColor,
  },
}));
