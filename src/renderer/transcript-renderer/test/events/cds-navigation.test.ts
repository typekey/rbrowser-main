// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { AxisController } from "../../axis/axis-controller";
import { BaseRenderer } from "../../core/base-renderer";
import { NavigationController } from "../../navigation/navigation-controller";
import { InteractionBinder } from "../../events/interaction-binder";
import { CDSCoordinateMapper } from "../../utils/cds";
import { ChannelView } from "../../channel/index";
import { ChannelDataPipeline } from "../../channel/components/channel-data-pipeline";

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  document.body.replaceChildren();
  vi.useRealTimers();
});

function setup(strand: "+" | "-" = "+", delayedSize = false) {
  vi.useFakeTimers();
  let chromosomeEnd = delayedSize ? 500_000_000 : 1_000_000;
  let resolveSize!: () => void;
  const sizes = delayedSize ? new Promise<void>(resolve => { resolveSize = resolve; }) : Promise.resolve();
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 500, width: 800, height: 500, x: 0, y: 0, toJSON() {} });
  const channel = Object.create(ChannelView.prototype);
  channel.handleNavigation = vi.fn();
  channel.setCdsMapper = vi.fn();
  const r: any = {
    container, browserWidth: 800, viewDomain: { start: 9500, end: 11500 },
    config: { region: { chr: "chr1", start: 9500, end: 11500 }, renderer: { enableInertia: false } },
    rootView: { width: 800, children: [channel] },
    _rnaInfo: null, _cdsInfo: null, _cdsMapper: null,
    _transcriptFeatures: [], _cdsFlank: 500,
    loadData: vi.fn(), requestRepaint: vi.fn(), getWheelMode: () => "zoom",
    chrom: {
      chromBounds: () => ({ minStart: 0, maxEnd: chromosomeEnd }),
      loadChromSizes: () => sizes, loadCytobands: async () => {},
    },
  };
  r.navigationController = new NavigationController(r);
  r.navigationController._onNavigationChange = vi.fn();
  r.axisController = new AxisController(r);
  Object.defineProperty(r, "viewRegion", { get: () => Object.getOwnPropertyDescriptor(BaseRenderer.prototype, "viewRegion")!.get!.call(r) });
  new InteractionBinder(r).attach(container);
  const mapper = new CDSCoordinateMapper([{ start: 10000, end: 10100 }, { start: 10900, end: 11000 }], strand);
  const info = { strand, chr: "chr1", name: "TEST-201", tssPos: strand === "+" ? 10000 : 11000, txStart: 10000, txEnd: 11000 };
  r.axisController.enableCdsMode(mapper, info);
  cleanups.push(() => {
    r.interactionController.detach();
    r.boundaryFeedback.destroy();
    container.removeEventListener("wheel", r._altWheelHandler);
  });
  return { r, mapper, channel, container, axis: r.axisController as AxisController, finishSizes: () => { chromosomeEnd = 1_000_000; resolveSize(); } };
}

for (const strand of ["+", "-"] as const) {
  describe(`chromosome-wide CDS navigation (${strand})`, () => {
    it("zooms out to the whole chromosome with collapsed CDS gaps", () => {
      const { r, axis, mapper } = setup(strand);
      axis.zoomCdsView(1 / 1_000_000);
      expect(r.viewDomain).toEqual({ start: -10000, end: 989200 });
      expect(r.viewDomain.end - r.viewDomain.start).toBe(1_000_000 - mapper.totalGapLength);
      expect(r.viewRegion).toBe("chr1:0-1000000");
      axis.panCdsView(-1);
      axis.panCdsView(1);
      expect(r.viewRegion).toBe("chr1:0-1000000");
    });

    it("pans beyond the initial transcript window and loads the new region", () => {
      const { r, axis, channel } = setup(strand);
      axis.panCdsView(10);
      expect(r.viewDomain).toEqual({ start: 11500, end: 12700 });
      expect(r.viewRegion).toBe("chr1:22300-23500");
      expect(channel.handleNavigation).toHaveBeenLastCalledWith({ chr: "chr1", start: 22300, end: 23500 }, "pan");
      expect(r.navigationController._onNavigationChange).toHaveBeenCalledOnce();
    });

    it("preserves span at chromosome edges and limits maximum zoom-in", () => {
      const { r, axis } = setup(strand);
      axis.panCdsView(-1_000_000);
      expect(r.viewRegion).toBe("chr1:0-1200");
      axis.panCdsView(1_000_000);
      expect(r.viewRegion).toBe("chr1:998800-1000000");
      axis.zoomCdsView(1_000_000);
      expect(r.viewDomain.end - r.viewDomain.start).toBe(40);
    });

    it("converts the current CDS viewport back to DNA without jumping to the original window", () => {
      const { r, axis } = setup(strand);
      axis.panCdsView(10);
      axis.disableCdsMode();
      expect(r.viewDomain).toEqual({ start: 22300, end: 23500 });
      expect(r.config.region).toEqual({ chr: "chr1", start: 22300, end: 23500 });
      expect(r.viewRegion).toBe("chr1:22300-23500");
      expect(r.loadData).toHaveBeenCalledOnce();
      axis.enableRnaMode(r._tssContext);
      expect(r.viewDomain).toEqual({ start: 22300, end: 23500 });
    });

    it("keeps CDS coordinates when navigating a genomic region", () => {
      const { r } = setup(strand);
      r.navigationController.navigateTo("chr1", 300000, 310000);
      expect(r.viewDomain).toEqual({ start: 289200, end: 299200 });
      expect(r.viewRegion).toBe("chr1:300000-310000");
      expect(r.axisController.isCdsMode).toBe(true);
    });
  });
}

describe("CDS canvas gestures", () => {
  it("uses chromosome bounds for wheel zoom and dispatches genomic data requests", async () => {
    const { r, container, channel } = setup();
    await vi.advanceTimersByTimeAsync(0);
    container.dispatchEvent(new WheelEvent("wheel", { deltaY: 1000, clientX: 400, clientY: 250, bubbles: true, cancelable: true }));
    expect(r.viewDomain.start).toBeLessThan(-500);
    expect(r.viewDomain.end).toBeGreaterThan(700);
    await vi.advanceTimersByTimeAsync(400);
    const [, start, end] = r.viewRegion.match(/:(\d+)-(\d+)/);
    expect(channel.handleNavigation).toHaveBeenLastCalledWith({ chr: "chr1", start: +start, end: +end }, "zoom");
  });

  it("allows dragging beyond the initial CDS extent", async () => {
    const { r, container, channel } = setup();
    await vi.advanceTimersByTimeAsync(0);
    container.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 700, clientY: 250, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mousemove", { buttons: 1, clientX: 100, clientY: 250, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mouseup", { button: 0, clientX: 100, clientY: 250, bubbles: true }));
    await vi.advanceTimersByTimeAsync(150);
    expect(r.viewDomain).toEqual({ start: 400, end: 1600 });
    expect(channel.handleNavigation).toHaveBeenLastCalledWith({ chr: "chr1", start: 11200, end: 12400 }, "pan");
  });

  it("keeps transformed bounds when chromosome sizes finish loading after CDS entry", async () => {
    const { r, axis, finishSizes } = setup("-", true);
    axis.zoomCdsView(1 / 1_000_000);
    finishSizes();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.viewDomain).toEqual({ start: -10000, end: 989200 });
    expect(r.viewRegion).toBe("chr1:0-1000000");
  });
});

describe("CDS channel fetching", () => {
  it.each(["rect", "bam", "transcript"])("fetches newly visible tiles while panning %s channels", plot => {
    const screenManager = { handlePan: vi.fn(), handleZoom: vi.fn(), hasPendingRequests: () => false };
    const channel: any = { config: { plot }, _cdsMapper: new CDSCoordinateMapper([{ start: 10000, end: 11000 }]), screenManager, isAboveDetailZoom: () => false, isCoverageAboveDetailZoom: () => false, detailZoomThreshold: 0 };
    new ChannelDataPipeline(channel).handleNavigation({ chr: "chr1", start: 300000, end: 310000 }, "pan");
    expect(screenManager.handlePan).toHaveBeenCalledExactlyOnceWith({ chr: "chr1", start: 300000, end: 310000 });
  });
});
