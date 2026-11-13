// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { BaseRenderer } from "../../core/base-renderer";
import { NavigationController } from "../../navigation/navigation-controller";
import { AxisController } from "../../axis/axis-controller";
import { LocusManager } from "../../locus/locus-manager";
import { locusKey, locusToRegionString, regionStringToLocus } from "../../locus/locus-key";
import { parseTssRegion } from "../../utils/tss-region";

function setup(strand: "+" | "-" = "+") {
  const r: any = {
    _rnaInfo: null, _cdsInfo: null, _cdsMapper: null, _axisView: null,
    _modeGeneration: 0, _navGeneration: 0, isDestroyed: false,
    config: { region: { chr: "chr1" }, annotation: { transcripts: "fixture" } },
    incrementModeGeneration() { this._modeGeneration++; },
    channelController: { updateBuildinChannelUrls: vi.fn(), _resolveBuildinId: () => "VAMP3-201" },
    markDirty: vi.fn(),
    referenceManager: { getConfig: () => ({ assembly: { name: "GRCh38" } }) },
  };
  const nav = new NavigationController(r);
  const axis = new AxisController(r);
  r.navigationController = nav;
  r.axisController = axis;
  r.disableRnaMode = () => axis.disableRnaMode();
  r.disableCdsMode = () => axis.disableCdsMode();
  r.navigateByTranscriptTss = (...args: any[]) => (nav.navigateByTranscriptTss as any)(...args);
  Object.defineProperty(r, "viewRnaRegion", { get: () => Object.getOwnPropertyDescriptor(BaseRenderer.prototype, "viewRnaRegion")!.get!.call(r) });
  Object.defineProperty(r, "viewRegion", { get: () => `chr1:${r.viewDomain.start}-${r.viewDomain.end}` });
  Object.defineProperty(r, "transcriptInfo", { get: () => r._transcriptInfo });
  vi.spyOn(nav, "_loadTranscriptJson").mockResolvedValue({ results: { region: { chrom: "chr1", start: 7771296, end: 7781432, strand, trans_name: "VAMP3-201" } } });
  vi.spyOn(nav, "fetchTranscriptInfo").mockResolvedValue();
  vi.spyOn(nav, "_updateNavTranscriptMarker").mockImplementation(() => {});
  vi.spyOn(nav, "navigateTo").mockImplementation((chr, start, end) => { r.config.region = { chr, start, end }; r.viewDomain = { start, end }; });
  return { r, nav, axis };
}
describe("TSS input and visible viewport", () => {
  it("renders the reported default window as -5000:15137 instead of 5000:5000", async () => {
    const { r, nav } = setup();
    await nav.navigateByTranscriptAsymmetric("VAMP3-201", 5000, 5000);
    expect(r.viewRnaRegion).toBe("VAMP3-201:-5000:15137");
  });
  for (const strand of ["+", "-"] as const) {
    it.each([[-5000, 1000], [-5000, -1000], [1000, 10000]])(`${strand}: navigates %i:%i with matching viewport and history`, async (start, end) => {
      const { r, nav } = setup(strand);
      await nav.navigateByTranscriptTss("VAMP3-201", start, end);
      const tss = strand === "+" ? 7771295 : 7781432;
      expect(nav.navigateTo).toHaveBeenCalledWith("chr1", strand === "+" ? tss + start : tss - end, strand === "+" ? tss + end : tss - start);
      expect(r.viewRnaRegion).toBe(`VAMP3-201:${start}:${end}`);
      const manager = new LocusManager(r, { hasKey: () => false } as any);
      const locus = manager.getLocus();
      expect(locusToRegionString(locus)).toBe(r.viewRnaRegion);
      expect(locus.rna).toMatchObject({ tssStart: start, tssEnd: end });
      await manager.navigateToLocus(locus);
      expect(r.viewRnaRegion).toBe(`VAMP3-201:${start}:${end}`);
    });
  }
  it("keeps DNA mode and suppresses the queued RNA notification", async () => {
    const { r, nav, axis } = setup("-");
    axis._onRnaModeChange = vi.fn();
    await nav.navigateByTranscriptTss("VAMP3-201", -5000, -1000, "dna");
    expect(axis.isRnaMode).toBe(false);
    expect(axis._onRnaModeChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(r._tssContext.tssPos).toBe(7781432);
  });
  it("recalculates signed endpoints after pan and zoom", async () => {
    const { r, nav } = setup("-");
    await nav.navigateByTranscriptTss("VAMP3-201", -5000, 1000);
    r.viewDomain = { start: 7782432, end: 7786432 };
    expect(r.viewRnaRegion).toBe("VAMP3-201:-5000:-1000");
  });
  it("distinguishes positive TSS boundaries from persisted legacy flanks", () => {
    const legacy = regionStringToLocus("VAMP3-201:1000:10000");
    const current = regionStringToLocus("VAMP3-201:1000:10000", { tss: true });
    expect(legacy.rna).toMatchObject({ up: 1000, down: 10000 });
    expect(current.rna).toMatchObject({ tssStart: 1000, tssEnd: 10000 });
    expect(locusKey(current)).not.toBe(locusKey(legacy));
  });
  it.each(["VAMP3-201:1000:-1000", "VAMP3-201:5000:5000"])('rejects reversed or empty intervals: %s', input => {
    expect(() => parseTssRegion(input)).toThrow();
  });
});
