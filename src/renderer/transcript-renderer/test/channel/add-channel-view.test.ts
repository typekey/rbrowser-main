// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddChannelView } from "../../channel/components/add-channel-view";
import { LayoutView, View } from "../../core/view";
let view: AddChannelView;
afterEach(() => {
  view?.destroy();
  document.body.replaceChildren();
});
function setup() {
  view = new AddChannelView();
  const actions = { local: vi.fn(), remote: vi.fn(), dataHub: vi.fn() };
  view.setActions(actions);
  view.layout(0, 100, 800, 44);
  view.mount(document.body);
  return {
    actions,
    button: document.querySelector<HTMLButtonElement>(".add-channel-button")!,
  };
}
const item = (name: string) =>
  Array.from(
    document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  ).find((button) => button.textContent === name)!;
describe("Add Channel footer", () => {
  it("opens Local, Remote and DataHub with working callbacks", () => {
    const { actions, button } = setup();
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(3);
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    item("Local").click();
    expect(click).toHaveBeenCalledOnce();
    const file = new File(["chr1\t0\t10"], "example.bed");
    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new Event("change"));
    expect(actions.local).toHaveBeenCalledExactlyOnceWith([file]);
    button.click();
    item("Remote").click();
    expect(actions.remote).toHaveBeenCalledOnce();
    button.click();
    item("DataHub").click();
    expect(actions.dataHub).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
  it("dismisses on Escape/outside click and cleans up on destroy", () => {
    const { button } = setup();
    button.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
    button.click();
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    button.click();
    view.destroy();
    expect(document.querySelector(".add-channel-row")).toBeNull();
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
  it("sits after channels and scrolls into view at the bottom", () => {
    setup();
    class Track extends View {
      constructor(
        private pinned: boolean,
        private size: number,
      ) {
        super();
      }
      get isPinned() {
        return this.pinned;
      }
      getPreferredHeight() {
        return this.size;
      }
      render() {}
      layout(x: number, y: number, width: number, height: number) {
        Object.assign(this, { x, y, width, height });
      }
    }
    const root = new LayoutView();
    root.addChild(new Track(true, 50));
    root.addChild(new Track(false, 300));
    root.addChild(view);
    root.layout(0, 0, 800, 200);
    expect(root.needsScroll).toBe(true);
    expect(view.y).toBe(350);
    expect(
      document.querySelector<HTMLElement>(".add-channel-row")?.style.visibility,
    ).toBe("hidden");
    root.setScrollOffset(1000);
    root.layout(0, 0, 800, 200);
    expect(view.y + view.height).toBe(200);
    expect(
      document.querySelector<HTMLElement>(".add-channel-row")?.style.visibility,
    ).toBe("visible");
  });
});
