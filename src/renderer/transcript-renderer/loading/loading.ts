import { LoadingStatus, LoadingPosition, LoadingLogoSize } from "./types";

// Vite resolves new URL() statically and includes the asset in the bundle
const loadingSvgUrl = new URL(
  "../assets/img/loading-ring-blue-white.svg",
  import.meta.url,
).href;

const FADE_DURATION_MS = 300;

const sizeMap: Record<LoadingLogoSize, number> = {
  small: 14,
  middle: 20,
  large: 28,
};

// CSS keyframes injected once (only needed for "css" mode)
let styleInjected = false;
function ensureStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
@keyframes tr-spin {
  to { transform: rotate(360deg); }
}`;
  document.head.appendChild(style);
}

export class LoadingRenderer {
  private el: HTMLDivElement; // wrapper: position + opacity
  private imgEl: HTMLImageElement | null = null;
  private errorLabel: HTMLDivElement; // error message text, always in DOM
  private status: LoadingStatus | null = null;
  private hideTimer: number | null = null;
  private logoType: "css" | "svg";

  constructor(
    trackContainer: HTMLElement,
    position: LoadingPosition = "rightBottom",
    size: LoadingLogoSize = "small",
    logoType: "css" | "svg" = "svg",
  ) {
    this.logoType = logoType;
    if (logoType === "css") ensureStyles();
    this.errorLabel = this.createErrorLabel();
    this.el = this.createElement(position, size);
    // Both always in DOM at opacity:0
    trackContainer.appendChild(this.errorLabel);
    trackContainer.appendChild(this.el);
  }

  private createErrorLabel(): HTMLDivElement {
    const label = document.createElement("div");
    label.style.cssText = [
      "position:absolute",
      "inset:0",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "font-size:12px",
      "color:#d32f2f",
      "pointer-events:none",
      "user-select:none",
      "font-family:Calibre,Roboto,Helvetica,sans-serif",
      "opacity:0",
      `transition:opacity ${FADE_DURATION_MS}ms ease-in-out`,
    ].join(";");
    return label;
  }

  private createElement(
    position: LoadingPosition,
    size: LoadingLogoSize,
  ): HTMLDivElement {
    const px = sizeMap[size];

    // Wrapper: handles position anchor + opacity transition only
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.zIndex = "1000";
    el.style.pointerEvents = "none";
    el.style.width = `${px}px`;
    el.style.height = `${px}px`;
    el.style.opacity = "0";
    el.style.transition = `opacity ${FADE_DURATION_MS}ms ease-in-out`;

    const offset = "6px";
    switch (position) {
      case "rightBottom":
        el.style.right = offset;
        el.style.bottom = offset;
        break;
      case "rightTop":
        el.style.right = offset;
        el.style.top = offset;
        break;
      case "leftTop":
        el.style.left = offset;
        el.style.top = offset;
        break;
      case "leftBottom":
        el.style.left = offset;
        el.style.bottom = offset;
        break;
      case "left":
        el.style.left = offset;
        el.style.top = `calc(50% - ${px / 2}px)`;
        break;
      case "right":
        el.style.right = offset;
        el.style.top = `calc(50% - ${px / 2}px)`;
        break;
    }

    if (this.logoType === "svg") {
      // SVG mode: <img> element — SMIL animations run natively in SVG document
      const img = document.createElement("img");
      img.src = loadingSvgUrl;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.display = "block";
      img.draggable = false;
      el.appendChild(img);
      this.imgEl = img;
    } else {
      // CSS mode: border-spinner — no external assets needed
      const thickness = Math.max(2, Math.round(px / 5));
      el.style.boxSizing = "border-box";
      el.style.borderRadius = "50%";
      el.style.border = `${thickness}px solid rgba(25, 118, 210, 0.25)`;
      el.style.borderTopColor = "#1976d2";
      el.style.animation = "tr-spin 0.75s linear infinite";
    }

    return el;
  }

  setStatus(status: LoadingStatus, errorMessage?: string) {
    if (this.status === status && status !== LoadingStatus.Error) return;
    this.status = status;

    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    switch (status) {
      case LoadingStatus.Loading:
      case LoadingStatus.Loaded:
        // Restore normal appearance and fade in
        if (this.imgEl) this.imgEl.style.filter = "";
        else this.el.style.borderTopColor = "#1976d2";
        this.el.style.opacity = "1";
        this.errorLabel.style.opacity = "0";
        break;

      case LoadingStatus.Completed:
        // Fade out only — position never changes
        this.el.style.opacity = "0";
        this.errorLabel.style.opacity = "0";
        break;

      case LoadingStatus.Error: {
        // Hide spinner, keep error message visible permanently
        this.el.style.opacity = "0";
        if (errorMessage) {
          this.errorLabel.textContent = errorMessage;
          this.errorLabel.style.opacity = "1";
        }
        break;
      }
    }
  }

  destroy() {
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.errorLabel.remove();
    this.el.remove();
  }
}
