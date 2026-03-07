import MarkdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItTaskLists from 'markdown-it-task-lists';
import hljs from 'highlight.js';
import katex from 'katex';

/**
 * Create a configured markdown-it instance.
 * Handles: GFM, syntax highlighting, task lists, heading anchors, KaTeX math, mermaid.
 */
export function createMarkdownRenderer() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    highlight(str, lang) {
      // Mermaid blocks are handled separately
      if (lang === 'mermaid') {
        return `<div class="mermaid">${escapeHtml(str)}</div>`;
      }
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
        } catch { /* fallback */ }
      }
      try {
        return hljs.highlightAuto(str).value;
      } catch { /* fallback */ }
      return '';
    },
  });

  // Task lists
  md.use(markdownItTaskLists, { enabled: true, label: true });

  // Heading anchors
  md.use(markdownItAnchor, {
    permalink: false,
    slugify: (s) => s.toLowerCase().replace(/[^\w]+/g, '-').replace(/(^-|-$)/g, ''),
  });

  // Inline math: $...$
  md.inline.ruler.after('escape', 'math_inline', (state, silent) => {
    if (state.src[state.pos] !== '$') return false;
    // Don't match $$ (block math)
    if (state.src[state.pos + 1] === '$') return false;

    const start = state.pos + 1;
    let end = start;
    while (end < state.src.length) {
      if (state.src[end] === '$' && state.src[end - 1] !== '\\') break;
      end++;
    }
    if (end >= state.src.length) return false;

    if (!silent) {
      const token = state.push('math_inline', 'math', 0);
      token.content = state.src.slice(start, end);
      token.markup = '$';
    }
    state.pos = end + 1;
    return true;
  });

  md.renderer.rules.math_inline = (tokens, idx) => {
    try {
      return katex.renderToString(tokens[idx].content, { throwOnError: false, displayMode: false });
    } catch {
      return `<code>${escapeHtml(tokens[idx].content)}</code>`;
    }
  };

  // Block math: $$...$$
  md.block.ruler.after('fence', 'math_block', (state, startLine, endLine, silent) => {
    const startPos = state.bMarks[startLine] + state.tShift[startLine];
    if (state.src.slice(startPos, startPos + 2) !== '$$') return false;

    let nextLine = startLine + 1;
    while (nextLine < endLine) {
      const pos = state.bMarks[nextLine] + state.tShift[nextLine];
      if (state.src.slice(pos, pos + 2) === '$$') break;
      nextLine++;
    }
    if (nextLine >= endLine) return false;

    if (!silent) {
      const token = state.push('math_block', 'math', 0);
      token.content = state.getLines(startLine + 1, nextLine, state.tShift[startLine], false).trim();
      token.markup = '$$';
      token.map = [startLine, nextLine + 1];
    }
    state.line = nextLine + 1;
    return true;
  });

  md.renderer.rules.math_block = (tokens, idx) => {
    try {
      return `<div class="katex-display">${katex.renderToString(tokens[idx].content, { throwOnError: false, displayMode: true })}</div>`;
    } catch {
      return `<pre><code>${escapeHtml(tokens[idx].content)}</code></pre>`;
    }
  };

  return md;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Parse YAML frontmatter and return { frontmatter, content }.
 * Uses gray-matter-like parsing (simple regex-based to avoid bundling gray-matter).
 */
export function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: null, content: raw };

  const yamlStr = match[1];
  const content = raw.slice(match[0].length);
  const frontmatter = {};

  // Simple YAML parser — handles key: value, key: [array], nested is flattened
  for (const line of yamlStr.split('\n')) {
    const kvMatch = line.match(/^(\w[\w\s]*?):\s*"?(.+?)"?\s*$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      let value = kvMatch[2].trim();
      // Remove surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  // Parse array values (YAML lists: - item)
  const arrayRegex = /^(\w[\w\s]*?):\s*$/gm;
  let arrayMatch;
  while ((arrayMatch = arrayRegex.exec(yamlStr)) !== null) {
    const key = arrayMatch[1].trim();
    const afterKey = yamlStr.slice(arrayMatch.index + arrayMatch[0].length);
    const items = [];
    for (const itemLine of afterKey.split('\n')) {
      const itemMatch = itemLine.match(/^\s*-\s+(.+)/);
      if (itemMatch) {
        items.push(itemMatch[1].trim().replace(/^["']|["']$/g, ''));
      } else if (itemLine.trim() && !itemLine.match(/^\s*-/)) {
        break;
      }
    }
    if (items.length > 0) {
      frontmatter[key] = items;
    }
  }

  return { frontmatter, content };
}

/**
 * Render frontmatter as an Obsidian-style properties table HTML.
 */
export function renderFrontmatter(frontmatter) {
  if (!frontmatter || Object.keys(frontmatter).length === 0) return '';

  let html = '<div class="frontmatter-table">';
  for (const [key, value] of Object.entries(frontmatter)) {
    html += '<div class="frontmatter-row">';
    html += `<span class="frontmatter-key">${escapeHtml(key)}</span>`;
    html += '<span class="frontmatter-value">';

    if (Array.isArray(value)) {
      if (key === 'tags') {
        html += value.map(v => `<span class="frontmatter-tag">${escapeHtml(v)}</span>`).join('');
      } else {
        html += value.map(v => `<span class="frontmatter-source">${escapeHtml(v)}</span>`).join('');
      }
    } else {
      html += escapeHtml(String(value));
    }

    html += '</span></div>';
  }
  html += '</div>';
  return html;
}

/**
 * Transform markdown links to internal files to have data-internal attribute.
 * This allows the renderer to intercept clicks.
 */
export function transformInternalLinks(html, currentFilePath) {
  // Replace <a href="something.md"> with data-internal attribute
  return html.replace(
    /<a\s+href="([^"]+\.md(?:#[^"]*)?)">/g,
    (match, href) => {
      // Skip external URLs
      if (href.startsWith('http://') || href.startsWith('https://')) return match;
      return `<a href="${href}" data-internal="true">`;
    }
  );
}

/**
 * Full render pipeline: frontmatter + markdown + link transformation.
 */
export function renderMarkdown(raw, md, filePath) {
  const { frontmatter, content } = parseFrontmatter(raw);
  let html = '';

  if (frontmatter) {
    html += renderFrontmatter(frontmatter);
  }

  html += md.render(content);
  html = transformInternalLinks(html, filePath);

  return html;
}
