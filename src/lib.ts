/**
 * RBrowser – Transcript Browser Renderer
 */

// ── Core renderer ──────────────────────────────────────────────────────────
export { TranscriptBrowserRenderer } from "./renderer/transcript-renderer/renderer";

// ── Configuration types ────────────────────────────────────────────────────
export type {
  IRBrowerConfig,
  ITRConfig,
  IRendererConfig,
  ITargetConfig,
  IRegionConfig,
  IGridConfig,
  IAnnotationConfig,
  IReferenceConfig,
  ISpeciesInfo,
  IAssemblyInfo,
  IFastaReference,
  IAnnotationReference,
  ITranscriptomeReference,
  IChromSizesReference,
  ICytobandReference,
  IGenomeReference,
  ILocus,
  ILocusRna,
  ILocusDna,
  IChannelLabelConfig,
  IHeaderPanelConfig,
  ISettingsConfig,
  IPanelsSettings,
  IHeaderPanelsSettings,
  IPanelToggle,
  IGridSettings,
  GridDisplay,
  RenderQuality,
  ViewMode,
} from "./renderer/transcript-renderer/config/config";

// ── Channel types ──────────────────────────────────────────────────────────
export type {
  IChannel,
  IChannelAnnotation,
  IChannelData,
  IChannelStyle,
  IChannelLabelStyle,
} from "./renderer/transcript-renderer/channel";

// ── Axis types ─────────────────────────────────────────────────────────────
export type { IAxisConfig } from "./renderer/transcript-renderer/axis";

// ── Loading types ──────────────────────────────────────────────────────────
export type { ILoadingConfig } from "./renderer/transcript-renderer/loading";

// ── Event / interaction types ──────────────────────────────────────────────
export type {
  IDomain,
  InteractionMode,
} from "./renderer/transcript-renderer/events";

// ── Navigation change event ────────────────────────────────────────────────
export type { NavigationChangeEvent } from "./renderer/transcript-renderer/core/base-renderer";

// ── Tooltip / Cursor types ─────────────────────────────────────────────────
export type {
  TooltipMode,
  TooltipTrigger,
} from "./renderer/transcript-renderer/tooltip";
export type {
  CursorMode,
  CursorCoordMode,
} from "./renderer/transcript-renderer/cursor";

// ── Highlight types ────────────────────────────────────────────────────────
export type { IHighlightRegion } from "./renderer/transcript-renderer/highlight";
export { HighlightManager } from "./renderer/transcript-renderer/highlight";

// ── History manager ────────────────────────────────────────────────────────
export { historyManager } from "./renderer/transcript-renderer/history";

// ── Favourite manager ──────────────────────────────────────────────────────
export {
  FavouriteManager,
  favouriteManager,
} from "./renderer/transcript-renderer/favourite";

// ── Channel manager ────────────────────────────────────────────────────────
export { ChannelManager } from "./renderer/transcript-renderer/channel/manager/channel-manager";
export type {
  IChannelManagerDelegate,
  ChannelManagerEvent,
  ChannelManagerListener,
} from "./renderer/transcript-renderer/channel/manager/channel-manager";
export type {
  FavouriteEvent,
  FavouriteListener,
} from "./renderer/transcript-renderer/favourite";

// ── Reference manager ──────────────────────────────────────────────────────
export { ReferenceManager } from "./renderer/transcript-renderer/reference/reference-manager";
export type {
  ReferenceManagerEvent,
  ReferenceManagerListener,
  ITrans,
} from "./renderer/transcript-renderer/reference/reference-manager";

// ── Header panel manager ───────────────────────────────────────────────────
export { HeaderPanelManager } from "./renderer/transcript-renderer/header/header-panel-manager";
export type {
  HeaderButtonId,
  HeaderPanelEvent,
  HeaderPanelEventDetail,
  HeaderPanelListener,
} from "./renderer/transcript-renderer/header/header-panel-manager";

// ── Renderer state types ───────────────────────────────────────────────────
export type { IRendererState } from "./renderer/transcript-renderer/core/status";
export { RendererStatus } from "./renderer/transcript-renderer/core/status";

// ── Default config ─────────────────────────────────────────────────────────
export { defaultConfig } from "../config/default_config";
export type {
  DefaultConfig,
  IFeaturePartConfig,
} from "../config/default_config";

// ── Header base channels (predefined RNA annotation tracks) ────────────────
export { headerBase } from "../config/header_base";

// ── Test config (full demo configuration) ──────────────────────────────────
export { rendererRNAConfigTEST } from "../config/transcript-browser-data_base";

// ── QTLs test config ───────────────────────────────────────────────────────
export { rendererRNAConfigTEST as rendererQTLsConfig } from "../config/transcript-browser-data_QTLs";

// ── Highlight test config ──────────────────────────────────────────────────
export { rendererHighlightConfig } from "../config/transcript-browser-data_Highlight";

// ── Full browser with header (React App component) ────────────────────────
export { default as App } from "./App";

// ── mountBrowser — one-call full browser with header ───────────────────────
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import App from "./App";
import { TranscriptBrowserRenderer as _TBR } from "./renderer/transcript-renderer/renderer";

/** Handle returned by mountBrowser. */
export interface BrowserHandle {
  renderer: _TBR;
  /** Tear down the browser and release all resources. */
  unmount: () => void;
}

/**
 * Mount the full RBrowser (with the Browser Header toolbar) into a DOM
 * container. React is bundled internally — consumers do NOT need to install it.
 */
export function mountBrowser(containerId: string): BrowserHandle {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(
      `[RBrowser] Container element #${containerId} not found in the DOM.`,
    );
  }

  let renderer: _TBR | null = null;
  const origMount = _TBR.prototype.mount;
  _TBR.prototype.mount = function (this: _TBR) {
    // Not a `const self = this` closure alias — this is a one-shot patch that
    // hands the instance back to the outer scope, which is the whole point.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    renderer = this;
    _TBR.prototype.mount = origMount; // restore immediately
    return origMount.call(this);
  };

  const root: Root = createRoot(container);
  try {
    flushSync(() => root.render(React.createElement(App)));
  } finally {
    _TBR.prototype.mount = origMount; // safety restore if mount never ran
  }

  if (!renderer) {
    throw new Error(
      "[RBrowser] Failed to capture the renderer instance during mount.",
    );
  }

  return {
    renderer,
    unmount: () => root.unmount(),
  };
}

// ── Version ────────────────────────────────────────────────────────────────
export const VERSION = "1.0.70";

export type { WheelMode } from "./renderer/transcript-renderer/events/wheel-mode";
