// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelController } from "../../channel/manager/channel-controller";
import { buildPromise } from "../../data/promises";
import { CDSCoordinateMapper } from "../../utils/cds";

vi.mock("../../data/promises", () => ({ buildPromise: vi.fn() }));
const fetchData = vi.mocked(buildPromise);
beforeEach(() => {
  fetchData.mockReset();
  fetchData.mockResolvedValue([{ start: 1000, end: 1100, score: 7, meta: { tissue: "test" } }]);
});
function setup(format = "exon", method = "buildin") {
  const reference: any = { assembly: { name: "GRCh38" }, transcriptome: { api: "https://test/rna", annotation: { url: "https://test/genes.gff", index: "https://test/genes.gff.tbi" } } };
  const channel: any = { name: "renamed channel", data: { method, format, url: "https://test/expression/A" } };
  const r: any = {
    _buildinTranscriptId: "A", _buildinUpstream: 5000, _buildinDownstream: 5000,
    _lastTranscriptCoords: { txStart: 1000, txEnd: 2000 },
    _tssContext: { chr: "chr1" }, _rnaInfo: null, _cdsInfo: null, _cdsMapper: null,
    config: { region: { chr: "chr1" } }, viewDomain: { start: 500, end: 2500 },
    context: { canvas: { width: 1000 } }, referenceManager: { getConfig: () => reference },
  };
  const controller = new ChannelController(r);
  vi.spyOn(controller as any, "onChannelLoaded").mockImplementation(() => {});
  vi.spyOn(controller as any, "onChannelError").mockImplementation(() => {});
  const loader = controller.createDataLoader(channel, 0);
  const load = (region = { chr: "chr1", ...r.viewDomain }) => loader(region);
  return { r, reference, channel, load };
}

describe.each(["exon", "junction"])("transcript-scoped %s loading", format => {
  it.each([[0, 1000], [2000, 3000], [4000, 5000]])("skips outside or boundary-only overlap (%i:%i)", async (start, end) => {
    const { r, load } = setup(format);
    r.viewDomain = { start, end };
    expect(await load()).toEqual([]);
    expect(fetchData).not.toHaveBeenCalled();
  });
  it.each([[0, 1001], [1999, 2500], [1200, 1400], [0, 10000]])("loads the full transcript for partial/contained overlap (%i:%i)", async (start, end) => {
    const { r, load } = setup(format);
    r.viewDomain = { start, end };
    await load();
    expect(fetchData).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ region: { chr: "chr1", start: 1000, end: 2000 }, structureFallbackUrl: "https://test/rna/A/auto/0/1000/" }));
  });
  it("does not let an offscreen tile hide a partially visible transcript", async () => {
    const { r, load } = setup(format);
    r.viewDomain = { start: 900, end: 1001 };
    expect(await load({ chr: "chr1", start: 700, end: 900 })).toHaveLength(1);
    expect(fetchData).toHaveBeenCalledOnce();
  });
  it("reuses data across zoom, pan, departure and re-entry without sharing mutable records", async () => {
    const { r, load } = setup(format);
    const first = await load();
    first[0].meta.tissue = "changed";
    first.length = 0;
    r.viewDomain = { start: 3000, end: 4000 };
    expect(await load()).toEqual([]);
    r.viewDomain = { start: 1500, end: 1700 };
    const returned = await load();
    expect(returned).toEqual([{ start: 1000, end: 1100, score: 7, meta: { tissue: "test" } }]);
    r.viewDomain = { start: 0, end: 1_000_000 };
    await load();
    expect(fetchData).toHaveBeenCalledOnce();
  });
  it("skips another chromosome or missing transcript context", async () => {
    const { r, load } = setup(format);
    r.config.region.chr = "chr2";
    await load();
    r.config.region.chr = "chr1";
    r._lastTranscriptCoords = null;
    await load();
    expect(fetchData).not.toHaveBeenCalled();
  });
  it("checks genomic overlap in CDS mode on either strand", async () => {
    for (const strand of ["+", "-"] as const) {
      const { r, load } = setup(format);
      r._cdsMapper = new CDSCoordinateMapper([{ start: 1000, end: 1100 }, { start: 1900, end: 2000 }], strand);
      r._cdsInfo = { chr: "chr1", strand };
      r.viewDomain = { start: 300, end: 400 };
      expect(await load()).toEqual([]); // genomic 2100:2200
      r.viewDomain = { start: -100, end: 20 };
      expect(await load()).toHaveLength(1); // genomic 900:1020
    }
    expect(fetchData).toHaveBeenCalledTimes(2);
  });
});

describe("transcript request cache identity and concurrency", () => {
  it("deduplicates pending requests and retains valid empty results", async () => {
    const { load } = setup();
    let resolve!: (data: any[]) => void;
    fetchData.mockReturnValueOnce(new Promise<any[]>(done => { resolve = done; }));
    const a = load(), b = load();
    expect(fetchData).toHaveBeenCalledOnce();
    resolve([]);
    expect(await a).toEqual([]);
    expect(await b).toEqual([]);
    await load();
    expect(fetchData).toHaveBeenCalledOnce();
  });
  it("retries rejected requests", async () => {
    const { load } = setup();
    fetchData.mockRejectedValueOnce(new Error("temporary failure"));
    await expect(load()).rejects.toThrow("temporary failure");
    expect(await load()).toHaveLength(1);
    expect(fetchData).toHaveBeenCalledTimes(2);
  });
  it("invalidates on transcript, assembly, and data source changes", async () => {
    const { load, r, reference, channel } = setup();
    await load();
    r._buildinTranscriptId = "B";
    await load();
    reference.assembly.name = "GRCh37";
    await load();
    channel.data.url = "https://test/other-source";
    await load();
    expect(fetchData).toHaveBeenCalledTimes(4);
  });
  it("uses fixed transcript bounds for annotation-backed exon/junction data", async () => {
    const { load, channel, r, reference } = setup();
    channel.data.source = "annotation";
    await load();
    expect(fetchData).toHaveBeenLastCalledWith(expect.objectContaining({ buildinGff: expect.objectContaining({ region: { chr: "chr1", start: 1000, end: 2000 } }) }));
    r._buildinUpstream = 100000;
    r._buildinDownstream = 200000;
    await load();
    expect(fetchData).toHaveBeenCalledTimes(1);
    reference.transcriptome.annotation.url = "https://test/replacement.gff";
    await load();
    expect(fetchData).toHaveBeenCalledTimes(2);
  });
  it("does not apply transcript restrictions to other channels or remote exon sources", async () => {
    for (const [format, method] of [["transcript", "buildin"], ["exon", "remote"], ["junction", "remote"]]) {
      const { r, load } = setup(format, method);
      r.viewDomain = { start: 5000, end: 6000 };
      await load();
      await load();
    }
    expect(fetchData).toHaveBeenCalledTimes(6);
  });
  it("accepts the built-in method alias", async () => {
    const { r, load } = setup("junction", "built-in");
    r.viewDomain = { start: 3000, end: 4000 };
    expect(await load()).toEqual([]);
    expect(fetchData).not.toHaveBeenCalled();
  });
});
