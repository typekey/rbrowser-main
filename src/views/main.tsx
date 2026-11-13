import { parseTssRegion } from "../renderer/transcript-renderer/utils/tss-region";
import type { WheelMode } from "../renderer/transcript-renderer/events/wheel-mode";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { rendererRNAConfigTEST } from "../../config/transcript-browser-data_base";
import {
  referencesBase,
  GRCh38Reference,
} from "../../config/references/references-base";
import { TranscriptBrowserRenderer } from "@/renderer/transcript-renderer";
import { historyManager } from "@/renderer/transcript-renderer/history";
import { favouriteManager } from "@/renderer/transcript-renderer/favourite";
import type {
  TooltipMode,
  TooltipTrigger,
} from "@/renderer/transcript-renderer/tooltip";
import type { CursorMode } from "@/renderer/transcript-renderer/cursor";
import type { IHighlightRegion } from "@/renderer/transcript-renderer/highlight";
import type {
  GridDisplay,
  IRBrowerConfig,
  IReferenceConfig,
  ILocus,
  IDefaultLocus,
} from "@/renderer/transcript-renderer/config/config";
import { type ITrans } from "@/renderer/transcript-renderer/reference/reference-manager";
import { regionStringToLocus } from "@/renderer/transcript-renderer/locus/locus-key";
import { PRESET_COLORS } from "../components/ui";
import { HelpModal } from "../components/modals/HelpModal";
import { LeftSidebar } from "../components/sidebar/LeftSidebar";
import { MainBrowser } from "../components/browser/MainBrowser";
import type { ViewMode } from "../components/header/ModeToggle";

const DNA_DEFAULT = "chr1:7765893-7788039";
const RNA_DEFAULT = "VAMP3-201:5000";

// Panel visibility (read once from config)
const _lp = rendererRNAConfigTEST.settings?.panels?.left;
const _hp = rendererRNAConfigTEST.settings?.panels?.header;
/** Left sidebar is DEV-only. */
const LEFT_PANEL_ENABLED = import.meta.env.DEV && _lp?.enabled !== false;
/** Header toolbar master switch — off forces every feature button off. */
const HEADER_PANEL_ENABLED = _hp?.enabled !== false;
const _hpOn = (t?: { enabled?: boolean }) =>
  HEADER_PANEL_ENABLED && t?.enabled !== false;
/** Header features — each defaults to visible. */
const HP = {
  history: _hpOn(_hp?.history),
  favourites: _hpOn(_hp?.favorites),
  download: _hpOn(_hp?.download),
  channel_label: _hpOn(_hp?.channelLabel),
  legend: _hpOn(_hp?.legend),
  grid: _hpOn(_hp?.grid),
  tooltip: _hpOn(_hp?.tooltip),
  highlight: _hpOn(_hp?.highlight),
  cursor: _hpOn(_hp?.cursor),
  scenario: HEADER_PANEL_ENABLED,
} as const;

// ── Grid initial state ──────────────────────────────────────────────────────
const _gridCfg = rendererRNAConfigTEST.settings?.grid;
/** `enabled: false` forces "none". */
const GRID_INIT_DISPLAY: GridDisplay =
  _gridCfg?.enabled === false ? "none" : (_gridCfg?.mode ?? "x+y");
const GRID_INIT_X = GRID_INIT_DISPLAY === "x" || GRID_INIT_DISPLAY === "x+y";
const GRID_INIT_Y = GRID_INIT_DISPLAY === "y" || GRID_INIT_DISPLAY === "x+y";

export function MainView() {
  const rendererRef = useRef<TranscriptBrowserRenderer | null>(null);
  const rafRef = useRef<number | null>(null);
  // DNA region, kept in sync for use inside callbacks
  const lastDnaRegion = useRef(DNA_DEFAULT);

  // ── Two independent coordinate inputs ─────────────────────────────────────
  const [dnaInput, setDnaInputState] = useState(DNA_DEFAULT);
  const [rnaInput, setRnaInput] = useState(RNA_DEFAULT);
  const isEditing = useRef(false);
  const regionInputDirty = useRef(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRnaInputRef = useRef(RNA_DEFAULT);

  // ── Mode state ────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("dna");
  const isRnaMode = viewMode === "rna";
  const isCdsMode = viewMode === "cds";

  // ── Active reference state ────────────────────────────────────────────────
  const [activeRef, setActiveRef] = useState<IReferenceConfig | undefined>(
    undefined,
  );
  // Low (1) for testing; raise to ~8.
  const REF_SEARCH_THRESHOLD = 1;

  const regionInput = viewMode === "dna" ? dnaInput : rnaInput;

  // ── Toolbar states ────────────────────────────────────────────────────────
  const [tooltipVisible, setTooltipVisible] = useState(true);
  const [tooltipTrigger, setTooltipTrigger] = useState<"hover" | "click">(
    "hover",
  );
  const [tooltipMode, setTooltipMode] = useState<TooltipMode>("compact");
  const activeTrigger: TooltipTrigger = tooltipVisible ? tooltipTrigger : "off";
  const [cursorEnabled, setCursorEnabled] = useState(true);
  const [cursorMode, setCursorMode] = useState<CursorMode>("compact");
  const [wheelMode, setWheelMode] = useState<WheelMode>(
    rendererRNAConfigTEST.renderer.wheelMode ?? "zoom",
  );
  const [gridX, setGridX] = useState(GRID_INIT_X);
  const [gridY, setGridY] = useState(GRID_INIT_Y);
  const gridDisplay: GridDisplay =
    gridX && gridY ? "x+y" : gridX ? "x" : gridY ? "y" : "none";
  const [showLabels, setShowLabels] = useState(true);
  const [highlightVisible, setHighlightVisible] = useState(true);
  const [highlightShowDistance, setHighlightShowDistance] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [legendStyle, setLegendStyle] = useState<"auto" | "text" | "colorbar">(
    "auto",
  );

  // ── History & favourites ─────────────────────────────────────────────────
  const [histItems, setHistItems] = useState<ILocus[]>(() =>
    historyManager.getAll(),
  );
  const [favItems, setFavItems] = useState<ILocus[]>(() =>
    favouriteManager.getAll(),
  );
  const [isFav, setIsFav] = useState(false);

  // ── Renderer state, synced via RAF ────────────────────────────────────────
  const [highlights, setHighlights] = useState<IHighlightRegion[]>([]);
  const [currentLocus, setCurrentLocus] = useState<ILocus | null>(null);
  /** Viewport width in bp. */
  const [viewportWidth, setViewportWidth] = useState(0);

  // ── Help modal ────────────────────────────────────────────────────────────
  const [showHelp, setShowHelp] = useState(false);

  // ── Transcript autocomplete (RNA / CDS mode) ──────────────────────────────
  const [transSuggestions, setTransSuggestions] = useState<ITrans[]>([]);
  const [showTransDropdown, setShowTransDropdown] = useState(false);
  const [isTransSearching, setIsTransSearching] = useState(false);
  const transFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transDropdownRef = useRef<HTMLDivElement>(null);
  const regionInputRef = useRef<HTMLInputElement>(null);

  const fetchTransSuggestions = useCallback((raw: string) => {
    if (transFetchTimer.current) clearTimeout(transFetchTimer.current);
    const query = raw.split(":")[0].trim();
    if (query.length < 2) {
      setTransSuggestions([]);
      setShowTransDropdown(false);
      setIsTransSearching(false);
      return;
    }
    transFetchTimer.current = setTimeout(async () => {
      setIsTransSearching(true);
      setShowTransDropdown(true);
      // Clear first so the dropdown never shows stale suggestions.
      setTransSuggestions([]);
      const mgr = rendererRef.current?.referenceManager;
      const suggestions = mgr ? await mgr.searchTranscripts(query, 20) : [];
      setTransSuggestions(suggestions);
      setShowTransDropdown(suggestions.length > 0);
      setIsTransSearching(false);
    }, 300);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showTransDropdown) return;
    const handler = (e: MouseEvent) => {
      if (
        !transDropdownRef.current?.contains(e.target as Node) &&
        !regionInputRef.current?.contains(e.target as Node)
      ) {
        setShowTransDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTransDropdown]);

  // ── Mount renderer ────────────────────────────────────────────────────────
  // Must be layout, not useEffect: the instance has to mount synchronously
  // inside mountBrowser's flushSync().
  useLayoutEffect(() => {
    if (rendererRef.current) return;
    // `channels: []` so the initial channel set comes from the reference,
    // making boot identical to the user-driven reference switch path.
    const bootConfig = {
      ...rendererRNAConfigTEST,
      reference: GRCh38Reference,
      channels: [],
    };
    const renderer = new TranscriptBrowserRenderer(bootConfig);
    rendererRef.current = renderer;
    renderer.mount();
    const bootRefName = renderer.referenceManager.getConfig()?.assembly.name;
    for (const ref of referencesBase) {
      if (ref.assembly.name === bootRefName) continue;
      renderer.referenceManager.add(ref);
    }
    // Use the same switch path as the dropdown so channels are built from the
    // boot reference, not from an inline channel preset.
    renderer.referenceManager.switchTo(0);
    setActiveRef(renderer.referenceManager.getConfig());

    // Same strategy-aware default-locus path as the dropdown switch.
    {
      const bootMgr = renderer.referenceManager;
      const bootNavigate = () => navigateToDefaultLocus(bootMgr);
      const bootSync = bootMgr.lastSyncPromise;
      if (bootSync) void bootSync.then(bootNavigate).catch(bootNavigate);
      else void bootNavigate();
    }

    renderer.setTooltipTrigger("hover");
    renderer.setTooltipMode("compact");
    renderer.setCursorEnabled(true);
    renderer.setCursorMode("compact");
    renderer.setWheelMode(wheelMode);
    const unsubscribeWheel = renderer.headerPanelManager.on((event, detail) => {
      if (event === "stateChange" && detail.buttonId === "wheel") {
        const mode = detail.value?.mode;
        if (mode === "zoom" || mode === "scroll") setWheelMode(mode);
      }
    });
    renderer.setGrid(GRID_INIT_DISPLAY);
    renderer.setHighlightVisible(true);

    // Dropped `.rbi`/`.rba` catalogues and the "Custom" menu entry land here.
    renderer.setOnImportCustomReference(addCustomReference);

    renderer.setRnaModeChangeCallback((enabled, info) => {
      if (enabled) {
        setViewMode("rna");
        if (info && !isEditing.current) {
          const vrna = renderer.viewRnaRegion;
          if (vrna) {
            setRnaInput(vrna);
            lastRnaInputRef.current = vrna;
          }
        } else if (!info && !isEditing.current) {
          setRnaInput(RNA_DEFAULT);
          lastRnaInputRef.current = RNA_DEFAULT;
        }
      } else {
        setViewMode("dna");
      }
    });

    renderer.setCdsModeChangeCallback((enabled, info) => {
      if (enabled) {
        setViewMode("cds");
        if (info && !isEditing.current) {
          // Skip until viewRnaRegion is ready, else the default `:5000:5000`
          // flank flashes.
          const vrna = renderer.viewRnaRegion;
          if (vrna) {
            setRnaInput(vrna);
            lastRnaInputRef.current = vrna;
          }
        }
      } else {
        setViewMode("dna");
      }
    });


    const syncState = () => {
      const r = rendererRef.current;
      if (r) {
        const inputFocused =
          regionInputRef.current != null &&
          document.activeElement === regionInputRef.current;

        if (
          !r.axisController.isRnaMode &&
          !r.axisController.isCdsMode &&
          !inputFocused
        ) {
          const vr = r.viewRegion;
          setDnaInputState((prev) => {
            if (prev === vr) return prev;
            lastDnaRegion.current = vr;
            return vr;
          });
        }

        if (
          (r.axisController.isRnaMode || r.axisController.isCdsMode) &&
          !inputFocused
        ) {
          const vrna = r.viewRnaRegion;
          if (vrna) {
            setRnaInput((prev) => {
              if (prev === vrna) return prev;
              lastRnaInputRef.current = vrna;
              return vrna;
            });
          }
        }

        // LocusManager owns the canonical key, so let it answer this.
        const nowFav = r.locusManager.getIsFavorite();
        setIsFav((prev) => (prev === nowFav ? prev : nowFav));
        const hlRegions = r.highlightManager.regions as IHighlightRegion[];
        setHighlights((prev) => {
          if (
            prev.length === hlRegions.length &&
            prev.every(
              (h, i) =>
                h.name === hlRegions[i].name &&
                h.start === hlRegions[i].start &&
                h.end === hlRegions[i].end &&
                h.color === hlRegions[i].color,
            )
          )
            return prev;
          return [...hlRegions];
        });

        const vd = r.getViewDomain();
        const vw = Math.round(vd.end - vd.start);
        setViewportWidth((prev) => (prev === vw ? prev : vw));

        // tick() re-allocates only on a material change. It also drives every
        // LocusManager listener, since syncState is the one per-frame entry point.
        const locus = r.locusManager.tick();
        if (locus) setCurrentLocus(locus);
      }
      rafRef.current = requestAnimationFrame(syncState);
    };
    rafRef.current = requestAnimationFrame(syncState);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      unsubscribeWheel();
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync toolbar state changes → renderer ─────────────────────────────────
  useEffect(() => {
    rendererRef.current?.setTooltipTrigger(activeTrigger);
  }, [activeTrigger]);
  useEffect(() => {
    rendererRef.current?.setTooltipMode(tooltipMode);
  }, [tooltipMode]);
  useEffect(() => {
    rendererRef.current?.setCursorEnabled(cursorEnabled);
  }, [cursorEnabled]);
  useEffect(() => {
    rendererRef.current?.setCursorMode(cursorMode);
  }, [cursorMode]);
  useEffect(() => {
    rendererRef.current?.setWheelMode(wheelMode);
  }, [wheelMode]);
  useEffect(() => {
    rendererRef.current?.setGrid(gridDisplay);
  }, [gridDisplay]);
  useEffect(() => {
    rendererRef.current?.setHighlightVisible(highlightVisible);
  }, [highlightVisible]);
  useEffect(() => {
    rendererRef.current?.setHighlightShowDistance(highlightShowDistance);
  }, [highlightShowDistance]);

  // ── Dispatch toolbar state changes → HeaderPanelManager ────────────────────
  useEffect(() => {
    rendererRef.current?.headerPanelManager.dispatchStateChange("tooltip", {
      visible: tooltipVisible,
      trigger: tooltipTrigger,
      mode: tooltipMode,
    });
  }, [tooltipVisible, tooltipTrigger, tooltipMode]);
  useEffect(() => {
    rendererRef.current?.headerPanelManager.dispatchStateChange("grid", {
      display: gridDisplay,
    });
  }, [gridDisplay]);
  useEffect(() => {
    rendererRef.current?.headerPanelManager.dispatchStateChange("cursor", {
      enabled: cursorEnabled,
      mode: cursorMode,
    });
  }, [cursorEnabled, cursorMode]);
  useEffect(() => {
    rendererRef.current?.headerPanelManager.dispatchStateChange("highlight", {
      visible: highlightVisible,
    });
  }, [highlightVisible]);
  useEffect(() => {
    rendererRef.current?.headerPanelManager.dispatchStateChange(
      "channel_label",
      {
        visible: showLabels,
      },
    );
  }, [showLabels]);
  useEffect(() => {
    rendererRef.current?.headerPanelManager.dispatchStateChange("legend", {
      visible: showLegend,
      style: legendStyle,
    });
  }, [showLegend, legendStyle]);

  // ── Sync channel label visibility via DOM ─────────────────────────────────
  useEffect(() => {
    const container = document.getElementById("tb-rna");
    if (!container) return;
    container
      .querySelectorAll<HTMLElement>(".channel-label-el")
      .forEach((el) => {
        el.style.display = showLabels ? "" : "none";
      });
  }, [showLabels]);

  // ── Sync channel score label (legend) visibility & style ───────────────────
  useEffect(() => {
    rendererRef.current?.setLegendStyle(showLegend, legendStyle);
  }, [showLegend, legendStyle]);

  // ── Region commit ─────────────────────────────────────────────────────────
  const commitRegion = useCallback(
    async (value: string, keepEditing = false) => {
      if (!keepEditing) isEditing.current = false;
      regionInputDirty.current = false;
      const v = value.trim();
      if (!v || !rendererRef.current) return;
      const r = rendererRef.current;
      try {
        const interval = !r.axisController.isCdsMode ? parseTssRegion(v) : null;
        if (interval) {
          const mode = r.axisController.isRnaMode ? "rna" : "dna";
          await r.navigateByTranscriptTss(interval.name, interval.start, interval.end, mode);
          if (mode === "rna") {
            const actual = r.viewRnaRegion;
            setRnaInput(actual);
            lastRnaInputRef.current = actual;
          } else {
            setDnaInputState(r.viewRegion);
            lastDnaRegion.current = r.viewRegion;
          }
          r.locusManager.tick();
          const locus = r.locusManager.getLocus();
          historyManager.add(locus);
          setHistItems(historyManager.getAll());
          setFavItems(favouriteManager.getAll());
          setIsFav(favouriteManager.has(locus));
          return;
        }
        if (r.axisController.isCdsMode) {
          const m1 = v.match(/^([\w][\w.-]*):(\d+)$/);
          const m2 = v.match(/^([\w][\w.-]*):(\d+):(\d+)$/);
          if (m2) {
            const name = m2[1];
            const flank = Math.max(parseInt(m2[2], 10), parseInt(m2[3], 10));
            r.navigateByTranscriptCDS(name, flank);
          } else if (m1) {
            const name = m1[1];
            const flank = parseInt(m1[2], 10);
            r.navigateByTranscriptCDS(name, flank);
          } else {
            r.region = v;
          }
          lastRnaInputRef.current = v;
          setRnaInput(v);
        } else if (r.axisController.isRnaMode) {
          r.region = v;
          lastRnaInputRef.current = v;
          setRnaInput(v);
        } else {
          const cleaned = v.replace(/,/g, "");
          const dnaMatch = cleaned.match(/^([\w.]+):(\d+)-(\d+)$/);
          if (dnaMatch) {
            r.region = cleaned;
            const actual = r.viewRegion || cleaned;
            lastDnaRegion.current = actual;
            setDnaInputState(actual);
          } else {
            if (/^[\w][\w.-]*:\d+(:\d+)?$/.test(cleaned)) return;
            const flank = 5000;
            r.resolveTranscriptDNA(cleaned, flank)
              .then((dnaCoord) => {
                if (!dnaCoord) return;
                try {
                  r.region = dnaCoord;
                } catch {}
                const actual = r.viewRegion || dnaCoord;
                lastDnaRegion.current = actual;
                setDnaInputState(actual);
                const rnaVal = `${cleaned}:${flank}`;
                setRnaInput(rnaVal);
                lastRnaInputRef.current = rnaVal;
                // `r.region = dnaCoord` switches to DNA mode synchronously,
                // so getLocus() already reflects the new view.
                const locus = r.locusManager.getLocus();
                historyManager.add(locus);
                setHistItems(historyManager.getAll());
                setFavItems(favouriteManager.getAll());
                setIsFav(favouriteManager.has(locus));
              })
              .catch(() => {});
            return;
          }
        }
        // Snapshot for history. DNA mode is sync, so ask LocusManager. RNA/CDS
        // navigation is still in flight, so synthesise from the typed input.
        const assembly = r.referenceManager.getConfig()?.assembly?.name;
        const locus =
          r.axisController.isRnaMode || r.axisController.isCdsMode
            ? regionStringToLocus(v, {
                assembly,
                mode: r.axisController.isCdsMode ? "cds" : "rna",
                tss: !r.axisController.isCdsMode,
              })
            : r.locusManager.getLocus();
        historyManager.add(locus);
        setHistItems(historyManager.getAll());
        setFavItems(favouriteManager.getAll());
        setIsFav(favouriteManager.has(locus));
      } catch {
        if (r.axisController.isRnaMode || r.axisController.isCdsMode)
          setRnaInput(rnaInput);
        else setDnaInputState(r.viewRegion);
      }
    },
    [rnaInput],
  );

  const handleRegionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        commitRegion((e.target as HTMLInputElement).value, true);
      }
    },
    [commitRegion],
  );

  const applyDnaRegion = useCallback(
    (r: TranscriptBrowserRenderer, newRegion: string) => {
      r.region = newRegion;
      const actual = r.viewRegion || newRegion;
      lastDnaRegion.current = actual;
      setDnaInputState(actual);
      // DNA navigation is sync, so getLocus() is already up to date.
      const locus = r.locusManager.getLocus();
      historyManager.add(locus);
      setHistItems(historyManager.getAll());
      setFavItems(favouriteManager.getAll());
      setIsFav(favouriteManager.has(locus));
    },
    [],
  );

  // ── Zoom/pan limits – mirrors interaction.ts exactly ─────────────────────
  const IA_MIN_SPAN = 10;
  const IA_MAX_BP_PX = 20;

  // ── Pan ───────────────────────────────────────────────────────────────────
  const panBy = useCallback(
    (frac: number) => {
      const r = rendererRef.current;
      if (!r) return;
      if (r.axisController.isCdsMode) {
        r.panCdsView(frac);
        return;
      }
      const regionStr = r.viewRegion || lastDnaRegion.current;
      const m = regionStr.match(/^([\w.]+):(\d+)-(\d+)$/);
      if (!m) return;
      const [, chr, s, e] = m;
      const chrMax = r.getChromSize(chr) ?? 500_000_000;
      const span = +e - +s;
      const rawStart = Math.round(+s + span * frac);
      const rawEnd = Math.round(+e + span * frac);
      let ns = rawStart;
      let ne = rawEnd;
      if (ns < 0) {
        ne -= ns;
        ns = 0;
      }
      if (ne > chrMax) {
        ns -= ne - chrMax;
        ne = chrMax;
      }
      ns = Math.max(0, ns);
      ne = Math.min(chrMax, ne);
      const sides: Array<"left" | "right"> = [];
      if (rawStart < 0) sides.push("left");
      if (rawEnd > chrMax) sides.push("right");
      if (sides.length > 0) r.boundaryFeedback?.flash(sides);
      try {
        applyDnaRegion(r, `${chr}:${ns}-${ne}`);
      } catch {}
    },
    [applyDnaRegion],
  );

  // ── Zoom ──────────────────────────────────────────────────────────────────
  const zoomBy = useCallback(
    (factor: number) => {
      const r = rendererRef.current;
      if (!r) return;
      if (r.axisController.isCdsMode) {
        r.zoomCdsView(factor);
        return;
      }
      const regionStr = r.viewRegion || lastDnaRegion.current;
      const m = regionStr.match(/^([\w.]+):(\d+)-(\d+)$/);
      if (!m) return;
      const [, chr, s, e] = m;
      const chrMax = r.getChromSize(chr) ?? 500_000_000;
      const effectiveMinSpan = Math.max(
        IA_MIN_SPAN,
        r.browserWidth / IA_MAX_BP_PX,
      );
      const center = (+s + +e) / 2;
      const rawSpan = (+e - +s) / factor;
      const clampedSpan = Math.max(effectiveMinSpan, Math.min(rawSpan, chrMax));
      let ns = Math.round(center - clampedSpan / 2);
      let ne = Math.round(center + clampedSpan / 2);
      const rawNs = ns;
      const rawNe = ne;
      if (ns < 0) {
        ne -= ns;
        ns = 0;
      }
      if (ne > chrMax) {
        ns -= ne - chrMax;
        ne = chrMax;
      }
      ns = Math.max(0, ns);
      const zSides: Array<"left" | "right"> = [];
      if (rawNs < 0) zSides.push("left");
      if (rawNe > chrMax) zSides.push("right");
      if (zSides.length > 0) r.boundaryFeedback?.flash(zSides);
      try {
        applyDnaRegion(r, `${chr}:${ns}-${ne}`);
      } catch {}
    },
    [applyDnaRegion],
  );

  // ── Mode switch ────────────────────────────────────────────────────────────
  const switchMode = (target: ViewMode) => {
    const r = rendererRef.current;
    if (!r) return;
    const current: ViewMode = r.axisController.isCdsMode
      ? "cds"
      : r.axisController.isRnaMode
        ? "rna"
        : "dna";
    if (target === current) return;

    if (blurTimerRef.current !== null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }

    r.incrementModeGeneration();

    if (target !== "cds") {
      if (current === "rna") r.disableRnaMode();
      else if (current === "cds") r.disableCdsMode();
    }

    if (target === "dna") {
      // Nothing extra — disabling RNA/CDS already reverts to DNA
    } else if (target === "rna") {
      if (r._tssContext?.chr === r.config.region.chr) {
        r.axisController.enableRnaMode(r._tssContext);
        setRnaInput(r.viewRnaRegion);
        lastRnaInputRef.current = r.viewRnaRegion;
        return;
      }
      if (current === "cds") {
        const parts = rnaInput.split(":");
        void r.navigateByTranscript(parts[0], Math.max(...parts.slice(1).map(Number), 0));
        return;
      }
      const rna = rnaInput || RNA_DEFAULT;
      setRnaInput(rna);
      try {
        r.region = rna;
      } catch {}
    } else if (target === "cds") {
      const rna = rnaInput || RNA_DEFAULT;
      setRnaInput(rna);
      const m2 = rna.match(/^([\w][\w.-]*):([+-]?\d+):([+-]?\d+)$/);
      const m1 = rna.match(/^([\w][\w.-]*):(\d+)$/);
      if (m2) {
        const flank = Math.max(Math.abs(parseInt(m2[2], 10)), Math.abs(parseInt(m2[3], 10)));
        r.navigateByTranscriptCDS(m2[1], flank);
      } else if (m1) {
        r.navigateByTranscriptCDS(m1[1], parseInt(m1[2], 10));
      }
    }
  };

  // ── Apply external config ───────────────────────────────────────────────
  const applyConfig = (cfg: IRBrowerConfig) => {
    const r = rendererRef.current;
    if (!r) return;

    if (cfg.reference) {
      const asmName = cfg.reference.assembly.name;
      const refMgr = r.referenceManager;
      const existingIdx = refMgr
        .getAll()
        .findIndex((x) => x.assembly.name === asmName);
      if (existingIdx !== -1) {
        refMgr.switchTo(existingIdx);
      } else {
        const newIdx = refMgr.add(cfg.reference);
        refMgr.switchTo(newIdx);
      }
      setActiveRef(refMgr.getConfig());
    }

    r.channelManager.replaceAll(cfg.channels ?? []);

    r.highlightManager.clear();
    if (cfg.highlight && cfg.highlight.length > 0) {
      const assembly = r.referenceManager.getConfig()?.assembly;
      for (const hl of cfg.highlight) {
        r.highlightManager.setRegion(
          hl.name,
          hl.start,
          hl.end,
          hl.color,
          assembly,
        );
      }
    }

    const targetMode = cfg.locus?.mode ?? "rna";
    switchMode(targetMode);

    const locusRna = cfg.locus?.rna;
    const locusDna = cfg.locus?.dna;
    const rnaName =
      locusRna?.trans_name ??
      locusRna?.trans_id ??
      locusRna?.gene_name ??
      locusRna?.gene_id ??
      "";
    const upOff = locusRna?.up ?? 5000;
    const downOff = locusRna?.down ?? 5000;
    if (
      targetMode === "dna" &&
      locusDna &&
      locusDna.chr != null &&
      locusDna.start != null &&
      locusDna.end != null
    ) {
      const regionStr = `${locusDna.chr}:${locusDna.start}-${locusDna.end}`;
      try {
        applyDnaRegion(r, regionStr);
      } catch {}
    } else if (targetMode === "rna" && rnaName) {
      setRnaInput(rnaName);
      void r.navigateByTranscriptAsymmetric(rnaName, upOff, downOff).then(() => {
        setRnaInput(r.viewRnaRegion);
        lastRnaInputRef.current = r.viewRnaRegion;
      });
    } else if (targetMode === "cds" && rnaName) {
      const rna = `${rnaName}:${upOff}:${downOff}`;
      setRnaInput(rna);
      lastRnaInputRef.current = rna;
      r.navigateByTranscriptCDS(rnaName, Math.max(upOff, downOff)).catch(
        () => {},
      );
    }
  };

  // ── Favourite toggle ───────────────────────────────────────────────────────
  // useCallback: the keyboard-shortcut effect depends on this, and an unstable
  // identity would re-register the window keydown listener on every render.
  const toggleFav = useCallback(() => {
    const r = rendererRef.current;
    if (!r) return;
    const locus = r.locusManager.getLocus();
    const nowFav = favouriteManager.toggle(locus);
    setIsFav(nowFav);
    setFavItems(favouriteManager.getAll());
  }, []);

  /**
   * Navigate to a stored ILocus (history / favourite entry).
   * Delegates to `LocusManager.navigateToLocus()`, then syncs the Search Input
   * and re-adds the locus so history orders by most recently clicked.
   */
  const navigateToLocusEntry = async (locus: ILocus) => {
    const r = rendererRef.current;
    if (!r) return;
    if (blurTimerRef.current !== null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    const ok = await r.locusManager.navigateToLocus(locus);
    if (!ok) return;
    if (locus.mode === "dna") {
      const region = `${locus.dna.chr}:${locus.dna.start}-${locus.dna.end}`;
      lastDnaRegion.current = region;
      setDnaInputState(region);
    } else {
      const display = r.viewRnaRegion;
      setRnaInput(display);
      lastRnaInputRef.current = display;
    }
    // Record in history; RAF syncs isFav on the next tick.
    const snapshot = r.locusManager.getLocus();
    historyManager.add(snapshot);
    setHistItems(historyManager.getAll());
  };

  // ── Highlight helpers ─────────────────────────────────────────────────────
  const updateHighlight = (
    name: string,
    start: number,
    end: number,
    color: string,
  ) => {
    const assembly =
      rendererRef.current?.referenceManager.getConfig()?.assembly;
    rendererRef.current?.highlightManager.setRegion(
      name,
      start,
      end,
      color,
      assembly,
    );
    rendererRef.current?.forceRedraw();
  };

  const deleteHighlight = (name: string) => {
    rendererRef.current?.highlightManager.removeRegion(name);
    rendererRef.current?.forceRedraw();
  };

  const clearAllHighlights = () => {
    rendererRef.current?.highlightManager.clear();
    rendererRef.current?.forceRedraw();
  };

  const addHighlight = () => {
    const domain = rendererRef.current?.getViewDomain();
    if (!domain) return;
    const mid = Math.round((domain.start + domain.end) / 2);
    const half = Math.round((domain.end - domain.start) * 0.1);
    const name = `hl_${Date.now()}`;
    const assembly =
      rendererRef.current?.referenceManager.getConfig()?.assembly;
    rendererRef.current?.highlightManager.setRegion(
      name,
      mid - half,
      mid + half,
      PRESET_COLORS[0],
      assembly,
    );
    rendererRef.current?.forceRedraw();
  };

  // ── Global keyboard shortcuts (Alt + key, plus bare arrow pan) ──────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const code = e.code;

      if (!e.altKey && !e.ctrlKey && !e.metaKey) {
        if (code === "ArrowLeft") {
          e.preventDefault();
          panBy(-0.5);
          return;
        }
        if (code === "ArrowRight") {
          e.preventDefault();
          panBy(0.5);
          return;
        }
      }

      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        if (code === "ArrowLeft") {
          e.preventDefault();
          panBy(-1);
          return;
        }
        if (code === "ArrowRight") {
          e.preventDefault();
          panBy(1);
          return;
        }
      }

      if (!e.altKey) return;

      switch (code) {
        case "KeyH":
          e.preventDefault();
          setShowHelp((v) => !v);
          break;
        case "KeyL":
          e.preventDefault();
          setShowLabels((v) => !v);
          break;
        case "KeyG":
          e.preventDefault();
          setShowLegend((v) => !v);
          break;
        case "KeyD":
          e.preventDefault();
          {
            const anyOn = gridX || gridY;
            setGridX(!anyOn);
            setGridY(!anyOn);
          }
          break;
        case "KeyT":
          e.preventDefault();
          setTooltipVisible((v) => !v);
          break;
        case "KeyI":
          e.preventDefault();
          setHighlightVisible((v) => !v);
          break;
        case "KeyK":
          e.preventDefault();
          setCursorEnabled((v) => !v);
          break;
        case "KeyF":
          e.preventDefault();
          toggleFav();
          break;
        case "BracketRight":
          e.preventDefault();
          zoomBy(2);
          break;
        case "BracketLeft":
          e.preventDefault();
          zoomBy(0.5);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toggleFav, panBy, zoomBy, gridX, gridY]);

  // ── Region input handlers (delegated to RegionSearchInput) ─────────────────
  const onRegionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    regionInputDirty.current = true;
    const val = e.target.value;
    if (isRnaMode || isCdsMode) {
      setRnaInput(val);
      fetchTransSuggestions(val);
    } else {
      lastDnaRegion.current = val;
      setDnaInputState(val);
      const trimmed = val.trim();
      if (
        trimmed.length >= 2 &&
        /^[A-Za-z]/.test(trimmed) &&
        !/^chr/i.test(trimmed) &&
        !/^\w+:\d+-\d+$/.test(trimmed.replace(/,/g, ""))
      ) {
        fetchTransSuggestions(val);
      } else {
        setTransSuggestions([]);
        setShowTransDropdown(false);
      }
    }
  };

  const onRegionFocus = () => {
    isEditing.current = true;
    // So the tooltip doesn't compete with the search dropdown.
    rendererRef.current?.hideTooltip();
    window.getSelection()?.removeAllRanges();
    // Drop stale dropdown state; it re-opens once the user types. The input
    // value stays as-is so the visible `NAME:up:down` isn't lost.
    setTransSuggestions([]);
    setShowTransDropdown(false);
  };

  const onRegionBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isEditing.current = false;
    const blurValue = e.target.value;
    const shouldCommit = regionInputDirty.current;
    regionInputDirty.current = false;
    if (blurTimerRef.current !== null) {
      clearTimeout(blurTimerRef.current);
    }
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null;
      if (isEditing.current) return;
      if (!transDropdownRef.current?.contains(document.activeElement)) {
        setShowTransDropdown(false);
        // Unchanged focus/blur and Enter must not re-submit an old interval
        // after the user has already panned, zoomed, or switched modes.
        if (!shouldCommit) return;
        // Blurred without picking a suggestion or pressing Enter — restore the
        // full NAME:up:down so the input matches the actual region.
        if (
          (isRnaMode || isCdsMode) &&
          blurValue === blurValue.split(":")[0].trim() &&
          lastRnaInputRef.current.includes(":")
        ) {
          setRnaInput(lastRnaInputRef.current);
          return;
        }
        commitRegion(blurValue);
      }
    }, 150);
  };

  const onRegionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setShowTransDropdown(false);
    }
    handleRegionKeyDown(e);
  };

  const onSelectSuggestion = (s: ITrans) => {
    setShowTransDropdown(false);
    // Picking a suggestion keeps input focus, so the next mousedown on a channel
    // blurs it and fires a stale delayed commitRegion mid-drag — blur + cancel.
    isEditing.current = false;
    regionInputRef.current?.blur();
    if (blurTimerRef.current !== null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    // RNAcentral (`URS…`) entries share a NON-UNIQUE `trans_name` across
    // isoforms, so navigate by the unique `trans_id`. GENCODE/Ensembl names
    // are unique → keep them for a friendly display.
    const isRnaCentralId = /^URS[0-9A-F]+(_\d+)?$/i.test(s.trans_id ?? "");
    const navKey =
      !isRnaCentralId && s.trans_name && /^[\w][\w.-]*$/.test(s.trans_name)
        ? s.trans_name
        : s.trans_id || s.trans_name;
    if (!isRnaMode && !isCdsMode) {
      const r = rendererRef.current;
      if (!r) return;
      const flank = 5000;
      r.resolveTranscriptDNA(navKey, flank).then((dnaCoord) => {
        if (dnaCoord) {
          setDnaInputState(dnaCoord);
          lastDnaRegion.current = dnaCoord;
          const rnaVal = `${navKey}:${flank}`;
          setRnaInput(rnaVal);
          lastRnaInputRef.current = rnaVal;
          commitRegion(dnaCoord);
        }
      });
      return;
    }
    const parts = rnaInput.split(":");
    const flank = parts.length > 1 ? parts.slice(1).join(":") : "5000";
    const newVal = `${navKey}:${flank}`;
    setRnaInput(newVal);
    lastRnaInputRef.current = newVal;
    commitRegion(newVal);
  };

  // ── Default-locus → region string / input sync ────────────────────────────
  // DNA loci → "chrom:start-end"; otherwise RNA notation "NAME:up:down".
  const locusToRegion = (dl: IDefaultLocus | undefined): string | null => {
    if (!dl) return null;
    const dnaComplete =
      !!dl.dna &&
      dl.dna.chr != null &&
      dl.dna.start != null &&
      dl.dna.end != null;
    if (dl.mode === "dna" && dnaComplete) {
      return `${dl.dna!.chr}:${dl.dna!.start}-${dl.dna!.end}`;
    }
    const rna = dl.rna;
    const name =
      rna?.trans_id ?? rna?.trans_name ?? rna?.gene_id ?? rna?.gene_name;
    if (name) {
      const up = rna?.up ?? 5000;
      const down = rna?.down ?? 5000;
      return name;
    }
    if (dnaComplete) {
      return `${dl.dna!.chr}:${dl.dna!.start}-${dl.dna!.end}`;
    }
    return null;
  };

  // Point the visible Search Input at the locus we're about to navigate to.
  const setRegionInputForLocus = (
    dl: IDefaultLocus | undefined,
    region: string,
  ) => {
    const isDna = (dl?.mode === "dna" && dl?.dna) || /:\d+-\d+$/.test(region);
    if (isDna) {
      setDnaInputState(region);
      lastDnaRegion.current = region;
    } else {
      setRnaInput(region);
      lastRnaInputRef.current = region;
    }
  };

  /**
   * Snapshot an IDefaultLocus into an ILocus for history.
   * Built from `dl` directly because some navigation paths are
   * fire-and-forget, so the manager's cached locus still holds the OLD state.
   */
  const synthesizeLocusFromDefault = (
    dl: IDefaultLocus,
    assemblyName: string,
  ): ILocus => ({
    id: Math.random().toString(36).slice(2, 12),
    time: new Date().toISOString(),
    isFavorite: false,
    mode: dl.mode ?? "rna",
    rna: {
      assembly: assemblyName,
      trans_id: dl.rna?.trans_id,
      trans_name: dl.rna?.trans_name,
      trans_type: dl.rna?.trans_type,
      gene_id: dl.rna?.gene_id,
      gene_name: dl.rna?.gene_name,
      gene_type: dl.rna?.gene_type,
      strand: dl.rna?.strand,
      up: dl.rna?.up,
      down: dl.rna?.down,
    },
    dna: {
      chr: dl.dna?.chr ?? "",
      start: dl.dna?.start ?? 0,
      end: dl.dna?.end ?? 0,
      assembly: assemblyName,
    },
  });

  /**
   * Record the default-locus navigation in History (boot / reference-switch /
   * reset paths). `locusKey` dedups, so re-resetting won't pile up entries.
   */
  const recordDefaultLocusInHistory = (
    dl: IDefaultLocus,
    refMgr: NonNullable<typeof rendererRef.current>["referenceManager"],
  ) => {
    const assemblyName = refMgr.getConfig()?.assembly?.name ?? "";
    if (!assemblyName) return;
    const renderer = rendererRef.current;
    renderer?.locusManager.tick();
    const locus = renderer?.locusManager.getLocus() ?? synthesizeLocusFromDefault(dl, assemblyName);
    // No usable identity/coords would mean an unreachable history entry.
    const hasDna =
      locus.mode === "dna" &&
      locus.dna.chr &&
      locus.dna.start >= 0 &&
      locus.dna.end > 0;
    const hasRna =
      locus.mode !== "dna" &&
      !!(
        locus.rna.trans_id ||
        locus.rna.trans_name ||
        locus.rna.gene_id ||
        locus.rna.gene_name
      );
    if (!hasDna && !hasRna) return;
    historyManager.add(locus);
    setHistItems(historyManager.getAll());
  };

  // Navigate to the active reference's default locus, via whichever strategy
  // ReferenceManager chose (rna-name / rna-annotation / dna).
  const navigateToDefaultLocus = async (
    refMgr:
      NonNullable<typeof rendererRef.current>["referenceManager"] | undefined,
  ) => {
    if (!rendererRef.current || !refMgr) return;
    const plan = await refMgr.resolveDefaultLocus();
    const r = rendererRef.current;
    if (!plan || !r) return;
    const dl = plan.locus;

    if (
      plan.kind === "rna-annotation" &&
      dl.rna &&
      dl.dna &&
      dl.dna.chr != null &&
      dl.dna.start != null &&
      dl.dna.end != null
    ) {
      // Navigate by id first: version/prefix-tolerant GFF match...
      const name =
        dl.rna.trans_id ??
        dl.rna.trans_name ??
        dl.rna.gene_id ??
        dl.rna.gene_name;
      // ...but show the human-readable transcript name in the Search Input.
      const displayName =
        dl.rna.trans_name ??
        dl.rna.trans_id ??
        dl.rna.gene_name ??
        dl.rna.gene_id ??
        name;
      if (name) {
        const up = dl.rna.up ?? 5000;
        const down = dl.rna.down ?? 5000;
        const rnaRegion = displayName ?? name;
        setRnaInput(rnaRegion);
        lastRnaInputRef.current = rnaRegion;
        try {
          await r.navigateByTranscriptAnnotation(
            name,
            { chrom: dl.dna.chr, start: dl.dna.start, end: dl.dna.end },
            up,
            down,
          );
        } catch {}
        setRnaInput(r.viewRnaRegion);
        lastRnaInputRef.current = r.viewRnaRegion;
        recordDefaultLocusInHistory(dl, refMgr);
        return;
      }
    }

    const region = locusToRegion(dl);
    if (!region) return;
    setRegionInputForLocus(dl, region);
    try {
      if (dl.mode !== "dna" && dl.rna) {
        const name = dl.rna.trans_id ?? dl.rna.trans_name ?? dl.rna.gene_id ?? dl.rna.gene_name;
        if (name) await r.navigateByTranscriptAsymmetric(name, dl.rna.up ?? 5000, dl.rna.down ?? 5000);
        setRnaInput(r.viewRnaRegion);
        lastRnaInputRef.current = r.viewRnaRegion;
      } else r.region = region;
    } catch {}
    recordDefaultLocusInHistory(dl, refMgr);
  };

  // ── Reset to the active reference's initial view ───────────────────────────
  // Rebuilds ONLY the reference-derived channels and returns to the default
  // locus — user-added channels are not restored.
  const resetView = () => {
    const r = rendererRef.current;
    const refMgr = r?.referenceManager;
    if (!r || !refMgr) return;
    const ref = refMgr.getConfig();
    if (!ref) {
      // No active reference — fall back to the full base config.
      applyConfig(rendererRNAConfigTEST);
      return;
    }
    // Re-sync channels (drops every extra channel).
    refMgr.switchTo(refMgr.getActiveIndex());
    setActiveRef(refMgr.getConfig());

    const navigate = () => navigateToDefaultLocus(refMgr);
    const sync = refMgr.lastSyncPromise;
    if (sync) void sync.then(navigate).catch(navigate);
    else void navigate();
  };

  // ── Reference switch (assembly dropdown) ───────────────────────────────────
  const onReferenceSwitch = (switched: IReferenceConfig) => {
    setActiveRef(switched);
    // Highlights / tooltip / selection belong to the previous genome — clear
    // them so nothing stale lingers on the new one.
    clearAllHighlights();
    rendererRef.current?.hideTooltip();
    window.getSelection()?.removeAllRanges();
    const refMgr = rendererRef.current?.referenceManager;
    const navigate = () => navigateToDefaultLocus(refMgr);
    const sync = refMgr?.lastSyncPromise;
    if (sync) {
      void sync.then(navigate).catch(navigate);
    } else {
      void navigate();
    }
  };

  // ── Custom reference import (local files) ──────────────────────────────────
  // Adds a runtime-assembled reference, then reuses the dropdown switch path.
  const addCustomReference = (config: IReferenceConfig) => {
    const refMgr = rendererRef.current?.referenceManager;
    if (!refMgr) return;
    const idx = refMgr.add(config);
    const switched = refMgr.switchTo(idx);
    if (switched) onReferenceSwitch(switched);
  };

  // ── Scenario button visibility ─────────────────────────────────────────────
  // Scenario is GRCh38-only. `activeRef` is reactive, so this tracks switches.
  const scenarioEnabled = HP.scenario && activeRef?.assembly?.name === "GRCh38";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          overflow: "hidden",
          alignItems: "stretch",
        }}
      >
        {LEFT_PANEL_ENABLED && (
          <LeftSidebar
            rendererRef={rendererRef}
            tooltipVisible={tooltipVisible}
            setTooltipVisible={setTooltipVisible}
            tooltipTrigger={tooltipTrigger}
            setTooltipTrigger={setTooltipTrigger}
            tooltipMode={tooltipMode}
            setTooltipMode={setTooltipMode}
            cursorEnabled={cursorEnabled}
            setCursorEnabled={setCursorEnabled}
            cursorMode={cursorMode}
            setCursorMode={setCursorMode}
            currentLocus={currentLocus}
            highlights={highlights}
            onAddHighlight={addHighlight}
            onDeleteHighlight={deleteHighlight}
            onUpdateHighlight={updateHighlight}
            histItems={histItems}
            setHistItems={setHistItems}
            favItems={favItems}
            setFavItems={setFavItems}
            setIsFav={setIsFav}
            onNavigateLocus={navigateToLocusEntry}
            onApplyConfig={applyConfig}
          />
        )}

        <MainBrowser
          headerEnabled={HEADER_PANEL_ENABLED}
          regionInputRef={regionInputRef}
          row1={{
            hp: {
              history: HP.history,
              favourites: HP.favourites,
              download: HP.download,
              channelLabel: HP.channel_label,
              legend: HP.legend,
              grid: HP.grid,
              tooltip: HP.tooltip,
              highlight: HP.highlight,
              cursor: HP.cursor,
            },
            rendererRef,
            activeRef,
            referenceSearchThreshold: REF_SEARCH_THRESHOLD,
            onReferenceSwitch,
            viewMode,
            regionInput,
            viewportWidth,
            regionInputRef,
            onRegionChange,
            onRegionFocus,
            onRegionBlur,
            onRegionKeyDown,
            suggestions: transSuggestions,
            isSearching: isTransSearching,
            showDropdown: showTransDropdown,
            dropdownRef: transDropdownRef,
            onSelectSuggestion,
            onSearch: () => commitRegion(regionInput),
            onReset: resetView,
            histItems,
            currentLocus,
            onNavigateLocus: navigateToLocusEntry,
            onClearHistory: () => {
              historyManager.clear();
              setHistItems([]);
              setFavItems(favouriteManager.getAll());
            },
            isFav,
            onToggleFav: toggleFav,
            onExport: (theme, format) =>
              rendererRef.current?.exportBrowser(format, theme),
            showLabels,
            onToggleLabels: () => setShowLabels((v) => !v),
            showLegend,
            legendStyle,
            onToggleLegend: () => setShowLegend((v) => !v),
            onSetLegendStyle: setLegendStyle,
            gridActive: gridDisplay !== "none",
            gridX,
            gridY,
            onToggleGridX: () => setGridX((v) => !v),
            onToggleGridY: () => setGridY((v) => !v),
            onGridShowAll: () => {
              setGridX(true);
              setGridY(true);
            },
            onGridHideAll: () => {
              setGridX(false);
              setGridY(false);
            },
            tooltipVisible,
            tooltipTrigger,
            tooltipMode,
            onSetTooltipVisible: setTooltipVisible,
            onSetTooltipTrigger: (t) => {
              setTooltipTrigger(t);
            },
            onSetTooltipMode: setTooltipMode,
            highlightVisible,
            highlightShowDistance,
            onSetHighlightVisible: setHighlightVisible,
            onToggleHighlightDistance: () =>
              setHighlightShowDistance((v) => !v),
            onClearAllHighlights: clearAllHighlights,
            cursorEnabled,
            cursorMode,
            onSetCursorEnabled: setCursorEnabled,
            onSetCursorMode: setCursorMode,
            wheelMode,
            onSetWheelMode: (mode) => {
              rendererRef.current?.setWheelMode(mode);
              setWheelMode(mode);
            },
            onToggleHelp: () => setShowHelp((v) => !v),
          }}
          row2={{
            scenarioEnabled,
            onScenario: () =>
              rendererRef.current?.headerPanelManager.dispatchAction(
                "scenario",
              ),
            viewMode,
            onSwitchMode: switchMode,
            onPan: panBy,
            onZoom: zoomBy,
          }}
        />
      </div>

      <HelpModal
        open={showHelp}
        wheelMode={wheelMode}
        onClose={() => setShowHelp(false)}
      />
    </div>
  );
}
