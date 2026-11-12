import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(path) {
  const store = new Map();
  const location = new URL(path, 'https://resources.textin.ai');
  const window = { addEventListener() {} };
  const document = { readyState: 'loading', documentElement: {}, addEventListener() {} };
  const context = { window, document, location, URL, URLSearchParams, Date,
    sessionStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) },
    MutationObserver: class { observe() {} } };
  const source = readFileSync(new URL('../cases.js', import.meta.url), 'utf8').replace(/\}\)\(\);\s*$/, 'window.navigation = { navigationTarget, returnTarget };})();');
  vm.runInNewContext(source, context);
  const link = (href, selector = '') => ({ href: new URL(href, location.origin).href, matches: value => value === selector });
  return { ...window.navigation, location, link };
}

test('article keeps campaign and independent filtered/paginated return state', () => {
  const f = fixture('/cases/list/2?industry=Automotive&from=event%20one');
  const article = f.navigationTarget(f.link('/cases/customer', '.content-link'));
  assert.equal(article.searchParams.get('from'), 'event one');
  assert.equal(article.searchParams.get('returnTo'), '/cases/list/2?industry=Automotive&from=event%20one');
  const detail = fixture(article.href);
  const back = detail.navigationTarget(detail.link('/cases/list', '[data-content-back]'));
  assert.equal(back.pathname, '/cases/list/2');
  assert.equal(back.searchParams.get('industry'), 'Automotive');
  assert.equal(back.searchParams.get('from'), 'event one');
});

test('both registration and Contact carry full source, campaign and existing parameters', () => {
  const f = fixture('/news/article?from=overseas%2Blaunch#example');
  for (const path of ['/contact', '/user/register?redirect=%2Fconsole']) {
    const target = f.navigationTarget(f.link(`https://www.textin.ai${path}`));
    assert.equal(target.searchParams.get('from'), 'overseas+launch');
    assert.equal(target.searchParams.get('referrer'), f.location.href);
    if (path.includes('register')) assert.equal(target.searchParams.get('redirect'), '/console');
  }
  assert.equal(f.navigationTarget(f.link('https://www.textin.ai/')).searchParams.get('from'), 'overseas+launch');
  assert.equal(f.navigationTarget(f.link('https://other.example/contact')).search, '');
});

test('legacy return links still work without becoming campaign values', () => {
  const f = fixture('/cases/customer?from=%2Fcases%2Flist%2F2%3Fq%3Dcontract%26from%3Dlaunch');
  const target = f.navigationTarget(f.link('https://www.textin.ai/contact'));
  assert.equal(target.searchParams.get('from'), 'launch');
  assert.equal(f.returnTarget('/cases/list'), '/cases/list/2?q=contract&from=launch');
  const legacy = fixture('/news/article?from=%2Fnews%2Flist%3Fq%3Dexam');
  assert.equal(legacy.navigationTarget(legacy.link('https://www.textin.ai/contact')).searchParams.has('from'), false);
});

test('campaign survives a resource hop; malicious return cannot leave this site', () => {
  const f = fixture('/news/list?from=launch');
  f.navigationTarget(f.link('/news/article'));
  f.location.search = '';
  assert.equal(f.navigationTarget(f.link('https://www.textin.ai/contact')).searchParams.get('from'), 'launch');
  f.location.search = '?returnTo=https%3A%2F%2Fevil.example';
  assert.equal(f.returnTarget('/news/list'), '/news/list');
});
