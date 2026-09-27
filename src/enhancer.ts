import { DiagramViewer } from './viewer';
import { button } from './controls';

class EnhancedDiagram {
  readonly controls: HTMLElement;
  private viewer?: DiagramViewer;
  constructor(readonly host: HTMLElement, readonly source: SVGSVGElement, private readonly openFullscreen: (svg: SVGSVGElement, showCode?: boolean) => void) {
    this.controls = host.ownerDocument.createElement('div');
    this.controls.className = 'mn-controls';
    this.controls.setAttribute('role', 'group');
    this.controls.setAttribute('aria-label', 'Mermaid navigation');
    button(this.controls, 'Pan and zoom diagram', 'Pan & zoom', () => this.activate());
    button(this.controls, 'Open diagram fullscreen', 'Fullscreen', () => this.openFullscreen(this.source));
    button(this.controls, 'Show code', 'Show code', () => this.openFullscreen(this.source, true));
    host.append(this.controls);
  }

  private activate(): void {
    if (this.viewer) return;
    this.viewer = new DiagramViewer(this.host, this.source, {
      fullscreen: () => this.openFullscreen(this.source),
      openCode: () => this.openFullscreen(this.source, true),
      exit: () => this.deactivate(),
      exitLabel: 'Stop interacting and restore note scrolling',
    });
    this.source.classList.add('mn-source-hidden');
    this.controls.hidden = true;
    this.viewer.viewport.focus({ preventScroll: true });
  }

  private deactivate(): void {
    this.viewer?.destroy();
    this.viewer = undefined;
    this.source.classList.remove('mn-source-hidden');
    this.controls.hidden = false;
    this.controls.querySelector('button')?.focus({ preventScroll: true });
  }

  destroy(): void {
    this.viewer?.destroy();
    this.viewer = undefined;
    this.source.classList.remove('mn-source-hidden');
    this.controls.remove();
  }
}

/** Observes late Mermaid rendering in Reading view, Live Preview, and embeds. */
export class DiagramEnhancer {
  private readonly diagrams = new Map<HTMLElement, EnhancedDiagram>();
  private readonly pending = new Set<Element>();
  private readonly dirty = new Set<HTMLElement>();
  private readonly observer: MutationObserver;
  private readonly win: Window;
  private frame = 0;
  private disposed = false;

  constructor(private readonly doc: Document, private readonly openFullscreen: (svg: SVGSVGElement, showCode?: boolean) => void) {
    this.win = doc.defaultView!;
    this.observer = new (this.win as Window & typeof globalThis).MutationObserver(mutations => {
      let relevant = false;
      for (const mutation of mutations) {
        const target = mutation.target.nodeType === 1 ? mutation.target as Element : mutation.target.parentElement;
        if (!target || target.closest('.mn-viewer, .mn-controls, .mn-fullscreen')) continue;
        // Ignore plugin-owned nodes so installing/removing a toolbar cannot loop.
        const changed = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
        if (changed.length && changed.every(node => node.nodeType === 1 && (node as Element).matches('.mn-viewer, .mn-controls'))) continue;
        relevant = true;
        const host = target.closest<HTMLElement>('.mermaid');
        if (host) {
          this.pending.add(host);
          if (target.closest('svg')) this.dirty.add(host);
        }
        for (const node of mutation.addedNodes) if (node.nodeType === 1) this.pending.add(node as Element);
      }
      if (relevant) this.schedule();
    });
    this.observer.observe(doc.body, { childList: true, subtree: true });
    this.scan(doc.body);
  }

  scan(root: Element): void {
    if (this.disposed || root.closest('.mn-viewer, .mn-fullscreen')) return;
    if (root.matches('.mermaid')) this.enhance(root as HTMLElement);
    for (const host of root.querySelectorAll<HTMLElement>('.mermaid')) this.enhance(host);
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = this.win.requestAnimationFrame(() => {
      this.frame = 0;
      for (const [host, diagram] of this.diagrams) {
        if (!host.isConnected || host.ownerDocument !== this.doc || !host.contains(diagram.source) || this.dirty.has(host)) {
          diagram.destroy();
          this.diagrams.delete(host);
        }
      }
      this.dirty.clear();
      for (const root of this.pending) if (root.isConnected) this.scan(root);
      this.pending.clear();
    });
  }

  private enhance(host: HTMLElement): void {
    if (!host.isConnected || host.closest('.mn-viewer, .mn-fullscreen')) return;
    const source = Array.from(host.querySelectorAll<SVGSVGElement>('svg')).find(svg => !svg.closest('.mn-viewer, .mn-controls'));
    if (!source) return;
    const existing = this.diagrams.get(host);
    if (existing?.source === source && existing.controls.isConnected) return;
    existing?.destroy();
    this.diagrams.set(host, new EnhancedDiagram(host, source, this.openFullscreen));
  }

  destroy(): void {
    this.disposed = true;
    this.observer.disconnect();
    if (this.frame) this.win.cancelAnimationFrame(this.frame);
    for (const diagram of this.diagrams.values()) diagram.destroy();
    this.diagrams.clear();
    this.pending.clear();
    this.dirty.clear();
  }
}
