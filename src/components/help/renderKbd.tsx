import type { ReactNode } from "react";

const kbdStyle: React.CSSProperties = {
  display: "inline-block",
  minWidth: 20,
  textAlign: "center",
  fontSize: 10,
  fontFamily: "system-ui, sans-serif",
  fontWeight: 600,
  lineHeight: "18px",
  padding: "0 5px",
  background: "#fafafa",
  border: "1px solid #ccc",
  borderBottom: "2px solid #bbb",
  borderRadius: 4,
  color: "#333",
  boxShadow: "0 1px 0 rgba(0,0,0,0.08)",
  whiteSpace: "nowrap",
};

export function renderKbd(shortcut: string): ReactNode {
  if (!shortcut) return null;
  const parts = shortcut
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && (
            <span style={{ color: "#bbb", fontSize: 9, margin: "0 1px" }}>
              +
            </span>
          )}
          <kbd style={kbdStyle}>{part}</kbd>
        </span>
      ))}
    </span>
  );
}
