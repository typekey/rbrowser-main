// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildPublishScoreDiamonds } from '../../export/publish-diamonds';
describe('publication score diamonds', () => {
 const records = [{ start: 10, end: 11, score: 0.92, strand: '+' }, { start: 90, end: 91, score: 0.1, strand: '-' }];
 const domain = { start: 0, end: 50 };
 const layout = { width: 600, top: 8, height: 30, size: 0.8 };
 const colors = { colormap: 'viridis', min: 0, max: 1, alpha: 0.9 };
 const parse = (svg: string) => new DOMParser().parseFromString(`<svg>${svg}</svg>`, 'image/svg+xml');
 it('colors visible measurements with their colormap, preserves true base centers and strand', () => {
  const doc = parse(buildPublishScoreDiamonds(records, domain, layout, colors));
  expect(doc.querySelectorAll('[data-score-diamond]')).toHaveLength(1);
  expect(doc.querySelector('g')?.getAttribute('opacity')).toBe('0.9');
  expect(doc.querySelector('path')?.getAttribute('d')).toMatch(/^M126,11 /);
  expect(doc.querySelector('path')?.getAttribute('fill')).not.toBe('rgb(128,128,128)');
  expect(doc.querySelector('path[stroke="white"]')).not.toBeNull();
 });
 it('reverses colors without moving the measured site', () => {
  const normal=parse(buildPublishScoreDiamonds(records,domain,layout,colors)).querySelector('path')!;
  const reversed=parse(buildPublishScoreDiamonds(records,domain,layout,{...colors,reversed:true})).querySelector('path')!;
  expect(normal.getAttribute('fill')).not.toBe(reversed.getAttribute('fill'));
  expect(normal.getAttribute('d')).toBe(reversed.getAttribute('d'));
 });
 it('does not invent a numerical color for missing scores', () => {
  const doc=parse(buildPublishScoreDiamonds([{start:10,end:11}],domain,layout,colors));
  expect(doc.querySelector('path')?.getAttribute('fill')).toBe('rgb(128,128,128)');
 });
});
