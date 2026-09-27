/** Exact source slices, never SVG text or a diagram's ordinal in the DOM. */
export interface FenceSnapshot {
  document: string;
  code: string;
  from: number;
  to: number;
  lineStart: number;
  lineEnd: number;
  fence: string;
  eol: string;
}

export const normalizeNewlines = (text: string): string => text.replace(/\r\n/g, '\n');

export function mermaidFences(text: string): FenceSnapshot[] {
  const lines = text.split('\n');
  const blocks: FenceSnapshot[] = [];
  let offset = 0;
  // Obsidian frontmatter is YAML, not Markdown (it can contain literal fences).
  let inFrontmatter = lines[0]?.replace(/^\uFEFF/, '').replace(/\r$/, '') === '---';
  let open: { fence: string; language: string; line: number; from: number; eol: string } | undefined;
  for (let line = 0; line < lines.length; line++) {
    const raw = lines[line]!;
    const content = raw.replace(/\r$/, '');
    if (inFrontmatter) {
      if (line > 0 && /^(---|\.\.\.)[ \t]*$/.test(content)) inFrontmatter = false;
      offset += raw.length + 1;
      continue;
    }
    if (open) {
      const close = content.match(/^ {0,3}(`+|~+)[ \t]*$/);
      if (close && close[1]![0] === open.fence[0] && close[1]!.length >= open.fence.length) {
        if (open.language === 'mermaid') blocks.push({
          document: text, code: normalizeNewlines(text.slice(open.from, offset)),
          from: open.from, to: offset, lineStart: open.line, lineEnd: line,
          fence: open.fence, eol: open.eol,
        });
        open = undefined;
      }
    } else {
      const match = content.match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/);
      // Backticks are not allowed in a backtick fence's info string.
      if (match && !(match[1]![0] === '`' && match[2]!.includes('`'))) {
        open = { fence: match[1]!, language: match[2]!.trim().split(/\s+/)[0]!.toLowerCase(), line,
          from: offset + raw.length + 1, eol: raw.endsWith('\r') ? '\r\n' : '\n' };
      }
    }
    offset += raw.length + 1;
  }
  return blocks;
}

export function locateFence(text: string, lineStart: number, lineEnd?: number): FenceSnapshot {
  const blocks = mermaidFences(text).filter(block => lineEnd === undefined
    ? block.lineStart === lineStart
    : block.lineStart === lineStart && block.lineEnd === lineEnd);
  if (blocks.length !== 1 || /^[ \t]/.test(text.split('\n')[lineStart] ?? '')) throw new Error('Cannot safely identify a top-level Mermaid code block here. Open it in the note’s source editor. Nested, indented, or unclosed fences are not supported.');
  return blocks[0]!;
}

export function prepareEdit(snapshot: FenceSnapshot, current: string, code: string): { text: string; insert: string } {
  if (current !== snapshot.document) throw new Error('The note changed while you were editing. Nothing was overwritten. Copy your draft, then close and reopen the current diagram.');
  const normalized = normalizeNewlines(code);
  if (!normalized.trim()) throw new Error('Enter some Mermaid code before saving.');
  if (normalized.split('\n').some(line => {
    const close = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
    return close && close[1]![0] === snapshot.fence[0] && close[1]!.length >= snapshot.fence.length;
  })) throw new Error('Enter Mermaid code only, without the surrounding code-block fences.');
  const insert = (normalized.endsWith('\n') ? normalized : normalized + '\n').replace(/\n/g, snapshot.eol);
  return { text: current.slice(0, snapshot.from) + insert + current.slice(snapshot.to), insert };
}
