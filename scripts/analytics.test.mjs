import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../analytics.js', import.meta.url), 'utf8');
function fixture(existing) {
  const scripts = [];
  const listeners = [];
  const window = { zhuge: existing, addEventListener: (...args) => listeners.push(args) };
  class Element {
    constructor(attributes = {}) { this.attributes = attributes; }
    closest() { return this; }
    getAttribute(key) { return this.attributes[key]; }
    setAttribute(key, value) { this.attributes[key] = value; }
  }
  const document = { createElement: () => ({}), head: { append: script => scripts.push(script) } };
  const context = vm.createContext({ window, document, Element, Date });
  const run = () => vm.runInContext(source, context);
  run();
  return { window, scripts, listeners, run, Element };
}

test('Resources uses the main site project, default auto tracking and shared subdomain identity', () => {
  const f = fixture();
  const [method, key, options] = f.window.zhuge[0];
  assert.equal(method, '_init');
  assert.equal(key, 'ea505ff234c6450caf517b3344821768');
  assert.equal(options.autoTrack, true);
  assert.equal(options.singlePage, true);
  assert.equal(options.cookie_cross_subdomain, true);
  assert.equal(options.superProperty.site, 'resources');
  assert.equal(new URL(f.scripts[0].src).origin, 'https://zhugeio-sdk.intsig.net');
  assert.equal(f.scripts[0].async, true);
});

test('reload of the integration installs only one SDK and one capture listener', () => {
  const f = fixture();
  f.run();
  assert.equal(f.scripts.length, 1);
  assert.equal(f.listeners.length, 1);
  assert.equal(f.window.zhuge.length, 1);
  const existing = fixture({});
  assert.equal(existing.scripts.length, 0);
  assert.equal(existing.listeners.length, 0);
});

test('a captured navigation click uses the native SDK event hook, without blocking navigation', () => {
  const f = fixture();
  const target = new f.Element();
  const event = { target };
  const [type, handler, capture] = f.listeners[0];
  assert.equal(type, 'click');
  assert.equal(capture, true);
  handler(event);
  assert.equal(f.window.zgclickhook, true);
  assert.equal(target.attributes.zgclickable, 'true');
  assert.equal(f.window.zhuge[1][0], 'trackClick');
  assert.equal(f.window.zhuge[1][1], event);
});

test('disabled controls and non-element targets are ignored', () => {
  const f = fixture();
  const handler = f.listeners[0][1];
  const target = new f.Element();
  target.disabled = true;
  handler({ target });
  handler({ target: new f.Element({ 'aria-disabled': 'true' }) });
  handler({ target: {} });
  assert.equal(f.window.zhuge.length, 1);
});


test('blocked SDK stops retaining click events and leaves navigation untouched', () => {
  const f = fixture();
  f.scripts[0].onerror();
  f.listeners[0][1]({ target: new f.Element() });
  assert.equal(f.window.zhuge.length, 1);
});
