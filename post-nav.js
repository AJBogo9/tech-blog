(async () => {
  try {
    const path = window.location.pathname;
    if (!path.includes('/posts/')) return;

    const href = path.endsWith('/')     ? path + 'index.html'
               : path.endsWith('.html') ? path
               :                          path + '/index.html';

    const [listings, search] = await Promise.all([
      fetch('/listings.json').then(r => r.json()),
      fetch('/search.json').then(r => r.json()),
    ]);

    const blog = listings.find(l => l.listing === '/blog.html');
    if (!blog) return;

    const items = blog.items;
    const idx = items.indexOf(href);
    if (idx === -1) return;

    const titles = {};
    search.forEach(s => {
      if (s.section === '' && s.href.startsWith('posts/')) {
        titles['/' + s.href] = s.title;
      }
    });

    const older = idx < items.length - 1 ? items[idx + 1] : null;
    const newer = idx > 0               ? items[idx - 1] : null;

    const makeLink = (itemHref, direction, label) => {
      const a = document.createElement('a');
      a.href = itemHref;
      a.className = `post-nav-item post-nav-${direction}`;
      const dir = document.createElement('span');
      dir.className = 'post-nav-direction';
      dir.textContent = label;
      const title = document.createElement('span');
      title.className = 'post-nav-title';
      title.textContent = titles[itemHref] ?? (direction === 'prev' ? 'Previous post' : 'Next post');
      a.append(dir, title);
      return a;
    };

    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Post navigation');
    nav.className = 'post-nav';

    if (older) nav.appendChild(makeLink(older, 'prev', '← Older'));

    const allLink = document.createElement('a');
    allLink.href = '/blog.html';
    allLink.className = 'post-nav-all';
    allLink.textContent = 'All posts';
    nav.appendChild(allLink);

    if (newer) nav.appendChild(makeLink(newer, 'next', 'Newer →'));

    const reuse = document.getElementById('quarto-reuse');
    const appendix = document.getElementById('quarto-appendix');
    if (reuse) reuse.before(nav);
    else if (appendix) appendix.before(nav);
    else document.querySelector('main')?.appendChild(nav);
  } catch (_) {
    // progressive enhancement — fail silently
  }
})();

(() => {
  try {
    if (!window.location.pathname.includes('/posts/')) return;

    const toc = document.getElementById('TOC');
    const ul = toc?.querySelector('ul');
    if (!ul) return;

    const box = document.createElement('div');
    box.className = 'mobile-toc';
    box.setAttribute('role', 'navigation');
    box.setAttribute('aria-label', 'Contents');

    const label = document.createElement('p');
    label.className = 'mobile-toc-label';
    label.textContent = 'Contents';

    const ulClone = ul.cloneNode(true);
    ulClone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    ulClone.querySelectorAll('.collapse').forEach(el => el.classList.remove('collapse'));

    box.append(label, ulClone);

    const firstSection = document.querySelector('#quarto-document-content section');
    firstSection?.before(box);
  } catch (_) {
    // progressive enhancement — fail silently
  }
})();
