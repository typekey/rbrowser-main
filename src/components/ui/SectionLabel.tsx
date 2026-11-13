import type { ReactNode } from "react";

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{ fontWeight: 600, marginBottom: 4, color: "#555", fontSize: 11 }}
    >
      {children}
    </div>
  );
}
