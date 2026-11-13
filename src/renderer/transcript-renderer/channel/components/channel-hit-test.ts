import type { ChannelView } from "../index";

/**
 * Feature hit-testing for a channel: maps a cursor position to the feature
 * under it (transcript / BAM / variant / modification) and its annotation,
 * for tooltips + click interactions. Reads channel data + geometry via `v`.
 */
export class ChannelHitTest {
  constructor(private readonly v: ChannelView) {}

  hitTestFeature(
    canvasX: number,
    canvasY: number,
    domain: { start: number; end: number },
  ): any | null {
    // Overall bounds (includes expand group area when expanded)
    const totalHeight = this.v._expandGroupView
      ? this.v.height + this.v._expandGroupView.height
      : this.v.height;
    if (
      canvasY < this.v.y ||
      canvasY > this.v.y + totalHeight ||
      canvasX < this.v.x ||
      canvasX > this.v.x + this.v.width
    ) {
      return null;
    }

    // Delegate to expand group for the sub-channel area
    if (this.v._expandGroupView) {
      const groupY = this.v._expandGroupView.y;
      if (canvasY >= groupY) {
        const hit = this.v._expandGroupView.hitTestFeature(
          canvasX,
          canvasY,
          domain,
        );
        // `hitTestFeatureWithChannel` is used when the channel reference is also needed.
        return hit?.feature ?? null;
      }
    }

    // ── Transcript hit-test (uses _transcriptRecords, not this.v.data) ──
    const isTranscript =
      this.v.config.plot === "transcript" || this.v.config.plot === "rna";
    if (isTranscript) {
      // Modification markers render on top, so test them first
      const modHit = this.hitTestModification(canvasX, canvasY, domain);
      if (modHit) return modHit;
      return this.hitTestTranscriptFeature(canvasX, canvasY, domain);
    }

    // ── BAM hit-test (uses _bamReads, not this.v.data) ──
    if (this.v.config.plot === "bam") {
      return this.hitTestBamFeature(canvasX, canvasY, domain);
    }

    // ── Variant hit-test (uses _variantRecords with lane info) ──
    if (this.v.config.plot === "variant") {
      return this.hitTestVariantFeature(canvasX, canvasY, domain);
    }

    if (!this.v.data || this.v.data.length === 0) return null;

    // canvasX → genomic position
    const frac = (canvasX - this.v.x) / this.v.width;
    const genomicPos = domain.start + frac * (domain.end - domain.start);

    // Find the closest feature containing the position (closest center for diamond/point)
    const plot = this.v.config.plot || "rect";
    const isDiamond = plot === "diamond";
    const isPoint = plot === "point";

    let bestFeature: any = null;
    let bestDist = Infinity;

    for (const feature of this.v.data) {
      const fStart = feature.chromStart ?? feature.start ?? 0;
      const fEnd = feature.chromEnd ?? feature.end ?? fStart;

      if (isDiamond || isPoint) {
        // Point/diamond: hit-test a tolerance zone around the center.
        // Diamond renders at true center (no offset) to align with axis ticks.
        const center = (fStart + fEnd) / 2;
        // Tolerance in genomic units, scaled with domain span
        const toleranceBp = ((domain.end - domain.start) / this.v.width) * 8;
        if (Math.abs(genomicPos - center) <= toleranceBp) {
          const dist = Math.abs(genomicPos - center);
          if (dist < bestDist) {
            bestDist = dist;
            bestFeature = feature;
          }
        }
      } else {
        // Rect/bar/line/heatmap: hit if position falls inside [start, end].
        // Prefer narrower (more specific) features.
        if (genomicPos >= fStart && genomicPos <= fEnd) {
          const span = fEnd - fStart;
          if (span < bestDist) {
            bestDist = span;
            bestFeature = feature;
          }
        }
      }
    }

    return bestFeature;
  }

  /**
   * One-line annotation string for a feature (cursor complex mode).
   * Score plots return the formatted score, otherwise the compact annotation.
   */
  getFeatureAnnotation(feature: any): string {
    if (feature._isModificationHit) {
      const pos = feature.transcriptPosition ?? "";
      return `${feature.type}${pos ? ` @${pos}` : ""}`;
    }

    if (feature._isTranscriptHit) {
      const tx = feature;
      const name = tx.transcriptName || tx.geneName || tx.transcriptId || "";
      const partType = tx._hitPartType || "";
      return partType ? `${name} (${partType})` : name;
    }

    if (feature._isVariantHit) {
      const ref = feature.ref ?? "";
      const alt: string[] = Array.isArray(feature.alt) ? feature.alt : [];
      return `${ref} → ${alt.join(", ") || "."}`;
    }

    if (this.v.isScorePlot()) {
      if (feature.score !== undefined) {
        return typeof feature.score === "number" &&
          !Number.isInteger(feature.score)
          ? feature.score.toFixed(4)
          : String(feature.score);
      }
      return "";
    }
    return this.v.extractCompactAnnotation(feature);
  }

  // ── Delegating hit-test for tooltip (returns feature + channel) ──────

  /**
   * Hit-test returning both the feature and the channel that owns it.
   * When expanded, delegates to sub-channels for the group area.
   */
  hitTestFeatureWithChannel(
    canvasX: number,
    canvasY: number,
    domain: { start: number; end: number },
  ): { feature: any; channel: ChannelView } | null {
    const totalHeight = this.v._expandGroupView
      ? this.v.height + this.v._expandGroupView.height
      : this.v.height;
    if (
      canvasY < this.v.y ||
      canvasY > this.v.y + totalHeight ||
      canvasX < this.v.x ||
      canvasX > this.v.x + this.v.width
    ) {
      return null;
    }

    // Delegate to expand group sub-channels
    if (this.v._expandGroupView) {
      const groupY = this.v._expandGroupView.y;
      if (canvasY >= groupY) {
        const hit = this.v._expandGroupView.hitTestFeature(
          canvasX,
          canvasY,
          domain,
        );
        if (hit)
          return { feature: hit.feature, channel: hit.channel as ChannelView };
        return null;
      }
    }

    // Parent channel's own data
    const feature = this.hitTestFeature(canvasX, canvasY, domain);
    if (feature) return { feature, channel: this.v };
    return null;
  }

  /** Collect cursor hits from this channel and its visible sub-channels. */
  collectCursorHits(
    genomicPos: number,
    domain: { start: number; end: number },
    dpr: number,
  ): Array<{ channelName: string; annotation: string; yCenterCss: number }> {
    const results: Array<{
      channelName: string;
      annotation: string;
      yCenterCss: number;
    }> = [];

    // Parent channel's own hit
    const feature = this.hitTestGenomicPos(genomicPos, domain);
    if (feature) {
      const annotation = this.getFeatureAnnotation(feature);
      if (annotation) {
        const yCenterCss = (this.v.y + this.v.height / 2) / dpr;
        results.push({ channelName: this.v.name, annotation, yCenterCss });
      }
    }

    // Sub-channel hits (when expanded)
    if (this.v._expandGroupView) {
      const subHits = this.v._expandGroupView.collectGenomicHits(
        genomicPos,
        domain,
        dpr,
      );
      results.push(...subHits);
    }

    return results;
  }

  /** Hit-test a genomic position against features in this channel (ignores Y). */
  hitTestGenomicPos(
    genomicPos: number,
    domain: { start: number; end: number },
  ): any | null {
    // ── Transcript hit-test by genomic position ──
    const isTranscript =
      this.v.config.plot === "transcript" || this.v.config.plot === "rna";
    if (isTranscript) {
      return this.hitTestTranscriptGenomicPos(genomicPos);
    }

    // ── Variant hit-test by genomic position ──
    if (this.v.config.plot === "variant") {
      return this.hitTestVariantGenomicPos(genomicPos);
    }

    if (!this.v.data || this.v.data.length === 0) return null;

    const plot = this.v.config.plot || "rect";
    const isDiamond = plot === "diamond";
    const isPoint = plot === "point";

    let bestFeature: any = null;
    let bestDist = Infinity;

    for (const feature of this.v.data) {
      const fStart = feature.chromStart ?? feature.start ?? 0;
      const fEnd = feature.chromEnd ?? feature.end ?? fStart;

      if (isDiamond || isPoint) {
        const center = (fStart + fEnd) / 2;
        // Diamond renders at true center (no offset) to align with axis ticks
        const toleranceBp =
          ((domain.end - domain.start) / (this.v.width || 1)) * 8;
        if (Math.abs(genomicPos - center) <= toleranceBp) {
          const dist = Math.abs(genomicPos - center);
          if (dist < bestDist) {
            bestDist = dist;
            bestFeature = feature;
          }
        }
      } else {
        if (genomicPos >= fStart && genomicPos <= fEnd) {
          const span = fEnd - fStart;
          if (span < bestDist) {
            bestDist = span;
            bestFeature = feature;
          }
        }
      }
    }
    return bestFeature;
  }

  // ── Transcript-specific hit-testing ─────────────────────────────────

  /**
   * Hit-test a canvas point against transcript parts.
   * Returns a synthetic feature with transcript info + `_isTranscriptHit`.
   */
  private hitTestTranscriptFeature(
    canvasX: number,
    canvasY: number,
    domain: { start: number; end: number },
  ): any | null {
    if (this.v._transcriptRecords.length === 0) return null;

    const domLength = domain.end - domain.start;
    if (domLength <= 0 || this.v.isAboveDetailZoom(domLength)) return null;

    const dpr = window.devicePixelRatio || 1;
    const paddingTopPx = Math.round(this.v.height * this.v.paddingTop);
    const contentY = this.v.y + paddingTopPx;
    const contentHeight =
      this.v.height - paddingTopPx - Math.round(this.v.height * this.v.paddingBottom);

    if (canvasY < contentY || canvasY > contentY + contentHeight) return null;

    const totalH = this.v.txTotalContentHeightCSS * dpr;
    const laneCount = Math.max(this.v._transcriptLaneCount, 1);
    const laneHDev = totalH / laneCount;
    const scrollDevice = this.v._txScrollOffset * dpr;

    // Canvas Y relative to content top, plus scroll → lane index
    const relY = canvasY - contentY + scrollDevice;
    const laneIdx = Math.floor(relY / laneHDev);

    // canvasX → genomic position
    const genomicPos =
      domain.start + ((canvasX - this.v.x) / this.v.width) * domLength;

    // Find transcript whose part is hit — prefer narrowest part
    let bestHit: any = null;
    let bestSpan = Infinity;

    for (const tx of this.v._transcriptRecords) {
      if (tx.lane !== laneIdx) continue;
      if (genomicPos < tx.txStart || genomicPos > tx.txEnd) continue;

      // Individual parts (exon, CDS, UTR, etc.)
      for (const part of tx.parts) {
        if (genomicPos >= part.start && genomicPos <= part.end) {
          const span = part.end - part.start;
          if (span < bestSpan) {
            bestSpan = span;
            bestHit = {
              _isTranscriptHit: true,
              transcriptId: tx.transcriptId,
              transcriptName: tx.transcriptName,
              geneName: tx.geneName,
              strand: tx.strand,
              transcriptType: tx.transcriptType,
              txStart: tx.txStart,
              txEnd: tx.txEnd,
              _hitPartType: part.type,
              _hitPartStart: part.start,
              _hitPartEnd: part.end,
              // Standard tooltip field access
              chromStart: part.start,
              chromEnd: part.end,
              name: tx.transcriptName,
            };
          }
        }
      }

      // No part hit — fall back to the intron backbone
      if (!bestHit && genomicPos >= tx.txStart && genomicPos <= tx.txEnd) {
        bestHit = {
          _isTranscriptHit: true,
          transcriptId: tx.transcriptId,
          transcriptName: tx.transcriptName,
          geneName: tx.geneName,
          strand: tx.strand,
          transcriptType: tx.transcriptType,
          txStart: tx.txStart,
          txEnd: tx.txEnd,
          _hitPartType: "intron",
          _hitPartStart: tx.txStart,
          _hitPartEnd: tx.txEnd,
          chromStart: tx.txStart,
          chromEnd: tx.txEnd,
          name: tx.transcriptName,
        };
        bestSpan = tx.txEnd - tx.txStart;
      }
    }

    return bestHit;
  }

  /**
   * Hit-test a canvas point against modification markers.
   * Returns a synthetic feature with `_isModificationHit`.
   */
  private hitTestModification(
    canvasX: number,
    canvasY: number,
    domain: { start: number; end: number },
  ): any | null {
    if (this.v._modificationRecords.length === 0) return null;
    if (this.v._transcriptRecords.length === 0) return null;
    // Respect modification enabled config (default true)
    if (this.v.config.style?.modification?.enabled === false) return null;

    const domLength = domain.end - domain.start;
    if (domLength <= 0 || this.v.isAboveDetailZoom(domLength)) return null;

    const dpr = window.devicePixelRatio || 1;
    const paddingTopPx = Math.round(this.v.height * this.v.paddingTop);
    const contentY = this.v.y + paddingTopPx;
    const contentHeight =
      this.v.height - paddingTopPx - Math.round(this.v.height * this.v.paddingBottom);

    if (canvasY < contentY || canvasY > contentY + contentHeight) return null;

    const totalH = this.v.txTotalContentHeightCSS * dpr;
    const laneCount = Math.max(this.v._transcriptLaneCount, 1);
    const laneHDev = totalH / laneCount;
    const scrollDevice = this.v._txScrollOffset * dpr;

    const txById = new Map<string, any>();
    for (const tx of this.v._transcriptRecords) {
      if (tx.transcriptId) txById.set(tx.transcriptId, tx);
      if (tx.transcriptName) txById.set(tx.transcriptName, tx);
    }

    // canvasX → genomic position
    const genomicPos =
      domain.start + ((canvasX - this.v.x) / this.v.width) * domLength;

    const BODY_FRAC = 0.55;
    const CENTRE_Y = 0.5;
    const heightFrac = this.v.config.style?.modification?.height ?? 0.05;
    const desiredSizeDev = this.v.height * heightFrac;

    // Stack tracking (mirrors renderModifications)
    const stackMap = new Map<string, number>();

    for (const mod of this.v._modificationRecords) {
      const tx = txById.get(mod.parentId) ?? txById.get(mod.transcriptId);
      if (!tx) continue;

      const stackKey = `${mod.parentId}:${mod.genomicStart}`;
      const stackIdx = stackMap.get(stackKey) ?? 0;
      stackMap.set(stackKey, stackIdx + 1);

      // Lane geometry (mirrors renderModifications)
      const laneTop = tx.lane * laneHDev;
      const bodyH = laneHDev * BODY_FRAC;
      const centreYDev = laneTop + bodyH * CENTRE_Y;

      // ▼ triangle: point at exon centre, body extends upward, clamped
      const upperSpace = centreYDev - laneTop;
      const markerH = Math.min(desiredSizeDev, Math.max(1, upperSpace));
      const stackOffsetDev = stackIdx * (markerH + 1);
      const markerTopY = centreYDev - markerH - stackOffsetDev;

      // Marker half-width in bp (proportional to actual height)
      const markerHalfBp = (markerH / 2 / this.v.width) * domLength;

      // X test: genomicPos within marker bounds.
      // +0.5bp matches the render shift in renderModifications.
      const modCenter = mod.genomicStart + 0.5;
      if (
        genomicPos < modCenter - markerHalfBp ||
        genomicPos > modCenter + markerHalfBp
      )
        continue;

      // Y test: cursor within marker bounds
      const cursorRelY = canvasY - contentY + scrollDevice;
      if (cursorRelY >= markerTopY && cursorRelY <= markerTopY + markerH) {
        return {
          _isModificationHit: true,
          type: mod.type,
          id: mod.id,
          parentId: mod.parentId,
          transcriptId: mod.transcriptId,
          transcriptPosition: mod.transcriptPosition,
          genomicStart: mod.genomicStart,
          genomicEnd: mod.genomicEnd,
          nReads: mod.nReads,
          probability: mod.probability,
          kmer: mod.kmer,
          modRatio: mod.modRatio,
          rawAttributes: mod.rawAttributes,
          name: mod.type,
          chromStart: mod.genomicStart,
          chromEnd: mod.genomicEnd,
        };
      }
    }

    return null;
  }

  /**
   * Hit-test a genomic position against transcript records (ignores Y).
   * Used for the cursor tooltip. Returns the narrowest part hit.
   */
  private hitTestTranscriptGenomicPos(genomicPos: number): any | null {
    if (this.v._transcriptRecords.length === 0) return null;

    let bestHit: any = null;
    let bestSpan = Infinity;

    for (const tx of this.v._transcriptRecords) {
      if (genomicPos < tx.txStart || genomicPos > tx.txEnd) continue;

      // Individual parts first
      for (const part of tx.parts) {
        if (genomicPos >= part.start && genomicPos <= part.end) {
          const span = part.end - part.start;
          if (span < bestSpan) {
            bestSpan = span;
            bestHit = {
              _isTranscriptHit: true,
              transcriptId: tx.transcriptId,
              transcriptName: tx.transcriptName,
              geneName: tx.geneName,
              strand: tx.strand,
              transcriptType: tx.transcriptType,
              txStart: tx.txStart,
              txEnd: tx.txEnd,
              _hitPartType: part.type,
              _hitPartStart: part.start,
              _hitPartEnd: part.end,
              chromStart: part.start,
              chromEnd: part.end,
              name: tx.transcriptName,
            };
          }
        }
      }

      // Fall back to intron backbone
      if (!bestHit) {
        bestHit = {
          _isTranscriptHit: true,
          transcriptId: tx.transcriptId,
          transcriptName: tx.transcriptName,
          geneName: tx.geneName,
          strand: tx.strand,
          transcriptType: tx.transcriptType,
          txStart: tx.txStart,
          txEnd: tx.txEnd,
          _hitPartType: "intron",
          _hitPartStart: tx.txStart,
          _hitPartEnd: tx.txEnd,
          chromStart: tx.txStart,
          chromEnd: tx.txEnd,
          name: tx.transcriptName,
        };
        bestSpan = tx.txEnd - tx.txStart;
      }
    }

    return bestHit;
  }

  // ── BAM hit-test ────────────────────────────────────────────────────

  /**
   * Hit-test a canvas point against BAM reads, accounting for lane layout,
   * coverage area, and scroll offset. Returns a synthetic feature with `_isBamHit`.
   */
  private hitTestBamFeature(
    canvasX: number,
    canvasY: number,
    domain: { start: number; end: number },
  ): any | null {
    if (this.v._bamReads.length === 0) return null;

    const domainLength = domain.end - domain.start;
    // Bail out only when *both* coverage and reads are above their thresholds.
    const readsHidden = this.v.isAboveDetailZoom(domainLength);
    const coverageHidden = this.v.isCoverageAboveDetailZoom(domainLength);
    if (domainLength <= 0 || (readsHidden && coverageHidden)) return null;

    const dpr = window.devicePixelRatio || 1;
    const paddingTopPx = Math.round(this.v.height * this.v.paddingTop);
    const paddingBottomPx = Math.round(this.v.height * this.v.paddingBottom);
    const fullContentHeight = this.v.height - paddingTopPx - paddingBottomPx;

    const coverageHeightPx =
      this.v.bamCoverageEnabled && !coverageHidden
        ? Math.round(fullContentHeight * this.v.bamCoverageHeightFrac)
        : 0;

    const readsContentY = this.v.y + paddingTopPx + coverageHeightPx;
    const readsContentHeight = fullContentHeight - coverageHeightPx;

    // ── Coverage area hit test ──────────────────────────────────────────
    const fullContentY = this.v.y + paddingTopPx;
    if (
      coverageHeightPx > 0 &&
      canvasY >= fullContentY &&
      canvasY < readsContentY &&
      this.v._bamCoverage &&
      this.v._bamCoverageMax > 0
    ) {
      const genomicPos =
        domain.start + ((canvasX - this.v.x) / this.v.width) * domainLength;
      const numBins = this.v._bamCoverage.length;
      const span = this.v._bamCoverageEnd - this.v._bamCoverageStart;
      if (span > 0) {
        const binIdx = Math.floor(
          ((genomicPos - this.v._bamCoverageStart) / span) * numBins,
        );
        if (binIdx >= 0 && binIdx < numBins) {
          const depth = this.v._bamCoverage[binIdx];
          const binWidthBp = span / numBins;
          const binStart = this.v._bamCoverageStart + binIdx * binWidthBp;
          const binEnd = binStart + binWidthBp;
          return {
            _isCoverageHit: true,
            depth: Math.round(depth),
            maxDepth: Math.round(this.v._bamCoverageMax),
            chromStart: Math.floor(binStart),
            chromEnd: Math.ceil(binEnd),
            genomicPos: Math.floor(genomicPos),
            chr: this.v.dataRegion.chr,
          };
        }
      }
    }

    // Must be within reads area (not coverage area) and reads must be visible
    if (readsHidden) return null;
    if (canvasY < readsContentY || canvasY > readsContentY + readsContentHeight)
      return null;

    // canvasY → lane index
    const totalHeightDevice = this.v.bamTotalContentHeightCSS * dpr;
    const laneCount = Math.max(this.v._bamLaneCount, 1);
    const laneHDevice = totalHeightDevice / laneCount;
    const scrollDevice = this.v._bamScrollOffset * dpr;

    const relY = canvasY - readsContentY + scrollDevice;
    const laneIdx = Math.floor(relY / laneHDevice);

    // canvasX → genomic position
    const genomicPos =
      domain.start + ((canvasX - this.v.x) / this.v.width) * domainLength;

    // Narrowest read in this lane containing the genomic position
    let bestRead: any = null;
    let bestSpan = Infinity;

    for (const read of this.v._bamReads) {
      if (read.lane !== laneIdx) continue;
      if (genomicPos < read.start || genomicPos > read.end) continue;

      const span = read.end - read.start;
      if (span < bestSpan) {
        bestSpan = span;
        bestRead = {
          _isBamHit: true,
          chromStart: read.start,
          chromEnd: read.end,
          start: read.start,
          end: read.end,
          strand: read.strand,
          lane: read.lane,
          name:
            read.readName ??
            (read.strand === 1 ? "Forward read" : "Reverse read"),
          readName: read.readName,
          readLength: read.readLength ?? read.end - read.start,
          flags: read.flags,
          mapq: read.mapq,
          cigar: read.cigar,
          seq: read.seq,
          qual: read.qual,
          tags: read.tags,
          genomicPos: Math.floor(genomicPos),
          chr: this.v.dataRegion.chr,
        };
      }
    }

    return bestRead;
  }

  // ── Variant-specific hit-testing ────────────────────────────────────

  /**
   * Hit-test a canvas point against variant records (lane-aware).
   * Returns a synthetic feature with `_isVariantHit`.
   */
  private hitTestVariantFeature(
    canvasX: number,
    canvasY: number,
    domain: { start: number; end: number },
  ): any | null {
    if (this.v._variantRecords.length === 0) return null;

    const domainLength = domain.end - domain.start;
    if (this.v.isAboveDetailZoom(domainLength)) return null;
    if (domainLength <= 0) return null;

    const dpr = window.devicePixelRatio || 1;
    const paddingTopPx = Math.round(this.v.height * this.v.paddingTop);
    const paddingBottomPx = Math.round(this.v.height * this.v.paddingBottom);
    const contentY = this.v.y + paddingTopPx;
    const contentHeight = this.v.height - paddingTopPx - paddingBottomPx;

    if (canvasY < contentY || canvasY > contentY + contentHeight) return null;

    // canvasY → lane index
    const rowHCSS = this.v.variantRowHeightCSS;
    const scrollDevice = this.v._variantScrollOffset * dpr;
    const relY = canvasY - contentY + scrollDevice;
    const laneHDevice = rowHCSS * dpr;
    const laneIdx = Math.floor(relY / laneHDevice);

    // canvasX → genomic position
    const genomicPos =
      domain.start + ((canvasX - this.v.x) / this.v.width) * domainLength;

    // Narrowest variant in this lane containing the position
    let best: any = null;
    let bestSpan = Infinity;

    for (const rec of this.v._variantRecords) {
      if (rec.lane !== laneIdx) continue;
      const s = rec.start ?? 0;
      const e = rec.end ?? s + 1;
      if (genomicPos < s || genomicPos > e) continue;
      const span = e - s;
      if (span < bestSpan) {
        bestSpan = span;
        best = {
          _isVariantHit: true,
          start: s,
          end: e,
          chromStart: s,
          chromEnd: e,
          ref: rec.ref,
          alt: rec.alt,
          altDisplay: rec.altDisplay,
          id: rec.id,
          qual: rec.qual,
          filter: rec.filter,
          INFO: rec.INFO,
          CHROM: rec.CHROM ?? this.v.dataRegion.chr,
          lane: rec.lane,
          genomicPos: Math.floor(genomicPos),
        };
      }
    }
    return best;
  }

  /**
   * Hit-test variant records by genomic position only (ignores Y).
   * Returns the first variant record containing the position.
   */
  private hitTestVariantGenomicPos(genomicPos: number): any | null {
    if (this.v._variantRecords.length === 0) return null;

    let best: any = null;
    let bestSpan = Infinity;

    for (const rec of this.v._variantRecords) {
      const s = rec.start ?? 0;
      const e = rec.end ?? s + 1;
      if (genomicPos < s || genomicPos > e) continue;
      const span = e - s;
      if (span < bestSpan) {
        bestSpan = span;
        best = {
          _isVariantHit: true,
          start: s,
          end: e,
          chromStart: s,
          chromEnd: e,
          ref: rec.ref,
          alt: rec.alt,
          altDisplay: rec.altDisplay,
          id: rec.id,
          qual: rec.qual,
          filter: rec.filter,
          INFO: rec.INFO,
          CHROM: rec.CHROM ?? this.v.dataRegion.chr,
          lane: rec.lane,
        };
      }
    }
    return best;
  }
}
