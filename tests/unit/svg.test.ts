// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cloneDiagram } from '../../src/svg';

function source(): SVGSVGElement {
  const host = document.createElement('div');
  host.innerHTML = `<svg id="chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" style="max-width:800px" aria-labelledby="title desc">
    <style>#chart {fill:#fff} #chart .edge {marker-end:url(#arrow)} #chart-long {fill:red}</style>
    <title id="title">Diagram</title><desc id="desc">Description</desc>
    <defs><marker id="arrow"/></defs><path class="edge" marker-end="url(#arrow)"/>
    <a href="#title" onclick="bad()"><text>Label</text></a></svg>`;
  return host.querySelector('svg')!;
}

describe('diagram cloning', () => {
  it('preserves the original and assigns unique IDs for every viewer', () => {
    const original = source();
    const before = original.outerHTML;
    const first = cloneDiagram(original).svg;
    const second = cloneDiagram(original).svg;
    expect(first.id).not.toBe(original.id);
    expect(first.id).not.toBe(second.id);
    expect(original.outerHTML).toBe(before);
  });
  it('remaps marker, CSS, href, and accessible name references together', () => {
    const svg = cloneDiagram(source()).svg;
    const marker = svg.querySelector('marker')!.id;
    const title = svg.querySelector('title')!.id;
    expect(svg.querySelector('path')!.getAttribute('marker-end')).toBe(`url(#${marker})`);
    expect(svg.querySelector('style')!.textContent).toContain(`#${svg.id} .edge {marker-end:url(#${marker})}`);
    expect(svg.querySelector('style')!.textContent).toContain('fill:#fff');
    expect(svg.querySelector('style')!.textContent).toContain('#chart-long');
    expect(svg.querySelector('a')!.getAttribute('href')).toBe(`#${title}`);
    expect(svg.getAttribute('aria-labelledby')).toBe(`${title} ${svg.querySelector('desc')!.id}`);
  });
  it('preserves colors and external fragments that happen to match IDs', () => {
    const original = source();
    original.insertAdjacentHTML('beforeend', '<rect id="abc" fill="#abc" style="stroke:#abc;fill:url(#abc)"/><a href="https://example.com/#abc"/>');
    original.querySelector('style')!.textContent += ' #abc {fill:#abc;stroke:url(#abc)}';
    const svg = cloneDiagram(original).svg;
    const rect = svg.querySelector('rect')!;
    expect(rect.getAttribute('fill')).toBe('#abc');
    expect(rect.getAttribute('style')).toBe(`stroke:#abc;fill:url(#${rect.id})`);
    expect(svg.querySelector('style')!.textContent).toContain(`#${rect.id} {fill:#abc;stroke:url(#${rect.id})}`);
    expect(svg.querySelector('a[href^="https"]')!.getAttribute('href')).toBe('https://example.com/#abc');
  });
  it('does not clone inline handlers or source hiding class', () => {
    const original = source();
    original.classList.add('mn-source-hidden');
    const svg = cloneDiagram(original).svg;
    expect(svg.querySelector('[onclick]')).toBeNull();
    expect(svg.classList.contains('mn-source-hidden')).toBe(false);
    expect(svg.style.maxWidth).toBe('none');
  });
});
