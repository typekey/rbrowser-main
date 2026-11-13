// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelLabel } from "../../channel/components/channel-label";
import { isChannelControlTarget } from "../../channel/components/channel-control-hints";
import type { ChannelView } from "../../channel";
vi.mock("../../channel/components/channel-selector", () => ({
  ChannelSelector: { _selectedChannels: new Set() },
}));
let component: ChannelLabel;
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  component?.destroy();
  document.body.replaceChildren();
  vi.useRealTimers();
});
function setup(pinned = true) {
  const container = document.createElement("div");
  const track = document.createElement("div");
  track.className = "track-container";
  document.body.appendChild(container);
  container.appendChild(track);
  const view = {
    trackContainer: track,
    channelLabelConfig: {},
    config: { name: "Sequence", plot: "sequence" },
    isPinned: pinned,
    canExpand: true,
    _isExpanded: true,
    _stackedChannels: [],
    onReorderCallback: vi.fn(),
    menu: { handleMenuAction: vi.fn(), showChannelMenu: vi.fn() },
    toggleExpand: vi.fn(),
    toggleComplementStrand: vi.fn(),
  } as unknown as ChannelView;
  component = new ChannelLabel(view);
  component.createChannelLabel();
  return { view, track };
}
const control = (name: string) =>
  document.querySelector<SVGElement>(`[data-channel-action="${name}"]`)!;
const hint = () =>
  document.querySelector<HTMLElement>(".channel-control-tooltip");
function hover(icon: SVGElement) {
  icon.dispatchEvent(
    new MouseEvent("mouseenter", { clientX: 100, clientY: 100 }),
  );
  vi.advanceTimersByTime(200);
}
describe("channel icon controls", () => {
  it("uses the Lucide sliders icon and places the pin immediately before settings", () => {
    setup();
    const settings = control("settings");
    expect(settings.classList.contains("lucide-sliders-horizontal")).toBe(true);
    expect(settings.getAttribute("stroke-width")).toBe("2");
    expect(settings.querySelectorAll("path")).toHaveLength(9);
    expect(settings.previousElementSibling).toBe(control("unpin"));
    expect(control("unpin").classList.contains("lucide-pin")).toBe(true);
    expect(document.querySelectorAll("svg title")).toHaveLength(0);
  });
  it("opens channel settings through the existing menu", () => {
    const { view } = setup();
    control("settings").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(view.menu.showChannelMenu).toHaveBeenCalledExactlyOnceWith(
      control("settings"),
    );
  });
  it("provides a direct unpin action and hides the pin for unpinned channels", () => {
    const { view } = setup();
    control("unpin").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(view.menu.handleMenuAction).toHaveBeenCalledExactlyOnceWith(
      "togglePin",
    );
    view.isPinned = false;
    component.createChannelLabel();
    expect(document.querySelector(".channel-pin-button")).toBeNull();
  });
  it.each([
    ["drag", "Drag to move · Cross pinned area to pin or unpin"],
    ["settings", "Channel settings"],
    ["unpin", "Unpin channel"],
    ["expand", "Collapse sub-channels"],
    ["splitter", "Split channel into groups"],
    ["filter", "Filter sub-channels"],
    ["complement", "Show complement strand"],
  ])("shows the shared dark operation hint for %s", (action, message) => {
    setup();
    hover(control(action));
    expect(hint()?.textContent).toBe(message);
    expect(hint()?.style.background).toBe("rgba(36, 42, 51, 0.92)");
    expect(hint()?.style.pointerEvents).toBe("none");
    control(action).dispatchEvent(new MouseEvent("mouseleave"));
    expect(hint()).toBeNull();
  });
  it("replaces hover guidance with live drag feedback and cleans up on destroy", () => {
    setup();
    const drag = control("drag");
    hover(drag);
    expect(hint()).not.toBeNull();
    drag.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        clientX: 100,
        clientY: 100,
      }),
    );
    expect(hint()).toBeNull();
    expect(document.querySelector(".channel-drag-tooltip")).not.toBeNull();
    component.destroy();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });
  it("cancels a pending tooltip when a label is rebuilt", () => {
    setup();
    control("settings").dispatchEvent(new MouseEvent("mouseenter"));
    component.createChannelLabel();
    vi.advanceTimersByTime(1000);
    expect(hint()).toBeNull();
  });
  it("supports focus hints and keyboard activation", () => {
    const { view } = setup();
    const settings = control("settings");
    settings.dispatchEvent(new FocusEvent("focus"));
    vi.advanceTimersByTime(200);
    expect(hint()?.textContent).toBe("Channel settings");
    settings.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(view.menu.showChannelMenu).toHaveBeenCalledOnce();
    expect(hint()).toBeNull();
  });
  it("recognises nested icon targets on newly added controls and excludes plot content", () => {
    const { track } = setup(false);
    expect(
      isChannelControlTarget(control("settings").querySelector("path")),
    ).toBe(true);
    expect(
      isChannelControlTarget(document.querySelector(".channel-label-el")),
    ).toBe(true);
    expect(isChannelControlTarget(track)).toBe(false);
    expect(isChannelControlTarget(null)).toBe(false);
  });
});
