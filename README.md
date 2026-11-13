# @rbrowser/main

> RBrowser — a novel RNA-centric genomic data exploration platform.

RBrowser is a WebGL-accelerated transcript browser that renders genomic
annotation tracks (transcripts, exons, splice junctions, coverage, alignments)
directly in the browser. It ships both a headless renderer core and a complete
React-based browser UI, and reads common bioinformatics formats
(BAM/CRAM, BigWig/BigBed, BED, GFF/GTF, VCF, FASTA) client-side.

- **Package:** [`@rbrowser/main`](https://www.npmjs.com/package/@rbrowser/main)
- **License:** [MIT](./LICENSE)
- **Documentation:** https://doc.rbrowser.org/5_rbrowser_core/

## Installation

```bash
npm install @rbrowser/main
```

React 18 or 19 is a peer dependency for the full-UI entry point; the headless
renderer has no framework dependency.

```bash
npm install react react-dom
```

## Usage

### Full browser with toolbar (React bundled internally)

`mountBrowser` mounts the complete browser — toolbar, search, tracks — into a
DOM element. React is bundled internally, so consumers do **not** need to wire
up any components themselves.

```ts
import { mountBrowser } from "@rbrowser/main";

const { renderer, unmount } = mountBrowser("root");

renderer.locusManager; // current locus + navigation
renderer.channelManager; // tracks
renderer.referenceManager; // genome references

// later:
unmount();
```

```html
<div id="root"></div>
```

### Headless renderer (no framework dependency)

```ts
import { TranscriptBrowserRenderer, type ITRConfig } from "@rbrowser/main";

const config: ITRConfig = {/* renderer / reference / locus / channels … */};

const renderer = new TranscriptBrowserRenderer(config);
renderer.mount();
```

See the [API reference](https://doc.rbrowser.org/5_rbrowser_core/) for the full
surface — `TranscriptBrowserRenderer`, `ChannelManager`, `ReferenceManager`,
`HighlightManager`, `HeaderPanelManager`, and the exported config types.

## Development

```bash
npm install        # install dependencies
npm run dev        # start the demo app on http://localhost:3000
```

See the [documentation site](https://doc.rbrowser.org/5_rbrowser_core/) for the
full guides and API reference.

## License

[MIT](./LICENSE) © Zheng Lei
