import { useRef } from "react";
import { TranscriptBrowserRenderer } from "@/renderer/transcript-renderer";
import { defaultConfig } from "../../../config/default_config";

// Build the native file picker accept attribute from defaultConfig.supportFiles
// so it stays in sync with drag-drop / remote-URL validation.
const FILE_ACCEPT_ATTR = Array.from(
  new Set(defaultConfig.supportFiles.map((s) => "." + s.toLowerCase())),
).join(",");

export function AddChannelPanel({
  rendererRef,
}: {
  rendererRef: React.RefObject<TranscriptBrowserRenderer | null>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const panelStyle: React.CSSProperties = {
    padding: "8px 6px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  };

  return (
    <div style={panelStyle}>
      {/* Local file import */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={FILE_ACCEPT_ATTR}
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) {
            rendererRef.current?.importLocalFiles(files);
          }
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        style={{
          fontSize: 11,
          padding: "4px 8px",
          border: "1px dashed #3867d6",
          background: "#f0f4ff",
          color: "#3867d6",
          borderRadius: 3,
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        📁 Local file(s)
      </button>

      {/* Remote URL import */}
      <button
        onClick={() => rendererRef.current?.importRemoteUrl()}
        style={{
          fontSize: 11,
          padding: "4px 8px",
          border: "1px dashed #3867d6",
          background: "#f0f4ff",
          color: "#3867d6",
          borderRadius: 3,
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        🌐 Remote URL
      </button>
    </div>
  );
}
