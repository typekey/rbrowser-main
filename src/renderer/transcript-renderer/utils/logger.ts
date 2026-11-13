/**
 * Gated diagnostic logger.
 */
let enabled = process.env.NODE_ENV !== "production";

export const logger = {
  /** Toggle diagnostic output (no effect in published bundles — see above). */
  setEnabled(value: boolean): void {
    enabled = value;
  },

  get isEnabled(): boolean {
    return enabled;
  },

  warn(...args: unknown[]): void {
    if (enabled) console.warn(...args);
  },

  error(...args: unknown[]): void {
    if (enabled) console.error(...args);
  },
};
