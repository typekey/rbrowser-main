import { View } from "../../core/view";
import { defaultConfig } from "../../../../../config/default_config";

export interface AddChannelActions {
  local(files: File[]): void;
  remote(): void;
  dataHub(): void;
}

/** The final row participates in channel scrolling, without being a channel. */
export class AddChannelView extends View {
  private element: HTMLDivElement | null = null;
  private button: HTMLButtonElement | null = null;
  private menu: HTMLDivElement | null = null;
  private input: HTMLInputElement | null = null;
  private clip: { y: number; height: number } | null = null;
  private actions: AddChannelActions | null = null;

  setActions(actions: AddChannelActions): void {
    this.actions = actions;
  }
  getPreferredHeight(): number {
    return 44;
  }
  render(): void {}

  mount(container: HTMLElement): void {
    this.destroy();
    const element = document.createElement("div");
    element.className = "add-channel-row";
    Object.assign(element.style, {
      position: "absolute",
      padding: "6px 8px",
      boxSizing: "border-box",
      zIndex: "1100",
      pointerEvents: "auto",
    });
    // Keep browser pan / context-menu handlers off the controls.
    element.addEventListener("mousedown", (e) => e.stopPropagation());
    element.addEventListener("click", (e) => e.stopPropagation());
    const button = document.createElement("button");
    button.type = "button";
    button.className = "add-channel-button";
    button.textContent = "+  Add Channel";
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    Object.assign(button.style, {
      width: "100%",
      height: "32px",
      border: "1px solid #2563eb",
      borderRadius: "8px",
      background: "#fff",
      color: "#2563eb",
      font: "13px system-ui, sans-serif",
      cursor: "pointer",
    });
    button.addEventListener("click", () =>
      this.menu ? this.closeMenu() : this.openMenu(),
    );
    button.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.openMenu();
      }
    });
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = [
      ...new Set(
        defaultConfig.supportFiles.map((ext) => `.${ext.toLowerCase()}`),
      ),
    ].join(",");
    input.hidden = true;
    input.addEventListener("change", () => {
      const files = Array.from(input.files ?? []);
      input.value = "";
      if (files.length) this.actions?.local(files);
    });
    element.append(button, input);
    container.appendChild(element);
    this.element = element;
    this.button = button;
    this.input = input;
    this.updatePosition();
  }

  layout(x: number, y: number, width: number, height: number): void {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.updatePosition();
  }

  override setScrollClip(clip: { y: number; height: number } | null): void {
    this.clip = clip;
  }

  private updatePosition(): void {
    if (!this.element) return;
    const dpr = window.devicePixelRatio || 1;
    const hidden =
      this.clip &&
      (this.y + this.height <= this.clip.y ||
        this.y >= this.clip.y + this.clip.height);
    Object.assign(this.element.style, {
      left: `${this.x / dpr}px`,
      top: `${this.y / dpr}px`,
      width: `${this.width / dpr}px`,
      height: `${this.height / dpr}px`,
      visibility: hidden ? "hidden" : "visible",
      clipPath: this.clip
        ? `inset(${Math.max(0, this.clip.y - this.y) / dpr}px 0 ${Math.max(0, this.y + this.height - this.clip.y - this.clip.height) / dpr}px 0)`
        : "",
    });
    this.closeMenu();
  }

  private onOutside = (e: MouseEvent) => {
    const target = e.target as Node;
    if (!this.menu?.contains(target) && !this.element?.contains(target))
      this.closeMenu();
  };
  private onEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      this.closeMenu();
      this.button?.focus();
    }
  };
  private onViewportChange = () => this.closeMenu();

  private openMenu(): void {
    if (!this.button || this.menu) return;
    const menu = document.createElement("div");
    menu.className = "add-channel-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Add Channel");
    Object.assign(menu.style, {
      position: "fixed",
      width: "220px",
      maxWidth: "calc(100vw - 16px)",
      padding: "6px",
      border: "1px solid #cbd5e1",
      borderRadius: "9px",
      boxSizing: "border-box",
      background: "#fff",
      zIndex: "9999999",
      boxShadow: "0 6px 18px rgba(0,0,0,.16)",
    });
    const entries = [
      {
        label: "Local",
        path: "M3 7h6l2-3h5l3 3h2v13H3z",
        run: () => this.input?.click(),
      },
      {
        label: "Remote",
        path: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M2 12h20M12 2c5 5 5 15 0 20M12 2c-5 5-5 15 0 20",
        run: () => this.actions?.remote(),
      },
      {
        label: "DataHub",
        path: "M14 3h7v7M21 3l-9 9M10 5H4v15h15v-6",
        run: () => this.actions?.dataHub(),
      },
    ];
    for (const entry of entries) {
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "menuitem");
      Object.assign(item.style, {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        width: "100%",
        padding: "8px 10px",
        border: "0",
        borderRadius: "5px",
        background: "transparent",
        color: "#242a33",
        font: "13px system-ui, sans-serif",
        cursor: "pointer",
        textAlign: "left",
      });
      const icon = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("width", "18");
      icon.setAttribute("height", "18");
      icon.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("d", entry.path);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.8");
      icon.appendChild(path);
      item.append(icon, document.createTextNode(entry.label));
      item.addEventListener("mouseenter", () => {
        item.style.background = "#f1f5f9";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "transparent";
      });
      item.addEventListener("click", () => {
        this.closeMenu();
        entry.run();
      });
      item.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const items = Array.from(
          menu.querySelectorAll<HTMLButtonElement>("button"),
        );
        items[
          (items.indexOf(item) +
            (e.key === "ArrowDown" ? 1 : items.length - 1)) %
            items.length
        ].focus();
      });
      menu.appendChild(item);
    }
    document.body.appendChild(menu);
    this.menu = menu;
    this.button.setAttribute("aria-expanded", "true");
    const rect = this.button.getBoundingClientRect();
    const size = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - size.width - 8))}px`;
    menu.style.top = `${rect.bottom + size.height + 6 <= window.innerHeight - 8 ? rect.bottom + 6 : Math.max(8, rect.top - size.height - 6)}px`;
    menu.querySelector<HTMLButtonElement>("button")?.focus();
    document.addEventListener("mousedown", this.onOutside);
    document.addEventListener("keydown", this.onEscape);
    window.addEventListener("resize", this.onViewportChange);
    document.addEventListener("scroll", this.onViewportChange, true);
  }

  private closeMenu(): void {
    this.menu?.remove();
    this.menu = null;
    this.button?.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", this.onOutside);
    document.removeEventListener("keydown", this.onEscape);
    window.removeEventListener("resize", this.onViewportChange);
    document.removeEventListener("scroll", this.onViewportChange, true);
  }

  destroy(): void {
    this.closeMenu();
    this.element?.remove();
    this.element = null;
    this.button = null;
    this.input = null;
  }
}
