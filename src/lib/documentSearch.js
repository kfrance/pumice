/**
 * In-document search (Ctrl+F) for rendered markdown.
 * Highlights matches in the DOM and navigates between them.
 */
export class DocumentSearch {
  constructor() {
    this.container = null;
    this.marks = [];
    this.currentIndex = -1;
    this.query = '';
  }

  /**
   * Attach to a markdown container element.
   */
  attach(container) {
    this.container = container;
    this.clear();
  }

  /**
   * Perform a search, highlighting all matches.
   * Returns the count of matches found.
   */
  search(query) {
    this.clear();
    this.query = query;

    if (!query || !this.container) return 0;

    const walker = document.createTreeWalker(
      this.container,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      // Skip nodes inside <pre>, <code>, <script>, etc.
      const parent = node.parentElement;
      if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) continue;
      textNodes.push(node);
    }

    const queryLower = query.toLowerCase();

    for (const textNode of textNodes) {
      const text = textNode.textContent;
      const textLower = text.toLowerCase();
      let startIndex = 0;
      let matchIndex;

      const fragments = [];
      let lastEnd = 0;

      while ((matchIndex = textLower.indexOf(queryLower, startIndex)) !== -1) {
        // Text before match
        if (matchIndex > lastEnd) {
          fragments.push(document.createTextNode(text.slice(lastEnd, matchIndex)));
        }

        // Create highlight mark
        const mark = document.createElement('span');
        mark.className = 'search-mark';
        mark.textContent = text.slice(matchIndex, matchIndex + query.length);
        fragments.push(mark);
        this.marks.push(mark);

        lastEnd = matchIndex + query.length;
        startIndex = lastEnd;
      }

      if (fragments.length > 0) {
        // Text after last match
        if (lastEnd < text.length) {
          fragments.push(document.createTextNode(text.slice(lastEnd)));
        }

        // Replace the text node with fragments
        const wrapper = document.createDocumentFragment();
        for (const frag of fragments) {
          wrapper.appendChild(frag);
        }
        textNode.parentNode.replaceChild(wrapper, textNode);
      }
    }

    // Activate first match
    if (this.marks.length > 0) {
      this.currentIndex = 0;
      this.marks[0].classList.add('active');
      this.marks[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    return this.marks.length;
  }

  /**
   * Navigate to the next match.
   */
  next() {
    if (this.marks.length === 0) return;

    this.marks[this.currentIndex]?.classList.remove('active');
    this.currentIndex = (this.currentIndex + 1) % this.marks.length;
    this.marks[this.currentIndex].classList.add('active');
    this.marks[this.currentIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /**
   * Navigate to the previous match.
   */
  prev() {
    if (this.marks.length === 0) return;

    this.marks[this.currentIndex]?.classList.remove('active');
    this.currentIndex = (this.currentIndex - 1 + this.marks.length) % this.marks.length;
    this.marks[this.currentIndex].classList.add('active');
    this.marks[this.currentIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /**
   * Get current match info.
   */
  getStatus() {
    if (this.marks.length === 0) return '';
    return `${this.currentIndex + 1} of ${this.marks.length}`;
  }

  /**
   * Clear all highlights and reset state.
   */
  clear() {
    // Remove mark spans, restoring original text nodes
    for (const mark of this.marks) {
      if (mark.parentNode) {
        mark.parentNode.replaceChild(
          document.createTextNode(mark.textContent),
          mark
        );
      }
    }
    // Normalize to merge adjacent text nodes
    if (this.container) {
      this.container.normalize();
    }
    this.marks = [];
    this.currentIndex = -1;
    this.query = '';
  }
}
