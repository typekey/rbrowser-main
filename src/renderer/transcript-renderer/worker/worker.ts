// Worker entry point
import { buildPromise } from "../data/promises";

self.onmessage = async (e: MessageEvent) => {
  const { type, payload, channelIndex } = e.data;

  if (type === "loadChannelData") {
    const { channel, region } = payload;

    if (!channel.data) {
      self.postMessage({
        type: "error",
        channelIndex,
        error: "No data configuration found",
      });
      return;
    }

    try {
      const data = await buildPromise({
        url: channel.data.url,
        index: channel.data.index,
        index2: channel.data.index2,
        indexFormat: channel.data.indexFormat,
        method: channel.data.method,
        content: channel.data.content,
        format:
          channel.data.format ||
          (channel.data.url?.endsWith("bed.gz") ? "bed" : "gff"),
        viewWidth: payload.viewWidth,
        region: {
          chr: region.chr,
          start: region.start,
          end: region.end,
        },
      });

      self.postMessage({
        type: "dataLoaded",
        channelIndex,
        data: data,
        name: channel.name,
      });
    } catch (error: any) {
      self.postMessage({
        type: "error",
        channelIndex,
        error: error.message,
        name: channel.name,
      });
    }
  }
};
