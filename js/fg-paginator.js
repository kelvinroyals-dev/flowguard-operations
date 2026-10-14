/**
 * FlowGuard Operations Center — Pagination Utility v3.2.1
 * ──────────────────────────────────────────────────────────
 * Drop-in client-side pagination for any table.
 *
 * Usage:
 *   const pg = FGPaginator.create(items, { pageSize: 25, containerId: 'my-table' });
 *   pg.render(renderFn);           // renderFn receives the current page's items
 *   pg.setPage(2);                 // jump to page
 *   pg.update(newItems);           // replace dataset and reset to page 1
 */

const FGPaginator = (function () {
  const instances = new Map();

  function snapshot(root) {
    const pages = {};
    instances.forEach((pg,id)=>{ if (root.contains(document.getElementById(id))) pages[id] = pg.page(); });
    return pages;
  }

  function restore(root, pages = {}) {
    Object.entries(pages).forEach(([id,page])=>{
      if (root.contains(document.getElementById(id))) instances.get(id)?.setPage(page, {scroll:false});
    });
  }

  function create(items = [], options = {}) {
    const PAGE_SIZE   = options.pageSize    || 25;
    const CONTAINER   = options.containerId || null;
    const SIBLING_PAGES = 2; // pages to show either side of current

    let _items    = [...items];
    let _page     = 1;
    let _renderFn = null;

    function totalPages() {
      return Math.max(1, Math.ceil(_items.length / PAGE_SIZE));
    }

    function pageItems() {
      const start = (_page - 1) * PAGE_SIZE;
      return _items.slice(start, start + PAGE_SIZE);
    }

    function render(renderFn) {
      _renderFn = renderFn;
      _draw();
    }

    function _draw() {
      if (_renderFn) _renderFn(pageItems());
      _drawControls();
    }

    function _drawControls() {
      if (!CONTAINER) return;
      const existing = document.getElementById(`${CONTAINER}-pgn`);
      if (existing) existing.remove();

      if (!_items.length) return;

      const total   = totalPages();
      const el      = document.createElement('div');
      el.id         = `${CONTAINER}-pgn`;
      el.setAttribute('role', 'navigation');
      el.setAttribute('aria-label', 'Record pages');
      el.style.cssText = `
        display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;
        padding:8px 12px;
        border-top:1px solid var(--border,#dae6ef);
        background:var(--surface-2,#f7fafc);
        font-family:var(--ff-b,'Inter',sans-serif);
        font-size:var(--fs-base);
      `;

      // Page range info
      const start = (_page - 1) * PAGE_SIZE + 1;
      const end   = Math.min(_page * PAGE_SIZE, _items.length);
      const info  = document.createElement('span');
      info.style.cssText = 'color:var(--ink-3,#6b8fa3);';
      info.textContent   = `Showing ${start}–${end} of ${_items.length} returned matches`;

      // Page buttons
      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex;align-items:center;gap:4px;';

      function btn(label, page, active = false, disabled = false) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.setAttribute('aria-label', label === '←' ? 'Previous page' : label === '→' ? 'Next page' : `Page ${page}`);
        if (active) b.setAttribute('aria-current', 'page');
        b.disabled   = disabled;
        b.style.cssText = `
          min-width:32px; height:32px; padding:0 8px;
          border-radius:var(--radius-control);
          border:1px solid ${active ? 'var(--blue-hi)' : 'var(--border)'};
          background:${active ? 'var(--neon-trace)' : 'var(--surface)'};
          color:${active ? 'var(--blue-hi)' : disabled ? 'var(--ink-4)' : 'var(--ink-2)'};
          font-family:var(--ff-b,'Inter',sans-serif);
          font-size:var(--fs-base); font-weight:${active ? '700' : '500'};
          cursor:${disabled ? 'not-allowed' : 'pointer'};
          transition:all .15s;
        `;
        if (!disabled && !active) {
          b.onmouseenter = () => { b.style.borderColor = 'var(--blue,#16a8d3)'; b.style.color = 'var(--blue,#16a8d3)'; };
          b.onmouseleave = () => { b.style.borderColor = 'var(--border,#dae6ef)'; b.style.color = 'var(--ink-2,#2d5068)'; };
        }
        if (!disabled) b.onclick = () => setPage(page);
        return b;
      }

      // Prev
      btns.appendChild(btn('←', _page - 1, false, _page === 1));

      // Page numbers with ellipsis
      const pages = [];
      pages.push(1);
      for (let i = _page - SIBLING_PAGES; i <= _page + SIBLING_PAGES; i++) {
        if (i > 1 && i < total) pages.push(i);
      }
      if (total > 1) pages.push(total);

      let lastPage = 0;
      pages.forEach(p => {
        if (p - lastPage > 1) {
          const ellipsis = document.createElement('span');
          ellipsis.textContent = '…';
          ellipsis.style.cssText = 'color:var(--ink-4,#9eb8c8);padding:0 4px;font-size:var(--fs-base);';
          btns.appendChild(ellipsis);
        }
        btns.appendChild(btn(p, p, p === _page));
        lastPage = p;
      });

      // Next
      btns.appendChild(btn('→', _page + 1, false, _page === total));

      el.appendChild(info);
      if(total>1) el.appendChild(btns);

      // Attach below the container
      const container = document.getElementById(CONTAINER);
      if (container) container.appendChild(el);
    }

    function setPage(p, options = {}) {
      if (!Number.isFinite(Number(p))) return;
      _page = Math.max(1, Math.min(Math.floor(Number(p)), totalPages()));
      _draw();
      // Scroll container into view
      if (CONTAINER && options.scroll !== false) {
        const c = document.getElementById(CONTAINER);
        if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    function update(newItems) {
      _items = [...newItems];
      _page  = 1;
      _draw();
    }

    function count() { return _items.length; }
    function page()  { return _page; }

    const instance = { render, setPage, update, count, page };
    if (CONTAINER) instances.set(CONTAINER, instance);
    return instance;
  }

  return { create, snapshot, restore };

})();
