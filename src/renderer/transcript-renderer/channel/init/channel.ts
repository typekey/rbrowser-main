import { IChannel } from "../index";
import { merge } from "lodash";
import { defaultConfig } from "../../../../../config/default_config";

import {
  defaultAnnotationChannel,
  sortChannelConfigs,
} from "../manager/channel-order";

const channelDefaults = defaultConfig.channels;
const commonStyle = channelDefaults._common.style;

/**
 * Default channel configuration (common baseline).
 * These values will be used if not specified in user config.
 */
export const defaultChannelConfig: Partial<IChannel> = {
  plot: "rect",
  style: {
    height: commonStyle.height,
    foreground: commonStyle.foreground,
    background: commonStyle.background,
    label: commonStyle.label,
    padding: commonStyle.padding,
    detailZoom: commonStyle.detailZoom,
  },
};

/**
 * Plot type defaults based on data format
 */
const formatToPlotMap: { [key: string]: string } = {
  bigwig: "bar",
  bw: "bar",
  bigbed: "rect",
  bed: "rect",
  gff: "transcript",
  gff3: "transcript",
  vcf: "diamondX",
  bam: "bam",
  cram: "rect",
  fasta: "sequence",
  fa: "sequence",
  fna: "sequence",
  ism: "motif",
};

/**
 * Resolve the plot-specific default style block from defaultConfig.
 * Falls back to `_common` for unknown plot types.
 */
function getPlotDefaults(plotType: string): Record<string, any> {
  const plotKey = plotType as keyof typeof channelDefaults;
  if (plotKey !== "_common" && plotKey in channelDefaults) {
    return channelDefaults[plotKey] as Record<string, any>;
  }
  return {};
}

/**
 * Initialize a single channel configuration.
 * Merges: _common defaults  ←  plot-type defaults  ←  user config
 */
export function initChannelConfig(channel: IChannel): IChannel {
  // Determine data format
  let dataFormat = "bed";
  if (channel.data && typeof channel.data === "object") {
    dataFormat = (channel.data.format || "bed").toLowerCase();
  }

  // Normalize format aliases
  if (dataFormat === "bw") dataFormat = "bigwig";
  if (dataFormat === "bb") dataFormat = "bigbed";

  // Auto-detect plot type from format if not specified
  const plotType = channel.plot || formatToPlotMap[dataFormat] || "rect";

  // Get plot-specific defaults from defaultConfig
  const plotDefaults = getPlotDefaults(plotType);

  // Create merged config: common → plot defaults → user
  const mergedConfig: IChannel = merge(
    {},
    defaultChannelConfig,
    { plot: plotType },
    plotDefaults,
    channel,
    // Ensure data format is normalised
    channel.data
      ? {
          data: {
            ...channel.data,
            format: dataFormat,
          },
        }
      : {},
  );

  return mergedConfig;
}

/**
 * Initialize array of channel configurations
 * Also handles grouping and positioning
 */
export function initChannelsConfig(channels: IChannel[]): IChannel[] {
  const initializedChannels: IChannel[] = [];
  const groupPositionMap = new Map<string, number>();

  let currentPosition = 0;

  // Initialize each channel
  for (const channel of channels.length
    ? channels
    : [defaultAnnotationChannel()]) {
    // Initialize base config
    const initializedChannel = initChannelConfig(channel);

    // Handle grouping and positioning
    if (channel.group?.name) {
      const groupName = channel.group.name;

      // Assign position to group if not already assigned
      if (!groupPositionMap.has(groupName)) {
        groupPositionMap.set(groupName, currentPosition++);
      }

      // Set channel position based on group
      (initializedChannel as any).position = groupPositionMap.get(groupName)!;
    } else {
      // No group: assign individual position
      (initializedChannel as any).position = currentPosition++;
    }

    initializedChannels.push(initializedChannel);
  }

  // Sort by position (respects grouping)
  initializedChannels.sort((a: any, b: any) => {
    const posA = a.position || 0;
    const posB = b.position || 0;
    return posA - posB;
  });

  const ordered = sortChannelConfigs(initializedChannels);
  ordered[0].style = { ...ordered[0].style, pinned: true };
  return ordered;
}
