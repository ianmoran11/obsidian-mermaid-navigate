import type { Size } from './geometry';

let nextId = 0;
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Clone rather than reparent Obsidian's SVG: its renderer retains ownership. */
export function cloneDiagram(source: SVGSVGElement): { svg: SVGSVGElement; size: Size } {
  const svg = source.cloneNode(true) as SVGSVGElement;
  const prefix = `mn-${++nextId}-`;
  const ids = new Map<string, string>();
  const elements = [svg, ...Array.from(svg.querySelectorAll('*'))];
  for (const el of elements) {
    if (el.id) ids.set(el.id, prefix + el.id);
  }
  const pattern = ids.size ? new RegExp(`#(${Array.from(ids.keys()).sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})(?![\\w-])`, 'g') : null;
  const rewriteSelector = (value: string): string => pattern ? value.replace(pattern, (_, id: string) => `#${ids.get(id)}`) : value;
  // Only local URL references, never colours or external URL fragments.
  const rewriteUrls = (value: string): string => value.replace(/url\(\s*(['"]?)#([^'"\s)]+)\1\s*\)/g,
    (match, quote: string, id: string) => ids.has(id) ? `url(${quote}#${ids.get(id)}${quote})` : match);
  for (const el of elements) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === 'id') el.id = ids.get(attr.value) ?? attr.value;
      else if (attr.name === 'aria-labelledby' || attr.name === 'aria-describedby') {
        el.setAttribute(attr.name, attr.value.split(/\s+/).map(id => ids.get(id) ?? id).join(' '));
      } else if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else {
        const value = attr.localName === 'href' && attr.value.startsWith('#')
          ? `#${ids.get(attr.value.slice(1)) ?? attr.value.slice(1)}`
          : rewriteUrls(attr.value);
        // Leave untouched attributes alone (notably HTML xmlns in foreignObject).
        if (value !== attr.value) el.setAttributeNS(attr.namespaceURI, attr.name, value);
      }
    }
    if (el.tagName.toLowerCase() === 'style') {
      el.textContent = rewriteUrls((el.textContent ?? '').replace(/([^{}]+)\{/g, (_, selector: string) => `${rewriteSelector(selector)}{`));
    }
  }
  const box = source.viewBox?.baseVal;
  const rect = source.getBoundingClientRect();
  const size = {
    width: box?.width || source.width?.baseVal?.value || rect.width || 800,
    height: box?.height || source.height?.baseVal?.value || rect.height || 400,
  };
  svg.setAttribute('width', String(size.width));
  svg.setAttribute('height', String(size.height));
  svg.style.setProperty('width', `${size.width}px`, 'important');
  svg.style.setProperty('height', `${size.height}px`, 'important');
  svg.style.setProperty('max-width', 'none', 'important');
  svg.style.setProperty('max-height', 'none', 'important');
  svg.classList.remove('mn-source-hidden');
  return { svg, size };
}
