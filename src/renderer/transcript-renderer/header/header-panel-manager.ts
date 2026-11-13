import type { IHeaderPanelConfig } from "../config/config";
import { logger } from "../utils/logger";

/**
 * Identifiers for all header panel buttons.
 */
export type HeaderButtonId =
  | "history"
  | "favourites"
  | "download"
  | "channel_label"
  | "legend"
  | "grid"
  | "tooltip"
  | "highlight"
  | "cursor"
  | "wheel"
  | "scenario";

// ── Event types ─────────────────────────────────────────────────────────────

export type HeaderPanelEvent = "enable" | "disable" | "click" | "stateChange";

export interface HeaderPanelEventDetail {
  /** Which button triggered the event. */
  buttonId: HeaderButtonId;
  /** Whether the button is currently enabled. */
  enabled: boolean;
  /** Arbitrary value returned by the button's action (e.g. tooltip mode). */
  value?: any;
}

export type HeaderPanelListener = (
  event: HeaderPanelEvent,
  detail: HeaderPanelEventDetail,
) => void;

// ── HeaderPanelManager ──────────────────────────────────────────────────────
export class HeaderPanelManager {
  private _enabled: Record<HeaderButtonId, boolean>;

  private _listeners: HeaderPanelListener[] = [];

  constructor(config?: IHeaderPanelConfig) {
    // Default: all buttons enabled; override from config
    this._enabled = {
      history: config?.history?.enable !== false,
      favourites: config?.favourites?.enable !== false,
      download: config?.download?.enable !== false,
      channel_label: config?.channel_label?.enable !== false,
      legend: config?.legend?.enable !== false,
      grid: config?.grid?.enable !== false,
      tooltip: config?.tooltip?.enable !== false,
      highlight: config?.highlight?.enable !== false,
      cursor: config?.cursor?.enable !== false,
      wheel: true,
      scenario: true, // Scenario button enabled by default
    };
  }

  /**
   * Subscribe to header panel events.
   * Returns an unsubscribe function.
   */
  on(listener: HeaderPanelListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  private _emit(event: HeaderPanelEvent, detail: HeaderPanelEventDetail): void {
    for (const l of this._listeners) {
      try {
        l(event, detail);
      } catch (e) {
        logger.error("[HeaderPanelManager] listener error:", e);
      }
    }
  }

  // ── Enable / Disable ───────────────────────────────────────────────────

  /**
   * Check if a button is enabled.
   */
  isEnabled(id: HeaderButtonId): boolean {
    return this._enabled[id] ?? false;
  }

  /**
   * Enable or disable a button.
   */
  setEnabled(id: HeaderButtonId, enabled: boolean): void {
    const was = this._enabled[id];
    this._enabled[id] = enabled;
    if (was !== enabled) {
      this._emit(enabled ? "enable" : "disable", {
        buttonId: id,
        enabled,
      });
    }
  }

  /**
   * Enable multiple buttons at once.
   */
  enableAll(ids: HeaderButtonId[]): void {
    for (const id of ids) this.setEnabled(id, true);
  }

  /**
   * Disable multiple buttons at once.
   */
  disableAll(ids: HeaderButtonId[]): void {
    for (const id of ids) this.setEnabled(id, false);
  }

  /**
   * Get a snapshot of all button enabled states.
   */
  getEnabledMap(): Record<HeaderButtonId, boolean> {
    return { ...this._enabled };
  }

  /**
   * Apply a full config update (from IHeaderPanelConfig).
   */
  applyConfig(config: IHeaderPanelConfig): void {
    const keys: (keyof IHeaderPanelConfig)[] = [
      "history",
      "favourites",
      "download",
      "channel_label",
      "legend",
      "grid",
      "tooltip",
      "highlight",
      "cursor",
    ];
    for (const k of keys) {
      const val = config[k]?.enable;
      if (val !== undefined) {
        this.setEnabled(k as HeaderButtonId, val);
      }
    }
  }

  // ── Action dispatch ─────────────────────────────────────────────────────
  dispatchAction(id: HeaderButtonId, value?: any): void {
    this._emit("click", {
      buttonId: id,
      enabled: this._enabled[id] ?? false,
      value,
    });
  }

  dispatchStateChange(id: HeaderButtonId, value?: any): void {
    this._emit("stateChange", {
      buttonId: id,
      enabled: this._enabled[id] ?? false,
      value,
    });
  }
}
