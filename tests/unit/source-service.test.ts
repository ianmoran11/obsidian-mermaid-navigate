// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkdownRenderer, MarkdownView, TFile } from '../mocks/obsidian';
import { DiagramSourceService } from '../../src/source-service';

const original = '# Heading\n```mermaid\nflowchart LR\n A-->B\n```\nFooter\n';
function setup(editorMode = false) {
  const file = new TFile('A.md');
  const files = new Map([['A.md', file]]);
  const documents = new Map([[file, original]]);
  const view = new MarkdownView();
  view.file = file;
  let buffer = original;
  view.editor = {
    getValue: () => buffer,
    offsetToPos: (offset: number) => offset,
    replaceRange: vi.fn((insert: string, from: number, to: number) => { buffer = buffer.slice(0, from) + insert + buffer.slice(to); }),
  };
  view.save = vi.fn(async () => { documents.set(file, buffer); });
  const leaves = editorMode ? [{ view }] : [];
  const vault = {
    getAbstractFileByPath: (path: string) => files.get(path),
    read: vi.fn(async (file: TFile) => documents.get(file)),
    process: vi.fn(async (file: TFile, transform: (s: string) => string) => {
      const text = transform(documents.get(file)!);
      documents.set(file, text);
      return text;
    }),
  };
  const service = new DiagramSourceService({ vault, workspace: { iterateAllLeaves: (fn: Function) => leaves.forEach(fn) } } as any);
  const section = document.createElement('div');
  section.innerHTML = '<div class="mermaid"><svg xmlns="http://www.w3.org/2000/svg"/></div>';
  document.body.append(section);
  service.register(section, { sourcePath: 'A.md', getSectionInfo: () => ({ text: original, lineStart: 1, lineEnd: 4 }) } as any);
  const load = service.capture(section.querySelector('svg')!);
  return { service, load, file, files, documents, vault, view, setBuffer: (s: string) => { buffer = s; } };
}
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('source identity and async write safety', () => {
  it('follows the original file identity after rename and never a reused path', async () => {
    const t = setup();
    t.files.delete('A.md'); t.file.path = 'B.md'; t.files.set('B.md', t.file);
    const replacement = new TFile('A.md'); t.files.set('A.md', replacement); t.documents.set(replacement, original);
    const session = await t.load();
    expect(session.sourcePath).toBe('B.md');
    await session.save('flowchart TD\n X-->Y');
    expect(t.documents.get(t.file)).toContain('X-->Y');
    expect(t.documents.get(replacement)).toBe(original);
  });
  it('refuses delete/recreate before the first code load', async () => {
    const t = setup();
    t.files.set('A.md', new TFile('A.md'));
    await expect(t.load()).rejects.toThrow('deleted or replaced');
    expect(t.vault.process).not.toHaveBeenCalled();
  });
  it('refuses stale rendered content at code load', async () => {
    const t = setup(); t.documents.set(t.file, '# External\n' + original);
    await expect(t.load()).rejects.toThrow('note changed');
  });
  it('refuses stale editor content when disk changed before the first code load', async () => {
    const t = setup(true);
    t.documents.set(t.file, original + 'Incoming change before Show code');
    await expect(t.load()).rejects.toThrow('unsaved/incoming changes');
    expect(t.view.editor.replaceRange).not.toHaveBeenCalled();
    expect(t.view.save).not.toHaveBeenCalled();
    expect(t.documents.get(t.file)).toBe(original + 'Incoming change before Show code');
  });
  it('waits for existing editor changes to be saved before code editing', async () => {
    const t = setup(true);
    t.documents.set(t.file, original.replace('A-->B', 'Old-->Disk'));
    await expect(t.load()).rejects.toThrow('unsaved/incoming changes');
    expect(t.view.save).not.toHaveBeenCalled();
  });
  it('refuses an external disk change while the editor buffer is stale', async () => {
    const t = setup(true); const session = await t.load();
    t.documents.set(t.file, original + 'Incoming sync change');
    await expect(session.save('flowchart LR\n X-->Y')).rejects.toThrow('changed on disk');
    expect(t.view.editor.replaceRange).not.toHaveBeenCalled();
    expect(t.view.save).not.toHaveBeenCalled();
  });
  it('refuses unsaved changes in an open editor', async () => {
    const t = setup(true); const session = await t.load(); t.setBuffer(original + 'Unrelated typing');
    await expect(session.save('flowchart LR\n X-->Y')).rejects.toThrow('note changed');
    expect(t.view.editor.replaceRange).not.toHaveBeenCalled();
  });
  it('uses native range replacement and awaits saving in an open editor', async () => {
    const t = setup(true); const session = await t.load();
    await session.save('flowchart LR\n X-->Y');
    expect(t.view.editor.replaceRange).toHaveBeenCalledOnce();
    expect(t.view.save).toHaveBeenCalledOnce();
    expect(t.vault.process).not.toHaveBeenCalled();
    expect(t.documents.get(t.file)).toBe('# Heading\n```mermaid\nflowchart LR\n X-->Y\n```\nFooter\n');
    await session.save('flowchart LR\n Y-->Z');
    expect(t.documents.get(t.file)).toContain('Y-->Z');
  });
  it.each([false, true])('does not write after unload during validation (editor=%s)', async editorMode => {
    const t = setup(editorMode); const session = await t.load();
    let release!: () => void;
    vi.spyOn(MarkdownRenderer, 'render').mockImplementationOnce(async (_app, _code, target) => {
      await new Promise<void>(resolve => { release = resolve; });
      target.innerHTML = '<div class="mermaid"><svg/></div>';
    });
    const saving = session.save('flowchart LR\n X-->Y');
    t.service.dispose(); release();
    await expect(saving).rejects.toThrow('disabled');
    expect(t.view.editor.replaceRange).not.toHaveBeenCalled();
    expect(t.vault.process).not.toHaveBeenCalled();
    expect(t.documents.get(t.file)).toBe(original);
    expect(document.querySelector('.mn-render-target')).toBeNull();
  });
  it('checks disposal again inside the atomic vault callback', async () => {
    const t = setup(); const session = await t.load();
    t.vault.process.mockImplementationOnce(async (_file, transform) => { t.service.dispose(); return transform(original); });
    await expect(session.save('flowchart LR\n X-->Y')).rejects.toThrow('disabled');
    expect(t.documents.get(t.file)).toBe(original);
  });
  it('checks conflicts inside the atomic vault callback', async () => {
    const t = setup(); const session = await t.load();
    t.vault.process.mockImplementationOnce(async (_file, transform) => transform(original + 'Late sync'));
    await expect(session.save('flowchart LR\n X-->Y')).rejects.toThrow('note changed');
  });
  it('does not write if Obsidian cannot render the draft', async () => {
    const t = setup(); const session = await t.load();
    vi.spyOn(MarkdownRenderer, 'render').mockImplementationOnce(async (_app, _code, target) => { target.textContent = 'Parse error'; });
    await expect(session.save('bad code')).rejects.toThrow('Nothing was saved');
    expect(t.vault.process).not.toHaveBeenCalled();
    expect(document.querySelector('.mn-render-target')).toBeNull();
  });
});
