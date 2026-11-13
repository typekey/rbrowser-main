import { ChannelView } from "../index";
import type { InteractionMode } from "../../events";
import { ChannelStatus } from "../status";
import { assignBamLanes } from "../../feature/plots/bam-lanes";
import { ScreenDataManager, IScreenRegion } from "../../data/screen";
import {
  transformGffToTranscripts,
  assignLanes,
  extractModifications,
} from "../../transcript";
import { logger } from "../../utils/logger";

/**
 * Per-channel data pipeline: fetch (ScreenDataManager + detailZoom guards +
 * downsampling) and heavy async processing (tile merge → filterGene → binning
 * → GPU upload → transcript/BAM/variant transforms). Reads and mutates channel
 * state through the ChannelView back-reference.
 */
export class ChannelDataPipeline {
  constructor(private readonly v: ChannelView) {}

  async loadData(region: { chr: string; start: number; end: number }) {
    // Sub-channels receive data from their parent — never fetch independently
    if (this.v._isSubChannel) return;

    // Deliberately do NOT early-return on an in-flight load. During a reference
    // switch, _addChannelDirect can fire loadData(stale-region) then navigateTo
    // fires loadData(target) immediately; dropping the second call would strand
    // the channel on the stale region. Re-entry is safe: the old ScreenDataManager
    // is destroyed below, so the old fetch's results have nowhere to deliver.

    // Preserve error state: if the channel previously failed and we're above
    // detailZoom, keep showing the error instead of overwriting with Completed.
    const previousError =
      this.v.state.status === ChannelStatus.Error ? this.v.state.error : null;

    this.v.setState({ status: ChannelStatus.Loading });
    this.v.dataRegion = {
      chr: region.chr,
      start: region.start,
      end: region.end,
    };

    // ── detailZoom guard: skip fetch when region exceeds threshold ──
    const regionSpanForZoom = region.end - region.start;
    const isTranscriptPlot =
      this.v.config.plot === "transcript" ||
      this.v.config.plot === "rna" ||
      this.v.config.plot === "simple_rna";
    const isBamPlot = this.v.config.plot === "bam";

    if (isTranscriptPlot && this.v.isAboveDetailZoom(regionSpanForZoom)) {
      // Above transcript detailZoom — skip fetch entirely
      this.v._txWasZoomedOut = true;
      if (previousError) {
        this.v.setState({ status: ChannelStatus.Error, error: previousError });
      } else {
        this.v.setState({ status: ChannelStatus.Completed, loadedRecords: 0 });
      }
      return;
    }

    const isVariantPlot = this.v.config.plot === "variant";
    if (isVariantPlot && this.v.isAboveDetailZoom(regionSpanForZoom)) {
      // Above variant detailZoom — skip fetch entirely
      this.v._variantWasZoomedOut = true;
      if (previousError) {
        this.v.setState({ status: ChannelStatus.Error, error: previousError });
      } else {
        this.v.setState({ status: ChannelStatus.Completed, loadedRecords: 0 });
      }
      return;
    }

    const isDiamondMotifPlot =
      this.v.config.plot === "diamond" || this.v.config.plot === "motif";
    if (isDiamondMotifPlot && this.v.isAboveDetailZoom(regionSpanForZoom)) {
      // Above diamond/motif detailZoom — skip fetch entirely
      this.v._diamondMotifWasZoomedOut = true;
      if (previousError) {
        this.v.setState({ status: ChannelStatus.Error, error: previousError });
      } else {
        this.v.setState({ status: ChannelStatus.Completed, loadedRecords: 0 });
      }
      return;
    }

    if (
      isBamPlot &&
      this.v.isAboveDetailZoom(regionSpanForZoom) &&
      this.v.isCoverageAboveDetailZoom(regionSpanForZoom)
    ) {
      // Both reads AND coverage are beyond their thresholds — skip fetch
      this.v._bamWasZoomedOut = true;
      if (previousError) {
        this.v.setState({ status: ChannelStatus.Error, error: previousError });
      } else {
        this.v.setState({ status: ChannelStatus.Completed, loadedRecords: 0 });
      }
      return;
    }

    // Create or reconfigure the screen manager for this channel
    this.v.screenManager?.destroy();

    // Cache window size scales with zoom: at genome-wide spans we don't need to
    // prefetch many tiles, so shrink the window to save memory.
    const regionSpan = region.end - region.start;
    const isBigBed =
      this.v.config.data?.format === "bigbed" ||
      this.v.config.data?.format === "bb";
    const isFastaFormat =
      this.v.config.data?.format === "fasta" ||
      this.v.config.data?.format === "fa" ||
      this.v.config.data?.format === "fna";

    // Buildin channels (junction, exon, transcript) fetch a fixed, transcript-
    // specific but NOT region-specific URL. Every tile resolves to the same URL,
    // so use screenDataNumber=1 to fetch once instead of wasting bandwidth.
    const isBuildin =
      this.v.config.data?.method === "buildin" ||
      this.v.config.data?.method === "built-in";

    // For BigBed at large zoom levels, use smaller cache window
    // Span > 100Mb: only cache current screen (screenDataNumber=1)
    // Span > 10Mb: cache 3 screens (default)
    // Span < 1Mb: cache 5 screens (smoother panning at detailed zoom)
    let screenDataNumber = 3; // default
    if (isBuildin) {
      screenDataNumber = 1; // fixed URL, no need for multiple tiles
    } else if (isFastaFormat) {
      // FASTA produces 1 record per bp — keep cache small
      screenDataNumber = 3;
    } else if (isBigBed) {
      if (regionSpan > 100_000_000) {
        screenDataNumber = 1; // Extreme genome-wide: minimal cache
      } else if (regionSpan > 10_000_000) {
        screenDataNumber = 1; // Large span: still minimal cache
      } else if (regionSpan < 1_000_000) {
        screenDataNumber = 5; // Detailed view: more prefetch
      }
    }

    this.v.screenManager = new ScreenDataManager({
      fetchData: async (screenRegion: IScreenRegion, level: number) => {
        // ── Universal detailZoom guard ──
        // Skip fetch when the tile region exceeds this channel's detail
        // threshold, preventing ScreenDataManager pre-fetch from firing enormous
        // requests at chromosome/genome scale. BAM uses the larger coverage
        // threshold so coverage can still be fetched at medium scales.
        const tileSpan = screenRegion.end - screenRegion.start;
        if (this.v.config.plot === "bam") {
          // BAM: block only when BOTH reads + coverage are beyond threshold
          if (
            this.v.isAboveDetailZoom(tileSpan) &&
            this.v.isCoverageAboveDetailZoom(tileSpan)
          ) {
            return [];
          }
        } else if (this.v.detailZoomThreshold > 0) {
          // All other plot types: respect their own detailZoom
          if (this.v.isAboveDetailZoom(tileSpan)) {
            return [];
          }
        }

        // Scale by zoom level for BigWig/bar plots only. BigBed/rect plots must
        // NOT use aggressive scale reduction — it can return empty data or switch
        // to incompatible summary modes.
        let scale: number | undefined = undefined;

        const isBarPlot =
          this.v.config.plot === "bar" ||
          this.v.config.plot === "bigwig" ||
          this.v.config.plot === "line" ||
          this.v.config.plot === "point" ||
          this.v.config.plot === "heatmap";
        const isBigWigFormat =
          this.v.config.data?.format === "bigwig" ||
          this.v.config.data?.format === "bw";
        const isBigBed =
          this.v.config.data?.format === "bigbed" ||
          this.v.config.data?.format === "bb";

        if (isBarPlot && isBigWigFormat) {
          // For BigWig bar plots: use exponential scale reduction at large zooms
          // scale = 1 / (2^level) maps level 0→1.0, level 5→0.03125, level 10→0.001
          scale = 1 / Math.pow(2, level);
        }

        const rawData = await this.v.dataLoader({
          chr: screenRegion.chr,
          start: screenRegion.start,
          end: screenRegion.end,
          scale: scale,
        });

        // For BigBed: apply data reduction at cache level
        // Strategy depends on plot type:
        // - "rect": merge adjacent features to create density visualization
        // - "diamond": downsample to keep discrete markers, preserving spatial distribution
        if (
          isBigBed &&
          rawData &&
          Array.isArray(rawData) &&
          rawData.length > 0
        ) {
          const isDiamondPlot = this.v.config.plot === "diamond";

          if (isDiamondPlot) {
            // ── DIAMOND: filterGene / filterTranscript BEFORE downsampling ──
            let filteredData = rawData;
            const fg = this.v.config.style?.foreground as any;
            const filterGeneField: string | undefined = fg?.filterGene;
            const filterTransField: string | undefined = fg?.filterTranscript;
            const keys: string[] | undefined = this.v.config.style?.keys as any;
            const sep: string | undefined = this.v.config.style?.sep as any;

            if ((filterGeneField || filterTransField) && keys && sep) {
              const tInfo =
                typeof this.v.getTranscriptInfo === "function"
                  ? this.v.getTranscriptInfo()
                  : null;

              // Require the relevant ID to be non-empty. The rna API doesn't
              // return gene_id; it arrives later from browser_region. Treat empty
              // IDs as "not yet available" so the cache is built unfiltered and
              // the safety-net in updateDataFromCacheAsync blocks rendering until
              // the ID is populated.
              const hasGeneId =
                !filterGeneField || (tInfo?.gene_id ?? "") !== "";
              const hasTransId =
                !filterTransField || (tInfo?.trans_id ?? "") !== "";

              if (tInfo && hasGeneId && hasTransId) {
                const geneIdx = filterGeneField
                  ? keys.indexOf(filterGeneField)
                  : -1;
                const transIdx = filterTransField
                  ? keys.indexOf(filterTransField)
                  : -1;
                const targetGene = tInfo.gene_id
                  ? tInfo.gene_id.split(".")[0]
                  : null;
                const targetTrans = tInfo.trans_id
                  ? tInfo.trans_id.split(".")[0]
                  : null;

                if (
                  (geneIdx >= 0 && targetGene) ||
                  (transIdx >= 0 && targetTrans)
                ) {
                  filteredData = filteredData.filter((rec: any) => {
                    if (!rec.rest) return true; // no rest → keep
                    // Cache tokens for downstream reuse
                    const tokens =
                      rec._tokens ?? (rec._tokens = rec.rest.split(sep));
                    if (geneIdx >= 0 && targetGene) {
                      const val = (tokens[geneIdx] ?? "").split(".")[0];
                      if (val !== targetGene) return false;
                    }
                    if (transIdx >= 0 && targetTrans) {
                      const val = (tokens[transIdx] ?? "").split(".")[0];
                      if (val !== targetTrans) return false;
                    }
                    return true;
                  });
                }
                // Mark that this cache was built WITH filtering
                (this as any)._cacheFilteredWithTranscriptInfo = true;
              } else {
                // transcriptInfo not yet available — mark cache as unfiltered
                (this as any)._cacheFilteredWithTranscriptInfo = false;
              }
            }

            // ── DIAMOND: stride-based downsampling ──
            // At level ≤ 9 keep ALL signals; above that, reduce count via stride
            // sampling. Stride sampling is deterministic and preserves spatial
            // distribution, so zooming doesn't cause sudden jumps. Target count
            // decreases smoothly via a continuous formula (no step-function jumps):
            //   targetCount = baseTarget / (1 + (level - threshold) * growthRate)
            const DETAIL_THRESHOLD = 9; // levels ≤ this → keep all
            const BASE_TARGET = 3000; // max records right above threshold
            const GROWTH_RATE = 0.4; // how fast the count shrinks per level

            if (
              level <= DETAIL_THRESHOLD ||
              filteredData.length <= BASE_TARGET
            ) {
              // Detailed view or few records: keep everything
              return filteredData;
            }

            // Smooth target: 3000, 2143, 1667, 1364, 1154, 1000, ... as level grows
            const levelsAbove = level - DETAIL_THRESHOLD;
            const targetCount = Math.max(
              200, // absolute minimum
              Math.round(BASE_TARGET / (1 + levelsAbove * GROWTH_RATE)),
            );

            if (filteredData.length <= targetCount) {
              return filteredData;
            }

            // Stride-based sampling: pick every Nth record
            // Sort first to ensure spatial order
            filteredData.sort((a: any, b: any) => {
              const startA = a.chromStart ?? a.start ?? 0;
              const startB = b.chromStart ?? b.start ?? 0;
              return startA - startB;
            });

            const stride = filteredData.length / targetCount;
            const sampled: any[] = [];
            // Pick evenly-spaced records: index 0, stride, 2*stride, ...
            // Using fractional accumulator for uniform distribution
            for (let i = 0; i < targetCount; i++) {
              const idx = Math.min(
                Math.round(i * stride),
                filteredData.length - 1,
              );
              sampled.push(filteredData[idx]);
            }

            // Clear filteredData to help GC
            filteredData.length = 0;

            return sampled;
          }

          // ── RECT (and other BigBed plots): merge adjacent features ──
          // Merge preserves density information across zoom levels.

          if (level > 9 && rawData.length > 50) {
            const regionSpan = screenRegion.end - screenRegion.start;

            // Higher level = more aggressive merging (larger distance)
            let mergeDistanceBp: number;
            if (level > 16) {
              mergeDistanceBp = regionSpan * 0.002; // 0.2% - extreme genome-wide view
            } else if (level > 15) {
              mergeDistanceBp = regionSpan * 0.001; // 0.1% - very large scale
            } else if (level > 14) {
              mergeDistanceBp = regionSpan * 0.0005; // 0.05% - large scale
            } else if (level > 13) {
              mergeDistanceBp = regionSpan * 0.0002; // 0.02% - large-medium scale
            } else if (level > 12) {
              mergeDistanceBp = regionSpan * 0.0001; // 0.01% - medium scale
            } else if (level > 11) {
              mergeDistanceBp = regionSpan * 0.00005; // 0.005% - medium-small scale
            } else if (level > 10) {
              mergeDistanceBp = regionSpan * 0.00002; // 0.002% - small-medium scale
            } else {
              // level 10: very conservative merging for smooth transition to detailed view
              mergeDistanceBp = regionSpan * 0.00001; // 0.001% - minimal merging
            }

            // Sort in-place to avoid array copy
            rawData.sort((a, b) => {
              const startA = a.chromStart ?? a.start ?? 0;
              const startB = b.chromStart ?? b.start ?? 0;
              return startA - startB;
            });

            const merged: any[] = [];
            let current: any | null = null;

            for (let i = 0; i < rawData.length; i++) {
              const feature = rawData[i];
              const featureStart = feature.chromStart ?? feature.start ?? 0;
              const featureEnd = feature.chromEnd ?? feature.end ?? 0;

              if (!current) {
                // New object so we can track merged count without mutating source
                current = { ...feature, __mergedCount: 1 };
              } else {
                const currentEnd = current.chromEnd ?? current.end ?? 0;
                const gap = featureStart - currentEnd;

                // Merge if features are close enough
                if (gap <= mergeDistanceBp) {
                  // Extend current feature to include this one
                  if (current.chromEnd !== undefined) {
                    current.chromEnd = Math.max(currentEnd, featureEnd);
                  } else if (current.end !== undefined) {
                    current.end = Math.max(currentEnd, featureEnd);
                  }
                  current.__mergedCount = (current.__mergedCount || 1) + 1;
                  // Keep the maximum score if available
                  if (
                    feature.score !== undefined &&
                    current.score !== undefined
                  ) {
                    current.score = Math.max(current.score, feature.score);
                  }
                } else {
                  // Gap too large, save current and start new
                  merged.push(current);
                  current = { ...feature, __mergedCount: 1 };
                }
              }
            }

            // Don't forget the last one
            if (current) {
              merged.push(current);
            }

            // Clear rawData to help GC
            rawData.length = 0;

            return merged;
          } else {
            // No merging: either too low level (detailed view) or too few records
            return rawData;
          }
        }

        return rawData;
      },
      onUpdate: () => this.scheduleDataUpdate(),
      onError: (err: any) => {
        const msg = err?.message || err?.toString?.() || "Data fetch failed";
        logger.error(`[${this.v.config.name}] data error:`, err);
        this.v.handleError(msg);
      },
      screenDataNumber: screenDataNumber,
    });

    // Initialize kicks off fetches for screen 0 and its neighbors
    this.v.screenManager.initialize({
      chr: region.chr,
      start: region.start,
      end: region.end,
    });
  }

  // ─── Async helpers ──
  /**
   * Re-process cached tile data through the full pipeline (merge → filterGene →
   * binning → GPU upload → distribute to sub-channels). Used when external state
   * (e.g. transcriptInfo) changes and the channel should be re-evaluated without
   * fetching new tiles.
   */
  reprocessCachedData(): void {
    if (this.v.screenManager) {
      this.scheduleDataUpdate();
    }
  }

  /**
   * Coalesce rapid `onUpdate` calls from ScreenDataManager into a single async
   * pass. Uses a global queue so channels are processed one at a time (with
   * yields between) instead of all firing in the same animation frame.
   */
  private scheduleDataUpdate(): void {
    if (this.v._destroyed) return;
    if (this.v._pendingUpdateFrame) return; // already queued
    this.v._pendingUpdateFrame = 1; // mark as pending (non-zero sentinel)
    ChannelView._channelQueue.add(this.v);
    // Kick the queue processor (no-op if already running)
    ChannelView._processQueue();
  }

  /**
   * Async version of `updateDataFromCache`.
   *
   * Heavy phases (tile merge → binning → transcript/BAM transform → GPU upload)
   * are separated by `yieldToMain()` so the browser can paint between them.
   *
   * A generation counter (`_dataGeneration`) is checked after every yield: if a
   * newer update was scheduled while yielding, this run aborts early so only the
   * latest data is applied.
   */
  public async updateDataFromCacheAsync(): Promise<void> {
    if (this.v._destroyed) return;
    if (!this.v.screenManager) return;

    const generation = ++this.v._dataGeneration;

    const state = this.v.screenManager.getState();
    if (!state) return;

    // ── Tile merge ────────────────────────────────────────────
    const merged: any[] = [];
    let minStart = Infinity;
    let maxEnd = -Infinity;
    const viewStart = state.current.region.start;
    const viewEnd = state.current.region.end;
    const viewSpan = viewEnd - viewStart;

    const visibleFeatures: Array<{
      start: number;
      end: number;
      score: number;
    }> = [];

    for (const [idx] of state.data) {
      const tileRegion = this.v.screenManager.screenRegion(idx);
      const records = state.data.get(idx) ?? [];

      for (const rec of records) {
        merged.push(rec);
        const recStart = rec.start ?? rec.chromStart ?? -Infinity;
        const recEnd = rec.end ?? rec.chromEnd ?? Infinity;
        const inView = recStart < viewEnd && recEnd > viewStart;
        if (inView && typeof rec.score === "number" && isFinite(rec.score)) {
          visibleFeatures.push({
            start: recStart,
            end: recEnd,
            score: rec.score,
          });
        }
      }
      minStart = Math.min(minStart, tileRegion.start);
      maxEnd = Math.max(maxEnd, tileRegion.end);
    }

    // Stale check after tile merge
    if (this.v._dataGeneration !== generation) return;

    // ── Pre-cache split tokens on records ──
    // For BigBed/diamond channels with `keys` + `sep`, `rec.rest.split(sep)`
    // runs in several later stages (filterGene, distributeDataToSubChannels,
    // updateData colorBy/sizeBy/alphaBy, refreshColorsOnly). Splitting once into
    // `rec._tokens` avoids redundant string ops — impactful for large eQTL/sQTL
    // datasets (50k+ records).
    {
      const sep: string | undefined = this.v.config.style?.sep as any;
      const keys: string[] | undefined = this.v.config.style?.keys as any;
      if (sep && keys && keys.length > 0 && merged.length > 0) {
        for (let i = 0; i < merged.length; i++) {
          const rec = merged[i];
          if (typeof rec.rest === "string" && rec.rest && !rec._tokens) {
            rec._tokens = rec.rest.split(sep);
          }
        }
      }
    }

    // ── filterGene / filterTranscript guard ──
    // Filtering happens at cache level (dataLoader callback, before downsampling)
    // so cached tiles already hold only gene-relevant records. Here we only:
    //   1. Block rendering when transcriptInfo isn't available yet (avoids a
    //      flash of unfiltered data).
    //   2. Apply the filter now as a safety net if the cache was built without
    //      it (tInfo was null at fetch time).
    {
      const fg = this.v.config.style?.foreground as any;
      const filterGeneField: string | undefined = fg?.filterGene;
      const filterTransField: string | undefined = fg?.filterTranscript;

      if (filterGeneField || filterTransField) {
        const tInfo =
          typeof this.v.getTranscriptInfo === "function"
            ? this.v.getTranscriptInfo()
            : null;

        if (!tInfo) {
          // transcriptInfo not available yet → skip rendering so unfiltered data
          // never flashes. When it arrives, notifyFilterGeneChannels() re-triggers
          // a refetch + reprocess.
          return;
        }

        // Also block if the relevant ID field is still empty. The rna API doesn't
        // include gene_id; it's fetched async from browser_region. Until then
        // gene_id is "" and the filter would be a no-op, causing an unfiltered flash.
        if (filterGeneField && !tInfo.gene_id) {
          return;
        }
        if (filterTransField && !tInfo.trans_id) {
          return;
        }

        // Safety net: if cache was built without filtering, apply here
        if (!(this as any)._cacheFilteredWithTranscriptInfo) {
          const keys: string[] | undefined = this.v.config.style?.keys as any;
          const sep: string | undefined = this.v.config.style?.sep as any;
          if (keys && sep) {
            const geneIdx = filterGeneField
              ? keys.indexOf(filterGeneField)
              : -1;
            const transIdx = filterTransField
              ? keys.indexOf(filterTransField)
              : -1;
            const targetGene = tInfo.gene_id
              ? tInfo.gene_id.split(".")[0]
              : null;
            const targetTrans = tInfo.trans_id
              ? tInfo.trans_id.split(".")[0]
              : null;

            if (
              (geneIdx >= 0 && targetGene) ||
              (transIdx >= 0 && targetTrans)
            ) {
              let writeIdx = 0;

              for (let i = 0; i < merged.length; i++) {
                const rec = merged[i];
                if (!rec.rest) {
                  merged[writeIdx++] = rec;
                  continue;
                }
                const tokens = rec._tokens ?? rec.rest.split(sep);
                let keep = true;
                if (geneIdx >= 0 && targetGene) {
                  const val = (tokens[geneIdx] ?? "").split(".")[0];
                  if (val !== targetGene) keep = false;
                }
                if (keep && transIdx >= 0 && targetTrans) {
                  const val = (tokens[transIdx] ?? "").split(".")[0];
                  if (val !== targetTrans) keep = false;
                }
                if (keep) merged[writeIdx++] = rec;
              }
              merged.length = writeIdx;
            }
          }
        }
      }
    }

    // ── Yield before binning ───────────────────────────────────────────
    await this.v.yieldToMain();
    if (this.v._dataGeneration !== generation) return;

    // ── VCF record normalisation ──
    // @gmod/vcf Variant objects use POS (1-based), REF, ALT — transform to the
    // { start, end, ref, alt, altDisplay } shape (0-based half-open) the rest of
    // the pipeline expects.
    const isVariantPlot = this.v.config.plot === "variant";
    if (isVariantPlot && merged.length > 0 && merged[0].POS !== undefined) {
      for (const rec of merged) {
        const pos1 = rec.POS ?? 0; // 1-based
        const ref = rec.REF ?? "";
        const alt: string[] = rec.ALT ?? [];

        rec.start = pos1 - 1; // convert to 0-based
        rec.end = rec.start + Math.max(1, ref.length);
        rec.ref = ref;
        rec.alt = alt;
        // First ALT allele's first base — used for colouring
        rec.altDisplay = alt.length > 0 ? alt[0][0] : "?";
        rec.id = Array.isArray(rec.ID) ? rec.ID.join(";") : rec.ID;
        rec.qual = rec.QUAL;
        rec.filter = Array.isArray(rec.FILTER)
          ? rec.FILTER.join(";")
          : rec.FILTER;
      }
    }

    // ── Score binning ─────────────────────────────────────────
    let renderData: any[] = merged;
    const isScorePlot =
      this.v.config.plot === "bar" ||
      this.v.config.plot === "bigwig" ||
      this.v.config.plot === "line" ||
      this.v.config.plot === "point" ||
      this.v.config.plot === "heatmap";
    let minScore = 0;
    let maxScore = 0;

    if (isScorePlot && visibleFeatures.length > 0) {
      const binnedFeatures = this.v.generateBinnedFeatures(
        visibleFeatures,
        viewStart,
        viewEnd,
        viewSpan,
      );

      const scores = binnedFeatures
        .map((f) => f.score)
        .filter((s) => isFinite(s));
      if (scores.length > 0) {
        minScore = Math.min(...scores);
        maxScore = Math.max(...scores);
      }

      renderData = binnedFeatures;
    }

    // Stale check after binning
    if (this.v._dataGeneration !== generation) return;

    // ── Score label + data assignment ─────────────────────────
    const isInertia = this.v.getInteractionController?.()?.isInertia() ?? false;
    let renderMaxScore = maxScore;
    if (isInertia && this.v.lastStableMaxScore > 0) {
      renderMaxScore = this.v.lastStableMaxScore;
    } else {
      this.v.lastStableMaxScore =
        maxScore > 0 ? maxScore : this.v.lastStableMaxScore;
      renderMaxScore = this.v.lastStableMaxScore;
    }

    this.v.updateScoreLabel(minScore, renderMaxScore);

    // Capture the channel's OWN data range (before any group / autoscale
    // shared range is layered on top) so the autoscale group can compute a
    // correct union and restore the local scale on cancel.
    if (isScorePlot) {
      this.v._ownScoreRange = [minScore, renderMaxScore];
    }

    const hasPendingRequests =
      this.v.screenManager?.hasPendingRequests() ?? false;

    if (merged.length === 0) {
      if (hasPendingRequests) {
        this.v.setState({ status: ChannelStatus.Loading });
        return;
      }
      if (state.data.size === 0) {
        return;
      }
    }

    if (this.v.data && this.v.data.length > 0) {
      this.v.data.length = 0;
    }
    this.v.data = renderData;
    this.v.dataRegion = {
      chr: state.region.chr,
      start: isFinite(minStart) ? minStart : state.region.start,
      end: isFinite(maxEnd) ? maxEnd : state.region.end,
    };

    // Proactively detect UCSC Key=Value patterns so expand button
    // appears as soon as data arrives (not just on first hover).
    this.v.tryAutoDetectStyle();
    this.v.tryAutoExpand();

    this.v.setState({
      status: hasPendingRequests
        ? ChannelStatus.Loading
        : ChannelStatus.Completed,
      loadedRecords: merged.length,
    });

    // Compute max score for score_rect/score_curve from visible data
    // (score_rect is not in the isScorePlot binning list, so maxScore stays 0)
    if (
      (this.v.config.plot === "score_rect" ||
        this.v.config.plot === "score_curve") &&
      !this.v._isSubChannel
    ) {
      const aggData = this.v.getParentDisplayData(renderData);
      const scores = aggData.map((f: any) => f.score ?? 0).filter(isFinite);
      if (scores.length > 0) {
        renderMaxScore = Math.max(...scores);
        const parentMin = Math.min(...scores);
        this.v.updateScoreLabel(parentMin, renderMaxScore);
      }
    }

    // ── Yield before GPU upload ────────────────────────────────────────
    await this.v.yieldToMain();
    if (this.v._dataGeneration !== generation) return;

    // ── GPU upload ────────────────────────────────────────────
    // Apply CDS coordinate transformation if CDS mode is active
    let gpuRenderData = renderData;
    let gpuDataRegion = { ...this.v.dataRegion };
    if (this.v._cdsMapper) {
      gpuRenderData = this.v._cdsMapper.transformFeatures(renderData);
      const cdsDomain = this.v._cdsMapper.transformDomain(
        this.v.dataRegion.start,
        this.v.dataRegion.end,
      );
      gpuDataRegion = {
        chr: this.v.dataRegion.chr,
        start: cdsDomain.start,
        end: cdsDomain.end,
      };
      // Update dataRegion to CDS space so renderFeatures computes
      // relativeStart correctly (domainStart is also in CDS space).
      this.v.dataRegion = gpuDataRegion;
      // Also update this.v.data to CDS-transformed data so hit-testing /
      // tooltip works correctly (domain is in CDS space).
      this.v.data = gpuRenderData;
    }

    if (this.v.featureRenderer && this.v.context.gl) {
      const gpuData = this.v.getParentDisplayData(gpuRenderData);
      // When this channel is part of an active autoscale / numbered group,
      // upload with the SHARED range so the common scale survives the
      // reload triggered by pan / zoom (otherwise the channel would briefly
      // render with its own scale and the group constraint would be lost).
      const groupRange = this.v._groupScoreRange;
      const uploadColors = groupRange
        ? {
            ...this.v.normalizeColorsForRenderer(),
            range: [groupRange[0], groupRange[1]] as [number, number],
          }
        : this.v.normalizeColorsForRenderer();
      const uploadMax = groupRange
        ? groupRange[1]
        : renderMaxScore > 0
          ? renderMaxScore
          : undefined;
      this.v.featureRenderer.updateData(
        this.v.context.gl,
        gpuData,
        this.v.config.plot || "rect",
        {
          chr: gpuDataRegion.chr,
          start: gpuDataRegion.start,
          end: gpuDataRegion.end,
        },
        uploadColors,
        this.v.foregroundColor,
        uploadMax,
      );
    }

    // ── Diamond legend: trigger score label for colormap-based diamonds ──
    if (this.v.config.plot === "diamond") {
      const fgObj = this.v.config.style?.foreground;
      if (
        fgObj &&
        typeof fgObj === "object" &&
        !Array.isArray(fgObj) &&
        (fgObj as any).colormap
      ) {
        const range = (fgObj as any).range as [number, number] | undefined;
        this.v.updateScoreLabel(range?.[0] ?? 0, range?.[1] ?? 1);
      }
    }

    // If this channel belongs to a group, request the renderer to
    // re-synchronise group score ranges so all members share the
    // union of visible-data ranges.
    if (this.v.config.group?.number !== undefined) {
      this.v.onMenuAction?.(this.v, "syncGroupRange");
    }

    // ── Yield before transcript / BAM transforms ───────────────────────
    await this.v.yieldToMain();
    if (this.v._dataGeneration !== generation) return;

    // ── Transcript data transformation ────────────────────────
    const isTranscript =
      this.v.config.plot === "transcript" || this.v.config.plot === "rna";
    const isSimpleRna = this.v.config.plot === "simple_rna";
    if (isTranscript && merged.length > 0) {
      const txRecords = transformGffToTranscripts(merged);
      const { transcripts: laid, maxLane } = assignLanes(txRecords);

      if (laid.length > 0) {
        // CDS mode: transform transcript coords to CDS space
        if (this.v._cdsMapper) {
          for (const tx of laid) {
            tx.txStart = this.v._cdsMapper.genomicToCDS(tx.txStart);
            tx.txEnd = this.v._cdsMapper.genomicToCDS(tx.txEnd);
            for (const p of tx.parts) {
              p.start = this.v._cdsMapper.genomicToCDS(p.start);
              p.end = this.v._cdsMapper.genomicToCDS(p.end);
            }
          }
        }
        this.v._transcriptRecords = laid;
        this.v._transcriptLaneCount = maxLane + 1;
        // this.v._txDataDirty = true;
        // Extract modification records (m6A, m5C, etc.)
        this.v._modificationRecords = extractModifications(merged);
      } else {
        logger.warn(
          `[${this.v.config.name}] ⚠️ Transcript transform returned 0 transcripts from ${merged.length} features — keeping ${this.v._transcriptRecords.length} existing records`,
        );
      }
    } else if (isTranscript && merged.length === 0) {
      logger.warn(
        `[${this.v.config.name}] ⚠️ Transcript: merged is empty, keeping ${this.v._transcriptRecords.length} old records`,
      );
    } else if (isSimpleRna && merged.length > 0) {
      // simple_rna: buildin loader already produced TranscriptRecord objects.
      // Assign directly without running the GFF→TranscriptRecord transform.
      const records = merged.filter((d: any) => d._buildinTranscript);
      if (records.length > 0) {
        this.v._transcriptRecords = records;
        this.v._transcriptLaneCount = 1;
        // this.v._txDataDirty = true;
      }
    }

    // ── BAM data transformation ───────────────────────────────
    const isBam = this.v.config.plot === "bam";
    if (isBam && merged.length > 0 && (merged[0] as any)?._txRemapped) {
      // Transcriptome-aligned reads: already remapped to genomic coords and
      // lane-assigned by the renderer's loadTranscriptomeBam(). Each entry is a
      // genomic exon block; blocks of one read share a lane (intron gaps = spaces).
      const reads = merged as any[];
      let maxLane = 0;
      for (const r of reads) if (r.lane > maxLane) maxLane = r.lane;
      // CDS mode: collapse intron gaps into CDS space. NEVER mutate cached tile
      // records in place — `merged` aliases ScreenDataManager tile arrays that
      // persist across pans, so re-applying genomicToCDS on already-converted
      // coords next pan would push reads off-screen ("disappearing"). Clone instead.
      if (this.v._cdsMapper) {
        const m = this.v._cdsMapper;
        this.v._bamReads = reads.map((read) => ({
          ...read,
          start: m.genomicToCDS(read.start),
          end: m.genomicToCDS(read.end),
        }));
      } else {
        this.v._bamReads = reads;
      }
      this.v._bamLaneCount = maxLane + 1;
    } else if (isBam && merged.length > 0) {
      const rawReads = merged.map((rec: any) => ({
        start: rec.start ?? rec.chromStart ?? 0,
        end: rec.end ?? rec.chromEnd ?? 0,
        strand: rec.strand ?? 1,
        readName: rec.name ?? rec.readName ?? undefined,
        readLength:
          rec.seq_length ?? rec.readLength ?? rec.length_on_ref ?? undefined,
        flags: rec.flags ?? undefined,
        mapq: rec.mq ?? rec.mapq ?? rec.mappingQuality ?? undefined,
        cigar: rec.CIGAR ?? rec.cigar ?? undefined,
        seq: rec.seq ?? rec.sequence ?? undefined,
        qual: rec.qual ?? undefined,
        tags: rec.tags ?? rec._tags ?? undefined,
      }));
      const { reads, maxLane } = assignBamLanes(rawReads, 0);
      // CDS mode: transform BAM read coords to CDS space
      if (this.v._cdsMapper) {
        for (const read of reads) {
          read.start = this.v._cdsMapper.genomicToCDS(read.start);
          read.end = this.v._cdsMapper.genomicToCDS(read.end);
        }
      }
      this.v._bamReads = reads;
      this.v._bamLaneCount = maxLane + 1;
    } else if (isBam && merged.length === 0) {
      logger.warn(
        `[${this.v.config.name}] ⚠️ BAM: merged is empty, keeping ${this.v._bamReads.length} old reads`,
      );
    }

    // ── Variant data transformation (lane assignment) ─────────
    if (isVariantPlot && merged.length > 0) {
      // Sort variants by start position for greedy lane assignment
      const sorted = [...merged].sort(
        (a, b) => (a.start ?? 0) - (b.start ?? 0),
      );
      // Greedy interval-scheduling: assign to first lane whose end ≤ start
      const laneEnds: number[] = [];
      let maxLane = 0;
      for (const rec of sorted) {
        const s = rec.start ?? 0;
        const e = rec.end ?? s + 1;
        let assigned = -1;
        for (let i = 0; i < laneEnds.length; i++) {
          if (laneEnds[i] <= s) {
            assigned = i;
            break;
          }
        }
        if (assigned === -1) {
          assigned = laneEnds.length;
          laneEnds.push(e);
        } else {
          laneEnds[assigned] = e;
        }
        rec.lane = assigned;
        if (assigned > maxLane) maxLane = assigned;
      }
      // CDS mode: transform variant coords to CDS space
      if (this.v._cdsMapper) {
        for (const rec of sorted) {
          const origStart = rec.start ?? 0;
          const origEnd = rec.end ?? origStart + 1;
          rec.start = this.v._cdsMapper.genomicToCDS(origStart);
          rec.end = this.v._cdsMapper.genomicToCDS(origEnd);
        }
      }
      this.v._variantRecords = sorted;
      this.v._variantLaneCount = maxLane + 1;
    } else if (isVariantPlot && merged.length === 0) {
      logger.warn(
        `[${this.v.config.name}] ⚠️ Variant: merged is empty, keeping ${this.v._variantRecords.length} old records`,
      );
    }

    // Distribute data to sub-channels if expanded
    this.v.distributeDataToSubChannels();

    this.v.onDirtyCallback?.();
  }

  /**
   * Downsample BigBed data by zoom level to simulate multi-resolution behaviour.
   * Unlike BigWig's pre-computed zoom levels, BigBed needs app-level filtering.
   *
   * Strategy by level: 0-5 (detailed) show all; 6-10 (medium) moderate sampling;
   * 11+ (genome-wide) density-based sampling. Sparse data (< 20000 records) is
   * filtered conservatively to keep visual representation at genome-wide zoom.
   */
  private _downsampleBigBedData(
    data: any[],
    level: number,
    viewStart: number,
    viewEnd: number,
    canvasWidth: number,
  ): any[] {
    // Level 0-5: Show all features (detailed view)
    if (level <= 5) {
      return data;
    }

    // If data is already sparse, don't over-filter
    // At genome-wide zoom, even 20000 features spread across 3Gb is ~1 per 150kb
    if (data.length < 20000) {
      // For sparse data, only do minimal filtering at very high levels
      if (level > 15 && data.length > canvasWidth * 5) {
        // Keep ~5 features per pixel even for sparse data
        const samplingRate = Math.ceil(data.length / (canvasWidth * 5));
        return data.filter((_, idx) => idx % samplingRate === 0);
      }
      return data; // Keep all data if already sparse
    }

    const viewSpan = viewEnd - viewStart;

    // Calculate target density based on zoom level
    // Be more generous at high zoom levels to show representative coverage
    const targetFeaturesPerPixel = level <= 10 ? 8 : level <= 15 ? 5 : 3;
    const maxFeatures = Math.ceil(canvasWidth * targetFeaturesPerPixel);

    // If we're already under the limit, return all data
    if (data.length <= maxFeatures) {
      return data;
    }

    // Level 6-10: Simple spatial sampling (every N-th feature)
    if (level <= 10) {
      const samplingRate = Math.ceil(data.length / maxFeatures);
      return data.filter((_, idx) => idx % samplingRate === 0);
    }

    // Level 11+: Density-based sampling with spatial bins
    // Divide viewport into bins and keep best representative from each bin
    const numBins = Math.min(maxFeatures, Math.ceil(canvasWidth / 2));
    const binWidth = viewSpan / numBins;
    const bins: any[][] = Array.from({ length: numBins }, () => []);

    // Sort features into spatial bins
    for (const feature of data) {
      const featureStart = feature.chromStart ?? feature.start ?? 0;
      const binIndex = Math.floor((featureStart - viewStart) / binWidth);

      if (binIndex >= 0 && binIndex < numBins) {
        bins[binIndex].push(feature);
      }
    }

    // From each bin, select representative feature(s)
    const sampled: any[] = [];
    const featuresPerBin = Math.max(1, Math.floor(maxFeatures / numBins));

    for (const bin of bins) {
      if (bin.length === 0) continue;

      if (bin.length <= featuresPerBin) {
        // If bin has few features, keep all
        sampled.push(...bin);
      } else {
        // Keep the longest/most prominent features from this bin
        const sorted = bin.sort((a, b) => {
          const lenA =
            (a.chromEnd ?? a.end ?? 0) - (a.chromStart ?? a.start ?? 0);
          const lenB =
            (b.chromEnd ?? b.end ?? 0) - (b.chromStart ?? b.start ?? 0);
          return lenB - lenA; // Descending by length
        });
        sampled.push(...sorted.slice(0, featuresPerBin));
      }
    }

    return sampled;
  }

  // --- Navigation-driven data fetch (called by renderer on pan/zoom) ---
  handleNavigation(
    visibleRegion: { chr: string; start: number; end: number },
    mode: InteractionMode,
  ): void {
    // Sub-channels receive data from their parent — no own navigation
    if (this.v._isSubChannel) return;

    if (!this.v.screenManager) return;

    // Transcript: skip data requests at large scale, reinitialize on zoom-back-in
    const isTranscript =
      this.v.config.plot === "transcript" ||
      this.v.config.plot === "rna" ||
      this.v.config.plot === "simple_rna";
    if (isTranscript) {
      const span = visibleRegion.end - visibleRegion.start;
      if (this.v.isAboveDetailZoom(span)) {
        this.v._txWasZoomedOut = true;
        return;
      }
      // Zooming back in from large scale → force reinitialize to fetch new data
      if (this.v._txWasZoomedOut) {
        this.v._txWasZoomedOut = false;
        this.v.screenManager.initialize({
          chr: visibleRegion.chr,
          start: visibleRegion.start,
          end: visibleRegion.end,
        });
        return;
      }
    }

    // BAM: skip data fetch only when *both* reads and coverage are beyond
    // their zoom thresholds.  Coverage has its own (larger) threshold so
    // data must still be fetched at medium scales for the histogram.
    if (this.v.config.plot === "bam") {
      const span = visibleRegion.end - visibleRegion.start;
      const bothHidden =
        this.v.isAboveDetailZoom(span) &&
        this.v.isCoverageAboveDetailZoom(span);
      if (bothHidden) {
        this.v._bamWasZoomedOut = true;
        return;
      }
      if (this.v._bamWasZoomedOut) {
        this.v._bamWasZoomedOut = false;
        this.v.screenManager.initialize({
          chr: visibleRegion.chr,
          start: visibleRegion.start,
          end: visibleRegion.end,
        });
        return;
      }
    }

    // Variant: skip data requests at large scale, reinitialize on zoom-back-in
    if (this.v.config.plot === "variant") {
      const span = visibleRegion.end - visibleRegion.start;
      if (this.v.isAboveDetailZoom(span)) {
        this.v._variantWasZoomedOut = true;
        return;
      }
      if (this.v._variantWasZoomedOut) {
        this.v._variantWasZoomedOut = false;
        this.v.screenManager.initialize({
          chr: visibleRegion.chr,
          start: visibleRegion.start,
          end: visibleRegion.end,
        });
        return;
      }
    }

    // Diamond / Motif: skip data requests at large scale, reinitialize on zoom-back-in
    if (this.v.config.plot === "diamond" || this.v.config.plot === "motif") {
      const span = visibleRegion.end - visibleRegion.start;
      if (this.v.isAboveDetailZoom(span)) {
        this.v._diamondMotifWasZoomedOut = true;
        return;
      }
      if (this.v._diamondMotifWasZoomedOut) {
        this.v._diamondMotifWasZoomedOut = false;
        this.v.screenManager.initialize({
          chr: visibleRegion.chr,
          start: visibleRegion.start,
          end: visibleRegion.end,
        });
        return;
      }
    }

    // Generic channels (rect, score_curve, bar, etc.): skip data at large
    // scale when detailZoom is explicitly configured.
    if (
      !isTranscript &&
      this.v.config.plot !== "bam" &&
      this.v.config.plot !== "variant" &&
      this.v.config.plot !== "diamond" &&
      this.v.config.plot !== "motif" &&
      this.v.detailZoomThreshold > 0
    ) {
      const span = visibleRegion.end - visibleRegion.start;
      if (this.v.isAboveDetailZoom(span)) {
        this.v._genericWasZoomedOut = true;
        return;
      }
      if (this.v._genericWasZoomedOut) {
        this.v._genericWasZoomedOut = false;
        this.v.screenManager.initialize({
          chr: visibleRegion.chr,
          start: visibleRegion.start,
          end: visibleRegion.end,
        });
        return;
      }
    }

    const screenRegion: IScreenRegion = {
      chr: visibleRegion.chr,
      start: visibleRegion.start,
      end: visibleRegion.end,
    };

    if (mode === "pan") {
      // CDS viewports can leave the initially loaded transcript region.
      // Let the screen manager reuse cached tiles and fetch newly visible data.
      this.v.screenManager.handlePan(screenRegion);
    } else {
      this.v.screenManager.handleZoom(screenRegion);
    }

    // Show loading indicator if there are pending data requests
    if (this.v.screenManager.hasPendingRequests()) {
      this.v.setState({ status: ChannelStatus.Loading });
    }
  }
}
