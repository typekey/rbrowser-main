import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import MuiIconButton from "@mui/material/IconButton";
import { ActionTooltip } from "./ActionTooltip";
import { headerIconBtnSx } from "./styles";

export function Popover({
  label,
  children,
  align = "left",
  style,
  buttonSx,
  title,
}: {
  label: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  style?: React.CSSProperties;
  buttonSx?: Record<string, unknown>;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{
    top: number;
    left?: number;
    right?: number;
  }>({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      if (align === "right") {
        setPanelPos({ top: r.bottom + 3, right: window.innerWidth - r.right });
      } else {
        setPanelPos({ top: r.bottom + 3, left: r.left });
      }
    }
    setOpen((v) => !v);
  };

  // ── Boundary clamping: measure panel after render and adjust ──
  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;
    const rect = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 4; // px from viewport edge

    let { top } = panelPos;
    let left = panelPos.left;
    let right = panelPos.right;

    // Vertical: if panel overflows bottom, try placing above button
    if (rect.bottom > vh - margin) {
      if (btnRef.current) {
        const btnRect = btnRef.current.getBoundingClientRect();
        const above = btnRect.top - 3 - rect.height;
        if (above >= margin) {
          top = above;
        } else {
          // Neither fits — clamp to viewport bottom
          top = vh - rect.height - margin;
        }
      } else {
        top = vh - rect.height - margin;
      }
    }
    if (top < margin) top = margin;

    // Horizontal clamping
    if (align === "right") {
      // right-aligned: ensure left edge doesn't go off-screen
      if (right !== undefined && vw - right - rect.width < margin) {
        right = vw - rect.width - margin;
        if (right < margin) right = margin;
      }
    } else {
      // left-aligned: ensure right edge doesn't go off-screen
      if (left !== undefined && left + rect.width > vw - margin) {
        left = vw - rect.width - margin;
        if (left < margin) left = margin;
      }
    }

    // Only update if something changed to avoid infinite loop
    if (
      top !== panelPos.top ||
      left !== panelPos.left ||
      right !== panelPos.right
    ) {
      setPanelPos({ top, left, right });
    }
  }, [open, panelPos, align]);

  // ── Close on outside click ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !panelRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Close on window resize to avoid mis-positioned panel ──
  useEffect(() => {
    if (!open) return;
    const onResize = () => setOpen(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  return (
    <div style={{ position: "relative", flexShrink: 0, ...style }}>
      <ActionTooltip
        title={!open && title ? title : ""}
        arrow
        disableInteractive
      >
        <MuiIconButton
          ref={btnRef}
          onClick={toggle}
          sx={{ ...headerIconBtnSx, ...buttonSx }}
        >
          {label}
        </MuiIconButton>
      </ActionTooltip>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: panelPos.top,
              ...(align === "right"
                ? { right: panelPos.right }
                : { left: panelPos.left }),
              zIndex: 9999,
              background: "#fff",
              border: "1px solid #ddd",
              borderRadius: 4,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              padding: "6px 0",
              minWidth: 160,
              maxHeight: "calc(100vh - 16px)",
              overflowY: "auto" as const,
              fontSize: 12,
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}
