import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const window = { addEventListener() {} };
const source = readFileSync(new URL('../cases.js', import.meta.url), 'utf8')
  .replace(/\}\)\(\);\s*$/, 'window.catalogPages = catalogPages;})();');
vm.runInNewContext(source, {
  window, document: { readyState: 'loading', documentElement: {}, addEventListener() {} },
  MutationObserver: class { observe() {} },
});
const pages = (items, featured) => JSON.parse(JSON.stringify(window.catalogPages(items, 6, featured)));

test('six regular articles occupy one page; the seventh begins page two', () => {
  const items = Array.from({ length: 7 }, (_, id) => ({ id }));
  assert.deepEqual(pages(items.slice(0, 6), true), [items.slice(0, 6)]);
  assert.deepEqual(pages(items, true), [items.slice(0, 6), items.slice(6)]);
});

test('a featured page holds five and later regular pages hold six without dropping or repeating cards', () => {
  const items = Array.from({ length: 13 }, (_, id) => ({ id, featured: id === 0 }));
  assert.deepEqual(pages(items, true), [items.slice(0, 5), items.slice(5, 11), items.slice(11)]);
  assert.deepEqual(pages(items, false), [items.slice(0, 6), items.slice(6, 12), items.slice(12)]);
  const filtered = items.filter(item => item.id % 2 === 0);
  assert.deepEqual(pages(filtered, false), [filtered.slice(0, 6), filtered.slice(6)]);
});

test('featured cards later in the ordering and empty results keep stable page groups', () => {
  const items = Array.from({ length: 13 }, (_, id) => ({ id, featured: id === 6 }));
  assert.deepEqual(pages(items, true), [items.slice(0, 6), items.slice(6, 11), items.slice(11)]);
  assert.deepEqual(pages([], true), [[]]);
});
