import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { setCorsProxy } from "./renderer/transcript-renderer";

// Automatically route cross-origin genomic data hosts through our CORS proxy.
// Add hostnames here as needed — only these origins will be rewritten.
setCorsProxy({
  url: "https://api.rbrowser.org/api/v1/cors-proxy/",
  match: (u) =>
    /\.ucsc\.edu(\/|$)/.test(u) ||
    /(^|\/\/)([^/]+\.)?encodeproject\.org(\/|$)/.test(u),
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
