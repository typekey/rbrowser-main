export const COLORMAP_GRADIENTS = {
  coolwarm: [
    "#3b4cc0",
    "#4a64cb",
    "#597dd5",
    "#6896de",
    "#78afe6",
    "#89c7ec",
    "#9bddf0",
    "#aff2f2",
    "#c4ffef",
    "#d9ffe8",
    "#edfedd",
    "#fff9d0",
    "#ffe8c0",
    "#ffd4ae",
    "#ffbe9b",
    "#ffa688",
    "#ff8c75",
    "#ff7062",
    "#f94f51",
    "#ea2c41",
    "#d60a32",
    "#b50026",
  ],
  Spectral: [
    "#9e0142",
    "#b2182b",
    "#d53e4f",
    "#f46d43",
    "#fdae61",
    "#fee08b",
    "#ffffbf",
    "#e6f598",
    "#abdda4",
    "#66c2a5",
    "#3288bd",
    "#5e4fa2",
  ],
  magma: [
    "#000004",
    "#0b0924",
    "#221150",
    "#410f75",
    "#65156e",
    "#8a226a",
    "#b33564",
    "#d8485c",
    "#f3685b",
    "#fd8e6e",
    "#fdb48a",
    "#fcd9ad",
    "#fcfdbf",
  ],
  flare: [
    "#f27a5a",
    "#f4805e",
    "#f68662",
    "#f88c66",
    "#fa926a",
    "#fc986e",
    "#fd9e71",
    "#ffa475",
    "#ffaa78",
    "#ffb07c",
    "#ffb67f",
    "#ffbc82",
    "#ffc285",
    "#ffc888",
    "#ffce8b",
    "#ffd48e",
    "#ffda91",
    "#ffe094",
    "#ffe697",
    "#ffec9a",
    "#fff29d",
    "#fff8a0",
  ],
  rocket: [
    "#03051a",
    "#1b0c3c",
    "#3f0f5e",
    "#631879",
    "#86298d",
    "#a63f9d",
    "#c358a9",
    "#dc75b1",
    "#f194b4",
    "#ffb3b3",
    "#ffd1af",
    "#ffeea8",
  ],
  viridis: [
    "#440154",
    "#482878",
    "#3e4a89",
    "#31688e",
    "#26828e",
    "#1f9e89",
    "#35b779",
    "#6ece58",
    "#b5de2b",
    "#fde724",
  ],
  plasma: [
    "#0d0887",
    "#2e0594",
    "#47039f",
    "#5c01a6",
    "#7001a8",
    "#8305a7",
    "#9512a1",
    "#a72197",
    "#b6308b",
    "#c5407e",
    "#d14e72",
    "#dd5e66",
    "#e76e5b",
    "#ef7f4f",
    "#f59044",
    "#f9a238",
    "#fcb42c",
    "#fdc626",
    "#fbd824",
    "#f0f921",
  ],
  "frost-coral": [
    "#dfe4ea",
    "#e4ced5",
    "#e8b7c0",
    "#eda1ab",
    "#f18a96",
    "#f67481",
    "#fa5d6c",
    "#ff4757",
  ],
  "frost-indigo": [
    "#dfe4ea",
    "#c7cdec",
    "#afb6ef",
    "#979ef1",
    "#7f87f3",
    "#6770f5",
    "#4f59f8",
    "#3742fa",
  ],
  "silver-crimson": [
    "#bdc3c7",
    "#bdafb1",
    "#be9c9a",
    "#be8884",
    "#bf746e",
    "#bf6157",
    "#c04d41",
    "#c0392b",
  ],
  "silver-teal": [
    "#bdc3c7",
    "#a5bebe",
    "#8db9b4",
    "#75b4ab",
    "#5eafa1",
    "#46aa98",
    "#2ea58e",
    "#16a085",
  ],
  "silver-purple": [
    "#bdc3c7",
    "#b6b1c3",
    "#b09fc0",
    "#a98cbc",
    "#a27ab8",
    "#9b68b4",
    "#9556b1",
    "#8e44ad",
  ],
};

export interface IRegion {
  chr?: string;
  start: number;
  end: number;
  offset?: number;
  strand?: "+" | "-";
  gene_id?: string;
  trans_id?: string;
  trans_name?: string;
  trans_type?: string;
  have_offset?: boolean;
}

export interface IRenderParams {
  cellWidth: number;
  featureLeft: number;
  featureTop?: number; // top position of the feature
  screenWidth: number;
  minRectWidth?: number; // minimum rect width, keeps signals visible
  trackHeight?: number; // feature height, used to compute bar height
  paddingBottom?: number; // bottom padding of the feature
  plot?: string; // render type; decides whether special handling is needed
  color?: string | string[] | { [key: string]: string }; // single color, array, or colormap name
}

export interface IAnnotation {
  keys?: string[];
  order?: string[];
  expand?: string | boolean;
  colors?: string[] | { [key: string]: string } | string;
  sep?: string;
}

export interface IPixelCoords {
  x: number[]; // render X coordinates (pixel positions)
  y: number[]; // render Y coordinates (pixel; bar plot: bottom position)
  width: number[]; // render width (minRectWidth applied)
  height: number[]; // render height (bar plot only; precomputed in worker)
  colors: string[]; // render colors (precomputed in worker)
  flank: number[]; // -1: left screen, 0: current screen, 1: right screen
}

export interface IWorkerMessage {
  data: any;
  type: string;
  plot: string;
  region: IRegion;
  regionData?: any;
  annotation?: IAnnotation;
  renderParams?: IRenderParams;
  // CDS mode
  axisType?: "DNA" | "RNA" | "CDS"; // current axis type
  cdsData?: { position: number[] }; // CDS position array
}

export interface IWorkerResponse {
  success: boolean;
  data?: any;
  error?: {
    message: string;
  };
}

export interface IFormatResult {
  name: string;
  size: number;
  plot: string;
  start: number[]; // genomic coordinates
  end: number[]; // genomic coordinates
  score?: number[];
  range?: [number, number];
  props?: any;
  info?: any[];
  children?: any[];
  pixelCoords?: IPixelCoords; // pixel coordinates and flank markers
  [key: string]: any;
}
