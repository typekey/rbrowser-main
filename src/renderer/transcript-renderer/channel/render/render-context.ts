import type { RenderState, RenderingContext, IChannel } from "../channel-types";
import type { FeatureRenderer } from "../../feature/feature";
import type { ChannelScrollUI } from "../components/channel-scroll-ui";

/**
 * Per-frame inputs a render view needs. Built once by
 * ChannelView.buildRenderContext() and passed to every view.render(ctx).
 *
 * Rule: shared/geometric inputs live here; channel-owned persistent state
 * (records, scroll offsets, DOM overlay refs) and the layout getters stay on
 * ChannelView and are reached through the view's back-reference.
 */
export interface RenderContext {
  /** The incoming per-frame state (visible genomic domain). */
  state: RenderState;
  /** WebGL2 / canvas context bundle (gl, canvas, theme, renderMode). */
  gc: RenderingContext;
  /** Layout geometry in CSS px (already computed by ChannelView.layout()). */
  x: number;
  y: number;
  width: number;
  height: number;
  paddingTop: number;
  paddingBottom: number;
  /** Channel config, current source features, and the loaded genomic region. */
  config: IChannel;
  data: any[];
  dataRegion: { chr: string; start: number; end: number };
  /** Collaborators the views draw through. */
  featureRenderer: FeatureRenderer | null;
  trackContainer: HTMLElement | null;
  scrollUI: ChannelScrollUI;
  /** Bound helpers so views don't reach back into ChannelView for these. */
  getEffectiveClip(): { y: number; height: number } | null;
  isAboveDetailZoom(domainSpan: number): boolean;
}

/** A cohesive group of draw calls for one plot concern. */
export interface IRenderView {
  render(ctx: RenderContext): void;
}
