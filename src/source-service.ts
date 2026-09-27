import { App, Component, MarkdownRenderer, MarkdownView, TFile, type MarkdownPostProcessorContext } from 'obsidian';
import { EditorView, ViewPlugin } from '@codemirror/view';
import type { DiagramCodeSession } from './code-editor';
import { locateFence, normalizeNewlines, prepareEdit, type FenceSnapshot } from './fences';

/** Source locations come from Obsidian or CodeMirror, never SVG labels/order. */
export class DiagramSourceService {
  private readonly sections = new WeakMap<HTMLElement, MarkdownPostProcessorContext>();
  private disposed = false;
  private readonly editors = new Map<HTMLElement, EditorView>();
  readonly extension = ViewPlugin.define(view => {
    this.editors.set(view.dom, view);
    return { destroy: () => { this.editors.delete(view.dom); } };
  });

  constructor(private readonly app: App) {}

  register(element: HTMLElement, context: MarkdownPostProcessorContext): void {
    this.sections.set(element, context);
  }

  dispose(): void { this.disposed = true; this.editors.clear(); }

  /** Capture synchronously: focusing a modal can unmount a Live Preview widget. */
  capture(source: SVGSVGElement): () => Promise<DiagramCodeSession> {
    try {
      for (let el = source.parentElement; el; el = el.parentElement) {
        const context = this.sections.get(el);
        if (!context) continue;
        const info = context.getSectionInfo(el);
        if (!info) throw new Error('Source location is no longer available. Reopen the note and try again.');
        return this.loader(context.sourcePath, info.text, info.lineStart, info.lineEnd, source.ownerDocument);
      }
      // Live Preview's native Mermaid widgets do not run Markdown postprocessors.
      if (source.closest('.markdown-embed, .internal-embed')) throw new Error('This embedded diagram has no reliable source location. Open its original note to edit it.');
      const root = source.closest<HTMLElement>('.cm-editor');
      const cm = root ? this.editors.get(root) : undefined;
      if (!cm) throw new Error('Cannot find this diagram’s source. Reopen the note in Reading view or Live Preview and try again.');
      let path: string | undefined;
      this.app.workspace.iterateAllLeaves(leaf => {
        if (leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(root)) path = leaf.view.file?.path;
      });
      if (!path) throw new Error('This diagram is not associated with an editable Markdown note.');
      const pos = cm.posAtDOM(source.closest('.cm-preview-code-block') ?? source);
      const line = cm.state.doc.lineAt(pos).number - 1;
      return this.loader(path, cm.state.doc.toString(), line, undefined, source.ownerDocument);
    } catch (error) {
      return async () => { throw error; };
    }
  }

  private openEditors(file: TFile): MarkdownView[] {
    const editors: MarkdownView[] = [];
    this.app.workspace.iterateAllLeaves(leaf => {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file === file && view.getMode() === 'source') editors.push(view);
    });
    return editors;
  }

  private assertFile(file: TFile): void {
    if (this.disposed) throw new Error('Editing was cancelled because Mermaid Navigate was disabled.');
    if (this.app.vault.getAbstractFileByPath(file.path) !== file) throw new Error('The source note was deleted or replaced. Nothing was saved.');
  }

  private loader(path: string, renderedText: string, lineStart: number, lineEnd: number | undefined, doc: Document): () => Promise<DiagramCodeSession> {
    // Validate the location even before asynchronous source reads.
    locateFence(renderedText, lineStart, lineEnd);
    // Bind identity now, not when Show code is selected later in the modal.
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error('The source note could not be found.');
    return async () => {
      this.assertFile(file);
      let diskBaseline = await this.app.vault.read(file);
      this.assertFile(file);
      const editors = this.openEditors(file);
      const text = editors[0]?.editor.getValue() ?? diskBaseline;
      if (normalizeNewlines(text) !== normalizeNewlines(renderedText) || normalizeNewlines(text) !== normalizeNewlines(diskBaseline)
        || editors.some(view => view.editor.getValue() !== text)) {
        throw new Error('The note changed or has unsaved/incoming changes. Wait for it to finish saving, then reopen the current diagram before editing.');
      }
      let snapshot = locateFence(text, lineStart, lineEnd);
      const session: DiagramCodeSession = {
        code: snapshot.code,
        sourcePath: file.path,
        save: async code => {
          this.assertFile(file);
          const prepared = prepareEdit(snapshot, snapshot.document, code);
          // Render with Obsidian's own Mermaid engine before touching the note.
          const svg = await this.render(code, snapshot, file.path, doc);
          this.assertFile(file);
          const diskNow = await this.app.vault.read(file);
          this.assertFile(file);
          const currentEditors = this.openEditors(file);
          if (currentEditors.length) {
            // A sync/disk update may not have reached the editor buffer yet.
            if (normalizeNewlines(diskNow) !== normalizeNewlines(diskBaseline) && normalizeNewlines(diskNow) !== normalizeNewlines(snapshot.document)) {
              throw new Error('The note changed on disk while you were editing. Nothing was overwritten. Copy your draft and reopen the current diagram.');
            }
            for (const view of currentEditors) prepareEdit(snapshot, view.editor.getValue(), code);
            const view = currentEditors[0]!;
            const editor = view.editor;
            // Preserve native undo, then await Obsidian's save rather than its debounce.
            editor.replaceRange(prepared.insert, editor.offsetToPos(snapshot.from), editor.offsetToPos(snapshot.to));
            await view.save();
          } else {
            // Atomic read/modify/write; refuses any intervening edit/sync update.
            await this.app.vault.process(file, current => {
              this.assertFile(file);
              for (const view of this.openEditors(file)) prepareEdit(snapshot, view.editor.getValue(), code);
              return prepareEdit(snapshot, current, code).text;
            });
          }
          diskBaseline = prepared.text;
          snapshot = locateFence(prepared.text, snapshot.lineStart);
          session.code = snapshot.code;
          session.sourcePath = file.path;
          return svg;
        },
      };
      return session;
    };
  }

  private async render(code: string, snapshot: FenceSnapshot, path: string, doc: Document): Promise<SVGSVGElement> {
    const target = doc.createElement('div');
    // Excluded by our postprocessor/observer, but inherits Obsidian's text styles.
    target.className = 'mn-viewer mn-render-target markdown-rendered';
    target.setAttribute('aria-hidden', 'true');
    doc.body.append(target);
    const component = new Component();
    component.load();
    try {
      const normalized = normalizeNewlines(code);
      await MarkdownRenderer.render(this.app, `${snapshot.fence}mermaid\n${normalized}${normalized.endsWith('\n') ? '' : '\n'}${snapshot.fence}`, target, path, component);
      const svg = target.querySelector<SVGSVGElement>('.mermaid > svg');
      if (!svg || svg.getAttribute('aria-roledescription') === 'error') {
        throw new Error(`Mermaid could not render this code. Nothing was saved. ${(target.textContent ?? '').trim().slice(0,300)}`);
      }
      return svg.cloneNode(true) as SVGSVGElement;
    } finally {
      component.unload();
      target.remove();
    }
  }
}
