import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContent, watchContent } from './build-content.mjs';
import { parseDocument } from 'yaml';

const project = fileURLToPath(new URL('../', import.meta.url));
const read = (directory, file) => readFile(path.join(directory, file), 'utf8');
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'textin-content-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await Promise.all(['content', 'news', 'cases', 'images'].map(folder => mkdir(path.join(directory, folder))));
  await cp(path.join(project, 'templates'), path.join(directory, 'templates'), { recursive: true });
  await cp(path.join(project, 'content/schema.json'), path.join(directory, 'content/schema.json'));
  await writeFile(path.join(directory, 'docs.json'), JSON.stringify({ navigation: { groups: [{ group: 'Resources', pages: ['index'] }, { group: 'Blog', pages: [] }, { group: 'Case Studies', pages: [] }] } }));
  await writeFile(path.join(directory, 'images/cover.webp'), 'fixture');
  const article = '---\ntitle: "A new article"\ndescription: "An operator-written summary."\n---\n\n## Authored section\n\nKeep this body unchanged.\n\n<Card title="Learn more" href="https://www.textin.ai/xparse">Official component.</Card>\n';
  await writeFile(path.join(directory, 'news/new-article.mdx'), article);
  const catalog = { siteUrl: 'https://resources.example.com', news: [{ page: 'news/new-article', date: '2026-10-23', category: 'Technical', product: 'xParse', cover: '/images/cover.webp', readMinutes: 4, homeOrder: 10 }], cases: [] };
  const save = async () => {
    await writeFile(path.join(directory, 'content/site.json'), JSON.stringify({ siteUrl: catalog.siteUrl }));
    for (const kind of ['news', 'cases']) {
      for (const filename of (await readdir(path.join(directory, kind))).filter(file => file.endsWith('.mdx') && file !== 'list.mdx')) {
        const file = `${kind}/${filename}`;
        const source = await read(directory, file);
        const match = source.match(/^---\n([\s\S]*?)\n---\n/);
        const document = parseDocument(match[1]);
        const index = catalog[kind].findIndex(item => `${item.page}.mdx` === file);
        if (index >= 0) {
          const { page, ...listing } = catalog[kind][index];
          document.set('listing', { homeOrder: false, order: (index + 1) * 10, ...listing });
        } else document.delete('listing');
        await writeFile(path.join(directory, file), `---\n${document.toString({ lineWidth: 0 })}---\n${source.slice(match[0].length)}`);
      }
    }
  };
  await save();
  return { directory, catalog, save, article };
}

test('new operator entry generates static list, home, navigation and native article chrome', async t => {
  const { directory } = await fixture(t);
  const result = await buildContent(directory);
  assert.equal(result.count, 1);
  assert.match(await read(directory, 'news/list.mdx'), /href="\/news\/new-article"/);
  assert.match(await read(directory, 'news/list.mdx'), /A new article/);
  assert.match(await read(directory, 'index.mdx'), /A new article/);
  assert.deepEqual(JSON.parse(await read(directory, 'docs.json')).navigation.groups[1].pages, ['news/new-article']);
  const article = await read(directory, 'news/new-article.mdx');
  assert.match(article, /Technical · xParse · Oct 23, 2026/);
  assert.match(article, /og:image: https:\/\/resources.example.com\/images\/cover.webp/);
  assert.match(article, /Keep this body unchanged\./);
  assert.match(article, /<Card title="Put document AI to work\."/);
  assert.doesNotMatch(article, /<time|<div|<section|<select/);
  assert.deepEqual((await buildContent(directory)).changed, []);
});

test('editing the native title updates both lists without replacing authored content', async t => {
  const { directory } = await fixture(t);
  await buildContent(directory);
  const article = await read(directory, 'news/new-article.mdx');
  await writeFile(path.join(directory, 'news/new-article.mdx'), article.replace('A new article', 'An updated title'));
  await assert.rejects(buildContent(directory, { check: true }), /out of date/);
  await buildContent(directory);
  assert.match(await read(directory, 'news/list.mdx'), /An updated title/);
  assert.match(await read(directory, 'index.mdx'), /An updated title/);
  assert.match(await read(directory, 'news/new-article.mdx'), /sidebarTitle: An updated title/);
  assert.match(await read(directory, 'news/new-article.mdx'), /Keep this body unchanged\./);
});

test('dragging Blog and Case Studies into Draft withdraws them and dragging back restores their original URLs', async t => {
  const { directory, catalog, save, article } = await fixture(t);
  await writeFile(path.join(directory, 'cases/customer.mdx'), article);
  catalog.cases.push({ page: 'cases/customer', date: '2026-10-23', industry: 'Manufacturing', scenarios: ['Document structuring'], product: 'xParse', cover: '/images/cover.webp', customer: 'Customer', metric: { value: '60%', label: 'verified improvement' }, homeOrder: 10 });
  await save();
  await buildContent(directory);
  const originals = await Promise.all(['news/new-article.mdx', 'cases/customer.mdx'].map(file => read(directory, file)));
  const docs = JSON.parse(await read(directory, 'docs.json'));
  const draft = docs.navigation.groups.find(group => group.group === 'Draft');
  draft.hidden = false;
  draft.pages = [{ group: 'case', pages: ['cases/customer'] }, 'news/new-article'];
  // Moving between navigation groups changes docs.json, not the MDX files.
  docs.navigation.groups[1].pages = [];
  docs.navigation.groups[2].pages = [];
  await writeFile(path.join(directory, 'docs.json'), JSON.stringify(docs));
  await assert.rejects(buildContent(directory, { check: true }), /out of date/);
  assert.equal((await buildContent(directory)).count, 0);
  for (const file of ['index.mdx', 'news/list.mdx', 'cases/list.mdx']) assert.doesNotMatch(await read(directory, file), /href="\/(news\/new-article|cases\/customer)"|&quot;page&quot;/);
  const withdrawn = JSON.parse(await read(directory, 'docs.json')).navigation.groups;
  assert.deepEqual(withdrawn[1].pages, []);
  assert.deepEqual(withdrawn[2].pages, []);
  assert.equal(withdrawn.find(group => group.group === 'Draft').hidden, true);
  assert.deepEqual(JSON.parse(await read(directory, 'docs.json')).redirects, [
    { source: '/cases/customer', destination: '/cases/list', permanent: false },
    { source: '/news/new-article', destination: '/news/list', permanent: false }
  ]);
  assert.deepEqual(await Promise.all(['news/new-article.mdx', 'cases/customer.mdx'].map(file => read(directory, file))), originals);
  assert.deepEqual((await buildContent(directory)).changed, []);
  const restore = JSON.parse(await read(directory, 'docs.json'));
  restore.navigation.groups.find(group => group.group === 'Draft').pages = [];
  restore.navigation.groups[1].pages = ['news/new-article'];
  restore.navigation.groups[2].pages = ['cases/customer'];
  await writeFile(path.join(directory, 'docs.json'), JSON.stringify(restore));
  assert.equal((await buildContent(directory)).count, 2);
  assert.match(await read(directory, 'index.mdx'), /href="\/news\/new-article"/);
  assert.match(await read(directory, 'cases/list.mdx'), /href="\/cases\/customer"/);
  assert.deepEqual(JSON.parse(await read(directory, 'docs.json')).redirects, []);
  assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
});

test('Draft keeps incomplete content without validation and rejects non-article paths before writing outputs', async t => {
  const { directory } = await fixture(t);
  await buildContent(directory);
  const docs = JSON.parse(await read(directory, 'docs.json'));
  const draft = docs.navigation.groups.find(group => group.group === 'Draft');
  draft.pages = ['news/new-article'];
  await writeFile(path.join(directory, 'docs.json'), JSON.stringify(docs));
  await writeFile(path.join(directory, 'news/new-article.mdx'), 'Work in progress');
  assert.equal((await buildContent(directory)).count, 0);
  assert.equal(await read(directory, 'news/new-article.mdx'), 'Work in progress');
  const baseline = await read(directory, 'news/list.mdx');
  for (const invalid of ['cases/list', 'index', '../secret', 'news/missing']) {
    draft.pages = [invalid];
    await writeFile(path.join(directory, 'docs.json'), JSON.stringify(docs));
    await assert.rejects(buildContent(directory), /Draft:/);
    assert.equal(await read(directory, 'news/list.mdx'), baseline);
  }
});

test('watching navigation drag operations rebuilds Draft redirects and restores lists', { timeout: 10000 }, async t => {
  const { directory } = await fixture(t);
  await buildContent(directory);
  let onReport = () => {};
  const close = watchContent(directory, (error, result) => onReport(error, result));
  try {
    for (const pages of [['news/new-article'], []]) {
      const docs = JSON.parse(await read(directory, 'docs.json'));
      docs.navigation.groups.find(group => group.group === 'Draft').pages = pages;
      const updated = new Promise((resolve, reject) => { onReport = (error, result) => { if (error) reject(error); else if (result.changed.includes('news/list.mdx')) resolve(result); }; });
      await writeFile(path.join(directory, 'docs.json'), JSON.stringify(docs));
      assert.equal((await updated).count, pages.length ? 0 : 1);
    }
    assert.match(await read(directory, 'news/list.mdx'), /href="\/news\/new-article"/);
  } finally { await close(); }
});

test('Draft preserves unrelated redirects, blocks redirect conflicts and rejects an invalid restoration', async t => {
  const { directory } = await fixture(t);
  await buildContent(directory);
  const docs = JSON.parse(await read(directory, 'docs.json'));
  const draft = docs.navigation.groups.find(group => group.group === 'Draft');
  const existing = { source: '/old-blog', destination: '/news/list' };
  const conflict = { source: '/news/new-article', destination: '/somewhere-else' };
  docs.redirects = [existing, conflict];
  draft.pages = ['news/new-article'];
  await writeFile(path.join(directory, 'docs.json'), JSON.stringify(docs));
  const baseline = await read(directory, 'news/list.mdx');
  await assert.rejects(buildContent(directory), /existing redirect/);
  assert.equal(await read(directory, 'news/list.mdx'), baseline);
  docs.redirects = [existing];
  await writeFile(path.join(directory, 'docs.json'), JSON.stringify(docs));
  await buildContent(directory);
  assert.deepEqual(JSON.parse(await read(directory, 'docs.json')).redirects[0], existing);
  const source = await read(directory, 'news/new-article.mdx');
  await writeFile(path.join(directory, 'news/new-article.mdx'), source.replace('date: 2026-10-23', 'date: invalid'));
  const restore = JSON.parse(await read(directory, 'docs.json'));
  restore.navigation.groups.find(group => group.group === 'Draft').pages = [];
  await writeFile(path.join(directory, 'docs.json'), JSON.stringify(restore));
  await assert.rejects(buildContent(directory), /listing.*date/);
  assert.deepEqual(JSON.parse(await read(directory, 'docs.json')).redirects.find(redirect => redirect.source === '/news/new-article'), { source: '/news/new-article', destination: '/news/list', permanent: false });
  await writeFile(path.join(directory, 'news/new-article.mdx'), source);
  await buildContent(directory);
  assert.deepEqual(JSON.parse(await read(directory, 'docs.json')).redirects, [existing]);
});

test('operators select unlimited homepage cards, order each section and withdraw with false', async t => {
  const { directory, catalog, save, article } = await fixture(t);
  catalog.news[0].homeOrder = false;
  for (const [kind, count] of [['news', 6], ['cases', 4]]) {
    for (let index = 1; index <= count; index++) {
      const page = `${kind}/selected-${index}`;
      await writeFile(path.join(directory, `${page}.mdx`), article);
      catalog[kind].push({ page, date: '2026-10-23', product: 'xParse', cover: '/images/cover.webp', homeOrder: (count - index + 1) * 10,
        ...(kind === 'news' ? { category: 'Technical', readMinutes: 4 } : { industry: 'Manufacturing', scenarios: ['Document structuring'], customer: `Customer ${index}`, metric: { value: 'Faster review', label: 'verified outcome' } }) });
    }
  }
  await save();
  await buildContent(directory);
  const homepage = await read(directory, 'index.mdx');
  const links = [...homepage.matchAll(/className="home-article-link" href="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(links, [...Array.from({ length: 6 }, (_, i) => `/news/selected-${6 - i}`), ...Array.from({ length: 4 }, (_, i) => `/cases/selected-${4 - i}`)]);
  assert.doesNotMatch(homepage, /href="\/news\/new-article"/);
  assert.match(homepage, /Latest from the Blog/);
  assert.match(homepage, /data-home-section="cases"/);
  assert.match(homepage, /Faster review/);
  const baseline = await read(directory, 'news/list.mdx');
  catalog.news[1].homeOrder = false;
  await save();
  await buildContent(directory);
  assert.doesNotMatch(await read(directory, 'index.mdx'), /href="\/news\/selected-1"/);
  assert.equal(await read(directory, 'news/list.mdx'), baseline);
  assert.match(await read(directory, 'news/selected-1.mdx'), /homeOrder: false/);
  assert.ok(JSON.parse(await read(directory, 'docs.json')).navigation.groups[1].pages.includes('news/selected-1'));
  assert.match(await read(directory, 'news/selected-1.mdx'), /Keep this body unchanged\./);
  for (const kind of ['news', 'cases']) for (const item of catalog[kind]) item.homeOrder = false;
  await save();
  await buildContent(directory);
  assert.doesNotMatch(await read(directory, 'index.mdx'), /data-home-section=/);
  assert.match(await read(directory, 'index.mdx'), /Put document AI/);
});

test('missing homepage settings are written back as false and never opt articles in', async t => {
  const { directory, catalog, save } = await fixture(t);
  delete catalog.news[0].homeOrder;
  await save();
  const file = path.join(directory, 'news/new-article.mdx');
  await writeFile(file, (await readFile(file, 'utf8')).replace('  homeOrder: false\n', ''));
  await buildContent(directory);
  assert.match(await readFile(file, 'utf8'), /homeOrder: false/);
  assert.doesNotMatch(await read(directory, 'index.mdx'), /className="home-article-link"/);
  assert.deepEqual((await buildContent(directory)).changed, []);
});

test('MDX paths and frontmatter alone supply new entries and a deterministic default order', async t => {
  const { directory, article } = await fixture(t);
  for (const [slug, date, order] of [['zeta', '2026-10-25', 0], ['beta', '2026-10-24', 0], ['alpha', '2026-10-24', 0], ['priority', '2025-01-01', 5]]) {
    const listing = `listing:\n  date: ${date}\n  category: Technical\n  product: xParse\n  cover: /images/cover.webp\n  readMinutes: 4\n${order ? `  order: ${order}\n` : ''}`;
    await writeFile(path.join(directory, `news/${slug}.mdx`), article.replace('title:', `${listing}title:`));
  }
  await buildContent(directory);
  assert.deepEqual(JSON.parse(await read(directory, 'docs.json')).navigation.groups[1].pages, ['news/zeta', 'news/alpha', 'news/beta', 'news/priority', 'news/new-article']);
  assert.match(await read(directory, 'news/list.mdx'), /href="\/news\/zeta"/);
  assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
});

test('watching MDX refreshes the list, retains it on invalid input, and recovers after correction', { timeout: 10000 }, async t => {
  const { directory } = await fixture(t);
  await buildContent(directory);
  let onReport = () => {};
  const close = watchContent(directory, (error, result) => onReport(error, result));
  const file = path.join(directory, 'news/new-article.mdx');
  try {
    const original = await readFile(file, 'utf8');
    const changed = new Promise(resolve => { onReport = (error, result) => { if (result?.changed.includes('news/list.mdx')) resolve(); }; });
    await writeFile(file, original.replace('A new article', 'Updated without a JSON file'));
    await changed;
    const baseline = await read(directory, 'news/list.mdx');
    assert.match(baseline, /Updated without a JSON file/);
    const invalid = new Promise(resolve => { onReport = error => { if (error) resolve(error); }; });
    await writeFile(file, original.replace('date: 2026-10-23', 'date: invalid'));
    assert.match((await invalid).message, /new-article.mdx: listing.*date/);
    assert.equal(await read(directory, 'news/list.mdx'), baseline);
    const recovered = new Promise(resolve => { onReport = (error, result) => { if (result?.changed.includes('news/list.mdx')) resolve(); }; });
    await writeFile(file, original);
    await recovered;
    assert.match(await read(directory, 'news/list.mdx'), /A new article/);
  } finally { await close(); }
});

test('a customer story carries multiple scenarios and its reported metric into the list', async t => {
  const { directory, catalog, save, article } = await fixture(t);
  await writeFile(path.join(directory, 'cases/new-story.mdx'), article.replace('A new article', 'A new customer story'));
  catalog.cases.push({ page: 'cases/new-story', date: '2026-10-23', industry: 'Manufacturing', scenarios: ['Accounts payable automation', 'Logistics & trade document entry'], product: 'DocFlow', cover: '/images/cover.webp', customer: 'Example company', metric: { value: '60%', label: 'reported improvement' }, featured: true });
  await save();
  await buildContent(directory);
  const list = await read(directory, 'cases/list.mdx');
  assert.match(list, /data-scenarios="Accounts payable automation\|Logistics &amp; trade document entry"/);
  assert.match(list, /data-category="Manufacturing"/);
  assert.match(list, /<strong>60%<\/strong>/);
  assert.match(list, /className="content-customer"><p>Example company<\/p>/);
  assert.ok(list.indexOf('Example company') < list.indexOf('className="content-meta"'));
  assert.deepEqual(JSON.parse(await read(directory, 'docs.json')).navigation.groups[2].pages, ['cases/new-story']);
  assert.match(await read(directory, 'cases/new-story.mdx'), /Back to Case Studies/);
  catalog.cases[0].customerLogo = '/images/cover.webp';
  await save();
  await buildContent(directory);
  const withLogo = await read(directory, 'cases/list.mdx');
  assert.match(withLogo, /className="content-customer"><img src="\/images\/cover.webp" alt="" loading="lazy" \/><p>Example company<\/p>/);
  catalog.cases[0].customerLogo = '/images/missing.webp';
  await save();
  await assert.rejects(buildContent(directory), /customer logo image not found/);
  assert.equal(await read(directory, 'cases/list.mdx'), withLogo);
  catalog.cases[0].customerLogo = '/images/../cover.webp';
  await save();
  await assert.rejects(buildContent(directory), /customerLogo must stay inside images/);
});

test('invalid MDX listing changes never partially rewrite generated pages', async t => {
  const { directory, catalog, save } = await fixture(t);
  await buildContent(directory);
  const baseline = await read(directory, 'news/list.mdx');
  for (const [field, value, message] of [
    ['date', '2026-02-30', /format "date"/],
    ['cover', '/images/missing.webp', /image not found/],
    ['order', -1, /must be >= 0/],
    ['order', 1.5, /must be integer/],
    ['category', 'Guides', /allowed values/],
    ...[true, 0, -1, 1.5, '10', 'false', null].map(value => ['homeOrder', value, /homeOrder/])
  ]) {
    const original = catalog.news[0][field];
    catalog.news[0][field] = value;
    await save();
    await assert.rejects(buildContent(directory), message);
    assert.equal(await read(directory, 'news/list.mdx'), baseline);
    catalog.news[0][field] = original;
  }
  await save();
  await writeFile(path.join(directory, 'news/another.mdx'), await read(directory, 'news/new-article.mdx'));
  const source = await read(directory, 'news/new-article.mdx');
  await writeFile(path.join(directory, 'news/new-article.mdx'), source.replace('listing:', 'listing:\n  page: news/another'));
  await assert.rejects(buildContent(directory), /new-article.mdx: listing.*additional properties/);
  assert.equal(await read(directory, 'news/list.mdx'), baseline);
});

test('a story using both products generates separate filter values and readable article metadata', async t => {
  const { directory, catalog, save, article } = await fixture(t);
  await writeFile(path.join(directory, 'cases/securities.mdx'), article);
  catalog.cases.push({ page: 'cases/securities', date: '2026-01-20', industry: 'Financial services', scenarios: ['Enterprise AI platforms'], product: ['xParse', 'DocFlow'], cover: '/images/cover.webp', customer: 'Securities firm', metric: { value: '400+', label: 'AI workflows' } });
  await save();
  await buildContent(directory);
  const list = await read(directory, 'cases/list.mdx');
  assert.match(list, /data-product="xParse &amp; DocFlow" data-products="xParse\|DocFlow"/);
  assert.match(await read(directory, 'cases/securities.mdx'), /Financial services · xParse & DocFlow · Jan 20, 2026/);
  const news = await read(directory, 'news/list.mdx');
  assert.match(news, /data-product="xParse"/);
  assert.doesNotMatch(news, /data-products=/);
  for (const product of [[], ['xParse', 'xParse']]) {
    catalog.cases[0].product = product;
    await save();
    await assert.rejects(buildContent(directory), /cases\/.*\.mdx: listing/);
    assert.equal(await read(directory, 'cases/list.mdx'), list);
  }
});

test('catalog strings are escaped and removing an entry removes all listing references', async t => {
  const { directory, catalog, save } = await fixture(t);
  const source = await read(directory, 'news/new-article.mdx');
  await writeFile(path.join(directory, 'news/new-article.mdx'), source.replace('A new article', 'Title <script>{danger}</script>'));
  await buildContent(directory);
  assert.match(await read(directory, 'news/list.mdx'), /&lt;script&gt;&#123;danger&#125;&lt;\/script&gt;/);
  catalog.news = [];
  await save();
  await buildContent(directory);
  assert.doesNotMatch(await read(directory, 'news/list.mdx'), /new-article/);
  assert.doesNotMatch(await read(directory, 'index.mdx'), /new-article/);
  assert.deepEqual(JSON.parse(await read(directory, 'docs.json')).navigation.groups[1].pages, []);
  assert.match(await read(directory, 'news/new-article.mdx'), /Keep this body unchanged\./);
});

test('multiple industries stay separate in cards, article metadata and the global pagination index', async t => {
  const { directory, catalog, save, article } = await fixture(t);
  await buildContent(directory);
  const news = await read(directory, 'news/list.mdx');
  for (let index = 1; index <= 6; index++) {
    const page = `cases/customer-${index}`;
    await writeFile(path.join(directory, `${page}.mdx`), article);
    catalog.cases.push({ page, date: '2026-10-23', industry: index === 6 ? ['Automotive', 'Manufacturing'] : 'Manufacturing', scenarios: ['Accounts payable automation'], product: 'DocFlow', cover: '/images/cover.webp', customer: `Customer ${index}`, metric: { value: '60%', label: 'improvement' } });
  }
  await save();
  await buildContent(directory);
  const first = await read(directory, 'cases/list.mdx');
  const second = await read(directory, 'cases/list/2.mdx');
  const entries = JSON.parse(first.match(/data-catalog-index="([^"]*)"/)[1].replaceAll('&quot;', '"').replaceAll('&#123;', '{').replaceAll('&#125;', '}'));
  assert.deepEqual(entries[5].category, ['Automotive', 'Manufacturing']);
  assert.equal(entries.filter(item => [item.category].flat().includes('Manufacturing')).length, 6);
  assert.equal(entries.filter(item => [item.category].flat().includes('Automotive')).length, 1);
  assert.match(second, /<span className="content-industries"><span>Automotive<\/span><span>Manufacturing<\/span><\/span>/);
  assert.match(await read(directory, 'cases/customer-6.mdx'), /Automotive · Manufacturing · DocFlow · Oct 23, 2026/);
  assert.equal(await read(directory, 'news/list.mdx'), news);
  for (const industry of [[], ['Automotive', 'Automotive'], [' ']]) {
    catalog.cases[5].industry = industry;
    await save();
    await assert.rejects(buildContent(directory), /cases\/.*\.mdx: listing/);
    assert.equal(await read(directory, 'cases/list/2.mdx'), second);
  }
});

test('case pages contain at most five cards and remove obsolete pages without changing news', async t => {
  const { directory, catalog, save, article } = await fixture(t);
  await buildContent(directory);
  const news = await read(directory, 'news/list.mdx');
  const home = await read(directory, 'index.mdx');
  for (let index = 1; index <= 15; index++) {
    const page = `cases/customer-${index}`;
    await writeFile(path.join(directory, `${page}.mdx`), article.replace('A new article', `Customer ${index} story`));
    catalog.cases.push({ page, date: '2026-10-23', industry: index > 9 ? 'Manufacturing' : 'Financial services', scenarios: ['Accounts payable automation'], product: 'DocFlow', cover: '/images/cover.webp', customer: `Customer ${index}`, metric: { value: '60%', label: 'improvement' } });
  }
  await save();
  await buildContent(directory);
  const first = await read(directory, 'cases/list.mdx');
  const second = await read(directory, 'cases/list/2.mdx');
  const third = await read(directory, 'cases/list/3.mdx');
  assert.equal((first.match(/data-content-page=/g) || []).length, 5);
  assert.equal((second.match(/data-content-page=/g) || []).length, 5);
  assert.equal((third.match(/data-content-page=/g) || []).length, 5);
  assert.match(first, /data-content-page="cases\/customer-5"/);
  assert.doesNotMatch(first, /data-content-page="cases\/customer-6"/);
  assert.match(second, /data-content-page="cases\/customer-6"/);
  assert.doesNotMatch(second, /data-content-page="cases\/customer-5"/);
  assert.match(third, /data-content-page="cases\/customer-15"/);
  assert.match(second, /data-initial-page="2"/);
  assert.match(second, /6–10 of 15/);
  assert.match(third, /11–15 of 15/);
  assert.match(first, /Customer 15 story/); // Global search index includes unloaded stories.
  assert.doesNotMatch(first.match(/data-catalog-index="([^"]*)"/)[1], /cover\.webp/);
  assert.ok(JSON.parse(await read(directory, 'docs.json')).navigation.groups[0].pages.includes('cases/list/2'));
  assert.equal(await read(directory, 'news/list.mdx'), news);
  assert.equal(await read(directory, 'index.mdx'), home);
  assert.deepEqual((await buildContent(directory)).changed, []);
  catalog.cases = catalog.cases.slice(0, 5);
  await save();
  await assert.rejects(buildContent(directory, { check: true }), /cases\/list\/2.mdx/);
  await buildContent(directory);
  await assert.rejects(read(directory, 'cases/list/2.mdx'), { code: 'ENOENT' });
  await assert.rejects(read(directory, 'cases/list/3.mdx'), { code: 'ENOENT' });
  assert.ok(!JSON.parse(await read(directory, 'docs.json')).navigation.groups[0].pages.includes('cases/list/2'));
  assert.equal(await read(directory, 'news/list.mdx'), news);
  assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
});

test('blog paginates at five articles, keeps a global index and cleans up reduced page counts', async t => {
  const { directory, catalog, save, article } = await fixture(t);
  await buildContent(directory);
  const cases = await read(directory, 'cases/list.mdx');
  const items = [];
  for (let index = 1; index <= 11; index++) {
    const page = `news/article-${index}`;
    await writeFile(path.join(directory, `${page}.mdx`), article.replace('A new article', `Blog article ${index}`));
    items.push({ page, date: '2026-10-23', category: index > 5 ? 'Announcements' : 'Technical', product: 'xParse', cover: '/images/cover.webp', readMinutes: 4 });
  }
  for (const count of [5, 6, 11]) {
    catalog.news = items.slice(0, count);
    await save();
    await buildContent(directory);
    const first = await read(directory, 'news/list.mdx');
    assert.equal((first.match(/data-content-page=/g) || []).length, 5);
    assert.doesNotMatch(first, /data-content-page="news\/article-6"/);
    assert.match(first, /aria-label="Blog pagination"/);
    assert.equal(/data-catalog-pagination hidden/.test(first), count === 5);
    const index = first.match(/data-catalog-index="([^"]*)"/)[1];
    assert.match(index, new RegExp(`Blog article ${count}`));
    assert.doesNotMatch(index, /cover\.webp/);
    const pages = JSON.parse(await read(directory, 'docs.json')).navigation.groups[0].pages;
    assert.equal(pages.includes('news/list/2'), count > 5);
    if (count > 5) {
      const second = await read(directory, 'news/list/2.mdx');
      assert.equal((second.match(/data-content-page=/g) || []).length, Math.min(count - 5, 5));
      assert.match(second, /data-content-page="news\/article-6"/);
      assert.doesNotMatch(second, /data-content-page="news\/article-1"/);
      assert.match(first, /Announcements/); // An unloaded page contributes its category to global filters.
    }
    if (count === 11) assert.equal((await read(directory, 'news/list/3.mdx')).match(/data-content-page=/g).length, 1);
    assert.equal(await read(directory, 'cases/list.mdx'), cases);
    assert.match(await read(directory, 'news/article-1.mdx'), /Keep this body unchanged\./);
    assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
  }
  catalog.news = items.slice(0, 5);
  await save();
  await assert.rejects(buildContent(directory, { check: true }), /news\/list\/3.mdx/);
  await buildContent(directory);
  for (const page of [2, 3]) await assert.rejects(read(directory, `news/list/${page}.mdx`), { code: 'ENOENT' });
  const pages = JSON.parse(await read(directory, 'docs.json')).navigation.groups[0].pages;
  assert.ok(!pages.some(page => /^news\/list\/\d+$/.test(page)));
  catalog.news = [];
  await save();
  await buildContent(directory);
  assert.match(await read(directory, 'news/list.mdx'), /data-page-range>0–0 of 0/);
  assert.equal((await read(directory, 'news/list.mdx')).match(/data-content-page=/g), null);
  assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
});
