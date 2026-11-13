// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChannelLabel } from "../../channel/components/channel-label";
import type { ChannelView } from "../../channel";
vi.mock("../../channel/components/channel-selector", () => ({
  ChannelSelector: { _selectedChannels: new Set() },
}));
afterEach(() => {
  window.dispatchEvent(new Event("blur"));
  document.body.replaceChildren();
});
function track(
  parent: HTMLElement,
  top: number,
  height: number,
  pinned = false,
  name = "Track",
) {
  const el = document.createElement("div");
  el.className = "track-container";
  el.dataset.pinned = String(pinned);
  el.dataset.channelName = name;
  el.getBoundingClientRect = () => ({
    top,
    bottom: top + height,
    height,
    left: 20,
    right: 820,
    width: 800,
    x: 20,
    y: top,
    toJSON() {},
  });
  parent.appendChild(el);
  return el;
}
function setup(
  pins = [true, false, false],
  from = 0,
  tops?: number[],
  subChannel = false,
) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const tracks = pins.map((pin, i) =>
    track(
      parent,
      tops?.[i] ?? 100 + i * 100,
      100,
      pin,
      ["A", "B", "C", "D"][i],
    ),
  );
  const reorder = vi.fn();
  const view = {
    trackContainer: tracks[from],
    channelLabelConfig: {},
    config: { name: tracks[from].dataset.channelName, plot: "rect" },
    _stackedChannels: [],
    _isSubChannel: subChannel,
    isPinned: pins[from],
    onReorderCallback: reorder,
  } as unknown as ChannelView;
  const label = new ChannelLabel(view);
  label.createChannelLabel();
  tracks[from].querySelector("svg")!.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      clientX: 40,
      clientY: (tops?.[from] ?? 100 + from * 100) + 5,
    }),
  );
  return { reorder, label, tracks, view };
}
function pointer(type: string, y: number, x = 100) {
  document.dispatchEvent(
    new MouseEvent(type, { bubbles: true, clientY: y, clientX: x, button: 0 }),
  );
}
const indicator = () =>
  document.querySelector<HTMLElement>(".channel-drop-indicator");
const tooltip = () =>
  document.querySelector<HTMLElement>(".channel-drag-tooltip");
describe("channel drag feedback and pin transitions", () => {
  it("ignores scrolled rows hidden behind pinned channels when targeting pinned slots", () => {
    const { reorder } = setup(
      [true, true, false, false],
      3,
      [100, 200, 150, 300],
    );
    pointer("mousemove", 210);
    expect(tooltip()?.textContent).toBe(
      "Before B · Pin on drop · Release to move",
    );
    pointer("mouseup", 210);
    expect(reorder).toHaveBeenCalledExactlyOnceWith(3, 1, true);
  });
  it("reorders sub-channels without changing pin status", () => {
    const { reorder } = setup([false, false, false], 0, undefined, true);
    pointer("mousemove", 380);
    expect(tooltip()?.textContent).toBe("After C · Release to move");
    pointer("mouseup", 380);
    expect(reorder).toHaveBeenCalledExactlyOnceWith(0, 2);
  });
  it.each([
    {
      pins: [true, false, false],
      from: 0,
      to: 2,
      y: 380,
      pinned: false,
      hint: "Unpin on drop",
      top: 300,
    },
    {
      pins: [true, false, false],
      from: 2,
      to: 0,
      y: 110,
      pinned: true,
      hint: "Pin on drop",
      top: 100,
    },
    {
      pins: [true, true, false],
      from: 0,
      to: 1,
      y: 270,
      pinned: true,
      hint: "Keep pinned",
      top: 200,
    },
    {
      pins: [true, true, false],
      from: 1,
      to: 1,
      y: 310,
      pinned: false,
      hint: "Unpin on drop",
      top: 200,
    },
    {
      pins: [true, true, false],
      from: 2,
      to: 1,
      y: 210,
      pinned: true,
      hint: "Pin on drop",
      top: 200,
    },
    {
      pins: [true, false, false],
      from: 1,
      to: 2,
      y: 380,
      pinned: false,
      hint: "Keep unpinned",
      top: 300,
    },
  ])(
    "previews and commits $from -> $to ($hint)",
    ({ pins, from, to, y, pinned, hint, top }) => {
      const { reorder } = setup(pins, from);
      pointer("mousemove", y);
      expect(indicator()?.style.top).toBe(`${top}px`);
      expect(indicator()?.style.width).toBe("800px");
      expect(indicator()?.style.background).toBe("rgb(37, 99, 235)");
      expect(indicator()?.style.pointerEvents).toBe("none");
      expect(tooltip()?.textContent).toContain(`· ${hint} · Release to move`);
      expect(reorder).not.toHaveBeenCalled();
      pointer("mouseup", y);
      expect(reorder).toHaveBeenCalledExactlyOnceWith(from, to, pinned);
      expect(indicator()).toBeNull();
      expect(tooltip()).toBeNull();
    },
  );
  it("follows the mouse on both axes", () => {
    setup();
    pointer("mousemove", 260, 300);
    expect(tooltip()?.style.left).toBe("314px");
    expect(tooltip()?.style.top).toBe("278px");
    pointer("mousemove", 270, 400);
    expect(tooltip()?.style.left).toBe("414px");
    expect(tooltip()?.style.top).toBe("288px");
  });
  it.each(["Escape", "blur", "destroy", "wheel"])(
    "cleans up without committing on %s",
    (action) => {
      const { label, reorder } = setup();
      pointer("mousemove", 380);
      if (action === "Escape")
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      else if (action === "destroy") label.destroy();
      else if (action === "wheel")
        document.dispatchEvent(new WheelEvent("wheel"));
      else window.dispatchEvent(new Event("blur"));
      expect(indicator()).toBeNull();
      expect(tooltip()).toBeNull();
      expect(document.body.style.cursor).toBe("");
      pointer("mouseup", 380);
      expect(reorder).not.toHaveBeenCalled();
    },
  );
});
