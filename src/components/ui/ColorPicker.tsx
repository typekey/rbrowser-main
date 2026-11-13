import { ActionTooltip } from "./ActionTooltip";
import { PRESET_COLORS } from "./styles";

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
      {PRESET_COLORS.map((c) => (
        <ActionTooltip key={c} title={c}>
          <span
            onClick={() => onChange(c)}
            style={{
              width: 13,
              height: 13,
              background: c,
              borderRadius: 2,
              cursor: "pointer",
              border:
                value === c ? "2px solid #222" : "1px solid rgba(0,0,0,0.2)",
              boxSizing: "border-box",
            }}
          />
        </ActionTooltip>
      ))}
      <ActionTooltip title="Custom colour">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}

          style={{
            width: 13,
            height: 13,
            padding: 0,
            border: "none",
            cursor: "pointer",
            verticalAlign: "top",
          }}
        />
      </ActionTooltip>
    </div>
  );
}
