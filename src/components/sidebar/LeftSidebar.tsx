import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { TranscriptBrowserRenderer } from "@/renderer/transcript-renderer";
import { historyManager } from "@/renderer/transcript-renderer/history";
import { favouriteManager } from "@/renderer/transcript-renderer/favourite";
import {
  locusKey,
  locusToRegionString,
} from "@/renderer/transcript-renderer/locus/locus-key";
import type { TooltipMode } from "@/renderer/transcript-renderer/tooltip";
import type { CursorMode } from "@/renderer/transcript-renderer/cursor";
import type { IHighlightRegion } from "@/renderer/transcript-renderer/highlight";
import type {
  IRBrowerConfig,
  ILocus,
  ILocusRna,
  ILocusDna,
} from "@/renderer/transcript-renderer/config/config";
import { rendererRNAConfigTEST } from "../../../config/transcript-browser-data_base";
import { rendererRNAConfigTEST as rendererQTLsConfig } from "../../../config/transcript-browser-data_QTLs";
import { rendererRNAConfigTEST as rendererMm10Config } from "../../../config/transcript-browser-data_mm10";
import { rendererHighlightConfig } from "../../../config/transcript-browser-data_Highlight";
import {
  ToggleBtn,
  SectionLabel,
  ColorPicker,
  ModeBadge,
  btnBase,
} from "../ui";
import { AddChannelPanel } from "../panels/AddChannelPanel";
import { logger } from "../../renderer/transcript-renderer/utils/logger";

export interface LeftSidebarProps {
  rendererRef: MutableRefObject<TranscriptBrowserRenderer | null>;
  // Tooltip
  tooltipVisible: boolean;
  setTooltipVisible: Dispatch<SetStateAction<boolean>>;
  tooltipTrigger: "hover" | "click";
  setTooltipTrigger: Dispatch<SetStateAction<"hover" | "click">>;
  tooltipMode: TooltipMode;
  setTooltipMode: Dispatch<SetStateAction<TooltipMode>>;
  // Cursor
  cursorEnabled: boolean;
  setCursorEnabled: Dispatch<SetStateAction<boolean>>;
  cursorMode: CursorMode;
  setCursorMode: Dispatch<SetStateAction<CursorMode>>;
  // Current rendered locus snapshot (updates every RAF frame)
  currentLocus: ILocus | null;
  // Highlights
  highlights: IHighlightRegion[];
  onAddHighlight: () => void;
  onDeleteHighlight: (name: string) => void;
  onUpdateHighlight: (
    name: string,
    start: number,
    end: number,
    color: string,
  ) => void;
  // History (ILocus snapshots)
  histItems: ILocus[];
  setHistItems: Dispatch<SetStateAction<ILocus[]>>;
  // Favourites (ILocus snapshots)
  favItems: ILocus[];
  setFavItems: Dispatch<SetStateAction<ILocus[]>>;
  setIsFav: Dispatch<SetStateAction<boolean>>;
  onNavigateLocus: (locus: ILocus) => void;
  onApplyConfig: (cfg: IRBrowerConfig) => void;
}

const hrStyle: React.CSSProperties = {
  margin: "0 0 10px",
  border: "none",
  borderTop: "1px solid #e0e0e0",
};

// ── Current Locus card ─────────────────────────────────────────────────────

/**
 * Field order inside the DNA sub-block.
 */
const DNA_FIELDS: ReadonlyArray<keyof ILocusDna> = [
  "chr",
  "start",
  "end",
  "assembly",
];

/** Field order inside the RNA sub-block. */
const RNA_FIELDS: ReadonlyArray<keyof ILocusRna> = [
  "trans_id",
  "trans_name",
  "trans_type",
  "gene_id",
  "gene_name",
  "gene_type",
  "strand",
  "tssStart",
  "tssEnd",
  "assembly",
];

/**
 * Format an ILocus field value.
 */
function formatLocusValue(key: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (
    (key === "start" || key === "end" || key === "start (TSS)" || key === "end (TSS)") &&
    typeof value === "number"
  ) {
    return value.toLocaleString();
  }
  return String(value);
}

function LocusRow(props: { label: string; value: unknown }) {
  const isMissing =
    props.value === undefined || props.value === null || props.value === "";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 6,
        fontSize: 10,
        lineHeight: 1.5,
        minHeight: 14,
      }}
    >
      <span style={{ color: "#888", flexShrink: 0 }}>{props.label}</span>
      <span
        style={{
          color: isMissing ? "#bbb" : "#222",
          fontFamily: isMissing ? "inherit" : "ui-monospace, Menlo, monospace",
          textAlign: "right",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={isMissing ? undefined : String(props.value)}
      >
        {formatLocusValue(props.label, props.value)}
      </span>
    </div>
  );
}

function SubSectionLabel(props: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 600,
        color: "#666",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginTop: 4,
        marginBottom: 2,
      }}
    >
      {props.children}
    </div>
  );
}

function CurrentLocusCard(props: { locus: ILocus | null }) {
  const { locus } = props;
  if (!locus) {
    return (
      <div
        style={{
          fontSize: 10,
          color: "#aaa",
          marginBottom: 8,
          lineHeight: 1.4,
        }}
      >
        No locus rendered yet.
      </div>
    );
  }
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e0e0e0",
        borderRadius: 4,
        padding: "6px 7px",
        marginBottom: 8,
      }}
    >
      <LocusRow label="mode" value={locus.mode.toUpperCase()} />
      <LocusRow label="isFavorite" value={locus.isFavorite ? "yes" : "no"} />
      <LocusRow label="id" value={locus.id} />
      <LocusRow label="time" value={locus.time} />

      <SubSectionLabel>DNA</SubSectionLabel>
      {DNA_FIELDS.map((key) => (
        <LocusRow key={`dna-${key}`} label={key} value={locus.dna[key]} />
      ))}

      <SubSectionLabel>RNA</SubSectionLabel>
      {RNA_FIELDS.map((key) => (
        <LocusRow key={`rna-${key}`} label={key === "tssStart" ? "start (TSS)" : key === "tssEnd" ? "end (TSS)" : key} value={locus.rna[key]} />
      ))}
    </div>
  );
}

/** The dev-only left control sidebar!!! */
export function LeftSidebar(props: LeftSidebarProps) {
  const {
    rendererRef,
    tooltipVisible,
    setTooltipVisible,
    tooltipTrigger,
    setTooltipTrigger,
    tooltipMode,
    setTooltipMode,
    cursorEnabled,
    setCursorEnabled,
    cursorMode,
    setCursorMode,
    currentLocus,
    highlights,
    onAddHighlight,
    onDeleteHighlight,
    onUpdateHighlight,
    histItems,
    setHistItems,
    favItems,
    setFavItems,
    setIsFav,
    onNavigateLocus,
    onApplyConfig,
  } = props;

  // ── Active-entry signal ─────────────────────────────────────────────
  const activeLocusKey = currentLocus ? locusKey(currentLocus) : "";

  return (
    <div
      style={{
        width: 210,
        minWidth: 210,
        borderRight: "1px solid #ddd",
        padding: "10px 10px 20px",
        boxSizing: "border-box",
        overflowY: "auto",
        fontSize: 12,
        fontFamily: "system-ui, sans-serif",
        background: "#fafafa",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Controls</h4>

      {/* ── Tooltip controls ── */}
      <div style={{ marginBottom: 12 }}>
        <SectionLabel>Tooltip</SectionLabel>
        <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
          <ToggleBtn
            active={tooltipVisible}
            onClick={() => setTooltipVisible(true)}
          >
            On
          </ToggleBtn>
          <ToggleBtn
            active={!tooltipVisible}
            onClick={() => setTooltipVisible(false)}
          >
            Off
          </ToggleBtn>
        </div>
        <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
          {(["hover", "click"] as const).map((t) => (
            <ToggleBtn
              key={t}
              active={tooltipTrigger === t}
              onClick={() => {
                setTooltipTrigger(t);
                setTooltipVisible(true);
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </ToggleBtn>
          ))}
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {(["compact", "detailed"] as TooltipMode[]).map((m) => (
            <ToggleBtn
              key={m}
              active={tooltipMode === m}
              onClick={() => setTooltipMode(m)}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </ToggleBtn>
          ))}
        </div>
      </div>

      <hr style={hrStyle} />

      {/* ── Cursor controls ── */}
      <div style={{ marginBottom: 12 }}>
        <SectionLabel>Cursor</SectionLabel>
        <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
          <ToggleBtn
            active={cursorEnabled}
            onClick={() => setCursorEnabled((v) => !v)}
          >
            {cursorEnabled ? "ON" : "OFF"}
          </ToggleBtn>
        </div>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {(["compact", "detailed", "each"] as CursorMode[]).map((m) => (
            <ToggleBtn
              key={m}
              active={cursorMode === m}
              onClick={() => setCursorMode(m)}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </ToggleBtn>
          ))}
        </div>
      </div>

      <hr style={hrStyle} />

      {/* ── Current Locus ── */}
      <div style={{ marginBottom: 6 }}>
        <SectionLabel>Current Locus</SectionLabel>
      </div>
      <CurrentLocusCard locus={currentLocus} />

      <hr style={hrStyle} />

      {/* ── Highlight list ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <SectionLabel>Highlights</SectionLabel>
        <button
          onClick={onAddHighlight}
          title="Add highlight at current view centre"
          style={{
            ...btnBase,
            padding: "2px 7px",
            fontSize: 11,
            background: "#f0f4ff",
            borderColor: "#3867d6",
            color: "#3867d6",
          }}
        >
          + Add
        </button>
      </div>

      {highlights.length === 0 && (
        <div
          style={{
            fontSize: 10,
            color: "#aaa",
            marginBottom: 8,
            lineHeight: 1.4,
          }}
        >
          No highlights. Use "Map to regions" in channel menu, or click + Add.
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 8,
        }}
      >
        {highlights.map((hl) => (
          <div
            key={hl.name}
            style={{
              background: "#fff",
              border: "1px solid #e0e0e0",
              borderRadius: 4,
              padding: "6px 7px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 5,
              }}
            >
              <div
                style={{
                  width: 13,
                  height: 13,
                  background: hl.color,
                  borderRadius: 2,
                  border: "1px solid rgba(0,0,0,0.2)",
                  flexShrink: 0,
                }}
              />
              <button
                onClick={() => onDeleteHighlight(hl.name)}
                title="Remove highlight"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#aaa",
                  fontSize: 14,
                  lineHeight: 1,
                  padding: "0 2px",
                }}
              >
                ×
              </button>
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: "#888", marginBottom: 1 }}>
                  Start
                </div>
                <input
                  type="number"
                  value={hl.start}
                  style={{
                    width: "100%",
                    fontSize: 10,
                    padding: "2px 3px",
                    boxSizing: "border-box",
                  }}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v))
                      onUpdateHighlight(hl.name, v, hl.end, hl.color);
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: "#888", marginBottom: 1 }}>
                  End
                </div>
                <input
                  type="number"
                  value={hl.end}
                  style={{
                    width: "100%",
                    fontSize: 10,
                    padding: "2px 3px",
                    boxSizing: "border-box",
                  }}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v))
                      onUpdateHighlight(hl.name, hl.start, v, hl.color);
                  }}
                />
              </div>
            </div>
            <ColorPicker
              value={hl.color}
              onChange={(c) => onUpdateHighlight(hl.name, hl.start, hl.end, c)}
            />
          </div>
        ))}
      </div>

      {/* ── Region Coordinates ── */}
      {highlights.length > 0 && (
        <>
          <div style={{ marginBottom: 6 }}>
            <SectionLabel>Region Coordinates</SectionLabel>
          </div>
          {(() => {
            const r = rendererRef.current;
            if (!r) return null;
            const rl = r.getRegionList();
            return (
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e0e0e0",
                  borderRadius: 4,
                  padding: "5px 6px",
                  fontSize: 9,
                  fontFamily: "monospace",
                  lineHeight: 1.5,
                  flexShrink: 0,
                  minHeight: 90,
                  maxHeight: 180,
                  overflowY: "auto",
                  wordBreak: "break-all",
                  marginBottom: 8,
                }}
              >
                {(["DNA", "mRNA", "RNA", "CDS"] as const).map((mode) => (
                  <div key={mode} style={{ marginBottom: 4 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        color:
                          mode === "DNA"
                            ? "#2d98da"
                            : mode === "mRNA"
                              ? "#8854d0"
                              : mode === "RNA"
                                ? "#e55039"
                                : "#20bf6b",
                        marginBottom: 1,
                      }}
                    >
                      {mode}
                    </div>
                    {rl[mode].length === 0 ? (
                      <div style={{ color: "#aaa" }}>—</div>
                    ) : (
                      rl[mode].map((entry, i) => (
                        <div key={i} style={{ color: "#555" }}>
                          {entry.chr}:{entry.start}-{entry.end}
                          {entry.strand !== "." ? ` (${entry.strand})` : ""}
                          {"trans_name" in entry && (entry as any).trans_name
                            ? ` ${(entry as any).trans_name}`
                            : ""}
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </>
      )}

      <hr
        style={{
          margin: "10px 0",
          border: "none",
          borderTop: "1px solid #e0e0e0",
        }}
      />

      {/* ── History list ── */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <SectionLabel>History</SectionLabel>
          {histItems.length > 0 && (
            <button
              onClick={() => {
                historyManager.clear();
                setHistItems([]);
              }}
              title="Clear all history"
              style={{
                ...btnBase,
                padding: "1px 5px",
                fontSize: 10,
                color: "#e55039",
                borderColor: "#e55039",
              }}
            >
              Clear
            </button>
          )}
        </div>
        {histItems.length === 0 ? (
          <div style={{ fontSize: 10, color: "#aaa", lineHeight: 1.4 }}>
            No history yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {histItems.map((item) => {
              const display = locusToRegionString(item);
              const isActive =
                !!activeLocusKey && activeLocusKey === locusKey(item);
              return (
                <div
                  key={locusKey(item) + "|" + item.time}
                  style={{ display: "flex", alignItems: "center", gap: 3 }}
                >
                  <button
                    onClick={() => onNavigateLocus(item)}
                    title={`[${item.mode.toUpperCase()}] ${display}`}
                    style={{
                      flex: 1,
                      textAlign: "left",
                      background: isActive ? "#e8f0fe" : "#fff",
                      border: "1px solid #e0e0e0",
                      borderRadius: 3,
                      padding: "3px 6px",
                      fontSize: 10,
                      cursor: "pointer",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: isActive ? "#3867d6" : "#333",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <ModeBadge mode={item.mode} size={14} marginRight={4} />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {display || "—"}
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      historyManager.remove(item);
                      setHistItems(historyManager.getAll());
                    }}
                    title="Remove"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#bbb",
                      fontSize: 13,
                      lineHeight: 1,
                      padding: "0 2px",
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <hr style={hrStyle} />

      {/* ── Favourites list ── */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <SectionLabel>Favourites</SectionLabel>
          {favItems.length > 0 && (
            <button
              onClick={() => {
                favouriteManager.clear();
                setFavItems([]);
                setIsFav(false);
              }}
              title="Clear all favourites"
              style={{
                ...btnBase,
                padding: "1px 5px",
                fontSize: 10,
                color: "#e55039",
                borderColor: "#e55039",
              }}
            >
              Clear
            </button>
          )}
        </div>
        {favItems.length === 0 ? (
          <div style={{ fontSize: 10, color: "#aaa", lineHeight: 1.4 }}>
            No favourites. Click ★ to save a region.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {favItems.map((fav) => {
              const display = locusToRegionString(fav);
              // Match by locusKey so RNA and CDS favourites of the same
              // transcript don't both light up — they share the display
              // string but have different keys (mode is in the key).
              const isActive =
                !!activeLocusKey && activeLocusKey === locusKey(fav);
              return (
                <div
                  key={locusKey(fav)}
                  style={{ display: "flex", alignItems: "center", gap: 3 }}
                >
                  <button
                    onClick={() => onNavigateLocus(fav)}
                    title={`[${fav.mode.toUpperCase()}] ${display}`}
                    style={{
                      flex: 1,
                      textAlign: "left",
                      background: isActive ? "#fff9e6" : "#fff",
                      border: "1px solid #e0e0e0",
                      borderRadius: 3,
                      padding: "3px 6px",
                      fontSize: 10,
                      cursor: "pointer",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: isActive ? "#f39c12" : "#333",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span style={{ flexShrink: 0 }}>★</span>
                    <ModeBadge mode={fav.mode} size={14} marginRight={4} />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {display || "—"}
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      favouriteManager.remove(fav);
                      setFavItems(favouriteManager.getAll());
                      if (locusKey(fav) === activeLocusKey) setIsFav(false);
                    }}
                    title="Remove favourite"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#bbb",
                      fontSize: 13,
                      lineHeight: 1,
                      padding: "0 2px",
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Export / Import Config ── */}
      <div style={{ padding: "6px 8px", borderTop: "1px solid #e8e8e8" }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => {
              const cfg = rendererRef.current?.exportConfig();
              if (!cfg) return;
              const json = JSON.stringify(cfg, null, 2);
              const blob = new Blob([json], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `rbrowser-config-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            style={{
              flex: 1,
              padding: "5px 0",
              fontSize: 11,
              fontWeight: 600,
              color: "#fff",
              background: "#3867d6",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            Export Config
          </button>
          <button
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".json,application/json";
              input.onchange = () => {
                const file = input.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  try {
                    const cfg = JSON.parse(
                      reader.result as string,
                    ) as IRBrowerConfig;
                    if (!cfg.channels || !Array.isArray(cfg.channels)) {
                      logger.error(
                        "[Import Config] Invalid config: missing channels array",
                      );
                      return;
                    }
                    onApplyConfig(cfg);
                  } catch (err) {
                    logger.error("[Import Config] Failed to parse JSON:", err);
                  }
                };
                reader.readAsText(file);
              };
              input.click();
            }}
            style={{
              flex: 1,
              padding: "5px 0",
              fontSize: 11,
              fontWeight: 600,
              color: "#fff",
              background: "#00b894",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            Import Config
          </button>
        </div>
      </div>

      {/* ── Switch Config ── */}
      <div style={{ marginBottom: 12 }}>
        <SectionLabel>Switch Config</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button
            onClick={() => onApplyConfig(rendererRNAConfigTEST)}
            style={{
              ...btnBase,
              padding: "4px 8px",
              fontSize: 11,
              fontWeight: 600,
              color: "#3867d6",
              borderColor: "#3867d6",
              width: "100%",
              textAlign: "left",
            }}
          >
            🧬 Base Config
          </button>
          <button
            onClick={() => onApplyConfig(rendererQTLsConfig)}
            style={{
              ...btnBase,
              padding: "4px 8px",
              fontSize: 11,
              fontWeight: 600,
              color: "#6c5ce7",
              borderColor: "#6c5ce7",
              width: "100%",
              textAlign: "left",
            }}
          >
            💎 QTLs Config
          </button>
          <button
            onClick={() => onApplyConfig(rendererMm10Config)}
            style={{
              ...btnBase,
              padding: "4px 8px",
              fontSize: 11,
              fontWeight: 600,
              color: "#00b894",
              borderColor: "#00b894",
              width: "100%",
              textAlign: "left",
            }}
          >
            🐁 mm10 Config
          </button>
          <button
            onClick={() => onApplyConfig(rendererHighlightConfig)}
            style={{
              ...btnBase,
              padding: "4px 8px",
              fontSize: 11,
              fontWeight: 600,
              color: "#e17055",
              borderColor: "#e17055",
              width: "100%",
              textAlign: "left",
            }}
          >
            🎨 Highlight Config
          </button>
        </div>
      </div>

      {/* ── Add Channel ── */}
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#3867d6",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            padding: "6px 8px 0",
            borderTop: "1px solid #e8e8e8",
          }}
        >
          Add Channel
        </div>
        <AddChannelPanel rendererRef={rendererRef} />
      </div>
    </div>
  );
}
