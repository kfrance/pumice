// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mountMermaidBlocks, placeDiagramSvg } from '../src/lib/mermaid.js';

// Mermaid builds this rule from the diagram's init directive. Outside a shadow
// root it restyles the whole window.
const injected = ':not(&){background:rgb(1,2,3)!important}';

function svgFor(id) {
  return `<svg xmlns="http://www.w3.org/2000/svg" id="${id}"><style>#${id}{font-family:x;a{b} ${injected} c{d}}</style><text>X</text></svg>`;
}

describe('mermaid containment', () => {
  it('keeps a diagram\'s own CSS inside the diagram, away from the page', async () => {
    document.body.innerHTML = '<div id="view"><div class="mermaid">%%{init: {}}%%\ngraph TD\nX-->Y</div></div>';
    const view = document.getElementById('view');

    await mountMermaidBlocks(view, {
      initialize: () => {},
      render: async (id) => ({ svg: svgFor(id) }),
    });

    const host = view.querySelector('.mermaid-diagram');
    const diagramCss = [...host.shadowRoot.querySelectorAll('style')].map((style) => style.textContent).join('');
    expect(diagramCss).toContain(injected);
    expect(host.shadowRoot.textContent).toContain('X');
    expect([...document.querySelectorAll('style')].some((style) => style.textContent?.includes(injected))).toBe(false);
    expect(view.innerHTML).not.toContain(injected);
  });

  it('does not treat a non-svg payload as a diagram', () => {
    const host = document.createElement('div');
    host.className = 'mermaid';
    host.textContent = 'graph TD\nA-->B';
    document.body.append(host);

    expect(placeDiagramSvg(host, `<div><style>${injected}</style></div>`)).toBe(false);
    expect(host.textContent).toContain('graph TD');
    expect(host.shadowRoot).toBeNull();
    expect(document.body.innerHTML).not.toContain(injected);
  });

  it('leaves the source visible when rendering fails', async () => {
    document.body.innerHTML = '<div id="view"><div class="mermaid">not a diagram</div></div>';
    const view = document.getElementById('view');

    await mountMermaidBlocks(view, {
      initialize: () => {},
      render: async () => {
        throw new Error('bad diagram');
      },
    });

    expect(view.querySelector('.mermaid').textContent).toContain('not a diagram');
    expect(view.querySelector('.mermaid-diagram')).toBeNull();
  });

  it('renders with strict mode and no html labels', async () => {
    document.body.innerHTML = '<div id="view"><div class="mermaid">graph TD\nA-->B</div></div>';
    let config;
    await mountMermaidBlocks(document.getElementById('view'), {
      initialize: (next) => {
        config = next;
      },
      render: async (id) => ({ svg: `<svg xmlns="http://www.w3.org/2000/svg" id="${id}"></svg>` }),
    }, 'dark');

    expect(config).toEqual({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'strict',
      suppressErrorRendering: true,
      htmlLabels: false,
      flowchart: { htmlLabels: false },
    });
  });

  it('draws in a shadow stage and binds tooltips inside that diagram', async () => {
    document.body.innerHTML = '<div id="view"><div class="mermaid">graph TD\nA-->B</div></div>';
    const view = document.getElementById('view');
    const documentQuery = document.defaultView.Document.prototype.querySelector;
    let sawStageStyle = false;
    let bound = null;

    await mountMermaidBlocks(view, {
      initialize: () => {},
      render: async (id, _text, stage) => {
        const style = document.createElement('style');
        style.textContent = injected;
        stage.append(style);
        const box = document.createElement('div');
        box.id = id;
        const divider = document.createElement('div');
        divider.className = 'divider';
        box.append(divider);
        stage.append(box);
        sawStageStyle = [...document.querySelectorAll('style')].some((node) => node.textContent?.includes(injected));
        const dividers = document.querySelectorAll(`#${id} .divider`);
        if (dividers.length !== 1) throw new Error('divider lookup missed the stage');
        return {
          svg: `${svgFor(id).replace('</svg>', `<g id="${id}-task"></g></svg>`)}`,
          bindFunctions() {
            bound = document.querySelector(`[id="${id}-task"]`);
          },
        };
      },
    });

    const host = view.querySelector('.mermaid-diagram');
    expect(sawStageStyle).toBe(false);
    expect(bound?.id).toBe(`${host.shadowRoot.querySelector('svg').id}-task`);
    expect(bound.getRootNode()).toBe(host.shadowRoot);
    expect([...document.body.children].map((node) => node.id)).toEqual(['view']);
    expect(document.defaultView.Document.prototype.querySelector).toBe(documentQuery);
  });

  it('runs overlapping renders one at a time and restores lookup', async () => {
    document.body.innerHTML = '<div id="a"><div class="mermaid">one</div></div><div id="b"><div class="mermaid">two</div></div>';
    const documentQuery = document.defaultView.Document.prototype.querySelector;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let started = 0;
    const mermaid = {
      initialize: () => {},
      render: async (id) => {
        started += 1;
        if (started === 1) await gate;
        return { svg: svgFor(id) };
      },
    };
    const first = mountMermaidBlocks(document.getElementById('a'), mermaid);
    const second = mountMermaidBlocks(document.getElementById('b'), mermaid);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started).toBe(1);
    release();
    await first;
    await second;
    expect(started).toBe(2);
    expect(document.defaultView.Document.prototype.querySelector).toBe(documentQuery);
    expect(document.querySelectorAll('.mermaid-diagram').length).toBe(2);
  });

  it('does not draw the same block twice when mounts overlap', async () => {
    document.body.innerHTML = '<div id="view"><div class="mermaid">one</div></div>';
    let started = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const mermaid = {
      initialize: () => {},
      render: async (id) => {
        started += 1;
        if (started === 1) await gate;
        return { svg: svgFor(id) };
      },
    };
    const view = document.getElementById('view');
    const first = mountMermaidBlocks(view, mermaid);
    const second = mountMermaidBlocks(view, mermaid);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started).toBe(1);
    release();
    await first;
    await second;
    expect(started).toBe(1);
    expect(view.querySelectorAll('.mermaid-diagram').length).toBe(1);
  });

  it('drops the temporary node mermaid leaves on the page when rendering fails', async () => {
    document.body.innerHTML = '<div id="view"><div class="mermaid">bad</div></div>';
    const view = document.getElementById('view');

    await mountMermaidBlocks(view, {
      initialize: () => {},
      render: async (id) => {
        const temp = document.createElement('div');
        temp.id = `d${id}`;
        const style = document.createElement('style');
        style.textContent = injected;
        temp.append(style);
        document.body.append(temp);
        throw new Error('bad diagram');
      },
    });

    expect(view.querySelector('.mermaid').textContent).toContain('bad');
    expect(document.getElementById('view').innerHTML).not.toContain(injected);
    expect([...document.querySelectorAll('style')].some((style) => style.textContent?.includes(injected))).toBe(false);
    expect([...document.body.children].some((node) => node.id.startsWith('dmermaid-'))).toBe(false);
  });
});
