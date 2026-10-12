const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const contract = require('../v2/lead-contract.js');

const ref = '7e2c415a-410e-4c3c-bf91-30e85962986d';
const attribution = variant => ({ test_id: contract.TEST_ID, variant, lead_ref: ref });
const valid = { name: 'Тест', phone: '+380631111111', telegram: '', email: '', company: '', eventType: 'Корпоратив', guests: '', date: '', budget: '', message: '', privacyConsent: true, website: '' };
const env = () => ({ TURNSTILE_SECRET_KEY: 'OFFLINE', BOT_TOKEN: 'OFFLINE', CHAT_ID: 'OFFLINE', FORMSPREE_ENDPOINT: 'https://formspree.io/f/OFFLINE',
  ATTEMPT_RATE_LIMITER: { limit: async () => ({ success: true }) }, LEAD_RATE_LIMITER: { limit: async () => ({ success: true }) } });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fixture({ variant = 'control', mode = 'telegram', delay, responseOverride } = {}) {
  const events = [], pixels = [], posts = [], deliveries = [], observers = [];
  const values = { client_name: 'Тест', phone_or_telegram: '+380 63 111 11 11', event_type: 'Корпоратив', privacy_consent: 'Погоджено', company: '', guest_count: '', event_date: '', budget: '', event_details: '', _gotcha: '' };
  const make = (extra = {}) => {
    const attrs = {}, handlers = {}, classes = new Set();
    return { dataset: {}, handlers, attrs, textContent: '',
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), toggle: () => false },
      addEventListener: (type, fn) => { handlers[type] = fn; },
      setAttribute: (key, value) => { attrs[key] = value; }, removeAttribute: key => { delete attrs[key]; }, getAttribute: key => attrs[key],
      querySelectorAll: () => [], focus() {}, scrollIntoView() {}, remove() {}, ...extra };
  };
  const optional = { open: false };
  const fields = Object.fromEntries(Object.keys(values).map(name => [name, make({ name,
    get value() { return values[name]; }, validity: { badInput: false },
    closest: () => ['company', 'guest_count', 'event_date', 'budget', 'event_details'].includes(name) ? optional : null })]));
  const errors = Object.fromEntries(Object.keys(values).map(name => ['#error-' + name, make()]));
  const label = make({ textContent: 'Надіслати заявку' });
  const button = make({ querySelector: () => label });
  const form = make({ dataset: { testId: contract.TEST_ID, variant }, values,
    elements: { namedItem: name => fields[name] || null },
    querySelectorAll: selector => selector === '[aria-invalid]' ? Object.values(fields).filter(f => 'aria-invalid' in f.attrs) : [],
    querySelector: selector => selector === '[aria-invalid="true"]' ? Object.values(fields).find(f => f.attrs['aria-invalid'] === 'true') : button,
    reset: () => { Object.keys(values).forEach(k => { values[k] = ''; }); } });
  const status = make(), captchaStatus = make(), widget = make(), intro = make(), contact = make(), retry = make();
  const hero = make({ href: 'https://liqevent.com/v2-control/?email=DO_NOT_SEND#form-panel', textContent: 'CTA', dataset: { track: 'lead_cta_click', trackLocation: 'hero' } });
  hero.setAttribute('href', '#form-panel');
  const window = { LIQEVENT_CONFIG: { leadEndpoint: 'https://example.test/', turnstileSiteKey: 'OFFLINE' }, LIQEVENT_LEAD_CONTRACT: contract,
    crypto: { randomUUID: () => ref }, dataLayer: [], gtag: (...args) => events.push(args), fbq: (...args) => pixels.push(args),
    addEventListener() {}, setTimeout() {}, scrollY: 0 };
  class Observer { constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); } observe() {} unobserve() {} disconnect() {} }
  let captchaOptions;
  window.turnstile = { render: (_, options) => { captchaOptions = options; options.callback('OFFLINE_TOKEN'); return 'OFFLINE_WIDGET'; }, reset() {} };
  const document = { body: make(), head: { appendChild() {} }, createElement: () => make(),
    querySelector: selector => ({ '#lead-form': form, '#form-status': status, '#turnstile-status': captchaStatus, '#turnstile-widget': widget, '#form-intro': intro, '#contact': contact, '#turnstile-retry': retry, ...errors })[selector] || null,
    querySelectorAll: selector => selector === '[data-track]' ? [hero] : [] };
  const fetch = async (url, options) => {
    posts.push(JSON.parse(options.body));
    if (delay) await delay;
    if (responseOverride) return responseOverride;
    const { handleRequest } = await import('../worker/src/index.js');
    return handleRequest(new Request(url, { method: 'POST', headers: { Origin: 'https://liqevent.com', 'Content-Type': 'application/json' }, body: options.body }), env(), {
      uuid: () => ref,
      fetchImpl: async (destination, request) => {
        if (String(destination).includes('/siteverify')) return json({ success: true, hostname: 'liqevent.com', action: 'lead_form' });
        deliveries.push({ destination: String(destination), body: JSON.parse(request.body) });
        return String(destination).includes('telegram') ? json({ ok: mode === 'telegram' }, mode === 'telegram' ? 200 : 502) : json({ ok: mode === 'formspree' }, mode === 'formspree' ? 200 : 502);
      }
    });
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../v2/script.js'), 'utf8'), { window, document, IntersectionObserver: Observer, FormData: class { constructor(f) { this.f = f; } get(name) { return this.f.values[name] || ''; } }, fetch });
  hero.handlers.click();
  return { window, values, fields, form, posts, deliveries, events, pixels, status, captchaStatus, errors, optional, button,
    submit: () => form.handlers.submit({ preventDefault() {} }),
    edit: name => form.handlers.input({ type: 'input', target: fields[name] }),
    refresh: () => captchaOptions.callback('NEW_TOKEN'), expire: () => captchaOptions['expired-callback'](),
    count: name => events.filter(e => e[1] === name).length,
    standard: () => pixels.filter(e => e[0] === 'track' && e[1] === 'Lead').length };
}

for (const [name, patch, code] of [
  ['single character name', { name: 'A' }, 'invalid_name'],
  ['whitespace name', { name: '   ' }, 'invalid_name'],
  ['zero guests', { guests: '0' }, 'invalid_guests'],
  ['fractional guests', { guests: '1.5' }, 'invalid_guests'],
  ['excessive guests', { guests: '50001' }, 'invalid_guests'],
  ['invalid calendar date', { date: '2026-02-30' }, 'invalid_date'],
  ['missing consent', { privacyConsent: false }, 'consent_required'],
  ['unknown format', { eventType: 'UNKNOWN' }, 'invalid_event_type'],
  ['ambiguous contact', { email: 'test@example.com' }, 'invalid_contact']
]) test('V2 contract rejects ' + name, () => assert.equal(contract.validateLead({ ...valid, ...patch }).code, code));

test('phone punctuation, Telegram links, and email normalize without rejecting valid first contact', () => {
  assert.equal(contract.parseContact('+380 63 111–11–11').type, 'phone');
  assert.deepEqual(contract.parseContact('https://t.me/liqevent_test/'), { type: 'telegram', value: '@liqevent_test' });
  assert.equal(contract.parseContact('test@example.com').type, 'email');
  assert.equal(contract.parseContact('username_without_at'), null);
});

test('attribution allows only the known test and arms and an anonymous UUID', () => {
  assert.equal(contract.validateAttribution(attribution('control')).ok, true);
  assert.equal(contract.validateAttribution(attribution('corporate')).ok, true);
  assert.equal(contract.validateAttribution({ ...attribution('control'), variant: 'test@example.com' }).ok, false);
  assert.equal(contract.validateAttribution({ ...attribution('control'), lead_ref: '+380631111111' }).ok, false);
});

for (const variant of ['control', 'corporate']) test(variant + ' success reaches one delivery with matching arm and one standard Lead', async () => {
  const f = fixture({ variant }); await f.submit();
  assert.equal(f.deliveries.length, 1);
  assert.match(f.deliveries[0].body.text, new RegExp(variant));
  assert.match(f.deliveries[0].body.text, new RegExp(ref));
  assert.equal(f.standard(), 1); assert.equal(f.count('generate_lead'), 1);
  assert.equal(f.pixels.filter(e => e[0] === 'trackCustom' && e[1] === 'generate_lead').length, 1);
  const analytics = JSON.stringify([f.events, f.pixels, f.window.dataLayer]);
  assert.equal(analytics.includes('Тест'), false); assert.equal(analytics.includes('111 11 11'), false); assert.equal(analytics.includes('DO_NOT_SEND'), false);
  const success = f.events.find(e => e[1] === 'generate_lead')[2];
  assert.equal(success.variant, variant); assert.equal(success.lead_ref, ref);
  assert.equal(f.count('form_start'), 1); assert.equal(f.count('form_view'), 1);
});

test('fallback retains arm and reference without a second success signal', async () => {
  const f = fixture({ mode: 'formspree', variant: 'corporate' }); await f.submit();
  assert.equal(f.deliveries.length, 2);
  const delivered = f.deliveries[1].body;
  assert.equal(delivered.variant, 'corporate'); assert.equal(delivered.lead_ref, ref);
  assert.equal(f.standard(), 1); assert.equal(f.count('generate_lead'), 1);
});

test('client blocks invalid name/optional guests before POST and token callback preserves field error', async () => {
  const f = fixture(); f.values.client_name = 'A'; await f.submit();
  assert.equal(f.posts.length, 0); assert.equal(f.fields.client_name.attrs['aria-invalid'], 'true');
  const message = f.status.textContent; f.refresh(); assert.equal(f.status.textContent, message);
  f.values.client_name = 'Тест'; f.edit('client_name'); f.values.guest_count = '0'; await f.submit();
  assert.equal(f.posts.length, 0); assert.equal(f.optional.open, true);
  assert.equal(f.fields.guest_count.attrs['aria-invalid'], 'true');
  const guestsError = f.status.textContent; f.expire(); f.refresh(); assert.equal(f.status.textContent, guestsError);
});

test('silent autofill gets one start at submit; double submit while pending is ignored', async () => {
  let finish; const pending = new Promise(resolve => { finish = resolve; });
  const f = fixture({ delay: pending }); const first = f.submit(); await f.submit();
  assert.equal(f.posts.length, 1); assert.equal(f.button.attrs.disabled, '');
  assert.equal(f.count('form_submit_attempt'), 1); assert.equal(f.count('form_start'), 1); assert.equal(f.standard(), 0);
  finish(); await first; assert.equal(f.standard(), 1);
});

test('delivery failure never resets entered values or emits Lead and token callback cannot hide it', async () => {
  const f = fixture({ mode: 'failed' }); await f.submit();
  assert.equal(f.standard(), 0); assert.equal(f.count('generate_lead'), 0);
  assert.equal(f.count('form_submit_error'), 1); assert.equal(f.values.client_name, 'Тест');
  const error = f.status.textContent; f.refresh(); assert.equal(f.status.textContent, error);
});

test('200 without matching anonymous attribution cannot become a success', async () => {
  const f = fixture({ responseOverride: json({ ok: true, channel: 'telegram', ...attribution('corporate') }) });
  await f.submit(); assert.equal(f.standard(), 0); assert.equal(f.count('generate_lead'), 0);
  assert.equal(f.events.find(e => e[1] === 'form_submit_error')[2].error_code, 'attribution_unconfirmed');
});

for (const [name, patch, code, field] of [
  ['client bypass name', { name: 'A' }, 'invalid_name', 'client_name'],
  ['client bypass optional guests', { guests: '0' }, 'invalid_guests', 'guest_count'],
  ['forged arm', { variant: 'test@example.com' }, 'invalid_attribution', 'form']
]) test('Worker rejects ' + name + ' before either delivery channel', async () => {
  const { handleRequest } = await import('../worker/src/index.js');
  let deliveryCalls = 0;
  const payload = { ...valid, ...attribution('control'), turnstileToken: 'OFFLINE', ...patch };
  const response = await handleRequest(new Request('https://example.test/', { method: 'POST', headers: { Origin: 'https://liqevent.com', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), env(), {
    uuid: () => ref, fetchImpl: async url => {
      if (String(url).includes('/siteverify')) return json({ success: true, hostname: 'liqevent.com', action: 'lead_form' });
      deliveryCalls++; return json({ ok: true });
    }
  });
  assert.equal(response.status, 422); assert.deepEqual(await response.json(), { ok: false, code, field }); assert.equal(deliveryCalls, 0);
});

test('the two routes differ only by assigned arm, conversion block, and website submit CTA', () => {
  const a = fs.readFileSync(path.join(__dirname, '../v2-control/index.html'), 'utf8').replace('data-variant="control"', 'data-variant="ARM"');
  const b = fs.readFileSync(path.join(__dirname, '../v2-corporate/index.html'), 'utf8')
    .replace(/<section class="v2-conversion-block"[\s\S]*?<\/section>/, '')
    .replace('data-variant="corporate"', 'data-variant="ARM"')
    .replace('<span class="button-label">Обговорити корпоратив</span>', '<span class="button-label">Надіслати заявку</span>');
  assert.equal(b, a);
});
