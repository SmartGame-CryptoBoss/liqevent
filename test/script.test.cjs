const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, channel: 'telegram' }) })) {
  const events = [], pixels = [], observers = [], scripts = [], posts = [];
  const element = (extra = {}) => {
    const attributes = {}, handlers = {}, classes = new Set();
    return {
      attributes, handlers, dataset: {}, textContent: '',
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), toggle: c => classes.has(c) ? (classes.delete(c), false) : (classes.add(c), true) },
      addEventListener: (name, fn) => { handlers[name] = fn; },
      setAttribute: (name, value) => { attributes[name] = value; },
      getAttribute: name => attributes[name], removeAttribute: name => { delete attributes[name]; },
      querySelectorAll: () => [], focus() {}, scrollIntoView() {}, remove() {},
      ...extra
    };
  };
  const values = { client_name: 'TEST', phone_or_telegram: '@test_liqevent', event_type: 'Інший формат', privacy_consent: 'Погоджено' };
  const fields = Object.keys(values).map(name => element({ name, get value() { return values[name]; }, checkValidity: () => Boolean(values[name]), matches: () => false }));
  const label = element({ textContent: 'Надіслати заявку' });
  const button = element({ querySelector: () => label });
  const form = element({
    values,
    querySelectorAll: s => s === '[required]' ? fields : [],
    querySelector: s => s === '[name="phone_or_telegram"]' ? fields[1] : button,
    reset: () => { Object.keys(values).forEach(k => { values[k] = ''; }); }
  });
  const status = element(), intro = element(), contact = element(), widget = element();
  const hero = element({ href: 'https://liqevent.com/?utm_source=meta#lead-form', textContent: 'CTA', dataset: { track: 'lead_cta_click', trackLocation: 'hero' } });
  hero.setAttribute('href', '#lead-form');
  const pricing = element({ href: hero.href, textContent: 'Pricing', dataset: { track: 'pricing_cta', trackLocation: 'pricing', leadCta: 'true' } });
  pricing.setAttribute('href', '#lead-form');
  const window = { LIQEVENT_CONFIG: { leadEndpoint: 'https://example.test/leads', turnstileSiteKey: 'test-key' },
    gtag: (...args) => events.push(args), fbq: (...args) => pixels.push(args), dataLayer: [],
    addEventListener() {}, setTimeout() {}, scrollY: 0
  };
  class Observer {
    constructor(callback, options) { this.callback = callback; this.options = options; this.connected = true; observers.push(this); }
    observe(target) { this.target = target; }
    unobserve() {} disconnect() { this.connected = false; }
    visible(ratio = 1) { if (this.connected) this.callback([{ isIntersecting: true, intersectionRatio: ratio }]); }
  }
  window.IntersectionObserver = Observer;
  const document = {
    querySelector: s => ({ '#lead-form': form, '#form-status': status, '#form-intro': intro, '#contact': contact, '#turnstile-widget': widget })[s] || null,
    querySelectorAll: s => s === '[data-track]' ? [hero, pricing] : [],
    body: element(), createElement: () => element(), head: { appendChild: script => scripts.push(script) }
  };
  const context = { window, document, IntersectionObserver: Observer,
    FormData: class { constructor(f) { this.f = f; } get(name) { return this.f.values[name] || ''; } },
    fetch: async (...args) => { posts.push(args); return fetchImpl(...args); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8'), context);
  const verify = () => {
    window.turnstile = { render: (_, options) => { options.callback('verified-token'); return 'widget'; }, reset() {} };
    hero.handlers.click();
  };
  const submit = () => form.handlers.submit({ preventDefault() {} });
  const count = name => events.filter(e => e[0] === 'event' && e[1] === name).length;
  const leadCount = () => pixels.filter(e => e[0] === 'track' && e[1] === 'Lead').length;
  return { events, pixels, observers, scripts, posts, form, status, hero, pricing, values, fields, verify, submit, count, leadCount, window };
}

test('form view is once per page, first input is once, and verification waits for form intent', () => {
  const f = fixture();
  assert.equal(f.scripts.length, 0);
  f.observers.find(o => o.options.threshold?.[0] === 0.5).visible(0.4);
  assert.equal(f.count('form_view'), 0);
  const view = f.observers.find(o => o.options.threshold?.[0] === 0.5);
  view.visible(); view.visible();
  assert.equal(f.count('form_view'), 1);
  f.form.handlers.input({ target: f.fields[0] }); f.form.handlers.input({ target: f.fields[1] });
  assert.equal(f.count('form_start'), 1);
  f.hero.handlers.click(); f.hero.handlers.click();
  assert.equal(f.scripts.length, 1);
});

test('invalid form and missing Turnstile cannot send a request or Lead', async () => {
  const f = fixture(); f.values.client_name = '';
  await f.submit(); assert.equal(f.count('form_submit_attempt'), 1); assert.equal(f.count('form_validation_error'), 1);
  f.values.client_name = 'TEST'; await f.submit();
  assert.equal(f.posts.length, 0); assert.equal(f.leadCount(), 0); assert.equal(f.count('generate_lead'), 0);
});

test('one accepted backend delivery sends one Lead; double submit while pending is ignored', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const f = fixture(() => pending); f.verify();
  const first = f.submit(); await f.submit();
  assert.equal(f.posts.length, 1); assert.equal(f.count('form_submit_attempt'), 1); assert.equal(f.leadCount(), 0);
  finish({ ok: true, status: 200, json: async () => ({ ok: true, channel: 'telegram' }) });
  await first;
  assert.equal(f.count('generate_lead'), 1); assert.equal(f.leadCount(), 1);
  assert.equal(f.window.dataLayer.filter(e => e.event === 'lead_success').length, 1);
  assert.match(f.status.textContent, /Заявку отримано/);
  const params = f.events.find(e => e[1] === 'generate_lead')[2];
  assert.equal(params.delivery_channel, 'telegram');
  assert.equal(JSON.stringify(f.events).includes('@test_liqevent'), false);
});

for (const [name, response] of [
  ['delivery failure', { ok: false, status: 502, json: async () => ({ ok: false, code: 'delivery_failed' }) }],
  ['ambiguous 200', { ok: true, status: 200, json: async () => null }],
  ['rejected 200', { ok: true, status: 200, json: async () => ({ ok: false }) }]
]) {
  test(`${name} sends error and no successful conversion`, async () => {
    const f = fixture(async () => response); f.verify(); await f.submit();
    assert.equal(f.count('form_submit_error'), 1); assert.equal(f.count('generate_lead'), 0); assert.equal(f.leadCount(), 0);
  });
}

test('Formspree confirmation uses the same single-success path', async () => {
  const f = fixture(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, channel: 'formspree' }) }));
  f.verify(); await f.submit(); assert.equal(f.leadCount(), 1);
  assert.equal(f.events.find(e => e[1] === 'generate_lead')[2].delivery_channel, 'formspree');
});

test('pricing keeps its original event and counts one unified application CTA', () => {
  const f = fixture(); f.pricing.handlers.click();
  assert.equal(f.count('pricing_cta'), 1); assert.equal(f.count('lead_cta_click'), 1); assert.equal(f.leadCount(), 0);
});
