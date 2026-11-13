export type WheelMode = "zoom" | "scroll";
export type WheelAction = WheelMode | "subchannel";

/** Ctrl/Cmd temporarily chooses the other action; Alt retains lane scrolling. */
export function resolveWheelAction(
  mode: WheelMode,
  event: Pick<WheelEvent, "ctrlKey" | "metaKey" | "altKey">,
): WheelAction {
  if (event.altKey) return "subchannel";
  if (event.ctrlKey || event.metaKey)
    return mode === "zoom" ? "scroll" : "zoom";
  return mode;
}

export function wheelModeDescription(mode: WheelMode): string {
  return mode === "zoom"
    ? "Wheel: zoom · Ctrl + wheel: scroll channels · Click to swap"
    : "Wheel: scroll channels · Ctrl + wheel: zoom · Click to swap";
}
