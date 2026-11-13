import { ActionTooltip } from "./ActionTooltip";
import type { ViewMode } from "@/renderer/transcript-renderer/config/config";

const MODE_BADGE_STYLE: Record<
  ViewMode,
  { letter: string; background: string }
> = {
  rna: { letter: "R", background: "#00b894" },
  dna: { letter: "D", background: "#3867d6" },
  cds: { letter: "C", background: "#f58518" },
};

export interface ModeBadgeProps {
  mode: ViewMode;
  /** Outer pixel size of the badge (square). Defaults to 16. */
  size?: number;
  /** Optional right margin in px. Defaults to 6. */
  marginRight?: number;
}

export function ModeBadge({
  mode,
  size = 16,
  marginRight = 6,
}: ModeBadgeProps) {
  const config = MODE_BADGE_STYLE[mode];
  return (
    <ActionTooltip title={mode.toUpperCase()}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          borderRadius: 4,
          background: config.background,
          color: "#fff",
          fontSize: Math.round(size * 0.7),
          fontWeight: 800,
          fontFamily: "ui-monospace, Menlo, monospace",
          lineHeight: 1,
          flexShrink: 0,
          marginRight,
          letterSpacing: 0,
        }}
      >
        {config.letter}
      </span>
    </ActionTooltip>
  );
}
