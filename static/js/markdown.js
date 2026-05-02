// Markdown + LaTeX rendering.
//
// Strategy: before running marked, stash every LaTeX block in a side
// array (replacing it with a sentinel).  After markdown is rendered,
// restore each block by running it through KaTeX.  DOMPurify sanitises
// the final HTML while allowing the extra tags KaTeX and SVG need.

marked.setOptions({ breaks: true, gfm: true });

const PURIFY_CONFIG = {
  ADD_TAGS: [
    'math','semantics','mrow','mi','mo','mn','mfrac','msup','msub',
    'mspace','mtext','annotation','svg','path','use','defs','g',
  ],
  ADD_ATTR: [
    'class','style','xmlns','viewBox','d','fill','stroke',
    'href','xlink:href','width','height','aria-hidden',
  ],
};

export function renderMarkdown(text) {
  const latexBlocks = [];
  const stash = (block) => {
    latexBlocks.push(block);
    return `\x02LATEX${latexBlocks.length - 1}\x03`;
  };

  // Protect LaTeX from the Markdown parser.
  const safeText = text
    .replace(/\$\$[\s\S]+?\$\$/g, m => stash({ type: 'block',  src: m }))
    .replace(/\$[^\$\n]+?\$/g,    m => stash({ type: 'inline', src: m }));

  let html = marked.parse(safeText);

  // Restore LaTeX blocks as rendered KaTeX.
  latexBlocks.forEach(({ type, src }, i) => {
    const math = src.replace(/^\$+|\$+$/g, '').trim();
    try {
      html = html.replace(
        `\x02LATEX${i}\x03`,
        katex.renderToString(math, { displayMode: type === 'block', throwOnError: false }),
      );
    } catch {
      html = html.replace(`\x02LATEX${i}\x03`, src);
    }
  });

  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}

export function applyMarkdown(el, text) {
  el.innerHTML = renderMarkdown(text);
  el.querySelectorAll('pre code').forEach(block => {
    hljs.highlightElement(block);
    const btn = document.createElement('button');
    btn.className = 'code-copy';
    btn.textContent = 'copy';
    btn.onclick = () => {
      navigator.clipboard.writeText(block.innerText);
      btn.textContent = 'copied!';
      setTimeout(() => { btn.textContent = 'copy'; }, 1500);
    };
    block.parentElement.appendChild(btn);
  });
}
