// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { AxisView } from "../../axis";
import { CDSCoordinateMapper } from "../../utils/cds";
import { transcriptNavLayout, genomicToNavRatio, navRatioToGenomic } from "../../axis/transcript-nav-layout";

const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).forEach(fn => fn()); vi.restoreAllMocks(); document.body.replaceChildren(); });

describe("proportional transcript overview", () => {
  it.each([[0, 10000], [990, 2010], [-1000000, 1000000], [0, 2001], [999, 1000000], [1200, 1400], [50000, 60000]])("respects all minima for viewport %i:%i", (start, end) => {
    const layout = transcriptNavLayout(1000, 2000, start, end);
    expect(layout.leftRatio).toBeGreaterThanOrEqual(1 / 6 - 1e-12);
    expect(layout.bodyRatio).toBeGreaterThanOrEqual(1 / 5 - 1e-12);
    expect(layout.rightRatio).toBeGreaterThanOrEqual(1 / 6 - 1e-12);
    expect(layout.leftRatio + layout.bodyRatio + layout.rightRatio).toBeCloseTo(1);
  });
  it("uses actual proportions when no minimum is reached", () => {
    const layout = transcriptNavLayout(9000, 19000, 0, 29000);
    expect(layout.leftRatio).toBeCloseTo(9 / 29);
    expect(layout.bodyRatio).toBeCloseTo(10 / 29);
    expect(layout.rightRatio).toBeCloseTo(10 / 29);
  });
  it("shrinks transcript width on zoom-out and grows it on zoom-in", () => {
    const near = transcriptNavLayout(1000, 2000, 900, 2100);
    const far = transcriptNavLayout(1000, 2000, 0, 10000);
    expect(near.bodyRatio).toBeCloseTo(2 / 3);
    expect(far.bodyRatio).toBeCloseTo(1 / 5);
    expect(far.rightRatio).toBeGreaterThan(far.leftRatio);
  });
  it("round-trips genomic positions with asymmetric flanks", () => {
    const layout = transcriptNavLayout(10000, 20000, 1000, 90000);
    for (const position of [1000, 5000, 10000, 13000, 20000, 30000, 90000]) {
      expect(navRatioToGenomic(layout, genomicToNavRatio(layout, position))).toBe(position);
    }
  });
});

function setup(mode: "dna" | "rna" | "cds" = "rna", strand: "+" | "-" = "+", dpr = 1) {
  vi.stubGlobal("devicePixelRatio", dpr);
  cleanup.push(() => vi.unstubAllGlobals());
  const context = new Proxy<any>({ measureText: (text: string) => ({ width: text.length * 5 * dpr }) }, {
    get: (object, key) => object[key] ?? (object[key] = vi.fn()),
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  const axis = new AxisView({ theme: "light" } as any, {});
  const mapper = new CDSCoordinateMapper([{ start: 1000, end: 1200 }, { start: 1800, end: 2000 }], strand);
  const resize = vi.fn((start: number, end: number) => {
    axis.render({ domain: mode === "cds" ? mapper.transformDomain(start, end) : { start, end } });
  });
  const click = vi.fn();
  axis.layout(0, 0, 1000 * dpr, 44 * dpr);
  axis.setChromSize(1_000_000, click, resize);
  axis.setActiveTranscript(1000, 2000, mode, { chromosome: "chr1", transcriptName: "TEST-201" });
  if (mode === "rna") axis.setRnaMode(true, strand === "+" ? 1000 : 2000, strand, 1000, 2000);
  if (mode === "cds") axis.setCdsMode(true, mapper);
  axis.setTranscriptFeatures([{ type: "exon", start: 1000, end: 1200 }, { type: "exon", start: 1800, end: 2000 }], 1000, 2000, 500, 500, strand, click, resize);
  const host = document.createElement("div"); document.body.appendChild(host);
  axis.mount(host);
  axis.render({ domain: mode === "cds" ? mapper.transformDomain(500, 2500) : { start: 500, end: 2500 } });
  const nav = host.querySelector<HTMLElement>('[aria-label="Axis overview"]')!;
  nav.getBoundingClientRect = () => ({ left: parseFloat(nav.style.left), width: 1000 - parseFloat(nav.style.left) - 2, top: 0, bottom: 14 } as DOMRect);
  for (const element of [nav, ...nav.querySelectorAll<HTMLElement>('[aria-label]')]) {
    element.setPointerCapture = vi.fn(); element.releasePointerCapture = vi.fn();
  }
  cleanup.push(() => axis.destroy());
  return { axis, mapper, nav, host, context, resize, click };
}

describe("axis identity and shared rendering geometry", () => {
  it.each(["rna", "cds", "dna"] as const)("shows current identity in %s mode and exported SVG", mode => {
    const { host, axis } = setup(mode);
    const expected = mode === "dna" ? "chr1" : "TEST-201 | chr1";
    expect(host.querySelector('[aria-label="Axis context"]')?.textContent).toBe(expected);
    expect(axis.buildSVGElements(1000)?.elements).toContain(`>${expected}</text>`);
    axis.setActiveTranscript(0, 0, "dna", { chromosome: "chr17", transcriptName: "" });
    expect(host.querySelector('[aria-label="Axis context"]')?.textContent).toBe("chr17");
  });
  it.each([1, 2])( "aligns drawn dividers with exported SVG at DPR %i", dpr => {
    const { axis, nav, context } = setup("rna", "+", dpr);
    const { left, width } = nav.getBoundingClientRect();
    const layout = transcriptNavLayout(1000, 2000, 500, 2500);
    const divider = left + width * layout.leftRatio;
    expect(context.moveTo).toHaveBeenCalledWith(divider * dpr, 2 * dpr);
    expect(axis.buildSVGElements(1000)?.elements).toContain(`x1="${divider.toFixed(2)}" y1="2.00"`);
    axis.layout(0, 0, 600 * dpr, 44 * dpr);
    expect(parseFloat(nav.dataset.bodyRatio!)).toBeCloseTo(layout.bodyRatio);
  });
  it.each(["+", "-"] as const)("freezes drag geometry and converts CDS edge positions back to genomic (%s)", strand => {
    const { nav, resize } = setup("cds", strand);
    const edge = nav.querySelector<HTMLElement>('[aria-label="Viewport left edge"]')!;
    const before = { ...nav.dataset };
    const rect = nav.getBoundingClientRect();
    edge.dispatchEvent(new MouseEvent("pointerdown", { clientX: rect.left, bubbles: true, cancelable: true }));
    edge.dispatchEvent(new MouseEvent("pointermove", { clientX: rect.left + rect.width * Number(before.leftRatio), bubbles: true }));
    expect(resize).toHaveBeenLastCalledWith(1000, 2500);
    expect(nav.dataset.leftRatio).toBe(before.leftRatio);
    edge.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    expect(Number(nav.dataset.leftRatio)).toBeCloseTo(1 / 6);
  });
});
