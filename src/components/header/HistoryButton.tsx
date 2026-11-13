import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import { Popover, MenuItem, MenuDivider, ModeBadge } from "../ui";
import type { ILocus } from "@/renderer/transcript-renderer/config/config";
import {
  locusKey,
  locusToRegionString,
} from "@/renderer/transcript-renderer/locus/locus-key";

export interface HistoryButtonProps {
  // Recent navigation history — full ILocus snapshots (mode + identity).
  histItems: ILocus[];
  // Current locus (active navigation point).
  currentLocus: ILocus | null;
  // Navigate to a history entry.
  onNavigateLocus: (locus: ILocus) => void;
  // Clear the entire navigation history.
  onClearHistory: () => void;
}

/** Header toolbar popover listing recent navigation history. */
export function HistoryButton({
  histItems,
  currentLocus,
  onNavigateLocus,
  onClearHistory,
}: HistoryButtonProps) {
  const activeKey = currentLocus ? locusKey(currentLocus) : "";
  const activeAssembly =
    currentLocus?.dna.assembly || currentLocus?.rna.assembly || "";
  const visibleItems = activeAssembly
    ? histItems.filter(
        (item) => (item.dna.assembly || item.rna.assembly) === activeAssembly,
      )
    : histItems;
  return (
    <Popover
      label={<HistoryOutlinedIcon sx={{ fontSize: 20 }} />}
      title="History"
      align="left"
    >
      {visibleItems.length === 0 ? (
        <div style={{ padding: "6px 14px", color: "#aaa", fontSize: 11 }}>
          {activeAssembly && histItems.length > 0
            ? `No history on ${activeAssembly} yet`
            : "No history yet"}
        </div>
      ) : (
        visibleItems.slice(0, 5).map((item) => {
          const display = locusToRegionString(item);
          return (
            <MenuItem
              key={locusKey(item) + "|" + item.time}
              onClick={() => onNavigateLocus(item)}
              active={!!activeKey && activeKey === locusKey(item)}
            >
              <ModeBadge mode={item.mode} />
              {display || "—"}
            </MenuItem>
          );
        })
      )}
      {histItems.length > 0 && (
        <>
          <MenuDivider />
          <MenuItem onClick={onClearHistory}>
            <span style={{ color: "#e55039" }}>Clear history</span>
          </MenuItem>
        </>
      )}
    </Popover>
  );
}
