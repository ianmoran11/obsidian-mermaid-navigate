import { fitTransform, MAX_SCALE, MIN_SCALE, pinchTransform, zoomAt, type Point, type Size, type Transform } from './geometry';
import { cloneDiagram } from './svg';
import { button } from './controls';
import { CodeEditor, type DiagramCodeSession } from './code-editor';

export interface ViewerOptions {
  fullscreen?: () => void;
  exit?: () => void;
  exitLabel?: string;
  openCode?: () => void;
  loadCode?: () => Promise<DiagramCodeSession>;
}

/** Framework-independent viewer shared by inline and fullscreen presentations. */
export class DiagramViewer {
  readonly root: HTMLElement;
  readonly viewport: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly percentage: HTMLElement;
  private readonly zoomIn: HTMLButtonElement;
  private readonly zoomOut: HTMLButtonElement;
  private size: Size;
  private readonly codeEditor?: CodeEditor;
  private readonly codeToggle?: HTMLButtonElement;
  private readonly diagramControls: HTMLElement[] = [];
  private readonly cleanup: Array<() => void> = [];
  private readonly pointers = new Map<number, Point>();
  private readonly captureTargets = new Map<number, Element>();
  private readonly resize: ResizeObserver;
  private viewSize: Size = { width: 0, height: 0 };
  private transform: Transform = { x: 0, y: 0, scale: 1 };
  private autoFit = true;
  private dragged = false;
  private travel = 0;
  private disposed = false;

  constructor(parent: HTMLElement, source: SVGSVGElement, options: ViewerOptions = {}) {
    const doc = parent.ownerDocument;
    const create = (tag: string, className: string, into: HTMLElement): HTMLElement => {
      const el = doc.createElement(tag);
      el.className = className;
      into.append(el);
      return el;
    };
    this.root = create('div', 'mn-viewer', parent);
    const toolbar = create('div', 'mn-toolbar', this.root);
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', 'Diagram controls');
    this.zoomOut = button(toolbar, 'Zoom out', '−', () => this.zoom(1 / 1.25));
    this.percentage = create('output', 'mn-percentage', toolbar);
    this.percentage.setAttribute('aria-label', 'Zoom level');
    this.zoomIn = button(toolbar, 'Zoom in', '+', () => this.zoom(1.25));
    button(toolbar, 'Fit diagram (0)', 'Fit', () => this.fit());
    button(toolbar, 'Actual size (1)', '1:1', () => this.zoomTo(1));
    this.diagramControls = Array.from(toolbar.children) as HTMLElement[];
    if (options.loadCode) this.codeToggle = button(toolbar, 'Show code', 'Show code', () => this.toggleCode());
    else if (options.openCode) button(toolbar, 'Show code', 'Show code', options.openCode);
    this.codeToggle?.setAttribute('aria-pressed', 'false');
    if (options.fullscreen) button(toolbar, 'Open fullscreen', '⛶', options.fullscreen);
    if (options.exit) button(toolbar, options.exitLabel ?? 'Close viewer', '✕', options.exit);
    this.viewport = create('div', 'mn-viewport', this.root);
    this.viewport.tabIndex = 0;
    this.viewport.setAttribute('role', 'region');
    this.viewport.setAttribute('aria-label', 'Interactive Mermaid diagram. Drag to pan; pinch or scroll to zoom. Use arrow keys to pan, plus or minus to zoom, and 0 to fit.');
    this.layer = create('div', 'mn-layer mermaid markdown-rendered', this.viewport);
    const cloned = cloneDiagram(source);
    this.size = cloned.size;
    this.layer.append(cloned.svg);
    if (options.loadCode) this.codeEditor = new CodeEditor(this.root, options.loadCode, svg => this.replaceDiagram(svg), () => this.toggleCode(false));
    const hint = create('div', 'mn-hint', this.root);
    hint.textContent = 'Drag to pan · Pinch or scroll to zoom · Fit to reset';

    this.listen(this.viewport, 'pointerdown', this.onDown as EventListener);
    this.listen(this.viewport, 'pointermove', this.onMove as EventListener);
    this.listen(this.viewport, 'pointerup', this.onUp as EventListener);
    this.listen(this.viewport, 'pointercancel', this.onUp as EventListener);
    this.listen(this.viewport, 'lostpointercapture', this.onUp as EventListener);
    this.listen(this.viewport, 'wheel', this.onWheel as EventListener, { passive: false });
    this.listen(this.viewport, 'keydown', this.onKey as EventListener);
    this.listen(this.viewport, 'dblclick', ((event: MouseEvent) => {
      event.preventDefault();
      this.zoom(2, this.point(event));
    }) as EventListener);
    this.listen(this.viewport, 'click', (event => {
      if (this.dragged) { event.preventDefault(); event.stopPropagation(); }
    }), { capture: true });
    // Use the owning window for Obsidian pop-out support.
    const win = doc.defaultView!;
    this.resize = new (win as Window & typeof globalThis).ResizeObserver(() => this.onResize());
    this.resize.observe(this.viewport);
    this.onResize();
  }

  showCode(): void { this.toggleCode(true); }

  canClose(): boolean {
    if (!this.codeEditor || this.codeEditor.canClose()) return true;
    this.showCode();
    return false;
  }

  private toggleCode(show = !this.root.classList.contains('is-code-visible')): void {
    if (!this.codeEditor) return;
    this.root.classList.toggle('is-code-visible', show);
    for (const control of this.diagramControls) control.hidden = show;
    if (this.codeToggle) {
      const label = show ? 'Show diagram' : 'Show code';
      this.codeToggle.textContent = label;
      this.codeToggle.setAttribute('aria-label', label);
      this.codeToggle.title = label;
      this.codeToggle.setAttribute('aria-pressed', String(show));
    }
    if (show) void this.codeEditor.show();
    else {
      this.codeEditor.hide();
      this.onResize();
      this.viewport.focus({ preventScroll: true });
    }
  }

  private replaceDiagram(source: SVGSVGElement): void {
    if (this.disposed) return;
    const cloned = cloneDiagram(source);
    this.size = cloned.size;
    this.layer.replaceChildren(cloned.svg);
    this.fit();
  }

  private listen(target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions): void {
    target.addEventListener(type, handler, options);
    this.cleanup.push(() => target.removeEventListener(type, handler, options));
  }

  private point(event: { clientX: number; clientY: number }): Point {
    const rect = this.viewport.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private onDown = (event: PointerEvent): void => {
    if ((event.pointerType === 'mouse' && event.button !== 0) || this.pointers.size >= 2) return;
    if (!this.pointers.size) { this.dragged = false; this.travel = 0; }
    this.pointers.set(event.pointerId, this.point(event));
    // Capture on the original target so an undragged anchor still receives click.
    const target = event.target as Element;
    target.setPointerCapture(event.pointerId);
    this.captureTargets.set(event.pointerId, target);
    this.viewport.classList.add('is-dragging');
    this.viewport.focus({ preventScroll: true });
    event.stopPropagation();
  };

  private onMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    event.preventDefault();
    event.stopPropagation();
    const before = Array.from(this.pointers.values());
    const point = this.point(event);
    this.pointers.set(event.pointerId, point);
    this.travel += Math.hypot(point.x - previous.x, point.y - previous.y);
    this.dragged ||= this.travel > 4 || this.pointers.size === 2;
    this.autoFit = false;
    if (before.length === 2) {
      this.transform = pinchTransform(this.transform, before as [Point, Point], Array.from(this.pointers.values()) as [Point, Point]);
    } else {
      this.transform.x += point.x - previous.x;
      this.transform.y += point.y - previous.y;
    }
    this.paint();
  };

  private onUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    const target = this.captureTargets.get(event.pointerId);
    this.captureTargets.delete(event.pointerId);
    if (target?.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    if (!this.pointers.size) this.viewport.classList.remove('is-dragging');
  };

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.viewSize.height : 1);
    this.zoom(Math.exp(-Math.max(-500, Math.min(500, delta)) * 0.002), this.point(event));
  };

  private onKey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const step = event.shiftKey ? 100 : 40;
    switch (event.key) {
      case '+': case '=': this.zoom(1.25); break;
      case '-': case '_': this.zoom(1 / 1.25); break;
      case '0': this.fit(); break;
      case '1': this.zoomTo(1); break;
      case 'ArrowLeft': this.pan(step, 0); break;
      case 'ArrowRight': this.pan(-step, 0); break;
      case 'ArrowUp': this.pan(0, step); break;
      case 'ArrowDown': this.pan(0, -step); break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  private pan(x: number, y: number): void {
    this.autoFit = false;
    this.transform.x += x;
    this.transform.y += y;
    this.paint();
  }

  private onResize(): void {
    if (this.disposed) return;
    const width = this.viewport.clientWidth;
    const height = this.viewport.clientHeight;
    if (!width || !height) return;
    const previous = this.viewSize;
    this.viewSize = { width, height };
    if (this.autoFit) this.fit();
    else {
      this.transform.x += (width - previous.width) / 2;
      this.transform.y += (height - previous.height) / 2;
      this.paint();
    }
  }

  fit(): void {
    this.autoFit = true;
    this.transform = fitTransform(this.size, this.viewSize);
    this.paint();
  }

  zoom(factor: number, point?: Point): void { this.zoomTo(this.transform.scale * factor, point); }

  private zoomTo(scale: number, point = { x: this.viewSize.width / 2, y: this.viewSize.height / 2 }): void {
    this.autoFit = false;
    this.transform = zoomAt(this.transform, scale, point);
    this.paint();
  }

  private paint(): void {
    const { x, y, scale } = this.transform;
    this.layer.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    this.percentage.textContent = `${Number((scale * 100).toFixed(scale < 0.1 ? 1 : 0))}%`;
    this.zoomOut.disabled = scale <= MIN_SCALE;
    this.zoomIn.disabled = scale >= MAX_SCALE;
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resize.disconnect();
    this.codeEditor?.destroy();
    for (const cleanup of this.cleanup) cleanup();
    for (const [id, target] of this.captureTargets) {
      if (target.hasPointerCapture(id)) target.releasePointerCapture(id);
    }
    this.captureTargets.clear();
    this.pointers.clear();
    this.root.remove();
  }
}
