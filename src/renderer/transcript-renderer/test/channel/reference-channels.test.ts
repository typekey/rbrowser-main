import { describe, expect, it, vi } from "vitest";
import { ReferenceManager } from "../../reference/reference-manager";
import type { IReferenceConfig } from "../../config/config";
import type { IChannel } from "../../channel";

describe("reference channel replacement", () => {
  it("replaces built-in channels in one nonempty operation", async () => {
    const renderer = {
      applyReference: vi.fn(),
      channelManager: {
        replaceAll: vi.fn((_channels: IChannel[]) => {}),
        addDirect: vi.fn(),
      },
    };
    const reference = {
      assembly: { name: "test" },
      genome: {
        fasta: {
          url: "https://example.test/genome.fa",
          fai: "https://example.test/genome.fa.fai",
        },
      },
      transcriptome: { annotation: { url: "https://example.test/genes.gff" } },
    } as IReferenceConfig;
    await new ReferenceManager(renderer, [reference]).syncChannels();
    expect(renderer.channelManager.replaceAll).toHaveBeenCalledOnce();
    const channels = renderer.channelManager.replaceAll.mock.calls[0][0];
    expect(channels.map((channel: { name: string }) => channel.name)).toEqual([
      "Sequence",
      "Transcript",
      "Transcript Structure",
      "Exon",
      "Splice Junction",
    ]);
    expect(renderer.channelManager.addDirect).not.toHaveBeenCalled();
  });
});
