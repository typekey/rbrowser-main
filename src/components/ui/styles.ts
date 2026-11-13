import type React from "react";

export const btnBase: React.CSSProperties = {
  padding: "3px 8px",
  fontSize: "11px",
  border: "1px solid #bbb",
  borderRadius: "3px",
  cursor: "pointer",
  background: "#fff",
  lineHeight: 1.4,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

export const btnActive: React.CSSProperties = {
  ...btnBase,
  background: "#4a90d9",
  color: "#fff",
  borderColor: "#4a90d9",
};

// MUI icon button shared sx for header
export const headerIconBtnSx = {
  p: "5px",
  color: "#666",
  "&:hover": { bgcolor: "#f0f0f0" },
} as const;

export const headerIconBtnActiveSx = {
  ...headerIconBtnSx,
  color: "#3867d6",
} as const;

// Preset colour palette for highlight colour picker
export const PRESET_COLORS = [
  "#3867d6",
  "#e55039",
  "#27ae60",
  "#f39c12",
  "#8e44ad",
  "#1abc9c",
  "#e74c3c",
  "#fd9644",
];
