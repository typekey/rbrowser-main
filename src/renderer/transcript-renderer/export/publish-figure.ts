/** Publication framing, independent of the live canvas and channel plot types. */
export interface PublishTrackFragment {
  innerSvg: string;
  width: number;
  height: number;
  label: string;
  group?: string;
}

export interface PublishAxis {
  mode: "RNA" | "DNA" | "CDS";
  /** Coordinates in the same display space as the captured channel bodies. */
  start: number;
  end: number;
  /** TSS in RNA mode, start codon in CDS mode. DNA labels are one based. */
  origin: number;
  strand: "+" | "-";
  band?: { start: number; end: number; color: string };
}

export interface PublishFigureInput {
  title: string;
  axis: PublishAxis;
  tracks: PublishTrackFragment[];
  plotWidth: number;
  /** Already mapped into the active axis space. */
  highlights?: Array<{ start: number; end: number; color: string }>;
}

const f = (n: number) => String(Math.round(n * 100) / 100);
const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const INK = "#111827";
const LABEL_SIZE = 30;

function labelLines(label: string): string[] {
  // Wrap long sample names, including unbroken identifiers; never truncate them.
  const lines: string[] = [];
  let rest = label;
  while (rest.length > 26) {
    const space = rest.lastIndexOf(" ", 26);
    const cut = space >= 12 ? space : 26;
    lines.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  lines.push(rest);
  return lines;
}

/** Sparse, mode-correct tick values. Negative strands keep genomic left-to-right geometry. */
export function publishAxisTicks(
  axis: PublishAxis,
  width: number,
): Array<{ x: number; label: string }> {
  const span = axis.end - axis.start;
  const rough = span / Math.max(2, Math.floor(width / 140));
  const power = 10 ** Math.floor(Math.log10(rough));
  const n = rough / power;
  const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * power);
  const origin = axis.mode === "DNA" ? -1 : axis.origin;
  const ticks: Array<{ x: number; label: string }> = [];
  for (
    let p = origin + Math.ceil((axis.start - origin) / step) * step;
    p <= axis.end;
    p += step
  ) {
    const x = ((p - axis.start) / span) * width;
    if (x < 10 || x > width - 10) continue;
    const offset = Math.round(
      (p - origin) * (axis.mode !== "DNA" && axis.strand === "-" ? -1 : 1),
    );
    const abs = Math.abs(offset);
    const value =
      abs >= 1000000 && abs % 1000000 === 0
        ? `${abs / 1000000}M`
        : abs >= 1000 && abs % 1000 === 0
          ? `${abs / 1000}K`
          : abs.toLocaleString("en-US");
    ticks.push({
      x,
      label: `${offset < 0 ? "-" : offset > 0 && axis.mode !== "DNA" ? "+" : ""}${value}`,
    });
  }
  return ticks;
}

/** Native feature bodies with publication typography, grouping and shared highlights. */
export function buildPublishFigureSVG(input: PublishFigureInput): string {
  const { title, axis, tracks, plotWidth } = input;
  if (
    !(plotWidth > 0) ||
    !Number.isFinite(plotWidth) ||
    !(axis.end > axis.start) ||
    !Number.isFinite(axis.end - axis.start)
  ) {
    throw new Error(
      "Publication export requires a finite, non-empty viewport.",
    );
  }
  const labels = tracks.map((t) => labelLines(t.label));
  const labelW = Math.max(
    300,
    ...labels.flat().map((s) => s.length * LABEL_SIZE * 0.56 + 20),
  );
  const plotX = 60 + labelW;
  const width = plotX + plotWidth + 24;
  const top = axis.band ? 152 : 132;
  const rows: Array<{ top: number; height: number }> = [];
  const groups: Array<{
    name: string;
    top: number;
    bottom: number;
    count: number;
  }> = [];
  let bottom = top;
  tracks.forEach((t, i) => {
    const sameGroup = i > 0 && !!t.group && t.group === tracks[i - 1].group;
    if (i && !sameGroup) bottom += 18;
    const height = Math.max(54, t.height, labels[i].length * 34 + 10);
    rows.push({ top: bottom, height });
    if (t.group) {
      if (sameGroup) {
        groups[groups.length - 1].bottom = bottom + height;
        groups[groups.length - 1].count++;
      } else
        groups.push({
          name: t.group,
          top: bottom,
          bottom: bottom + height,
          count: 1,
        });
    }
    bottom += height;
  });
  const height = bottom + 14;
  const x = (p: number) =>
    plotX +
    Math.max(
      0,
      Math.min(
        plotWidth,
        ((p - axis.start) / (axis.end - axis.start)) * plotWidth,
      ),
    );
  const text = (
    xx: number,
    yy: number,
    value: string,
    size: number,
    attrs = "",
  ) =>
    `<text x="${f(xx)}" y="${f(yy)}" font-size="${size}" ${attrs}>${esc(value)}</text>`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${f(width)}" height="${f(height)}" viewBox="0 0 ${f(width)} ${f(height)}" font-family="Arial, Helvetica, sans-serif" fill="${INK}" data-theme="publish">`,
    `<rect width="100%" height="100%" fill="white"/>`,
    text(
      plotX + plotWidth / 2,
      30,
      title,
      28,
      'text-anchor="middle" font-weight="700"',
    ),
    text(
      plotX + plotWidth / 2,
      64,
      axis.mode === "RNA"
        ? "RNA Mode · position from TSS"
        : axis.mode === "CDS"
          ? "CDS Mode · position from start codon"
          : "DNA Mode · chromosome position",
      24,
      'text-anchor="middle"',
    ),
    `<path d="M${f(plotX)},108 H${f(plotX + plotWidth)}" fill="none" stroke="${INK}" stroke-width="1.5"/>`,
  ];
  for (const tick of publishAxisTicks(axis, plotWidth)) {
    const xx = plotX + tick.x;
    svg.push(
      `<path d="M${f(xx)},99 V108" stroke="${INK}" stroke-width="1.4"/>`,
      text(
        xx,
        92,
        tick.label,
        23,
        `text-anchor="${tick.x < 50 ? "start" : tick.x > plotWidth - 50 ? "end" : "middle"}" data-axis="${axis.mode}"`,
      ),
    );
  }
  if (axis.band && axis.band.end > axis.start && axis.band.start < axis.end) {
    svg.push(
      `<rect x="${f(x(axis.band.start))}" y="117" width="${f(x(axis.band.end) - x(axis.band.start))}" height="18" fill="${esc(axis.band.color)}" fill-opacity="0.35" data-transcript-band="true"/>`,
    );
  }
  tracks.forEach((t, i) => {
    const row = rows[i];
    svg.push(
      `<g data-publish-track="${esc(t.label)}">`,
      `<rect x="${f(plotX)}" y="${f(row.top)}" width="${f(plotWidth)}" height="${f(row.height)}" fill="#f2f9fb"/>`,
      // Nested SVG clips every native body and isolates its coordinate system.
      `<svg x="${f(plotX)}" y="${f(row.top + (row.height - t.height) / 2)}" width="${f(plotWidth)}" height="${f(t.height)}" viewBox="0 0 ${f(t.width)} ${f(t.height)}" preserveAspectRatio="none" overflow="hidden">${t.innerSvg}</svg>`,
      `<path d="M${f(plotX)},${f(row.top + row.height)} H${f(plotX + plotWidth)}" stroke="#707b87" stroke-width="1"/>`,
    );
    labels[i].forEach((label, j) =>
      svg.push(
        text(
          plotX - 18,
          row.top + row.height / 2 + (j - (labels[i].length - 1) / 2) * 34 + 10,
          label,
          LABEL_SIZE,
          'text-anchor="end"',
        ),
      ),
    );
    svg.push("</g>");
  });
  for (const group of groups) {
    if (group.count < 2) continue;
    const middle = (group.top + group.bottom) / 2;
    svg.push(
      `<path d="M49,${f(group.top + 3)} H41 V${f(group.bottom - 3)} H49" fill="none" stroke="${INK}" stroke-width="1.4"/>`,
      text(
        20,
        middle,
        group.name,
        Math.min(
          22,
          (group.bottom - group.top - 8) /
            Math.max(1, group.name.length) /
            0.55,
        ),
        `text-anchor="middle" transform="rotate(-90 20 ${f(middle)})" data-group="true"`,
      ),
    );
  }
  for (const highlight of input.highlights ?? []) {
    const left = Math.max(axis.start, highlight.start),
      right = Math.min(axis.end, highlight.end);
    if (!(right > left) || !tracks.length) continue;
    svg.push(
      `<rect x="${f(x(left))}" y="${top}" width="${f(x(right) - x(left))}" height="${f(bottom - top)}" fill="${esc(highlight.color)}" fill-opacity="0.1" stroke="${esc(highlight.color)}" stroke-width="1" data-publish-highlight="true"/>`,
    );
  }
  svg.push("</svg>");
  return svg.join("\n");
}
