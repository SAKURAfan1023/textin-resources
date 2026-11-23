import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm, readdir, rename } from 'node:fs/promises';
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
          document.set('slug', page.split('/')[1]);
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

test('console-created root pages move into their navigation category and regenerate from a single MDX', async t => {
  const { directory, catalog, save, article } = await fixture(t);
  await writeFile(path.join(directory, 'cases/customer.mdx'), article);
  catalog.cases.push({ page: 'cases/customer', date: '2026-10-23', industry: 'Manufacturing', scenarios: ['Document structuring'], product: 'xParse', cover: '/images/cover.webp', customer: 'Customer', metric: { value: '60%', label: 'verified improvement' }, homeOrder: 10 });
  await save();
  await rename(path.join(directory, 'news/new-article.mdx'), path.join(directory, 'new-article.mdx'));
  await rename(path.join(directory, 'cases/customer.mdx'), path.join(directory, 'customer.mdx'));
  const docs = JSON.parse(await read(directory, 'docs.json'));
  docs.navigation.groups[1].pages = ['new-article'];
  docs.navigation.groups[2].pages = [{ group: 'Customers', pages: ['customer'] }];
  await writeFile(path.join(directory, 'docs.json'), JSON.stringify(docs));
  await assert.rejects(buildContent(directory, { check: true }), /out of date/);
  assert.match(await read(directory, 'new-article.mdx'), /Keep this body unchanged/);
  await assert.rejects(read(directory, 'news/new-article.mdx'), { code: 'ENOENT' });
  const result = await buildContent(directory);
  assert.equal(result.count, 2);
  for (const [kind, slug] of [['news', 'new-article'], ['cases', 'customer']]) {
    assert.ok(result.changed.includes(`${slug}.mdx`));
    await assert.rejects(read(directory, `${slug}.mdx`), { code: 'ENOENT' });
    assert.match(await read(directory, `${kind}/${slug}.mdx`), /Keep this body unchanged/);
    assert.match(await read(directory, `${kind}/${slug}.mdx`), /mode: center/);
    for (const file of [`${kind}/list.mdx`, 'index.mdx']) assert.ok((await read(directory, file)).includes(`href="/${kind}/${slug}"`));
  }
  const navigation = JSON.parse(await read(directory, 'docs.json')).navigation.groups;
  assert.deepEqual(navigation[1].pages, ['news/new-article']);
  assert.deepEqual(navigation[2].pages, ['cases/customer']);
  assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
});

test('publishing preserves native Frame image width, caption and font size for both article types', async t => {
  const { directory, catalog, save, article } = await fixture(t);
  catalog.cases.push({ page: 'cases/customer', date: '2026-10-23', industry: 'Manufacturing', scenarios: ['Document structuring'], product: 'xParse', cover: '/images/cover.webp', customer: 'Customer', metric: { value: '60%', label: 'verified improvement' } });
  await writeFile(path.join(directory, 'cases/customer.mdx'), article);
  await save();
  const image = '<Frame caption="A customer workflow." style={{ width: "70%", fontSize: "15px" }}>\n  <img src="/images/cover.webp" alt="Customer workflow" />\n</Frame>';
  for (const file of ['news/new-article.mdx', 'cases/customer.mdx']) {
    await writeFile(path.join(directory, file), `${await read(directory, file)}\n${image}\n`);
  }
  await buildContent(directory);
  for (const file of ['news/new-article.mdx', 'cases/customer.mdx']) {
    assert.ok((await read(directory, file)).includes(image), `${file}: image settings must stay operator-owned`);
  }
  assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
});

test('empty slug generates the article filename from its title and follows later title edits', async t => {
  for (const kind of ['news', 'cases']) {
    for (const setting of ['', 'slug: false\n', 'slug:\n', 'slug: ""\n', 'slug: "  "\n']) {
      const { directory, catalog, save, article } = await fixture(t);
      if (kind === 'cases') {
        await writeFile(path.join(directory, 'cases/customer.mdx'), article);
        catalog.cases.push({ page: 'cases/customer', date: '2026-10-23', industry: 'Manufacturing', scenarios: ['Document structuring'], product: 'xParse', cover: '/images/cover.webp', customer: 'Customer', metric: { value: '60%', label: 'verified improvement' }, homeOrder: 10 });
        await save();
      }
      const original = kind === 'news' ? 'news/new-article.mdx' : 'cases/customer.mdx';
      const source = (await read(directory, original)).replace(/^slug:.*\n/m, setting);
      await rm(path.join(directory, original));
      await writeFile(path.join(directory, 'new-page.mdx'), source);
      const docs = JSON.parse(await read(directory, 'docs.json'));
      docs.navigation.groups.find(group => group.group === (kind === 'news' ? 'Blog' : 'Case Studies')).pages = ['new-page'];
      await writeFile(path.join(directory, 'docs.json'), JSON.stringify(docs));
      await assert.rejects(buildContent(directory, { check: true }), /out of date/);
      assert.equal(await read(directory, 'new-page.mdx'), source);
      await buildContent(directory);
      const first = `${kind}/a-new-article`;
      await assert.rejects(read(directory, 'new-page.mdx'), { code: 'ENOENT' });
      assert.match(await read(directory, `${first}.mdx`), /title: "A new article"/);
      for (const file of [`${kind}/list.mdx`, 'index.mdx']) assert.ok((await read(directory, file)).includes(`href="/${first}"`));
      const updated = (await read(directory, `${first}.mdx`)).replace('A new article', "What's new: Café OCR — fast & precise!");
      await writeFile(path.join(directory, `${first}.mdx`), updated);
      await buildContent(directory);
      const current = `${kind}/whats-new-cafe-ocr-fast-precise`;
      await assert.rejects(read(directory, `${first}.mdx`), { code: 'ENOENT' });
      assert.ok((await read(directory, `${kind}/list.mdx`)).includes(`href="/${current}"`));
      const result = JSON.parse(await read(directory, 'docs.json'));
      assert.deepEqual(result.navigation.groups.find(group => group.group === (kind === 'news' ? 'Blog' : 'Case Studies')).pages, [current]);
      assert.ok(result.redirects.some(redirect => redirect.source === `/${first}` && redirect.destination === `/${current}` && redirect.permanent));
      assert.ok(result.redirects.some(redirect => redirect.source === '/new-page' && redirect.destination === `/${current}` && redirect.permanent));
      assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
    }
  }
});

test('custom slug takes precedence on first creation, gains its prefix and stays fixed when the title changes', async t => {
  for (const kind of ['news', 'cases']) {
    for (const slug of ['short-name', `${kind}/short-name`, `/${kind}/short-name`]) {
      const { directory, catalog, save, article } = await fixture(t);
      if (kind === 'cases') {
        await writeFile(path.join(directory, 'cases/customer.mdx'), article);
        catalog.cases.push({ page: 'cases/customer', date: '2026-10-23', industry: 'Manufacturing', scenarios: ['Document structuring'], product: 'xParse', cover: '/images/cover.webp', customer: 'Customer', metric: { value: '60%', label: 'verified improvement' }, homeOrder: 10 });
        await save();
      }
      const original = kind === 'news' ? 'news/new-article.mdx' : 'cases/customer.mdx';
      await writeFile(path.join(directory, original), (await read(directory, original)).replace(/^slug:.*$/m, `slug: "${slug}"`));
      await rename(path.join(directory, original), path.join(directory, 'new-page.mdx'));
      const docs = JSON.parse(await read(directory, 'docs.json'));
      docs.navigation.groups.find(group => group.group === (kind === 'news' ? 'Blog' : 'Case Studies')).pages = ['new-page'];
      await writeFile(path.join(directory, 'docs.json'), JSON.stringify(docs));
      await buildContent(directory);
      const file = `${kind}/short-name.mdx`;
      await writeFile(path.join(directory, file), (await read(directory, file)).replace('A new article', 'A much longer title'));
      await buildContent(directory);
      assert.match(await read(directory, `${kind}/list.mdx`), /A much longer title/);
      assert.ok((await read(directory, `${kind}/list.mdx`)).includes(`href="/${kind}/short-name"`));
      assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
      await writeFile(path.join(directory, file), (await read(directory, file)).replace(/^slug:.*$/m, 'slug: false'));
      await buildContent(directory);
      assert.ok((await read(directory, `${kind}/list.mdx`)).includes(`href="/${kind}/a-much-longer-title"`));
      await assert.rejects(read(directory, file), { code: 'ENOENT' });
      assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
    }
  }
});

test('editing only slug refreshes navigation, old URL aliases and links in published and Draft content', async t => {
  for (const kind of ['news', 'cases']) {
    const { directory, catalog, save, article } = await fixture(t);
    const previous = `${kind}/new-article`;
    const current = `${kind}/short-name`;
    if (kind === 'cases') {
      await writeFile(path.join(directory, `${previous}.mdx`), article);
      catalog.cases.push({ page: previous, date: '2026-10-23', industry: 'Manufacturing', scenarios: ['Document structuring'], product: 'xParse', cover: '/images/cover.webp', customer: 'Customer', metric: { value: '60%', label: 'verified improvement' }, homeOrder: 10 });
      await save();
    }
    await buildContent(directory);
    const links = `\n[Related](/${previous}?ref=article#authored-section)\n<Card title="Related" href="https://resources.example.com/${previous}" />\n[Source](https://www.textin.com/${previous})\n[External](//external.example.com/${previous})\n![Image](/images/${previous}/cover.webp)\n`;
    await writeFile(path.join(directory, `${previous}.mdx`), (await read(directory, `${previous}.mdx`)).replace(/^slug:.*$/m, 'slug: short-name') + links);
    await writeFile(path.join(directory, 'news/draft-notes.mdx'), article + links);
    const docs = JSON.parse(await read(directory, 'docs.json'));
    docs.navigation.groups.find(group => group.group === 'Draft').pages = ['news/draft-notes'];
    docs.redirects = [{ source: `/${kind}/20261023120000`, destination: `/${previous}`, permanent: true }];
    await writeFile(path.join(directory, 'docs.json'), JSON.stringify(docs));
    await buildContent(directory);
    for (const file of [`${kind}/list.mdx`, 'index.mdx']) assert.ok((await read(directory, file)).includes(`href="/${current}"`));
    const updated = JSON.parse(await read(directory, 'docs.json'));
    assert.deepEqual(updated.navigation.groups.find(group => group.group === (kind === 'news' ? 'Blog' : 'Case Studies')).pages, [current]);
    assert.ok(updated.redirects.some(redirect => redirect.source === `/${kind}/20261023120000` && redirect.destination === `/${current}` && redirect.permanent));
    assert.ok(updated.redirects.some(redirect => redirect.source === `/${previous}` && redirect.destination === `/${current}` && redirect.permanent));
    for (const file of [`${current}.mdx`, 'news/draft-notes.mdx']) {
      const source = await read(directory, file);
      assert.ok(source.includes(`[Related](/${current}?ref=article#authored-section)`));
      assert.ok(source.includes(`href="https://resources.example.com/${current}"`));
      assert.ok(source.includes(`[Source](https://www.textin.com/${previous})`));
      assert.ok(source.includes(`[External](//external.example.com/${previous})`));
      assert.ok(source.includes(`![Image](/images/${previous}/cover.webp)`));
    }
    assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
  }
});

test('invalid or duplicate slugs leave source files, navigation and generated pages untouched', async t => {
  const { directory } = await fixture(t);
  await buildContent(directory);
  const original = await read(directory, 'news/new-article.mdx');
  const baseline = await Promise.all(['docs.json', 'index.mdx', 'news/list.mdx'].map(file => read(directory, file)));
  for (const slug of ['true', '[]', '{}', 'list', 'index', '../outside', '"https://example.com/page"']) {
    const edited = original.replace(/^slug:.*$/m, `slug: ${slug}`);
    await writeFile(path.join(directory, 'news/new-article.mdx'), edited);
    await assert.rejects(buildContent(directory), /slug|short name/);
    assert.equal(await read(directory, 'news/new-article.mdx'), edited);
    assert.deepEqual(await Promise.all(['docs.json', 'index.mdx', 'news/list.mdx'].map(file => read(directory, file))), baseline);
  }
  const first = original.replace(/^slug:.*$/m, 'slug: false');
  await writeFile(path.join(directory, 'news/new-article.mdx'), first);
  await writeFile(path.join(directory, 'news/second.mdx'), first);
  await assert.rejects(buildContent(directory), /duplicate article path/);
  assert.equal(await read(directory, 'news/second.mdx'), first);
  assert.equal(await read(directory, 'news/new-article.mdx'), first);
  await assert.rejects(read(directory, 'news/a-new-article.mdx'), { code: 'ENOENT' });
  await rm(path.join(directory, 'news/second.mdx'));
  await writeFile(path.join(directory, 'news/new-article.mdx'), original.replace(/^slug:.*$/m, 'slug: occupied'));
  await writeFile(path.join(directory, 'news/occupied.mdx'), 'Unfinished Draft');
  const docs = JSON.parse(baseline[0]);
  docs.navigation.groups.find(group => group.group === 'Draft').pages = ['news/occupied'];
  await writeFile(path.join(directory, 'docs.json'), JSON.stringify(docs));
  await assert.rejects(buildContent(directory), /cannot overwrite news\/occupied.mdx/);
  assert.equal(await read(directory, 'news/occupied.mdx'), 'Unfinished Draft');
  assert.equal(await read(directory, 'docs.json'), JSON.stringify(docs));
  assert.equal(await read(directory, 'news/list.mdx'), baseline[2]);
});

test('slug changes saved in Draft take effect on restoration while withdrawal and legacy aliases stay intact', async t => {
  const { directory } = await fixture(t);
  await buildContent(directory);
  const docs = JSON.parse(await read(directory, 'docs.json'));
  docs.navigation.groups[1].pages = [];
  docs.navigation.groups.find(group => group.group === 'Draft').pages = ['news/new-article'];
  docs.redirects = [{ source: '/news/20261023120000', destination: '/news/new-article', permanent: true }];
  await writeFile(path.join(directory, 'docs.json'), JSON.stringify(docs));
  const edited = (await read(directory, 'news/new-article.mdx')).replace(/^slug:.*$/m, 'slug: short-name');
  await writeFile(path.join(directory, 'news/new-article.mdx'), edited);
  await buildContent(directory);
  assert.equal(await read(directory, 'news/new-article.mdx'), edited);
  assert.doesNotMatch(await read(directory, 'news/list.mdx'), /href="\/news\/new-article"|href="\/news\/short-name"/);
  const restore = JSON.parse(await read(directory, 'docs.json'));
  restore.navigation.groups[1].pages = ['news/new-article'];
  restore.navigation.groups.find(group => group.group === 'Draft').pages = [];
  await writeFile(path.join(directory, 'docs.json'), JSON.stringify(restore));
  await buildContent(directory);
  const published = JSON.parse(await read(directory, 'docs.json'));
  assert.deepEqual(published.navigation.groups[1].pages, ['news/short-name']);
  assert.ok(published.redirects.some(redirect => redirect.source === '/news/20261023120000' && redirect.destination === '/news/short-name' && redirect.permanent));
  assert.ok(published.redirects.some(redirect => redirect.source === '/news/new-article' && redirect.destination === '/news/short-name' && redirect.permanent));
  assert.ok(!published.redirects.some(redirect => redirect.destination === '/news/list'));
  assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
});

test('watching an automatic title Path renames its file and refreshes navigation and lists', { timeout: 10000 }, async t => {
  const { directory } = await fixture(t);
  await writeFile(path.join(directory, 'news/new-article.mdx'), (await read(directory, 'news/new-article.mdx')).replace(/^slug:.*$/m, 'slug: false'));
  await buildContent(directory);
  let onReport = () => {};
  const close = watchContent(directory, (error, result) => onReport(error, result));
  try {
    const refreshed = new Promise((resolve, reject) => { onReport = (error, result) => { if (error) reject(error); else if (result.changed.includes('news/a-renamed-article.mdx')) resolve(result); }; });
    await writeFile(path.join(directory, 'news/a-new-article.mdx'), (await read(directory, 'news/a-new-article.mdx')).replace('A new article', 'A renamed article'));
    await refreshed;
    await assert.rejects(read(directory, 'news/a-new-article.mdx'), { code: 'ENOENT' });
    assert.match(await read(directory, 'news/list.mdx'), /href="\/news\/a-renamed-article"/);
    assert.deepEqual(JSON.parse(await read(directory, 'docs.json')).navigation.groups[1].pages, ['news/a-renamed-article']);
  } finally { await close(); }
});

test('a Path saved without its corresponding MDX fails before navigation or lists can silently drop it', async t => {
  const { directory } = await fixture(t);
  await buildContent(directory);
  const malformed = 'path.new-article.new-article';
  await rename(path.join(directory, 'news/new-article.mdx'), path.join(directory, malformed));
  const docs = JSON.parse(await read(directory, 'docs.json'));
  docs.navigation.groups[1].pages = ['news/20261118'];
  await writeFile(path.join(directory, 'docs.json'), JSON.stringify(docs));
  const baseline = await Promise.all(['docs.json', 'index.mdx', 'news/list.mdx', malformed].map(file => read(directory, file)));
  await assert.rejects(buildContent(directory), /Path news\/20261118 does not match an existing file: news\/20261118\.mdx/);
  assert.deepEqual(await Promise.all(['docs.json', 'index.mdx', 'news/list.mdx', malformed].map(file => read(directory, file))), baseline);
  await rename(path.join(directory, malformed), path.join(directory, 'news/20261118.mdx'));
  await writeFile(path.join(directory, 'news/20261118.mdx'), (await read(directory, 'news/20261118.mdx')).replace(/^slug:.*$/m, 'slug: \"20261118\"'));
  await buildContent(directory);
  assert.match(await read(directory, 'news/list.mdx'), /href="\/news\/20261118"/);
  assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
});

test('changing back to a former Path removes its old redirect instead of creating a loop', async t => {
  const { directory } = await fixture(t);
  await buildContent(directory);
  const docs = JSON.parse(await read(directory, 'docs.json'));
  docs.redirects = [{ source: '/news/former-name', destination: '/news/new-article', permanent: true }];
  await writeFile(path.join(directory, 'docs.json'), JSON.stringify(docs));
  await writeFile(path.join(directory, 'news/new-article.mdx'), (await read(directory, 'news/new-article.mdx')).replace(/^slug:.*$/m, 'slug: former-name'));
  await buildContent(directory);
  assert.deepEqual(JSON.parse(await read(directory, 'docs.json')).redirects, [{ source: '/news/new-article', destination: '/news/former-name', permanent: true }]);
  assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
});

test('root imports never overwrite an existing article or move files before validation succeeds', async t => {
  const { directory, article } = await fixture(t);
  await buildContent(directory);
  const baseline = await read(directory, 'news/list.mdx');
  const source = await read(directory, 'news/new-article.mdx');
  await writeFile(path.join(directory, 'new-article.mdx'), source);
  const docs = JSON.parse(await read(directory, 'docs.json'));
  docs.navigation.groups[1].pages = ['new-article'];
  await writeFile(path.join(directory, 'docs.json'), JSON.stringify(docs));
  await assert.rejects(buildContent(directory), /news\/new-article.mdx already exists/);
  assert.equal(await read(directory, 'news/new-article.mdx'), source);
  await rm(path.join(directory, 'news/new-article.mdx'));
  for (const invalid of [source.replace('date: 2026-10-23', 'date: invalid'), article]) {
    await writeFile(path.join(directory, 'new-article.mdx'), invalid);
    await assert.rejects(buildContent(directory), /listing/);
    assert.equal(await read(directory, 'new-article.mdx'), invalid);
    assert.equal(await read(directory, 'news/list.mdx'), baseline);
    assert.equal(await read(directory, 'docs.json'), JSON.stringify(docs));
    await assert.rejects(read(directory, 'news/new-article.mdx'), { code: 'ENOENT' });
  }
});

test('watching a newly saved root MDX imports it and refreshes its list', { timeout: 10000 }, async t => {
  const { directory } = await fixture(t);
  await buildContent(directory);
  const source = await read(directory, 'news/new-article.mdx');
  const docs = JSON.parse(await read(directory, 'docs.json'));
  docs.navigation.groups[1].pages.push('saved-page');
  await writeFile(path.join(directory, 'docs.json'), JSON.stringify(docs));
  let onReport = () => {};
  const close = watchContent(directory, (error, result) => onReport(error, result));
  try {
    const refreshed = new Promise((resolve, reject) => { onReport = (error, result) => { if (error) reject(error); else if (result.changed.includes('news/saved-page.mdx')) resolve(result); }; });
    await writeFile(path.join(directory, 'saved-page.mdx'), source.replace(/^slug:.*$/m, 'slug: saved-page'));
    assert.equal((await refreshed).count, 2);
    assert.match(await read(directory, 'news/list.mdx'), /href="\/news\/saved-page"/);
    await assert.rejects(read(directory, 'saved-page.mdx'), { code: 'ENOENT' });
  } finally { await close(); }
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

test('content publishing preserves both self-closing and paired footer Cards after editor saves', async t => {
  const { directory } = await fixture(t);
  const file = 'news/new-article.mdx';
  await buildContent(directory);
  const baseline = await read(directory, file);
  const defaultCard = '<Card title="Put document AI to work." href="https://www.textin.ai/contact" cta="Talk to our team" />';
  for (const card of [defaultCard, defaultCard.replace(' />', '>\n\n</Card>')]) {
    const edited = baseline.replace(defaultCard, card);
    await writeFile(path.join(directory, file), edited);
    assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
    await buildContent(directory);
    assert.equal(await read(directory, file), edited);
    await writeFile(path.join(directory, file), edited.replace('A new article', 'An updated title'));
    await buildContent(directory);
    assert.ok((await read(directory, file)).includes(card));
    assert.match(await read(directory, 'news/list.mdx'), /An updated title/);
    assert.deepEqual((await buildContent(directory)).changed, []);
    await writeFile(path.join(directory, file), baseline);
    await buildContent(directory);
  }
});

test('uploaded images normalize surrounding whitespace and leading slashes while preserving formats and filenames', async t => {
  const { directory, catalog, save, article } = await fixture(t);
  const logo = 'images/客户 Logo.PNG';
  await writeFile(path.join(directory, logo), 'uploaded logo');
  await writeFile(path.join(directory, 'cases/customer.mdx'), article);
  catalog.cases.push({ page: 'cases/customer', date: '2026-10-23', industry: 'Manufacturing', scenarios: ['Document structuring'], product: 'xParse', cover: ' /images/cover.webp ', customerLogo: ` \t${logo} \t`, customer: 'Customer', metric: { value: '60%', label: 'verified improvement' }, homeOrder: 10 });
  for (const extension of ['PNG', 'gif', 'avif']) {
    const cover = `images/Exam Paper 解析.${extension}`;
    await writeFile(path.join(directory, cover), 'uploaded cover');
    catalog.news[0].cover = extension === 'gif' ? ` \t/${cover} \t` : ` ${cover} `;
    await save();
    await buildContent(directory);
    const url = '/' + cover.split('/').map(encodeURIComponent).join('/');
    for (const file of ['news/list.mdx', 'index.mdx']) assert.ok((await read(directory, file)).includes(`src="${url}"`));
    const published = await read(directory, 'news/new-article.mdx');
    const metadata = parseDocument(published.match(/^---\n([\s\S]*?)\n---\n/)[1]).toJS();
    assert.equal(metadata.listing.cover, `/${cover}`);
    assert.equal(metadata['og:image'], `https://resources.example.com${url}`);
    const customer = await read(directory, 'cases/customer.mdx');
    assert.equal(parseDocument(customer.match(/^---\n([\s\S]*?)\n---\n/)[1]).getIn(['listing', 'customerLogo']), `/${logo}`);
    assert.ok((await read(directory, 'cases/list.mdx')).includes('src="/images/%E5%AE%A2%E6%88%B7%20Logo.PNG"'));
    assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
  }
});

test('operator dates are padded automatically while impossible dates still fail before changing outputs', async t => {
  const { directory, catalog, save } = await fixture(t);
  for (const [input, expected] of [['2026-1-3', '2026-01-03'], [' 2026-11-3 ', '2026-11-03'], ['2026-1-23', '2026-01-23']]) {
    catalog.news[0].date = input;
    await save();
    await buildContent(directory);
    const source = await read(directory, 'news/new-article.mdx');
    assert.equal(parseDocument(source.match(/^---\n([\s\S]*?)\n---\n/)[1]).getIn(['listing', 'date']), expected);
    for (const file of ['news/list.mdx', 'index.mdx']) assert.ok((await read(directory, file)).includes(`data-date="${expected}"`));
    assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
  }
  const baseline = await read(directory, 'news/list.mdx');
  for (const input of ['2026-2-30', '2026-13-3', '2026-0-1']) {
    catalog.news[0].date = input;
    await save();
    await assert.rejects(buildContent(directory), /listing.*date/);
    assert.equal(await read(directory, 'news/list.mdx'), baseline);
  }
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

test('legacy URL aliases survive Draft withdrawal and restoration of a renamed article', async t => {
  const { directory } = await fixture(t);
  await buildContent(directory);
  const alias = { source: '/news/20261023120000', destination: '/news/new-article', permanent: true };
  const docs = JSON.parse(await read(directory, 'docs.json'));
  docs.redirects = [alias];
  docs.navigation.groups.find(group => group.group === 'Draft').pages = ['news/new-article'];
  await writeFile(path.join(directory, 'docs.json'), JSON.stringify(docs));
  await buildContent(directory);
  const withdrawn = JSON.parse(await read(directory, 'docs.json'));
  assert.deepEqual(withdrawn.redirects, [alias, { source: '/news/new-article', destination: '/news/list', permanent: false }]);
  assert.doesNotMatch(await read(directory, 'news/list.mdx'), /href="\/news\/new-article"/);
  withdrawn.navigation.groups.find(group => group.group === 'Draft').pages = [];
  withdrawn.navigation.groups[1].pages = ['news/new-article'];
  await writeFile(path.join(directory, 'docs.json'), JSON.stringify(withdrawn));
  await buildContent(directory);
  assert.deepEqual(JSON.parse(await read(directory, 'docs.json')).redirects, [alias]);
  assert.match(await read(directory, 'news/list.mdx'), /href="\/news\/new-article"/);
  assert.deepEqual((await buildContent(directory, { check: true })).changed, []);
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
    const listing = `slug: ${slug}\nlisting:\n  date: ${date}\n  category: Technical\n  product: xParse\n  cover: /images/cover.webp\n  readMinutes: 4\n${order ? `  order: ${order}\n` : ''}`;
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
