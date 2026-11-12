(() => {
  if (window.__textinContentInstalled) return;
  window.__textinContentInstalled = true;
  const listPaths = ['/cases/list', '/news/list'];
  let catalog;
  let catalogIndex;
  let cards = [];
  let entries = [];
  let currentPage = 1;
  let revision = 0;
  const cardCache = new Map();
  const chunkLoads = new Map();
  let articleContent;
  let articleHeadingKey;
  let clearArticle = () => {};
  let syncArticlePosition = () => {};
  const articleHeadings = content => [...content.querySelectorAll('h2[id]')].filter(heading => !heading.closest('.card'));
  const headingKey = content => articleHeadings(content).map(heading => `${heading.id}:${heading.textContent}`).join('|');
  function mountArticle(content) {
    const isArticle = /^\/(cases|news)\/(?!list(?:\/|$))[^/]+\/?$/.test(location.pathname);
    if (!isArticle || !content) {
      clearArticle(); articleContent = null; articleHeadingKey = null;
      return;
    }
    const key = `${location.pathname}:${headingKey(content)}`;
    if (content === articleContent && key === articleHeadingKey) return;
    clearArticle();
    articleContent = content; articleHeadingKey = key;
    const area = content.closest('#content-area');
    const layout = area?.closest('#content-container')?.parentElement;
    if (!area || !layout) return;
    layout.classList.add('article-layout');
    area.classList.add('article-reading');
    const left = document.createElement('aside');
    left.className = 'article-publisher';
    left.setAttribute('aria-label', 'Publisher and sharing');
    left.innerHTML = `<p class="article-publisher-label">Published by</p><a class="article-publisher-brand" href="https://www.textin.ai" aria-label="TextIn website"><img src="/images/brand/logo-dark.webp" alt="TextIn" width="104" /></a>
      <div class="article-share"><p>Share article</p><div class="article-share-buttons">
      <a data-share="linkedin" aria-label="Share on LinkedIn" title="Share on LinkedIn" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5.4 3a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8ZM3.5 9h3.8v12H3.5V9Zm6.2 0h3.6v1.6h.1c.5-.9 1.7-1.9 3.5-1.9 3.8 0 4.5 2.5 4.5 5.7V21h-3.8v-5.8c0-1.4 0-3.1-1.9-3.1s-2.2 1.5-2.2 3V21H9.7V9Z"/></svg></a>
      <a data-share="x" aria-label="Share on X" title="Share on X" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-6.8 7.8L23.2 22H17l-4.9-7.4L5.6 22H2.4l8.3-9.5L2.8 2h6.4l4.5 6.9L18.9 2ZM17.5 20h1.7L8.3 4H6.5l11 16Z"/></svg></a>
      <button type="button" aria-label="Copy article link" title="Copy article link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m10 13 4-4m-5 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m0 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1)"/></svg></button>
      </div><span class="article-share-status" role="status"></span><input class="article-copy-fallback" aria-label="Article link to copy" readonly hidden /></div>`;
    // og:image is generated from the configured site domain, including in local previews.
    const coverUrl = document.querySelector('meta[property="og:image"]')?.content;
    const shareUrl = new URL(location.pathname, coverUrl || location.origin).href;
    const cover = [...content.querySelectorAll('img')].find(image => new URL(image.src).pathname === (coverUrl && new URL(coverUrl).pathname));
    cover?.classList.add('article-cover');
    const title = document.querySelector('#page-title')?.textContent.trim() || document.title;
    left.querySelector('[data-share="linkedin"]').href = `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url: shareUrl })}`;
    left.querySelector('[data-share="x"]').href = `https://twitter.com/intent/tweet?${new URLSearchParams({ url: shareUrl, text: title })}`;
    let copyTimer;
    left.querySelector('button').addEventListener('click', async () => {
      const status = left.querySelector('[role="status"]');
      const button = left.querySelector('button');
      clearTimeout(copyTimer);
      try {
        await navigator.clipboard.writeText(shareUrl);
        if (!left.isConnected) return;
        button.dataset.copied = 'true';
        status.textContent = 'Link copied';
        copyTimer = setTimeout(() => { delete button.dataset.copied; status.textContent = ''; }, 2400);
      } catch {
        const input = left.querySelector('input');
        input.value = shareUrl; input.hidden = false; input.focus(); input.select();
        status.textContent = 'Select and copy the link below';
      }
    });
    const right = document.createElement('aside');
    right.className = 'article-reader';
    right.setAttribute('aria-label', 'Article navigation and contact');
    right.innerHTML = `<details class="article-toc"><summary>In this article<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><nav aria-label="In this article"></nav></details><div class="article-reader-cta"><a class="article-start" href="https://www.textin.ai/user/register?redirect=%2Fconsole%2Fdashboard%2Foverview">Start for free</a><a class="article-contact" href="https://www.textin.ai/contact">Contact us</a></div>`;
    const headings = articleHeadings(content);
    const nav = right.querySelector('nav');
    const links = headings.map(heading => {
      const link = document.createElement('a');
      link.href = `#${heading.id}`;
      link.textContent = heading.textContent.replace(/\u200b/g, '').trim();
      nav.append(link);
      return link;
    });
    const syncIndicator = () => {
      const current = nav.querySelector('[aria-current="location"]');
      if (!current || !nav.clientHeight) return;
      nav.style.setProperty('--toc-active-top', `${current.offsetTop}px`);
      nav.style.setProperty('--toc-active-height', `${current.offsetHeight}px`);
      if (!nav.dataset.indicatorReady) {
        // Place the initial marker before enabling transitions.
        nav.getBoundingClientRect();
        nav.dataset.indicatorReady = 'true';
      }
    };
    const details = right.querySelector('details');
    details.hidden = !headings.length;
    const desktop = matchMedia('(min-width: 1200px)');
    const syncBreakpoint = () => { details.open = desktop.matches; };
    syncBreakpoint(); desktop.addEventListener('change', syncBreakpoint);
    area.append(left, right);
    const syncOffset = () => {
      const metadata = content.querySelector('.article-meta-line');
      const offset = metadata ? metadata.getBoundingClientRect().bottom - content.getBoundingClientRect().top + parseFloat(getComputedStyle(metadata).marginBottom) + parseFloat(getComputedStyle(content).marginTop) : 32;
      area.style.setProperty('--article-rail-offset', `${Math.max(32, offset)}px`);
    };
    const resize = new ResizeObserver(() => { syncOffset(); syncArticlePosition(); syncIndicator(); });
    resize.observe(nav);
    links.forEach(link => resize.observe(link));
    details.addEventListener('toggle', syncIndicator);
    const header = area.querySelector('#header');
    if (header) resize.observe(header);
    const metadata = content.querySelector('.article-meta-line');
    if (metadata) resize.observe(metadata);
    if (cover) resize.observe(cover);
    syncOffset();
    let activeIndex = -1;
    let navigating = false;
    const activate = active => {
      if (active === activeIndex) return;
      activeIndex = active;
      links.forEach((link, index) => {
        if (index === active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
      syncIndicator();
    };
    syncArticlePosition = () => {
      if (navigating) return;
      let active = 0;
      headings.forEach(({ id }, index) => { if (document.getElementById(id)?.getBoundingClientRect().top <= 140) active = index; });
      activate(active);
    };
    nav.addEventListener('click', event => {
      const index = links.indexOf(event.target.closest('a'));
      if (index < 0 || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      navigating = true;
      activate(index);
    });
    const resumeTracking = () => { navigating = false; syncArticlePosition(); };
    const resumeOnKey = event => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) resumeTracking(); };
    document.addEventListener('scrollend', resumeTracking);
    window.addEventListener('wheel', resumeTracking, { passive: true });
    window.addEventListener('touchstart', resumeTracking, { passive: true });
    window.addEventListener('keydown', resumeOnKey);
    syncArticlePosition();
    clearArticle = () => {
      document.removeEventListener('scrollend', resumeTracking);
      window.removeEventListener('wheel', resumeTracking);
      window.removeEventListener('touchstart', resumeTracking);
      window.removeEventListener('keydown', resumeOnKey);
      resize.disconnect(); desktop.removeEventListener('change', syncBreakpoint); clearTimeout(copyTimer);
      left.remove(); right.remove();
      cover?.classList.remove('article-cover');
      area.classList.remove('article-reading'); area.style.removeProperty('--article-rail-offset');
      layout.classList.remove('article-layout');
      syncArticlePosition = () => {};
      clearArticle = () => {};
    };
  }
  const listPath = (kind, page) => `/${kind}/list${page === 1 ? '' : `/${page}`}`;
  const normalize = value => value.toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();
  const state = () => ({
    [catalog.dataset.filterKey]: catalog.querySelector('[data-industry-filter]')?.value || catalog.querySelector('[data-category-filter][aria-pressed="true"]')?.dataset.categoryFilter || '',
    ...(catalog.querySelector('[data-scenario-filter]') ? { scenario: catalog.querySelector('[data-scenario-filter]').value } : {}),
    product: catalog.querySelector('[data-product-filter]').value,
    q: catalog.querySelector('[data-content-search]').value.trim(),
    sort: catalog.querySelector('[data-content-sort]').value
  });
  function safeReturn(value, fallback) {
    try {
      const url = new URL(value || fallback, location.origin);
      return url.origin === location.origin && (listPaths.includes(url.pathname) || /^\/(cases|news)\/list\/(?:[2-9]|[1-9]\d+)$/.test(url.pathname)) ? url.pathname + url.search : fallback;
    } catch { return fallback; }
  }
  // Campaign attribution and list return state have separate URL parameters.
  function campaignFrom() {
    let value = new URLSearchParams(location.search).get('from');
    if (value && safeReturn(value, '') !== '') value = new URL(value, location.origin).searchParams.get('from');
    try {
      if (value) sessionStorage.setItem('textin_resource_campaign', JSON.stringify({ value, time: Date.now() }));
      else {
        const cached = JSON.parse(sessionStorage.getItem('textin_resource_campaign') || 'null');
        if (cached && Date.now() - cached.time < 3600000) value = cached.value;
      }
    } catch { /* Optional attribution must not block navigation. */ }
    return value || '';
  }
  function returnTarget(fallback) {
    const params = new URLSearchParams(location.search);
    return safeReturn(params.get('returnTo') || params.get('from'), fallback);
  }
  function navigationTarget(link) {
    const target = new URL(link.href, location.origin);
    const internal = target.origin === location.origin;
    if (!internal && target.origin !== 'https://www.textin.ai') return target;
    const from = campaignFrom();
    if (internal && link.matches('[data-content-back]')) target.href = new URL(returnTarget(target.pathname), location.origin).href;
    if (internal && link.matches('.content-link')) target.searchParams.set('returnTo', location.pathname + location.search);
    if (from && !target.searchParams.has('from')) target.searchParams.set('from', from);
    if (!internal && /^\/(?:user\/(?:login|register)|contact)\/?$/.test(target.pathname)) target.searchParams.set('referrer', location.href);
    return target;
  }
  function prepareNavigation() {
    document.querySelectorAll('a[href]').forEach(link => {
      const target = new URL(link.href, location.origin);
      if (target.origin === location.origin && /^\/(cases|news)(?:\/|$)/.test(target.pathname) || target.origin === 'https://www.textin.ai') {
        const href = navigationTarget(link).href;
        if (link.href !== href) link.href = href;
      }
    });
  }
  function closeDropdown(wrapper) {
    wrapper.querySelector('.catalog-select-trigger').setAttribute('aria-expanded', 'false');
    wrapper.querySelector('.catalog-select-menu').hidden = true;
    const search = wrapper.querySelector('input');
    if (search) {
      search.value = '';
      wrapper.querySelectorAll('[role="option"]').forEach(option => { option.hidden = false; });
      wrapper.querySelector('[role="status"]').hidden = true;
    }
  }
  function syncDropdown(select) {
    const wrapper = select.nextElementSibling;
    if (!wrapper?.matches('.catalog-select')) return;
    const label = select.selectedOptions[0].textContent;
    const trigger = wrapper.querySelector('.catalog-select-trigger');
    trigger.querySelector('.catalog-select-value').textContent = label;
    trigger.setAttribute('aria-label', `${select.getAttribute('aria-label')}: ${label}`);
    wrapper.querySelectorAll('[role="option"]').forEach(option => option.setAttribute('aria-selected', String(option.dataset.value === select.value)));
  }
  // Keep native selects as the data source and no-JavaScript fallback.
  function enhanceDropdown(select, index) {
    const wrapper = document.createElement('div');
    wrapper.className = 'catalog-select';
    const trigger = document.createElement('button');
    trigger.type = 'button'; trigger.className = 'catalog-select-trigger';
    const value = document.createElement('span'); value.className = 'catalog-select-value'; trigger.appendChild(value);
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const panel = document.createElement('div');
    panel.className = 'catalog-select-menu'; panel.hidden = true;
    const menu = document.createElement('div');
    menu.id = `catalog-select-${index}`; menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', select.getAttribute('aria-label'));
    trigger.setAttribute('aria-controls', menu.id);
    const searchable = select.hasAttribute('data-industry-filter');
    let search;
    let empty;
    if (searchable) {
      wrapper.classList.add('catalog-select--searchable');
      search = document.createElement('input');
      search.type = 'search'; search.placeholder = 'Search industries';
      search.setAttribute('aria-label', 'Search industries');
      search.setAttribute('aria-controls', menu.id);
      panel.appendChild(search);
      empty = document.createElement('p'); empty.textContent = 'No industries found';
      empty.setAttribute('role', 'status'); empty.hidden = true;
    }
    const options = [...select.options].map(item => {
      const option = document.createElement('button');
      option.type = 'button'; option.tabIndex = -1; option.setAttribute('role', 'option');
      option.setAttribute('aria-label', item.textContent);
      option.dataset.value = item.value; option.textContent = item.textContent;
      option.addEventListener('click', () => {
        select.value = item.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        closeDropdown(wrapper); trigger.focus();
      });
      menu.appendChild(option);
      return option;
    });
    const open = (index = select.selectedIndex, focusSearch = false) => {
      panel.hidden = false; trigger.setAttribute('aria-expanded', 'true');
      if (focusSearch && search) search.focus();
      else options[index].focus();
    };
    trigger.addEventListener('click', () => {
      if (!panel.hidden) { closeDropdown(wrapper); return; }
      open(select.selectedIndex, true);
    });
    search?.addEventListener('input', () => {
      options.forEach(option => { option.hidden = Boolean(option.dataset.value) && !normalize(option.textContent).includes(normalize(search.value)); });
      empty.hidden = options.slice(1).some(option => !option.hidden);
    });
    wrapper.addEventListener('keydown', event => {
      const visible = options.filter(option => !option.hidden);
      const current = visible.indexOf(document.activeElement);
      const typing = event.target === search;
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && !(typing && ['Home', 'End'].includes(event.key))) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : current < 0 ? (event.key === 'ArrowUp' ? visible.length - 1 : 0) : (current + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length;
        open(options.indexOf(visible[next]));
      } else if (event.key === 'Escape') {
        event.preventDefault(); closeDropdown(wrapper); trigger.focus();
      } else if (!panel.hidden && !typing && event.key.length === 1 && /\S/.test(event.key)) {
        const match = [...visible.slice(current + 1), ...visible.slice(0, current + 1)].find(option => option.textContent.toLowerCase().startsWith(event.key.toLowerCase()));
        if (match) {
          event.preventDefault(); match.focus();
        }
      }
    });
    wrapper.addEventListener('focusout', event => { if (!wrapper.contains(event.relatedTarget)) closeDropdown(wrapper); });
    panel.appendChild(menu);
    if (empty) panel.appendChild(empty);
    wrapper.append(trigger, panel);
    select.after(wrapper); select.hidden = true;
    syncDropdown(select);
  }
  async function loadChunk(kind, chunk) {
    if (!chunkLoads.has(chunk)) chunkLoads.set(chunk, (async () => {
      const response = await fetch(listPath(kind, chunk));
      if (!response.ok) throw new Error('Unable to load content');
      // A detached template keeps images inert until a selected card is mounted.
      const template = document.createElement('template');
      template.innerHTML = await response.text();
      const loaded = [...template.content.querySelectorAll('[data-catalog-initial] [data-content-page]')];
      if (!loaded.length) throw new Error('Missing content cards');
      for (const card of loaded) cardCache.set(card.dataset.contentPage, card);
    })().catch(error => { chunkLoads.delete(chunk); throw error; }));
    return chunkLoads.get(chunk);
  }
  async function filterCatalog(updateUrl, page) {
    const section = catalog;
    const request = ++revision;
    const current = state();
    const filtered = entries.filter(item => (!current[section.dataset.filterKey] || [item.category].flat().includes(current[section.dataset.filterKey]))
      && (!current.scenario || item.scenarios.includes(current.scenario))
      && (!current.product || item.products.includes(current.product))
      && (!current.q || normalize(item.search).includes(normalize(current.q))));
    if (current.sort !== 'recommended') filtered.sort((a, b) => (current.sort === 'oldest' ? 1 : -1) * a.date.localeCompare(b.date));
    const pageSize = Number(section.dataset.pageSize);
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    currentPage = Math.max(1, Math.min(pages, page));
    const selected = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const url = new URL(location.href);
    url.pathname = listPath(section.dataset.kind, currentPage);
    for (const [key, value] of Object.entries(current)) {
      if (value && !(key === 'sort' && value === 'recommended')) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    if (updateUrl || url.pathname !== location.pathname) history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    section.dataset.filtered = String(Boolean(current[section.dataset.filterKey] || current.scenario || current.product || current.q || current.sort !== 'recommended'));
    const noun = section.dataset.kind === 'cases' ? (filtered.length === 1 ? 'case study' : 'case studies') : (filtered.length === 1 ? 'article' : 'articles');
    section.querySelector('[data-result-count]').textContent = `${filtered.length} ${noun}`;
    section.querySelector('[data-content-empty]').hidden = filtered.length !== 0;
    const pagination = section.querySelector('[data-catalog-pagination]');
    pagination.hidden = pages <= 1;
    pagination.querySelector('[data-page-range]').textContent = `${filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–${Math.min(currentPage * pageSize, filtered.length)} of ${filtered.length}`;
    pagination.querySelectorAll('[data-catalog-page]').forEach(link => {
      const kind = link.dataset.catalogPage;
      const target = kind === 'previous' ? currentPage - 1 : kind === 'next' ? currentPage + 1 : Number(kind);
      const disabled = target < 1 || target > pages;
      link.hidden = !['previous', 'next'].includes(kind) && target > pages;
      link.setAttribute('aria-disabled', String(disabled));
      link.tabIndex = disabled ? -1 : 0;
      if (kind === String(currentPage)) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
      link.href = listPath(section.dataset.kind, Math.max(1, Math.min(pages, target))) + url.search + '#catalog';
    });
    const initial = section.querySelector('[data-catalog-initial]');
    const results = section.querySelector('[data-catalog-results]');
    const error = section.querySelector('[data-catalog-error]');
    initial.hidden = true; results.hidden = true; error.hidden = true;
    section.setAttribute('aria-busy', 'true');
    try {
      await Promise.all([...new Set(selected.filter(item => !cardCache.has(item.page)).map(item => item.chunk))].map(chunk => loadChunk(section.dataset.kind, chunk)));
      if (request !== revision || catalog !== section || !section.isConnected) return;
      const original = selected.length === cards.length && selected.every((item, index) => item.page === cards[index].dataset.contentPage);
      if (original) initial.hidden = false;
      else {
        results.replaceChildren(...selected.map(item => {
          const source = cardCache.get(item.page);
          if (!source) throw new Error('Missing content card');
          return source.cloneNode(true);
        }));
        results.hidden = selected.length === 0;
      }
      for (const link of (original ? initial : results).querySelectorAll('.content-link')) {
        const target = new URL(link.getAttribute('href'), location.origin);
        target.searchParams.set('returnTo', url.pathname + url.search);
        const from = campaignFrom();
        if (from) target.searchParams.set('from', from);
        link.href = target.pathname + target.search;
      }
    } catch {
      if (request === revision && catalog === section && section.isConnected) error.hidden = false;
    } finally {
      if (request === revision && catalog === section) section.setAttribute('aria-busy', 'false');
    }
  }
  function filter(updateUrl = true, page = 1) {
    if (!catalog?.isConnected) return;
    catalog.querySelectorAll('[data-industry-filter], [data-scenario-filter], [data-product-filter], [data-content-sort]').forEach(syncDropdown);
    return filterCatalog(updateUrl, page);
  }
  // Mirror DesktopV2: dark heroes stay transparent until a light surface
  // enters the header's blur sampling area. Article pages use the light variant.
  function syncHeader() {
    const header = document.querySelector('#navbar');
    if (!header) return;
    const bounds = header.getBoundingClientRect();
    const surfaces = '.home-body, .collection-body, #footer';
    const margin = location.pathname === '/' ? 45 : 15;
    const probe = document.elementFromPoint(window.innerWidth / 2, Math.min(window.innerHeight - 1, bounds.bottom + 2));
    let onLightContent = Boolean(probe?.closest(surfaces));
    if (location.pathname === '/' || window.innerWidth >= 1260) onLightContent ||= [...document.querySelectorAll(surfaces)].some(surface => {
      const rect = surface.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top < bounds.bottom + margin && rect.bottom > bounds.top - margin;
    });
    document.documentElement.dataset.headerScrolled = String(window.scrollY > 0);
    document.documentElement.dataset.headerOnLight = String(onLightContent);
  }
  let headerFrame;
  function scheduleHeader() {
    if (headerFrame) return;
    headerFrame = requestAnimationFrame(() => { headerFrame = null; syncHeader(); syncArticlePosition(); });
  }
  window.addEventListener('scroll', scheduleHeader, { passive: true });
  window.addEventListener('resize', scheduleHeader, { passive: true });
  function init() {
    syncHeader();
    // Article sources use Markdown and native components; apply the shared chrome here.
    const content = document.querySelector('#content');
    if (content) {
      const backLinks = [...content.querySelectorAll('a[href]')].filter(link => listPaths.includes(new URL(link.href).pathname) && /^(?:←\s*)?Back to (Blog|Case Studies)$/.test(link.textContent.trim()));
      backLinks.forEach((link, index) => {
        link.classList.add('article-back');
        link.setAttribute('data-content-back', '');
        const paragraph = link.closest('p, [data-as="p"]');
        if (index === 0) {
          paragraph?.classList.add('article-back-row');
          paragraph?.nextElementSibling?.classList.add('article-meta-line');
        } else paragraph?.classList.add('article-return');
      });
      const cta = content.querySelector('.card:has(a[href="https://www.textin.ai/contact"])');
      if (cta) {
        cta.classList.add('resource-cta', 'article-cta', 'not-prose');
        cta.querySelector('[data-component-part="card-cta"] button')?.classList.add('site-button');
      }
    }
    mountArticle(content);
    prepareNavigation();
    const footer = document.querySelector('#footer > div');
    if (footer && !footer.querySelector('.footer-copyright')) {
      const copyright = document.createElement('p');
      copyright.className = 'footer-copyright';
      copyright.textContent = `Copyright © ${new Date().getFullYear()} TextIn   All rights reserved.`;
      footer.append(copyright);
    }
    document.querySelectorAll('[data-content-back]').forEach(link => {
      link.href = returnTarget(link.getAttribute('href'));
    });
    catalog = document.querySelector('[data-content-catalog]');
    catalogIndex = catalog?.dataset.catalogIndex;
    revision++;
    if (!catalog) return;
    cards = [...catalog.querySelectorAll('[data-catalog-initial] .content-card')];
    entries = JSON.parse(catalog.dataset.catalogIndex || '[]');
    cardCache.clear(); chunkLoads.clear();
    for (const card of cards) if (card.dataset.contentPage) cardCache.set(card.dataset.contentPage, card);
    const params = new URLSearchParams(location.search);
    const filters = catalog.querySelector('[data-category-filters]');
    const industry = catalog.querySelector('[data-industry-filter]');
    filters?.querySelectorAll('button:not([data-category-filter=""])').forEach(button => button.remove());
    const categories = catalog.dataset.kind === 'news' ? ['Announcements', 'Technical'] : [...new Set(entries.flatMap(item => item.category))];
    industry?.querySelectorAll('option:not([value=""])').forEach(option => option.remove());
    for (const value of categories) {
      if (industry) { industry.add(new Option(value, value)); continue; }
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.categoryFilter = value; button.textContent = value;
      filters.appendChild(button);
    }
    const buttons = [...(filters?.querySelectorAll('button') || [])];
    const requestedCategory = params.get(catalog.dataset.filterKey) ?? catalog.dataset.defaultCategory;
    const selectedCategory = categories.includes(requestedCategory) ? requestedCategory : '';
    if (industry) industry.value = selectedCategory;
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.categoryFilter === selectedCategory)));
    const scenario = catalog.querySelector('[data-scenario-filter]');
    if (scenario) {
      scenario.querySelectorAll('option:not([value=""])').forEach(option => option.remove());
      for (const value of new Set(entries.flatMap(item => item.scenarios))) scenario.add(new Option(value, value));
      const requestedScenario = params.get('scenario') ?? catalog.dataset.defaultScenario;
      scenario.value = [...scenario.options].some(option => option.value === requestedScenario) ? requestedScenario : '';
    }
    const product = catalog.querySelector('[data-product-filter]');
    product.querySelectorAll('option:not([value=""])').forEach(option => option.remove());
    for (const value of new Set(entries.flatMap(item => item.products))) product.add(new Option(value, value));
    const requestedProduct = params.get('product') ?? catalog.dataset.defaultProduct;
    product.value = [...product.options].some(option => option.value === requestedProduct) ? requestedProduct : '';
    const sort = catalog.querySelector('[data-content-sort]');
    const requestedSort = params.get('sort') ?? catalog.dataset.defaultSort;
    sort.value = ['recommended', 'newest', 'oldest'].includes(requestedSort) ? requestedSort : 'recommended';
    catalog.querySelector('[data-content-search]').value = params.get('q') || '';
    catalog.querySelectorAll('.catalog-select').forEach(wrapper => wrapper.remove());
    catalog.querySelectorAll('[data-industry-filter], [data-scenario-filter], [data-product-filter], [data-content-sort]').forEach(enhanceDropdown);
    filter(false, Number(location.pathname.match(/^\/(?:cases|news)\/list\/(\d+)$/)?.[1]) || 1);
  }
  // Mintlify links retain compiled hrefs. Use ordinary navigation for dynamic
  // return URLs and explicit list resets, while retaining modified-click behavior.
  const prepareClickedLink = event => {
    const link = event.target.closest('a[href]');
    if (link) link.href = navigationTarget(link).href;
  };
  ['click', 'auxclick', 'contextmenu'].forEach(type => document.addEventListener(type, prepareClickedLink, true));
  document.addEventListener('click', event => {
    const link = event.target.closest('.content-link, [data-content-back], [data-catalog-page], a[href="/cases/list"], a[href="/news/list"]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.getAttribute('aria-disabled') === 'true') { event.preventDefault(); event.stopImmediatePropagation(); return; }
    const target = navigationTarget(link);
    if (target.origin !== location.origin) return;
    event.preventDefault(); event.stopImmediatePropagation();
    location.assign(target.pathname + target.search + target.hash);
  }, true);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-catalog-retry]')) { filter(false, currentPage); return; }
    const button = event.target.closest('[data-category-filter], [data-content-reset]');
    if (!button || !catalog?.contains(button)) return;
    if (button.hasAttribute('data-content-reset')) {
      catalog.querySelector('[data-content-search]').value = '';
      catalog.querySelector('[data-product-filter]').value = '';
      catalog.querySelector('[data-content-sort]').value = 'recommended';
      const scenario = catalog.querySelector('[data-scenario-filter]');
      if (scenario) scenario.value = '';
      const industry = catalog.querySelector('[data-industry-filter]');
      if (industry) industry.value = '';
    }
    const category = button.dataset.categoryFilter || '';
    catalog.querySelectorAll('[data-category-filter]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.categoryFilter === category)));
    filter();
  });
  document.addEventListener('input', event => { if (event.target.matches('[data-content-search]')) filter(); });
  document.addEventListener('change', event => { if (event.target.matches('[data-industry-filter], [data-scenario-filter], [data-product-filter], [data-content-sort]')) filter(); });
  document.addEventListener('pointerdown', event => {
    document.querySelectorAll('.catalog-select').forEach(wrapper => { if (!wrapper.contains(event.target)) closeDropdown(wrapper); });
  });
  let mountFrame;
  const mount = () => {
    if (mountFrame) return;
    mountFrame = requestAnimationFrame(() => { mountFrame = null; init(); });
  };
  // Local MDX hot updates can replace the catalog without a navigation event.
  new MutationObserver(() => {
    const next = document.querySelector('[data-content-catalog]');
    const content = document.querySelector('#content');
    if (next !== catalog || next?.dataset.catalogIndex !== catalogIndex || content !== articleContent && /^\/(cases|news)\/(?!list(?:\/|$))[^/]+\/?$/.test(location.pathname) || articleContent?.isConnected && `${location.pathname}:${headingKey(articleContent)}` !== articleHeadingKey) mount();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-catalog-index'] });
  window.addEventListener('mintlify:navigate', mount);
  window.addEventListener('load', mount, { once: true });
  window.addEventListener('popstate', mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
