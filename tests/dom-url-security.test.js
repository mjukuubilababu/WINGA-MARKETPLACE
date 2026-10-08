const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../src/components/dom-helpers.js'), 'utf8');

class Element {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.values = new Map(Object.entries(attributes));
    this.children = [];
    this.removed = false;
  }
  get attributes() { return [...this.values].map(([name, value]) => ({ name, value })); }
  setAttribute(name, value) { this.values.set(name, value); }
  getAttribute(name) { return this.values.get(name) ?? null; }
  removeAttribute(name) { this.values.delete(name); }
  remove() { this.removed = true; }
  appendChild(child) { this.children.push(child); return child; }
  querySelectorAll() { return this.children.flatMap(child => [child, ...child.querySelectorAll()]); }
  cloneNode() {
    const clone = new Element(this.tagName, Object.fromEntries(this.values));
    clone.children = this.children.map(child => child.cloneNode());
    return clone;
  }
}

function harness(parsedNodes = [], withUrl = true) {
  const fragment = new Element('fragment');
  fragment.children = parsedNodes;
  const document = {
    createElement(tagName) {
      const element = new Element(tagName);
      if (tagName === 'template') element.content = fragment;
      return element;
    }
  };
  const window = { location: { href: 'https://synthetic.invalid/product/1' }, WingaModules: { components: {} } };
  vm.runInNewContext(source, { window, document, ...(withUrl ? { URL } : {}) });
  return window.WingaModules.components.dom;
}

test('URL attribute creation rejects executable, unknown and browser-normalized schemes', () => {
  const dom = harness();
  for (const value of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)',
    'java\nscript:alert(1)', 'java\rscript:alert(1)', '\u0000 javascript:alert(1)',
    'vbscript:msgbox(1)', 'data:text/html,<script>synthetic</script>', 'data:image/svg+xml,<svg/>',
    'file:///synthetic', 'ftp://synthetic.invalid/file', 'custom:synthetic', 'https://[invalid']) {
    for (const name of ['href', 'src', 'xlink:href', 'formaction', 'action', 'poster']) {
      if (value.startsWith('data:image/') && ['src', 'poster'].includes(name)) continue;
      const element = dom.createElement('a', { attributes: { [name]: value } });
      assert.equal(element.getAttribute(name), null, name + ': ' + JSON.stringify(value));
    }
  }
});

test('URL attribute creation preserves web, relative, fragment and contact links', () => {
  const dom = harness();
  for (const value of ['https://synthetic.invalid/file', 'http://synthetic.invalid/file', '/product/1',
    './file', '../file', '#room-message-synthetic', '//synthetic.invalid/file', '']) {
    for (const name of ['href', 'src', 'xlink:href', 'formaction', 'action', 'poster']) {
      assert.equal(dom.createElement('a', { attributes: { [name]: value } }).getAttribute(name), value);
    }
  }
  for (const value of ['mailto:synthetic@example.invalid', 'tel:+0000000000']) {
    assert.equal(dom.createElement('a', { attributes: { href: value } }).getAttribute('href'), value);
    assert.equal(dom.createElement('img', { attributes: { src: value } }).getAttribute('src'), null);
  }
});

test('media data and blob URLs are not allowed as navigation or form targets', () => {
  const dom = harness();
  for (const value of ['blob:https://synthetic.invalid/synthetic', 'data:image/png;base64,c3ludGhldGlj',
    'data:image/svg+xml,%3Csvg/%3E', 'data:audio/webm;base64,c3ludGhldGlj', 'data:video/mp4;base64,c3ludGhldGlj']) {
    for (const name of ['src', 'poster']) {
      assert.equal(dom.createElement('img', { attributes: { [name]: value } }).getAttribute(name), value);
    }
    for (const name of ['href', 'xlink:href', 'action', 'formaction']) {
      assert.equal(dom.createElement('a', { attributes: { [name]: value } }).getAttribute(name), null);
    }
  }
  for (const value of ['data:text/html,synthetic', 'data:application/xhtml+xml,synthetic',
    'data:application/pdf,synthetic', 'data:image/png-not-a-mime', 'data:text/css,synthetic']) {
    assert.equal(dom.createElement('img', { attributes: { src: value } }).getAttribute('src'), null);
  }
});

test('parsed markup uses the same guards for decoded URLs and preserves harmless attributes', () => {
  const nodes = [new Element('a', { href: 'java\tscript:synthetic', title: 'javascript: harmless text' }),
    new Element('form', { action: 'vbscript:synthetic' }),
    new Element('button', { formaction: 'data:text/html,synthetic', onclick: 'synthetic()' }),
    new Element('use', { 'xlink:href': 'java\nscript:synthetic' }),
    new Element('img', { src: 'data:image/png;base64,c3ludGhldGlj', onerror: 'synthetic()' }),
    new Element('iframe', { src: 'https://synthetic.invalid/', srcdoc: '<script>synthetic</script>' }),
    new Element('script', { src: 'https://synthetic.invalid/script.js' })];
  const sanitized = harness(nodes).createFragmentFromMarkup('<synthetic-parsed-markup>');
  const [anchor, form, button, use, image, frame, script] = sanitized.children;
  assert.equal(anchor.getAttribute('href'), null);
  assert.equal(anchor.getAttribute('title'), 'javascript: harmless text');
  assert.equal(form.getAttribute('action'), null);
  assert.equal(button.getAttribute('formaction'), null);
  assert.equal(button.getAttribute('onclick'), null);
  assert.equal(use.getAttribute('xlink:href'), null);
  assert.equal(image.getAttribute('src'), 'data:image/png;base64,c3ludGhldGlj');
  assert.equal(image.getAttribute('onerror'), null);
  assert.equal(frame.removed, true);
  assert.equal(script.removed, true);
});

test('unsafe events and srcdoc are removed while ordinary text and metadata remain inert', () => {
  const dom = harness();
  const textContent = '<svg onload="synthetic()">';
  const element = dom.createElement('div', { textContent,
    attributes: { onload: 'synthetic()', ONCLICK: 'synthetic()', srcdoc: textContent,
      title: textContent, 'data-synthetic': 'javascript:synthetic' } });
  assert.equal(element.textContent, textContent);
  for (const key of ['onload', 'ONCLICK', 'srcdoc']) assert.equal(element.getAttribute(key), null);
  assert.equal(element.getAttribute('title'), textContent);
  assert.equal(element.getAttribute('data-synthetic'), 'javascript:synthetic');
});

test('missing URL parser fails closed for URL attributes without removing unrelated attributes', () => {
  const dom = harness([], false);
  const element = dom.createElement('a', { attributes: { href: '/product/1', title: 'Synthetic' } });
  assert.equal(element.getAttribute('href'), null);
  assert.equal(element.getAttribute('title'), 'Synthetic');
});

test('real browser parser cannot restore executable URLs after sanitization',
  { skip: process.env.WINGA_DOM_BROWSER_TEST !== 'true' }, async () => {
    const { chromium } = require('@playwright/test');
    const browser = await chromium.launch({ headless: true,
      ...(process.env.WINGA_TEST_BROWSER_CHANNEL === 'chromium' ? {} : { channel: 'msedge' }) });
    try {
      const page = await browser.newPage();
      await page.route('https://synthetic.invalid/**', route => route.fulfill({
        contentType: 'text/html', body: '<!doctype html><title>Synthetic DOM security test</title>' }));
      await page.goto('https://synthetic.invalid/');
      await page.evaluate(() => { window.WingaModules = { components: {} }; });
      await page.addScriptTag({ content: source });
      const result = await page.evaluate(async () => {
        const dom = WingaModules.components.dom;
        const created = dom.createElement('a', { attributes: { href: 'java\tscript:window.syntheticExecuted=1' } });
        const parsed = dom.createFragmentFromMarkup('<a href="java&#x09;script:window.syntheticExecuted=1">Synthetic</a>');
        const anchor = parsed.querySelector('a');
        document.body.append(created, parsed);
        created.click(); anchor.click();
        await new Promise(resolve => setTimeout(resolve, 50));
        return { createdHref: created.getAttribute('href'), parsedHref: anchor.getAttribute('href'),
          executed: window.syntheticExecuted === 1 };
      });
      assert.deepEqual(result, { createdHref: null, parsedHref: null, executed: false });
    } finally { await browser.close(); }
  });
