import Box from "@mui/material/Box";
import { ScenarioButton } from "../header/ScenarioButton";
import { NavigationControls } from "../header/NavigationControls";
import { ZoomButtonsGroup } from "../header/ZoomButtonsGroup";
import type { ViewMode } from "../header/ModeToggle";

export interface HeaderRow2Props {
  /** Whether the scenario button is enabled. */
  scenarioEnabled: boolean;
  /** Open the scenario panel. */
  onScenario: () => void;
  /** Current view mode. */
  viewMode: ViewMode;
  /** Switch view mode. */
  onSwitchMode: (mode: ViewMode) => void;
  /** Pan by a fraction of the visible span. */
  onPan: (frac: number) => void;
  /** Apply a zoom factor. */
  onZoom: (factor: number) => void;
}

/**
 * Second header row: scenario button (left), pan + mode navigation cluster
 * (centre), and the zoom button group (right).
 */
export function HeaderRow2({
  scenarioEnabled,
  onScenario,
  viewMode,
  onSwitchMode,
  onPan,
  onZoom,
}: HeaderRow2Props) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        height: 38,
        px: 1,
        boxSizing: "border-box",
        borderTop: "1px solid #e8e8e8",
      }}
    >
      {/* Scenario button + left spacer — pushes nav cluster to centre */}
      <Box sx={{ flex: 1, display: "flex", alignItems: "center" }}>
        {scenarioEnabled && <ScenarioButton onClick={onScenario} />}
      </Box>

      {/* Centre: pan buttons + mode toggle */}
      <NavigationControls
        viewMode={viewMode}
        onSwitchMode={onSwitchMode}
        onPan={onPan}
      />

      {/* Right: zoom buttons */}
      <ZoomButtonsGroup onZoom={onZoom} />
    </Box>
  );
}
