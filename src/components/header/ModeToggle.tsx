import Box from "@mui/material/Box";
import Select from "@mui/material/Select";
import MuiMenuItem from "@mui/material/MenuItem";
import Chip from "@mui/material/Chip";

export type ViewMode = "dna" | "rna" | "cds";

export interface ModeToggleProps {
  /** Current view mode. */
  viewMode: ViewMode;
  /** Switch to a different view mode. */
  onSwitchMode: (mode: ViewMode) => void;
}

const MODES: {
  key: ViewMode;
  label: string;
  desc: string;
  letter: string;
  color: string;
}[] = [
  {
    key: "rna",
    label: "RNA Mode",
    desc: "Transcript-centered coordinates",
    letter: "R",
    color: "#00b894",
  },
  {
    key: "dna",
    label: "DNA Mode",
    desc: "Traditional genomic coordinates",
    letter: "D",
    color: "#3867d6",
  },
  {
    key: "cds",
    label: "CDS Mode",
    desc: "Coding sequence coordinates",
    letter: "C",
    color: "#f58518",
  },
];

/** MUI Select that switches between DNA / RNA / CDS coordinate modes. */
export function ModeToggle({ viewMode, onSwitchMode }: ModeToggleProps) {
  return (
    <Select
      value={viewMode}
      onChange={(e) => {
        const target = e.target.value as ViewMode;
        if (target !== viewMode) onSwitchMode(target);
      }}
      renderValue={(selected) => {
        const m = MODES.find((md) => md.key === selected);
        const c = m?.color ?? "#3867d6";
        return (
          <Chip
            label={m?.label ?? "DNA Mode"}
            variant="outlined"
            size="small"
            sx={{
              borderColor: c,
              color: c,
              fontWeight: 600,
              fontSize: "0.8rem",
              borderRadius: "4px",
              height: 24,
            }}
          />
        );
      }}
      variant="standard"
      disableUnderline
      sx={{
        minWidth: 40,
        bgcolor: "transparent",
        "& .MuiSelect-select": {
          p: "2px 4px",
          pr: "4px !important",
          minHeight: "24px !important",
          display: "flex",
          alignItems: "center",
        },
        "& .MuiSelect-icon": { display: "none" },
      }}
      MenuProps={{
        PaperProps: {
          sx: {
            mt: 0.5,
            borderRadius: 1,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            minWidth: 180,
            "& .MuiList-root": { py: 0.5 },
          },
        },
      }}
    >
      {MODES.map((m) => (
        <MuiMenuItem
          key={m.key}
          value={m.key}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            py: 0.5,
            px: 1.5,
            minHeight: "36px !important",
            "&.Mui-selected": { bgcolor: "#f0f7ff" },
            "&.Mui-selected:hover": { bgcolor: "#e0edff" },
          }}
        >
          <Box>
            <Box sx={{ fontWeight: 600, fontSize: 12, color: "#333" }}>
              {m.label}
            </Box>
            <Box sx={{ fontSize: 10, color: "#999", lineHeight: 1.2 }}>
              {m.desc}
            </Box>
          </Box>
          <Chip
            label={m.letter}
            variant="outlined"
            size="small"
            sx={{
              borderColor: m.color,
              color: m.color,
              fontWeight: 700,
              fontSize: 12,
              width: 24,
              height: 24,
              borderRadius: "4px",
              "& .MuiChip-label": { px: 0 },
            }}
          />
        </MuiMenuItem>
      ))}
    </Select>
  );
}
