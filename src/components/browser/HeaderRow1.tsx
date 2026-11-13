import { WheelModeButton } from "../header/WheelModeButton";
import type { WheelMode } from "../../renderer/transcript-renderer/events/wheel-mode";
import Box from "@mui/material/Box";
import MuiIconButton from "@mui/material/IconButton";
import { ActionTooltip } from "../ui/ActionTooltip";
import SearchIcon from "@mui/icons-material/Search";
import type { MutableRefObject } from "react";
import { Sep, headerIconBtnSx } from "../ui";
import { ReferenceMenu } from "../header/ReferenceMenu";
import { RegionSearchInput } from "../header/RegionSearchInput";
import { ResetButton } from "../header/ResetButton";
import { HistoryButton } from "../header/HistoryButton";
import { FavouriteButton } from "../header/FavouriteButton";
import {
  DownloadButton,
  type DownloadFormat,
  type DownloadTheme,
} from "../header/DownloadButton";
import { ChannelLabelsButton } from "../header/ChannelLabelsButton";
import { ChannelLegend, type LegendStyle } from "../header/ChannelLegend";
import { GridButton } from "../header/GridButton";
import {
  TooltipButton,
  type TooltipTriggerKind,
} from "../header/TooltipButton";
import { HighlightButton } from "../header/HighlightButton";
import { CursorButton } from "../header/CursorButton";
import { HelpButton } from "../header/HelpButton";
import type { ViewMode } from "../header/ModeToggle";
import type { ITrans } from "@/renderer/transcript-renderer/reference/reference-manager";
import type { TranscriptBrowserRenderer } from "@/renderer/transcript-renderer";
import type { ILocus } from "@/renderer/transcript-renderer/config/config";
import type { IReferenceConfig } from "@/renderer/transcript-renderer/config/config";
import type { TooltipMode } from "@/renderer/transcript-renderer/tooltip";
import type { CursorMode } from "@/renderer/transcript-renderer/cursor";

/** Header feature-visibility flags resolved from config. */
export interface HeaderFeatureFlags {
  history: boolean;
  favourites: boolean;
  download: boolean;
  channelLabel: boolean;
  legend: boolean;
  grid: boolean;
  tooltip: boolean;
  highlight: boolean;
  cursor: boolean;
}

export interface HeaderRow1Props {
  hp: HeaderFeatureFlags;
  // Reference menu
  rendererRef: MutableRefObject<TranscriptBrowserRenderer | null>;
  activeRef: IReferenceConfig | undefined;
  referenceSearchThreshold: number;
  onReferenceSwitch: (switched: IReferenceConfig) => void;
  // Region search
  viewMode: ViewMode;
  regionInput: string;
  viewportWidth: number;
  regionInputRef: React.Ref<HTMLInputElement>;
  onRegionChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRegionFocus: () => void;
  onRegionBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onRegionKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  suggestions: ITrans[];
  isSearching: boolean;
  showDropdown: boolean;
  dropdownRef: React.Ref<HTMLDivElement>;
  onSelectSuggestion: (s: ITrans) => void;
  // Search / reset
  onSearch: () => void;
  onReset: () => void;
  // History (full ILocus snapshots; HistoryButton renders mode + region)
  histItems: ILocus[];
  /**
   * Current locus snapshot — `HistoryButton` matches each entry by
   * `locusKey` to determine which row is currently active. Matching by
   * `regionInput` alone would highlight both RNA and CDS entries for the
   * same transcript at once (they render the same string).
   */
  currentLocus: ILocus | null;
  /**
   * Locus-aware navigation for history entries. Receives the full
   * ILocus so assembly + mode + identity are all preserved.
   */
  onNavigateLocus: (locus: ILocus) => void;
  onClearHistory: () => void;
  // Favourite
  isFav: boolean;
  onToggleFav: () => void;
  // Download
  onExport: (theme: DownloadTheme, format: DownloadFormat) => void;
  // Channel labels
  showLabels: boolean;
  onToggleLabels: () => void;
  // Legend
  showLegend: boolean;
  legendStyle: LegendStyle;
  onToggleLegend: () => void;
  onSetLegendStyle: (style: LegendStyle) => void;
  // Grid
  gridActive: boolean;
  gridX: boolean;
  gridY: boolean;
  onToggleGridX: () => void;
  onToggleGridY: () => void;
  onGridShowAll: () => void;
  onGridHideAll: () => void;
  // Tooltip
  tooltipVisible: boolean;
  tooltipTrigger: TooltipTriggerKind;
  tooltipMode: TooltipMode;
  onSetTooltipVisible: (visible: boolean) => void;
  onSetTooltipTrigger: (trigger: TooltipTriggerKind) => void;
  onSetTooltipMode: (mode: TooltipMode) => void;
  // Highlight
  highlightVisible: boolean;
  highlightShowDistance: boolean;
  onSetHighlightVisible: (visible: boolean) => void;
  onToggleHighlightDistance: () => void;
  onClearAllHighlights: () => void;
  // Cursor
  cursorEnabled: boolean;
  cursorMode: CursorMode;
  onSetCursorEnabled: (enabled: boolean) => void;
  onSetCursorMode: (mode: CursorMode) => void;
  wheelMode: WheelMode;
  onSetWheelMode: (mode: WheelMode) => void;
  // Help
  onToggleHelp: () => void;
}

/**
 * First header row: genome / region search controls on the left, view-feature
 * toggles (labels, legend, grid, tooltip, highlight, cursor, help) on the right.
 */
export function HeaderRow1(props: HeaderRow1Props) {
  const { hp } = props;
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 38,
        px: 1,
        boxSizing: "border-box",
      }}
    >
      {/* Left: Assembly + Region input + action icons */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <ReferenceMenu
          rendererRef={props.rendererRef}
          activeRef={props.activeRef}
          searchThreshold={props.referenceSearchThreshold}
          onReferenceSwitch={props.onReferenceSwitch}
        />

        <RegionSearchInput
          viewMode={props.viewMode}
          regionInput={props.regionInput}
          viewportWidth={props.viewportWidth}
          regionInputRef={props.regionInputRef}
          onChange={props.onRegionChange}
          onFocus={props.onRegionFocus}
          onBlur={props.onRegionBlur}
          onKeyDown={props.onRegionKeyDown}
          suggestions={props.suggestions}
          isSearching={props.isSearching}
          showDropdown={props.showDropdown}
          dropdownRef={props.dropdownRef}
          onSelectSuggestion={props.onSelectSuggestion}
        />

        <ActionTooltip title="Navigate to region" arrow>
          <MuiIconButton sx={headerIconBtnSx} onClick={props.onSearch}>
            <SearchIcon sx={{ fontSize: 20 }} />
          </MuiIconButton>
        </ActionTooltip>

        <ResetButton onReset={props.onReset} />

        {hp.history && (
          <HistoryButton
            histItems={props.histItems}
            currentLocus={props.currentLocus}
            onNavigateLocus={props.onNavigateLocus}
            onClearHistory={props.onClearHistory}
          />
        )}

        {hp.favourites && (
          <FavouriteButton isFav={props.isFav} onToggle={props.onToggleFav} />
        )}

        {hp.download && <DownloadButton onExport={props.onExport} />}
      </Box>

      {/* Right: Function icon buttons */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
        {hp.channelLabel && (
          <ChannelLabelsButton
            showLabels={props.showLabels}
            onToggle={props.onToggleLabels}
          />
        )}

        {hp.legend && (
          <ChannelLegend
            showLegend={props.showLegend}
            legendStyle={props.legendStyle}
            onToggleLegend={props.onToggleLegend}
            onSetStyle={props.onSetLegendStyle}
          />
        )}

        {hp.grid && (
          <GridButton
            gridActive={props.gridActive}
            gridX={props.gridX}
            gridY={props.gridY}
            onToggleX={props.onToggleGridX}
            onToggleY={props.onToggleGridY}
            onShowAll={props.onGridShowAll}
            onHideAll={props.onGridHideAll}
          />
        )}

        <Sep />

        {hp.tooltip && (
          <TooltipButton
            tooltipVisible={props.tooltipVisible}
            tooltipTrigger={props.tooltipTrigger}
            tooltipMode={props.tooltipMode}
            onSetVisible={props.onSetTooltipVisible}
            onSetTrigger={props.onSetTooltipTrigger}
            onSetMode={props.onSetTooltipMode}
          />
        )}

        {hp.highlight && (
          <HighlightButton
            highlightVisible={props.highlightVisible}
            highlightShowDistance={props.highlightShowDistance}
            onSetVisible={props.onSetHighlightVisible}
            onToggleDistance={props.onToggleHighlightDistance}
            onClearAll={props.onClearAllHighlights}
          />
        )}

        {hp.cursor && (
          <CursorButton
            cursorEnabled={props.cursorEnabled}
            cursorMode={props.cursorMode}
            onSetEnabled={props.onSetCursorEnabled}
            onSetMode={props.onSetCursorMode}
          />
        )}

        <WheelModeButton
          mode={props.wheelMode}
          onChange={props.onSetWheelMode}
        />

        <Sep />

        <HelpButton onClick={props.onToggleHelp} />
      </Box>
    </Box>
  );
}
