import { ActionTooltip } from "../ui/ActionTooltip";
import { type ITrans } from "@/renderer/transcript-renderer/reference/reference-manager";
import { TRANS_TYPE_META } from "./transTypeMeta";

export interface TranscriptAutocompleteDropdownProps {
  suggestions: ITrans[];
  isSearching: boolean;
  show: boolean;
  dropdownRef: React.Ref<HTMLDivElement>;
  onSelect: (suggestion: ITrans) => void;
}

/**
 * Autocomplete dropdown for transcript / gene search.
 */
export function TranscriptAutocompleteDropdown({
  suggestions,
  isSearching,
  show,
  dropdownRef,
  onSelect,
}: TranscriptAutocompleteDropdownProps) {
  if (!show || (!isSearching && suggestions.length === 0)) return null;

  const genes = suggestions.filter((s) => s.level === "gene");
  const transcripts = suggestions.filter((s) => s.level === "transcript");

  const renderRow = (s: ITrans) => {
    const meta = TRANS_TYPE_META[s.trans_type] ?? {
      color: "#888",
      label: s.trans_type.slice(0, 2).toUpperCase(),
    };
    return (
      <div
        key={`${s.level}:${s.trans_id}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          paddingTop: 4,
          paddingBottom: 4,
          paddingLeft: 16,
          paddingRight: 5,
          cursor: "pointer",
          userSelect: "none",
          transition: "background-color 150ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background =
            "rgba(0, 0, 0, 0.04)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background = "transparent")
        }
        onMouseDown={(e) => {
          e.preventDefault();
          onSelect(s);
        }}
      >
        <ActionTooltip
          title={s.trans_type || ""}
          arrow
          placement="top"
          disableInteractive
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 24,
              height: 24,
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 700,
              color: "#fff",
              background: meta.color,
              flexShrink: 0,
              letterSpacing: 0.3,
              cursor: "default",
            }}
          >
            {meta.label}
          </span>
        </ActionTooltip>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            flexGrow: 1,
            lineHeight: 1.2,
          }}
        >
          <span
            style={{
              display: "block",
              margin: 0,
              fontWeight: 400,
              lineHeight: 1.43,
              letterSpacing: "0.01071em",
              fontSize: 13,
              color: "rgba(0, 0, 0, 0.87)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {s.trans_name}
          </span>
          {s.trans_id && s.trans_id !== s.trans_name && (
            <span
              style={{
                display: "block",
                margin: 0,
                fontWeight: 400,
                lineHeight: 1.43,
                letterSpacing: "0.01071em",
                color: "rgba(0, 0, 0, 0.38)",
                fontSize: 9,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {s.trans_id.replace(/\.\d+$/, "")}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={dropdownRef}
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        width: "100%",
        minWidth: 340,
        zIndex: 10000,
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: 6,
        boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
        marginTop: 2,
        maxHeight: 320,
        overflowY: "auto",
        fontFamily: "Roboto, Helvetica, Arial, sans-serif",
        fontSize: 12,
        paddingTop: 4,
        paddingBottom: 4,
      }}
    >
      {isSearching && (
        <div
          style={{
            position: "sticky",
            top: -4,
            left: 0,
            height: 2,
            width: "100%",
            overflow: "hidden",
            background: "rgba(63, 81, 181, 0.12)",
            marginBottom: 2,
          }}
        >
          <div
            style={{
              height: "100%",
              width: "40%",
              background:
                "linear-gradient(90deg, transparent, #3f51b5, transparent)",
              animation: "rbrowser-trans-breathing 1.2s ease-in-out infinite",
            }}
          />
        </div>
      )}
      <style>{`@keyframes rbrowser-trans-breathing {
        0%   { transform: translateX(-100%); }
        50%  { transform: translateX(150%); }
        100% { transform: translateX(150%); }
      }`}</style>
      {genes.map(renderRow)}
      {genes.length > 0 && transcripts.length > 0 && (
        <div
          role="separator"
          style={{
            height: 1,
            margin: "4px 12px",
            background: "rgba(0, 0, 0, 0.08)",
          }}
        />
      )}
      {transcripts.map(renderRow)}
      {!isSearching && suggestions.length === 0 && (
        <div
          style={{
            padding: "8px 16px",
            color: "rgba(0, 0, 0, 0.38)",
            fontSize: 12,
          }}
        >
          No results
        </div>
      )}
    </div>
  );
}
