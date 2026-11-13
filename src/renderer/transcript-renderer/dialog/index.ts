// ══════════════════════════════════════════════════════════════════════
//  Style constants
// ══════════════════════════════════════════════════════════════════════

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const BACKDROP_BG = "rgba(0,0,0,0.35)";
const BACKDROP_BLUR = "blur(6px)";
const DIALOG_BG = "#fff";
const DIALOG_RADIUS = "12px";
const DIALOG_SHADOW =
  "0 20px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.08)";
const DIALOG_MIN_W = "380px";
const DIALOG_MAX_W = "460px";
const PRIMARY_COLOR = "#007aff";
const DANGER_COLOR = "#e15759";
const WARNING_COLOR = "#f39c12";
const TEXT_COLOR = "#1d1d1f";
const SUBTITLE_COLOR = "#6e6e73";
const BORDER_COLOR = "#d2d2d7";
const INPUT_BG = "#f5f5f7";
const TRANSITION = "0.2s cubic-bezier(0.25,0.46,0.45,0.94)";

// ══════════════════════════════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════════════════════════════

/** Create a styled element with inline CSS. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Fade-in / scale-up animation on a dialog container. */
function animateIn(backdrop: HTMLElement, dialog: HTMLElement): void {
  backdrop.style.opacity = "0";
  dialog.style.transform = "scale(0.95) translateY(8px)";
  dialog.style.opacity = "0";
  requestAnimationFrame(() => {
    backdrop.style.transition = `opacity ${TRANSITION}`;
    backdrop.style.opacity = "1";
    dialog.style.transition = `transform ${TRANSITION}, opacity ${TRANSITION}`;
    dialog.style.transform = "scale(1) translateY(0)";
    dialog.style.opacity = "1";
  });
}

/** Fade-out / scale-down, then remove. */
function animateOut(backdrop: HTMLElement, dialog: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    backdrop.style.transition = `opacity ${TRANSITION}`;
    backdrop.style.opacity = "0";
    dialog.style.transition = `transform ${TRANSITION}, opacity ${TRANSITION}`;
    dialog.style.transform = "scale(0.95) translateY(8px)";
    dialog.style.opacity = "0";
    setTimeout(() => {
      backdrop.remove();
      resolve();
    }, 220);
  });
}

/** Build the standard backdrop + centred container. */
function createShell(): { backdrop: HTMLElement; card: HTMLElement } {
  const backdrop = el(
    "div",
    [
      "position:fixed",
      "inset:0",
      "z-index:200000",
      `background:${BACKDROP_BG}`,
      `backdrop-filter:${BACKDROP_BLUR}`,
      `-webkit-backdrop-filter:${BACKDROP_BLUR}`,
      "display:flex",
      "align-items:center",
      "justify-content:center",
      `font-family:${FONT}`,
    ].join(";"),
  );

  const card = el(
    "div",
    [
      `min-width:${DIALOG_MIN_W}`,
      `max-width:${DIALOG_MAX_W}`,
      "width:90%",
      `background:${DIALOG_BG}`,
      `border-radius:${DIALOG_RADIUS}`,
      `box-shadow:${DIALOG_SHADOW}`,
      "padding:28px 32px 24px",
      "box-sizing:border-box",
      "outline:none",
    ].join(";"),
  );

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
  animateIn(backdrop, card);
  return { backdrop, card };
}

/** Styled primary button. */
function primaryBtn(
  label: string,
  variant: "primary" | "danger" | "warning" = "primary",
): HTMLButtonElement {
  const bg =
    variant === "danger"
      ? DANGER_COLOR
      : variant === "warning"
        ? WARNING_COLOR
        : PRIMARY_COLOR;
  const btn = el(
    "button",
    [
      `background:${bg}`,
      "color:#fff",
      "border:none",
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:600",
      "cursor:pointer",
      `font-family:${FONT}`,
      `transition:background ${TRANSITION}`,
      "line-height:1.4",
    ].join(";"),
    label,
  );
  btn.addEventListener("mouseenter", () => {
    btn.style.filter = "brightness(1.08)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.filter = "";
  });
  return btn;
}

/** Styled secondary / cancel button. */
function secondaryBtn(label: string): HTMLButtonElement {
  const btn = el(
    "button",
    [
      "background:transparent",
      `color:${SUBTITLE_COLOR}`,
      `border:1px solid ${BORDER_COLOR}`,
      "border-radius:8px",
      "padding:8px 22px",
      "font-size:14px",
      "font-weight:500",
      "cursor:pointer",
      `font-family:${FONT}`,
      `transition:background ${TRANSITION}`,
      "line-height:1.4",
    ].join(";"),
    label,
  );
  btn.addEventListener("mouseenter", () => {
    btn.style.background = "rgba(0,0,0,0.04)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "transparent";
  });
  return btn;
}

// ══════════════════════════════════════════════════════════════════════
//  Colour palette popup
// ══════════════════════════════════════════════════════════════════════

/** Standard palette for the popup grid — 6 columns × 7 rows. */
const COLOR_PALETTE = [
  // Row 1: reds / pinks
  "#ff3b30",
  "#ff6259",
  "#ff2d55",
  "#e15759",
  "#c0392b",
  "#a93226",
  // Row 2: oranges / yellows
  "#ff9500",
  "#ff6348",
  "#f39c12",
  "#fdcb6e",
  "#f1c40f",
  "#ffeaa7",
  // Row 3: greens
  "#34c759",
  "#2ed573",
  "#27ae60",
  "#00b894",
  "#1abc9c",
  "#55efc4",
  // Row 4: blues / cyans
  "#007aff",
  "#5856d6",
  "#0984e3",
  "#74b9ff",
  "#00cec9",
  "#81ecec",
  // Row 5: purples
  "#af52de",
  "#6c5ce7",
  "#a29bfe",
  "#fd79a8",
  "#e84393",
  "#d63031",
  // Row 6: neutrals
  "#1d1d1f",
  "#2d3436",
  "#636e72",
  "#747d8c",
  "#b2bec3",
  "#dfe6e9",
  // Row 7: lights
  "#f5f5f7",
  "#ffffff",
  "#fafafa",
  "#ecf0f1",
  "#bdc3c7",
  "#95a5a6",
];

/**
 * Show a floating colour-palette popup anchored to a trigger element.
 * The popup dismisses on colour selection or clicking outside.
 */
function showColorPopup(
  trigger: HTMLElement,
  onSelect: (color: string) => void,
): void {
  // Prevent duplicate popups
  const existing = document.getElementById("__color_popup__");
  if (existing) existing.remove();

  const popup = el(
    "div",
    [
      "position:fixed",
      "z-index:300000",
      `background:${DIALOG_BG}`,
      `border:1px solid ${BORDER_COLOR}`,
      "border-radius:10px",
      "box-shadow:0 8px 30px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05)",
      "padding:10px",
      "display:grid",
      "grid-template-columns:repeat(6, 28px)",
      "gap:6px",
      "opacity:0",
      "transform:scale(0.92)",
      `transition:opacity ${TRANSITION}, transform ${TRANSITION}`,
    ].join(";"),
  );
  popup.id = "__color_popup__";

  for (const c of COLOR_PALETTE) {
    const dot = el(
      "div",
      [
        "width:28px",
        "height:28px",
        "border-radius:6px",
        `background:${c}`,
        `border:1.5px solid ${c === "#ffffff" || c === "#fafafa" || c === "#f5f5f7" || c === "#ecf0f1" ? BORDER_COLOR : "transparent"}`,
        "cursor:pointer",
        `transition:transform ${TRANSITION}, box-shadow ${TRANSITION}`,
      ].join(";"),
    );
    dot.addEventListener("mouseenter", () => {
      dot.style.transform = "scale(1.15)";
      dot.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
    });
    dot.addEventListener("mouseleave", () => {
      dot.style.transform = "";
      dot.style.boxShadow = "";
    });
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      onSelect(c);
      dismiss();
    });
    popup.appendChild(dot);
  }

  // Position relative to trigger
  const rect = trigger.getBoundingClientRect();
  document.body.appendChild(popup);
  const pw = popup.offsetWidth;
  const ph = popup.offsetHeight;

  // Default: below the trigger, left-aligned
  let top = rect.bottom + 6;
  let left = rect.left;
  // Keep within viewport
  if (top + ph > window.innerHeight - 10) top = rect.top - ph - 6;
  if (left + pw > window.innerWidth - 10) left = window.innerWidth - pw - 10;
  if (left < 10) left = 10;

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;

  // Animate in
  requestAnimationFrame(() => {
    popup.style.opacity = "1";
    popup.style.transform = "scale(1)";
  });

  // Dismiss on outside click
  const dismiss = () => {
    popup.style.opacity = "0";
    popup.style.transform = "scale(0.92)";
    setTimeout(() => popup.remove(), 200);
    document.removeEventListener("mousedown", onOutside);
    document.removeEventListener("keydown", onEsc);
  };
  const onOutside = (e: MouseEvent) => {
    if (!popup.contains(e.target as Node)) dismiss();
  };
  const onEsc = (e: KeyboardEvent) => {
    if (e.key === "Escape") dismiss();
  };
  // Delay attaching so the current click doesn't trigger immediate dismiss
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEsc);
  }, 0);
}

// ══════════════════════════════════════════════════════════════════════
//  Public API
// ══════════════════════════════════════════════════════════════════════

export class ModalDialog {
  // ── prompt ──────────────────────────────────────────────────────────

  /** Show a text-input dialog. Returns `null` if cancelled. */
  static prompt(
    title: string,
    defaultValue: string = "",
    options?: {
      placeholder?: string;
      subtitle?: string;
      /** When provided, shows a danger button with this label; clicking it resolves with `""`. */
      removeLabel?: string;
    },
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const { backdrop, card } = createShell();

      card.appendChild(
        el(
          "div",
          `font-size:17px;font-weight:700;color:${TEXT_COLOR};margin-bottom:4px;`,
          title,
        ),
      );

      if (options?.subtitle) {
        card.appendChild(
          el(
            "div",
            `font-size:13px;color:${SUBTITLE_COLOR};margin-bottom:16px;`,
            options.subtitle,
          ),
        );
      } else {
        card.appendChild(el("div", "margin-bottom:12px;"));
      }

      const input = el(
        "input",
        [
          "width:100%",
          "box-sizing:border-box",
          `background:${INPUT_BG}`,
          `border:1.5px solid ${BORDER_COLOR}`,
          "border-radius:8px",
          "padding:10px 14px",
          "font-size:14px",
          `font-family:${FONT}`,
          `color:${TEXT_COLOR}`,
          "outline:none",
          `transition:border-color ${TRANSITION}`,
          "margin-bottom:20px",
        ].join(";"),
      );
      input.type = "text";
      input.value = defaultValue;
      if (options?.placeholder) input.placeholder = options.placeholder;
      input.addEventListener("focus", () => {
        input.style.borderColor = PRIMARY_COLOR;
      });
      input.addEventListener("blur", () => {
        input.style.borderColor = BORDER_COLOR;
      });
      card.appendChild(input);

      const btnRow = el(
        "div",
        "display:flex;justify-content:flex-end;gap:10px;",
      );

      // Optional "Remove" danger button (left-aligned via auto margin)
      if (options?.removeLabel) {
        const removeBtn = primaryBtn(options.removeLabel, "danger");
        removeBtn.style.marginRight = "auto";
        btnRow.appendChild(removeBtn);
        removeBtn.addEventListener("click", () => done(""));
      }

      const cancelBtn = secondaryBtn("Cancel");
      const okBtn = primaryBtn("OK");
      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(okBtn);
      card.appendChild(btnRow);

      // Focus input
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });

      const done = async (value: string | null) => {
        await animateOut(backdrop, card);
        resolve(value);
      };

      cancelBtn.addEventListener("click", () => done(null));
      okBtn.addEventListener("click", () => {
        const v = input.value.trim();
        done(v || null);
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const v = input.value.trim();
          done(v || null);
        } else if (e.key === "Escape") {
          done(null);
        }
      });

      // Click backdrop → cancel
      backdrop.addEventListener("mousedown", (e) => {
        if (e.target === backdrop) done(null);
      });
    });
  }

  // ── alert ───────────────────────────────────────────────────────────

  /**
   * Show an informational dialog with a single dismiss button.
   * Resolves once the user acknowledges (button click, Enter, Esc, or
   * backdrop click). Use for notices that don't require a decision —
   * e.g. "this transcript has no CDS".
   */
  static alert(
    title: string,
    message?: string,
    options?: {
      confirmLabel?: string;
      danger?: boolean;
      warning?: boolean;
    },
  ): Promise<void> {
    return new Promise((resolve) => {
      const { backdrop, card } = createShell();
      const variant: "primary" | "danger" | "warning" = options?.danger
        ? "danger"
        : options?.warning
          ? "warning"
          : "primary";

      card.appendChild(
        el(
          "div",
          `font-size:17px;font-weight:700;color:${TEXT_COLOR};margin-bottom:6px;`,
          title,
        ),
      );

      if (message) {
        card.appendChild(
          el(
            "div",
            `font-size:14px;color:${SUBTITLE_COLOR};margin-bottom:22px;line-height:1.5;`,
            message,
          ),
        );
      } else {
        card.appendChild(el("div", "margin-bottom:18px;"));
      }

      // Single dismiss button (bottom-right)
      const btnRow = el(
        "div",
        "display:flex;justify-content:flex-end;gap:10px;",
      );
      const okBtn = primaryBtn(options?.confirmLabel ?? "OK", variant);
      btnRow.appendChild(okBtn);
      card.appendChild(btnRow);

      requestAnimationFrame(() => okBtn.focus());

      const done = async () => {
        await animateOut(backdrop, card);
        document.removeEventListener("keydown", onKey);
        resolve();
      };

      okBtn.addEventListener("click", () => void done());
      backdrop.addEventListener("mousedown", (e) => {
        if (e.target === backdrop) void done();
      });
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape" || e.key === "Enter") void done();
      };
      document.addEventListener("keydown", onKey);
    });
  }

  // ── confirm ─────────────────────────────────────────────────────────

  /** Show a confirmation dialog. Returns `true` if confirmed. */
  static confirm(
    title: string,
    message?: string,
    options?: {
      confirmLabel?: string;
      danger?: boolean;
      warning?: boolean;
      checkboxLabel?: undefined;
    },
  ): Promise<boolean>;
  static confirm(
    title: string,
    message: string | undefined,
    options: {
      confirmLabel?: string;
      danger?: boolean;
      warning?: boolean;
      checkboxLabel: string;
    },
  ): Promise<{ confirmed: boolean; checked: boolean }>;
  static confirm(
    title: string,
    message?: string,
    options?: {
      confirmLabel?: string;
      danger?: boolean;
      warning?: boolean;
      checkboxLabel?: string;
    },
  ): Promise<boolean | { confirmed: boolean; checked: boolean }> {
    return new Promise((resolve) => {
      const { backdrop, card } = createShell();
      const hasCheckbox = !!options?.checkboxLabel;
      const variant: "primary" | "danger" | "warning" = options?.danger
        ? "danger"
        : options?.warning
          ? "warning"
          : "primary";

      // Title (top-left, no icon)
      card.appendChild(
        el(
          "div",
          `font-size:17px;font-weight:700;color:${TEXT_COLOR};margin-bottom:6px;`,
          title,
        ),
      );

      if (message) {
        card.appendChild(
          el(
            "div",
            `font-size:14px;color:${SUBTITLE_COLOR};margin-bottom:22px;line-height:1.5;`,
            message,
          ),
        );
      } else {
        card.appendChild(el("div", "margin-bottom:18px;"));
      }

      let checkbox: HTMLInputElement | null = null;
      if (hasCheckbox) {
        const checkRow = el(
          "label",
          `display:flex;align-items:center;gap:6px;margin-bottom:16px;cursor:pointer;font-size:13px;color:${SUBTITLE_COLOR};user-select:none;`,
        );
        checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.style.cssText = "margin:0;cursor:pointer;";
        checkRow.appendChild(checkbox);
        checkRow.appendChild(document.createTextNode(options!.checkboxLabel!));
        card.appendChild(checkRow);
      }

      // Buttons (bottom-right)
      const btnRow = el(
        "div",
        "display:flex;justify-content:flex-end;gap:10px;",
      );
      const cancelBtn = secondaryBtn("Cancel");
      const confirmBtn = primaryBtn(
        options?.confirmLabel ?? "Confirm",
        variant,
      );
      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(confirmBtn);
      card.appendChild(btnRow);

      const done = async (result: boolean) => {
        await animateOut(backdrop, card);
        if (hasCheckbox) {
          resolve({ confirmed: result, checked: checkbox?.checked ?? false });
        } else {
          resolve(result);
        }
      };

      cancelBtn.addEventListener("click", () => done(false));
      confirmBtn.addEventListener("click", () => done(true));
      backdrop.addEventListener("mousedown", (e) => {
        if (e.target === backdrop) done(false);
      });
      // Esc → cancel
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          document.removeEventListener("keydown", onKey);
          done(false);
        }
      };
      document.addEventListener("keydown", onKey);
    });
  }

  // ── color picker ────────────────────────────────────────────────────

  /** Show a colour-picker dialog. Returns the chosen hex colour, or `null`. */
  static colorPicker(
    title: string,
    currentColor: string = "#000000",
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const { backdrop, card } = createShell();

      card.appendChild(
        el(
          "div",
          `font-size:17px;font-weight:700;color:${TEXT_COLOR};margin-bottom:16px;`,
          title,
        ),
      );

      const colorArea = el(
        "div",
        "display:flex;align-items:center;gap:16px;margin-bottom:20px;",
      );

      // Large preview swatch — click to open colour popup
      const swatch = el(
        "div",
        [
          "width:64px",
          "height:64px",
          "border-radius:12px",
          `background:${currentColor}`,
          `border:2px solid ${BORDER_COLOR}`,
          "flex-shrink:0",
          "cursor:pointer",
          `transition:border-color ${TRANSITION}`,
        ].join(";"),
      );

      const rightCol = el("div", "flex:1;");

      const hexLabel = el(
        "div",
        `font-size:12px;color:${SUBTITLE_COLOR};margin-bottom:4px;`,
        "Hex color",
      );
      rightCol.appendChild(hexLabel);

      const hexInput = el(
        "input",
        [
          "width:100%",
          "box-sizing:border-box",
          `background:${INPUT_BG}`,
          `border:1.5px solid ${BORDER_COLOR}`,
          "border-radius:8px",
          "padding:8px 12px",
          "font-size:14px",
          `font-family:monospace`,
          `color:${TEXT_COLOR}`,
          "outline:none",
          `transition:border-color ${TRANSITION}`,
        ].join(";"),
      );
      hexInput.type = "text";
      hexInput.value = currentColor;
      hexInput.addEventListener("focus", () => {
        hexInput.style.borderColor = PRIMARY_COLOR;
      });
      hexInput.addEventListener("blur", () => {
        hexInput.style.borderColor = BORDER_COLOR;
      });
      rightCol.appendChild(hexInput);

      const hintLabel = el(
        "div",
        `font-size:11px;color:${SUBTITLE_COLOR};margin-top:6px;`,
        "Click the colour swatch to pick from palette",
      );
      rightCol.appendChild(hintLabel);

      colorArea.appendChild(swatch);
      colorArea.appendChild(rightCol);
      card.appendChild(colorArea);

      // Sync hex input → swatch
      hexInput.addEventListener("input", () => {
        const v = hexInput.value;
        if (/^#[0-9a-fA-F]{6}$/.test(v)) {
          swatch.style.background = v;
        }
      });

      // Click swatch → open colour popup
      swatch.addEventListener("click", () => {
        showColorPopup(swatch, (c) => {
          hexInput.value = c;
          swatch.style.background = c;
        });
      });

      const btnRow = el(
        "div",
        "display:flex;justify-content:flex-end;gap:10px;",
      );
      const cancelBtn = secondaryBtn("Cancel");
      const okBtn = primaryBtn("Apply");
      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(okBtn);
      card.appendChild(btnRow);

      const done = async (value: string | null) => {
        await animateOut(backdrop, card);
        resolve(value);
      };

      cancelBtn.addEventListener("click", () => done(null));
      okBtn.addEventListener("click", () => {
        const v = hexInput.value.trim();
        done(/^#[0-9a-fA-F]{3,8}$/.test(v) ? v : null);
      });
      backdrop.addEventListener("mousedown", (e) => {
        if (e.target === backdrop) done(null);
      });
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          document.removeEventListener("keydown", onKey);
          done(null);
        } else if (e.key === "Enter") {
          document.removeEventListener("keydown", onKey);
          const v = hexInput.value.trim();
          done(/^#[0-9a-fA-F]{3,8}$/.test(v) ? v : null);
        }
      };
      document.addEventListener("keydown", onKey);
    });
  }

  // ── splitter ────────────────────────────────────────────────────────

  /**
   * Show a "Splitter" dialog for configuring how data is split into
   * sub-channels.  Returns the configured values, or `null` if cancelled.
   *
   * Keys, Expand Fields and Order use MUI-style chip inputs.
   * Expand chips are restricted to values present in Keys.
   */
  static splitter(
    title: string,
    current: {
      sep?: string;
      keys?: string[];
      expand?: string | string[];
      order?: string[];
    },
  ): Promise<{
    sep: string;
    keys: string[];
    expand: string[];
    order: string[];
  } | null> {
    return new Promise((resolve) => {
      const { backdrop, card } = createShell();
      card.style.maxWidth = "520px";

      card.appendChild(
        el(
          "div",
          `font-size:17px;font-weight:700;color:${TEXT_COLOR};margin-bottom:4px;`,
          title,
        ),
      );

      card.appendChild(
        el(
          "div",
          `font-size:13px;color:${SUBTITLE_COLOR};margin-bottom:18px;`,
          "Configure how data fields are parsed and split into sub-channels.",
        ),
      );

      // ── Chip input builder ──────────────────────────────────────────
      /**
       * Creates a chip-input field: a flex-wrap container showing chips
       * for each value plus a text input for adding new ones.
       *
       * @param allowedSource — if provided, a function returning the
       *        currently allowed values. Only values in this set can be
       *        added.  Used for "expand" (must be ⊆ keys).
       */
      const chipInputId = { n: 0 };
      const makeChipField = (
        label: string,
        initial: string[],
        placeholder: string,
        hint?: string,
        allowedSource?: () => string[],
      ): {
        container: HTMLElement;
        getValues: () => string[];
        inputEl: HTMLInputElement;
      } => {
        const id = `chip-field-${chipInputId.n++}`;
        const lbl = el(
          "div",
          `font-size:12px;font-weight:600;color:${SUBTITLE_COLOR};margin-bottom:4px;`,
          label,
        );
        card.appendChild(lbl);
        if (hint) {
          card.appendChild(
            el("div", `font-size:11px;color:#999;margin-bottom:4px;`, hint),
          );
        }

        // Container that looks like an input (rounded border, wrapping chips)
        const container = el(
          "div",
          [
            "display:flex",
            "flex-wrap:wrap",
            "align-items:center",
            "gap:5px",
            "padding:6px 10px",
            `background:${INPUT_BG}`,
            `border:1.5px solid ${BORDER_COLOR}`,
            "border-radius:8px",
            "min-height:36px",
            "box-sizing:border-box",
            `transition:border-color ${TRANSITION}`,
            "margin-bottom:14px",
            "cursor:text",
            "position:relative",
          ].join(";"),
        );
        container.id = id;

        const chips: string[] = [];

        const renderChips = () => {
          // Remove all children except the input
          while (container.firstChild && container.firstChild !== inputEl) {
            container.removeChild(container.firstChild);
          }
          for (const v of chips) {
            const chip = el(
              "span",
              [
                "display:inline-flex",
                "align-items:center",
                "gap:4px",
                `background:${PRIMARY_COLOR}1a`,
                `color:${PRIMARY_COLOR}`,
                "border-radius:16px",
                "padding:2px 6px 2px 10px",
                "font-size:12px",
                "font-weight:500",
                "white-space:nowrap",
                "line-height:1.6",
                `font-family:${FONT}`,
                "user-select:none",
              ].join(";"),
            );
            const labelSpan = el("span", "", v);
            const removeBtn = el(
              "span",
              [
                "cursor:pointer",
                "display:inline-flex",
                "align-items:center",
                "justify-content:center",
                "width:16px",
                "height:16px",
                "border-radius:50%",
                "font-size:13px",
                "line-height:1",
                `color:${PRIMARY_COLOR}`,
                `transition:background ${TRANSITION}`,
              ].join(";"),
              "×",
            );
            removeBtn.addEventListener("mouseenter", () => {
              removeBtn.style.background = `${PRIMARY_COLOR}22`;
            });
            removeBtn.addEventListener("mouseleave", () => {
              removeBtn.style.background = "none";
            });
            removeBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              const idx = chips.indexOf(v);
              if (idx >= 0) chips.splice(idx, 1);
              renderChips();
              // Notify expand-dropdown update
              container.dispatchEvent(new Event("chips-changed"));
            });
            chip.appendChild(labelSpan);
            chip.appendChild(removeBtn);
            container.insertBefore(chip, inputEl);
          }
        };

        const inputEl = el(
          "input",
          [
            "border:none",
            "outline:none",
            "background:transparent",
            "flex:1",
            "min-width:80px",
            "font-size:13px",
            `font-family:${FONT}`,
            `color:${TEXT_COLOR}`,
            "padding:2px 0",
          ].join(";"),
        );
        inputEl.type = "text";
        inputEl.placeholder = placeholder;

        // Autocomplete dropdown (for expand field — restricted to keys)
        let dropdown: HTMLElement | null = null;
        const hideDropdown = () => {
          if (dropdown) {
            dropdown.remove();
            dropdown = null;
          }
        };

        const showDropdown = (suggestions: string[]) => {
          hideDropdown();
          if (suggestions.length === 0) return;
          dropdown = el(
            "div",
            [
              "position:absolute",
              "left:0",
              "top:100%",
              "width:100%",
              "max-height:160px",
              "overflow-y:auto",
              "background:#fff",
              "border-radius:6px",
              "box-shadow:0 4px 16px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)",
              "z-index:200010",
              "padding:4px 0",
            ].join(";"),
          );
          for (const s of suggestions) {
            const opt = el(
              "div",
              [
                "padding:6px 12px",
                "cursor:pointer",
                "font-size:13px",
                `color:${TEXT_COLOR}`,
                `font-family:${FONT}`,
                `transition:background ${TRANSITION}`,
              ].join(";"),
              s,
            );
            opt.addEventListener("mouseenter", () => {
              opt.style.background = "rgba(0,0,0,0.04)";
            });
            opt.addEventListener("mouseleave", () => {
              opt.style.background = "none";
            });
            opt.addEventListener("mousedown", (e) => {
              e.preventDefault(); // prevent blur
              if (!chips.includes(s)) {
                chips.push(s);
                renderChips();
                container.dispatchEvent(new Event("chips-changed"));
              }
              inputEl.value = "";
              hideDropdown();
            });
            dropdown.appendChild(opt);
          }
          container.appendChild(dropdown);
        };

        const addValue = (raw: string) => {
          const v = raw.trim();
          if (!v) return;
          if (allowedSource) {
            const allowed = allowedSource();
            if (!allowed.includes(v)) return; // reject if not in keys
          }
          if (!chips.includes(v)) {
            chips.push(v);
            renderChips();
            container.dispatchEvent(new Event("chips-changed"));
          }
          inputEl.value = "";
          hideDropdown();
        };

        inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addValue(inputEl.value);
          } else if (
            e.key === "Backspace" &&
            inputEl.value === "" &&
            chips.length > 0
          ) {
            chips.pop();
            renderChips();
            container.dispatchEvent(new Event("chips-changed"));
          }
        });

        // For allowed-source fields: show dropdown on input
        if (allowedSource) {
          inputEl.addEventListener("input", () => {
            const q = inputEl.value.toLowerCase().trim();
            const allowed = allowedSource();
            const filtered = allowed.filter(
              (a) => !chips.includes(a) && (!q || a.toLowerCase().includes(q)),
            );
            showDropdown(filtered);
          });
          inputEl.addEventListener("focus", () => {
            container.style.borderColor = PRIMARY_COLOR;
            const allowed = allowedSource();
            const filtered = allowed.filter((a) => !chips.includes(a));
            if (filtered.length > 0) showDropdown(filtered);
          });
          inputEl.addEventListener("blur", () => {
            container.style.borderColor = BORDER_COLOR;
            // Delay hide so mousedown on dropdown fires first
            setTimeout(hideDropdown, 150);
          });
        } else {
          inputEl.addEventListener("focus", () => {
            container.style.borderColor = PRIMARY_COLOR;
          });
          inputEl.addEventListener("blur", () => {
            container.style.borderColor = BORDER_COLOR;
            // Auto-add leftover text
            if (inputEl.value.trim()) addValue(inputEl.value);
          });
        }

        container.addEventListener("click", () => inputEl.focus());

        container.appendChild(inputEl);
        card.appendChild(container);

        for (const v of initial) {
          if (!chips.includes(v)) chips.push(v);
        }
        renderChips();

        return {
          container,
          getValues: () => [...chips],
          inputEl,
        };
      };

      // ── Separator (plain text input) ────────────────────────────────
      const sepLabel = el(
        "div",
        `font-size:12px;font-weight:600;color:${SUBTITLE_COLOR};margin-bottom:4px;`,
        "Separator",
      );
      card.appendChild(sepLabel);
      card.appendChild(
        el(
          "div",
          `font-size:11px;color:#999;margin-bottom:4px;`,
          "Delimiter between fields in the data's rest column.",
        ),
      );
      const sepInput = el(
        "input",
        [
          "width:100%",
          "box-sizing:border-box",
          `background:${INPUT_BG}`,
          `border:1.5px solid ${BORDER_COLOR}`,
          "border-radius:8px",
          "padding:8px 12px",
          "font-size:13px",
          `font-family:${FONT}`,
          `color:${TEXT_COLOR}`,
          "outline:none",
          `transition:border-color ${TRANSITION}`,
          "margin-bottom:14px",
        ].join(";"),
      );
      sepInput.type = "text";
      sepInput.value = current.sep ?? "";
      sepInput.placeholder = "e.g. \\t or , or ;";
      sepInput.addEventListener("focus", () => {
        sepInput.style.borderColor = PRIMARY_COLOR;
      });
      sepInput.addEventListener("blur", () => {
        sepInput.style.borderColor = BORDER_COLOR;
      });
      card.appendChild(sepInput);

      // ── Keys (chip input, free-form) ────────────────────────────────
      const keysField = makeChipField(
        "Column Names (keys)",
        current.keys ?? [],
        "Type and press Enter…",
        "Press Enter or comma to add a field name.",
      );

      // ── Expand (chip input, restricted to keys) ─────────────────────
      const expandInit = Array.isArray(current.expand)
        ? current.expand
        : current.expand
          ? [current.expand]
          : [];
      const expandField = makeChipField(
        "Expand Field(s)",
        expandInit,
        "Select from keys…",
        "Which key(s) to split sub-channels on. Must be a key name.",
        () => keysField.getValues(),
      );

      // ── Order (chip input, restricted to keys) ──────────────────────
      const orderField = makeChipField(
        "Tooltip Display Order",
        current.order ?? [],
        "Select from keys…",
        "Display order of fields in tooltip. Must be key names.",
        () => keysField.getValues(),
      );

      // When keys change, remove invalid chips from expand & order
      keysField.container.addEventListener("chips-changed", () => {
        const validKeys = keysField.getValues();
        const expandVals = expandField.getValues();
        const orderVals = orderField.getValues();
        // Remove expand chips not in keys
        for (const v of expandVals) {
          if (!validKeys.includes(v)) {
            // Trigger re-render by rebuilding
            const idx = expandVals.indexOf(v);
            if (idx >= 0) expandVals.splice(idx, 1);
          }
        }
        for (const v of orderVals) {
          if (!validKeys.includes(v)) {
            const idx = orderVals.indexOf(v);
            if (idx >= 0) orderVals.splice(idx, 1);
          }
        }
      });

      const btnRow = el(
        "div",
        "display:flex;justify-content:flex-end;gap:10px;margin-top:6px;",
      );
      const cancelBtn = secondaryBtn("Cancel");
      const okBtn = primaryBtn("Apply");
      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(okBtn);
      card.appendChild(btnRow);

      // Focus first input
      requestAnimationFrame(() => sepInput.focus());

      const done = async (
        result: {
          sep: string;
          keys: string[];
          expand: string[];
          order: string[];
        } | null,
      ) => {
        await animateOut(backdrop, card);
        resolve(result);
      };

      cancelBtn.addEventListener("click", () => done(null));
      okBtn.addEventListener("click", () => {
        done({
          sep: sepInput.value.trim(),
          keys: keysField.getValues(),
          expand: expandField.getValues(),
          order: orderField.getValues(),
        });
      });
      backdrop.addEventListener("mousedown", (e) => {
        if (e.target === backdrop) done(null);
      });
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          document.removeEventListener("keydown", onKey);
          done(null);
        }
      };
      document.addEventListener("keydown", onKey);
    });
  }

  // ── filter (multi-select) ──────────────────────────────────────────

  /**
   * Show a searchable multi-select "Filter" dialog.
   * Returns the selected values, or `null` if cancelled.
   *
   * @param options.colorMap — optional map from value → hex color for
   *        sample-label color swatches next to each item.
   */
  static filter(
    title: string,
    options: {
      values: string[];
      selected?: string[];
      subtitle?: string;
      /** Map from composite value → hex colour (matches sub-channel sample labels). */
      colorMap?: Map<string, string>;
      /** Map from composite value → display label (for multi-field composite keys). */
      displayMap?: Map<string, string>;
      /**
       * Per-expand-field dropdown definitions.
       * Each entry creates a multi-select searchable dropdown below the
       * search input, allowing the user to narrow the main checkbox list
       * by individual expand-field values.
       */
      fieldDropdowns?: Array<{
        field: string;
        values: string[];
        /** Colour for each value badge / swatch. */
        colorMap?: Map<string, string>;
      }>;
      /**
       * Composite key separator used to split composite values into per-field
       * parts. Defaults to `"\x00"`.
       */
      compositeSep?: string;
    },
  ): Promise<string[] | null> {
    return new Promise((resolve) => {
      const { backdrop, card } = createShell();
      card.style.maxWidth = "540px";

      const COMP_SEP = options.compositeSep ?? "\x00";

      // ── Data declarations (used by closures below) ────────────────
      const allValues = options.values;
      const selectedSet = new Set(options.selected ?? allValues);
      const valColorMap = options.colorMap;
      const valDisplayMap = options.displayMap;
      const dropdowns = options.fieldDropdowns ?? [];
      const numFields = dropdowns.length;

      /** Per-dropdown checkbox state storage. */
      const ddCheckboxes: Array<
        Array<{ value: string; cb: HTMLInputElement; row: HTMLElement }>
      > = dropdowns.map(() => []);

      /** Main composite checkbox list. */
      const checkboxes: {
        value: string;
        cb: HTMLInputElement;
        row: HTMLElement;
      }[] = [];

      /** Current selected values per dropdown index. */
      const dropdownSelections: Set<string>[] = dropdowns.map(
        () => new Set<string>(),
      );

      // ── Shared helper functions ───────────────────────────────────

      /** Count label (created now, appended later). */
      const countLabel = el(
        "div",
        `font-size:12px;color:${SUBTITLE_COLOR};margin-bottom:14px;`,
      );
      const updateCount = () => {
        const checked = checkboxes.filter((c) => c.cb.checked).length;
        countLabel.textContent = `${checked} of ${allValues.length} selected`;
      };

      /**
       * Determine whether a composite value passes ALL dropdown filters.
       * A dropdown with no selections means "all" (no filtering).
       */
      const passesDropdownFilters = (compositeValue: string): boolean => {
        if (numFields === 0) return true;
        const parts =
          numFields === 1 ? [compositeValue] : compositeValue.split(COMP_SEP);
        for (let i = 0; i < numFields; i++) {
          const sel = dropdownSelections[i];
          if (sel.size > 0 && !sel.has(parts[i] ?? "")) return false;
        }
        return true;
      };

      /** Apply both dropdown and search text filters to the main list. */
      const applyAllFilters = () => {
        const query = searchInput.value.toLowerCase().trim();
        for (const item of checkboxes) {
          const display = valDisplayMap?.get(item.value) ?? item.value;
          const matchSearch = !query || display.toLowerCase().includes(query);
          const matchDropdown = passesDropdownFilters(item.value);
          item.row.style.display =
            matchSearch && matchDropdown ? "flex" : "none";
        }
        updateCount();
      };

      // ── Title & Subtitle ──────────────────────────────────────────
      card.appendChild(
        el(
          "div",
          `font-size:17px;font-weight:700;color:${TEXT_COLOR};margin-bottom:4px;`,
          title,
        ),
      );
      card.appendChild(
        el(
          "div",
          `font-size:13px;color:${SUBTITLE_COLOR};margin-bottom:14px;`,
          options.subtitle ?? "Select which values to display.",
        ),
      );

      // ── Search input ──────────────────────────────────────────────
      const searchInput = el(
        "input",
        [
          "width:100%",
          "box-sizing:border-box",
          `background:${INPUT_BG}`,
          `border:1.5px solid ${BORDER_COLOR}`,
          "border-radius:8px",
          "padding:8px 12px 8px 32px",
          "font-size:13px",
          `font-family:${FONT}`,
          `color:${TEXT_COLOR}`,
          "outline:none",
          `transition:border-color ${TRANSITION}`,
          "margin-bottom:10px",
        ].join(";"),
      );
      searchInput.type = "text";
      searchInput.placeholder = "Search…";
      searchInput.addEventListener("focus", () => {
        searchInput.style.borderColor = PRIMARY_COLOR;
      });
      searchInput.addEventListener("blur", () => {
        searchInput.style.borderColor = BORDER_COLOR;
      });

      const searchWrap = el("div", "position:relative;");
      const searchIconSvg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      searchIconSvg.setAttribute("viewBox", "0 0 24 24");
      searchIconSvg.setAttribute("width", "16");
      searchIconSvg.setAttribute("height", "16");
      searchIconSvg.style.cssText = [
        "position:absolute",
        "left:10px",
        "top:50%",
        "transform:translateY(-50%)",
        "pointer-events:none",
        `color:${SUBTITLE_COLOR}`,
        "margin-top:-5px",
      ].join(";");
      const searchPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      searchPath.setAttribute(
        "d",
        "M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
      );
      searchPath.setAttribute("fill", "currentColor");
      searchIconSvg.appendChild(searchPath);
      searchWrap.appendChild(searchIconSvg);
      searchWrap.appendChild(searchInput);
      card.appendChild(searchWrap);

      // ── Per-field dropdown filters ────────────────────────────────
      for (let di = 0; di < numFields; di++) {
        const dd = dropdowns[di];
        const ddSel = dropdownSelections[di];
        const ddColorMap = dd.colorMap;

        const wrapper = el(
          "div",
          [
            `border:1px solid ${BORDER_COLOR}`,
            "border-radius:8px",
            `background:${INPUT_BG}`,
            "margin-bottom:8px",
            "overflow:hidden",
          ].join(";"),
        );

        // Header row (always visible)
        const header = el(
          "div",
          [
            "display:flex",
            "align-items:center",
            "justify-content:space-between",
            "padding:6px 10px",
            "cursor:pointer",
            "user-select:none",
            `transition:background ${TRANSITION}`,
          ].join(";"),
        );
        header.addEventListener("mouseenter", () => {
          header.style.background = "rgba(0,0,0,0.04)";
        });
        header.addEventListener("mouseleave", () => {
          header.style.background = "none";
        });

        const headerLeft = el(
          "div",
          "display:flex;align-items:center;gap:6px;flex:1;min-width:0;",
        );
        const fieldLabel = el(
          "span",
          `font-size:12px;font-weight:600;color:${TEXT_COLOR};white-space:nowrap;`,
          dd.field,
        );
        const ddCountBadge = el(
          "span",
          `font-size:10px;color:${SUBTITLE_COLOR};white-space:nowrap;`,
        );
        const updateDdCount = () => {
          ddCountBadge.textContent =
            ddSel.size > 0
              ? `(${ddSel.size}/${dd.values.length})`
              : `(${dd.values.length})`;
        };
        updateDdCount();
        headerLeft.appendChild(fieldLabel);
        headerLeft.appendChild(ddCountBadge);

        const chevron = el(
          "span",
          `font-size:12px;color:${SUBTITLE_COLOR};transition:transform 0.2s;transform:rotate(0deg);`,
          "▼",
        );
        header.appendChild(headerLeft);
        header.appendChild(chevron);
        wrapper.appendChild(header);

        // Body (collapsible)
        const body = el(
          "div",
          "max-height:0;overflow:hidden;transition:max-height 0.25s ease;",
        );
        let isOpen = false;
        header.addEventListener("click", () => {
          isOpen = !isOpen;
          body.style.maxHeight = isOpen ? "220px" : "0";
          chevron.style.transform = isOpen ? "rotate(180deg)" : "rotate(0deg)";
        });

        // Badge area (drag-sortable selected values)
        const badgeArea = el(
          "div",
          [
            "display:flex",
            "flex-wrap:wrap",
            "gap:4px",
            "padding:4px 10px",
            "min-height:0",
          ].join(";"),
        );

        const rebuildBadges = () => {
          badgeArea.innerHTML = "";
          if (ddSel.size === 0) return;
          const arr = Array.from(ddSel);
          for (let bi = 0; bi < arr.length; bi++) {
            const bval = arr[bi];
            const color = ddColorMap?.get(bval) ?? PRIMARY_COLOR;
            const badge = el(
              "span",
              [
                "display:inline-flex",
                "align-items:center",
                "gap:3px",
                `background:${color}22`,
                `border:1px solid ${color}55`,
                "border-radius:4px",
                "padding:1px 6px",
                "font-size:11px",
                `color:${color}`,
                "cursor:grab",
                "user-select:none",
                "white-space:nowrap",
                "max-width:120px",
                "overflow:hidden",
                "text-overflow:ellipsis",
              ].join(";"),
            );
            badge.textContent = bval;
            badge.draggable = true;
            badge.dataset.idx = String(bi);

            const closeBtn = el(
              "span",
              [
                "cursor:pointer",
                "font-size:13px",
                "font-weight:700",
                "line-height:1",
                "margin-left:2px",
                `color:${color}`,
                "opacity:0.7",
              ].join(";"),
              "×",
            );
            closeBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              ddSel.delete(bval);
              const ddCb = ddCheckboxes[di]?.find((c) => c.value === bval);
              if (ddCb) ddCb.cb.checked = false;
              updateDdCount();
              rebuildBadges();
              applyAllFilters();
            });
            badge.appendChild(closeBtn);

            // Drag-sort events
            badge.addEventListener("dragstart", (e) => {
              badge.style.opacity = "0.5";
              e.dataTransfer!.effectAllowed = "move";
              e.dataTransfer!.setData("text/plain", String(bi));
            });
            badge.addEventListener("dragend", () => {
              badge.style.opacity = "1";
            });
            badge.addEventListener("dragover", (e) => {
              e.preventDefault();
              e.dataTransfer!.dropEffect = "move";
              badge.style.background = `${color}44`;
            });
            badge.addEventListener("dragleave", () => {
              badge.style.background = `${color}22`;
            });
            badge.addEventListener("drop", (e) => {
              e.preventDefault();
              badge.style.background = `${color}22`;
              const fromIdx = parseInt(
                e.dataTransfer!.getData("text/plain"),
                10,
              );
              const toIdx = bi;
              if (fromIdx === toIdx) return;
              const sorted = Array.from(ddSel);
              const [moved] = sorted.splice(fromIdx, 1);
              sorted.splice(toIdx, 0, moved);
              ddSel.clear();
              sorted.forEach((v) => ddSel.add(v));
              rebuildBadges();
            });

            badgeArea.appendChild(badge);
          }
        };

        body.appendChild(badgeArea);

        const ddSearchInput = el(
          "input",
          [
            "width:calc(100% - 20px)",
            "box-sizing:border-box",
            "background:#fff",
            `border:1px solid ${BORDER_COLOR}`,
            "border-radius:6px",
            "padding:5px 8px",
            "font-size:12px",
            `font-family:${FONT}`,
            `color:${TEXT_COLOR}`,
            "outline:none",
            "margin:0 10px 4px",
            `transition:border-color ${TRANSITION}`,
          ].join(";"),
        );
        ddSearchInput.type = "text";
        ddSearchInput.placeholder = `Search ${dd.field}…`;
        ddSearchInput.addEventListener("focus", () => {
          ddSearchInput.style.borderColor = PRIMARY_COLOR;
        });
        ddSearchInput.addEventListener("blur", () => {
          ddSearchInput.style.borderColor = BORDER_COLOR;
        });
        body.appendChild(ddSearchInput);

        // Select All / Deselect All for this dropdown
        const ddActionRow = el(
          "div",
          "display:flex;gap:8px;padding:2px 10px 4px;",
        );
        const ddSelAll = el(
          "button",
          [
            "background:none",
            "border:none",
            `color:${PRIMARY_COLOR}`,
            "font-size:11px",
            "font-weight:600",
            "cursor:pointer",
            `font-family:${FONT}`,
            "padding:0",
          ].join(";"),
          "Select All",
        );
        const ddDeselAll = el(
          "button",
          [
            "background:none",
            "border:none",
            `color:${PRIMARY_COLOR}`,
            "font-size:11px",
            "font-weight:600",
            "cursor:pointer",
            `font-family:${FONT}`,
            "padding:0",
          ].join(";"),
          "Deselect All",
        );
        ddActionRow.appendChild(ddSelAll);
        ddActionRow.appendChild(ddDeselAll);
        body.appendChild(ddActionRow);

        const ddList = el(
          "div",
          "max-height:130px;overflow-y:auto;padding:0 4px 4px;",
        );

        for (const val of dd.values) {
          const row = el(
            "div",
            [
              "display:flex",
              "align-items:center",
              "padding:3px 8px",
              "cursor:pointer",
              "border-radius:4px",
              `transition:background ${TRANSITION}`,
            ].join(";"),
          );
          row.addEventListener("mouseenter", () => {
            row.style.background = "rgba(0,0,0,0.04)";
          });
          row.addEventListener("mouseleave", () => {
            row.style.background = "none";
          });

          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = false;
          cb.style.cssText = [
            "width:14px",
            "height:14px",
            "margin:0 8px 0 0",
            "cursor:pointer",
            "flex-shrink:0",
            `accent-color:${PRIMARY_COLOR}`,
          ].join(";");
          row.appendChild(cb);

          if (ddColorMap) {
            const color = ddColorMap.get(val) ?? "#999";
            const swatch = el(
              "div",
              [
                "width:12px",
                "height:12px",
                "border-radius:2px",
                `background:${color}`,
                "flex-shrink:0",
                "margin-right:6px",
              ].join(";"),
            );
            row.appendChild(swatch);
          }

          const lbl = el(
            "span",
            `font-size:12px;color:${TEXT_COLOR};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`,
            val,
          );
          row.appendChild(lbl);

          row.addEventListener("click", (e) => {
            if (e.target !== cb) cb.checked = !cb.checked;
            if (cb.checked) {
              ddSel.add(val);
            } else {
              ddSel.delete(val);
            }
            updateDdCount();
            rebuildBadges();
            applyAllFilters();
          });

          ddList.appendChild(row);
          ddCheckboxes[di].push({ value: val, cb, row });
        }

        body.appendChild(ddList);

        // Dropdown search filtering
        ddSearchInput.addEventListener("input", () => {
          const q = ddSearchInput.value.toLowerCase().trim();
          for (const item of ddCheckboxes[di]) {
            const match = !q || item.value.toLowerCase().includes(q);
            item.row.style.display = match ? "flex" : "none";
          }
        });

        ddSelAll.addEventListener("click", () => {
          for (const item of ddCheckboxes[di]) {
            if (item.row.style.display !== "none") {
              item.cb.checked = true;
              ddSel.add(item.value);
            }
          }
          updateDdCount();
          rebuildBadges();
          applyAllFilters();
        });
        ddDeselAll.addEventListener("click", () => {
          for (const item of ddCheckboxes[di]) {
            if (item.row.style.display !== "none") {
              item.cb.checked = false;
              ddSel.delete(item.value);
            }
          }
          updateDdCount();
          rebuildBadges();
          applyAllFilters();
        });

        wrapper.appendChild(body);
        card.appendChild(wrapper);
      }

      // ── Select All / Deselect All buttons (main list) ─────────────
      const actionRow = el("div", "display:flex;gap:12px;margin-bottom:8px;");
      const selectAllLink = el(
        "button",
        [
          "background:none",
          "border:none",
          `color:${PRIMARY_COLOR}`,
          "font-size:12px",
          "font-weight:600",
          "cursor:pointer",
          `font-family:${FONT}`,
          "padding:0",
        ].join(";"),
        "Select All",
      );
      const deselectAllLink = el(
        "button",
        [
          "background:none",
          "border:none",
          `color:${PRIMARY_COLOR}`,
          "font-size:12px",
          "font-weight:600",
          "cursor:pointer",
          `font-family:${FONT}`,
          "padding:0",
        ].join(";"),
        "Deselect All",
      );
      actionRow.appendChild(selectAllLink);
      actionRow.appendChild(deselectAllLink);
      card.appendChild(actionRow);

      // ── Scrollable main checkbox list ─────────────────────────────
      const listContainer = el(
        "div",
        [
          "max-height:280px",
          "overflow-y:auto",
          `border:1px solid ${BORDER_COLOR}`,
          "border-radius:8px",
          `background:${INPUT_BG}`,
          "padding:4px 0",
          "margin-bottom:10px",
        ].join(";"),
      );

      for (const value of allValues) {
        const row = el(
          "div",
          [
            "display:flex",
            "align-items:center",
            "padding:5px 12px",
            "cursor:pointer",
            `transition:background ${TRANSITION}`,
          ].join(";"),
        );
        row.addEventListener("mouseenter", () => {
          row.style.background = "rgba(0,0,0,0.04)";
        });
        row.addEventListener("mouseleave", () => {
          row.style.background = "none";
        });

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = selectedSet.has(value);
        cb.style.cssText = [
          "width:16px",
          "height:16px",
          "margin:0 10px 0 0",
          "cursor:pointer",
          "flex-shrink:0",
          `accent-color:${PRIMARY_COLOR}`,
        ].join(";");
        row.appendChild(cb);

        if (valColorMap) {
          const color = valColorMap.get(value) ?? "#999";
          const swatch = el(
            "div",
            [
              "width:14px",
              "height:14px",
              "border-radius:3px",
              `background:${color}`,
              "flex-shrink:0",
              "margin-right:8px",
            ].join(";"),
          );
          row.appendChild(swatch);
        }

        const displayText = valDisplayMap?.get(value) ?? value;
        const label = el(
          "span",
          `font-size:13px;color:${TEXT_COLOR};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`,
          displayText,
        );
        row.appendChild(label);
        row.addEventListener("click", (e) => {
          if (e.target !== cb) cb.checked = !cb.checked;
          updateCount();
        });

        listContainer.appendChild(row);
        checkboxes.push({ value, cb, row });
      }

      card.appendChild(listContainer);

      updateCount();
      card.appendChild(countLabel);

      // Search filtering → delegates to applyAllFilters (includes dropdowns)
      searchInput.addEventListener("input", () => {
        applyAllFilters();
      });

      // Select All / Deselect All (only visible rows)
      selectAllLink.addEventListener("click", () => {
        for (const item of checkboxes) {
          if (item.row.style.display !== "none") item.cb.checked = true;
        }
        updateCount();
      });
      deselectAllLink.addEventListener("click", () => {
        for (const item of checkboxes) {
          if (item.row.style.display !== "none") item.cb.checked = false;
        }
        updateCount();
      });

      // ── Buttons ───────────────────────────────────────────────────
      const btnRow = el(
        "div",
        "display:flex;justify-content:flex-end;gap:10px;",
      );
      const cancelBtn = secondaryBtn("Cancel");
      const okBtn = primaryBtn("Apply");
      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(okBtn);
      card.appendChild(btnRow);

      const done = async (result: string[] | null) => {
        await animateOut(backdrop, card);
        resolve(result);
      };

      cancelBtn.addEventListener("click", () => done(null));
      okBtn.addEventListener("click", () => {
        done(checkboxes.filter((c) => c.cb.checked).map((c) => c.value));
      });
      backdrop.addEventListener("mousedown", (e) => {
        if (e.target === backdrop) done(null);
      });
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          document.removeEventListener("keydown", onKey);
          done(null);
        }
      };
      document.addEventListener("keydown", onKey);
    });
  }

  // ── foregroundColor (plot-type-aware) ──────────────────────────────

  /**
   * Foreground-colour dialog that adapts its UI to the current plot type.
   *
   * - **Score plots** (bar / bigwig / heatmap / line / point):
   *   Solid-colour picker **plus** predefined gradient / colormap presets.
   * - **BAM plots**: Per-strand colour pickers (forward, reverse, other).
   * - **Sequence plots**: Per-base colour pickers (A, T, C, G, N).
   * - **Variant plots**: Per-base + reference + text colours.
   * - **Transcript / RNA**: Basic solid-colour picker.
   *
   * Returns `null` if cancelled, otherwise a result object whose shape
   * depends on the plot type.
   */
  static foregroundColor(
    title: string,
    plotType: string,
    current: {
      color?: string;
      colormap?: string;
      range?: [number, number];
      reversed?: boolean;
      readsColor?: { plus?: string; minus?: string; other?: string };
      baseColors?: { [base: string]: string };
      refColor?: string;
      baseTextColor?: string;
      transcriptColors?: { [type: string]: string };
      coverageColor?: string;
      coverageColormap?: string;
      coverageRange?: [number, number];
      modificationColor?: string;
      modificationColormap?: string;
      modificationRange?: [number, number];
    },
    options?: {
      /** When true, auto-range / range controls are disabled because
       *  the channel is in a group and the range is shared. */
      grouped?: boolean;
      /** When provided, the dialog shows tabs for switching between stacked
       *  channels so the user can configure each one independently. */
      stackedChannels?: Array<{
        name: string;
        plotType: string;
        current: {
          color?: string;
          colormap?: string;
          range?: [number, number];
          reversed?: boolean;
        };
        alpha?: number;
      }>;
      /** Alpha value for the host channel (0.0–1.0, default 0.3). */
      hostAlpha?: number;
    },
  ): Promise<{
    mode: "solid" | "colormap" | "feature";
    color?: string;
    colormap?: string;
    range?: [number, number];
    reversed?: boolean;
    readsColor?: { plus?: string; minus?: string; other?: string };
    baseColors?: { [base: string]: string };
    refColor?: string;
    baseTextColor?: string;
    transcriptColors?: { [type: string]: string };
    coverageColor?: string;
    coverageColormap?: string;
    coverageRange?: [number, number];
    modificationColor?: string;
    modificationColormap?: string;
    modificationRange?: [number, number];
    /** Per-channel results for stacked rendering. */
    stackedResults?: Array<{
      name: string;
      mode: "solid" | "colormap";
      color?: string;
      colormap?: string;
      range?: [number, number];
      reversed?: boolean;
      alpha?: number;
    }>;
    /** Alpha for the host channel. */
    alpha?: number;
  } | null> {
    return new Promise((resolve) => {
      const { backdrop, card } = createShell();

      card.appendChild(
        el(
          "div",
          `font-size:17px;font-weight:700;color:${TEXT_COLOR};margin-bottom:16px;`,
          title,
        ),
      );

      // ── Helpers ───────────────────────────────────────────────────
      const makeColorRow = (
        label: string,
        initialColor: string,
      ): {
        row: HTMLElement;
        getColor: () => string;
        setColor: (c: string) => void;
      } => {
        const row = el(
          "div",
          "display:flex;align-items:center;gap:10px;margin-bottom:10px;",
        );
        const swatch = el(
          "div",
          [
            "width:28px",
            "height:28px",
            "border-radius:6px",
            `background:${initialColor}`,
            `border:1.5px solid ${BORDER_COLOR}`,
            "cursor:pointer",
            "flex-shrink:0",
            `transition:border-color ${TRANSITION}`,
          ].join(";"),
        );
        const input = el(
          "input",
          [
            "width:90px",
            "box-sizing:border-box",
            `background:${INPUT_BG}`,
            `border:1.5px solid ${BORDER_COLOR}`,
            "border-radius:6px",
            "padding:5px 8px",
            "font-size:13px",
            "font-family:monospace",
            `color:${TEXT_COLOR}`,
            "outline:none",
            `transition:border-color ${TRANSITION}`,
          ].join(";"),
        ) as HTMLInputElement;
        input.type = "text";
        input.value = initialColor;
        input.addEventListener("focus", () => {
          input.style.borderColor = PRIMARY_COLOR;
        });
        input.addEventListener("blur", () => {
          input.style.borderColor = BORDER_COLOR;
        });
        input.addEventListener("input", () => {
          const v = input.value.trim();
          if (/^#[0-9a-fA-F]{6}$/.test(v)) swatch.style.background = v;
        });

        // Click swatch → open colour popup
        swatch.addEventListener("click", () => {
          showColorPopup(swatch, (c) => {
            input.value = c;
            swatch.style.background = c;
          });
        });

        const lbl = el(
          "div",
          `font-size:13px;color:${TEXT_COLOR};min-width:80px;font-weight:500;`,
          label,
        );
        row.appendChild(lbl);
        row.appendChild(swatch);
        row.appendChild(input);

        return {
          row,
          getColor: () => {
            const v = input.value.trim();
            return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : initialColor;
          },
          setColor: (c: string) => {
            input.value = c;
            swatch.style.background = c;
          },
        };
      };

      const isScorePlot = [
        "bar",
        "bigwig",
        "heatmap",
        "line",
        "point",
        "score_rect",
        "score_curve",
      ].includes(plotType);
      const isBam = plotType === "bam";
      const isSequence = plotType === "sequence";
      const isVariant = plotType === "variant";

      // ── SCORE PLOTS: solid + colormap ─────────────────────────────
      if (isScorePlot) {
        const isHeatmap = plotType === "heatmap";
        const isScoreHeatmap =
          plotType === "score_rect" || plotType === "score_curve";
        // Heatmap / score_rect / score_curve → default to colormap mode
        let mode: "solid" | "colormap" =
          isHeatmap || isScoreHeatmap
            ? "colormap"
            : current.colormap
              ? "colormap"
              : "solid";

        const tabRow = el(
          "div",
          [
            "display:flex",
            "gap:0",
            "margin-bottom:18px",
            `border-bottom:1.5px solid ${BORDER_COLOR}`,
            isHeatmap ? "display:none" : "",
          ]
            .filter(Boolean)
            .join(";") + ";",
        );
        const tabSolid = el(
          "button",
          [
            "flex:1",
            "padding:8px 0",
            "border:none",
            "background:none",
            "font-size:14px",
            "font-weight:600",
            "cursor:pointer",
            `font-family:${FONT}`,
            `color:${mode === "solid" ? PRIMARY_COLOR : SUBTITLE_COLOR}`,
            `border-bottom:2px solid ${mode === "solid" ? PRIMARY_COLOR : "transparent"}`,
            `transition:all ${TRANSITION}`,
          ].join(";"),
          "Solid Color",
        );
        const tabMap = el(
          "button",
          [
            "flex:1",
            "padding:8px 0",
            "border:none",
            "background:none",
            "font-size:14px",
            "font-weight:600",
            "cursor:pointer",
            `font-family:${FONT}`,
            `color:${mode === "colormap" ? PRIMARY_COLOR : SUBTITLE_COLOR}`,
            `border-bottom:2px solid ${mode === "colormap" ? PRIMARY_COLOR : "transparent"}`,
            `transition:all ${TRANSITION}`,
          ].join(";"),
          "Gradient / Colormap",
        );
        tabRow.appendChild(tabSolid);
        tabRow.appendChild(tabMap);

        // ── Stacked channel tabs + alpha ────────────────────────────
        const hasStacked =
          options?.stackedChannels && options.stackedChannels.length > 0;

        // Per-channel state storage for stacked rendering
        interface _ChState {
          name: string;
          mode: "solid" | "colormap";
          color: string;
          colormap: string;
          rangeMin: string;
          rangeMax: string;
          autoRange: boolean;
          reversed: boolean;
          alpha: number;
        }
        const channelStates: _ChState[] = [];
        let activeChIdx = 0;

        if (hasStacked) {
          // Host channel state (index 0)
          channelStates.push({
            name:
              title.replace("Set track foreground color", "").trim() || "Host",
            mode,
            color: current.color || "#747d8c",
            colormap: current.colormap || "viridis",
            rangeMin: current.range ? String(current.range[0]) : "0",
            rangeMax: current.range ? String(current.range[1]) : "100",
            autoRange: !current.range,
            reversed: current.reversed === true,
            alpha: options!.hostAlpha ?? 0.8,
          });
          // Stacked channel states (index 1, 2, ...)
          for (const sc of options!.stackedChannels!) {
            channelStates.push({
              name: sc.name,
              mode: sc.current.colormap ? "colormap" : "solid",
              color: sc.current.color || "#747d8c",
              colormap: sc.current.colormap || "viridis",
              rangeMin: sc.current.range ? String(sc.current.range[0]) : "0",
              rangeMax: sc.current.range ? String(sc.current.range[1]) : "100",
              autoRange: !sc.current.range,
              reversed: sc.current.reversed === true,
              alpha: sc.alpha ?? 0.8,
            });
          }
        }

        // Channel tab bar (only visible when stacked)
        const chTabRow = el(
          "div",
          [
            "display:flex",
            "gap:4px",
            "margin-bottom:12px",
            "overflow-x:auto",
            "padding-bottom:4px",
            hasStacked ? "" : "display:none",
          ]
            .filter(Boolean)
            .join(";") + ";",
        );
        const chTabBtns: HTMLElement[] = [];
        if (hasStacked) {
          for (let i = 0; i < channelStates.length; i++) {
            const isActive = i === 0;
            const btn = el(
              "button",
              [
                "padding:5px 12px",
                "border-radius:6px",
                `border:1.5px solid ${isActive ? PRIMARY_COLOR : BORDER_COLOR}`,
                `background:${isActive ? "rgba(0,122,255,0.08)" : "transparent"}`,
                `color:${isActive ? PRIMARY_COLOR : TEXT_COLOR}`,
                "font-size:12px",
                "font-weight:500",
                "cursor:pointer",
                "white-space:nowrap",
                `font-family:${FONT}`,
                `transition:all ${TRANSITION}`,
              ].join(";"),
              channelStates[i].name,
            );
            btn.addEventListener("click", () => switchChannel(i));
            chTabBtns.push(btn);
            chTabRow.appendChild(btn);
          }
        }
        card.appendChild(chTabRow);

        // Alpha slider row (only visible when stacked)
        let currentAlpha = hasStacked ? channelStates[0].alpha : 0.3;
        const alphaRow = el(
          "div",
          [
            "display:flex",
            "align-items:center",
            "gap:10px",
            "margin-bottom:14px",
            hasStacked ? "" : "display:none",
          ]
            .filter(Boolean)
            .join(";") + ";",
        );
        const alphaLabel = el(
          "div",
          `font-size:12px;color:${SUBTITLE_COLOR};min-width:46px;font-weight:500;`,
          "Alpha",
        );
        const alphaSlider = document.createElement("input");
        alphaSlider.type = "range";
        alphaSlider.min = "0";
        alphaSlider.max = "100";
        alphaSlider.value = String(Math.round(currentAlpha * 100));
        alphaSlider.style.cssText = `flex:1;accent-color:${PRIMARY_COLOR};cursor:pointer;`;
        const alphaValLabel = el(
          "div",
          `font-size:12px;color:${TEXT_COLOR};min-width:36px;text-align:right;font-family:monospace;`,
          currentAlpha.toFixed(2),
        );
        alphaSlider.addEventListener("input", () => {
          currentAlpha = parseInt(alphaSlider.value, 10) / 100;
          alphaValLabel.textContent = currentAlpha.toFixed(2);
          if (hasStacked) channelStates[activeChIdx].alpha = currentAlpha;
        });
        alphaRow.appendChild(alphaLabel);
        alphaRow.appendChild(alphaSlider);
        alphaRow.appendChild(alphaValLabel);
        card.appendChild(alphaRow);

        card.appendChild(tabRow);

        // ── Solid panel ─────────────────────────────────────────────
        const solidPanel = el("div", mode === "solid" ? "" : "display:none;");
        // Reuse the compact color area
        const solidColor = makeColorRow("Color", current.color || "#747d8c");
        solidPanel.appendChild(solidColor.row);
        card.appendChild(solidPanel);

        // ── Colormap panel ──────────────────────────────────────────
        const cmPanel = el("div", mode === "colormap" ? "" : "display:none;");

        const COLORMAPS: { name: string; colors: string[] }[] = [
          {
            name: "viridis",
            colors: ["#440154", "#31688e", "#35b779", "#fde724"],
          },
          {
            name: "plasma",
            colors: ["#0d0887", "#7001a8", "#dd5e66", "#f0f921"],
          },
          {
            name: "magma",
            colors: ["#000004", "#65156e", "#f3685b", "#fcfdbf"],
          },
          {
            name: "coolwarm",
            colors: ["#3b4cc0", "#89c7ec", "#ffa688", "#b50026"],
          },
          {
            name: "Spectral",
            colors: ["#9e0142", "#fdae61", "#66c2a5", "#5e4fa2"],
          },
          {
            name: "flare",
            colors: ["#f27a5a", "#ffa475", "#ffd48e", "#fff8a0"],
          },
          {
            name: "rocket",
            colors: ["#03051a", "#86298d", "#f194b4", "#ffeea8"],
          },
          {
            name: "frost-coral",
            colors: ["#dfe4ea", "#ff4757"],
          },
          {
            name: "frost-indigo",
            colors: ["#dfe4ea", "#3742fa"],
          },
          {
            name: "silver-crimson",
            colors: ["#bdc3c7", "#c0392b"],
          },
          {
            name: "silver-teal",
            colors: ["#bdc3c7", "#16a085"],
          },
          {
            name: "silver-purple",
            colors: ["#bdc3c7", "#8e44ad"],
          },
        ];

        let selectedCM = current.colormap || "viridis";

        const cmLabel = el(
          "div",
          `font-size:12px;color:${SUBTITLE_COLOR};margin-bottom:8px;`,
          "Select colormap",
        );
        cmPanel.appendChild(cmLabel);

        const cmGrid = el(
          "div",
          "display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;",
        );

        const cmItems: { name: string; row: HTMLElement }[] = [];

        for (const cm of COLORMAPS) {
          const row = el(
            "div",
            [
              "display:flex",
              "align-items:center",
              "gap:10px",
              "padding:6px 10px",
              "border-radius:8px",
              `border:1.5px solid ${cm.name === selectedCM ? PRIMARY_COLOR : BORDER_COLOR}`,
              `background:${cm.name === selectedCM ? "rgba(0,122,255,0.06)" : "transparent"}`,
              "cursor:pointer",
              `transition:all ${TRANSITION}`,
            ].join(";"),
          );

          const gradBar = el(
            "div",
            [
              "flex:1",
              "height:20px",
              "border-radius:4px",
              `background:linear-gradient(to right, ${cm.colors.join(", ")})`,
            ].join(";"),
          );

          const nameEl = el(
            "div",
            `font-size:12px;color:${TEXT_COLOR};min-width:70px;font-weight:500;`,
            cm.name,
          );

          row.appendChild(nameEl);
          row.appendChild(gradBar);
          cmItems.push({ name: cm.name, row });

          row.addEventListener("click", () => {
            selectedCM = cm.name;
            for (const item of cmItems) {
              item.row.style.borderColor =
                item.name === selectedCM ? PRIMARY_COLOR : BORDER_COLOR;
              item.row.style.background =
                item.name === selectedCM
                  ? "rgba(0,122,255,0.06)"
                  : "transparent";
            }
          });

          cmGrid.appendChild(row);
        }
        cmPanel.appendChild(cmGrid);

        // ── Auto-range checkbox row ──────────────────────────────────
        const isGrouped = options?.grouped === true;
        let autoRange = !current.range; // auto if no explicit range
        const autoRow = el(
          "div",
          `display:flex;align-items:center;gap:8px;margin-bottom:8px;${isGrouped ? "opacity:0.35;pointer-events:none;" : ""}`,
        );
        const autoChk = document.createElement("input");
        autoChk.type = "checkbox";
        autoChk.checked = isGrouped ? true : autoRange;
        autoChk.disabled = isGrouped;
        autoChk.style.cssText =
          "width:15px;height:15px;cursor:pointer;accent-color:" +
          PRIMARY_COLOR +
          ";flex-shrink:0;";
        const autoLbl = el(
          "label",
          `font-size:12px;color:${TEXT_COLOR};cursor:pointer;user-select:none;`,
          isGrouped ? "Auto range (controlled by group)" : "Auto range",
        );
        autoLbl.addEventListener("click", () => {
          if (isGrouped) return;
          autoChk.checked = !autoChk.checked;
          autoChk.dispatchEvent(new Event("change"));
        });
        autoRow.appendChild(autoChk);
        autoRow.appendChild(autoLbl);
        cmPanel.appendChild(autoRow);
        // Force auto-range when grouped
        if (isGrouped) autoRange = true;

        // ── Range min / max inputs ───────────────────────────────────
        const rangeRow = el(
          "div",
          `display:flex;align-items:center;gap:10px;margin-bottom:8px;opacity:${autoRange ? "0.35" : "1"};transition:opacity 0.15s;${isGrouped ? "pointer-events:none;" : ""}`,
        );
        const rangeLabel = el(
          "div",
          `font-size:12px;color:${SUBTITLE_COLOR};min-width:46px;`,
          "Range",
        );
        const rangeMinInput = el(
          "input",
          [
            "width:70px",
            "box-sizing:border-box",
            `background:${INPUT_BG}`,
            `border:1.5px solid ${BORDER_COLOR}`,
            "border-radius:6px",
            "padding:5px 8px",
            "font-size:13px",
            "font-family:monospace",
            `color:${TEXT_COLOR}`,
            "outline:none",
          ].join(";"),
        ) as HTMLInputElement;
        rangeMinInput.type = "number";
        rangeMinInput.placeholder = "min";
        rangeMinInput.value = current.range ? String(current.range[0]) : "0";
        rangeMinInput.disabled = autoRange;

        const rangeDash = el(
          "div",
          `font-size:14px;color:${SUBTITLE_COLOR};`,
          "–",
        );

        const rangeMaxInput = el(
          "input",
          [
            "width:70px",
            "box-sizing:border-box",
            `background:${INPUT_BG}`,
            `border:1.5px solid ${BORDER_COLOR}`,
            "border-radius:6px",
            "padding:5px 8px",
            "font-size:13px",
            "font-family:monospace",
            `color:${TEXT_COLOR}`,
            "outline:none",
          ].join(";"),
        ) as HTMLInputElement;
        rangeMaxInput.type = "number";
        rangeMaxInput.placeholder = "max";
        rangeMaxInput.value = current.range ? String(current.range[1]) : "100";
        rangeMaxInput.disabled = autoRange;

        // Toggle range inputs when auto checkbox changes
        autoChk.addEventListener("change", () => {
          autoRange = autoChk.checked;
          rangeMinInput.disabled = autoRange;
          rangeMaxInput.disabled = autoRange;
          rangeRow.style.opacity = autoRange ? "0.35" : "1";
        });

        rangeRow.appendChild(rangeLabel);
        rangeRow.appendChild(rangeMinInput);
        rangeRow.appendChild(rangeDash);
        rangeRow.appendChild(rangeMaxInput);
        cmPanel.appendChild(rangeRow);

        // ── Reverse-colors checkbox row ──────────────────────────────
        let isReversed = current.reversed === true;
        const reverseRow = el(
          "div",
          "display:flex;align-items:center;gap:8px;margin-bottom:4px;",
        );
        const reverseChk = document.createElement("input");
        reverseChk.type = "checkbox";
        reverseChk.checked = isReversed;
        reverseChk.style.cssText =
          "width:15px;height:15px;cursor:pointer;accent-color:" +
          PRIMARY_COLOR +
          ";flex-shrink:0;";
        const reverseLbl = el(
          "label",
          `font-size:12px;color:${TEXT_COLOR};cursor:pointer;user-select:none;`,
          "Reverse colors",
        );
        reverseLbl.addEventListener("click", () => {
          reverseChk.checked = !reverseChk.checked;
          reverseChk.dispatchEvent(new Event("change"));
        });
        reverseChk.addEventListener("change", () => {
          isReversed = reverseChk.checked;
        });
        reverseRow.appendChild(reverseChk);
        reverseRow.appendChild(reverseLbl);
        cmPanel.appendChild(reverseRow);

        card.appendChild(cmPanel);

        // Tab switching
        const switchTab = (target: "solid" | "colormap") => {
          mode = target;
          solidPanel.style.display = mode === "solid" ? "" : "none";
          cmPanel.style.display = mode === "colormap" ? "" : "none";
          tabSolid.style.color =
            mode === "solid" ? PRIMARY_COLOR : SUBTITLE_COLOR;
          tabSolid.style.borderBottomColor =
            mode === "solid" ? PRIMARY_COLOR : "transparent";
          tabMap.style.color =
            mode === "colormap" ? PRIMARY_COLOR : SUBTITLE_COLOR;
          tabMap.style.borderBottomColor =
            mode === "colormap" ? PRIMARY_COLOR : "transparent";
        };
        tabSolid.addEventListener("click", () => switchTab("solid"));
        tabMap.addEventListener("click", () => switchTab("colormap"));

        // ── Stacked channel switching ────────────────────────────────
        /** Save the current UI values to channelStates[activeChIdx]. */
        const saveCurrentChannelState = () => {
          if (!hasStacked) return;
          const st = channelStates[activeChIdx];
          st.mode = mode;
          st.color = solidColor.getColor();
          st.colormap = selectedCM;
          st.autoRange = autoRange;
          st.rangeMin = rangeMinInput.value;
          st.rangeMax = rangeMaxInput.value;
          st.reversed = isReversed;
          st.alpha = currentAlpha;
        };

        /** Load channelStates[idx] into the UI. */
        const loadChannelState = (idx: number) => {
          if (!hasStacked) return;
          const st = channelStates[idx];
          // Mode
          mode = st.mode;
          switchTab(mode);
          // Solid colour
          solidColor.setColor(st.color);
          // Colormap
          selectedCM = st.colormap;
          for (const item of cmItems) {
            item.row.style.borderColor =
              item.name === selectedCM ? PRIMARY_COLOR : BORDER_COLOR;
            item.row.style.background =
              item.name === selectedCM ? "rgba(0,122,255,0.06)" : "transparent";
          }
          // Auto-range
          autoRange = st.autoRange;
          autoChk.checked = autoRange;
          rangeMinInput.disabled = autoRange;
          rangeMaxInput.disabled = autoRange;
          rangeRow.style.opacity = autoRange ? "0.35" : "1";
          // Range
          rangeMinInput.value = st.rangeMin;
          rangeMaxInput.value = st.rangeMax;
          // Reversed
          isReversed = st.reversed;
          reverseChk.checked = isReversed;
          // Alpha
          currentAlpha = st.alpha;
          alphaSlider.value = String(Math.round(currentAlpha * 100));
          alphaValLabel.textContent = currentAlpha.toFixed(2);
        };

        /** Switch active channel tab. */
        const switchChannel = (idx: number) => {
          if (idx === activeChIdx) return;
          saveCurrentChannelState();
          activeChIdx = idx;
          loadChannelState(idx);
          // Update channel tab buttons
          for (let i = 0; i < chTabBtns.length; i++) {
            const isActive = i === idx;
            chTabBtns[i].style.borderColor = isActive
              ? PRIMARY_COLOR
              : BORDER_COLOR;
            chTabBtns[i].style.background = isActive
              ? "rgba(0,122,255,0.08)"
              : "transparent";
            chTabBtns[i].style.color = isActive ? PRIMARY_COLOR : TEXT_COLOR;
          }
        };

        const btnRow = el(
          "div",
          "display:flex;justify-content:flex-end;gap:10px;margin-top:20px;",
        );
        const cancelBtn = secondaryBtn("Cancel");
        const okBtn = primaryBtn("Apply");
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        card.appendChild(btnRow);

        const done = async (
          value: {
            mode: "solid" | "colormap";
            color?: string;
            colormap?: string;
            range?: [number, number];
            reversed?: boolean;
            stackedResults?: Array<{
              name: string;
              mode: "solid" | "colormap";
              color?: string;
              colormap?: string;
              range?: [number, number];
              reversed?: boolean;
              alpha?: number;
            }>;
            alpha?: number;
          } | null,
        ) => {
          await animateOut(backdrop, card);
          resolve(value);
        };

        const buildColormapResult = () => ({
          mode: "colormap" as const,
          colormap: selectedCM,
          range: autoRange
            ? undefined
            : ([
                parseFloat(rangeMinInput.value) || 0,
                parseFloat(rangeMaxInput.value) || 100,
              ] as [number, number]),
          reversed: isReversed || undefined,
        });

        /** Build the full result including stacked channel data. */
        const buildFullResult = () => {
          // Save current channel state before building result
          saveCurrentChannelState();

          const hostState = hasStacked ? channelStates[0] : undefined;
          let base: {
            mode: "solid" | "colormap";
            color?: string;
            colormap?: string;
            range?: [number, number];
            reversed?: boolean;
          };

          if (hasStacked) {
            // Build from host state
            if (hostState!.mode === "solid") {
              base = { mode: "solid", color: hostState!.color };
            } else {
              const hAutoRange = hostState!.autoRange;
              base = {
                mode: "colormap",
                colormap: hostState!.colormap,
                range: hAutoRange
                  ? undefined
                  : ([
                      parseFloat(hostState!.rangeMin) || 0,
                      parseFloat(hostState!.rangeMax) || 100,
                    ] as [number, number]),
                reversed: hostState!.reversed || undefined,
              };
            }
          } else {
            // No stacking — use current UI
            if (mode === "solid") {
              base = { mode: "solid", color: solidColor.getColor() };
            } else {
              base = buildColormapResult();
            }
          }

          if (hasStacked) {
            const stackedResults = channelStates.slice(1).map((st) => ({
              name: st.name,
              mode: st.mode,
              color: st.mode === "solid" ? st.color : undefined,
              colormap: st.mode === "colormap" ? st.colormap : undefined,
              range: st.autoRange
                ? undefined
                : ([
                    parseFloat(st.rangeMin) || 0,
                    parseFloat(st.rangeMax) || 100,
                  ] as [number, number]),
              reversed: st.reversed || undefined,
              alpha: st.alpha,
            }));
            return {
              ...base,
              stackedResults,
              alpha: hostState!.alpha,
            };
          }
          return base;
        };

        cancelBtn.addEventListener("click", () => done(null));
        okBtn.addEventListener("click", () => {
          done(buildFullResult());
        });
        backdrop.addEventListener("mousedown", (e) => {
          if (e.target === backdrop) done(null);
        });
        const onKey = (e: KeyboardEvent) => {
          if (e.key === "Escape") {
            document.removeEventListener("keydown", onKey);
            done(null);
          } else if (e.key === "Enter") {
            document.removeEventListener("keydown", onKey);
            done(buildFullResult());
          }
        };
        document.addEventListener("keydown", onKey);
        return; // exit early — score plot handled
      }

      // ── BAM PLOTS: per-strand colours + coverage colour ───────────
      if (isBam) {
        // Section: Reads strand colours
        card.appendChild(
          el(
            "div",
            `font-size:12px;font-weight:600;color:${TEXT_COLOR};margin-bottom:6px;`,
            "Read strand colours",
          ),
        );
        const fwd = makeColorRow(
          "Forward (+)",
          current.readsColor?.plus || "#fab1a0",
        );
        const rev = makeColorRow(
          "Reverse (−)",
          current.readsColor?.minus || "#81ecec",
        );
        const oth = makeColorRow(
          "Other",
          current.readsColor?.other || "#b2bec3",
        );
        card.appendChild(fwd.row);
        card.appendChild(rev.row);
        card.appendChild(oth.row);

        // Section: Coverage bar colour
        card.appendChild(
          el(
            "div",
            `font-size:12px;font-weight:600;color:${TEXT_COLOR};margin-top:14px;margin-bottom:6px;`,
            "Coverage colour",
          ),
        );

        // Coverage mode tabs
        let covMode: "solid" | "colormap" = current.coverageColormap
          ? "colormap"
          : "solid";

        const covTabRow = el(
          "div",
          "display:flex;gap:0;margin-bottom:10px;border-bottom:1.5px solid " +
            BORDER_COLOR +
            ";",
        );
        const covTabSolid = el(
          "button",
          [
            "flex:1",
            "padding:6px 0",
            "border:none",
            "background:none",
            "font-size:13px",
            "font-weight:600",
            "cursor:pointer",
            `font-family:${FONT}`,
            `color:${covMode === "solid" ? PRIMARY_COLOR : SUBTITLE_COLOR}`,
            `border-bottom:2px solid ${covMode === "solid" ? PRIMARY_COLOR : "transparent"}`,
            `transition:all ${TRANSITION}`,
          ].join(";"),
          "Solid",
        );
        const covTabMap = el(
          "button",
          [
            "flex:1",
            "padding:6px 0",
            "border:none",
            "background:none",
            "font-size:13px",
            "font-weight:600",
            "cursor:pointer",
            `font-family:${FONT}`,
            `color:${covMode === "colormap" ? PRIMARY_COLOR : SUBTITLE_COLOR}`,
            `border-bottom:2px solid ${covMode === "colormap" ? PRIMARY_COLOR : "transparent"}`,
            `transition:all ${TRANSITION}`,
          ].join(";"),
          "Gradient",
        );
        covTabRow.appendChild(covTabSolid);
        covTabRow.appendChild(covTabMap);
        card.appendChild(covTabRow);

        // Coverage solid panel
        const covSolidPanel = el(
          "div",
          covMode === "solid" ? "" : "display:none;",
        );
        const covSolidRow = makeColorRow(
          "Color",
          current.coverageColor || "#6b7484",
        );
        covSolidPanel.appendChild(covSolidRow.row);
        card.appendChild(covSolidPanel);

        // Coverage colormap panel
        const covCmPanel = el(
          "div",
          covMode === "colormap" ? "" : "display:none;",
        );

        const COV_COLORMAPS: { name: string; colors: string[] }[] = [
          {
            name: "viridis",
            colors: ["#440154", "#31688e", "#35b779", "#fde724"],
          },
          {
            name: "plasma",
            colors: ["#0d0887", "#7001a8", "#dd5e66", "#f0f921"],
          },
          {
            name: "magma",
            colors: ["#000004", "#65156e", "#f3685b", "#fcfdbf"],
          },
          {
            name: "coolwarm",
            colors: ["#3b4cc0", "#89c7ec", "#ffa688", "#b50026"],
          },
          {
            name: "Spectral",
            colors: ["#9e0142", "#fdae61", "#66c2a5", "#5e4fa2"],
          },
          {
            name: "flare",
            colors: ["#f27a5a", "#ffa475", "#ffd48e", "#fff8a0"],
          },
          {
            name: "rocket",
            colors: ["#03051a", "#86298d", "#f194b4", "#ffeea8"],
          },
          {
            name: "frost-coral",
            colors: ["#dfe4ea", "#ff4757"],
          },
          {
            name: "frost-indigo",
            colors: ["#dfe4ea", "#3742fa"],
          },
          {
            name: "silver-crimson",
            colors: ["#bdc3c7", "#c0392b"],
          },
          {
            name: "silver-teal",
            colors: ["#bdc3c7", "#16a085"],
          },
          {
            name: "silver-purple",
            colors: ["#bdc3c7", "#8e44ad"],
          },
        ];
        let covSelectedCM = current.coverageColormap || "viridis";
        const covCmGrid = el(
          "div",
          "display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:10px;",
        );
        const covCmItems: { name: string; row: HTMLElement }[] = [];
        for (const cm of COV_COLORMAPS) {
          const row = el(
            "div",
            [
              "display:flex",
              "align-items:center",
              "gap:8px",
              "padding:4px 8px",
              "border-radius:6px",
              `border:1.5px solid ${cm.name === covSelectedCM ? PRIMARY_COLOR : BORDER_COLOR}`,
              `background:${cm.name === covSelectedCM ? "rgba(0,122,255,0.06)" : "transparent"}`,
              "cursor:pointer",
              `transition:all ${TRANSITION}`,
            ].join(";"),
          );
          const gradBar = el(
            "div",
            [
              "flex:1",
              "height:16px",
              "border-radius:3px",
              `background:linear-gradient(to right, ${cm.colors.join(", ")})`,
            ].join(";"),
          );
          const nameEl = el(
            "div",
            `font-size:11px;color:${TEXT_COLOR};min-width:60px;font-weight:500;`,
            cm.name,
          );
          row.appendChild(nameEl);
          row.appendChild(gradBar);
          covCmItems.push({ name: cm.name, row });
          row.addEventListener("click", () => {
            covSelectedCM = cm.name;
            for (const item of covCmItems) {
              item.row.style.borderColor =
                item.name === covSelectedCM ? PRIMARY_COLOR : BORDER_COLOR;
              item.row.style.background =
                item.name === covSelectedCM
                  ? "rgba(0,122,255,0.06)"
                  : "transparent";
            }
          });
          covCmGrid.appendChild(row);
        }
        covCmPanel.appendChild(covCmGrid);

        // Coverage auto-range checkbox
        let covAutoRange = !current.coverageRange;
        const covAutoRow = el(
          "div",
          "display:flex;align-items:center;gap:8px;margin-bottom:6px;",
        );
        const covAutoChk = document.createElement("input");
        covAutoChk.type = "checkbox";
        covAutoChk.checked = covAutoRange;
        covAutoChk.style.cssText =
          "width:14px;height:14px;cursor:pointer;accent-color:" +
          PRIMARY_COLOR +
          ";flex-shrink:0;";
        const covAutoLbl = el(
          "label",
          `font-size:11px;color:${TEXT_COLOR};cursor:pointer;user-select:none;`,
          "Auto range",
        );
        covAutoLbl.addEventListener("click", () => {
          covAutoChk.checked = !covAutoChk.checked;
          covAutoChk.dispatchEvent(new Event("change"));
        });
        covAutoRow.appendChild(covAutoChk);
        covAutoRow.appendChild(covAutoLbl);
        covCmPanel.appendChild(covAutoRow);

        // Coverage range inputs
        const covRangeRow = el(
          "div",
          `display:flex;align-items:center;gap:8px;opacity:${covAutoRange ? "0.35" : "1"};transition:opacity 0.15s;`,
        );
        const covRangeLabel = el(
          "div",
          `font-size:11px;color:${SUBTITLE_COLOR};min-width:40px;`,
          "Range",
        );
        const covRangeMin = el(
          "input",
          [
            "width:60px",
            "box-sizing:border-box",
            `background:${INPUT_BG}`,
            `border:1.5px solid ${BORDER_COLOR}`,
            "border-radius:6px",
            "padding:4px 6px",
            "font-size:12px",
            "font-family:monospace",
            `color:${TEXT_COLOR}`,
            "outline:none",
          ].join(";"),
        ) as HTMLInputElement;
        covRangeMin.type = "number";
        covRangeMin.placeholder = "min";
        covRangeMin.value = current.coverageRange
          ? String(current.coverageRange[0])
          : "0";
        covRangeMin.disabled = covAutoRange;
        const covRangeDash = el(
          "div",
          `font-size:13px;color:${SUBTITLE_COLOR};`,
          "–",
        );
        const covRangeMax = el(
          "input",
          [
            "width:60px",
            "box-sizing:border-box",
            `background:${INPUT_BG}`,
            `border:1.5px solid ${BORDER_COLOR}`,
            "border-radius:6px",
            "padding:4px 6px",
            "font-size:12px",
            "font-family:monospace",
            `color:${TEXT_COLOR}`,
            "outline:none",
          ].join(";"),
        ) as HTMLInputElement;
        covRangeMax.type = "number";
        covRangeMax.placeholder = "max";
        covRangeMax.value = current.coverageRange
          ? String(current.coverageRange[1])
          : "100";
        covRangeMax.disabled = covAutoRange;

        covAutoChk.addEventListener("change", () => {
          covAutoRange = covAutoChk.checked;
          covRangeMin.disabled = covAutoRange;
          covRangeMax.disabled = covAutoRange;
          covRangeRow.style.opacity = covAutoRange ? "0.35" : "1";
        });

        covRangeRow.appendChild(covRangeLabel);
        covRangeRow.appendChild(covRangeMin);
        covRangeRow.appendChild(covRangeDash);
        covRangeRow.appendChild(covRangeMax);
        covCmPanel.appendChild(covRangeRow);
        card.appendChild(covCmPanel);

        // Coverage tab switching
        const switchCovTab = (target: "solid" | "colormap") => {
          covMode = target;
          covSolidPanel.style.display = covMode === "solid" ? "" : "none";
          covCmPanel.style.display = covMode === "colormap" ? "" : "none";
          covTabSolid.style.color =
            covMode === "solid" ? PRIMARY_COLOR : SUBTITLE_COLOR;
          covTabSolid.style.borderBottomColor =
            covMode === "solid" ? PRIMARY_COLOR : "transparent";
          covTabMap.style.color =
            covMode === "colormap" ? PRIMARY_COLOR : SUBTITLE_COLOR;
          covTabMap.style.borderBottomColor =
            covMode === "colormap" ? PRIMARY_COLOR : "transparent";
        };
        covTabSolid.addEventListener("click", () => switchCovTab("solid"));
        covTabMap.addEventListener("click", () => switchCovTab("colormap"));

        const btnRow = el(
          "div",
          "display:flex;justify-content:flex-end;gap:10px;margin-top:20px;",
        );
        const cancelBtn = secondaryBtn("Cancel");
        const okBtn = primaryBtn("Apply");
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        card.appendChild(btnRow);

        const done = async (
          value: {
            mode: "feature";
            readsColor: { plus: string; minus: string; other: string };
            coverageColor?: string;
            coverageColormap?: string;
            coverageRange?: [number, number];
          } | null,
        ) => {
          await animateOut(backdrop, card);
          resolve(value);
        };

        cancelBtn.addEventListener("click", () => done(null));
        okBtn.addEventListener("click", () => {
          const result: {
            mode: "feature";
            readsColor: { plus: string; minus: string; other: string };
            coverageColor?: string;
            coverageColormap?: string;
            coverageRange?: [number, number];
          } = {
            mode: "feature" as const,
            readsColor: {
              plus: fwd.getColor(),
              minus: rev.getColor(),
              other: oth.getColor(),
            },
          };
          if (covMode === "solid") {
            result.coverageColor = covSolidRow.getColor();
          } else {
            result.coverageColormap = covSelectedCM;
            result.coverageRange = covAutoRange
              ? undefined
              : ([
                  parseFloat(covRangeMin.value) || 0,
                  parseFloat(covRangeMax.value) || 100,
                ] as [number, number]);
          }
          done(result);
        });
        backdrop.addEventListener("mousedown", (e) => {
          if (e.target === backdrop) done(null);
        });
        const onKey = (e: KeyboardEvent) => {
          if (e.key === "Escape") {
            document.removeEventListener("keydown", onKey);
            done(null);
          }
        };
        document.addEventListener("keydown", onKey);
        return;
      }

      // ── SEQUENCE PLOTS: per-base colours ──────────────────────────
      if (isSequence) {
        const defaults: Record<string, string> = {
          A: "#2ed573",
          T: "#ff4757",
          C: "#3dc1d3",
          G: "#f5cd79",
          N: "#999999",
        };
        card.appendChild(
          el(
            "div",
            `font-size:13px;color:${SUBTITLE_COLOR};margin-bottom:14px;`,
            "Set colours for each nucleotide base.",
          ),
        );
        const bases = ["A", "T", "C", "G", "N"];
        const rows: { base: string; getColor: () => string }[] = [];
        for (const b of bases) {
          const c = current.baseColors?.[b] || defaults[b];
          const r = makeColorRow(b, c);
          card.appendChild(r.row);
          rows.push({ base: b, getColor: r.getColor });
        }

        const btnRow = el(
          "div",
          "display:flex;justify-content:flex-end;gap:10px;margin-top:20px;",
        );
        const cancelBtn = secondaryBtn("Cancel");
        const okBtn = primaryBtn("Apply");
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        card.appendChild(btnRow);

        const done = async (
          value: {
            mode: "feature";
            baseColors: { [base: string]: string };
          } | null,
        ) => {
          await animateOut(backdrop, card);
          resolve(value);
        };

        cancelBtn.addEventListener("click", () => done(null));
        okBtn.addEventListener("click", () => {
          const bc: { [base: string]: string } = {};
          for (const r of rows) bc[r.base] = r.getColor();
          done({ mode: "feature", baseColors: bc });
        });
        backdrop.addEventListener("mousedown", (e) => {
          if (e.target === backdrop) done(null);
        });
        const onKey = (e: KeyboardEvent) => {
          if (e.key === "Escape") {
            document.removeEventListener("keydown", onKey);
            done(null);
          }
        };
        document.addEventListener("keydown", onKey);
        return;
      }

      // ── VARIANT PLOTS: base + ref + text colours ──────────────────
      if (isVariant) {
        const defaults: Record<string, string> = {
          A: "#2ed573",
          T: "#ff4757",
          C: "#3dc1d3",
          G: "#f5cd79",
          N: "#999999",
        };
        card.appendChild(
          el(
            "div",
            `font-size:13px;color:${SUBTITLE_COLOR};margin-bottom:14px;`,
            "Set colours for variant allele rendering.",
          ),
        );

        // Section: Base colours
        card.appendChild(
          el(
            "div",
            `font-size:12px;font-weight:600;color:${TEXT_COLOR};margin-bottom:6px;`,
            "Base colours",
          ),
        );
        const bases = ["A", "T", "C", "G", "N"];
        const baseRows: { base: string; getColor: () => string }[] = [];
        for (const b of bases) {
          const c = current.baseColors?.[b] || defaults[b];
          const r = makeColorRow(b, c);
          card.appendChild(r.row);
          baseRows.push({ base: b, getColor: r.getColor });
        }

        // Section: Reference & text
        card.appendChild(
          el(
            "div",
            `font-size:12px;font-weight:600;color:${TEXT_COLOR};margin-top:12px;margin-bottom:6px;`,
            "Other colours",
          ),
        );
        const refRow = makeColorRow("Reference", current.refColor || "#dfe6e9");
        const textRow = makeColorRow(
          "Base text",
          current.baseTextColor || "#2d3436",
        );
        card.appendChild(refRow.row);
        card.appendChild(textRow.row);

        const btnRow = el(
          "div",
          "display:flex;justify-content:flex-end;gap:10px;margin-top:20px;",
        );
        const cancelBtn = secondaryBtn("Cancel");
        const okBtn = primaryBtn("Apply");
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        card.appendChild(btnRow);

        const done = async (
          value: {
            mode: "feature";
            baseColors: { [base: string]: string };
            refColor: string;
            baseTextColor: string;
          } | null,
        ) => {
          await animateOut(backdrop, card);
          resolve(value);
        };

        cancelBtn.addEventListener("click", () => done(null));
        okBtn.addEventListener("click", () => {
          const bc: { [base: string]: string } = {};
          for (const r of baseRows) bc[r.base] = r.getColor();
          done({
            mode: "feature",
            baseColors: bc,
            refColor: refRow.getColor(),
            baseTextColor: textRow.getColor(),
          });
        });
        backdrop.addEventListener("mousedown", (e) => {
          if (e.target === backdrop) done(null);
        });
        const onKey = (e: KeyboardEvent) => {
          if (e.key === "Escape") {
            document.removeEventListener("keydown", onKey);
            done(null);
          }
        };
        document.addEventListener("keydown", onKey);
        return;
      }

      // ── DEFAULT (transcript / rna / diamond / rect / any other) ───
      const isTranscript = ["transcript", "rna"].includes(plotType);

      if (isTranscript) {
        // Per-feature-type colour pickers for transcript/RNA
        card.appendChild(
          el(
            "div",
            `font-size:12px;font-weight:600;color:${TEXT_COLOR};margin-bottom:8px;`,
            "Feature part colours",
          ),
        );

        const TX_DEFAULTS: { key: string; label: string; color: string }[] = [
          { key: "intron", label: "Intron", color: "#b0b0b0" },
          { key: "exon", label: "Exon", color: "#a4b0be" },
          { key: "CDS", label: "CDS", color: "#747d8c" },
          { key: "five_prime_UTR", label: "5′ UTR", color: "#ced6e0" },
          { key: "three_prime_UTR", label: "3′ UTR", color: "#ced6e0" },
          { key: "start_codon", label: "Start codon", color: "#2ed573" },
          { key: "stop_codon", label: "Stop codon", color: "#ff4757" },
        ];

        const txRows: { key: string; getColor: () => string }[] = [];
        for (const def of TX_DEFAULTS) {
          const initial = current.transcriptColors?.[def.key] || def.color;
          const row = makeColorRow(def.label, initial);
          card.appendChild(row.row);
          txRows.push({ key: def.key, getColor: row.getColor });
        }

        // ── Modification colour section ─────────────────────────────
        card.appendChild(
          el(
            "div",
            `font-size:12px;font-weight:600;color:${TEXT_COLOR};margin-top:16px;margin-bottom:8px;`,
            "Modification colour",
          ),
        );

        // Modification mode tabs: Solid / Gradient
        let modMode: "solid" | "colormap" = current.modificationColormap
          ? "colormap"
          : current.modificationColor
            ? "solid"
            : "colormap";

        const modTabRow = el(
          "div",
          `display:flex;gap:0;margin-bottom:10px;border-bottom:1.5px solid ${BORDER_COLOR};`,
        );
        const modTabSolid = el(
          "button",
          [
            "flex:1",
            "padding:6px 0",
            "border:none",
            "background:none",
            "font-size:13px",
            "font-weight:600",
            "cursor:pointer",
            `font-family:${FONT}`,
            `color:${modMode === "solid" ? PRIMARY_COLOR : SUBTITLE_COLOR}`,
            `border-bottom:2px solid ${modMode === "solid" ? PRIMARY_COLOR : "transparent"}`,
            `transition:all ${TRANSITION}`,
          ].join(";"),
          "Solid",
        );
        const modTabMap = el(
          "button",
          [
            "flex:1",
            "padding:6px 0",
            "border:none",
            "background:none",
            "font-size:13px",
            "font-weight:600",
            "cursor:pointer",
            `font-family:${FONT}`,
            `color:${modMode === "colormap" ? PRIMARY_COLOR : SUBTITLE_COLOR}`,
            `border-bottom:2px solid ${modMode === "colormap" ? PRIMARY_COLOR : "transparent"}`,
            `transition:all ${TRANSITION}`,
          ].join(";"),
          "Gradient",
        );
        modTabRow.appendChild(modTabSolid);
        modTabRow.appendChild(modTabMap);
        card.appendChild(modTabRow);

        // Modification solid panel
        const modSolidPanel = el(
          "div",
          modMode === "solid" ? "" : "display:none;",
        );
        const modSolidRow = makeColorRow(
          "Color",
          current.modificationColor || "#e74c3c",
        );
        modSolidPanel.appendChild(modSolidRow.row);
        card.appendChild(modSolidPanel);

        // Modification colormap panel
        const modCmPanel = el(
          "div",
          modMode === "colormap" ? "" : "display:none;",
        );

        const MOD_COLORMAPS: { name: string; colors: string[] }[] = [
          {
            name: "coolwarm",
            colors: ["#3b4cc0", "#89c7ec", "#ffa688", "#b50026"],
          },
          {
            name: "viridis",
            colors: ["#440154", "#31688e", "#35b779", "#fde724"],
          },
          {
            name: "plasma",
            colors: ["#0d0887", "#7001a8", "#dd5e66", "#f0f921"],
          },
          {
            name: "magma",
            colors: ["#000004", "#65156e", "#f3685b", "#fcfdbf"],
          },
          {
            name: "Spectral",
            colors: ["#9e0142", "#fdae61", "#66c2a5", "#5e4fa2"],
          },
          {
            name: "flare",
            colors: ["#f27a5a", "#ffa475", "#ffd48e", "#fff8a0"],
          },
          {
            name: "rocket",
            colors: ["#03051a", "#86298d", "#f194b4", "#ffeea8"],
          },
          {
            name: "frost-coral",
            colors: ["#dfe4ea", "#ff4757"],
          },
          {
            name: "frost-indigo",
            colors: ["#dfe4ea", "#3742fa"],
          },
          {
            name: "silver-crimson",
            colors: ["#bdc3c7", "#c0392b"],
          },
          {
            name: "silver-teal",
            colors: ["#bdc3c7", "#16a085"],
          },
          {
            name: "silver-purple",
            colors: ["#bdc3c7", "#8e44ad"],
          },
        ];

        let modSelectedCM = current.modificationColormap || "coolwarm";
        const modCmGrid = el(
          "div",
          "display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:10px;",
        );
        const modCmItems: { name: string; row: HTMLElement }[] = [];
        for (const cm of MOD_COLORMAPS) {
          const row = el(
            "div",
            [
              "display:flex",
              "align-items:center",
              "gap:8px",
              "padding:4px 8px",
              "border-radius:6px",
              `border:1.5px solid ${cm.name === modSelectedCM ? PRIMARY_COLOR : BORDER_COLOR}`,
              `background:${cm.name === modSelectedCM ? "rgba(0,122,255,0.06)" : "transparent"}`,
              "cursor:pointer",
              `transition:all ${TRANSITION}`,
            ].join(";"),
          );
          const gradBar = el(
            "div",
            [
              "flex:1",
              "height:16px",
              "border-radius:3px",
              `background:linear-gradient(to right, ${cm.colors.join(", ")})`,
            ].join(";"),
          );
          const nameEl = el(
            "div",
            `font-size:11px;color:${TEXT_COLOR};min-width:60px;font-weight:500;`,
            cm.name,
          );
          row.appendChild(nameEl);
          row.appendChild(gradBar);
          modCmItems.push({ name: cm.name, row });
          row.addEventListener("click", () => {
            modSelectedCM = cm.name;
            for (const item of modCmItems) {
              item.row.style.borderColor =
                item.name === modSelectedCM ? PRIMARY_COLOR : BORDER_COLOR;
              item.row.style.background =
                item.name === modSelectedCM
                  ? "rgba(0,122,255,0.06)"
                  : "transparent";
            }
          });
          modCmGrid.appendChild(row);
        }
        modCmPanel.appendChild(modCmGrid);

        // Modification auto-range
        let modAutoRange = !current.modificationRange;
        const modAutoRow = el(
          "div",
          "display:flex;align-items:center;gap:8px;margin-bottom:6px;",
        );
        const modAutoChk = document.createElement("input");
        modAutoChk.type = "checkbox";
        modAutoChk.checked = modAutoRange;
        modAutoChk.style.cssText =
          "width:14px;height:14px;cursor:pointer;accent-color:" +
          PRIMARY_COLOR +
          ";flex-shrink:0;";
        const modAutoLbl = el(
          "label",
          `font-size:11px;color:${TEXT_COLOR};cursor:pointer;user-select:none;`,
          "Auto range",
        );
        modAutoLbl.addEventListener("click", () => {
          modAutoChk.checked = !modAutoChk.checked;
          modAutoChk.dispatchEvent(new Event("change"));
        });
        modAutoRow.appendChild(modAutoChk);
        modAutoRow.appendChild(modAutoLbl);
        modCmPanel.appendChild(modAutoRow);

        // Modification range inputs
        const modRangeRow = el(
          "div",
          `display:flex;align-items:center;gap:8px;opacity:${modAutoRange ? "0.35" : "1"};transition:opacity 0.15s;`,
        );
        const modRangeLabel = el(
          "div",
          `font-size:11px;color:${SUBTITLE_COLOR};min-width:40px;`,
          "Range",
        );
        const modRangeMin = el(
          "input",
          [
            "width:60px",
            "box-sizing:border-box",
            `background:${INPUT_BG}`,
            `border:1.5px solid ${BORDER_COLOR}`,
            "border-radius:6px",
            "padding:4px 6px",
            "font-size:12px",
            "font-family:monospace",
            `color:${TEXT_COLOR}`,
            "outline:none",
          ].join(";"),
        ) as HTMLInputElement;
        modRangeMin.type = "number";
        modRangeMin.placeholder = "min";
        modRangeMin.value = current.modificationRange
          ? String(current.modificationRange[0])
          : "0";
        modRangeMin.disabled = modAutoRange;
        const modRangeDash = el(
          "div",
          `font-size:13px;color:${SUBTITLE_COLOR};`,
          "–",
        );
        const modRangeMax = el(
          "input",
          [
            "width:60px",
            "box-sizing:border-box",
            `background:${INPUT_BG}`,
            `border:1.5px solid ${BORDER_COLOR}`,
            "border-radius:6px",
            "padding:4px 6px",
            "font-size:12px",
            "font-family:monospace",
            `color:${TEXT_COLOR}`,
            "outline:none",
          ].join(";"),
        ) as HTMLInputElement;
        modRangeMax.type = "number";
        modRangeMax.placeholder = "max";
        modRangeMax.value = current.modificationRange
          ? String(current.modificationRange[1])
          : "1";
        modRangeMax.disabled = modAutoRange;

        modAutoChk.addEventListener("change", () => {
          modAutoRange = modAutoChk.checked;
          modRangeMin.disabled = modAutoRange;
          modRangeMax.disabled = modAutoRange;
          modRangeRow.style.opacity = modAutoRange ? "0.35" : "1";
        });

        modRangeRow.appendChild(modRangeLabel);
        modRangeRow.appendChild(modRangeMin);
        modRangeRow.appendChild(modRangeDash);
        modRangeRow.appendChild(modRangeMax);
        modCmPanel.appendChild(modRangeRow);
        card.appendChild(modCmPanel);

        // Modification tab switching
        const switchModTab = (target: "solid" | "colormap") => {
          modMode = target;
          modSolidPanel.style.display = modMode === "solid" ? "" : "none";
          modCmPanel.style.display = modMode === "colormap" ? "" : "none";
          modTabSolid.style.color =
            modMode === "solid" ? PRIMARY_COLOR : SUBTITLE_COLOR;
          modTabSolid.style.borderBottomColor =
            modMode === "solid" ? PRIMARY_COLOR : "transparent";
          modTabMap.style.color =
            modMode === "colormap" ? PRIMARY_COLOR : SUBTITLE_COLOR;
          modTabMap.style.borderBottomColor =
            modMode === "colormap" ? PRIMARY_COLOR : "transparent";
        };
        modTabSolid.addEventListener("click", () => switchModTab("solid"));
        modTabMap.addEventListener("click", () => switchModTab("colormap"));

        const btnRow = el(
          "div",
          "display:flex;justify-content:flex-end;gap:10px;margin-top:20px;",
        );
        const cancelBtn = secondaryBtn("Cancel");
        const okBtn = primaryBtn("Apply");
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        card.appendChild(btnRow);

        const done = async (
          value: {
            mode: "feature";
            transcriptColors: { [type: string]: string };
            modificationColor?: string;
            modificationColormap?: string;
            modificationRange?: [number, number];
          } | null,
        ) => {
          await animateOut(backdrop, card);
          resolve(value);
        };

        cancelBtn.addEventListener("click", () => done(null));
        okBtn.addEventListener("click", () => {
          const tc: { [type: string]: string } = {};
          for (const r of txRows) tc[r.key] = r.getColor();
          const result: {
            mode: "feature";
            transcriptColors: { [type: string]: string };
            modificationColor?: string;
            modificationColormap?: string;
            modificationRange?: [number, number];
          } = { mode: "feature", transcriptColors: tc };

          // Add modification colour result
          if (modMode === "solid") {
            result.modificationColor = modSolidRow.getColor();
          } else {
            result.modificationColormap = modSelectedCM;
            result.modificationRange = modAutoRange
              ? undefined
              : ([
                  parseFloat(modRangeMin.value) || 0,
                  parseFloat(modRangeMax.value) || 1,
                ] as [number, number]);
          }
          done(result);
        });
        backdrop.addEventListener("mousedown", (e) => {
          if (e.target === backdrop) done(null);
        });
        const onKey = (e: KeyboardEvent) => {
          if (e.key === "Escape") {
            document.removeEventListener("keydown", onKey);
            done(null);
          }
        };
        document.addEventListener("keydown", onKey);
      } else if (plotType === "diamond") {
        // ── DIAMOND: solid + colormap (like score plots) ────────────
        let dmMode: "solid" | "colormap" = current.colormap
          ? "colormap"
          : "solid";

        const dmTabRow = el(
          "div",
          [
            "display:flex",
            "gap:0",
            "margin-bottom:18px",
            `border-bottom:1.5px solid ${BORDER_COLOR}`,
          ].join(";") + ";",
        );
        const dmTabSolid = el(
          "button",
          [
            "flex:1",
            "padding:8px 0",
            "border:none",
            "background:none",
            "font-size:14px",
            "font-weight:600",
            "cursor:pointer",
            `font-family:${FONT}`,
            `color:${dmMode === "solid" ? PRIMARY_COLOR : SUBTITLE_COLOR}`,
            `border-bottom:2px solid ${dmMode === "solid" ? PRIMARY_COLOR : "transparent"}`,
            `transition:all ${TRANSITION}`,
          ].join(";"),
          "Solid Color",
        );
        const dmTabMap = el(
          "button",
          [
            "flex:1",
            "padding:8px 0",
            "border:none",
            "background:none",
            "font-size:14px",
            "font-weight:600",
            "cursor:pointer",
            `font-family:${FONT}`,
            `color:${dmMode === "colormap" ? PRIMARY_COLOR : SUBTITLE_COLOR}`,
            `border-bottom:2px solid ${dmMode === "colormap" ? PRIMARY_COLOR : "transparent"}`,
            `transition:all ${TRANSITION}`,
          ].join(";"),
          "Gradient / Colormap",
        );
        dmTabRow.appendChild(dmTabSolid);
        dmTabRow.appendChild(dmTabMap);
        card.appendChild(dmTabRow);

        // ── Solid panel ─────────────────────────────────────────────
        const dmSolidPanel = el(
          "div",
          dmMode === "solid" ? "" : "display:none;",
        );
        const dmSolidColor = makeColorRow("Color", current.color || "#747d8c");
        dmSolidPanel.appendChild(dmSolidColor.row);
        card.appendChild(dmSolidPanel);

        // ── Colormap panel ──────────────────────────────────────────
        const dmCmPanel = el(
          "div",
          dmMode === "colormap" ? "" : "display:none;",
        );

        const DM_COLORMAPS: { name: string; colors: string[] }[] = [
          {
            name: "viridis",
            colors: ["#440154", "#31688e", "#35b779", "#fde724"],
          },
          {
            name: "plasma",
            colors: ["#0d0887", "#7001a8", "#dd5e66", "#f0f921"],
          },
          {
            name: "magma",
            colors: ["#000004", "#65156e", "#f3685b", "#fcfdbf"],
          },
          {
            name: "coolwarm",
            colors: ["#3b4cc0", "#89c7ec", "#ffa688", "#b50026"],
          },
          {
            name: "Spectral",
            colors: ["#9e0142", "#fdae61", "#66c2a5", "#5e4fa2"],
          },
          {
            name: "flare",
            colors: ["#f27a5a", "#ffa475", "#ffd48e", "#fff8a0"],
          },
          {
            name: "rocket",
            colors: ["#03051a", "#86298d", "#f194b4", "#ffeea8"],
          },
          {
            name: "frost-coral",
            colors: ["#dfe4ea", "#ff4757"],
          },
          {
            name: "frost-indigo",
            colors: ["#dfe4ea", "#3742fa"],
          },
          {
            name: "silver-crimson",
            colors: ["#bdc3c7", "#c0392b"],
          },
          {
            name: "silver-teal",
            colors: ["#bdc3c7", "#16a085"],
          },
          {
            name: "silver-purple",
            colors: ["#bdc3c7", "#8e44ad"],
          },
        ];

        let dmSelectedCM = current.colormap || "viridis";

        const dmCmLabel = el(
          "div",
          `font-size:12px;color:${SUBTITLE_COLOR};margin-bottom:8px;`,
          "Select colormap",
        );
        dmCmPanel.appendChild(dmCmLabel);

        const dmCmGrid = el(
          "div",
          "display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;",
        );
        const dmCmItems: { name: string; row: HTMLElement }[] = [];
        for (const cm of DM_COLORMAPS) {
          const row = el(
            "div",
            [
              "display:flex",
              "align-items:center",
              "gap:10px",
              "padding:6px 10px",
              "border-radius:8px",
              `border:1.5px solid ${cm.name === dmSelectedCM ? PRIMARY_COLOR : BORDER_COLOR}`,
              `background:${cm.name === dmSelectedCM ? "rgba(0,122,255,0.06)" : "transparent"}`,
              "cursor:pointer",
              `transition:all ${TRANSITION}`,
            ].join(";"),
          );
          const gradBar = el(
            "div",
            [
              "flex:1",
              "height:20px",
              "border-radius:4px",
              `background:linear-gradient(to right, ${cm.colors.join(", ")})`,
            ].join(";"),
          );
          const nameEl = el(
            "div",
            `font-size:12px;color:${TEXT_COLOR};min-width:70px;font-weight:500;`,
            cm.name,
          );
          row.appendChild(nameEl);
          row.appendChild(gradBar);
          dmCmItems.push({ name: cm.name, row });
          row.addEventListener("click", () => {
            dmSelectedCM = cm.name;
            for (const item of dmCmItems) {
              item.row.style.borderColor =
                item.name === dmSelectedCM ? PRIMARY_COLOR : BORDER_COLOR;
              item.row.style.background =
                item.name === dmSelectedCM
                  ? "rgba(0,122,255,0.06)"
                  : "transparent";
            }
          });
          dmCmGrid.appendChild(row);
        }
        dmCmPanel.appendChild(dmCmGrid);

        // ── Auto-range checkbox ──────────────────────────────────────
        let dmAutoRange = !current.range;
        const dmAutoRow = el(
          "div",
          "display:flex;align-items:center;gap:8px;margin-bottom:8px;",
        );
        const dmAutoChk = document.createElement("input");
        dmAutoChk.type = "checkbox";
        dmAutoChk.checked = dmAutoRange;
        dmAutoChk.style.cssText =
          "width:15px;height:15px;cursor:pointer;accent-color:" +
          PRIMARY_COLOR +
          ";flex-shrink:0;";
        const dmAutoLbl = el(
          "label",
          `font-size:12px;color:${TEXT_COLOR};cursor:pointer;user-select:none;`,
          "Auto range",
        );
        dmAutoLbl.addEventListener("click", () => {
          dmAutoChk.checked = !dmAutoChk.checked;
          dmAutoChk.dispatchEvent(new Event("change"));
        });
        dmAutoRow.appendChild(dmAutoChk);
        dmAutoRow.appendChild(dmAutoLbl);
        dmCmPanel.appendChild(dmAutoRow);

        // ── Range min / max inputs ───────────────────────────────────
        const dmRangeRow = el(
          "div",
          `display:flex;align-items:center;gap:10px;margin-bottom:8px;opacity:${dmAutoRange ? "0.35" : "1"};transition:opacity 0.15s;`,
        );
        const dmRangeLabel = el(
          "div",
          `font-size:12px;color:${SUBTITLE_COLOR};min-width:46px;`,
          "Range",
        );
        const dmRangeMinInput = el(
          "input",
          [
            "width:70px",
            "box-sizing:border-box",
            `background:${INPUT_BG}`,
            `border:1.5px solid ${BORDER_COLOR}`,
            "border-radius:6px",
            "padding:5px 8px",
            "font-size:13px",
            "font-family:monospace",
            `color:${TEXT_COLOR}`,
            "outline:none",
          ].join(";"),
        ) as HTMLInputElement;
        dmRangeMinInput.type = "number";
        dmRangeMinInput.placeholder = "min";
        dmRangeMinInput.value = current.range ? String(current.range[0]) : "0";
        dmRangeMinInput.disabled = dmAutoRange;

        const dmRangeDash = el(
          "div",
          `font-size:14px;color:${SUBTITLE_COLOR};`,
          "–",
        );

        const dmRangeMaxInput = el(
          "input",
          [
            "width:70px",
            "box-sizing:border-box",
            `background:${INPUT_BG}`,
            `border:1.5px solid ${BORDER_COLOR}`,
            "border-radius:6px",
            "padding:5px 8px",
            "font-size:13px",
            "font-family:monospace",
            `color:${TEXT_COLOR}`,
            "outline:none",
          ].join(";"),
        ) as HTMLInputElement;
        dmRangeMaxInput.type = "number";
        dmRangeMaxInput.placeholder = "max";
        dmRangeMaxInput.value = current.range ? String(current.range[1]) : "1";
        dmRangeMaxInput.disabled = dmAutoRange;

        dmAutoChk.addEventListener("change", () => {
          dmAutoRange = dmAutoChk.checked;
          dmRangeMinInput.disabled = dmAutoRange;
          dmRangeMaxInput.disabled = dmAutoRange;
          dmRangeRow.style.opacity = dmAutoRange ? "0.35" : "1";
        });

        dmRangeRow.appendChild(dmRangeLabel);
        dmRangeRow.appendChild(dmRangeMinInput);
        dmRangeRow.appendChild(dmRangeDash);
        dmRangeRow.appendChild(dmRangeMaxInput);
        dmCmPanel.appendChild(dmRangeRow);

        // ── Reverse-colors checkbox ──────────────────────────────────
        let dmIsReversed = current.reversed === true;
        const dmReverseRow = el(
          "div",
          "display:flex;align-items:center;gap:8px;margin-bottom:4px;",
        );
        const dmReverseChk = document.createElement("input");
        dmReverseChk.type = "checkbox";
        dmReverseChk.checked = dmIsReversed;
        dmReverseChk.style.cssText =
          "width:15px;height:15px;cursor:pointer;accent-color:" +
          PRIMARY_COLOR +
          ";flex-shrink:0;";
        const dmReverseLbl = el(
          "label",
          `font-size:12px;color:${TEXT_COLOR};cursor:pointer;user-select:none;`,
          "Reverse colors",
        );
        dmReverseLbl.addEventListener("click", () => {
          dmReverseChk.checked = !dmReverseChk.checked;
          dmReverseChk.dispatchEvent(new Event("change"));
        });
        dmReverseChk.addEventListener("change", () => {
          dmIsReversed = dmReverseChk.checked;
        });
        dmReverseRow.appendChild(dmReverseChk);
        dmReverseRow.appendChild(dmReverseLbl);
        dmCmPanel.appendChild(dmReverseRow);

        card.appendChild(dmCmPanel);

        // Tab switching
        const switchDmTab = (target: "solid" | "colormap") => {
          dmMode = target;
          dmSolidPanel.style.display = dmMode === "solid" ? "" : "none";
          dmCmPanel.style.display = dmMode === "colormap" ? "" : "none";
          dmTabSolid.style.color =
            dmMode === "solid" ? PRIMARY_COLOR : SUBTITLE_COLOR;
          dmTabSolid.style.borderBottomColor =
            dmMode === "solid" ? PRIMARY_COLOR : "transparent";
          dmTabMap.style.color =
            dmMode === "colormap" ? PRIMARY_COLOR : SUBTITLE_COLOR;
          dmTabMap.style.borderBottomColor =
            dmMode === "colormap" ? PRIMARY_COLOR : "transparent";
        };
        dmTabSolid.addEventListener("click", () => switchDmTab("solid"));
        dmTabMap.addEventListener("click", () => switchDmTab("colormap"));

        const btnRow = el(
          "div",
          "display:flex;justify-content:flex-end;gap:10px;margin-top:20px;",
        );
        const cancelBtn = secondaryBtn("Cancel");
        const okBtn = primaryBtn("Apply");
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        card.appendChild(btnRow);

        const done = async (
          value: {
            mode: "solid" | "colormap";
            color?: string;
            colormap?: string;
            range?: [number, number];
            reversed?: boolean;
          } | null,
        ) => {
          await animateOut(backdrop, card);
          resolve(value);
        };

        cancelBtn.addEventListener("click", () => done(null));
        okBtn.addEventListener("click", () => {
          if (dmMode === "solid") {
            done({ mode: "solid", color: dmSolidColor.getColor() });
          } else {
            done({
              mode: "colormap",
              colormap: dmSelectedCM,
              range: dmAutoRange
                ? undefined
                : ([
                    parseFloat(dmRangeMinInput.value) || 0,
                    parseFloat(dmRangeMaxInput.value) || 1,
                  ] as [number, number]),
              reversed: dmIsReversed || undefined,
            });
          }
        });
        backdrop.addEventListener("mousedown", (e) => {
          if (e.target === backdrop) done(null);
        });
        const onKey = (e: KeyboardEvent) => {
          if (e.key === "Escape") {
            document.removeEventListener("keydown", onKey);
            done(null);
          } else if (e.key === "Enter") {
            document.removeEventListener("keydown", onKey);
            if (dmMode === "solid") {
              done({ mode: "solid", color: dmSolidColor.getColor() });
            } else {
              done({
                mode: "colormap",
                colormap: dmSelectedCM,
                range: dmAutoRange
                  ? undefined
                  : ([
                      parseFloat(dmRangeMinInput.value) || 0,
                      parseFloat(dmRangeMaxInput.value) || 1,
                    ] as [number, number]),
                reversed: dmIsReversed || undefined,
              });
            }
          }
        };
        document.addEventListener("keydown", onKey);
      } else {
        // Basic solid-colour picker for rect / any other plot type
        const solidColor = makeColorRow("Color", current.color || "#747d8c");
        card.appendChild(solidColor.row);

        const btnRow = el(
          "div",
          "display:flex;justify-content:flex-end;gap:10px;",
        );
        const cancelBtn = secondaryBtn("Cancel");
        const okBtn = primaryBtn("Apply");
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        card.appendChild(btnRow);

        const done = async (value: { mode: "solid"; color: string } | null) => {
          await animateOut(backdrop, card);
          resolve(value);
        };

        cancelBtn.addEventListener("click", () => done(null));
        okBtn.addEventListener("click", () => {
          done({ mode: "solid", color: solidColor.getColor() });
        });
        backdrop.addEventListener("mousedown", (e) => {
          if (e.target === backdrop) done(null);
        });
        const onKey = (e: KeyboardEvent) => {
          if (e.key === "Escape") {
            document.removeEventListener("keydown", onKey);
            done(null);
          } else if (e.key === "Enter") {
            document.removeEventListener("keydown", onKey);
            done({ mode: "solid", color: solidColor.getColor() });
          }
        };
        document.addEventListener("keydown", onKey);
      }
    });
  }

  /**
   * Modification colour dialog — allows choosing solid colour or colormap
   * for RNA modification markers (m6A, m5C, etc.).
   */
  static modificationColor(
    title: string,
    current: {
      color?: string;
      colormap?: string;
      range?: [number, number];
    },
  ): Promise<{
    mode: "solid" | "colormap";
    color?: string;
    colormap?: string;
    range?: [number, number];
  } | null> {
    return new Promise((resolve) => {
      const { backdrop, card } = createShell();

      card.appendChild(
        el(
          "div",
          `font-size:17px;font-weight:700;color:${TEXT_COLOR};margin-bottom:16px;`,
          title,
        ),
      );

      // ── Tab toggle: Solid / Gradient ──
      let mode: "solid" | "colormap" = current.colormap
        ? "colormap"
        : current.color
          ? "solid"
          : "colormap";

      const tabs = el(
        "div",
        `display:flex;gap:0;margin-bottom:18px;border-bottom:1.5px solid ${BORDER_COLOR};`,
      );
      const solidTab = el(
        "button",
        [
          "flex:1",
          "padding:8px 0",
          "border:none",
          "background:none",
          "font-size:14px",
          "font-weight:600",
          "cursor:pointer",
          `font-family:${FONT}`,
          `color:${mode === "solid" ? PRIMARY_COLOR : SUBTITLE_COLOR}`,
          `border-bottom:2px solid ${mode === "solid" ? PRIMARY_COLOR : "transparent"}`,
          `transition:all ${TRANSITION}`,
        ].join(";"),
        "Solid Color",
      );
      const cmapTab = el(
        "button",
        [
          "flex:1",
          "padding:8px 0",
          "border:none",
          "background:none",
          "font-size:14px",
          "font-weight:600",
          "cursor:pointer",
          `font-family:${FONT}`,
          `color:${mode === "colormap" ? PRIMARY_COLOR : SUBTITLE_COLOR}`,
          `border-bottom:2px solid ${mode === "colormap" ? PRIMARY_COLOR : "transparent"}`,
          `transition:all ${TRANSITION}`,
        ].join(";"),
        "Gradient / Colormap",
      );
      tabs.appendChild(solidTab);
      tabs.appendChild(cmapTab);
      card.appendChild(tabs);

      // ── Solid panel ──
      const solidPanel = el("div", mode === "solid" ? "" : "display:none;");
      // Color swatch + input
      const solidRow = el(
        "div",
        "display:flex;align-items:center;gap:10px;margin-bottom:10px;",
      );
      const swatch = el(
        "div",
        [
          "width:28px",
          "height:28px",
          "border-radius:6px",
          `background:${current.color || "#e74c3c"}`,
          `border:1.5px solid ${BORDER_COLOR}`,
          "cursor:pointer",
          "flex-shrink:0",
        ].join(";"),
      );
      const colorInput = el(
        "input",
        [
          "width:90px",
          "box-sizing:border-box",
          `background:${INPUT_BG}`,
          `border:1.5px solid ${BORDER_COLOR}`,
          "border-radius:6px",
          "padding:5px 8px",
          "font-size:13px",
          "font-family:monospace",
          `color:${TEXT_COLOR}`,
          "outline:none",
        ].join(";"),
      ) as HTMLInputElement;
      colorInput.type = "text";
      colorInput.value = current.color || "#e74c3c";
      colorInput.addEventListener("input", () => {
        const v = colorInput.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(v)) swatch.style.background = v;
      });
      swatch.addEventListener("click", () => {
        showColorPopup(swatch, (c: string) => {
          colorInput.value = c;
          swatch.style.background = c;
        });
      });
      const colorLabel = el(
        "div",
        `font-size:13px;color:${TEXT_COLOR};min-width:80px;font-weight:500;`,
        "Color",
      );
      solidRow.appendChild(colorLabel);
      solidRow.appendChild(swatch);
      solidRow.appendChild(colorInput);
      solidPanel.appendChild(solidRow);
      card.appendChild(solidPanel);

      // ── Colormap panel ──
      const cmapPanel = el("div", mode === "colormap" ? "" : "display:none;");

      const COLORMAPS = [
        {
          name: "coolwarm",
          colors: ["#3b4cc0", "#89c7ec", "#ffa688", "#b50026"],
        },
        {
          name: "viridis",
          colors: ["#440154", "#31688e", "#35b779", "#fde724"],
        },
        {
          name: "plasma",
          colors: ["#0d0887", "#7001a8", "#dd5e66", "#f0f921"],
        },
        {
          name: "magma",
          colors: ["#000004", "#65156e", "#f3685b", "#fcfdbf"],
        },
        {
          name: "Spectral",
          colors: ["#9e0142", "#fdae61", "#66c2a5", "#5e4fa2"],
        },
        {
          name: "flare",
          colors: ["#f27a5a", "#ffa475", "#ffd48e", "#fff8a0"],
        },
        {
          name: "rocket",
          colors: ["#03051a", "#86298d", "#f194b4", "#ffeea8"],
        },
        {
          name: "frost-coral",
          colors: ["#dfe4ea", "#ff4757"],
        },
        {
          name: "frost-indigo",
          colors: ["#dfe4ea", "#3742fa"],
        },
        {
          name: "silver-crimson",
          colors: ["#bdc3c7", "#c0392b"],
        },
        {
          name: "silver-teal",
          colors: ["#bdc3c7", "#16a085"],
        },
        {
          name: "silver-purple",
          colors: ["#bdc3c7", "#8e44ad"],
        },
      ];

      let selectedCmap = current.colormap || "coolwarm";

      cmapPanel.appendChild(
        el(
          "div",
          `font-size:12px;color:${SUBTITLE_COLOR};margin-bottom:8px;`,
          "Select colormap",
        ),
      );

      const cmapList = el(
        "div",
        "display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;",
      );
      const cmapRows: { name: string; row: HTMLElement }[] = [];
      for (const cm of COLORMAPS) {
        const row = el(
          "div",
          [
            "display:flex",
            "align-items:center",
            "gap:10px",
            "padding:6px 10px",
            "border-radius:8px",
            `border:1.5px solid ${cm.name === selectedCmap ? PRIMARY_COLOR : BORDER_COLOR}`,
            `background:${cm.name === selectedCmap ? "rgba(0,122,255,0.06)" : "transparent"}`,
            "cursor:pointer",
            `transition:all ${TRANSITION}`,
          ].join(";"),
        );
        const gradient = el(
          "div",
          [
            "flex:1",
            "height:20px",
            "border-radius:4px",
            `background:linear-gradient(to right, ${cm.colors.join(", ")})`,
          ].join(";"),
        );
        const nameEl = el(
          "div",
          `font-size:12px;color:${TEXT_COLOR};min-width:70px;font-weight:500;`,
          cm.name,
        );
        row.appendChild(nameEl);
        row.appendChild(gradient);
        cmapRows.push({ name: cm.name, row });
        row.addEventListener("click", () => {
          selectedCmap = cm.name;
          for (const cr of cmapRows) {
            cr.row.style.borderColor =
              cr.name === selectedCmap ? PRIMARY_COLOR : BORDER_COLOR;
            cr.row.style.background =
              cr.name === selectedCmap ? "rgba(0,122,255,0.06)" : "transparent";
          }
        });
        cmapList.appendChild(row);
      }
      cmapPanel.appendChild(cmapList);

      // Auto range checkbox
      let autoRange = !current.range;
      const autoRow = el(
        "div",
        "display:flex;align-items:center;gap:8px;margin-bottom:8px;",
      );
      const autoCb = document.createElement("input");
      autoCb.type = "checkbox";
      autoCb.checked = autoRange;
      autoCb.style.cssText = `width:15px;height:15px;cursor:pointer;accent-color:${PRIMARY_COLOR};flex-shrink:0;`;
      const autoLabel = el(
        "label",
        `font-size:12px;color:${TEXT_COLOR};cursor:pointer;user-select:none;`,
        "Auto range",
      );
      autoLabel.addEventListener("click", () => {
        autoCb.checked = !autoCb.checked;
        autoCb.dispatchEvent(new Event("change"));
      });
      autoRow.appendChild(autoCb);
      autoRow.appendChild(autoLabel);
      cmapPanel.appendChild(autoRow);

      // Range inputs
      const rangeRow = el(
        "div",
        `display:flex;align-items:center;gap:10px;margin-bottom:8px;opacity:${autoRange ? "0.35" : "1"};transition:opacity 0.15s;`,
      );
      const rangeLbl = el(
        "div",
        `font-size:12px;color:${SUBTITLE_COLOR};min-width:46px;`,
        "Range",
      );
      const minInput = el(
        "input",
        [
          "width:70px",
          "box-sizing:border-box",
          `background:${INPUT_BG}`,
          `border:1.5px solid ${BORDER_COLOR}`,
          "border-radius:6px",
          "padding:5px 8px",
          "font-size:13px",
          "font-family:monospace",
          `color:${TEXT_COLOR}`,
          "outline:none",
        ].join(";"),
      ) as HTMLInputElement;
      minInput.type = "number";
      minInput.placeholder = "min";
      minInput.value = current.range ? String(current.range[0]) : "0";
      minInput.disabled = autoRange;
      const dash = el("div", `font-size:14px;color:${SUBTITLE_COLOR};`, "–");
      const maxInput = el(
        "input",
        [
          "width:70px",
          "box-sizing:border-box",
          `background:${INPUT_BG}`,
          `border:1.5px solid ${BORDER_COLOR}`,
          "border-radius:6px",
          "padding:5px 8px",
          "font-size:13px",
          "font-family:monospace",
          `color:${TEXT_COLOR}`,
          "outline:none",
        ].join(";"),
      ) as HTMLInputElement;
      maxInput.type = "number";
      maxInput.placeholder = "max";
      maxInput.value = current.range ? String(current.range[1]) : "1";
      maxInput.disabled = autoRange;

      autoCb.addEventListener("change", () => {
        autoRange = autoCb.checked;
        minInput.disabled = autoRange;
        maxInput.disabled = autoRange;
        rangeRow.style.opacity = autoRange ? "0.35" : "1";
      });

      rangeRow.appendChild(rangeLbl);
      rangeRow.appendChild(minInput);
      rangeRow.appendChild(dash);
      rangeRow.appendChild(maxInput);
      cmapPanel.appendChild(rangeRow);

      card.appendChild(cmapPanel);

      // Tab switching
      const switchTab = (newMode: "solid" | "colormap") => {
        mode = newMode;
        solidPanel.style.display = mode === "solid" ? "" : "none";
        cmapPanel.style.display = mode === "colormap" ? "" : "none";
        solidTab.style.color =
          mode === "solid" ? PRIMARY_COLOR : SUBTITLE_COLOR;
        solidTab.style.borderBottomColor =
          mode === "solid" ? PRIMARY_COLOR : "transparent";
        cmapTab.style.color =
          mode === "colormap" ? PRIMARY_COLOR : SUBTITLE_COLOR;
        cmapTab.style.borderBottomColor =
          mode === "colormap" ? PRIMARY_COLOR : "transparent";
      };
      solidTab.addEventListener("click", () => switchTab("solid"));
      cmapTab.addEventListener("click", () => switchTab("colormap"));

      const btnRow = el(
        "div",
        "display:flex;justify-content:flex-end;gap:10px;margin-top:20px;",
      );
      const cancelBtn = secondaryBtn("Cancel");
      const okBtn = primaryBtn("Apply");
      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(okBtn);
      card.appendChild(btnRow);

      const done = async (
        value: {
          mode: "solid" | "colormap";
          color?: string;
          colormap?: string;
          range?: [number, number];
        } | null,
      ) => {
        await animateOut(backdrop, card);
        resolve(value);
      };

      cancelBtn.addEventListener("click", () => done(null));
      okBtn.addEventListener("click", () => {
        if (mode === "solid") {
          const c = colorInput.value.trim();
          done({
            mode: "solid",
            color: /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : "#e74c3c",
          });
        } else {
          done({
            mode: "colormap",
            colormap: selectedCmap,
            range: autoRange
              ? undefined
              : [
                  parseFloat(minInput.value) || 0,
                  parseFloat(maxInput.value) || 1,
                ],
          });
        }
      });
      backdrop.addEventListener("mousedown", (e) => {
        if (e.target === backdrop) done(null);
      });
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          document.removeEventListener("keydown", onKey);
          done(null);
        }
      };
      document.addEventListener("keydown", onKey);
    });
  }
}
