import {
  CDSCoordinateMapper,
  parseCDSFromTranscriptAPI,
  parseExonsFromTranscriptAPI,
} from "../utils/cds";
import { ChannelView } from "../channel/index";
import { InteractionMode } from "../events";
import type { BaseRenderer } from "../core/base-renderer";

/**
 * Coordinate-mode behaviour: enter/leave RNA & CDS modes, CDS-space pan/zoom,
 * apply a CDS domain, resolve a transcript's genomic DNA span. The mode state
 * (rnaInfo / cdsInfo / cdsMapper / …) stays on the renderer as shared
 * read-state; this controller drives the transitions.
 */
export class AxisController {
  constructor(private readonly r: BaseRenderer) {}

  /** Optional hook called when RNA mode is enabled or disabled. */
  public _onRnaModeChange:
    | ((
        enabled: boolean,
        info?: { tssPos: number; strand: "+" | "-"; chr: string; name: string },
      ) => void)
    | null = null;

  /** Optional hook called when CDS mode is enabled or disabled. */
  public _onCdsModeChange:
    | ((
        enabled: boolean,
        info?: { strand: "+" | "-"; chr: string; name: string },
      ) => void)
    | null = null;

  /** True when in RNA coordinate mode (offsets from TSS). */
  get isRnaMode(): boolean {
    return this.r._rnaInfo !== null;
  }

  /**
   * Current RNA info (TSS position, strand, chromosome, transcript name).
   * Returns `null` when in DNA (genomic coordinate) mode.
   */
  get rnaInfo(): {
    tssPos: number;
    strand: "+" | "-";
    chr: string;
    name: string;
    txStart: number;
    txEnd: number;
  } | null {
    return this.r._rnaInfo ? { ...this.r._rnaInfo } : null;
  }

  /** True when the renderer is in CDS mode (introns collapsed). */
  get isCdsMode(): boolean {
    return this.r._cdsMapper !== null && this.r._cdsInfo !== null;
  }

  /** Current CDS mode info. */
  get cdsInfo(): {
    strand: "+" | "-";
    chr: string;
    name: string;
  } | null {
    return this.r._cdsInfo
      ? {
          strand: this.r._cdsInfo.strand,
          chr: this.r._cdsInfo.chr,
          name: this.r._cdsInfo.name,
        }
      : null;
  }

  /** The active CDS coordinate mapper (null when not in CDS mode). */
  get cdsMapper(): CDSCoordinateMapper | null {
    return this.r._cdsMapper;
  }

  /** Chromosome limits expressed in the current display coordinate system. */
  get navigationBounds(): { minStart: number; maxEnd: number } {
    const chr = this.r.config.region?.chr ?? "";
    const bounds = this.r.chrom.chromBounds(chr);
    return this.r._cdsMapper
      ? this.r._cdsMapper.getCDSBounds(bounds.minStart, bounds.maxEnd)
      : bounds;
  }

  public enableRnaMode(info: {
    tssPos: number;
    strand: "+" | "-";
    chr: string;
    name: string;
    txStart: number;
    txEnd: number;
  }): void {
    this.r._rnaInfo = info;
    this.r._tssContext = { ...info };
    this.r._lastTranscriptCoords = { txStart: info.txStart, txEnd: info.txEnd };
    this.r._axisView?.setRnaMode(
      true,
      info.tssPos,
      info.strand,
      info.txStart,
      info.txEnd,
    );
    // Pass transcript features to axis for RNA transcript nav bar
    this.r._axisView?.setTranscriptFeatures(
      this.r._transcriptFeatures,
      info.txStart,
      info.txEnd,
      this.r._buildinUpstream,
      this.r._buildinDownstream,
      info.strand,
      (genomicCenter: number) => {
        // RNA mode: click/pan on transcript nav → navigate in genomic coords
        // Clamp viewport to transcript range so highlight stays within ideogram
        const halfSpan = (this.r.viewDomain.end - this.r.viewDomain.start) / 2;
        const chr = info.chr;
        const { minStart: rangeStart, maxEnd: rangeEnd } = this.r.chrom.chromBounds(chr);
        let newStart = Math.round(genomicCenter - halfSpan);
        let newEnd = Math.round(genomicCenter + halfSpan);
        if (newStart < rangeStart) {
          newEnd += rangeStart - newStart;
          newStart = rangeStart;
        }
        if (newEnd > rangeEnd) {
          newStart -= newEnd - rangeEnd;
          newEnd = rangeEnd;
        }
        newStart = Math.max(rangeStart, newStart);
        newEnd = Math.min(rangeEnd, newEnd);
        this.r.navigateTo(chr, newStart, newEnd);
        this.enableRnaMode(info);
      },
      (gStart: number, gEnd: number) => {
        // RNA mode: resize on transcript nav → clamp to transcript range
        const chr = info.chr;
        const { minStart: rangeStart, maxEnd: rangeEnd } = this.r.chrom.chromBounds(chr);
        const clampedStart = Math.max(rangeStart, Math.round(gStart));
        const clampedEnd = Math.min(rangeEnd, Math.round(gEnd));
        this.r.navigateTo(chr, clampedStart, clampedEnd);
        this.enableRnaMode(info);
      },
    );
    this.r.navigationController._updateNavTranscriptMarker();
    // Defer the external mode-change notification to a microtask.  Callers
    // such as `navigateByTranscript[Asymmetric]` invoke `enableRnaMode()`
    // BEFORE `navigateTo()` (so the buildin channels pick up the new
    // transcript coordinates).  That means `viewDomain` is still the PREVIOUS
    // view when we reach this point, while `_rnaInfo` is already the new
    // transcript — so `viewRnaRegion` would compute a bogus up/down (e.g.
    // `TKFC-214:0:46159084`).  By deferring, the synchronous `navigateTo()`
    // that follows has already refreshed `viewDomain`, so the callback reads
    // the correct flank (e.g. `TKFC-214:5000:5000`).
    queueMicrotask(() => {
      if (this.r._rnaInfo === info) this._onRnaModeChange?.(true, info);
    });
    this.r.requestRepaint?.();
  }

  public disableRnaMode(): void {
    this.r._rnaInfo = null;
    this.r._axisView?.setRnaMode(false);
    this.r._axisView?.setTranscriptFeatures([], 0, 0, 0, 0, "+");
    this.r.navigationController._updateNavTranscriptMarker();
    this._onRnaModeChange?.(false);
    this.r.requestRepaint?.();
  }

  public setCdsModeChangeCallback(
    cb: (
      enabled: boolean,
      info?: { strand: "+" | "-"; chr: string; name: string },
    ) => void,
  ): void {
    this._onCdsModeChange = cb;
  }

  public enableCdsMode(
    mapper: CDSCoordinateMapper,
    info: {
      strand: "+" | "-";
      chr: string;
      name: string;
      tssPos: number;
      txStart: number;
      txEnd: number;
    },
  ): void {
    // Save current genomic viewDomain before transforming
    this.r._cdsInfo = {
      strand: info.strand,
      chr: info.chr,
      name: info.name,
      genomicDomain: { ...this.r.viewDomain },
      tssPos: info.tssPos,
      txStart: info.txStart,
      txEnd: info.txEnd,
    };
    this.r._lastTranscriptCoords = { txStart: info.txStart, txEnd: info.txEnd };
    this.r._cdsMapper = mapper;
    this.r._tssContext = { ...info };

    // Convert viewDomain from genomic → CDS space
    const cdsDomain = mapper.transformDomain(
      this.r.viewDomain.start,
      this.r.viewDomain.end,
    );
    this.r.viewDomain = cdsDomain;

    // Update interaction controller bounds to CDS space
    if (this.r.interactionController) {
      this.r.interactionController.updateOptions(this.navigationBounds);
    }

    // Set axis to CDS mode
    this.r._axisView?.setCdsMode(true, mapper);
    // Pass transcript features to axis for the CDS transcript nav bar
    this.r._axisView?.setTranscriptFeatures(
      this.r._transcriptFeatures,
      info.txStart,
      info.txEnd,
      this.r._cdsFlank,
      this.r._cdsFlank,
      info.strand,
      (genomicCenter: number) => {
        // CDS mode: click on transcript nav → jump to CDS position
        if (!this.r._cdsMapper) return;
        const cdsCenter = this.r._cdsMapper.genomicToCDS(genomicCenter);
        const halfSpan = (this.r.viewDomain.end - this.r.viewDomain.start) / 2;
        this._applyCdsDomain(
          { start: cdsCenter - halfSpan, end: cdsCenter + halfSpan },
          "pan",
        );
      },
      (gStart: number, gEnd: number) => {
        // CDS mode: resize on transcript nav → set CDS domain
        if (!this.r._cdsMapper) return;
        const cdsStart = this.r._cdsMapper.genomicToCDS(gStart);
        const cdsEnd = this.r._cdsMapper.genomicToCDS(gEnd);
        this._applyCdsDomain({ start: cdsStart, end: cdsEnd }, "zoom");
      },
    );
    this.r.navigationController._updateNavTranscriptMarker();

    // Propagate CDS mapper to all channels for data transformation
    this.r.rootView.children.forEach((child) => {
      if (child instanceof ChannelView) {
        child.setCdsMapper(mapper);
      }
    });

    this._onCdsModeChange?.(true, info);
    this.r.requestRepaint?.();
  }

  public disableCdsMode(): void {
    if (this.r._cdsInfo && this.r._cdsMapper) {
      // Keep the window reached by CDS pan/zoom when returning to DNA or RNA.
      const mapper = this.r._cdsMapper;
      this.r.viewDomain = {
        start: mapper.cdsToGenomic(this.r.viewDomain.start),
        end: mapper.cdsToGenomic(this.r.viewDomain.end),
      };
      this.r.config.region = { ...this.r.config.region, chr: this.r._cdsInfo.chr, ...this.r.viewDomain };
    }

    // Restore interaction controller bounds to genomic space
    if (this.r.interactionController) {
      const chr = this.r.config.region?.chr ?? "";
      const { minStart, maxEnd } = this.r.chrom.chromBounds(chr);
      this.r.interactionController.updateOptions({ minStart, maxEnd });
    }

    // Reset axis
    this.r._axisView?.setCdsMode(false);
    this.r._axisView?.setTranscriptFeatures([], 0, 0, 0, 0, "+");
    this.r.navigationController._updateNavTranscriptMarker();

    // Clear CDS mapper from channels
    this.r.rootView.children.forEach((child) => {
      if (child instanceof ChannelView) {
        child.setCdsMapper(null);
      }
    });

    this.r._cdsMapper = null;
    this.r._cdsInfo = null;
    this.r.navigationController._updateNavTranscriptMarker();
    this._onCdsModeChange?.(false);

    // Reload data in genomic coordinates
    this.r.loadData();
    this.r.requestRepaint?.();
  }

  public _resetCoordinateModes(): void {
    const wasCds = this.isCdsMode;
    const wasRna = this.isRnaMode;

    this.r._cdsMapper = null;
    this.r._cdsInfo = null;
    this.r._rnaInfo = null;
    this.r._exportCdsMapper = null;
    this.r._exportExonMapper = null;
    this.r._lastTranscriptCoords = null;
    this.r._tssContext = null;
    this.r._transcriptFeatures = [];

    // Reset axis transforms back to plain genomic coordinates.
    this.r._axisView?.setCdsMode(false);
    this.r._axisView?.setRnaMode(false);
    this.r._axisView?.setTranscriptFeatures([], 0, 0, 0, 0, "+");
    this.r.navigationController._updateNavTranscriptMarker();

    // Drop CDS mappers from any surviving channels (syncChannels rebuilds the
    // reference channels, but user channels persist across a switch).
    this.r.rootView.children.forEach((child) => {
      if (child instanceof ChannelView) child.setCdsMapper(null);
    });

    // Notify the UI so the mode badge falls back to DNA before re-navigation.
    if (wasCds) this._onCdsModeChange?.(false);
    if (wasRna) this._onRnaModeChange?.(false);
  }

  public panCdsView(frac: number): void {
    if (!this.isCdsMode || !this.r._cdsMapper) return;
    const span = this.r.viewDomain.end - this.r.viewDomain.start;
    this._applyCdsDomain(
      {
        start: this.r.viewDomain.start + span * frac,
        end: this.r.viewDomain.end + span * frac,
      },
      "pan",
    );
  }

  public zoomCdsView(factor: number): void {
    if (!this.isCdsMode || !this.r._cdsMapper) return;
    const center = (this.r.viewDomain.start + this.r.viewDomain.end) / 2;
    const halfSpan =
      (this.r.viewDomain.end - this.r.viewDomain.start) / (2 * factor);
    this._applyCdsDomain(
      { start: center - halfSpan, end: center + halfSpan },
      "zoom",
    );
  }

  private _applyCdsDomain(
    domain: { start: number; end: number },
    mode: InteractionMode,
  ): void {
    if (!this.r._cdsMapper) return;

    const bounds = this.navigationBounds;
    const maxSpan = bounds.maxEnd - bounds.minStart;
    const effectiveMinSpan = Math.max(10, this.r.browserWidth / 20);

    // Remember unclamped edges for boundary-hit detection
    const rawStart = domain.start;
    const rawEnd = domain.end;

    // Clamp span
    let span = domain.end - domain.start;
    span = Math.min(maxSpan, Math.max(effectiveMinSpan, span));
    const center = (domain.start + domain.end) / 2;
    domain.start = center - span / 2;
    domain.end = center + span / 2;

    // Shift to stay within bounds (preserve span)
    if (domain.start < bounds.minStart) {
      domain.end += bounds.minStart - domain.start;
      domain.start = bounds.minStart;
    }
    if (domain.end > bounds.maxEnd) {
      domain.start -= domain.end - bounds.maxEnd;
      domain.end = bounds.maxEnd;
    }
    domain.start = Math.max(bounds.minStart, Math.round(domain.start));
    domain.end = Math.min(bounds.maxEnd, Math.round(domain.end));

    // Boundary feedback
    if (this.r.boundaryFeedback) {
      const sides: Array<"left" | "right"> = [];
      if (
        rawStart < bounds.minStart &&
        Math.abs(domain.start - bounds.minStart) < 1
      )
        sides.push("left");
      if (rawEnd > bounds.maxEnd && Math.abs(domain.end - bounds.maxEnd) < 1)
        sides.push("right");
      if (sides.length > 0) this.r.boundaryFeedback.flash(sides);
    }

    this.r.viewDomain = domain;
    this.r.requestRepaint?.();

    // Dispatch navigation to channels (genomic coordinates)
    const chr = this.r.config.region?.chr ?? "";
    const genomicStart = this.r._cdsMapper.cdsToGenomic(domain.start);
    const genomicEnd = this.r._cdsMapper.cdsToGenomic(domain.end);
    const visibleRegion = { chr, start: genomicStart, end: genomicEnd };
    if (this.r._cdsInfo) {
      this.r._cdsInfo.genomicDomain = { start: genomicStart, end: genomicEnd };
    }
    this.r.navigationController._onNavigationChange?.(
      this.r.navigationController._buildNavigationEvent(chr, genomicStart, genomicEnd, mode),
    );
    this.r.rootView.children.forEach((child) => {
      if (child instanceof ChannelView) {
        child.handleNavigation(visibleRegion, mode);
      }
    });
  }

  public async resolveTranscriptDNA(
    transcriptName: string,
    flank: number,
  ): Promise<string | null> {
    const baseUrl = this.r.config.annotation?.transcripts;
    if (!baseUrl) return null;

    try {
      const json = await this.r.navigationController._loadTranscriptJson(transcriptName, flank);
      if (!json) return null;
      const region = json?.results?.region;
      if (!region) return null;
      const txStart: number = (region.start ?? 1) - 1;
      const txEnd: number = region.end ?? 0;
      const strand: "+" | "-" = region.strand === "-" ? "-" : "+";
      const chr: string = region.chrom ?? region.chr ?? this.r.config.region.chr;
      const start = Math.max(0, txStart - flank);
      const end = txEnd + flank;

      // Set transcript state so buildin channels and mode switching work.
      // Use the RESOLVED transcript identity (trans_name preferred — the
      // buildin GFF matcher keys on `transcript_name`, then `transcript_id`)
      // rather than the raw query string, which may be a gene name /
      // versionless id the catalogue resolved to a concrete isoform.
      this.r.channelController.updateBuildinChannelUrls(
        this.r.channelController._resolveBuildinId(region, transcriptName),
        flank,
      );

      const cdsIntervals = parseCDSFromTranscriptAPI(json);
      if (cdsIntervals.length > 0) {
        this.r._exportCdsMapper = new CDSCoordinateMapper(cdsIntervals, strand);
      } else {
        this.r._exportCdsMapper = null;
      }

      const exonIntervals = parseExonsFromTranscriptAPI(json);
      if (exonIntervals.length > 0) {
        this.r._exportExonMapper = new CDSCoordinateMapper(exonIntervals, strand);
      } else {
        this.r._exportExonMapper = null;
      }

      this.r.navigationController._extractTranscriptInfo(json, transcriptName);
      this.r.navigationController.fetchTranscriptInfo(transcriptName);

      // Persist transcript coordinates so the cytoband marker can show position
      this.r._lastTranscriptCoords = { txStart, txEnd };
      this.r._tssContext = { tssPos: strand === "+" ? txStart : txEnd, strand, chr, name: region.trans_name || transcriptName, txStart, txEnd };
      this.r.navigationController._updateNavTranscriptMarker();

      return `${chr}:${start}-${end}`;
    } catch {
      return null;
    }
  }

}
