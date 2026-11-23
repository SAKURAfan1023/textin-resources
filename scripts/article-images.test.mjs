import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(classes = '', captionText = 'Caption') {
  const values = new Map();
  let mutations = 0;
  const image = { classList: classes.split(' ').filter(Boolean) };
  const caption = { textContent: captionText, hidden: false };
  const frame = {
    style: {
      getPropertyValue: name => values.get(name) || '',
      setProperty(name, value) { values.set(name, value); mutations++; },
      removeProperty(name) { values.delete(name); mutations++; },
    },
    querySelector: selector => selector === 'img' ? image : caption,
  };
  const content = { querySelectorAll: () => [frame] };
  const window = { addEventListener() {} };
  const source = readFileSync(new URL('../cases.js', import.meta.url), 'utf8')
    .replace(/\}\)\(\);\s*$/, 'window.syncArticleImages = syncArticleImages;})();');
  vm.runInNewContext(source, {
    window, document: { readyState: 'loading', documentElement: {}, addEventListener() {} },
    MutationObserver: class { observe() {} },
  });
  return { image, caption, values, frame, sync: () => window.syncArticleImages(content), mutations: () => mutations };
}

test('image string classes set proportional width and caption size without repeated mutations', () => {
  const f = fixture('image-width-85.5 caption-size-12');
  f.sync();
  assert.equal(f.values.get('--article-image-width'), '85.5%');
  assert.equal(f.values.get('--article-caption-size'), '12px');
  const mutations = f.mutations();
  f.sync();
  assert.equal(f.mutations(), mutations);
});

test('removing or invalidating a setting restores its CSS default independently', () => {
  const f = fixture('image-width-50 caption-size-12');
  f.sync();
  f.image.classList = ['image-width-100'];
  f.sync();
  assert.equal(f.values.get('--article-image-width'), '100%');
  assert.equal(f.values.has('--article-caption-size'), false);
  for (const classes of [[], ['image-width-0', 'caption-size-0'], ['image-width-wrong', 'caption-size--2']]) {
    f.image.classList = classes;
    f.sync();
    assert.equal(f.values.has('--article-image-width'), false);
    assert.equal(f.values.has('--article-caption-size'), false);
  }
});

test('blank captions stay hidden and previously published inline sizing remains compatible', () => {
  const f = fixture('', '   ');
  f.values.set('width', '50%');
  f.values.set('font-size', '12px');
  f.sync();
  assert.equal(f.caption.hidden, true);
  assert.equal(f.values.get('width'), '50%');
  assert.equal(f.values.get('font-size'), '12px');
  f.caption.textContent = 'Visible caption';
  f.values.set('width', '0%');
  f.sync();
  assert.equal(f.caption.hidden, false);
  assert.equal(f.values.has('width'), false);
});
