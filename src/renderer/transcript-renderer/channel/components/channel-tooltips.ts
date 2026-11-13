import type { ChannelView } from "../index";

/** Colour map for variant type badges — deliberately distinct from base colours. */
const VARIANT_TYPE_COLORS: Record<string, string> = {
  SNP: "#6c5ce7", // purple
  INSERTION: "#e17055", // coral / orange
  DELETION: "#d63031", // dark red
  INDEL: "#00b894", // teal
  Unknown: "#636e72", // grey
};

/** Light-gray colour used for multi-base alleles. */
const MULTI_BASE_GRAY = "#b2bec3";

/**
 * Builds tooltip content for a channel feature, dispatched by plot type
 * (modification / transcript / bam / coverage / variant). Reads config + data
 * via its back-reference to the ChannelView.
 */
export class ChannelTooltips {
  constructor(private readonly v: ChannelView) {}

  private buildModificationTooltipContent(feature: any): {
    title: string;
    rows: { label: string; value: string | number }[];
    featureRegion?: { start: number; end: number; isJunction?: boolean };
  } {
    const rows: { label: string; value: string | number }[] = [];

    rows.push({ label: "Type", value: feature.type ?? "" });
    rows.push({ label: "ID", value: feature.id ?? "" });
    rows.push({ label: "Parent", value: feature.parentId ?? "" });
    rows.push({
      label: "Transcript ID",
      value: feature.transcriptId ?? "",
    });
    rows.push({
      label: "Transcript Position",
      value: feature.transcriptPosition ?? 0,
    });
    rows.push({
      label: "Genomic Position",
      value: `${((feature.genomicStart ?? 0) + 1).toLocaleString()}-${(feature.genomicEnd ?? 0).toLocaleString()}`,
    });
    rows.push({ label: "n_reads", value: feature.nReads ?? 0 });
    rows.push({
      label: "Probability Modified",
      value:
        typeof feature.probability === "number"
          ? feature.probability.toFixed(4)
          : "0",
    });
    rows.push({ label: "kmer", value: feature.kmer ?? "" });
    rows.push({
      label: "mod_ratio",
      value:
        typeof feature.modRatio === "number"
          ? feature.modRatio.toFixed(4)
          : "0",
    });

    return {
      title: `RNA Modification: ${feature.type ?? ""}`,
      rows,
      featureRegion: {
        start: feature.genomicStart ?? 0,
        end: feature.genomicEnd ?? 0,
      },
    };
  }

  private buildTranscriptTooltipContent(
    feature: any,
    mode: "detailed" | "compact" = "detailed",
  ): {
    title: string;
    rows: { label: string; value: string | number }[];
    featureRegion?: { start: number; end: number; isJunction?: boolean };
  } {
    const rows: { label: string; value: string | number }[] = [];

    if (mode === "compact") {
      const name = feature.transcriptName || feature.geneName || "";
      const partType = feature._hitPartType || "";
      if (name) {
        rows.push({
          label: "",
          value: partType ? `${name} (${partType})` : name,
        });
      }
      return { title: "", rows };
    }

    // Detailed mode
    const title =
      feature.transcriptName || feature.transcriptId || "Transcript";

    if (feature.geneName) {
      rows.push({ label: "Gene", value: feature.geneName });
    }
    if (feature.transcriptType) {
      rows.push({ label: "Type", value: feature.transcriptType });
    }
    if (feature.strand) {
      rows.push({ label: "Strand", value: feature.strand });
    }
    // 0-based → 1-based for display
    rows.push({
      label: "Region",
      value: `${(Math.round(feature.txStart) + 1).toLocaleString()} - ${Math.round(feature.txEnd).toLocaleString()}`,
    });
    if (feature._hitPartType) {
      rows.push({ label: "Feature", value: feature._hitPartType });
      if (
        feature._hitPartStart !== undefined &&
        feature._hitPartEnd !== undefined
      ) {
        rows.push({
          label: "Feature Region",
          value: `${(Math.round(feature._hitPartStart) + 1).toLocaleString()} - ${Math.round(feature._hitPartEnd).toLocaleString()}`,
        });
      }
    }

    return {
      title,
      rows,
      featureRegion:
        feature.txStart !== undefined && feature.txEnd !== undefined
          ? { start: feature.txStart, end: feature.txEnd }
          : undefined,
    };
  }

  private buildBamTooltipContent(
    feature: any,
    mode: "detailed" | "compact" = "detailed",
  ): {
    title: string;
    rows: {
      label: string;
      value: string | number;
      separator?: boolean;
      badges?: { text: string; color: string; textColor?: string }[];
    }[];
    featureRegion?: { start: number; end: number; isJunction?: boolean };
  } {
    const rows: {
      label: string;
      value: string | number;
      separator?: boolean;
      badges?: { text: string; color: string; textColor?: string }[];
    }[] = [];

    if (mode === "compact") {
      // Compact: show first 3 fields + hint
      const readName = feature.readName;
      if (readName) {
        rows.push({ label: "Read name", value: readName });
      }
      const readLen =
        feature.readLength ?? feature.chromEnd - feature.chromStart;
      rows.push({
        label: "Read length",
        value: `${readLen.toLocaleString()} bp`,
      });
      if (feature.mapq !== undefined) {
        const isSecondary =
          feature.flags !== undefined && (feature.flags & 0x100) !== 0;
        const mappingLabel = isSecondary ? "Secondary" : "Primary";
        rows.push({
          label: "Mapping",
          value: `${mappingLabel} @ MAPQ ${feature.mapq}`,
        });
      }
      rows.push({ label: "", value: "Click for more details" });
      return { title: "", rows };
    }

    // ── Detailed mode (IGV-style) ─────────────────────────────────────
    const SEP = { label: "", value: "", separator: true };

    // ── Section 1: Read info ──────────────────────────────────────────
    if (feature.readName) {
      rows.push({ label: "Read name", value: feature.readName });
    }

    const readLen = feature.readLength ?? feature.chromEnd - feature.chromStart;
    rows.push({
      label: "Read length",
      value: `${readLen.toLocaleString()} bp`,
    });

    // Flags (with bit descriptions)
    if (feature.flags !== undefined) {
      const flagParts: string[] = [];
      const f = feature.flags;
      if (f === 0) {
        flagParts.push("forward strand");
      } else {
        if (f & 0x1) flagParts.push("paired");
        if (f & 0x2) flagParts.push("proper pair");
        if (f & 0x4) flagParts.push("unmapped");
        if (f & 0x8) flagParts.push("mate unmapped");
        if (f & 0x10) flagParts.push("reverse strand");
        if (f & 0x20) flagParts.push("mate reverse");
        if (f & 0x40) flagParts.push("first in pair");
        if (f & 0x80) flagParts.push("second in pair");
        if (f & 0x100) flagParts.push("secondary");
        if (f & 0x200) flagParts.push("failed QC");
        if (f & 0x400) flagParts.push("duplicate");
        if (f & 0x800) flagParts.push("supplementary");
      }

      // Strand direction badge (forward / reverse)
      const rcfg = this.v.config.style?.readsColor;
      const isReverse = (f & 0x10) !== 0;
      const strandBadgeColor = isReverse
        ? (rcfg?.minus ?? "#81ecec")
        : (rcfg?.plus ?? "#fab1a0");
      const strandBadge: {
        text: string;
        color: string;
        textColor?: string;
      } = {
        text: "",
        color: strandBadgeColor,
      };

      const desc = flagParts.length > 0 ? ` (${flagParts.join(", ")})` : "";
      rows.push({
        label: "Flags",
        value: `${f}${desc}`,
        badges: [strandBadge],
      });
    }

    // ── Section 2: Alignment info ─────────────────────────────────────
    rows.push(SEP);

    // Mapping quality
    if (feature.mapq !== undefined) {
      const isSecondary =
        feature.flags !== undefined && (feature.flags & 0x100) !== 0;
      const mappingLabel = isSecondary ? "Secondary" : "Primary";
      rows.push({
        label: "Mapping",
        value: `${mappingLabel} @ MAPQ ${feature.mapq}`,
      });
    }

    const chr = feature.chr || "";
    const refSpan = feature.chromEnd - feature.chromStart;
    const strandSymbol = feature.strand === 1 ? "+" : "−";
    // 0-based → 1-based for display
    rows.push({
      label: "Reference span",
      value: `${chr}:${(Number(feature.chromStart) + 1).toLocaleString()}-${Number(feature.chromEnd).toLocaleString()} (${strandSymbol}) = ${refSpan.toLocaleString()}bp`,
    });

    if (feature.cigar) {
      rows.push({ label: "Cigar", value: feature.cigar });

      // Compute clipping info from CIGAR
      const clipMatch = feature.cigar.match(/^(\d+)[SH]|(\d+)[SH]$/g);
      rows.push({
        label: "Clipping",
        value:
          clipMatch && clipMatch.length > 0 ? clipMatch.join(", ") : "None",
      });
    }

    // ── Section 3: Tags ───────────────────────────────────────────────
    if (feature.tags && typeof feature.tags === "object") {
      const tagEntries = Object.entries(feature.tags);
      if (tagEntries.length > 0) {
        rows.push(SEP);

        // Show important tags individually
        const importantTags = [
          "RG",
          "PG",
          "NM",
          "MD",
          "AS",
          "XS",
          "XA",
          "SA",
          "NH",
          "XG",
          "XM",
          "XN",
          "XO",
          "YT",
        ];
        const shownSet = new Set<string>();
        for (const tag of importantTags) {
          if (feature.tags[tag] !== undefined) {
            rows.push({ label: tag, value: String(feature.tags[tag]) });
            shownSet.add(tag);
          }
        }

        // Remaining (hidden) tags
        const remaining = tagEntries.filter(([k]) => !shownSet.has(k));
        if (remaining.length > 0) {
          rows.push({
            label: "Hidden tags",
            value: remaining.map(([k]) => k).join(", "),
          });
        }
      }
    }

    // ── Section 4: Location + Base ────────────────────────────────────
    rows.push(SEP);

    // Location = chr:pos (convert 0-based to 1-based for display)
    if (feature.genomicPos !== undefined) {
      rows.push({
        label: "Location",
        value: `${chr}:${(Math.round(feature.genomicPos) + 1).toLocaleString()}`,
      });

      const baseInfo = this.getBaseAtPosition(feature);
      if (baseInfo) {
        rows.push({
          label: "Base",
          value: baseInfo,
        });
      }
    }

    return {
      title: this.v.config.name,
      rows,
      featureRegion:
        feature.chromStart !== undefined && feature.chromEnd !== undefined
          ? { start: feature.chromStart, end: feature.chromEnd }
          : undefined,
    };
  }

  private buildBamCoverageTooltipContent(
    feature: any,
    mode: "detailed" | "compact" = "detailed",
  ): {
    title: string;
    rows: { label: string; value: string | number; separator?: boolean }[];
    featureRegion?: { start: number; end: number; isJunction?: boolean };
  } {
    const rows: {
      label: string;
      value: string | number;
      separator?: boolean;
    }[] = [];

    if (mode === "compact") {
      rows.push({ label: "Depth", value: feature.depth });
      return { title: "", rows };
    }

    // Detailed mode
    const chr = feature.chr || "";
    // Convert 0-based to 1-based for display
    rows.push({
      label: "Location",
      value: `${chr}:${(Math.round(feature.genomicPos) + 1).toLocaleString()}`,
    });
    rows.push({
      label: "Depth",
      value: feature.depth,
    });
    rows.push({
      label: "Max depth",
      value: feature.maxDepth,
    });
    // 0-based → 1-based for display
    rows.push({
      label: "Region",
      value: `${(Number(feature.chromStart) + 1).toLocaleString()} – ${Number(feature.chromEnd).toLocaleString()}`,
    });

    return {
      title: this.v.config.name + " (Coverage)",
      rows,
      featureRegion:
        feature.chromStart !== undefined && feature.chromEnd !== undefined
          ? { start: feature.chromStart, end: feature.chromEnd }
          : undefined,
    };
  }

  private getBaseAtPosition(feature: any): string | null {
    const { cigar, seq, qual, chromStart, genomicPos } = feature;
    if (!cigar || !seq || genomicPos === undefined) return null;

    // Parse CIGAR string into operations
    const ops = cigar.match(/(\d+)([MIDNSHP=X])/g);
    if (!ops) return null;

    let refPos = chromStart;
    let readPos = 0;
    let targetReadPos = -1;

    for (const op of ops) {
      const len = parseInt(op);
      const type = op[op.length - 1];

      switch (type) {
        case "M":
        case "=":
        case "X":
          // Consumes both reference and read
          if (genomicPos >= refPos && genomicPos < refPos + len) {
            targetReadPos = readPos + (genomicPos - refPos);
          }
          refPos += len;
          readPos += len;
          break;
        case "I":
          // Insertion: only consumes read
          readPos += len;
          break;
        case "D":
        case "N":
          // Deletion / skip: only consumes reference
          if (genomicPos >= refPos && genomicPos < refPos + len) {
            return "- (deletion)";
          }
          refPos += len;
          break;
        case "S":
          // Soft clip: only consumes read
          readPos += len;
          break;
        case "H":
        case "P":
          // Hard clip / padding: consumes nothing
          break;
      }

      if (targetReadPos >= 0) break;
    }

    if (targetReadPos < 0 || targetReadPos >= seq.length) return null;

    const base = seq[targetReadPos];

    // @gmod/bam returns qual as Uint8Array (raw phred scores, NOT +33 encoded)
    let qv: number | null = null;
    if (qual && typeof qual === "object" && targetReadPos < qual.length) {
      qv = qual[targetReadPos];
    } else if (typeof qual === "string" && targetReadPos < qual.length) {
      // Phred+33 encoded string (fallback)
      qv = qual.charCodeAt(targetReadPos) - 33;
    }

    if (qv !== null && qv >= 0) {
      return `${base} @ QV ${qv}`;
    }
    return base;
  }

  private variantBaseColorHex(base: string): string {
    const bc = this.v.config.style?.baseColors as
      Record<string, string> | undefined;
    const upper = base.toUpperCase();
    if (bc && bc[upper]) return bc[upper];
    // Default palette (same as FeatureRenderer.variantBaseColor)
    const defaults: Record<string, string> = {
      A: "#2ed573",
      T: "#ff4757",
      C: "#3dc1d3",
      G: "#f5cd79",
      N: "#999999",
    };
    return defaults[upper] ?? "#999999";
  }

  private seqBadge(
    seq: string,
  ): { text: string; color: string; textColor?: string }[] {
    if (!seq || seq === ".") return [];
    // Strip trailing "*" (context allele marker) for base-count check
    const clean = seq.replace(/\*$/, "");
    if (clean.length === 0) return [];
    const color =
      clean.length === 1
        ? this.variantBaseColorHex(clean)
        : MULTI_BASE_GRAY;
    return [{ text: "", color }];
  }

  private buildVariantTooltipContent(
    feature: any,
    mode: "detailed" | "compact",
  ): {
    title: string;
    rows: {
      label: string;
      value: string | number;
      separator?: boolean;
      badges?: { text: string; color: string; textColor?: string }[];
    }[];
    featureRegion?: { start: number; end: number; isJunction?: boolean };
  } {
    const rows: {
      label: string;
      value: string | number;
      separator?: boolean;
      badges?: { text: string; color: string; textColor?: string }[];
    }[] = [];

    const ref = feature.ref ?? feature.REF ?? "";
    const alt: string[] = Array.isArray(feature.alt ?? feature.ALT)
      ? (feature.alt ?? feature.ALT)
      : [];
    const altStr = alt.join(", ") || ".";

    if (mode === "compact") {
      rows.push({ label: "", value: `${ref} → ${altStr}` });
      return { title: "", rows };
    }

    // ── Basic info ────────────────────────────────────────────────────
    const id =
      feature.id ??
      (Array.isArray(feature.ID) ? feature.ID.join(";") : feature.ID);
    rows.push({ label: "ID", value: id && id !== "." ? id : "." });

    // Type (right after ID) — with coloured badge
    let varType = "Unknown";
    if (
      ref.length === 1 &&
      alt.length > 0 &&
      alt.every((a: string) => a.length === 1)
    ) {
      varType = "SNP";
    } else if (
      alt.length > 0 &&
      alt.some((a: string) => a.length > ref.length)
    ) {
      varType = "INSERTION";
    } else if (
      alt.length > 0 &&
      alt.some((a: string) => a.length < ref.length)
    ) {
      varType = "DELETION";
    } else if (ref.length > 1 || alt.some((a: string) => a.length > 1)) {
      varType = "INDEL";
    }
    const typeColor =
      VARIANT_TYPE_COLORS[varType] ??
      VARIANT_TYPE_COLORS["Unknown"];
    rows.push({
      label: "Type",
      value: varType,
      badges: [{ text: "", color: typeColor }],
    });

    const chr = feature.CHROM ?? this.v.dataRegion.chr ?? "";
    rows.push({ label: "Chr", value: chr });

    // Position (1-based display)
    const pos = (feature.start ?? 0) + 1;
    rows.push({ label: "Position", value: pos.toLocaleString() });

    // Reference — single badge (base colour if 1 base, gray if multi)
    rows.push({
      label: "Reference",
      value: ref ? `${ref}*` : ".",
      badges: this.seqBadge(ref),
    });

    // Alternate — one badge per ALT allele
    const altBadges = alt.flatMap((a: string) => this.seqBadge(a));
    rows.push({
      label: "Alternate",
      value: altStr,
      badges: altBadges,
    });

    const qual = feature.qual ?? feature.QUAL;
    rows.push({
      label: "Qual",
      value:
        qual !== undefined && qual !== null
          ? typeof qual === "number"
            ? qual.toFixed(2)
            : String(qual)
          : ".",
    });

    const filter = feature.filter ?? feature.FILTER;
    const filterStr = Array.isArray(filter)
      ? filter.join("; ")
      : String(filter ?? "");
    const isFiltered =
      filterStr && filterStr !== "." && filterStr.toUpperCase() !== "PASS";
    rows.push({ label: "Is Filtered Out", value: isFiltered ? "Yes" : "No" });

    // ── Alleles section ───────────────────────────────────────────────
    rows.push({ label: "", value: "", separator: true });
    const allAlleleBadges = alt.flatMap((a: string) => this.seqBadge(a));
    rows.push({
      label: "Alternate Alleles",
      value: alt.length > 0 ? alt.join(", ") : ".",
      badges: allAlleleBadges,
    });

    // ── Variant Attributes (all INFO fields) ──────────────────────────
    const info = feature.INFO ?? feature.info;
    if (info && typeof info === "object") {
      const keys = Object.keys(info);
      if (keys.length > 0) {
        rows.push({ label: "", value: "", separator: true });
        for (const key of keys) {
          const raw = info[key];
          if (raw === undefined || raw === null) continue;
          const val = Array.isArray(raw) ? raw.join(", ") : String(raw);
          if (val === "" || val === ".") continue;
          rows.push({ label: key, value: val });
        }
      }
    }

    // FILTER (shown in attributes too if non-trivial)
    if (filterStr && filterStr !== "." && filterStr.toUpperCase() !== "PASS") {
      rows.push({ label: "FILTER", value: filterStr });
    }

    return {
      title: this.v.config.name,
      rows,
      featureRegion:
        feature.start !== undefined
          ? {
              start: feature.start,
              end: feature.start + (feature.ref?.length ?? 1),
            }
          : undefined,
    };
  }

  buildTooltipContent(
    feature: any,
    mode: "detailed" | "compact" = "detailed",
  ): {
    title: string;
    rows: { label: string; value: string | number }[];
    featureRegion?: { start: number; end: number; isJunction?: boolean };
  } {
    // ── Modification marker tooltip ─────────────────────────────────
    if (feature._isModificationHit) {
      return this.buildModificationTooltipContent(feature);
    }

    // ── Transcript record tooltip ─────────────────────────────────────
    if (feature._isTranscriptHit) {
      return this.buildTranscriptTooltipContent(feature, mode);
    }

    // ── BAM read tooltip ──────────────────────────────────────────────
    if (feature._isBamHit) {
      return this.buildBamTooltipContent(feature, mode);
    }

    // ── BAM coverage tooltip ──────────────────────────────────────────
    if (feature._isCoverageHit) {
      return this.buildBamCoverageTooltipContent(feature, mode);
    }

    // ── VCF variant tooltip ───────────────────────────────────────────
    if (feature._isVariantHit || this.v.config.plot === "variant") {
      return this.buildVariantTooltipContent(feature, mode);
    }

    const rows: { label: string; value: string | number }[] = [];
    const scorePlot = this.v.isScorePlot();

    // ── Compact mode ──────────────────────────────────────────────────
    if (mode === "compact") {
      if (scorePlot) {
        // Bigwig / bar / line / point / heatmap → show score value only (no label)
        if (feature.score !== undefined) {
          rows.push({
            label: "",
            value:
              typeof feature.score === "number" &&
              !Number.isInteger(feature.score)
                ? feature.score.toFixed(4)
                : feature.score,
          });
        }
      } else {
        // Rect / diamond / others → show annotation content
        const annotation = this.v.extractCompactAnnotation(feature);
        if (annotation) {
          rows.push({ label: "", value: annotation });
        }
      }
      // No title in compact mode (empty string → header div is omitted)
      return { title: "", rows };
    }

    // ── Detailed mode ─────────────────────────────────────────────────
    const fStart = feature.chromStart ?? feature.start;
    const fEnd = feature.chromEnd ?? feature.end;

    // Try to parse rest field into named key-value pairs
    const parsed = this.v.parseRestFields(feature);
    const displayOrder = this.v.config.style?.order ?? this.v.config.style?.keys;

    if (parsed && displayOrder && displayOrder.length > 0) {
      // ── Structured mode: use parsed fields in defined order ──────

      // Always show the feature id if present (e.g. Exon1, Junction2)
      if (feature.id && typeof feature.id === "string") {
        rows.push({ label: "id", value: feature.id });
      }

      // Always show Region/Position at top if coordinates are available and
      // "Region" is not already in the display order.
      const hasRegionKey = displayOrder.includes("Region");
      if (!hasRegionKey && fStart !== undefined && fEnd !== undefined) {
        // 0-based → 1-based for display
        const displayStart = scorePlot ? Math.round(fStart) + 1 : fStart + 1;
        const displayEnd = scorePlot ? Math.round(fEnd) : fEnd;
        // Diamond plot: show as "Position" (single point marker)
        const isDiamond = this.v.config.plot === "diamond";
        rows.push({
          label: isDiamond ? "Position" : "Region",
          value:
            isDiamond || displayStart === displayEnd
              ? `${Number(displayStart).toLocaleString()}`
              : `${Number(displayStart).toLocaleString()} – ${Number(displayEnd).toLocaleString()}`,
        });
      }

      for (const key of displayOrder) {
        const val = parsed[key];
        if (val === undefined || val === "") continue;

        // Special handling for "Region" key — format as coordinates
        if (key === "Region" && fStart !== undefined && fEnd !== undefined) {
          // 0-based → 1-based for display
          const displayStart = scorePlot ? Math.round(fStart) + 1 : fStart + 1;
          const displayEnd = scorePlot ? Math.round(fEnd) : fEnd;
          // Diamond plot: show as "Position" (single point marker)
          const isDiamond = this.v.config.plot === "diamond";
          rows.push({
            label: isDiamond ? "Position" : "Region",
            value:
              isDiamond || displayStart === displayEnd
                ? `${Number(displayStart).toLocaleString()}`
                : `${Number(displayStart).toLocaleString()} – ${Number(displayEnd).toLocaleString()}`,
          });
          continue;
        }

        // Special handling for "Strand" — use proper minus sign
        if (key === "Strand") {
          rows.push({
            label: "Strand",
            value: val === "-" ? "−" : val,
          });
          continue;
        }

        rows.push({ label: key, value: val });
      }
    } else {
      // ── Fallback: original unstructured mode ─────────────────────
      if (fStart !== undefined && fEnd !== undefined) {
        // 0-based → 1-based for display
        const displayStart = scorePlot ? Math.round(fStart) + 1 : fStart + 1;
        const displayEnd = scorePlot ? Math.round(fEnd) : fEnd;
        // Diamond plot: show as "Position" (single point marker)
        const isDiamond = this.v.config.plot === "diamond";
        rows.push({
          label: isDiamond ? "Position" : "Region",
          value:
            isDiamond || displayStart === displayEnd
              ? `${Number(displayStart).toLocaleString()}`
              : `${Number(displayStart).toLocaleString()} – ${Number(displayEnd).toLocaleString()}`,
        });
      }

      if (feature.name && feature.name !== this.v.config.name) {
        rows.push({ label: "Name", value: feature.name });
      }

      if (feature.score !== undefined) {
        rows.push({
          label: "Score",
          value:
            typeof feature.score === "number" &&
            !Number.isInteger(feature.score)
              ? feature.score.toFixed(4)
              : feature.score,
        });
      }

      if (feature.strand) {
        rows.push({
          label: "Strand",
          value:
            feature.strand === "+"
              ? "+"
              : feature.strand === "-"
                ? "−"
                : feature.strand,
        });
      }

      // Include any additional string/number fields
      const skip = new Set([
        "chromStart",
        "chromEnd",
        "start",
        "end",
        "name",
        "score",
        "strand",
        "chr",
        "chrom",
        "_mergeCount",
      ]);
      for (const [key, value] of Object.entries(feature)) {
        if (skip.has(key) || value == null || value === "") continue;
        if (typeof value === "string" || typeof value === "number") {
          rows.push({
            label:
              key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
            value:
              typeof value === "number" && !Number.isInteger(value)
                ? value.toFixed(4)
                : value,
          });
        }
      }
    }

    return {
      title: this.v.config.name,
      rows,
      featureRegion:
        fStart !== undefined && fEnd !== undefined
          ? {
              start: fStart,
              end: fEnd,
              isJunction: this.v.config.plot === "score_curve",
            }
          : undefined,
    };
  }

}
