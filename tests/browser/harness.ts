import { DiagramEnhancer } from '../../src/enhancer';
import { DiagramViewer } from '../../src/viewer';
import { locateFence, prepareEdit } from '../../src/fences';
import type { DiagramCodeSession } from '../../src/code-editor';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" id="mermaid-test" viewBox="0 0 1200 600" style="max-width:1200px" role="img" aria-labelledby="chart-title">
<style>#mermaid-test {font:18px sans-serif} #mermaid-test .node{fill:#e7dfff;stroke:#7852ee;stroke-width:2} #mermaid-test .edge{stroke:#7852ee;stroke-width:2}</style>
<title id="chart-title">Test flowchart</title><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#7852ee"/></marker></defs>
<rect class="node" x="40" y="240" width="240" height="100" rx="15"/><text x="90" y="295">Mermaid Navigate</text>
<path class="edge" d="M280 290 L650 120" marker-end="url(#arrow)"/><path class="edge" d="M280 290 L650 440" marker-end="url(#arrow)"/>
<rect class="node" x="660" y="60" width="350" height="120" rx="15"/><foreignObject x="680" y="90" width="300" height="70"><div xmlns="http://www.w3.org/1999/xhtml">Pinch, pan, and explore</div></foreignObject>
<rect class="node" x="660" y="380" width="350" height="120" rx="15"/><text x="700" y="445">Fullscreen on your phone</text>
<a href="#example-link"><text x="720" y="560">Example link</text></a></svg>`;
const host = document.querySelector<HTMLElement>('#diagram')!;
host.innerHTML = svg;
let enhancer: DiagramEnhancer;
let modal: HTMLElement | undefined;
let viewer: DiagramViewer | undefined;
const initialCode = 'flowchart LR\n A[Mermaid Navigate] --> B[Pinch, pan, and explore]\n';
let sourceDocument = '# Before\n\n```mermaid\n' + initialCode + '```\n\nAfter text\n';
let loadFailure = false;
let delay = 0;
const open = (source: SVGSVGElement, showCode = false) => {
  modal = document.createElement('div');
  modal.className = 'modal-container mn-modal-container';
  modal.innerHTML = '<div class="modal mn-fullscreen"><div class="modal-title">Mermaid diagram</div><div class="modal-content"></div></div>';
  Object.assign(modal.style, { position: 'fixed', inset: '0', zIndex: '100' });
  document.body.append(modal);
  const close = () => {
    if (!viewer?.canClose()) return;
    document.removeEventListener('keydown', onKey);
    viewer.destroy(); modal?.remove();
  };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  const loadCode = async (): Promise<DiagramCodeSession> => {
    if (loadFailure) throw new Error('Cannot safely identify this Mermaid code block. Open its original note.');
    let snapshot = locateFence(sourceDocument, 2);
    const session: DiagramCodeSession = {
      code: snapshot.code, sourcePath: 'Example note.md',
      save: async code => {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        if (!code.startsWith('flowchart')) throw new Error('Mermaid could not render this code. Nothing was saved.');
        const prepared = prepareEdit(snapshot, sourceDocument, code);
        sourceDocument = prepared.text;
        snapshot = locateFence(sourceDocument, 2);
        session.code = snapshot.code;
        const result = source.cloneNode(true) as SVGSVGElement;
        result.querySelector('text')!.textContent = code.match(/A\[([^\]]+)\]/)?.[1] ?? 'Updated';
        return result;
      },
    };
    return session;
  };
  viewer = new DiagramViewer(modal.querySelector('.modal-content')!, source, { exit: close, loadCode });
  if (showCode) viewer.showCode();
};
enhancer = new DiagramEnhancer(document, open);
Object.assign(window, {
  harness: {
    destroy: () => enhancer.destroy(),
    source: () => sourceDocument,
    concurrentEdit: () => { sourceDocument += 'External change\n'; },
    failLoad: () => { loadFailure = true; },
    setDelay: (ms: number) => { delay = ms; },
    rerender: () => { host.innerHTML = svg.replace('Mermaid Navigate', 'Updated diagram'); },
    delayed: () => { const el = document.createElement('div'); el.className = 'mermaid'; document.body.append(el); setTimeout(() => { el.innerHTML = svg; }, 50); },
  },
});
