import { ChannelStatus, IChannelState } from "../channel/status";

/**
 * Status display configuration
 */
export interface StatusDisplayConfig {
  position?: "right" | "center";
  verticalAlign?: "top" | "middle" | "bottom";
  horizontalAlign?: "left" | "center" | "right";
}

/**
 * Status display component
 * Renders channel loading/error states using dynamic DOM elements
 */
export class StatusDisplay {
  private element: HTMLDivElement;
  private channelName: string;
  private config: StatusDisplayConfig;

  constructor(
    channelName: string,
    config: StatusDisplayConfig = {
      position: "right",
      verticalAlign: "middle",
    },
  ) {
    this.channelName = channelName;
    this.config = config;
    this.element = this.createStatusElement();
    // Store config for future use
    void this.channelName; // Mark as used
    void this.config; // Mark as used
  }

  private createStatusElement(): HTMLDivElement {
    const div = document.createElement("div");
    div.className = "channel-status";
    div.style.position = "absolute";
    div.style.pointerEvents = "none";
    div.style.zIndex = "1000";
    div.style.fontSize = "12px";
    div.style.fontFamily = "monospace";
    div.style.padding = "4px 8px";
    div.style.borderRadius = "4px";
    div.style.display = "none"; // Hidden by default
    return div;
  }

  /**
   * Update status display
   */
  updateStatus(state: IChannelState, _bounds: DOMRect) {
    const { status } = state;

    // Hide for loading states - let LoadingRenderer handle it
    if (
      status === ChannelStatus.Loading ||
      status === ChannelStatus.Loaded ||
      status === ChannelStatus.Completed ||
      status === ChannelStatus.init
    ) {
      this.hide();
      return;
    }

    // Show status for errors only
    if (status === ChannelStatus.Error) {
      // Error display is handled by LoadingRenderer — don't show a second overlay
      this.hide();
    } else {
      this.hide();
    }
  }

  private centerInBounds(bounds: DOMRect) {
    this.element.style.left = `${bounds.left + bounds.width / 2}px`;
    this.element.style.top = `${bounds.top + bounds.height / 2}px`;
    this.element.style.transform = "translate(-50%, -50%)";
  }

  private styleAsError(error?: { message: string }) {
    this.element.style.backgroundColor = "rgba(220, 38, 38, 0.9)";
    this.element.style.color = "#ffffff";
    this.element.style.border = "1px solid rgba(185, 28, 28, 1)";
    this.element.textContent = `ERROR: ${error?.message || "Unknown error"}`;
  }

  hide() {
    this.element.style.display = "none";
  }

  show() {
    this.element.style.display = "block";
  }

  mount(container: HTMLElement) {
    container.appendChild(this.element);
  }

  unmount() {
    if (this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }
  }

  destroy() {
    this.unmount();
  }
}
