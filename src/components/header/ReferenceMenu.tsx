import { ActionTooltip } from "../ui/ActionTooltip";
import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import GridViewRoundedIcon from "@mui/icons-material/GridViewRounded";
import ViewListRoundedIcon from "@mui/icons-material/ViewListRounded";
import { TranscriptBrowserRenderer } from "@/renderer/transcript-renderer";
import type { IReferenceConfig } from "@/renderer/transcript-renderer/config/config";
import { btnBase } from "../ui/styles";

export function ReferenceMenu({
  rendererRef,
  activeRef,
  searchThreshold = 8,
  onReferenceSwitch,
}: {
  rendererRef: React.RefObject<TranscriptBrowserRenderer | null>;
  activeRef: IReferenceConfig | undefined;
  /** Show the search box only when the reference count reaches this. */
  searchThreshold?: number;
  /** Invoked with the newly-active reference after a successful switch. */
  onReferenceSwitch: (switched: IReferenceConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !dropdownRef.current?.contains(target) &&
        !anchorRef.current?.contains(target)
      ) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <Box sx={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={anchorRef}
        onClick={() =>
          setOpen((o) => {
            if (o) setQuery("");
            return !o;
          })
        }
        style={{
          ...btnBase,
          padding: "3px 8px",
          height: 32,
          fontSize: 14,
          fontWeight: 700,
          color: "#3867d6",
          borderColor: "#3867d6",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {activeRef?.species?.icon && (
          <img
            src={activeRef.species.icon}
            alt=""
            style={{
              width: 20,
              height: 20,
              objectFit: "contain",
              display: "block",
              opacity: 0.85,
              flexShrink: 0,
            }}
          />
        )}
        {activeRef?.assembly.name ?? "Reference"}
        <KeyboardArrowDownRoundedIcon
          sx={{
            fontSize: 16,
            transition: "transform 0.15s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
      {open && (
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 2,
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 4,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            zIndex: 9999,
            minWidth: viewMode === "grid" ? 604 : 150,
            width: viewMode === "grid" ? 604 : undefined,
            overflow: "hidden",
          }}
        >
          {(() => {
            const all = rendererRef.current?.referenceManager.getAll() ?? [];
            const activeIdx =
              rendererRef.current?.referenceManager.activeIndex ?? 0;
            const showSearch = all.length >= searchThreshold;
            const q = query.trim().toLowerCase();
            const visible = all
              .map((ref, i) => ({ ref, i }))
              .filter(({ ref }) => {
                if (!q) return true;
                const hay = [
                  ref.assembly?.name,
                  ref.assembly?.build,
                  ref.assembly?.version,
                  ref.species?.name,
                  ref.species?.label,
                ]
                  .filter(Boolean)
                  .join(" ")
                  .toLowerCase();
                return hay.includes(q);
              })
              .sort((a, b) => {
                const ca = a.ref.curated ? 1 : 0;
                const cb = b.ref.curated ? 1 : 0;
                return cb - ca;
              });
            const loadRef = (i: number) => {
              const refMgr = rendererRef.current?.referenceManager;
              const switched = refMgr?.switchTo(i);
              if (switched) onReferenceSwitch(switched);
              setOpen(false);
              setQuery("");
            };
            const speciesGroups: {
              key: string;
              species: IReferenceConfig["species"];
              items: { ref: IReferenceConfig; i: number }[];
              isCustomGroup?: boolean;
            }[] = [];
            const groupIndex = new Map<string, number>();
            for (const entry of visible) {
              const key = entry.ref.custom
                ? "__custom__"
                : entry.ref.species?.label ||
                  entry.ref.species?.name ||
                  entry.ref.assembly.name;
              let gi = groupIndex.get(key);
              if (gi === undefined) {
                gi = speciesGroups.length;
                groupIndex.set(key, gi);
                speciesGroups.push({
                  key,
                  species: entry.ref.custom ? undefined : entry.ref.species,
                  isCustomGroup: entry.ref.custom,
                  items: [],
                });
              }
              speciesGroups[gi].items.push(entry);
            }
            return (
              <>
                {/* Header: search box (when many refs) + view-mode toggle. */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: 6,
                    borderBottom: "1px solid #eee",
                    background: "#fafafa",
                  }}
                >
                  {showSearch ? (
                    <input
                      ref={searchInputRef}
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setOpen(false);
                          setQuery("");
                        }
                      }}
                      placeholder="Search reference…"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        boxSizing: "border-box",
                        padding: "4px 6px",
                        fontSize: 12,
                        border: "1px solid #ccc",
                        borderRadius: 3,
                        outline: "none",
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        flex: 1,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#888",
                        paddingLeft: 2,
                      }}
                    >
                      Reference
                    </span>
                  )}
                  <ActionTooltip
                    title={
                      viewMode === "list"
                        ? "Switch to grid view"
                        : "Switch to list view"
                    }
                  >
                    <button
                      type="button"

                      onClick={() =>
                        setViewMode((m) => (m === "list" ? "grid" : "list"))
                      }
                      style={{
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 28,
                        height: 26,
                        padding: 0,
                        border: "none",
                        borderRadius: 4,
                        background: "#3867d6",
                        color: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      {viewMode === "list" ? (
                        <GridViewRoundedIcon
                          sx={{ fontSize: 16, color: "#fff" }}
                        />
                      ) : (
                        <ViewListRoundedIcon
                          sx={{ fontSize: 18, color: "#fff" }}
                        />
                      )}
                    </button>
                  </ActionTooltip>
                </div>
                {visible.length === 0 ? (
                  <div
                    style={{
                      padding: "8px 10px",
                      fontSize: 11,
                      color: "#888",
                      textAlign: "center",
                    }}
                  >
                    No matching reference
                  </div>
                ) : viewMode === "grid" ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 180px)",
                      columnGap: 14,
                      rowGap: 20,
                      padding: 12,
                      maxHeight: 420,
                      overflowY: "auto",
                    }}
                  >
                    {speciesGroups.map((group) => {
                      const latinName = group.species?.name ?? "";
                      const latinTruncated = latinName.length * 6 > 139;
                      return (
                        <div key={group.key}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 7,
                              marginBottom: 8,
                            }}
                          >
                            {group.isCustomGroup ? (
                              <div
                                style={{
                                  flexShrink: 0,
                                  width: 34,
                                  height: 34,
                                  borderRadius: 6,
                                  background: "#e8eef9",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: "#3867d6",
                                    letterSpacing: "-0.5px",
                                    userSelect: "none",
                                  }}
                                >
                                  CR
                                </span>
                              </div>
                            ) : group.species?.icon ? (
                              <div
                                style={{
                                  flexShrink: 0,
                                  width: 34,
                                  height: 34,
                                  borderRadius: 6,
                                  overflow: "hidden",
                                  background: "#f0f0f0",
                                }}
                              >
                                <img
                                  src={group.species.icon}
                                  alt=""
                                  style={{
                                    width: 34,
                                    height: 34,
                                    objectFit: "contain",
                                    display: "block",
                                  }}
                                />
                              </div>
                            ) : null}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div
                                style={{
                                  fontWeight: 700,
                                  fontSize: 12,
                                  color: "#111",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {group.isCustomGroup
                                  ? "Custom Reference"
                                  : group.species?.label || group.key}
                              </div>
                              <ActionTooltip
                                title={latinTruncated ? latinName : undefined}
                              >
                                <div
                                  style={{
                                    fontSize: 10,
                                    color: latinName ? "#888" : "transparent",
                                    fontStyle: "italic",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    marginTop: 2,
                                    userSelect: "none",
                                  }}
                                >
                                  {latinName || "\u00a0"}
                                </div>
                              </ActionTooltip>
                            </div>
                          </div>
                          {/* Assembly versions */}
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 5,
                            }}
                          >
                            {group.items.map(({ ref, i }) => {
                              const isActive = i === activeIdx;
                              const cellLabel = ref.assembly.build
                                ? `${ref.assembly.name} (${ref.assembly.build})`
                                : ref.assembly.name;
                              return (
                                <ActionTooltip
                                  key={ref.assembly.name}
                                  title={cellLabel}
                                >
                                  <div
                                    onClick={() => loadRef(i)}

                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      gap: 4,
                                      padding: "4px 8px",
                                      borderRadius: 5,
                                      border: isActive
                                        ? "1px solid #3867d6"
                                        : "1px solid #e3e3e3",
                                      background: isActive
                                        ? "#eef2ff"
                                        : "#fafafa",
                                      color: isActive ? "#3867d6" : "#444",
                                      cursor: "pointer",
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isActive)
                                        (
                                          e.currentTarget as HTMLDivElement
                                        ).style.background = "#eef2ff";
                                    }}
                                    onMouseLeave={(e) => {
                                      (
                                        e.currentTarget as HTMLDivElement
                                      ).style.background = isActive
                                        ? "#eef2ff"
                                        : "#fafafa";
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontStyle: "italic",
                                        fontSize: 12,
                                        fontWeight: isActive ? 600 : 400,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        minWidth: 0,
                                      }}
                                    >
                                      {cellLabel}
                                    </span>
                                    {ref.curated && (
                                      <ActionTooltip title="Featured reference">
                                        <span
                                          style={{
                                            flexShrink: 0,
                                            fontSize: 11,
                                            lineHeight: 1,
                                            color: "#3867d6",
                                            pointerEvents: "none",
                                          }}
                                        >
                                          ★
                                        </span>
                                      </ActionTooltip>
                                    )}
                                  </div>
                                </ActionTooltip>
                              );
                            })}
                            {/* Add new custom reference button. */}
                            {group.isCustomGroup && (
                              <div
                                onClick={() => {
                                  rendererRef.current?.importCustomReference();
                                  setOpen(false);
                                  setQuery("");
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 4,
                                  padding: "4px 8px",
                                  borderRadius: 5,
                                  border: "1.5px dashed #3867d6",
                                  background: "#f5f7ff",
                                  color: "#3867d6",
                                  fontWeight: 600,
                                  fontSize: 12,
                                  cursor: "pointer",
                                  whiteSpace: "nowrap",
                                }}
                                onMouseEnter={(e) => {
                                  (
                                    e.currentTarget as HTMLDivElement
                                  ).style.background = "#eef2ff";
                                }}
                                onMouseLeave={(e) => {
                                  (
                                    e.currentTarget as HTMLDivElement
                                  ).style.background = "#f5f7ff";
                                }}
                              >
                                <span style={{ fontSize: 14, lineHeight: 1 }}>
                                  +
                                </span>
                                <span>Add…</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {/* Standalone custom reference cell. */}
                    {!speciesGroups.some((g) => g.isCustomGroup) && (
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            marginBottom: 8,
                          }}
                        >
                          <div
                            style={{
                              flexShrink: 0,
                              width: 34,
                              height: 34,
                              borderRadius: 6,
                              background: "#e8eef9",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#3867d6",
                                letterSpacing: "-0.5px",
                                userSelect: "none",
                              }}
                            >
                              CR
                            </span>
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: 12,
                                color: "#111",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              Custom Reference
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: "transparent",
                                userSelect: "none",
                                marginTop: 2,
                              }}
                            >
                              &nbsp;
                            </div>
                          </div>
                        </div>
                        <div
                          onClick={() => {
                            rendererRef.current?.importCustomReference();
                            setOpen(false);
                            setQuery("");
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                            padding: "4px 8px",
                            borderRadius: 5,
                            border: "1.5px dashed #3867d6",
                            background: "#f5f7ff",
                            color: "#3867d6",
                            fontWeight: 600,
                            fontSize: 12,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                          onMouseEnter={(e) => {
                            (
                              e.currentTarget as HTMLDivElement
                            ).style.background = "#eef2ff";
                          }}
                          onMouseLeave={(e) => {
                            (
                              e.currentTarget as HTMLDivElement
                            ).style.background = "#f5f7ff";
                          }}
                        >
                          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
                          <span>Add…</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      maxHeight: 300,
                      overflowY: "auto",
                    }}
                  >
                    {visible.map(({ ref, i }) => {
                      const isActive = i === activeIdx;
                      const label = ref.assembly.name;
                      const alias = ref.assembly.build ?? "";
                      const sub = ref.species
                        ? [
                            ref.species.label,
                            ref.species.name ? `(${ref.species.name})` : "",
                          ]
                            .filter(Boolean)
                            .join(" ")
                        : (ref.assembly.version ?? "");
                      return (
                        <div
                          key={label}
                          onClick={() => loadRef(i)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 6,
                            padding: "5px 10px",
                            paddingRight: ref.curated ? 8 : 10,
                            cursor: "pointer",
                            background: isActive ? "#eef2ff" : "#fff",
                            borderLeft: isActive
                              ? "3px solid #3867d6"
                              : "3px solid transparent",
                            borderBottom: "1px solid #f0f0f0",
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive)
                              (
                                e.currentTarget as HTMLDivElement
                              ).style.background = "#f7f7f7";
                          }}
                          onMouseLeave={(e) => {
                            (
                              e.currentTarget as HTMLDivElement
                            ).style.background = isActive ? "#eef2ff" : "#fff";
                          }}
                        >
                          <div
                            style={{
                              flexShrink: 0,
                              width: 32,
                              height: 32,
                              borderRadius: 4,
                              overflow: "hidden",
                              background: "#f0f0f0",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {ref.species?.icon ? (
                              <img
                                src={ref.species.icon}
                                alt=""
                                style={{
                                  width: 32,
                                  height: 32,
                                  objectFit: "contain",
                                  display: "block",
                                  opacity: 0.8,
                                }}
                              />
                            ) : (
                              <span
                                style={{
                                  fontSize: 10,
                                  color: "#aaa",
                                  lineHeight: 1,
                                  userSelect: "none",
                                }}
                              >
                                {label[0]}
                              </span>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: 600,
                                  fontSize: 12,
                                  color: isActive ? "#3867d6" : "#222",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {label}
                              </span>
                              {alias && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: "#9aa0a6",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {alias}
                                </span>
                              )}
                            </div>
                            {sub && (
                              <div
                                style={{
                                  fontSize: 10,
                                  color: "#aaa",
                                  marginTop: 1,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {sub}
                              </div>
                            )}
                          </div>
                          {ref.curated && (
                            <ActionTooltip title="Featured reference">
                              <span
                                style={{
                                  flexShrink: 0,
                                  fontSize: 14,
                                  lineHeight: 1,
                                  color: "#3867d6",
                                  pointerEvents: "none",
                                }}
                              >
                                ★
                              </span>
                            </ActionTooltip>
                          )}
                        </div>
                      );
                    })}
                    {/* Custom reference. */}
                    <div
                      onClick={() => {
                        rendererRef.current?.importCustomReference();
                        setOpen(false);
                        setQuery("");
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        cursor: "pointer",
                        background: "#fff",
                        borderLeft: "3px solid transparent",
                        borderBottom: "1px solid #f0f0f0",
                        color: "#3867d6",
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background =
                          "#f5f7ff";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background =
                          "#fff";
                      }}
                    >
                      <div
                        style={{
                          flexShrink: 0,
                          width: 32,
                          height: 32,
                          borderRadius: 4,
                          border: "1.5px dashed #3867d6",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#3867d6",
                          fontSize: 18,
                          lineHeight: 1,
                        }}
                      >
                        +
                      </div>
                      <span>Custom reference…</span>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </Box>
  );
}
