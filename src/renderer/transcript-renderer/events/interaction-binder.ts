import { resolveWheelAction } from "./wheel-mode";
import { InteractionController, IDomain, InteractionMode } from "./index";
import { BoundaryFeedback } from "./boundary-feedback";
import { ChannelView } from "../channel/index";
import type { BaseRenderer } from "../core/base-renderer";

/**
 * Wires the low-level InteractionController (pan / zoom / drag),
 * boundary-feedback, and the Alt+wheel channel-scroll handler onto the
 * renderer's canvas container, translating gestures into navigation / view
 * updates.
 */
export class InteractionBinder {
  constructor(private readonly r: BaseRenderer) {}

  attach(container: HTMLElement): void {
    this.r.interactionController?.detach();

    // Clean up previous Alt+wheel handler
    if (this.r._altWheelHandler && this.r.container) {
      this.r.container.removeEventListener("wheel", this.r._altWheelHandler);
      this.r._altWheelHandler = null;
    }

    // Set initial chromosome bounds (may be empty until chromsizes loads)
    const chr = this.r.config.region?.chr ?? "";
    const { minStart, maxEnd } = this.r.axisController.navigationBounds;

    // Data-layer navigation dispatching:
    //
    //  • Pan  → leading throttle (100 ms): fire immediately on first event,
    //           suppress duplicates within the window.  Pan data is served
    //           from the tile cache so responsiveness matters more than
    //           avoiding extra fetches.
    //
    //  • Zoom → trailing debounce (350 ms): fire only after the user stops
    //           scrolling.  This prevents issuing a new network request for
    //           every wheel tick during a continuous zoom gesture.
    //
    const PAN_THROTTLE_MS = 100;
    const ZOOM_DEBOUNCE_MS = 350;

    let lastPanTime = 0;
    let pendingPanRaf: number | null = null;
    let zoomDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    const fireNavigation = (
      visibleRegion: { chr: string; start: number; end: number },
      mode: InteractionMode,
    ) => {
      this.r.rootView.children.forEach((child) => {
        if (child instanceof ChannelView) {
          child.handleNavigation(visibleRegion, mode);
        }
      });

      // Fire external navigation-change callback (throttled same as data layer)
      this.r.navigationController._onNavigationChange?.(
        this.r.navigationController._buildNavigationEvent(
          visibleRegion.chr,
          visibleRegion.start,
          visibleRegion.end,
          mode === "pan" ? "pan" : "zoom",
        ),
      );
    };

    const dispatchNavigation = (
      visibleRegion: { chr: string; start: number; end: number },
      mode: InteractionMode,
    ) => {
      if (mode === "pan") {
        // Throttle: fire on leading edge, schedule a trailing call
        const now = performance.now();
        if (now - lastPanTime >= PAN_THROTTLE_MS) {
          lastPanTime = now;
          if (pendingPanRaf !== null) {
            cancelAnimationFrame(pendingPanRaf);
            pendingPanRaf = null;
          }
          fireNavigation(visibleRegion, mode);
        } else if (pendingPanRaf === null) {
          const r = { ...visibleRegion };
          pendingPanRaf = requestAnimationFrame(() => {
            pendingPanRaf = null;
            lastPanTime = performance.now();
            fireNavigation(r, mode);
          });
        }
      } else {
        // Zoom: trailing debounce — reset timer on every event, fire once idle
        if (zoomDebounceTimer !== null) clearTimeout(zoomDebounceTimer);
        const r = { ...visibleRegion };
        zoomDebounceTimer = setTimeout(() => {
          zoomDebounceTimer = null;
          fireNavigation(r, mode);
        }, ZOOM_DEBOUNCE_MS);
      }
    };

    this.r.interactionController = new InteractionController({
      getDomain: () => this.r.viewDomain,
      getViewWidth: () => {
        const dpr = window.devicePixelRatio || 1;
        return (this.r.rootView as any).width
          ? (this.r.rootView as any).width / dpr
          : container.getBoundingClientRect().width;
      },
      onDomainChange: (domain: IDomain, mode: InteractionMode) => {
        // Visual update – every frame, keeps pan/zoom smooth
        this.r.viewDomain = domain;
        this.r.requestRepaint?.();

        // Notify CDS canvas interaction
        if (this.r.axisController.isCdsMode) {
          this.r._onCdsCanvasNavigation?.();
        }

        // Data layer update – throttled to avoid flooding tile cache
        const chr = this.r.config.region?.chr ?? "";

        // In CDS mode, viewDomain is in CDS coordinates.
        // Convert back to genomic for the ScreenDataManager.
        if (this.r.axisController.isCdsMode && this.r._cdsMapper) {
          const genomicStart = this.r._cdsMapper.cdsToGenomic(domain.start);
          const genomicEnd = this.r._cdsMapper.cdsToGenomic(domain.end);
          if (this.r._cdsInfo) {
            this.r._cdsInfo.genomicDomain = { start: genomicStart, end: genomicEnd };
          }
          dispatchNavigation(
            { chr, start: genomicStart, end: genomicEnd },
            mode,
          );
        } else {
          dispatchNavigation(
            { chr, start: domain.start, end: domain.end },
            mode,
          );
        }
      },
      minSpan: 10,
      maxBpPixelRatio: 20,
      minStart,
      maxEnd,
      enableInertia: this.r.config.renderer?.enableInertia ?? true,
      getWheelMode: () => this.r.getWheelMode(),
      onBoundaryHit: (sides) => {
        this.r.boundaryFeedback?.flash(sides);
      },
    });

    this.r.interactionController.attach(container);

    // ── Boundary feedback overlay ─────────────────────────────────────
    this.r.boundaryFeedback?.destroy();
    this.r.boundaryFeedback = new BoundaryFeedback(container);

    // Route wheel scrolling using the same mode as the zoom controller.
    this.r._altWheelHandler = (e: WheelEvent) => {
      const dpr = window.devicePixelRatio || 1;
      const rawDelta = e.deltaY * (e.deltaMode !== 0 ? 120 : 1);
      const action = resolveWheelAction(this.r.getWheelMode(), e);

      // The active action owns scrolling; zoom is handled by the controller.
      if (action === "scroll") {
        // Always swallow the event so the browser never page-zooms.
        e.preventDefault();
        e.stopPropagation();
        if (this.r.rootView.needsScroll) {
          // Use the same scroll-offset + relayout path as the scrollbar
          // thumb drag so the channel positions actually update (markDirty
          // alone only repaints without re-running layout).
          this.r.rootView.scrollBy(rawDelta * dpr);
          this.r.scrollbar.update();
          this.r._relayoutAndRepaint();
        }
        return;
      }

      if (action !== "subchannel") return;

      const rect = container.getBoundingClientRect();
      const mouseY = (e.clientY - rect.top) * dpr; // device pixels

      // First, try scrolling within the channel under the cursor
      // (sub-channel groups, transcript lanes, BAM reads, variant rows).
      const channel = this.r.channelController.findChannelAtY(mouseY);
      if (channel) {
        const handled = channel.altWheelScroll(rawDelta);
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
          this.r.requestRepaint?.();
          return;
        }
      }

      // Fall back to scrolling the global channel list.
      if (this.r.rootView.needsScroll) {
        e.preventDefault();
        e.stopPropagation();
        this.r.rootView.scrollBy(rawDelta * dpr);
        this.r._relayoutAndRepaint();
      }
    };
    container.addEventListener("wheel", this.r._altWheelHandler, {
      passive: false,
    });

    // Listen for the axis DNA/RNA toggle button (button only shown in RNA mode)
    container.addEventListener("axis:toggleRnaMode", (() => {
      // The button only appears in RNA mode, so clicking always switches to DNA mode
      this.r.disableRnaMode();
    }) as EventListener);
    // Load chromsizes + cytobands asynchronously; update bounds once ready
    Promise.all([
      this.r.chrom.loadChromSizes(this.r.config.annotation?.chromsizes),
      this.r.chrom.loadCytobands(this.r.config.annotation?.cytoband),
    ]).then(() => {
      if (!this.r.interactionController) return;
      const chr = this.r.config.region?.chr ?? "";
      const { minStart: ms, maxEnd: me } = this.r.axisController.navigationBounds;
      this.r.interactionController.updateOptions({ minStart: ms, maxEnd: me });
      // Also clamp the current viewDomain in case the user already zoomed out
      // beyond the real chromosome end before the file finished loading.
      this.r.viewDomain = {
        start: Math.max(ms, this.r.viewDomain.start),
        end: Math.min(me, this.r.viewDomain.end),
      };
      // Update the axis navigation bar with the chromosome size
      this.r.navigationController._updateAxisNavBar(chr);
      this.r.requestRepaint?.();
    });
  }
}
