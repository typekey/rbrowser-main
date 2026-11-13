import type { IChannel } from "../channel-types";

/** The order used by the config, DOM and pinned/scrollable layout. */
export function sortChannelConfigs<T extends IChannel>(channels: T[]): T[] {
  return channels
    .map((channel, index) => ({ channel, index }))
    .sort((a, b) => {
      const pin =
        Number(b.channel.style?.pinned === true) -
        Number(a.channel.style?.pinned === true);
      if (pin) return pin;
      const order =
        (a.channel.order ?? Infinity) - (b.channel.order ?? Infinity);
      return order || a.index - b.index;
    })
    .map((entry) => entry.channel);
}

/** A real built-in annotation channel for a browser created without channels. */
export function defaultAnnotationChannel(): IChannel {
  return {
    name: "Transcript Structure",
    plot: "rect",
    style: { height: 40, pinned: true },
    data: { method: "buildin", format: "transcript", source: "annotation" },
  };
}
