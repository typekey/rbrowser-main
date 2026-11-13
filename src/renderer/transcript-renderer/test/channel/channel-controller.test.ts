// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChannelController } from "../../channel/manager/channel-controller";
import { ChannelView, type IChannel } from "../../channel";
import { LayoutView } from "../../core/view";
import { AddChannelView } from "../../channel/components/add-channel-view";
import { ModalDialog } from "../../dialog";
import { initChannelsConfig } from "../../channel/init/channel";
import type { BaseRenderer } from "../../core/base-renderer";

vi.mock("../../channel/index", () => ({
  ChannelView: class {
    static sortChannels(channels: IChannel[]) {
      return channels;
    }
    trackContainer = document.createElement("div");
    _expandGroupView = null;
    isExpanded = false;
    destroyed = false;
    constructor(
      public config: IChannel,
      actualConfig?: IChannel,
    ) {
      if (actualConfig) this.config = actualConfig;
      this.trackContainer.className = "track-container";
      this.isPinned = this.config.style?.pinned === true;
    }
    get isPinned() {
      return this.config.style?.pinned === true;
    }
    set isPinned(value: boolean) {
      this.config.style = { ...this.config.style, pinned: value };
      this.trackContainer.dataset.pinned = String(value);
    }
    getChannelConfig() {
      return this.config;
    }
    destroy() {
      this.destroyed = true;
      this.trackContainer.remove();
    }
  },
}));
vi.mock("../../dialog", () => ({ ModalDialog: { confirm: vi.fn() } }));
afterEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});
function setup(pins = [true, true, false]) {
  const rootView = new LayoutView();
  const views = pins.map(
    (pin, index) =>
      new (ChannelView as unknown as new (config: IChannel) => ChannelView)({
        name: String(index),
        plot: "rect",
        style: { pinned: pin },
      }),
  );
  const addChannelView = new AddChannelView();
  views.forEach((view) => {
    rootView.addChild(view);
    document.body.appendChild(view.trackContainer!);
  });
  rootView.addChild(addChannelView);
  const renderer = {
    rootView,
    addChannelView,
    config: { channels: views.map((view) => view.getChannelConfig()) },
    state: {},
    context: { canvas: null },
    requestRepaint: vi.fn(),
    _relayoutAndRepaint: vi.fn(),
  } as unknown as BaseRenderer;
  const controller = new ChannelController(renderer);
  controller.syncChannelOrder();
  return { controller, renderer, views };
}
describe("channel ordering and nonempty invariants", () => {
  it("manually unpins a channel and synchronises its persisted configuration", () => {
    const { controller, renderer, views } = setup();
    controller.handleChannelMenuAction(views[1], "togglePin");
    expect(views[1].isPinned).toBe(false);
    expect(renderer.config.channels[1].style?.pinned).toBe(false);
  });
  it("retains an explicit unpin of the final pinned channel across relayouts", () => {
    const { controller, renderer, views } = setup([true, false]);
    controller.handleChannelMenuAction(views[0], "togglePin");
    controller.syncChannelOrder();
    expect(
      renderer.config.channels.every((channel) => !channel.style?.pinned),
    ).toBe(true);
    controller.reorderChannels(1, 0, true);
    expect(renderer.config.channels[0].style?.pinned).toBe(true);
  });
  it("retains the first real channel on replaceAll([])", () => {
    const { controller, renderer } = setup();
    vi.spyOn(controller, "loadData").mockResolvedValue(undefined);
    controller.replaceAllChannels([]);
    expect(renderer.config.channels).toHaveLength(1);
    expect(renderer.config.channels[0].name).toBe("0");
    expect(renderer.config.channels[0].style?.pinned).toBe(true);
    expect(
      renderer.rootView.children[renderer.rootView.children.length - 1],
    ).toBe(renderer.addChannelView);
  });
  it("preserves the first channel when deleting every selected channel", async () => {
    const { controller, renderer, views } = setup();
    vi.mocked(ModalDialog.confirm).mockResolvedValueOnce({
      confirmed: true,
      checked: false,
    });
    controller.handleChannelMenuAction(views[0], "deleteChannels", {
      channels: views,
    });
    await vi.waitFor(() => expect(renderer.config.channels).toHaveLength(1));
    expect(renderer.config.channels[0].name).toBe("0");
    expect(renderer.config.channels[0].style?.pinned).toBe(true);
  });
  it.each([
    {
      from: 2,
      to: 0,
      pinned: true,
      names: ["2", "0", "1"],
      pins: [true, true, true],
    },
    {
      from: 0,
      to: 2,
      pinned: false,
      names: ["1", "2", "0"],
      pins: [true, false, false],
    },
    {
      from: 0,
      to: 1,
      pinned: true,
      names: ["1", "0", "2"],
      pins: [true, true, false],
    },
    {
      from: 1,
      to: 1,
      pinned: false,
      names: ["0", "1", "2"],
      pins: [true, false, false],
    },
  ])(
    "commits position and pin state ($from -> $to)",
    ({ from, to, pinned, names, pins }) => {
      const { controller, renderer } = setup();
      controller.reorderChannels(from, to, pinned);
      expect(renderer.config.channels.map((channel) => channel.name)).toEqual(
        names,
      );
      expect(
        renderer.config.channels.map((channel) => channel.style?.pinned),
      ).toEqual(pins);
      expect(renderer.config.channels.map((channel) => channel.order)).toEqual([
        0, 1, 2,
      ]);
      expect(
        renderer.rootView.children[renderer.rootView.children.length - 1],
      ).toBe(renderer.addChannelView);
      const channelViews = renderer.rootView.children.filter(
        (view) => view instanceof ChannelView,
      ) as ChannelView[];
      expect(Array.from(document.querySelectorAll(".track-container"))).toEqual(
        channelViews.map((view) => view.trackContainer),
      );
    },
  );
  it("pins the new top channel when the only pinned channel moves away", () => {
    const { controller, renderer } = setup([true, false, false]);
    controller.reorderChannels(0, 2, false);
    expect(renderer.config.channels.map((channel) => channel.name)).toEqual([
      "1",
      "2",
      "0",
    ]);
    expect(
      renderer.config.channels.map((channel) => channel.style?.pinned),
    ).toEqual([true, false, false]);
  });
  it("retains and pins the final channel during repeated silent removal", async () => {
    const { controller, renderer } = setup([true, false, false]);
    expect(await controller.removeChannelByIndex(0, true)).toBe(true);
    expect(renderer.config.channels[0].style?.pinned).toBe(true);
    expect(await controller.removeChannelByIndex(0, true)).toBe(true);
    expect(await controller.removeChannelByIndex(0, true)).toBe(false);
    expect(renderer.config.channels).toHaveLength(1);
    expect(renderer.config.channels[0].style?.pinned).toBe(true);
  });
  it("rechecks channel identity and count after a confirmation awaits", async () => {
    const { controller, renderer } = setup([true, false]);
    let confirm!: (result: boolean) => void;
    const confirmed = new Promise<boolean>((resolve) => {
      confirm = resolve;
    });
    vi.mocked(ModalDialog.confirm).mockReturnValueOnce(confirmed as never);
    const pending = controller.removeChannelByIndex(0);
    await controller.removeChannelByIndex(1, true);
    confirm(true);
    expect(await pending).toBe(false);
    expect(renderer.config.channels).toHaveLength(1);
  });
  it("does not remove a channel when confirmation is cancelled", async () => {
    const { controller, renderer } = setup();
    vi.mocked(ModalDialog.confirm).mockResolvedValueOnce(false as never);
    expect(await controller.removeChannelByIndex(0)).toBe(false);
    expect(renderer.config.channels).toHaveLength(3);
  });
  it("uses a real built-in annotation channel for an empty initial config", () => {
    const channels = initChannelsConfig([]);
    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe("Transcript Structure");
    expect(channels[0].data).toMatchObject({
      method: "buildin",
      format: "transcript",
      source: "annotation",
    });
    expect(channels[0].style?.pinned).toBe(true);
  });
  it("normalises explicit order and pin status before creating views", () => {
    const channels = initChannelsConfig([
      { name: "ordinary", plot: "rect", order: 0 },
      { name: "pinned", plot: "rect", order: 4, style: { pinned: true } },
    ]);
    expect(channels.map((channel) => channel.name)).toEqual([
      "pinned",
      "ordinary",
    ]);
    expect(channels[0].style?.pinned).toBe(true);
  });
});
