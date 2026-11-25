const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, channel: 'telegram' }) }),
  { landingFormat = 'Інший формат', initialFormat = landingFormat, entryAnchor = false, hash = '' } = {}) {
  const events = [], pixels = [], observers = [], scripts = [], posts = [], windowHandlers = {};
  const element = (extra = {}) => {
    const attributes = {}, handlers = {}, listeners = {}, classes = new Set();
    return {
      attributes, handlers, dataset: {}, textContent: '',
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), toggle: c => classes.has(c) ? (classes.delete(c), false) : (classes.add(c), true) },
      addEventListener(name, fn) {
        (listeners[name] ||= []).push(fn);
        handlers[name] = (event = {}) => {
          const enriched = { currentTarget: this, preventDefault() {}, ...event };
          const results = listeners[name].map(listener => listener(enriched));
          return results.length === 1 ? results[0] : results;
        };
      },
      setAttribute: (name, value) => { attributes[name] = value; },
      getAttribute: name => attributes[name], removeAttribute: name => { delete attributes[name]; },
      querySelectorAll: () => [], focus() {}, scrollIntoView() {}, remove() {},
      ...extra
    };
  };
  const values = { client_name: 'TEST', phone_or_telegram: '@test_liqevent', event_type: initialFormat, privacy_consent: 'Погоджено' };
  const fields = Object.keys(values).map(name => {
    const field = element({ name, checkValidity: () => Boolean(values[name]), matches: () => false });
    Object.defineProperty(field, 'value', { get: () => values[name] });
    return field;
  });
  const format = element({
    name: 'event_type',
    options: ['', 'Корпоратив', 'Тімбілдинг', 'Конференція', 'Корпоративні подарунки', 'Community event', 'Інший формат']
      .map(value => ({ value, defaultSelected: value === landingFormat }))
  });
  Object.defineProperty(format, 'value', { get: () => values.event_type, set: value => { values.event_type = value; } });
  const label = element({ textContent: 'Надіслати заявку' });
  const button = element({ querySelector: () => label });
  const form = element({
    values,
    querySelectorAll: s => s === '[required]' ? fields : [],
    querySelector: s => s === '#lead-form-gifts' ? (entryAnchor ? element() : null)
      : s === '[name="phone_or_telegram"]' ? fields[1] : s === 'select[name="event_type"]' ? format : button,
    reset: () => { Object.keys(values).forEach(k => { values[k] = k === 'event_type' ? landingFormat : ''; }); }
  });
  const status = element(), intro = element(), contact = element(), widget = element();
  const hero = element({ href: 'https://liqevent.com/?utm_source=meta#lead-form', textContent: 'CTA', dataset: { track: 'lead_cta_click', trackLocation: 'hero' } });
  hero.setAttribute('href', '#lead-form');
  const pricing = element({ href: hero.href, textContent: 'Pricing', dataset: { track: 'pricing_cta', trackLocation: 'pricing', leadCta: 'true' } });
  pricing.setAttribute('href', '#lead-form');
  const ctas = ['Корпоратив', 'Конференція', 'Корпоративні подарунки'].map((eventFormat, i) => {
    const link = element({href: hero.href, textContent: eventFormat, dataset: { track: 'lead_cta_click', trackLocation: `service_${i}`, eventFormat }});
    link.setAttribute('href', '#lead-form');
    return link;
  });
  const channelLinks = [
    ['phone_click', 'tel:+380000000000'],
    ['telegram_click', 'https://t.me/public_business'],
    ['email_click', 'mailto:business@example.invalid']
  ].map(([track, href]) => element({ href, textContent: track, dataset: { track, trackLocation: 'test_contact' } }));
  const window = { LIQEVENT_CONFIG: { leadEndpoint: 'https://example.test/leads', turnstileSiteKey: 'test-key' },
    gtag: (...args) => events.push(args), fbq: (...args) => pixels.push(args), dataLayer: [],
    addEventListener(name, fn) { windowHandlers[name] = fn; }, setTimeout() {}, requestAnimationFrame() {}, scrollY: 0,
    location: { hash }, history: { state: null, pushState() {} }
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
    querySelectorAll: s => s === '[data-track]' ? [hero, pricing, ...ctas, ...channelLinks]
      : s === 'a[href="#lead-form"]' ? [hero, pricing, ...ctas] : [],
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
  return { events, pixels, observers, scripts, posts, form, status, hero, pricing, ctas, channelLinks, values, fields, format, verify, submit, count, leadCount, window, windowHandlers };
}

test('trusted static Gifts alias silently selects a format, not attribution or a conversion', () => {
  const f = fixture(undefined, {landingFormat: '', entryAnchor: true, hash: '#lead-form-gifts'});
  assert.equal(f.format.value, 'Корпоративні подарунки');
  assert.equal(f.events.length, 0);
  assert.equal(f.pixels.length, 0);
  assert.equal(f.posts.length, 0);
  f.format.value = 'Конференція';
  f.format.handlers.change({ isTrusted: true });
  f.windowHandlers.hashchange();
  assert.equal(f.format.value, 'Конференція');
});

test('Partnership, unknown and non-home entry do not preselect Gifts', () => {
  for (const [hash, entryAnchor] of [['#lead-form-partnership', true],
    ['#lead-form-gifts&format=example', true], ['#lead-form-gifts', false]]) {
    const f = fixture(undefined, {landingFormat: '', entryAnchor, hash});
    assert.equal(f.format.value, '');
    assert.equal(f.count('form_start'), 0);
  }
});
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

test('home CTAs only preselect explicitly named formats and never start the form', () => {
  const f = fixture(undefined, { landingFormat: '' });
  f.hero.handlers.click();
  assert.equal(f.values.event_type, '');
  for (const [i, value] of ['Корпоратив', 'Конференція', 'Корпоративні подарунки'].entries()) {
    f.ctas[i].handlers.click();
    assert.equal(f.values.event_type, value);
  }
  f.hero.handlers.click();
  assert.equal(f.values.event_type, 'Корпоративні подарунки');
  assert.equal(f.count('lead_cta_click'), 5);
  assert.equal(f.count('form_start'), 0);
  assert.equal(f.count('generate_lead'), 0);
  assert.equal(f.leadCount(), 0);
});

test('a manual format stays selected for later CTAs and supplies only a single form_start', () => {
  const f = fixture(undefined, { landingFormat: 'Корпоратив' });
  f.ctas[2].handlers.click();
  f.format.value = 'Тімбілдинг';
  f.form.handlers.input({ target: f.fields[2], isTrusted: true });
  f.format.handlers.change({ isTrusted: true });
  f.ctas[1].handlers.click();
  f.hero.handlers.click();
  f.form.handlers.input({ target: f.fields[0], isTrusted: true });
  assert.equal(f.values.event_type, 'Тімбілдинг');
  assert.equal(f.count('form_start'), 1);
});

test('landing defaults are restored by a generic CTA, except for browser-restored user values', () => {
  for (const landingFormat of ['Корпоратив', 'Конференція']) {
    const f = fixture(undefined, { landingFormat });
    assert.equal(f.values.event_type, landingFormat);
    f.ctas[2].handlers.click();
    f.hero.handlers.click();
    assert.equal(f.values.event_type, landingFormat);
    assert.equal(f.count('form_start'), 0);
  }
  const f = fixture(undefined, { landingFormat: 'Корпоратив', initialFormat: 'Тімбілдинг' });
  f.ctas[2].handlers.click();
  assert.equal(f.values.event_type, 'Тімбілдинг');
});

test('synthetic input/change events do not count or freeze the selected format', () => {
  const f = fixture(undefined, { landingFormat: '' });
  f.form.handlers.input({ target: f.fields[2], isTrusted: false });
  f.format.handlers.change({ isTrusted: false });
  f.ctas[2].handlers.click();
  assert.equal(f.values.event_type, 'Корпоративні подарунки');
  assert.equal(f.count('form_start'), 0);
});

test('phone, Telegram and email clicks reach both trackers as contacts, not conversions', () => {
  const f = fixture();
  for (const link of f.channelLinks) {
    link.handlers.click({ preventDefault() { throw new Error('must preserve native navigation'); } });
    assert.equal(f.count(link.dataset.track), 1);
    assert.equal(f.pixels.filter(args => args[0] === 'trackCustom' && args[1] === link.dataset.track).length, 1);
    assert.equal(f.events.find(args => args[1] === link.dataset.track)[2].cta_location, 'test_contact');
  }
  assert.equal(f.leadCount(), 0);
  assert.equal(f.count('form_start'), 0);
  assert.equal(f.count('generate_lead'), 0);
  assert.equal(f.posts.length, 0);
});

test('gift choice and email enter the protected delivery payload but no personal email enters analytics', async () => {
  const f = fixture(undefined, { landingFormat: '' });
  f.ctas[2].handlers.click();
  f.values.phone_or_telegram = 'test@example.invalid';
  f.verify();
  await f.submit();
  const payload = JSON.parse(f.posts[0][1].body);
  assert.equal(payload.eventType, 'Корпоративні подарунки');
  assert.equal(payload.email, 'test@example.invalid');
  assert.equal(payload.phone, '');
  assert.equal(payload.telegram, '');
  assert.equal(f.values.event_type, '');
  for (const tracker of [f.events, f.pixels, f.window.dataLayer]) {
    assert.doesNotMatch(JSON.stringify(tracker), /test@example\.invalid/);
  }
});

test('invalid email cannot trigger a delivery or a conversion', async () => {
  const f = fixture();
  f.values.phone_or_telegram = 'owner@invalid';
  f.verify();
  await f.submit();
  assert.equal(f.posts.length, 0);
  assert.equal(f.count('form_validation_error'), 1);
  assert.equal(f.leadCount(), 0);
});
