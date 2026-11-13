/*
 * @Author: Zheng Lei
 * @Email: baimoc@163.com
 * @Date: 2026-06-04 12:58:07
 * @LastEditTime: 2026-07-09 14:34:59
 * @FilePath: \baimoc-browser\rbrowser\src\components\header\ZoomButtonsGroup.tsx
 */
import Box from "@mui/material/Box";
import MuiIconButton from "@mui/material/IconButton";
import { ActionTooltip } from "../ui/ActionTooltip";
import { headerIconBtnSx } from "../ui";

export interface ZoomButtonsGroupProps {
  onZoom: (factor: number) => void;
}

const ZOOM_STEPS: { factor: number; label: string; title: string }[] = [
  { factor: 1 / 5, label: "-5", title: "Zoom out ×5" },
  { factor: 1 / 3, label: "-3", title: "Zoom out ×3" },
  { factor: 1 / 1.5, label: "-1.5", title: "Zoom out ×1.5" },
  { factor: 1.5, label: "+1.5", title: "Zoom in ×1.5" },
  { factor: 3, label: "+3", title: "Zoom in ×3" },
  { factor: 5, label: "+5", title: "Zoom in ×5" },
];

export function ZoomButtonsGroup({ onZoom }: ZoomButtonsGroupProps) {
  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 0.25,
      }}
    >
      {ZOOM_STEPS.map((z) => (
        <ActionTooltip key={z.label} title={z.title} arrow>
          <MuiIconButton
            size="small"
            sx={{
              ...headerIconBtnSx,
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 1,
              px: 0.75,
            }}
            onClick={() => onZoom(z.factor)}
          >
            {z.label}
          </MuiIconButton>
        </ActionTooltip>
      ))}
    </Box>
  );
}
