import { SequentialScale, type ColorMapName } from "../colors/colors";

/** Score-driven sites need the same palette as their legend, even without colorBy. */
export function buildPublishScoreDiamonds(
  records: Array<{
    start?: number;
    end?: number;
    chromStart?: number;
    chromEnd?: number;
    score?: number;
    strand?: string | number;
  }>,
  domain: { start: number; end: number },
  layout: { width: number; top: number; height: number; size: number },
  colors: {
    colormap: string;
    min: number;
    max: number;
    reversed?: boolean;
    alpha?: number;
  },
): string {
  const scale = new SequentialScale(
    colors.colormap as ColorMapName,
    colors.reversed ? [colors.max, colors.min] : [colors.min, colors.max],
  );
  const h = (layout.height * layout.size) / 2;
  const w = h * 0.7;
  const cy = layout.top + layout.height / 2;
  const f = (v: number) => String(Math.round(v * 100) / 100);
  return records
    .filter(
      (record) =>
        (record.chromEnd ?? record.end ?? 0) > domain.start &&
        (record.chromStart ?? record.start ?? 0) < domain.end,
    )
    .map((record) => {
      const start = record.chromStart ?? record.start ?? 0;
      const end = record.chromEnd ?? record.end ?? start + 1;
      const cx =
        (((start + end) / 2 - domain.start) / (domain.end - domain.start)) *
        layout.width;
      const rgb = Number.isFinite(record.score)
        ? scale.getColor(record.score!)
        : [0.5, 0.5, 0.5];
      const fill = `rgb(${rgb.map((c) => Math.round(c * 255)).join(",")})`;
      const top = `${f(cx)},${f(cy - h)}`,
        right = `${f(cx + w)},${f(cy)}`,
        bottom = `${f(cx)},${f(cy + h)}`,
        left = `${f(cx - w)},${f(cy)}`;
      const reverse =
        record.strand === "-" || record.strand === -1 || record.strand === "-1";
      const forward =
        record.strand === "+" || record.strand === 1 || record.strand === "1";
      return `<g opacity="${Math.max(0, Math.min(1, colors.alpha ?? 1))}" data-score-diamond="true"><path d="M${top} L${right} ${bottom} ${left} Z" fill="${fill}"/><path d="M${top} L${left} ${f(cx)},${f(cy)} Z" fill="white" fill-opacity="0.3"/><path d="M${right} L${bottom} ${f(cx)},${f(cy)} Z" fill="black" fill-opacity="0.18"/>${forward || reverse ? `<path d="M${f(cx + (reverse ? 2 : -2))},${f(cy - 3)} l${reverse ? -3 : 3},3 l${reverse ? 3 : -3},3" fill="none" stroke="white" stroke-width="1.2"/>` : ""}</g>`;
    })
    .join("\n");
}
