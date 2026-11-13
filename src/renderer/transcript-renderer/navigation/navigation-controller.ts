import { tssGenomicInterval } from "../utils/tss-region";
import {
  CDSCoordinateMapper,
  parseCDSFromTranscriptAPI,
  parseExonsFromTranscriptAPI,
  parseTranscriptFeaturesFromAPI,
  mergeTranscriptStructure,
} from "../utils/cds";
import { loadTranscriptFromGff } from "../data/parser/transcript-from-gff";
import {
  isSqliteTranscriptUrl,
  isRbiIndexUrl,
  loadTranscriptFromSqlite,
  resolveRegionFromSqlite,
} from "../data/parser/transcript-from-sqlite";
import { ChannelView } from "../channel/index";
import { ModalDialog } from "../dialog";
import type {
  BaseRenderer,
  NavigationChangeEvent,
} from "../core/base-renderer";
import { logger } from "../utils/logger";

export class NavigationController {
  private _pendingAnnotationRegion: {
    chrom: string;
    start: number;
    end: number;
  } | null = null;

  constructor(private readonly r: BaseRenderer) {}

  /** Fires on explicit navigation and on interactive pan/zoom. */
  public _onNavigationChange: ((event: NavigationChangeEvent) => void) | null =
    null;

  public _extractTranscriptInfo(json: any, transcriptName: string): void {
    const regionData = json?.results?.region;
    if (!regionData) return;

    const regions: any[] = Array.isArray(regionData)
      ? regionData
      : [regionData];
    const match =
      regions.find(
        (r: any) =>
          r.trans_name === transcriptName || r.trans_id === transcriptName,
      ) ?? regions[0];
    if (!match) return;

    this.r._transcriptInfo = {
      gene_id: match.gene_id ?? "",
      trans_id: match.trans_id ?? "",
      trans_name: match.trans_name ?? transcriptName,
      gene_name: match.gene_name ?? "",
      trans_type: match.trans_type ?? "",
      gene_type: match.gene_type ?? match.gene_biotype ?? "",
    };
  }
  public async fetchTranscriptInfo(transcriptName: string): Promise<void> {
    const baseUrl = this.r.config.annotation?.transcripts;
    if (!baseUrl) return;

    if (isSqliteTranscriptUrl(baseUrl)) {
      this.r.channelController.notifyFilterGeneChannels();
      return;
    }

    const browserRegionUrl = baseUrl.replace(/\/rna\//, "/browser_region/");
    const url = `${browserRegionUrl.replace(/\/$/, "")}/${encodeURIComponent(transcriptName)}/auto/5000/`;


    try {
      const res = await fetch(url);
      if (!res.ok) {
        logger.warn(
          `[Renderer] fetchTranscriptInfo: HTTP ${res.status} for "${transcriptName}"`,
        );
        return;
      }
      const json = await res.json();
      if (json?.status !== 1 || !json?.results?.region) {
        logger.warn(
          `[Renderer] fetchTranscriptInfo: no region in response for "${transcriptName}"`,
        );
        return;
      }

      const regions: any[] = Array.isArray(json.results.region)
        ? json.results.region
        : [json.results.region];
      const match =
        regions.find(
          (r: any) =>
            r.trans_name === transcriptName || r.trans_id === transcriptName,
        ) ?? regions[0];
      if (!match) return;

      // Same shape / fallbacks as `_extractTranscriptInfo` above —
      // see that method for the rationale on `gene_name`/`gene_type`.
      this.r._transcriptInfo = {
        gene_id: match.gene_id ?? "",
        trans_id: match.trans_id ?? "",
        trans_name: match.trans_name ?? transcriptName,
        gene_name: match.gene_name ?? "",
        trans_type: match.trans_type ?? "",
        gene_type: match.gene_type ?? match.gene_biotype ?? "",
      };


      // Now that we have the real gene_id, notify channels with filterGene
      // to re-fetch their data with the gene filter applied.
      this.r.channelController.notifyFilterGeneChannels();
    } catch (err) {
      logger.warn(
        `[Renderer] fetchTranscriptInfo failed for "${transcriptName}":`,
        err,
      );
    }
  }
  public _buildNavigationEvent(
    chr: string,
    start: number,
    end: number,
    source: NavigationChangeEvent["source"],
  ): NavigationChangeEvent {
    const tx = this.r._transcriptInfo;
    const rna = this.r._rnaInfo;
    const cds = this.r._cdsInfo;
    const event: NavigationChangeEvent = {
      chr,
      start,
      end,
      source,
      gene_name: tx?.gene_name ?? "",
      gene_id: tx?.gene_id ?? "",
      transcript_name: tx?.trans_name ?? rna?.name ?? cds?.name ?? "",
      transcript_id: tx?.trans_id ?? "",
    };
    return event;
  }
  public setCdsCanvasNavigationCallback(cb: (() => void) | null): void {
    this.r._onCdsCanvasNavigation = cb;
  }
  public async _loadTranscriptJson(
    transcriptName: string,
    flank: number,
    opts?: { requireCds?: boolean },
  ): Promise<any | null> {
    const baseUrl = this.r.config.annotation?.transcripts;
    if (!baseUrl) return null;

    if (this._pendingAnnotationRegion) {
      const ann = this._annotationSource();
      if (ann) {
        return await loadTranscriptFromGff(
          ann.url,
          ann.index,
          transcriptName,
          this._pendingAnnotationRegion,
        );
      }
    }

    if (isRbiIndexUrl(baseUrl)) {
      const region = await resolveRegionFromSqlite(
        baseUrl,
        transcriptName,
      ).catch(() => null);
      const gffJson = await this._loadStructureFromGff(
        transcriptName,
        region,
        flank,
      );
      if (gffJson) return gffJson;
      // Last resort: region only — still navigates, nav-bar just has no parts.
      return await loadTranscriptFromSqlite(baseUrl, transcriptName);
    }

    // Packaged catalogue with structure; GFF recovery guards rows lacking exon/CDS.
    if (isSqliteTranscriptUrl(baseUrl)) {
      const sqliteJson = await loadTranscriptFromSqlite(
        baseUrl,
        transcriptName,
      );
      const hasStructure =
        parseTranscriptFeaturesFromAPI(sqliteJson).length > 0;
      if (!hasStructure) {
        const reg = sqliteJson?.results?.region;
        const region =
          reg?.chrom && reg.start != null && reg.end != null
            ? { chrom: reg.chrom, start: reg.start, end: reg.end }
            : await resolveRegionFromSqlite(baseUrl, transcriptName).catch(
                () => null,
              );
        const gffJson = await this._loadStructureFromGff(
          transcriptName,
          region,
          flank,
        );
        if (gffJson) return gffJson;
      }
      return sqliteJson;
    }

    const url = `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(transcriptName)}/auto/${flank}/1000/`;
    const res = await fetch(url);
    if (!res.ok)
      throw new Error(
        `HTTP ${res.status} fetching transcript "${transcriptName}"`,
      );
    const apiJson = await res.json();

    // Search-only endpoints (e.g. mm10) return region but no CDS structure —
    // recover it from the reference GFF and graft onto the API identity.
    if (opts?.requireCds && parseCDSFromTranscriptAPI(apiJson).length === 0) {
      const reg = apiJson?.results?.region;
      const region =
        reg?.chrom && reg.start != null && reg.end != null
          ? { chrom: reg.chrom, start: reg.start, end: reg.end }
          : null;
      const gffJson = await this._loadStructureFromGff(
        transcriptName,
        region,
        flank,
      );
      return mergeTranscriptStructure(apiJson, gffJson);
    }
    return apiJson;
  }
  private _annotationSource(): {
    url: string;
    index: string | undefined;
  } | null {
    const ref = this.r.referenceManager?.getConfig();
    const url = ref?.transcriptome?.annotation?.url;
    if (!url) return null;
    return { url, index: ref?.transcriptome?.annotation?.index };
  }
  private async _loadStructureFromGff(
    transcriptName: string,
    region: { chrom: string; start: number; end: number } | null,
    flank: number,
  ): Promise<any | null> {
    if (!region?.chrom || region.start == null || region.end == null) {
      return null;
    }
    const ann = this._annotationSource();
    if (!ann) return null;
    // Catalogue is 1-based inclusive → 0-based for tabix; pad by flank.
    const start0 = region.start - 1;
    const gffJson = await loadTranscriptFromGff(
      ann.url,
      ann.index,
      transcriptName,
      {
        chrom: region.chrom,
        start: Math.max(0, start0 - flank),
        end: region.end + flank,
      },
    );
    if (gffJson && parseTranscriptFeaturesFromAPI(gffJson).length > 0) {
      return gffJson;
    }
    return null;
  }
  public async navigateByTranscriptCDS(
    transcriptName: string,
    flank: number,
  ): Promise<void> {
    const baseUrl = this.r.config.annotation?.transcripts;
    if (!baseUrl) {
      logger.warn(
        `[Renderer] navigateByTranscriptCDS: annotation.transcripts URL is not configured.`,
      );
      return;
    }

    // Capture mode + reference-navigation generations so we can detect if the
    // user switched modes OR references while we were waiting for the response.
    const gen = this.r._modeGeneration;
    const navGen = this.r._navGeneration;

    let json: any;
    try {
      json = await this._loadTranscriptJson(transcriptName, flank, {
        requireCds: true,
      });
      if (!json) {
        logger.error(
          `[Renderer] navigateByTranscriptCDS: no record for "${transcriptName}".`,
        );
        return;
      }
    } catch (err) {
      logger.error(`[Renderer] navigateByTranscriptCDS failed:`, err);
      return;
    }

    // Abort if renderer was destroyed while awaiting fetch
    if (this.r.isDestroyed) return;
    // Abort if the user switched modes while we were fetching
    if (this.r._modeGeneration !== gen) return;
    // Abort if the active reference changed while we were fetching
    if (this.r._navGeneration !== navGen) return;

    const region = json?.results?.region;
    if (!region) {
      logger.error(
        `[Renderer] navigateByTranscriptCDS: no region in response for "${transcriptName}"`,
      );
      return;
    }

    // GFF recovery already ran, so empty here means genuinely no CDS
    // (e.g. non-coding) — surface it rather than fail silently.
    const cdsIntervals = parseCDSFromTranscriptAPI(json);
    if (cdsIntervals.length === 0) {
      logger.warn(
        `[Renderer] navigateByTranscriptCDS: no CDS data found for "${transcriptName}"`,
      );
      const label = region.trans_name || transcriptName;
      void ModalDialog.alert(
        "No CDS available",
        `"${label}" has no coding sequence (CDS), so CDS mode can't be shown. ` +
          `This is expected for non-coding transcripts.`,
        { warning: true },
      );
      return;
    }

    // API returns 1-based closed coordinates [start, end].
    // Convert to 0-based half-open for internal consistency.
    const txStart: number = (region.start ?? 1) - 1;
    const txEnd: number = region.end ?? 0;
    const strand: "+" | "-" = region.strand === "-" ? "-" : "+";
    const chr: string = region.chrom ?? region.chr ?? this.r.config.region.chr;


    const mapper = new CDSCoordinateMapper(cdsIntervals, strand);

    // Also keep for export so CDS coords remain available after leaving CDS mode
    this.r._exportCdsMapper = mapper;

    // Build exon mapper for mRNA coordinate export (introns collapsed)
    const exonIntervals = parseExonsFromTranscriptAPI(json);
    if (exonIntervals.length > 0) {
      this.r._exportExonMapper = new CDSCoordinateMapper(exonIntervals, strand);
    } else {
      this.r._exportExonMapper = null;
    }

    // Parse all transcript features for the CDS nav bar
    this.r._transcriptFeatures = parseTranscriptFeaturesFromAPI(json);
    this.r._cdsFlank = flank;

    // If already in CDS mode, clear the old mapper BEFORE navigating
    // so channels don't apply stale CDS transforms to the new data.
    if (this.r._cdsMapper) {
      this.r._cdsMapper = null;
      this.r._cdsInfo = null;
      this.r._axisView?.setCdsMode(false);
      this.r.rootView.children.forEach((child) => {
        if (child instanceof ChannelView) {
          child.setCdsMapper(null);
        }
      });
      // Restore interaction controller to genomic bounds for navigateTo
      if (this.r.interactionController) {
        const prevChr = this.r.config.region?.chr ?? "";
        const { minStart, maxEnd } = this.r.chrom.chromBounds(prevChr);
        this.r.interactionController.updateOptions({ minStart, maxEnd });
      }
    }

    // Disable RNA mode if active.
    if (this.r._rnaInfo) {
      this.r._rnaInfo = null;
      this.r._axisView?.setRnaMode(false);
    }

    // Update buildin channel URLs.  Use the RESOLVED transcript identity
    // (trans_name preferred — the buildin GFF matcher keys on
    // `transcript_name`, then `transcript_id`) rather than the raw query
    // string, which may be a gene name / versionless id the catalogue
    // resolved to a concrete isoform.
    this.r.channelController.updateBuildinChannelUrls(
      this.r.channelController._resolveBuildinId(region, transcriptName),
      flank,
    );

    // Extract transcript info before navigateTo so the callback has current data.
    this._extractTranscriptInfo(json, transcriptName);

    this.navigateTo(chr, txStart - flank, txEnd + flank);

    const tssPos = strand === "+" ? txStart : txEnd;

    // Enable CDS mode (transforms viewDomain to CDS space).
    this.r.axisController.enableCdsMode(mapper, {
      strand,
      chr,
      name: region.trans_name || transcriptName,
      tssPos,
      txStart,
      txEnd,
    });

    // Fetch gene_id from browser_region API then re-process filterGene channels
    this.fetchTranscriptInfo(transcriptName);
  }
  public async navigateByTranscript(
    transcriptName: string,
    flank: number,
  ): Promise<void> {
    const baseUrl = this.r.config.annotation?.transcripts;
    if (!baseUrl) {
      logger.warn(
        `[Renderer] navigateByTranscript: annotation.transcripts URL is not configured.`,
      );
      return;
    }

    // Capture mode + reference-navigation generations so we can detect if the
    // user switched modes OR references while we were waiting for the response.
    const gen = this.r._modeGeneration;
    const navGen = this.r._navGeneration;

    let json: any;
    try {
      json = await this._loadTranscriptJson(transcriptName, flank);
      if (!json) {
        logger.error(
          `[Renderer] navigateByTranscript: no record for "${transcriptName}".`,
        );
        return;
      }
    } catch (err) {
      logger.error(`[Renderer] navigateByTranscript failed:`, err);
      return;
    }

    // Abort if renderer was destroyed while awaiting fetch
    if (this.r.isDestroyed) return;
    // Abort if the user switched modes while we were fetching
    if (this.r._modeGeneration !== gen) return;
    // Abort if the active reference changed while we were fetching
    if (this.r._navGeneration !== navGen) return;

    const region = json?.results?.region;
    if (!region) {
      logger.error(
        `[Renderer] navigateByTranscript: no region in response for "${transcriptName}"`,
      );
      return;
    }

    // API returns 1-based closed coordinates [start, end].
    // Convert to 0-based half-open for internal consistency.
    const txStart: number = (region.start ?? 1) - 1;
    const txEnd: number = region.end ?? 0;
    const strand: "+" | "-" = region.strand === "-" ? "-" : "+";
    const chr: string = region.chrom ?? region.chr ?? this.r.config.region.chr;

    // TSS = transcription start site (depends on strand)
    const tssPos = strand === "+" ? txStart : txEnd;


    // Update buildin channel URLs to load data for the new transcript.
    // This replaces the old transcript name in any `method: "buildin"` channel
    // URL so that navigateTo → loadData fetches the correct transcript data.
    // Use the RESOLVED transcript identity (trans_name preferred — the buildin
    // GFF matcher keys on `transcript_name`, then `transcript_id`) rather than
    // the raw query string, which may be a gene name / versionless id the
    // catalogue resolved to a concrete isoform.
    this.r.channelController.updateBuildinChannelUrls(
      this.r.channelController._resolveBuildinId(region, transcriptName),
      flank,
    );

    // Build CDS mapper for coordinate export (even without CDS mode)
    const cdsIntervals = parseCDSFromTranscriptAPI(json);
    if (cdsIntervals.length > 0) {
      this.r._exportCdsMapper = new CDSCoordinateMapper(cdsIntervals, strand);
    } else {
      this.r._exportCdsMapper = null;
    }

    // Build exon mapper for mRNA coordinate export (introns collapsed)
    const exonIntervals = parseExonsFromTranscriptAPI(json);
    if (exonIntervals.length > 0) {
      this.r._exportExonMapper = new CDSCoordinateMapper(exonIntervals, strand);
    } else {
      this.r._exportExonMapper = null;
    }

    // Parse all transcript features for the RNA/CDS nav bar
    this.r._transcriptFeatures = parseTranscriptFeaturesFromAPI(json);
    this.r._cdsFlank = flank;

    // Extract transcript info from the response we already have so that
    // _buildNavigationEvent() returns current (not stale) gene/transcript data.
    this._extractTranscriptInfo(json, transcriptName);

    // MUST run before navigateTo(): it refreshes _lastTranscriptCoords /
    // _rnaInfo.chr, which the buildin channels read to build their GFF query.
    // Otherwise they re-fetch with the PREVIOUS transcript's chr → 0 records.
    this.r.axisController.enableRnaMode({
      tssPos,
      strand,
      chr,
      name: region.trans_name || transcriptName,
      txStart,
      txEnd,
    });

    // Navigate to the flanked region
    this.navigateTo(chr, txStart - flank, txEnd + flank);

    // Fetch gene_id from browser_region API (rna API doesn't include it)
    // then notify filterGene channels to re-fetch with the real gene_id.
    this.fetchTranscriptInfo(transcriptName);
  }
  public async navigateByTranscriptTss(name: string, start: number, end: number, mode: "rna" | "dna" = "rna"): Promise<void> {
    tssGenomicInterval({ tssPos: 0, strand: "+" }, start, end);
    this.r.incrementModeGeneration();
    if (this.r.axisController.isCdsMode) this.r.disableCdsMode();
    const flank = Math.max(Math.abs(start), Math.abs(end));
    await this.navigateByTranscriptAsymmetric(name, flank, flank, { start, end, mode });
  }
  public async navigateByTranscriptAsymmetric(
    transcriptName: string,
    upstream: number,
    downstream: number,
    tssRange?: { start: number; end: number; mode: "rna" | "dna" },
  ): Promise<void> {
    const baseUrl = this.r.config.annotation?.transcripts;
    if (!baseUrl) return;
    // Capture mode + reference-navigation generations so we can detect if the
    // user switched modes OR references while we were waiting for the response.
    const gen = this.r._modeGeneration;
    const navGen = this.r._navGeneration;
    const flank = Math.max(upstream, downstream);
    let json: any;
    try {
      json = await this._loadTranscriptJson(transcriptName, flank);
      if (!json) {
        logger.error(
          `[Renderer] navigateByTranscriptAsymmetric: no record for "${transcriptName}".`,
        );
        return;
      }
    } catch (err) {
      logger.error(`[Renderer] navigateByTranscriptAsymmetric failed:`, err);
      return;
    }

    // Abort if renderer was destroyed while awaiting fetch
    if (this.r.isDestroyed) return;
    // Abort if the user switched modes while we were fetching
    if (this.r._modeGeneration !== gen) return;
    // Abort if the active reference changed while we were fetching
    if (this.r._navGeneration !== navGen) return;

    const region = json?.results?.region;
    if (!region) return;
    // API returns 1-based closed coordinates [start, end].
    // Convert to 0-based half-open for internal consistency.
    const txStart: number = (region.start ?? 1) - 1;
    const txEnd: number = region.end ?? 0;
    const strand: "+" | "-" = region.strand === "-" ? "-" : "+";
    const chr: string = region.chrom ?? region.chr ?? this.r.config.region.chr;
    const tssPos = strand === "+" ? txStart : txEnd;
    // Guard against malformed/empty SQLite rows: refuse to navigate when
    // missing coords would fall back to the previous reference's chr and
    // silently render the wrong locus.
    if (!region.chrom || region.start == null || region.end == null) {
      logger.error(
        `[Renderer] navigateByTranscriptAsymmetric: incomplete region for "${transcriptName}" (chrom/start/end missing); aborting navigation.`,
      );
      return;
    }
    // Must use the RESOLVED identity (buildin GFF matcher keys on
    // transcript_name/_id); a raw gene name would match nothing.
    const resolvedBuildinId = this.r.channelController._resolveBuildinId(
      region,
      transcriptName,
    );
    this.r.channelController.updateBuildinChannelUrls(
      resolvedBuildinId,
      Math.max(upstream, downstream),
    );
    this.r._buildinUpstream = upstream;
    this.r._buildinDownstream = downstream;
    // Build CDS mapper for coordinate export (even without CDS mode)
    const cdsIntervals = parseCDSFromTranscriptAPI(json);
    if (cdsIntervals.length > 0) {
      this.r._exportCdsMapper = new CDSCoordinateMapper(cdsIntervals, strand);
    } else {
      this.r._exportCdsMapper = null;
    }

    // Build exon mapper for mRNA coordinate export (introns collapsed)
    const exonIntervals = parseExonsFromTranscriptAPI(json);
    if (exonIntervals.length > 0) {
      this.r._exportExonMapper = new CDSCoordinateMapper(exonIntervals, strand);
    } else {
      this.r._exportExonMapper = null;
    }

    // Parse transcript features for the RNA transcript nav bar
    this.r._transcriptFeatures = parseTranscriptFeaturesFromAPI(json);
    this.r._cdsFlank = Math.max(upstream, downstream);

    // Extract transcript info before navigateTo so the callback has current data.
    this._extractTranscriptInfo(json, transcriptName);

    // MUST run before navigateTo(): it refreshes _lastTranscriptCoords /
    // _rnaInfo.chr, which the buildin channels read to build their GFF query.
    // Otherwise they re-fetch with the PREVIOUS transcript's chr → 0 records.
    this.r.axisController.enableRnaMode({
      tssPos,
      strand,
      chr,
      name: region.trans_name || transcriptName,
      txStart,
      txEnd,
    });

    if (tssRange) {
      const interval = tssGenomicInterval({ tssPos, strand }, tssRange.start, tssRange.end);
      if (tssRange.mode === "dna") this.r.disableRnaMode();
      this.navigateTo(chr, interval.start, interval.end);
    } else {
      this.navigateTo(chr, txStart - upstream, txEnd + downstream);
    }

    // Fetch gene_id from browser_region API then re-process filterGene channels
    this.fetchTranscriptInfo(transcriptName);
  }
  public async navigateByTranscriptAnnotation(
    transcriptName: string,
    dna: { chrom: string; start: number; end: number },
    upstream: number = 5000,
    downstream: number = 5000,
  ): Promise<void> {
    // Pad the query window by the flank so the transcript is comfortably
    // inside the scanned region even when the configured dna span is tight.
    const flank = Math.max(upstream, downstream);
    this._pendingAnnotationRegion = {
      chrom: dna.chrom,
      start: Math.max(0, dna.start - flank),
      end: dna.end + flank,
    };
    try {
      await this.navigateByTranscriptAsymmetric(
        transcriptName,
        upstream,
        downstream,
      );
    } finally {
      this._pendingAnnotationRegion = null;
    }
  }
  public navigateTo(chr: string, start: number, end: number): void {
    if (this.r.isDestroyed) return;
    // Normalise chromosome name: ensure standard human chromosomes always
    // carry the "chr" prefix (e.g. API may return "1" instead of "chr1").
    if (/^(\d+|X|Y|M|MT)$/i.test(chr)) chr = `chr${chr}`;
    this.r.config.region = { ...this.r.config.region, chr, start, end };
    this.r.viewDomain = this.r._cdsMapper
      ? this.r._cdsMapper.transformDomain(start, end)
      : { start, end };
    if (this.r._cdsInfo) this.r._cdsInfo.genomicDomain = { start, end };
    // Update interaction bounds for the new chromosome
    if (this.r.interactionController) {
      this.r.interactionController.updateOptions(this.r.axisController.navigationBounds);
    }
    // Update axis navigation bar for the (possibly new) chromosome
    this._updateAxisNavBar(chr);
    this.r.requestRepaint?.();
    this.r.loadData();

    this._onNavigationChange?.(
      this._buildNavigationEvent(chr, start, end, "navigate"),
    );
  }
  public _updateAxisNavBar(chr: string): void {
    if (!this.r._axisView) return;
    const size = this.r.chrom.getChromSize(chr);
    const prevSize = (this.r._axisView as any)._chromSize ?? 0;
    if (!size) {
      this.r._axisView.setChromSize(0);
      return;
    }
    this.r._axisView.setChromSize(
      size,
      (center: number) => {
        const halfSpan = (this.r.viewDomain.end - this.r.viewDomain.start) / 2;
        const newStart = Math.max(0, Math.round(center - halfSpan));
        const newEnd = Math.min(size, Math.round(center + halfSpan));
        this.navigateTo(chr, newStart, newEnd);
      },
      (start: number, end: number) => {
        // Edge-drag resize callback
        this.navigateTo(chr, Math.round(start), Math.round(end));
      },
    );
    // Update cytoband ideogram for this chromosome
    const bands = this.r.chrom.getCytobandBands(chr);
    this.r._axisView.setCytobands(bands);

    // Update transcript marker on the nav bar
    this._updateNavTranscriptMarker();

    // If the nav bar just appeared (or disappeared), re-layout so the axis
    // height allocation updates (axis grows by NAV_BAR_HEIGHT px).
    if ((prevSize === 0) !== (size === 0)) {
      if (this.r.container) {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.r.container.getBoundingClientRect();
        this.r.rootView.layout(0, 0, rect.width * dpr, rect.height * dpr);
      }
    }
  }
  public _updateNavTranscriptMarker(): void {
    if (!this.r._axisView) return;
    let txStart = 0;
    let txEnd = 0;
    let mode: "dna" | "rna" | "cds" = "dna";

    // Pull genomic txStart/txEnd from whichever info is available,
    // falling back to the persistent _lastTranscriptCoords.
    if (this.r._cdsInfo) {
      txStart = this.r._cdsInfo.txStart;
      txEnd = this.r._cdsInfo.txEnd;
    } else if (this.r._rnaInfo) {
      txStart = this.r._rnaInfo.txStart;
      txEnd = this.r._rnaInfo.txEnd;
    } else if (this.r._lastTranscriptCoords) {
      txStart = this.r._lastTranscriptCoords.txStart;
      txEnd = this.r._lastTranscriptCoords.txEnd;
    }

    if (this.r.axisController.isCdsMode) {
      mode = "cds";
    } else if (this.r.axisController.isRnaMode) {
      mode = "rna";
    } else {
      mode = "dna";
    }

    this.r._axisView.setActiveTranscript(txStart, txEnd, mode, {
      chromosome: this.r._cdsInfo?.chr ?? this.r._rnaInfo?.chr ?? this.r.config.region.chr,
      transcriptName: this.r._cdsInfo?.name ?? this.r._rnaInfo?.name ?? "",
    });
  }
}
