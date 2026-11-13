import { describe, it, expect, beforeEach } from "vitest";
import {
  ChannelManager,
  type IChannelManagerDelegate,
} from "../../channel/manager/channel-manager";
import type { IChannel } from "../../channel/index";

function makeChannel(over: Partial<IChannel> = {}): IChannel {
  return {
    name: "ChIP",
    plot: "bar",
    data: {
      method: "remote",
      format: "bigwig",
      url: "https://example.com/data/chip.bw",
    },
    ...over,
  } as IChannel;
}

function makeStubDelegate(existing: IChannel[]): IChannelManagerDelegate {
  return {
    addChannel: () => {},
    addChannelDirect: () => {},
    addManyChannels: () => {},
    removeChannelByIndex: async () => false,
    reorderChannels: () => {},
    getChannelConfigs: () => existing,
    getChannelCount: () => existing.length,
    getChannelData: () => undefined,
    reloadAll: () => {},
    replaceAllChannels: () => {},
    updateChannel: () => {},
  };
}

describe("ChannelManager.findDuplicates", () => {
  let existing: IChannel[];
  let mgr: ChannelManager;

  beforeEach(() => {
    existing = [
      makeChannel({
        name: "H3K27ac",
        data: {
          method: "remote",
          format: "bigwig",
          url: "https://example.com/h3k27ac.bw",
        },
      }),
      makeChannel({
        name: "RNA-seq",
        data: {
          method: "remote",
          format: "bam",
          url: "https://example.com/rnaseq.bam",
        },
      }),
    ];
    mgr = new ChannelManager(makeStubDelegate(existing));
  });

  it("returns empty when there are no candidates", () => {
    expect(mgr.findDuplicates([])).toEqual([]);
  });

  it("returns empty when there are no existing channels", () => {
    const empty = new ChannelManager(makeStubDelegate([]));
    expect(empty.findDuplicates([makeChannel()])).toEqual([]);
  });

  it("returns empty when name + source both differ", () => {
    expect(
      mgr.findDuplicates([
        makeChannel({
          name: "Brand new channel",
          data: {
            method: "remote",
            format: "bigwig",
            url: "https://example.com/new.bw",
          },
        }),
      ]),
    ).toEqual([]);
  });

  it("returns the duplicate when name + url + format + method all match", () => {
    const dup = makeChannel({
      name: "H3K27ac",
      data: {
        method: "remote",
        format: "bigwig",
        url: "https://example.com/h3k27ac.bw",
      },
    });
    const out = mgr.findDuplicates([dup]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(dup);
  });

  it("does NOT consider same name + different URL a duplicate", () => {
    expect(
      mgr.findDuplicates([
        makeChannel({
          name: "H3K27ac",
          data: {
            method: "remote",
            format: "bigwig",
            url: "https://example.com/other-replicate.bw",
          },
        }),
      ]),
    ).toEqual([]);
  });

  it("does NOT consider same URL + different name a duplicate", () => {
    // Different displayed name on the same source URL is still a legitimate
    // "I want to add a second view of this data" — not a duplicate.
    expect(
      mgr.findDuplicates([
        makeChannel({
          name: "H3K27ac (renamed)",
          data: {
            method: "remote",
            format: "bigwig",
            url: "https://example.com/h3k27ac.bw",
          },
        }),
      ]),
    ).toEqual([]);
  });

  it("does NOT consider same name + URL but different format a duplicate", () => {
    expect(
      mgr.findDuplicates([
        makeChannel({
          name: "H3K27ac",
          data: {
            method: "remote",
            format: "bam", // changed
            url: "https://example.com/h3k27ac.bw",
          },
        }),
      ]),
    ).toEqual([]);
  });

  it("ignores `style` / `plot` / `group` / `order` when matching", () => {
    // Style is presentation only — re-importing the same source with new
    // styling should still be flagged as a duplicate so the user knows.
    const dup = makeChannel({
      name: "H3K27ac",
      plot: "score_curve", // changed
      style: { height: 120, foreground: "#ff0000" } as any,
      group: { name: "Custom", style: { color: "#000" } } as any,
      order: 99,
      data: {
        method: "remote",
        format: "bigwig",
        url: "https://example.com/h3k27ac.bw",
      },
    });
    expect(mgr.findDuplicates([dup])).toEqual([dup]);
  });

  it("returns ONLY the duplicates from a mixed batch, preserving input order", () => {
    const fresh1 = makeChannel({
      name: "ATAC-seq",
      data: {
        method: "remote",
        format: "bigwig",
        url: "https://example.com/atac.bw",
      },
    });
    const dup1 = makeChannel({
      name: "H3K27ac",
      data: {
        method: "remote",
        format: "bigwig",
        url: "https://example.com/h3k27ac.bw",
      },
    });
    const fresh2 = makeChannel({
      name: "ChIP-seq REST",
      data: {
        method: "remote",
        format: "bigwig",
        url: "https://example.com/rest.bw",
      },
    });
    const dup2 = makeChannel({
      name: "RNA-seq",
      data: {
        method: "remote",
        format: "bam",
        url: "https://example.com/rnaseq.bam",
      },
    });
    const out = mgr.findDuplicates([fresh1, dup1, fresh2, dup2]);
    expect(out).toEqual([dup1, dup2]);
  });

  it("returns empty when both sides lack data blocks (no source to compare)", () => {
    const noData = new ChannelManager(
      makeStubDelegate([{ name: "X", plot: "bar" } as IChannel]),
    );
    expect(
      noData.findDuplicates([{ name: "X", plot: "bar" } as IChannel]),
    ).toEqual([]);
  });

  // ── Local-file (blob: URL) special case ──────────────────────────────

  it("treats two `blob:` URLs as the SAME source when name + format + method match", () => {
    // Re-importing the same local file via the file picker mints a fresh
    // blob: URL each time — the string compare must NOT be used.
    const blobMgr = new ChannelManager(
      makeStubDelegate([
        makeChannel({
          name: "track.bw",
          data: {
            method: "remote",
            format: "bigwig",
            url: "blob:https://app/abc-123",
          },
        }),
      ]),
    );
    const second = makeChannel({
      name: "track.bw",
      data: {
        method: "remote",
        format: "bigwig",
        url: "blob:https://app/xyz-999", // fresh blob URL, same file
      },
    });
    expect(blobMgr.findDuplicates([second])).toEqual([second]);
  });

  it("does NOT match a blob URL against a remote URL even when name + format align", () => {
    // Without fetching content we can't prove the local file and the
    // hosted URL hold the same data, so refuse to claim duplicate.
    const blobMgr = new ChannelManager(
      makeStubDelegate([
        makeChannel({
          name: "track.bw",
          data: {
            method: "remote",
            format: "bigwig",
            url: "blob:https://app/abc-123",
          },
        }),
      ]),
    );
    const remote = makeChannel({
      name: "track.bw",
      data: {
        method: "remote",
        format: "bigwig",
        url: "https://example.com/track.bw",
      },
    });
    expect(blobMgr.findDuplicates([remote])).toEqual([]);
  });
});
