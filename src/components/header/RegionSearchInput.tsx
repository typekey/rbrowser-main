import Box from "@mui/material/Box";
import { ActionTooltip } from "../ui/ActionTooltip";
import InputBase from "@mui/material/InputBase";
import { type ITrans } from "@/renderer/transcript-renderer/reference/reference-manager";
import { TranscriptAutocompleteDropdown } from "./TranscriptAutocompleteDropdown";
import type { ViewMode } from "./ModeToggle";

export interface RegionSearchInputProps {
  /** Current view mode (drives placeholder / tooltip text). */
  viewMode: ViewMode;
  /** Region text currently shown in the input. */
  regionInput: string;
  /** Visible span in bp, rendered as a right-aligned badge (hidden when 0). */
  viewportWidth: number;
  /** Ref forwarded to the underlying input element. */
  regionInputRef: React.Ref<HTMLInputElement>;
  /** Input change handler (owns mode-specific parsing / autocomplete trigger). */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Focus handler. */
  onFocus: () => void;
  /** Blur handler (owns the delayed commit). */
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  /** Keydown handler (Enter to commit, Escape to close dropdown). */
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Autocomplete suggestions. */
  suggestions: ITrans[];
  /** Whether a suggestion request is running. */
  isSearching: boolean;
  /** Whether the autocomplete dropdown is shown. */
  showDropdown: boolean;
  /** Ref attached to the dropdown root (outside-click detection). */
  dropdownRef: React.Ref<HTMLDivElement>;
  /** Called when a suggestion is selected. */
  onSelectSuggestion: (suggestion: ITrans) => void;
}

function formatWidth(width: number): string {
  if (width >= 1_000_000) return `${(width / 1_000_000).toFixed(1)} Mb`;
  if (width >= 1000) return `${(width / 1000).toFixed(1)} kb`;
  return `${width} bp`;
}

export function RegionSearchInput({
  viewMode,
  regionInput,
  viewportWidth,
  regionInputRef,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  suggestions,
  isSearching,
  showDropdown,
  dropdownRef,
  onSelectSuggestion,
}: RegionSearchInputProps) {
  const tooltipTitle =
    viewMode === "cds"
      ? "CDS mode: NAME:flank or NAME:up:down"
      : viewMode === "rna"
        ? "RNA mode: NAME:start:end relative to TSS=0; negative upstream, positive downstream"
        : "DNA mode: chr1:start-end or NAME:start:end relative to TSS=0";

  return (
    <ActionTooltip
      title={tooltipTitle}
      arrow
      placement="bottom"
      enterDelay={2000}
    >
      <Box
        sx={{
          position: "relative",
          width: 340,
          minWidth: 300,
          height: 32,
          bgcolor: "#f7f7f7",
          borderRadius: "4px",
          ml: 0.5,
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: "none",
            padding: "0 10px",
            fontSize: 16,
            fontWeight: 400,
            lineHeight: "32px",
            height: 32,
            fontFamily: "Roboto, Helvetica, Arial, sans-serif",
            whiteSpace: "nowrap",
            overflow: "hidden",
            boxSizing: "border-box",
            letterSpacing: "normal",
          }}
        >
          {(() => {
            const text = regionInput;
            if (!text) return null;
            const colonIdx = text.indexOf(":");
            if (colonIdx < 0) {
              return <span style={{ color: "#de614b" }}>{text}</span>;
            }
            return (
              <>
                <span style={{ color: "#de614b" }}>
                  {text.slice(0, colonIdx)}
                </span>
                <span style={{ color: "#2f3542" }}>{text.slice(colonIdx)}</span>
              </>
            );
          })()}
        </div>

        <InputBase
          inputRef={regionInputRef}
          value={regionInput}
          placeholder={
            viewMode === "dna" ? "chr1:start-end or NAME:-5000:1000" : viewMode === "cds" ? "NAME:up:down" : "NAME:-5000:1000"
          }
          sx={{
            position: "relative",
            width: "100%",
            height: "32px",
            bgcolor: "transparent",
            "& .MuiInputBase-input": {
              fontSize: 16,
              fontWeight: 400,
              padding: "0 10px",
              lineHeight: "32px",
              height: "32px",
              boxSizing: "border-box",
              fontFamily: "Roboto, Helvetica, Arial, sans-serif",
              letterSpacing: "normal",
              caretColor: "#111",
              color: "transparent",
              "&::selection": {
                backgroundColor: "rgba(51,144,255,0.28)",
                color: "transparent",
              },
              "&::placeholder": {
                color: "#999",
                opacity: 1,
              },
            },
          }}
          inputProps={{
            "aria-label": "Genome region",
            autoComplete: "off",
          }}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />

        {viewportWidth > 0 && (
          <span
            style={{
              position: "absolute",
              right: 0,
              padding: "0 6px",
              backgroundColor: "#f7f7f7",
              borderRadius: "0 4px 4px 0",
              top: 0,
              height: 32,
              lineHeight: "32px",
              fontSize: 11,
              color: "#aaa",
              pointerEvents: "none",
              userSelect: "none",
              whiteSpace: "nowrap",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                right: "100%",
                top: 0,
                width: 20,
                height: "100%",
                background: "linear-gradient(to right, rgba(247, 247, 247, 0), #f7f7f7)",
              }}
            />
            {formatWidth(viewportWidth)}
          </span>
        )}

        <TranscriptAutocompleteDropdown
          suggestions={suggestions}
          isSearching={isSearching}
          show={showDropdown}
          dropdownRef={dropdownRef}
          onSelect={onSelectSuggestion}
        />
      </Box>
    </ActionTooltip>
  );
}
