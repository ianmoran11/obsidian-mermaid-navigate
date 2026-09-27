import { describe, expect, it } from 'vitest';
import { locateFence, mermaidFences, prepareEdit } from '../../src/fences';

const code = 'flowchart LR\n A --> B\n';
const block = '```mermaid\n' + code + '```';
const text = `# Note\n\n${block}\n\nKeep this prose\n\n${block}\nTail\n`;

describe('exact Mermaid source edits', () => {
  it('distinguishes identical blocks by source position', () => {
    const blocks = mermaidFences(text);
    expect(blocks).toHaveLength(2);
    const second = locateFence(text, blocks[1]!.lineStart, blocks[1]!.lineEnd);
    const result = prepareEdit(second, text, 'flowchart TD\n X --> Y');
    expect(result.text).toBe(text.slice(0, second.from) + 'flowchart TD\n X --> Y\n' + text.slice(second.to));
    expect(result.text.slice(0, second.from)).toBe(text.slice(0, second.from));
  });
  it('requires the actual opening line, not any enclosing fence', () => {
    expect(() => locateFence(text, 4)).toThrow('Cannot safely');
  });
  it('requires exact Reading-view section boundaries', () => {
    expect(() => locateFence(text, 2, 100)).toThrow('Cannot safely');
    expect(() => locateFence(text, 0, 5)).toThrow('Cannot safely');
  });
  it('does not parse literal Mermaid examples inside another fenced block', () => {
    expect(mermaidFences('````markdown\n' + block + '\n````')).toHaveLength(0);
  });
  it('skips YAML frontmatter containing fence-looking literals', () => {
    const source = '---\ndescription: |\n  ```mermaid\n---\n# Note\n' + block + '\n';
    const found = locateFence(source, 5);
    expect(found.code).toBe(code);
    const result = prepareEdit(found, source, 'flowchart LR\n C --> D').text;
    expect(result.slice(0, found.from)).toBe(source.slice(0, found.from));
    expect(result).toContain('---\n# Note\n```mermaid\n');
  });
  it('skips BOM-prefixed and CRLF frontmatter', () => {
    const source = '\uFEFF---\r\nexample: "```mermaid"\r\n---\r\n' + block.replace(/\n/g, '\r\n');
    expect(locateFence(source, 3).code).toBe(code);
  });
  it('does not guess past unclosed frontmatter', () => {
    expect(mermaidFences('---\nproperty: example\n' + block)).toEqual([]);
  });
  it('preserves CRLF and surrounding bytes', () => {
    const source = text.replace(/\n/g, '\r\n');
    const snapshot = locateFence(source, 2);
    const result = prepareEdit(snapshot, source, 'flowchart TD\n C --> D').text;
    expect(result).toBe(source.slice(0, snapshot.from) + 'flowchart TD\r\n C --> D\r\n' + source.slice(snapshot.to));
    expect(result.replace(/\r\n/g, '')).not.toContain('\n');
  });
  it('supports tilde and longer fences with info strings', () => {
    const source = '~~~~mermaid title\n' + code + '~~~~~';
    expect(locateFence(source, 0, 3).code).toBe(code);
  });
  it('refuses unterminated and indented/container fences', () => {
    expect(() => locateFence('```mermaid\n' + code, 0)).toThrow();
    expect(() => locateFence('  ```mermaid\n' + code + '  ```', 0)).toThrow();
    expect(() => locateFence('> ```mermaid\n> graph TD\n> A-->B\n> ```', 0)).toThrow();
  });
  it('rejects any concurrent edit, including outside the selected block', () => {
    const snapshot = locateFence(text, 2);
    expect(() => prepareEdit(snapshot, '# Added\n' + text, code)).toThrow('note changed');
    expect(() => prepareEdit(snapshot, text.replace('Tail', 'Changed'), code)).toThrow('note changed');
  });
  it('rejects fence injection and empty drafts', () => {
    const snapshot = locateFence(text, 2);
    expect(() => prepareEdit(snapshot, text, code + '```\n# New prose')).toThrow('without the surrounding');
    expect(() => prepareEdit(snapshot, text, '\n ')).toThrow('Enter some');
  });
  it('allows shorter literal fences within a longer enclosing fence', () => {
    const source = '````mermaid\n' + code + '````';
    expect(prepareEdit(locateFence(source, 0), source, code + '```').text).toContain('```\n````');
  });
  it('does not change a note on a no-op save', () => {
    const snapshot = locateFence(text, 2);
    expect(prepareEdit(snapshot, text, snapshot.code).text).toBe(text);
  });
});
