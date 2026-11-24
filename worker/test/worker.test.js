import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, validateLead } from '../src/index.js';

const validPayload = {
  name: 'Тест LIQ EVENT',
  phone: '+380631111111',
  telegram: '',
  email: '',
  company: 'LIQ EVENT Test',
  eventType: 'Корпоратив',
  guests: '120',
  date: '2026-12-20',
  budget: '500 000 грн',
  message: 'Тест захищеної форми',
  privacyConsent: true,
  website: '',
  turnstileToken: 'valid-token'
};

const requestFor = (payload = validPayload) => new Request('https://liqevent-leads.example/', {
  method: 'POST',
  headers: {
    Origin: 'https://liqevent.com',
    'Content-Type': 'application/json',
    'CF-Connecting-IP': '203.0.113.20',
    'User-Agent': 'LIQ-EVENT-test'
  },
  body: JSON.stringify(payload)
});

const makeEnv = (overrides = {}) => ({
  TURNSTILE_SECRET_KEY: 'secret',
  BOT_TOKEN: 'bot-token',
  CHAT_ID: 'chat-id',
  FORMSPREE_ENDPOINT: 'https://formspree.io/f/test123',
  ATTEMPT_RATE_LIMITER: { limit: async () => ({ success: true }) },
  LEAD_RATE_LIMITER: { limit: async () => ({ success: true }) },
  ...overrides
});

const turnstileOk = () => new Response(JSON.stringify({
  success: true,
  hostname: 'liqevent.com',
  action: 'lead_form'
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('server validation rejects malformed contact data', () => {
  assert.equal(validateLead({ ...validPayload, phone: '123' }).code, 'invalid_phone');
  assert.equal(validateLead({ ...validPayload, privacyConsent: false }).code, 'consent_required');
});

test('direct POST without Turnstile token cannot create a lead', async () => {
  let outboundCalls = 0;
  const response = await handleRequest(requestFor({ ...validPayload, turnstileToken: '' }), makeEnv(), {
    fetchImpl: async () => { outboundCalls += 1; return turnstileOk(); },
    uuid: () => 'test-id'
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'turnstile_missing');
  assert.equal(outboundCalls, 0);
});

test('rejected Turnstile token cannot reach Telegram', async () => {
  let calls = 0;
  const response = await handleRequest(requestFor(), makeEnv(), {
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ success: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    },
    uuid: () => 'test-id'
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'turnstile_rejected');
  assert.equal(calls, 1);
});

test('valid protected submission reaches Telegram once', async () => {
  let telegramCalls = 0;
  const response = await handleRequest(requestFor(), makeEnv(), {
    fetchImpl: async (url) => {
      if (String(url).includes('/siteverify')) return turnstileOk();
      if (String(url).includes('api.telegram.org')) {
        telegramCalls += 1;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
    uuid: () => 'test-id'
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, channel: 'telegram' });
  assert.equal(telegramCalls, 1);
});

test('Formspree is used only after protected Telegram failure', async () => {
  let formspreeCalls = 0;
  const response = await handleRequest(requestFor(), makeEnv(), {
    fetchImpl: async (url) => {
      if (String(url).includes('/siteverify')) return turnstileOk();
      if (String(url).includes('api.telegram.org')) {
        return new Response(JSON.stringify({ ok: false }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (String(url).includes('formspree.io')) {
        formspreeCalls += 1;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
    uuid: () => 'test-id'
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, channel: 'formspree' });
  assert.equal(formspreeCalls, 1);
});

test('rate limiting blocks before Turnstile and delivery', async () => {
  let outboundCalls = 0;
  const response = await handleRequest(requestFor(), makeEnv({
    ATTEMPT_RATE_LIMITER: { limit: async () => ({ success: false }) }
  }), {
    fetchImpl: async () => { outboundCalls += 1; return turnstileOk(); },
    uuid: () => 'test-id'
  });
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, 'rate_limited');
  assert.equal(outboundCalls, 0);
});

test('gifts are valid for the website; a missing or unknown event type is not', () => {
  const payload = { ...validPayload, eventType: 'Корпоративні подарунки' };
  assert.equal(validateLead(payload).lead.eventType, 'Корпоративні подарунки');
  assert.equal(validateLead({ ...payload, eventType: '' }).code, 'invalid_event_type');
  assert.equal(validateLead({ ...payload, eventType: 'UNKNOWN' }).code, 'invalid_event_type');
  assert.equal(validateLead({ ...payload, phone: '', email: 'owner@invalid' }).code, 'invalid_email');
});

for (const channel of ['telegram', 'formspree']) {
  for (const [contact, value] of [
    ['phone', '+380000000000'],
    ['telegram', '@fixture_user'],
    ['email', 'test@example.invalid']
  ]) {
    test(`protected gifts delivery via ${channel} keeps the ${contact} value`, async () => {
      const eventType = 'Корпоративні подарунки';
      const payload = { ...validPayload, phone: '', telegram: '', email: '', [contact]: value, eventType };
      const calls = [];
      const response = await handleRequest(requestFor(payload), makeEnv(), {
        fetchImpl: async (url, options) => {
          if (String(url).includes('/siteverify')) return turnstileOk();
          if (String(url).includes('api.telegram.org')) {
            calls.push('telegram');
            const { text } = JSON.parse(options.body);
            assert.ok(text.includes(eventType));
            assert.ok(text.includes(value));
            return new Response(JSON.stringify({ ok: channel === 'telegram' }), { status: channel === 'telegram' ? 200 : 502 });
          }
          if (String(url).includes('formspree.io')) {
            calls.push('formspree');
            const body = JSON.parse(options.body);
            assert.equal(body.eventType, eventType);
            assert.equal(body[contact], value);
            assert.equal(Object.hasOwn(body, 'turnstileToken'), false);
            return new Response('{"ok":true}', { status: 200 });
          }
          throw new Error('Unexpected offline test request');
        },
        uuid: () => 'offline-gifts-id',
        log: () => {}
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, channel });
      assert.deepEqual(calls, channel === 'telegram' ? ['telegram'] : ['telegram', 'formspree']);
    });
  }
}
