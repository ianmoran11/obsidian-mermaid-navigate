import { App, MarkdownView, Modal, Notice, Plugin } from 'obsidian';
import { DiagramEnhancer } from './enhancer';
import { DiagramViewer } from './viewer';
import { DiagramSourceService } from './source-service';
import type { DiagramCodeSession } from './code-editor';

class DiagramModal extends Modal {
  private viewer?: DiagramViewer;
  private readonly previousFocus: HTMLElement | null;
  constructor(app: App, private readonly source: SVGSVGElement, private readonly closed: () => void,
    private readonly loadCode: () => Promise<DiagramCodeSession>, private readonly startWithCode = false) {
    super(app);
    this.previousFocus = source.ownerDocument.activeElement as HTMLElement | null;
  }

  onOpen(): void {
    this.containerEl.classList.add('mn-modal-container');
    this.modalEl.classList.add('mn-fullscreen');
    this.titleEl.textContent = 'Mermaid diagram';
    this.viewer = new DiagramViewer(this.contentEl, this.source, { exit: () => this.close(), exitLabel: 'Close fullscreen', loadCode: this.loadCode });
    if (this.startWithCode) this.viewer.showCode();
    else this.viewer.viewport.focus({ preventScroll: true });
  }

  close(force = false): void {
    if (!force && this.viewer && !this.viewer.canClose()) return;
    super.close();
  }

  onClose(): void {
    this.viewer?.destroy();
    this.viewer = undefined;
    this.contentEl.empty();
    this.closed();
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
  }
}

export default class MermaidNavigatePlugin extends Plugin {
  private readonly enhancers = new Map<Document, DiagramEnhancer>();
  private readonly modals = new Set<DiagramModal>();
  private stopped = false;
  private sources!: DiagramSourceService;

  onload(): void {
    this.stopped = false;
    this.sources = new DiagramSourceService(this.app);
    this.registerEditorExtension(this.sources.extension);
    this.registerMarkdownPostProcessor((el, context) => {
      if (el.closest('.mn-viewer, .mn-fullscreen')) return;
      this.sources.register(el, context);
      this.watchDocument(el.ownerDocument).scan(el);
    }, 100);
    this.app.workspace.onLayoutReady(() => {
      if (this.stopped) return;
      this.watchDocument(this.app.workspace.containerEl.ownerDocument);
      this.app.workspace.iterateAllLeaves(leaf => {
        this.watchDocument(leaf.view.containerEl.ownerDocument);
        // Existing Reading-view sections need fresh source-location contexts.
        if (leaf.view instanceof MarkdownView) leaf.view.previewMode.rerender(true);
      });
    });
    this.registerEvent(this.app.workspace.on('window-open', (_, window) => { this.watchDocument(window.document); }));
    this.registerEvent(this.app.workspace.on('window-close', (_, window) => {
      this.enhancers.get(window.document)?.destroy();
      this.enhancers.delete(window.document);
    }));
    this.addCommand({
      id: 'open-fullscreen',
      name: 'Open first diagram in active note fullscreen',
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const source = view ? Array.from(view.containerEl.querySelectorAll<SVGSVGElement>('.mermaid svg')).find(svg => !svg.closest('.mn-viewer')) : undefined;
        if (source) this.openFullscreen(source);
        else new Notice('No rendered Mermaid diagram found. Use Reading view or move the cursor outside the code block in Live Preview.');
      },
    });
  }

  private watchDocument(doc: Document): DiagramEnhancer {
    let enhancer = this.enhancers.get(doc);
    if (!enhancer) {
      enhancer = new DiagramEnhancer(doc, (source, showCode) => this.openFullscreen(source, showCode));
      this.enhancers.set(doc, enhancer);
    }
    return enhancer;
  }

  private openFullscreen(source: SVGSVGElement, showCode = false): void {
    const loadCode = this.sources.capture(source);
    const modal = new DiagramModal(this.app, source, () => { this.modals.delete(modal); }, loadCode, showCode);
    this.modals.add(modal);
    modal.open();
  }

  onunload(): void {
    this.stopped = true;
    this.sources.dispose();
    for (const modal of this.modals) modal.close(true);
    this.modals.clear();
    for (const enhancer of this.enhancers.values()) enhancer.destroy();
    this.enhancers.clear();
  }
}
