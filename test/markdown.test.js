import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMarkdownRenderer,
  parseFrontmatter,
  renderFrontmatter,
  transformInternalLinks,
  renderMarkdown,
} from '../src/lib/markdown.js';

// ─── Frontmatter Parsing ────────────────────────────────────────────────────

describe('Frontmatter Parsing', () => {
  it('parses YAML frontmatter with simple key-value pairs', () => {
    const raw = `---
title: "1 Nephi 7"
source_url: https://example.com
verse_count: 22
---

# 1 Nephi 7

Content here.`;

    const { frontmatter, content } = parseFrontmatter(raw);
    expect(frontmatter.title).toBe('1 Nephi 7');
    expect(frontmatter.source_url).toBe('https://example.com');
    expect(frontmatter.verse_count).toBe('22');
    expect(content).toContain('# 1 Nephi 7');
    expect(content).not.toContain('---');
  });

  it('returns null frontmatter when there is no frontmatter', () => {
    const raw = '# Just a heading\n\nSome content.';
    const { frontmatter, content } = parseFrontmatter(raw);
    expect(frontmatter).toBeNull();
    expect(content).toBe(raw);
  });

  it('does not treat --- in the middle of a document as frontmatter', () => {
    const raw = `# Heading

Some text.

---

More text.`;

    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter).toBeNull();
  });

  it('strips the frontmatter from the returned content', () => {
    const raw = `---
title: Test
---
# Heading`;

    const { content } = parseFrontmatter(raw);
    expect(content.trim()).toBe('# Heading');
  });
});

// ─── Frontmatter Rendering ──────────────────────────────────────────────────

describe('Frontmatter Rendering', () => {
  it('renders frontmatter as a properties table', () => {
    const html = renderFrontmatter({ title: '1 Nephi 7', verse_count: '22' });
    expect(html).toContain('frontmatter-table');
    expect(html).toContain('1 Nephi 7');
    expect(html).toContain('22');
    expect(html).toContain('title');
    expect(html).toContain('verse_count');
  });

  it('renders tags as colored badges', () => {
    const html = renderFrontmatter({
      tags: ['atonement', 'book-of-mormon', 'jesus-christ'],
    });
    expect(html).toContain('frontmatter-tag');
    expect(html).toContain('atonement');
    expect(html).toContain('book-of-mormon');
    expect(html).toContain('jesus-christ');
  });

  it('renders sources as pill badges', () => {
    const html = renderFrontmatter({
      sources: ['Book of Mormon', 'Bible'],
    });
    expect(html).toContain('frontmatter-source');
    expect(html).toContain('Book of Mormon');
    expect(html).toContain('Bible');
  });

  it('returns empty string for null/empty frontmatter', () => {
    expect(renderFrontmatter(null)).toBe('');
    expect(renderFrontmatter({})).toBe('');
  });

  it('escapes HTML in frontmatter values', () => {
    const html = renderFrontmatter({ title: '<script>alert("xss")</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ─── Markdown Rendering ─────────────────────────────────────────────────────

describe('Markdown Rendering', () => {
  let md;

  beforeEach(() => {
    md = createMarkdownRenderer();
  });

  it('renders headings', () => {
    const html = md.render('# Hello World');
    expect(html).toContain('<h1');
    expect(html).toContain('Hello World');
  });

  it('renders paragraphs', () => {
    const html = md.render('Some text.\n\nAnother paragraph.');
    expect(html).toContain('<p>Some text.</p>');
    expect(html).toContain('<p>Another paragraph.</p>');
  });

  it('renders bold and italic', () => {
    const html = md.render('**bold** and *italic*');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders links', () => {
    const html = md.render('[Example](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('Example');
  });

  it('renders code blocks with syntax highlighting', () => {
    const html = md.render('```javascript\nconst x = 42;\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code');
    // highlight.js adds span elements for tokens
    expect(html).toContain('hljs');
  });

  it('renders inline code', () => {
    const html = md.render('Use `npm install` to install.');
    expect(html).toContain('<code>npm install</code>');
  });

  it('renders tables', () => {
    const html = md.render('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>1</td>');
  });

  it('renders task lists', () => {
    const html = md.render('- [x] Done\n- [ ] Todo');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked');
  });

  it('renders blockquotes', () => {
    const html = md.render('> This is a quote');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('This is a quote');
  });

  it('renders horizontal rules', () => {
    const html = md.render('---');
    expect(html).toContain('<hr>');
  });

  it('renders images', () => {
    const html = md.render('![alt text](image.png)');
    expect(html).toContain('<img');
    expect(html).toContain('src="image.png"');
    expect(html).toContain('alt="alt text"');
  });

  it('renders mermaid code blocks as diagram containers', () => {
    const html = md.render('```mermaid\ngraph TD\n  A --> B\n```');
    expect(html).toContain('class="mermaid"');
    expect(html).toContain('graph TD');
  });

  it('adds id anchors to headings', () => {
    const html = md.render('## My Section');
    expect(html).toMatch(/id="my-section"/);
  });
});

// ─── Inline Math ────────────────────────────────────────────────────────────

describe('Inline Math (KaTeX)', () => {
  let md;

  beforeEach(() => {
    md = createMarkdownRenderer();
  });

  it('renders inline math $...$', () => {
    const html = md.render('The equation $E = mc^2$ is famous.');
    expect(html).toContain('katex');
    expect(html).not.toContain('$E');
  });

  it('renders block math $$...$$', () => {
    const html = md.render('$$\nE = mc^2\n$$');
    expect(html).toContain('katex-display');
  });
});

// ─── Internal Link Transformation ───────────────────────────────────────────

describe('Internal Link Transformation', () => {
  it('adds data-internal attribute to .md links', () => {
    const html = '<a href="other.md">link</a>';
    const result = transformInternalLinks(html, '/test/file.md');
    expect(result).toContain('data-internal="true"');
  });

  it('preserves anchor in internal links', () => {
    const html = '<a href="other.md#section">link</a>';
    const result = transformInternalLinks(html, '/test/file.md');
    expect(result).toContain('href="other.md#section"');
    expect(result).toContain('data-internal="true"');
  });

  it('does not transform external HTTP links', () => {
    const html = '<a href="https://example.com/file.md">link</a>';
    const result = transformInternalLinks(html, '/test/file.md');
    expect(result).not.toContain('data-internal');
  });

  it('does not transform non-.md links', () => {
    const html = '<a href="image.png">image</a>';
    const result = transformInternalLinks(html, '/test/file.md');
    expect(result).not.toContain('data-internal');
  });

  it('does not transform church-style relative links without .md extension', () => {
    const html = '<a href="/study/scriptures/dc-testament/dc/107?lang=eng&id=p99#p99">link</a>';
    const result = transformInternalLinks(html, '/test/file.md');
    expect(result).not.toContain('data-internal');
  });

  it('does not transform anchor-only links', () => {
    const html = '<a href="#heading-1">link</a>';
    const result = transformInternalLinks(html, '/test/file.md');
    expect(result).not.toContain('data-internal');
  });

  it('does not transform mailto links', () => {
    const html = '<a href="mailto:test@example.com">email</a>';
    const result = transformInternalLinks(html, '/test/file.md');
    expect(result).not.toContain('data-internal');
  });
});

// ─── Full Render Pipeline ───────────────────────────────────────────────────

describe('Full Render Pipeline', () => {
  let md;

  beforeEach(() => {
    md = createMarkdownRenderer();
  });

  it('renders a complete file with frontmatter and content', () => {
    const raw = `---
title: "1 Nephi 7"
verse_count: 22
---

# 1 Nephi 7

See [next chapter](1-ne-8.md) for more.

**1** I, Nephi, having been born of goodly parents.`;

    const html = renderMarkdown(raw, md, '/test/1-ne-7.md');

    // Frontmatter
    expect(html).toContain('frontmatter-table');
    expect(html).toContain('1 Nephi 7');

    // Heading
    expect(html).toContain('<h1');

    // Internal link with data-internal
    expect(html).toContain('data-internal="true"');
    expect(html).toContain('1-ne-8.md');

    // Bold verse number
    expect(html).toContain('<strong>1</strong>');
  });

  it('renders a file with no frontmatter', () => {
    const raw = '# Simple\n\nJust content.';
    const html = renderMarkdown(raw, md, '/test/simple.md');
    expect(html).not.toContain('frontmatter-table');
    expect(html).toContain('<h1');
    expect(html).toContain('Just content.');
  });
});
