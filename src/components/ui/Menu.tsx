import type { ReactNode } from "react";

export function MenuItem({
  onClick,
  children,
  active,
}: {
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "5px 14px",
        cursor: "pointer",
        fontSize: 12,
        background: active ? "#e8f0fe" : "transparent",
        color: active ? "#3867d6" : "#333",
        userSelect: "none",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLDivElement).style.background = active
          ? "#d0e0ff"
          : "#f5f5f5")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLDivElement).style.background = active
          ? "#e8f0fe"
          : "transparent")
      }
    >
      {children}
    </div>
  );
}

export function MenuDivider() {
  return <div style={{ height: 1, background: "#eee", margin: "4px 0" }} />;
}
