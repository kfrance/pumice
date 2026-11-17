// Mermaid paints each shape from a `<style>` element it builds partly from the
// diagram text (init directives and classDef). That CSS reaches the whole page
// unless the diagram has its own shadow root. The style stays; only its reach changes.

const MERMAID_SHADOW_CSS = "svg{max-width:100%;height:auto}";

export function placeDiagramSvg(node, svg) {
  // HTML fragment parsing keeps Mermaid's `<style>` inside the SVG, including
  // CSS `&`. XML parsing rejects that, and the fragment is not the live page.
  const template = document.createElement("template");
  template.innerHTML = svg;
  const svgEl = template.content.querySelector("svg");
  if (!svgEl) return false;

  // `pre` cannot host a shadow root, and the source text must leave the light DOM.
  const host = document.createElement("div");
  host.className = "mermaid mermaid-diagram";
  const root = host.attachShadow({ mode: "open" });
  const pageRule = document.createElement("style");
  pageRule.textContent = MERMAID_SHADOW_CSS;
  root.replaceChildren(pageRule, svgEl);
  node.replaceWith(host);
  return root;
}

// Mermaid looks the diagram up from document.body, then inserts its stylesheet
// and awaits layout. A shadow root keeps that stylesheet off the page, so the
// lookup has to see into that root. Diagrams share the lookup, so they run
// one at a time. Link binding uses the same lookup after the SVG is mounted.
let shadowStage = Promise.resolve();

function enqueueDiagram(work) {
  const run = shadowStage.then(work);
  shadowStage = run.then(() => {}, () => {});
  return run;
}

function withDiagramLookup(shadow, id, work) {
  const view = document.defaultView;
  const elementQuery = view.Element.prototype.querySelector;
  const elementQueryAll = view.Element.prototype.querySelectorAll;
  const documentQuery = view.Document.prototype.querySelector;
  const documentQueryAll = view.Document.prototype.querySelectorAll;
  const getById = view.Document.prototype.getElementById;
  const forThisDiagram = (selector) => typeof selector === "string" && selector.includes(id);
  const fromShadow = (selector) => (forThisDiagram(selector) ? shadow.querySelector(selector) : null);
  const fromShadowAll = (selector) => (forThisDiagram(selector) ? shadow.querySelectorAll(selector) : null);
  const onPage = (node) => node === document.body || node === document.documentElement;

  view.Element.prototype.querySelector = function (selector) {
    const found = elementQuery.call(this, selector);
    if (found || !onPage(this)) return found;
    return fromShadow(selector);
  };
  view.Element.prototype.querySelectorAll = function (selector) {
    const found = elementQueryAll.call(this, selector);
    if (found.length || !onPage(this)) return found;
    return fromShadowAll(selector) || found;
  };
  view.Document.prototype.querySelector = function (selector) {
    return documentQuery.call(this, selector) || fromShadow(selector);
  };
  view.Document.prototype.querySelectorAll = function (selector) {
    const found = documentQueryAll.call(this, selector);
    if (found.length) return found;
    return fromShadowAll(selector) || found;
  };
  view.Document.prototype.getElementById = function (elementId) {
    return getById.call(this, elementId) || fromShadow(`#${elementId}`);
  };

  return Promise.resolve()
    .then(work)
    .finally(() => {
      view.Element.prototype.querySelector = elementQuery;
      view.Element.prototype.querySelectorAll = elementQueryAll;
      view.Document.prototype.querySelector = documentQuery;
      view.Document.prototype.querySelectorAll = documentQueryAll;
      view.Document.prototype.getElementById = getById;
    });
}

export async function mountMermaidBlocks(container, mermaid, theme = "default") {
  if (!container || !mermaid) return;
  const nodes = [...container.querySelectorAll(".mermaid:not(.mermaid-diagram)")].filter(
    (node) => node.dataset.mermaidState !== "pending",
  );
  if (nodes.length === 0) return;

  // Claim the blocks before the first await. A second mount can start while
  // Mermaid is still loading, and it must not draw these nodes again.
  for (const node of nodes) node.dataset.mermaidState = "pending";
  try {
    await mermaid.initialize({
      startOnLoad: false,
      theme,
      securityLevel: "strict",
      suppressErrorRendering: true,
      htmlLabels: false,
      flowchart: { htmlLabels: false },
    });
  } catch (error) {
    for (const node of nodes) delete node.dataset.mermaidState;
    throw error;
  }

  for (const node of nodes) {
    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    try {
      await enqueueDiagram(async () => {
        const host = document.createElement("div");
        host.style.cssText = "position:fixed;left:0;top:0;width:1000px;transform:translateX(-100vw);pointer-events:none";
        const shadow = host.attachShadow({ mode: "open" });
        const stage = document.createElement("div");
        shadow.append(stage);
        document.body.append(host);
        try {
          const { svg, bindFunctions } = await withDiagramLookup(shadow, id, () =>
            mermaid.render(id, node.textContent ?? "", stage),
          );
          const root = placeDiagramSvg(node, svg);
          if (!root) delete node.dataset.mermaidState;
          else if (bindFunctions) await withDiagramLookup(root, id, () => bindFunctions(root));
        } finally {
          host.remove();
          // A failed render can leave Mermaid's temporary `d${id}` node, and its
          // CSS, on the page.
          document.getElementById(`d${id}`)?.remove();
          document.getElementById(`i${id}`)?.remove();
        }
      });
    } catch {
      delete node.dataset.mermaidState;
    }
  }
}
