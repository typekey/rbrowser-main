/**
 * Renderer status enumeration
 */
export enum RendererStatus {
  init = "INIT",
  Loading = "LOADING",
  Loaded = "LOADED",
  Error = "ERROR",
  uploading = "UPLOADING",
  uploaded = "UPLOADED",
}

/**
 * Renderer error details
 */
export interface RendererError {
  message: string;
  code?: string;
  channelErrors?: { [channelIndex: number]: string };
}

/**
 * Renderer state
 */
export interface IRendererState {
  status: RendererStatus;
  error?: RendererError;
  loadedChannels?: number;
  totalChannels?: number;
}
