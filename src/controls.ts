export function button(parent: HTMLElement, label: string, text: string, action: () => void): HTMLButtonElement {
  const el = parent.ownerDocument.createElement('button');
  el.type = 'button';
  el.className = 'mn-button';
  el.textContent = text;
  el.setAttribute('aria-label', label);
  el.title = label;
  el.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); action(); });
  parent.append(el);
  return el;
}
