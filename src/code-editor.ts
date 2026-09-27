import { button } from './controls';

export interface DiagramCodeSession {
  code: string;
  sourcePath: string;
  /** Validate, save just this fence's body, update code, and return a fresh SVG. */
  save(code: string): Promise<SVGSVGElement>;
}

export class CodeEditor {
  readonly root: HTMLElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly status: HTMLElement;
  private readonly sourceLabel: HTMLElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;
  private session?: DiagramCodeSession;
  private busy = false;
  private disposed = false;

  constructor(parent: HTMLElement, private readonly load: () => Promise<DiagramCodeSession>,
    private readonly saved: (svg: SVGSVGElement) => void, private readonly showDiagram: () => void) {
    const doc = parent.ownerDocument;
    this.root = doc.createElement('div');
    this.root.className = 'mn-code-editor';
    this.root.hidden = true;
    this.sourceLabel = doc.createElement('div');
    this.sourceLabel.className = 'mn-code-source';
    this.sourceLabel.textContent = 'Mermaid source — changes are not saved until you choose Save.';
    const label = doc.createElement('label');
    label.className = 'mn-code-label';
    label.textContent = 'Mermaid source';
    this.textarea = doc.createElement('textarea');
    this.textarea.className = 'mn-code-input';
    this.textarea.setAttribute('aria-label', 'Mermaid source');
    this.textarea.setAttribute('autocapitalize', 'off');
    this.textarea.setAttribute('autocomplete', 'off');
    this.textarea.setAttribute('autocorrect', 'off');
    this.textarea.spellcheck = false;
    this.textarea.wrap = 'off';
    this.textarea.disabled = true;
    label.append(this.textarea);
    this.status = doc.createElement('div');
    this.status.className = 'mn-code-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    const actions = doc.createElement('div');
    actions.className = 'mn-code-actions';
    this.saveButton = button(actions, 'Save diagram code', 'Save', () => { void this.save(); });
    this.saveButton.classList.add('mod-cta');
    this.cancelButton = button(actions, 'Cancel code edits', 'Cancel', () => {
      this.textarea.value = this.session?.code ?? '';
      this.status.textContent = '';
      this.showDiagram();
    });
    this.textarea.addEventListener('input', () => { this.status.textContent = this.dirty ? 'Unsaved changes' : ''; });
    this.textarea.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault(); event.stopPropagation(); void this.save();
      }
    });
    this.root.append(this.sourceLabel, label, this.status, actions);
    parent.append(this.root);
    this.updateButtons();
  }

  get dirty(): boolean { return !!this.session && this.textarea.value !== this.session.code; }

  async show(): Promise<void> {
    this.root.hidden = false;
    if (!this.session && !this.busy) {
      this.busy = true;
      this.status.textContent = 'Loading source…';
      this.updateButtons();
      try {
        const session = await this.load();
        if (this.disposed) return;
        this.session = session;
        this.textarea.value = session.code;
        this.textarea.disabled = false;
        this.sourceLabel.textContent = `${session.sourcePath} · Mermaid code only, without fences.`;
        this.status.textContent = '';
      } catch (error) {
        if (!this.disposed) this.status.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        this.busy = false;
        this.updateButtons();
      }
    }
    if (!this.root.hidden && !this.disposed && this.session) this.textarea.focus({ preventScroll: true });
  }

  hide(): void { this.root.hidden = true; }

  /** Used for close button, Escape, backdrop, and native mobile Back. */
  canClose(): boolean {
    if (!this.dirty && !this.busy) return true;
    this.status.textContent = this.busy ? 'Please wait for the current operation to finish.' : 'Unsaved changes. Save or Cancel before closing. Your draft is still here.';
    return false;
  }

  private updateButtons(): void {
    this.saveButton.disabled = this.busy || !this.session;
    this.cancelButton.disabled = this.busy;
    this.textarea.readOnly = this.busy;
  }

  private async save(): Promise<void> {
    if (!this.session || this.busy) return;
    this.busy = true;
    this.status.textContent = 'Checking and saving…';
    this.updateButtons();
    try {
      const svg = await this.session.save(this.textarea.value);
      if (this.disposed) return;
      this.textarea.value = this.session.code;
      this.status.textContent = '';
      this.saved(svg);
      this.showDiagram();
    } catch (error) {
      if (!this.disposed) this.status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      this.updateButtons();
    }
  }

  destroy(): void { this.disposed = true; this.root.remove(); }
}
