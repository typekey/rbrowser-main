// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  buildPublishFigureSVG,
  publishAxisTicks,
  type PublishFigureInput,
} from "../../export/publish-figure";
import { ExportManager } from "../../export/export-manager";
import { ChannelView } from "../../channel";
import { CDSCoordinateMapper } from "../../utils/cds";

const input = (): PublishFigureInput => ({
  title: "MALAT1-201",
  plotWidth: 600,
  axis: {
    mode: "RNA",
    start: 2276,
    end: 2308,
    origin: 1000,
    strand: "+",
    band: { start: 1000, end: 9000, color: "#00b894" },
  },
  tracks: [
    {
      label: "Reference sequence",
      width: 600,
      height: 54,
      innerSvg: '<rect width="600" height="40" fill="green"/>',
    },
    {
      label: "Hairpin",
      group: "Paper",
      width: 600,
      height: 54,
      innerSvg: '<path d="M0,20 H600"/>',
    },
    {
      label: "Motif",
      group: "Paper",
      width: 600,
      height: 54,
      innerSvg: '<path d="M10,20 H20"/>',
    },
  ],
});
const parse = (svg: string) =>
  new DOMParser().parseFromString(svg, "image/svg+xml");

describe("publication layout", () => {
  it("uses sparse TSS ticks instead of genomic coordinates", () => {
    expect(publishAxisTicks(input().axis, 600).map((t) => t.label)).toEqual([
      "+1,280",
      "+1,290",
      "+1,300",
    ]);
  });
  it("reverses RNA tick labels for negative strands without reversing geometry", () => {
    const ticks = publishAxisTicks(
      { ...input().axis, origin: 4000, strand: "-" },
      600,
    );
    expect(ticks.map((t) => t.label)).toEqual(["+1,720", "+1,710", "+1,700"]);
    expect(ticks[0].x).toBeLessThan(ticks[1].x);
  });
  it("uses one-based chromosome labels in DNA mode", () => {
    const ticks = publishAxisTicks(
      { ...input().axis, mode: "DNA", start: 99, end: 131 },
      600,
    );
    expect(ticks.map((t) => t.label)).toEqual(["110", "120", "130"]);
  });
  it("anchors negative CDS labels to the start codon", () => {
    const ticks = publishAxisTicks(
      { mode: "CDS", start: 0, end: 40, origin: 40, strand: "-" },
      600,
    );
    expect(ticks.map((t) => t.label)).toEqual(["+30", "+20", "+10"]);
  });
  it("renders editable labels, contiguous group rows, a band and native fragments", () => {
    const doc = parse(buildPublishFigureSVG(input()));
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelectorAll("[data-publish-track]")).toHaveLength(3);
    expect(doc.querySelectorAll("[data-group]")).toHaveLength(1);
    expect(doc.querySelector("[data-group]")?.textContent).toBe("Paper");
    expect(doc.querySelector("[data-transcript-band]")).not.toBeNull();
    expect(
      doc
        .querySelector('[data-publish-track="Reference sequence"] text')
        ?.getAttribute("font-size"),
    ).toBe("30");
    const rows = [...doc.querySelectorAll("[data-publish-track] > rect")];
    expect(Number(rows[2].getAttribute("y"))).toBe(
      Number(rows[1].getAttribute("y")) +
        Number(rows[1].getAttribute("height")),
    );
  });
  it("clips shared highlights to the plot, omits offscreen bands and leaves headers clear", () => {
    const fixture = input();
    fixture.highlights = [
      { start: 2200, end: 2280, color: "#00b894" },
      { start: 2400, end: 2500, color: "#f00" },
    ];
    const doc = parse(buildPublishFigureSVG(fixture));
    const bands = doc.querySelectorAll("[data-publish-highlight]");
    expect(bands).toHaveLength(1);
    const row = doc.querySelector("[data-publish-track] > rect")!;
    expect(bands[0].getAttribute("x")).toBe(row.getAttribute("x"));
    expect(bands[0].getAttribute("y")).toBe(row.getAttribute("y"));
    expect(Number(bands[0].getAttribute("width"))).toBe(75);
  });
  it("preserves long labels by wrapping and escapes XML", () => {
    const fixture = input();
    fixture.title = 'Gene <A> & "B"';
    fixture.tracks[0].label = "A".repeat(70);
    const doc = parse(buildPublishFigureSVG(fixture));
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelector("text")?.textContent).toBe(fixture.title);
    const labels = [
      ...doc.querySelectorAll("[data-publish-track]"),
    ][0].querySelectorAll(":scope > text");
    expect([...labels].map((el) => el.textContent).join("")).toBe(
      fixture.tracks[0].label,
    );
    expect(labels).toHaveLength(3);
  });
  it("rejects invalid bounds rather than emitting NaN SVG", () => {
    const fixture = input();
    fixture.axis.end = fixture.axis.start;
    expect(() => buildPublishFigureSVG(fixture)).toThrow(/viewport/);
  });
});

function channel(name: string, plot = "rect", group?: string) {
  const ch = Object.create(ChannelView.prototype);
  Object.defineProperties(ch, {
    name: { value: name },
    plotType: { value: plot },
    groupName: { value: group },
    isExpanded: { value: false, configurable: true },
    subChannels: { value: [], configurable: true },
    isPinned: { value: plot === "sequence" },
  });
  return ch;
}
function manager() {
  const r: any = {
    rootView: {
      children: [
        channel("Sequence", "sequence"),
        channel("Transcript", "transcript"),
        channel("Signal", "line", "Expression"),
      ],
    },
    browserWidth: 1000,
    renderForExport: vi.fn(),
    getViewDomain: () => ({ start: 1000, end: 2000 }),
    axisController: {
      rnaInfo: {
        name: "TEST-201",
        tssPos: 1200,
        strand: "+",
        txStart: 1200,
        txEnd: 1800,
      },
      cdsMapper: null,
      cdsInfo: null,
    },
    config: { region: { chr: "chr1" } },
    highlightManager: {
      regions: [{ start: 1300, end: 1400, color: "#00b894" }],
    },
    referenceManager: { getConfig: () => ({ assembly: { name: "GRCh38" } }) },
  };
  const m = new ExportManager(r) as any;
  vi.spyOn(m, "buildIsolatedChannelSVG").mockImplementation(
    () => '<svg width="600" height="54"><path d="M0,20 H600"/></svg>',
  );
  vi.spyOn(m, "triggerDownload").mockImplementation(() => {});
  vi.spyOn(m, "formatExportFilename").mockReturnValue("publish.svg");
  return { m, r };
}
describe("Publish export integration", () => {
  it("includes pinned tracks and expanded samples in original order", async () => {
    const { m, r } = manager();
    Object.defineProperties(r.rootView.children[2], {
      isExpanded: { value: true },
      subChannels: { value: [channel("sample A", "line")] },
    });
    await m.exportBrowserPublish("SVG");
    const doc = parse(m.triggerDownload.mock.calls[0][0]);
    expect(
      [...doc.querySelectorAll("[data-publish-track]")].map((el) =>
        el.getAttribute("data-publish-track"),
      ),
    ).toEqual(["Reference sequence", "Transcript", "Signal", "sample A"]);
    expect(r.renderForExport).toHaveBeenCalledOnce();
    expect(doc.querySelector("[data-publish-highlight]")).not.toBeNull();
  });
  it("restores the live render when capture fails", async () => {
    const { m, r } = manager();
    m.buildIsolatedChannelSVG.mockImplementation(() => {
      throw Error("capture failed");
    });
    await expect(m.exportBrowserPublish("SVG")).rejects.toThrow(
      "capture failed",
    );
    expect(r.renderForExport).toHaveBeenCalledOnce();
    expect(m.triggerDownload).not.toHaveBeenCalled();
  });
  it("maps highlights to CDS and excludes other assemblies", async () => {
    const { m, r } = manager();
    r.axisController.rnaInfo = null;
    r.axisController.cdsMapper = new CDSCoordinateMapper(
      [
        { start: 1000, end: 1100 },
        { start: 1200, end: 1500 },
      ],
      "-",
    );
    r.axisController.cdsInfo = { name: "TEST-201", strand: "-" };
    r.getViewDomain = () => ({ start: 0, end: 400 });
    r.highlightManager.regions.push({
      start: 1000,
      end: 1100,
      color: "#f00",
      assembly: { name: "mm10" },
    });
    await m.exportBrowserPublish("SVG");
    const doc = parse(m.triggerDownload.mock.calls[0][0]);
    const bands = doc.querySelectorAll("[data-publish-highlight]");
    expect(bands).toHaveLength(1);
    expect(Number(bands[0].getAttribute("width"))).toBe(150);
    const plotX = Number(
      doc.querySelector("[data-publish-track] > rect")!.getAttribute("x"),
    );
    expect(Number(bands[0].getAttribute("x")) - plotX).toBe(300);
    expect(doc.documentElement.textContent).toContain(
      "CDS Mode · position from start codon",
    );
  });
});
