import { vi } from 'vitest';
export class TFile { constructor(public path: string) {} }
export class MarkdownView {
  file!: TFile;
  editor: any;
  getMode() { return 'source'; }
  save = vi.fn(async () => {});
}
export class Component { load() {} unload() {} }
export class MarkdownRenderer {
  static render = vi.fn(async (_app: unknown, _code: string, target: HTMLElement) => {
    target.innerHTML = '<div class="mermaid"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text>Updated</text></svg></div>';
  });
}
