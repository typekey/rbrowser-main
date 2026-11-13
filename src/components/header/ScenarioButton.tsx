import { ActionTooltip } from "../ui/ActionTooltip";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

export interface ScenarioButtonProps {
  onClick: () => void;
}

export function ScenarioButton({ onClick }: ScenarioButtonProps) {
  return (
    <ActionTooltip title="Open Scenario panel" arrow>
      <button
        onClick={onClick}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background:
            "linear-gradient(135deg, rgb(102, 126, 234) 0%, rgb(118, 75, 162) 100%)",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          padding: "2px 10px",
          fontSize: 14,
          fontWeight: 600,
          minHeight: 28,
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        <AutoAwesomeIcon sx={{ fontSize: 16 }} />
        Scenario
      </button>
    </ActionTooltip>
  );
}
