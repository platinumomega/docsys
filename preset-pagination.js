// Single A4 page-fitting controller used directly by Quotation, PO and future presets.
// Called after render(), before the preview is visually scaled.
// Terms are kept together whenever possible; if longer than an A4 page,
// only complete numbered clauses are moved to the next page.
export function paginatePresetDocument(root, options = {}) {
  const first = root.querySelector('article.paper');
  if (!first || !first.getBoundingClientRect().width) return;
  const nodes = Array.from(first.children);
  first.replaceChildren();
  const requestedFit = ['flow','auto','normal'].includes(options.fit) ? options.fit : 'flow';
  const mm = 96 / 25.4;
  let page = first;

  function nextPage() {
    page = document.createElement('article');
    page.className = 'paper';
    root.appendChild(page);
    return page;
  }
  function fits(node) {
    const pr = page.getBoundingClientRect();
    const nr = node.getBoundingClientRect();
    const scale = pr.width / (210 * mm);
    // Measure against the actual A4 content bottom, accounting for the page's
    // configured padding, rather than assuming one fixed preset padding.
    const paddingBottom = parseFloat(getComputedStyle(page).paddingBottom) || 0;
    const pageBottom = pr.top + (297 * mm * scale) - paddingBottom * scale - 2 * mm * scale;
    return nr.bottom <= pageBottom + 0.5;
  }
  function appendWhole(node) {
    page.appendChild(node);
    if (!fits(node) && page.children.length > 1) {
      node.remove();
      nextPage().appendChild(node);
    }
  }
  function termsSize(section, preferred) {
    const body = section.querySelector('.excel-terms');
    if (!body) return true;
    const sizes = [preferred];
    if (requestedFit === 'auto') {
      for (let n = preferred - 0.5; n >= 6.5; n -= 0.5) sizes.push(n);
      if (sizes[sizes.length - 1] !== 6.5) sizes.push(6.5);
    }
    // Auto Fit measures the complete trailing material through the signature
    // table (including intervening paragraphs). Works for Quotation, PO,
    // and subsequent document families without family-specific code.
    const sectionIndex=nodes.indexOf(section);
    const firstTermsIndex=nodes.findIndex(n=>n.matches?.('section.excel-terms-section'));
    const searchFrom=sectionIndex>=0?sectionIndex+1:firstTermsIndex+1;
    const followingIndex=nodes.findIndex((n,i)=>i>=searchFrom && n.matches?.('table.excel-sign-table, table.po-signatures'));
    const following=requestedFit==='auto'&&followingIndex>=0
      ? nodes.slice(searchFrom,followingIndex+1)
      : [];
    let sectionFits = false;
    for (const n of sizes) {
      body.style.fontSize = n + 'pt';
      section.style.setProperty('--term-gap', n < preferred ? '1mm' : '1.3mm');
      sectionFits = fits(section);
      if (!sectionFits) continue;
      if (!following.length) return true;
      const tests=following.map(n=>n.cloneNode(true));
      for(const test of tests)page.appendChild(test);
      const together=fits(tests[tests.length-1]);
      for(const test of tests)test.remove();
      if (together) return true;
    }
    // If signatures still cannot fit even at 6.5 pt, use that true minimum
    // and allow normal A4 pagination to move the signatures to page two.
    if (following.length && sectionFits) return true;
    return false;
  }
  function emptyTerms(original) {
    const section = original.cloneNode(false);
    const header = original.querySelector('.excel-terms-header');
    if (header) section.appendChild(header.cloneNode(true));
    const body = original.querySelector('.excel-terms').cloneNode(false);
    section.appendChild(body);
    return { section, body };
  }
  // Flow mode begins at the remaining space on page one and carries text
  // forward only after a whole word at the end of a rendered line.
  function appendTermsFlow(original) {
    const originalBody = original.querySelector('.excel-terms');
    if (!originalBody) { appendWhole(original); return; }
    const clauses = Array.from(originalBody.querySelectorAll(':scope > .excel-term'));
    const size = Math.max(6.5, Math.min(9, Number(options.size) || 8));
    const makeSection = () => {
      const part = emptyTerms(original);
      part.body.style.fontSize = size + 'pt';
      part.section.style.setProperty('--term-gap', '1.3mm');
      page.appendChild(part.section);
      return part;
    };
    let part = makeSection();
    // If even the heading cannot fit at the end of the page, begin on a fresh one.
    if (!fits(part.section) && page.children.length > 1) {
      part.section.remove();
      nextPage();
      part = makeSection();
    }
    function newPart() {
      nextPage();
      part = makeSection();
    }
    for (const clause of clauses) {
      // Preserve structured lines (e.g. PO Clause 6 a/b/c contacts) as
      // real elements. Moving the whole clause prevents labels and values
      // from being collapsed by the word-splitting algorithm.
      if (clause.querySelector('.po-clause6-lines, .po-clause6-line')) {
        part.body.appendChild(clause);
        if (!fits(part.section)) {
          clause.remove();
          if (part.body.children.length === 0) part.section.remove();
          newPart();
          part.body.appendChild(clause);
        }
        continue;
      }
      const originalText = clause.querySelector('.term-text');
      if (!originalText) {
        part.body.appendChild(clause);
        if (!fits(part.section) && part.body.children.length > 1) {
          clause.remove(); newPart(); part.body.appendChild(clause);
        }
        continue;
      }
      const heading = originalText.querySelector('strong');
      // The current preset renderer stores the clause heading in <strong>,
      // followed by plain text. Retain exact wording and whitespace.
      const bodyText = Array.from(originalText.childNodes)
        .filter(n => n !== heading).map(n => n.textContent).join('');
      const words = bodyText.match(/\s*\S+\s*/g) || [bodyText];
      let offset = 0, firstFragment = true;
      while (offset < words.length) {
        const fragment = clause.cloneNode(true);
        const text = fragment.querySelector('.term-text');
        text.replaceChildren();
        if (firstFragment && heading) text.appendChild(heading.cloneNode(true));
        if (!firstFragment) {
          const number = fragment.querySelector('.term-num');
          if (number) number.textContent = '';
          fragment.classList.add('excel-term-continuation');
        }
        part.body.appendChild(fragment);
        const setWords = count => {
          const trailing = words.slice(offset, offset + count).join('');
          // Preserve one separating space following the bold clause heading.
          if (text.lastChild?.nodeType === Node.TEXT_NODE) text.lastChild.remove();
          text.appendChild(document.createTextNode(trailing));
        };
        // First find the largest number of words that fits on this page.
        // This places the break after a complete word on a completed line.
        let low = 0, high = words.length - offset;
        while (low < high) {
          const mid = Math.ceil((low + high) / 2);
          setWords(mid);
          if (fits(part.section)) low = mid;
          else high = mid - 1;
        }
        setWords(low);
        if (low === 0) {
          fragment.remove();
          // Avoid empty-page loops in very narrow or unusually styled pages.
          if (part.body.children.length === 0 && page.children.length === 1) {
            setWords(1);
            part.body.appendChild(fragment);
            offset++;
            firstFragment = false;
          }
          newPart();
          continue;
        }
        offset += low;
        firstFragment = false;
        if (offset < words.length) newPart();
      }
    }
    // Remove empty trailing terms header from a boundary page.
    if (!part.body.children.length) part.section.remove();
  }
  function appendTerms(original) {
    const preferred = Math.max(6.5, Math.min(9, Number(options.size) || 8));
    page.appendChild(original);
    if (termsSize(original, preferred)) return;
    if (page.children.length > 1) {
      original.remove();
      nextPage().appendChild(original);
      if (termsSize(original, preferred)) return;
    }
    // Unusually long terms: repeat the heading and split only between clauses.
    const clauses = Array.from(original.querySelectorAll('.excel-terms > .excel-term'));
    if (!clauses.length) return;
    const finalSize = original.querySelector('.excel-terms').style.fontSize;
    original.remove();
    let part = emptyTerms(original);
    page.appendChild(part.section);
    part.body.style.fontSize = finalSize;
    for (const clause of clauses) {
      part.body.appendChild(clause);
      if (!fits(part.section) && part.body.children.length > 1) {
        clause.remove();
        nextPage();
        part = emptyTerms(original);
        page.appendChild(part.section);
        part.body.style.fontSize = finalSize;
        part.body.appendChild(clause);
      }
    }
  }
  function appendItemTable(original) {
    const rows = Array.from(original.tBodies[0]?.rows || []);
    if (!rows.length) { appendWhole(original); return; }
    const skeleton = () => {
      const table = original.cloneNode(true);
      table.tBodies[0].replaceChildren();
      return table;
    };
    let table = skeleton();
    appendWhole(table);
    for (const row of rows) {
      table.tBodies[0].appendChild(row);
      if (!fits(row)) {
        row.remove();
        if (table.tBodies[0].rows.length === 0) table.remove();
        nextPage();
        table = skeleton();
        page.appendChild(table);
        table.tBodies[0].appendChild(row);
      }
    }
  }
  for (const node of nodes) {
    // A preset may mark its photo appendix (or any major section) to begin
    // on a fresh A4 page. This remains inside the one shared controller.
    if (node.hasAttribute('data-preset-new-page') && page.children.length) nextPage();
    if (node.matches('section.excel-terms-section')) (requestedFit === 'flow' ? appendTermsFlow(node) : appendTerms(node));
    else if (node.matches('table.excel-table')) appendItemTable(node);
    else appendWhole(node);
  }
  const pages = Array.from(root.querySelectorAll('article.paper'));
  const termsPages = pages.filter(p => p.querySelector('.excel-terms-section')).length;
  const firstTermsPage = pages.findIndex(p => p.querySelector('.excel-terms-section')) + 1;
  const actualSizes = pages.flatMap(p => Array.from(p.querySelectorAll('.excel-terms')).map(e => parseFloat(getComputedStyle(e).fontSize)));
  root.dataset.pageFitMode = requestedFit;
  root.dataset.pageFitTermsPages = String(termsPages);
  root.dataset.pageFitTermsStartPage = String(firstTermsPage);
  root.dataset.pageFitTotalPages = String(pages.length);
  root.dataset.pageFitActualSizePx = actualSizes.length ? String(Math.min(...actualSizes)) : '';
  return pages.length;
}
