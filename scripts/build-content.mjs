import { readFile, writeFile, access, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { watch } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { parseDocument } from 'yaml';

const root = fileURLToPath(new URL('../', import.meta.url));
const pageSize = 5;
const listPath = (kind, page) => `/${kind}/list${page === 1 ? '' : `/${page}`}`;
const metadataStart = '{/* content:metadata:start */}';
const metadataEnd = '{/* content:metadata:end */}';
const footerStart = '{/* content:footer:start */}';
const footerEnd = '{/* content:footer:end */}';
const escape = value => String(value).replace(/[&<>"'{}]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '{': '&#123;', '}': '&#125;' }[char]));
const markdown = value => String(value).replace(/[\\`*_[\]{}<>]/g, '\\$&');
const categoryNames = item => [item.category || item.industry].flat();
const productNames = item => Array.isArray(item.product) ? item.product : [item.product];
const imageUrl = value => value.split('/').map(encodeURIComponent).join('/');
const shortDate = date => new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

function renderCard(article, home = false) {
  const { item, title, description } = article;
  const kind = item.page.split('/')[0];
  const categories = categoryNames(item);
  const category = categories.join(' · ');
  const featured = item.featured && !home;
  const bottom = kind === 'news'
    ? `<span className="read-time">${item.readMinutes} min read</span>`
    : `<div className="content-metric"><strong>${escape(item.metric.value)}</strong><span>${escape(item.metric.label)}</span></div>`;
  return `<div role="article" className="content-card${featured ? ' content-card--featured' : ''}"${!home ? ` data-content-page="${item.page}"` : ''} data-category="${escape(category)}" data-product="${escape(productNames(item).join(' & '))}"${Array.isArray(item.product) ? ` data-products="${escape(item.product.join('|'))}"` : ''} data-date="${item.date}"${item.scenarios ? ` data-scenarios="${escape(item.scenarios.join('|'))}"` : ''}>
  <a className="${home ? 'home-article-link' : 'content-link'}" href="/${item.page}">
    <div className="content-visual"><img src="${escape(imageUrl(item.cover))}" alt="" loading="${featured ? 'eager' : 'lazy'}" /></div>
    <div className="content-copy">
      ${item.customer ? `<div className="content-customer">${item.customerLogo ? `<img src="${escape(imageUrl(item.customerLogo))}" alt="" loading="lazy" />` : ''}<p>${escape(item.customer)}</p></div>\n      ` : ''}<div className="content-meta">${categories.length > 1 ? `<span className="content-industries">${categories.map(value => `<span>${escape(value)}</span>`).join('')}</span>` : `<span>${escape(category)}</span>`}<span className="content-date">${shortDate(item.date)}</span></div>
      <h2>${escape(title)}</h2>
      <p className="content-summary">${escape(description)}</p>
      <div className="content-bottom">${bottom}</div>
    </div>
  </a>
</div>`;
}

function pagination(kind, page, total) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = (label, target, key) => `<a href="${listPath(kind, Math.max(1, Math.min(pages, target)))}#catalog" data-catalog-page="${key}"${target < 1 || target > pages ? ' aria-disabled="true" tabIndex="-1"' : ''}${key === String(page) ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<div role="navigation" className="catalog-pagination" aria-label="${kind === 'news' ? 'Blog' : 'Case Studies'} pagination" data-catalog-pagination${pages === 1 ? ' hidden' : ''}><p data-page-range>${total ? (page - 1) * pageSize + 1 : 0}–${Math.min(page * pageSize, total)} of ${total}</p><div>${link('Previous', page - 1, 'previous')}${Array.from({ length: pages }, (_, index) => link(String(index + 1), index + 1, String(index + 1))).join('')}${link('Next', page + 1, 'next')}</div></div>`;
}

async function readArticle(directory, file, siteUrl, validate) {
  const source = await readFile(path.join(directory, file), 'utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${file}: missing page frontmatter.`);
  const document = parseDocument(match[1]);
  if (document.errors.length) throw new Error(`${file}: ${document.errors[0].message}`);
  const data = document.toJS();
  if (!Object.hasOwn(data || {}, 'listing')) return null;
  for (const field of ['cover', 'customerLogo']) {
    const value = data.listing?.[field];
    if (typeof value === 'string' && !value.startsWith('/')) {
      data.listing[field] = `/${value}`;
      document.setIn(['listing', field], data.listing[field]);
    }
  }
  if (!validate(data.listing)) throw new Error(`${file}: listing ${validate.errors.map(error => `${error.instancePath} ${error.message}`).join('; ')}`);
  const item = { ...data.listing, page: file.slice(0, -4) };
  if (!/^(news|cases)\/[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(item.page)) throw new Error(`${file}: use a single article filename with letters, numbers, hyphens or underscores.`);
  for (const field of ['cover', 'customerLogo']) {
    if (item[field]?.split('/').includes('..')) throw new Error(`${file}: ${field} must stay inside images/.`);
  }
  if (item.scenarios?.some(value => value.includes('|'))) throw new Error(`${file}: put each use case in its own array item; do not use |.`);
  for (const key of ['title', 'description']) {
    if (typeof data?.[key] !== 'string' || !data[key].trim()) throw new Error(`${file}: add a ${key} in the page editor.`);
  }
  try { await access(path.join(directory, item.cover.slice(1))); }
  catch { throw new Error(`${item.page}: cover image not found: ${item.cover}`); }
  if (item.customerLogo) {
    try { await access(path.join(directory, item.customerLogo.slice(1))); }
    catch { throw new Error(`${item.page}: customer logo image not found: ${item.customerLogo}`); }
  }
  const kind = item.page.split('/')[0];
  const label = kind === 'news' ? 'Blog' : 'Case Studies';
  const metadata = `${metadataStart}\n[Back to ${label}](/${kind}/list)\n\n${[categoryNames(item).join(' · '), productNames(item).join(' & '), shortDate(item.date)].map(markdown).join(' · ')}\n${metadataEnd}`;
  let body = source.slice(match[0].length).trim();
  if (!body) throw new Error(`${file}: add the article body before listing it.`);
  const start = body.indexOf(metadataStart);
  const end = body.indexOf(metadataEnd);
  if ((start < 0) !== (end < 0) || (start >= 0 && end < start)) throw new Error(`${file}: damaged generated metadata markers.`);
  body = start < 0 ? `${metadata}\n\n${body}` : body.slice(0, start) + metadata + body.slice(end + metadataEnd.length);
  const footer = `${footerStart}\n[Back to ${label}](/${kind}/list)\n\n<Card title="Put document AI to work." href="https://www.textin.ai/contact" cta="Talk to our team" />\n${footerEnd}`;
  const footerIndex = body.indexOf(footerStart);
  const footerLast = body.indexOf(footerEnd);
  if ((footerIndex < 0) !== (footerLast < 0) || (footerIndex >= 0 && footerLast < footerIndex)) throw new Error(`${file}: damaged generated footer markers.`);
  // Add the default footer once; preserve the editor's existing Card syntax.
  if (footerIndex < 0) body = `${body}\n\n${footer}`;
  // Only update generated fields. Preserve the author's YAML style and article body.
  document.set('mode', 'center');
  document.set('hideFooterPagination', true);
  document.set('timestamp', false);
  if (!Object.hasOwn(item, 'homeOrder')) document.setIn(['listing', 'homeOrder'], false);
  document.set('sidebarTitle', item.customer || data.title);
  document.set('og:image', new URL(imageUrl(item.cover), siteUrl).href);
  const updated = `---\n${document.toString({ lineWidth: 0 })}---\n\n${body}\n`;
  return { item, title: data.title, description: data.description, file, source: updated };
}

export async function buildContent(directory = root, { check = false } = {}) {
  const read = file => readFile(path.join(directory, file), 'utf8');
  const docs = JSON.parse(await read('docs.json'));
  const groups = docs.navigation?.groups;
  if (!Array.isArray(groups)) throw new Error('docs.json: navigation.groups is required.');
  if (groups.filter(item => item.group === 'Draft').length > 1) throw new Error('docs.json: keep a single Draft group.');
  let draftGroup = groups.find(item => item.group === 'Draft');
  if (!draftGroup) {
    draftGroup = { group: 'Draft', hidden: true, pages: [] };
    groups.push(draftGroup);
  }
  draftGroup.hidden = true;
  const drafts = new Set();
  const collectDrafts = async pages => {
    for (const page of pages) {
      if (typeof page !== 'string') { await collectDrafts(page.pages || []); continue; }
      if (!/^(news|cases)\/[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(page) || page.endsWith('/list')) throw new Error(`Draft: only Blog and Case Studies articles are allowed: ${page}`);
      try { await access(path.join(directory, `${page}.mdx`)); }
      catch { throw new Error(`Draft: article not found: ${page}.mdx`); }
      drafts.add(page);
    }
  };
  await collectDrafts(draftGroup.pages || []);
  const isDraftRedirect = redirect => /^\/(news|cases)\/[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(redirect.source) && redirect.destination === `/${redirect.source.split('/')[1]}/list` && redirect.permanent === false;
  const redirects = (docs.redirects || []).filter(redirect => !isDraftRedirect(redirect));
  for (const page of [...drafts].sort()) {
    if (redirects.some(redirect => redirect.source === `/${page}`)) throw new Error(`Draft: remove the existing redirect before withdrawing ${page}.`);
    redirects.push({ source: `/${page}`, destination: `/${page.split('/')[0]}/list`, permanent: false });
  }
  if (redirects.length || docs.redirects) docs.redirects = redirects;
  const schema = JSON.parse(await read('content/schema.json'));
  const settings = JSON.parse(await read('content/site.json'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validateSite = ajv.compile({ ...schema, $ref: '#/definitions/site' });
  if (!validateSite(settings)) throw new Error(`content/site.json: ${ajv.errorsText(validateSite.errors)}`);
  const articles = {};
  for (const kind of ['news', 'cases']) {
    const validate = ajv.compile({ ...schema, $ref: `#/definitions/${kind === 'news' ? 'news' : 'story'}` });
    const files = (await readdir(path.join(directory, kind))).filter(file => file.endsWith('.mdx') && file !== 'list.mdx' && !drafts.has(`${kind}/${file.slice(0, -4)}`));
    articles[kind] = (await Promise.all(files.map(file => readArticle(directory, `${kind}/${file}`, settings.siteUrl, validate)))).filter(Boolean);
    articles[kind].sort((a, b) => (a.item.order ?? 0) - (b.item.order ?? 0) || b.item.date.localeCompare(a.item.date) || a.item.page.localeCompare(b.item.page));
    if (articles[kind].filter(article => article.item.featured).length > 1) throw new Error(`${kind}: only one article can have featured: true.`);
  }
  const output = new Map();
  for (const kind of ['news', 'cases']) {
    const template = await read(`templates/${kind}-list.mdx`);
    if (!template.includes('{{CARDS}}') || !template.includes('{{COUNT}}')) throw new Error(`templates/${kind}-list.mdx: missing CARDS or COUNT placeholder.`);
    const entries = articles[kind].map(({ item, title, description }, index) => ({
      page: item.page, category: item.category || item.industry, products: productNames(item), scenarios: item.scenarios || [], date: item.date,
      search: [item.customer, ...categoryNames(item), title, description, item.metric?.value, item.metric?.label, ...productNames(item), ...(item.scenarios || []), kind === 'news' ? `${item.readMinutes} min read` : ''].filter(value => value !== undefined && value !== '').join(' '),
      chunk: Math.floor(index / pageSize) + 1
    }));
    for (let page = 1; page <= Math.max(1, Math.ceil(entries.length / pageSize)); page++) {
      const file = page === 1 ? `${kind}/list.mdx` : `${kind}/list/${page}.mdx`;
      const source = template.replace('{{CARDS}}', articles[kind].slice((page - 1) * pageSize, page * pageSize).map(article => renderCard(article)).join('\n\n'))
        .replace('{{COUNT}} articles', `${entries.length} ${entries.length === 1 ? 'article' : 'articles'}`).replace('{{COUNT}} case studies', `${entries.length} ${entries.length === 1 ? 'case study' : 'case studies'}`)
        .replaceAll('{{COUNT}}', String(entries.length)).replace('{{INDEX}}', escape(JSON.stringify(entries)))
        .replace('{{PAGE_SIZE}}', String(pageSize)).replace('{{PAGE}}', String(page)).replace('{{PAGINATION}}', pagination(kind, page, entries.length));
      output.set(file, source);
    }
    for (const article of articles[kind]) output.set(article.file, article.source);
  }
  let home = await read('templates/index.mdx');
  for (const kind of ['news', 'cases']) {
    const placeholder = `{{${kind.toUpperCase()}_SECTION}}`;
    if (!home.includes(placeholder)) throw new Error(`templates/index.mdx: missing ${placeholder} placeholder.`);
    const selected = articles[kind].filter(({ item }) => Number.isInteger(item.homeOrder) && item.homeOrder > 0)
      .sort((a, b) => a.item.homeOrder - b.item.homeOrder || b.item.date.localeCompare(a.item.date) || a.item.page.localeCompare(b.item.page));
    const title = kind === 'news' ? 'Latest from the Blog' : 'Case Studies';
    const cta = kind === 'news' ? 'Explore the Blog' : 'Read Case Studies';
    home = home.replace(placeholder, selected.length ? `<section className="home-latest" data-home-section="${kind}">\n<div className="section-heading"><h2>${title}</h2><a href="/${kind}/list">${cta}</a></div>\n<div className="home-article-grid">\n${selected.map(article => renderCard(article, true)).join('\n\n')}\n</div>\n</section>` : '');
  }
  output.set('index.mdx', home);
  for (const [kind, label] of [['news', 'Blog'], ['cases', 'Case Studies']]) {
    const group = groups.find(item => item.group === label);
    if (!group) throw new Error(`docs.json: missing ${label} navigation group.`);
    group.pages = articles[kind].map(article => article.item.page);
  }
  const resources = groups.find(item => item.group === 'Resources');
  resources.pages = resources.pages.filter(page => !/^(cases|news)\/list\/\d+$/.test(page));
  resources.pages.push(...[...output.keys()].filter(file => /^(cases|news)\/list\/\d+\.mdx$/.test(file)).map(file => file.slice(0, -4)));
  output.set('docs.json', JSON.stringify(docs, null, 2) + '\n');
  const changed = [];
  for (const [file, source] of output) {
    const original = await read(file).catch(() => '');
    if (original !== source) changed.push(file);
  }
  const stale = (await Promise.all(['news', 'cases'].map(async kind => (await readdir(path.join(directory, `${kind}/list`)).catch(() => [])).filter(file => /^\d+\.mdx$/.test(file) && !output.has(`${kind}/list/${file}`)).map(file => `${kind}/list/${file}`)))).flat();
  if (check && (changed.length || stale.length)) throw new Error(`Generated content is out of date. Run npm run content:build.\n${[...changed, ...stale].join('\n')}`);
  // Resolve and validate every input before changing any output.
  if (!check) {
    for (const file of changed) {
      await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
      await writeFile(path.join(directory, file), output.get(file));
    }
    for (const file of stale) await unlink(path.join(directory, file));
  }
  return { changed: [...changed, ...stale], count: articles.news.length + articles.cases.length };
}

export function watchContent(directory, report) {
  let timer;
  let dirty = false;
  let running = false;
  let closed = false;
  let pending = Promise.resolve();
  const rebuild = () => {
    dirty = true;
    if (running) return;
    running = true;
    pending = (async () => {
      while (dirty && !closed) {
        dirty = false;
        try { report(null, await buildContent(directory)); }
        catch (error) { report(error); }
      }
    })().finally(() => { running = false; });
  };
  const watchers = ['news', 'cases', 'images', 'templates', 'content'].map(folder => watch(path.join(directory, folder), { recursive: true }, (_, filename) => {
    const file = String(filename || '').replaceAll('\\', '/');
    if (['news', 'cases'].includes(folder) && (!file.endsWith('.mdx') || file === 'list.mdx' || file.startsWith('list/'))) return;
    clearTimeout(timer);
    timer = setTimeout(rebuild, 150);
  }));
  watchers.push(watch(directory, (_, filename) => {
    if (String(filename) !== 'docs.json') return;
    clearTimeout(timer);
    timer = setTimeout(rebuild, 150);
  }));
  return async () => {
    closed = true;
    clearTimeout(timer);
    watchers.forEach(watcher => watcher.close());
    await pending;
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await buildContent(root, { check: process.argv.includes('--check') });
    console.log(`${result.count} articles checked; ${result.changed.length} generated files updated.`);
    if (process.argv.includes('--watch') || process.argv.includes('--preview')) {
      const close = watchContent(root, (error, result) => {
        if (error) console.error(error.message);
        else if (result.changed.length) console.log(`${result.count} articles refreshed; ${result.changed.length} generated files updated.`);
      });
      console.log('Watching MDX articles, images and content settings.');
      const preview = process.argv.includes('--preview') ? spawn('npx', ['--yes', 'mint@4.2.1096', 'dev', '--port', '3001', '--no-open'], { cwd: root, stdio: 'inherit' }) : null;
      preview?.on('exit', code => { close().then(() => { process.exitCode = code ?? 1; }); });
      preview?.on('error', error => { console.error(error.message); close().then(() => { process.exitCode = 1; }); });
      for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.once(signal, () => {
        close().then(() => { preview?.kill(signal); process.exit(code); });
      });
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
