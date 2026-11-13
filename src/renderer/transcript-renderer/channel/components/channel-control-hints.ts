import { ACTION_TOOLTIP_STYLE } from "../../tooltip/action-tooltip-style";
/** Keep the original dark rounded styling for both icon and drag feedback. */
export function createChannelHint(className: string): HTMLDivElement {
  const tip = document.createElement("div");
  tip.className = className;
  tip.setAttribute("role", "tooltip");
  Object.assign(tip.style, ACTION_TOOLTIP_STYLE, {
    position: "fixed",
    maxWidth: "calc(100vw - 16px)",
    boxSizing: "border-box",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    pointerEvents: "none",
    zIndex: "9999999",
  });
  if (className === "channel-control-tooltip") {
    Object.assign(tip.style, {
      overflow: "visible",
    });
  }
  return tip;
}

/** Anchor the arrow to its icon even when the tooltip is viewport-clamped. */
export function positionChannelControlHint(
  tip: HTMLElement,
  icon: SVGElement,
): void {
  const source = icon.getBoundingClientRect();
  const bounds = tip.getBoundingClientRect();
  const center = source.left + source.width / 2;
  const left = Math.max(
    8,
    Math.min(center - bounds.width / 2, window.innerWidth - bounds.width - 8),
  );
  const below = source.bottom + 8 + bounds.height <= window.innerHeight - 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${below ? source.bottom + 8 : Math.max(8, source.top - bounds.height - 8)}px`;
  tip.dataset.placement = below ? "bottom" : "top";
  let arrow = tip.querySelector<HTMLElement>(".channel-tooltip-arrow");
  if (!arrow) {
    arrow = document.createElement("span");
    arrow.className = "channel-tooltip-arrow";
    arrow.setAttribute("aria-hidden", "true");
    tip.appendChild(arrow);
  }
  Object.assign(arrow.style, {
    position: "absolute",
    width: "10px",
    height: "10px",
    background: "inherit",
    transform: "rotate(45deg)",
    pointerEvents: "none",
    left: `${Math.max(8, Math.min(center - left, bounds.width - 8)) - 5}px`,
    top: below ? "-5px" : "",
    bottom: below ? "" : "-5px",
  });
}

export function positionChannelHint(
  tip: HTMLElement,
  x: number,
  y: number,
): void {
  const bounds = tip.getBoundingClientRect();
  tip.style.left = `${Math.max(8, Math.min(x + 14, window.innerWidth - bounds.width - 8))}px`;
  tip.style.top = `${y + 18 + bounds.height <= window.innerHeight - 8 ? y + 18 : Math.max(8, y - bounds.height - 12)}px`;
}

/** Event delegation also covers labels created after mount and sub-channels. */
export function isChannelControlTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest(
      ".channel-label-el, .add-channel-row, .channel-scrollbar-track, .channel-control",
    )
  );
}

export class ChannelControlHints {
  private static active: ChannelControlHints | null = null;
  private static nextId = 0;
  private tip: HTMLDivElement | null = null;
  private target: SVGElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cleanups: Array<() => void> = [];

  attach(icon: SVGElement, message: () => string): void {
    // Equal slots avoid baseline and shrink differences between SVG icons.
    Object.assign(icon.style, {
      width: "16px",
      height: "16px",
      display: "inline-flex",
      alignSelf: "center",
      verticalAlign: "middle",
      flex: "0 0 16px",
    });
    icon.removeAttribute("aria-hidden");
    icon.setAttribute("role", "button");
    icon.setAttribute("tabindex", "0");
    icon.setAttribute("focusable", "true");
    icon.setAttribute("aria-label", message());
    const enter = () => {
      if (document.querySelector(".channel-drag-tooltip")) return;
      ChannelControlHints.active?.hide();
      ChannelControlHints.active = this;
      this.timer = setTimeout(() => {
        this.timer = null;
        if (
          !icon.isConnected ||
          document.querySelector(".channel-drag-tooltip")
        )
          return;
        this.target = icon;
        this.tip = createChannelHint("channel-control-tooltip");
        this.tip.id = `channel-control-hint-${++ChannelControlHints.nextId}`;
        this.tip.textContent = message();
        icon.setAttribute("aria-label", message());
        icon.setAttribute("aria-describedby", this.tip.id);
        document.body.appendChild(this.tip);
        positionChannelControlHint(this.tip, icon);
      }, 200);
    };
    const move = () => {
      if (this.tip) positionChannelControlHint(this.tip, icon);
    };
    const hide = () => this.hide();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") this.hide();
      if (
        icon.dataset.channelAction !== "drag" &&
        (event.key === "Enter" || event.key === " ")
      ) {
        event.preventDefault();
        icon.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    };
    icon.addEventListener("mouseenter", enter);
    icon.addEventListener("focus", enter);
    icon.addEventListener("mousemove", move);
    icon.addEventListener("mouseleave", hide);
    icon.addEventListener("blur", hide);
    icon.addEventListener("mousedown", hide);
    icon.addEventListener("click", hide);
    icon.addEventListener("keydown", keydown);
    this.cleanups.push(() => {
      icon.removeEventListener("mouseenter", enter);
      icon.removeEventListener("focus", enter);
      icon.removeEventListener("mousemove", move);
      icon.removeEventListener("mouseleave", hide);
      icon.removeEventListener("blur", hide);
      icon.removeEventListener("mousedown", hide);
      icon.removeEventListener("click", hide);
      icon.removeEventListener("keydown", keydown);
    });
  }

  hide(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.tip?.remove();
    this.tip = null;
    this.target?.removeAttribute("aria-describedby");
    this.target = null;
    if (ChannelControlHints.active === this) ChannelControlHints.active = null;
  }

  destroy(): void {
    this.hide();
    this.cleanups.forEach((cleanup) => cleanup());
    this.cleanups = [];
  }
}

// Lucide (ISC): https://github.com/lucide-icons/lucide/tree/main/icons
export function lucideChannelIcon(
  name: "sliders-horizontal" | "pin",
): SVGSVGElement {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  }))
    icon.setAttribute(key, value);
  icon.classList.add("lucide", `lucide-${name}`);
  // Reduce the pin artwork by 25% while keeping its centred interaction slot.
  if (name === "pin") icon.setAttribute("viewBox", "-4 -5 32 32");
  const paths =
    name === "sliders-horizontal"
      ? [
          "M10 5H3",
          "M12 19H3",
          "M14 3v4",
          "M16 17v4",
          "M21 12h-9",
          "M21 19h-5",
          "M21 5h-7",
          "M8 10v4",
          "M8 12H3",
        ]
      : [
          "M12 17v5",
          "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z",
        ];
  for (const d of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    icon.appendChild(path);
  }
  return icon;
}
