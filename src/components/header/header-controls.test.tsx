// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WheelModeButton } from "./WheelModeButton";
import { HelpModal } from "../modals/HelpModal";
import type { WheelMode } from "../../renderer/transcript-renderer/events/wheel-mode";

let root: Root;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  if (root) act(() => root.unmount());
  document.body.replaceChildren();
});
function mount(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
  return container;
}
describe("header wheel control and help", () => {
  it("toggles the wheel mode through the actual button", () => {
    const change = vi.fn();
    const container = mount(<WheelModeButton mode="zoom" onChange={change} />);
    const button = container.querySelector<HTMLButtonElement>("button")!;
    expect(button.dataset.wheelMode).toBe("zoom");
    act(() => button.click());
    expect(change).toHaveBeenCalledExactlyOnceWith("scroll");
    act(() => root.render(<WheelModeButton mode="scroll" onChange={change} />));
    expect(button.getAttribute("aria-pressed")).toBe("true");
    act(() => button.click());
    expect(change).toHaveBeenLastCalledWith("zoom");
  });
  it.each(["zoom", "scroll"] as WheelMode[])(
    "shows matching wheel instructions in %s mode",
    (mode) => {
      const container = mount(
        <HelpModal open wheelMode={mode} onClose={() => {}} />,
      );
      const rows = Array.from(container.querySelectorAll("tr")).filter(
        (row) => row.children[1]?.textContent === "Mouse Scroll",
      );
      expect(rows[0].children[3].textContent).toBe(
        mode === "zoom"
          ? "Zoom in / out"
          : "Scroll the (non-pinned) channel list",
      );
      expect(rows[1].children[3].textContent).toBe(
        mode === "zoom"
          ? "Scroll the (non-pinned) channel list"
          : "Zoom in / out",
      );
      expect(container.querySelector('[role="dialog"]')).not.toBeNull();
      expect(
        container.querySelector<HTMLElement>(".help-scroll-body")?.style
          .overflowY,
      ).toBe("auto");
    },
  );
});
