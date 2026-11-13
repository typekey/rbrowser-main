export enum LoadingStatus {
  Loading = "LOADING",
  Loaded = "LOADED",
  Completed = "COMPLETED",
  Error = "ERROR",
}

export type LoadingPosition =
  "rightBottom" | "rightTop" | "leftTop" | "leftBottom" | "left" | "right";

export type LoadingLogoSize = "small" | "middle" | "large";

export interface ILoadingConfig {
  enabled?: boolean; // Enable/disable loading indicator (default: true)
  position?: LoadingPosition; // Position of loading indicator (default: "rightBottom")
  size?: LoadingLogoSize; // Size of loading indicator (default: "small")
  fadeOutDuration?: number; // Fade out animation duration in ms (default: 300)
  logoType?: "css" | "svg"; // Spinner style: "svg" uses SVG image, "css" uses border spinner (default: "svg")
}

export interface ILoadingState {
  status: LoadingStatus;
  progress?: number; // 0-100
  message?: string;
}
