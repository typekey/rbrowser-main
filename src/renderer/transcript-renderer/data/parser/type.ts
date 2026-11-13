export interface IFetchOpts {
  chr: string;
  start: number;
  end: number;
  /** Zoom/resolution scale passed to BigWig/BigBed getFeatures (0 < scale ≤ 1). */
  scale?: number;
  formatter?: any;
}
