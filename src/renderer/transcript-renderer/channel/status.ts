/**
 * Channel status enumeration
 */
export enum ChannelStatus {
  init = "INIT",
  Loading = "LOADING",
  Loaded = "LOADED",
  Completed = "COMPLETED",
  Error = "ERROR",
  uploading = "UPLOADING",
  uploaded = "UPLOADED",
}

/**
 * Channel error details
 */
export interface ChannelError {
  message: string;
  code?: string;
  stack?: string;
}

/**
 * Channel state
 */
export interface IChannelState {
  status: ChannelStatus;
  error?: ChannelError;
  loadedRecords?: number;
}
