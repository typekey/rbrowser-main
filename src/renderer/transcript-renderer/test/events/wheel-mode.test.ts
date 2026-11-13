// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { InteractionBinder } from "../../events/interaction-binder";
import { resolveWheelAction, type WheelMode } from "../../events/wheel-mode";
import type { BaseRenderer } from "../../core/base-renderer";

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); document.body.replaceChildren(); vi.useRealTimers(); });
function setup(mode: WheelMode) {
  vi.useFakeTimers();
  const container = document.createElement("div"); document.body.appendChild(container);
  container.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 500, width: 800, height: 500, x: 0, y: 0, toJSON() {} });
  const rootView = { width: 800, children: [], needsScroll: true, scrollBy: vi.fn() };
  const laneScroll = vi.fn(() => true);
  const renderer = {
    container, config: { renderer: {}, region: { chr: "chr1" } }, viewDomain: { start: 1000, end: 2000 },
    rootView, getWheelMode: () => mode, scrollbar: { update: vi.fn() },
    _relayoutAndRepaint: vi.fn(), requestRepaint: vi.fn(),
    chrom: { chromBounds: () => ({ minStart: 0, maxEnd: 1000000 }), loadChromSizes: async () => {}, loadCytobands: async () => {} },
    axisController: { isCdsMode: false, navigationBounds: { minStart: 0, maxEnd: 1000000 } },
    navigationController: { _buildNavigationEvent: vi.fn(), _updateAxisNavBar: vi.fn() },
    channelController: { findChannelAtY: () => ({ altWheelScroll: laneScroll }) },
  } as unknown as BaseRenderer;
  new InteractionBinder(renderer).attach(container);
  cleanups.push(() => { renderer.interactionController?.detach(); renderer.boundaryFeedback?.destroy(); if (renderer._altWheelHandler) container.removeEventListener("wheel", renderer._altWheelHandler); });
  return { renderer, rootView, laneScroll, container, setMode: (next: WheelMode) => { mode = next; } };
}
const wheel = (container: HTMLElement, modifiers: Partial<WheelEventInit> = {}) => {
  const event = new WheelEvent("wheel", { deltaY: 100, clientX: 400, clientY: 250, bubbles: true, cancelable: true, ...modifiers });
  container.dispatchEvent(event); return event;
};
describe("wheel modes", () => {
  it.each([
    {mode:"zoom" as const,ctrl:false,zoom:true}, {mode:"zoom" as const,ctrl:true,zoom:false},
    {mode:"scroll" as const,ctrl:false,zoom:false}, {mode:"scroll" as const,ctrl:true,zoom:true},
  ])("routes $mode with Ctrl=$ctrl to one action", ({ mode, ctrl, zoom }) => {
    const { renderer, rootView, container } = setup(mode);
    const before = { ...renderer.viewDomain }; const event = wheel(container, { ctrlKey: ctrl });
    expect(event.defaultPrevented).toBe(true);
    if (zoom) { expect(renderer.viewDomain.end - renderer.viewDomain.start).toBeGreaterThan(before.end - before.start); expect(rootView.scrollBy).not.toHaveBeenCalled(); }
    else { expect(renderer.viewDomain).toEqual(before); expect(rootView.scrollBy).toHaveBeenCalledExactlyOnceWith(100); expect(renderer._relayoutAndRepaint).toHaveBeenCalledOnce(); }
  });
  it("changes mode without reattaching event listeners", () => {
    const { renderer, rootView, container, setMode } = setup("zoom");
    wheel(container); const afterZoom = { ...renderer.viewDomain };
    setMode("scroll"); wheel(container);
    expect(renderer.viewDomain).toEqual(afterZoom); expect(rootView.scrollBy).toHaveBeenCalledOnce();
  });
  it.each(["zoom", "scroll"] as const)("retains Alt lane scrolling in %s mode", mode => {
    const { renderer, rootView, laneScroll, container } = setup(mode);
    const before = { ...renderer.viewDomain }; const event = wheel(container, { altKey: true });
    expect(laneScroll).toHaveBeenCalledExactlyOnceWith(100); expect(event.defaultPrevented).toBe(true);
    expect(renderer.viewDomain).toEqual(before); expect(rootView.scrollBy).not.toHaveBeenCalled();
  });
  it("swallows channel scrolling when the content does not overflow", () => {
    const { rootView, container, renderer } = setup("scroll"); rootView.needsScroll = false;
    const before = { ...renderer.viewDomain }; expect(wheel(container).defaultPrevented).toBe(true);
    expect(rootView.scrollBy).not.toHaveBeenCalled(); expect(renderer.viewDomain).toEqual(before);
  });
  it("supports Cmd inversion and preserves Alt precedence", () => {
    expect(resolveWheelAction("scroll", {ctrlKey:false,metaKey:true,altKey:false})).toBe("zoom");
    expect(resolveWheelAction("zoom", {ctrlKey:true,metaKey:false,altKey:true})).toBe("subchannel");
  });
});
