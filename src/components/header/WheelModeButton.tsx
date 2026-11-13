import MuiIconButton from "@mui/material/IconButton";
import MouseOutlinedIcon from "@mui/icons-material/MouseOutlined";
import SwapVertOutlinedIcon from "@mui/icons-material/SwapVertOutlined";
import { ActionTooltip } from "../ui/ActionTooltip";
import { headerIconBtnSx } from "../ui/styles";
import {
  wheelModeDescription,
  type WheelMode,
} from "../../renderer/transcript-renderer/events/wheel-mode";

export function WheelModeButton({
  mode,
  onChange,
}: {
  mode: WheelMode;
  onChange: (mode: WheelMode) => void;
}) {
  const label = wheelModeDescription(mode);
  return (
    <ActionTooltip
      title={
        <div>
          {label.split(" · ").map((line) => (
            <div key={line} style={{ whiteSpace: "nowrap" }}>
              {line}
            </div>
          ))}
        </div>
      }
    >
      <MuiIconButton
        aria-label={label}
        aria-pressed={mode === "scroll"}
        data-wheel-mode={mode}
        sx={{
          ...headerIconBtnSx,
          color: "#3867d6",
          backgroundColor: mode === "scroll" ? "#eef2ff" : undefined,
        }}
        onClick={() => onChange(mode === "zoom" ? "scroll" : "zoom")}
      >
        {mode === "zoom" ? (
          <MouseOutlinedIcon sx={{ fontSize: 20 }} />
        ) : (
          <SwapVertOutlinedIcon sx={{ fontSize: 20 }} />
        )}
      </MuiIconButton>
    </ActionTooltip>
  );
}
