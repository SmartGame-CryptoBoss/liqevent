const ALLOWED_ORIGINS = new Set([
  'https://liqevent.com',
  'https://www.liqevent.com'
]);
const ALLOWED_HOSTNAMES = new Set(['liqevent.com', 'www.liqevent.com']);
const TURNSTILE_ACTION = 'lead_form';
const MAX_BODY_BYTES = 16_384;
const EVENT_TYPES = new Set([
  'Корпоратив',
  'Тімбілдинг',
  'Конференція',
  'Community event',
  'Інший формат'
]);

const clean = (value, maxLength) => String(value ?? '').trim().slice(0, maxLength);

const json = (origin, body, status = 200, extraHeaders = {}) => {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=UTF-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
};

const isValidPhone = (value) => /^\+?[\d\s().-]{7,24}$/.test(value)
  && value.replace(/\D/g, '').length >= 7;
const isValidTelegram = (value) => /^@[a-zA-Z0-9_]{5,}$/.test(value)
  || /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/[a-zA-Z0-9_]{5,}\/?$/i.test(value);
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const validateLead = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, code: 'invalid_payload' };
  }

  const lead = {
    name: clean(input.name, 80),
    phone: clean(input.phone, 30),
    telegram: clean(input.telegram, 100),
    email: clean(input.email, 120),
    company: clean(input.company, 120),
    eventType: clean(input.eventType, 60),
    guests: clean(input.guests, 10),
    date: clean(input.date, 10),
    budget: clean(input.budget, 80),
    message: clean(input.message, 1500)
  };

  if (clean(input.website, 200)) return { ok: false, code: 'spam_detected' };
  if (input.privacyConsent !== true) return { ok: false, code: 'consent_required' };
  if (lead.name.length < 2) return { ok: false, code: 'invalid_name' };
  if (lead.phone && !isValidPhone(lead.phone)) return { ok: false, code: 'invalid_phone' };
  if (lead.telegram && !isValidTelegram(lead.telegram)) return { ok: false, code: 'invalid_telegram' };
  if (lead.email && !isValidEmail(lead.email)) return { ok: false, code: 'invalid_email' };
  if (!lead.phone && !lead.telegram && !lead.email) return { ok: false, code: 'contact_required' };
  if (!EVENT_TYPES.has(lead.eventType)) return { ok: false, code: 'invalid_event_type' };

  if (lead.guests) {
    const guests = Number(lead.guests);
    if (!Number.isInteger(guests) || guests < 1 || guests > 50_000) {
      return { ok: false, code: 'invalid_guests' };
    }
    lead.guests = String(guests);
  }

  if (lead.date && !/^\d{4}-\d{2}-\d{2}$/.test(lead.date)) {
    return { ok: false, code: 'invalid_date' };
  }

  return { ok: true, lead };
};

const escapeHtml = (value) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
})[char]);

const telegramText = (lead) => {
  const line = (emoji, label, value) => value
    ? `${emoji} <b>${label}:</b> ${escapeHtml(value)}`
    : '';
  return [
    '🎉 <b>НОВА ЗАЯВКА — LIQ EVENT</b>',
    '',
    line('👤', 'Імʼя', lead.name),
    line('🏢', 'Компанія', lead.company),
    line('📞', 'Телефон', lead.phone),
    line('💬', 'Telegram', lead.telegram),
    line('✉️', 'Email', lead.email),
    '',
    line('🎯', 'Формат події', lead.eventType),
    line('👥', 'Гостей', lead.guests),
    line('📅', 'Дата', lead.date),
    line('💰', 'Бюджет', lead.budget),
    line('📝', 'Коментар', lead.message),
    '',
    '🌐 <b>Джерело:</b> liqevent.com'
  ].filter(Boolean).join('\n');
};

const verifyTurnstile = async (token, ip, env, fetchImpl, idempotencyKey) => {
  if (!env.TURNSTILE_SECRET_KEY) return { success: false, internalError: true };
  const body = new FormData();
  body.set('secret', env.TURNSTILE_SECRET_KEY);
  body.set('response', token);
  if (ip) body.set('remoteip', ip);
  body.set('idempotency_key', idempotencyKey);

  const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) return { success: false, internalError: true };
  return response.json();
};

const sendTelegram = async (lead, env, fetchImpl) => {
  if (!env.BOT_TOKEN || !env.CHAT_ID) return false;
  const response = await fetchImpl(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.CHAT_ID,
      text: telegramText(lead),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    }),
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) return false;
  const result = await response.json().catch(() => null);
  return result?.ok === true;
};

const sendFormspreeFallback = async (lead, env, fetchImpl) => {
  if (!/^https:\/\/formspree\.io\/f\/[a-zA-Z0-9]+$/.test(env.FORMSPREE_ENDPOINT || '')) return false;
  const response = await fetchImpl(env.FORMSPREE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(lead),
    signal: AbortSignal.timeout(8_000)
  });
  return response.ok;
};

export const handleRequest = async (request, env, dependencies = {}) => {
  const fetchImpl = dependencies.fetchImpl || fetch;
  const uuid = dependencies.uuid || (() => crypto.randomUUID());
  const origin = request.headers.get('Origin') || '';

  if (request.method === 'OPTIONS') {
    if (!ALLOWED_ORIGINS.has(origin)) return json('', { ok: false, code: 'origin_not_allowed' }, 403);
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin'
      }
    });
  }

  if (request.method === 'GET') {
    return json('', { ok: true, service: 'LIQ EVENT Leads', protected: true });
  }
  if (request.method !== 'POST') return json(origin, { ok: false, code: 'method_not_allowed' }, 405);
  if (!ALLOWED_ORIGINS.has(origin)) return json('', { ok: false, code: 'origin_not_allowed' }, 403);
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return json(origin, { ok: false, code: 'json_required' }, 415);
  }

  const declaredSize = Number(request.headers.get('content-length') || 0);
  if (declaredSize > MAX_BODY_BYTES) return json(origin, { ok: false, code: 'payload_too_large' }, 413);

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const userAgent = clean(request.headers.get('User-Agent'), 120);
  const rateKey = `${ip}:${userAgent}`;
  if (!env.ATTEMPT_RATE_LIMITER?.limit || !env.LEAD_RATE_LIMITER?.limit) {
    return json(origin, { ok: false, code: 'protection_unavailable' }, 503);
  }
  const attemptLimit = await env.ATTEMPT_RATE_LIMITER.limit({ key: rateKey });
  if (!attemptLimit.success) {
    return json(origin, { ok: false, code: 'rate_limited' }, 429, { 'Retry-After': '60' });
  }

  let input;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json(origin, { ok: false, code: 'payload_too_large' }, 413);
    }
    input = JSON.parse(rawBody);
  } catch {
    return json(origin, { ok: false, code: 'invalid_json' }, 400);
  }

  const token = clean(input?.turnstileToken, 2048);
  if (!token) return json(origin, { ok: false, code: 'turnstile_missing' }, 400);

  let verification;
  try {
    verification = await verifyTurnstile(token, ip, env, fetchImpl, uuid());
  } catch {
    return json(origin, { ok: false, code: 'turnstile_unavailable' }, 503);
  }
  if (verification.internalError) return json(origin, { ok: false, code: 'turnstile_unavailable' }, 503);
  if (!verification.success
    || !ALLOWED_HOSTNAMES.has(verification.hostname)
    || verification.action !== TURNSTILE_ACTION) {
    return json(origin, { ok: false, code: 'turnstile_rejected' }, 403);
  }

  const validation = validateLead(input);
  if (!validation.ok) return json(origin, { ok: false, code: validation.code }, 422);

  const leadLimit = await env.LEAD_RATE_LIMITER.limit({ key: rateKey });
  if (!leadLimit.success) {
    return json(origin, { ok: false, code: 'lead_rate_limited' }, 429, { 'Retry-After': '60' });
  }

  const telegramDelivered = await sendTelegram(validation.lead, env, fetchImpl).catch(() => false);
  if (telegramDelivered) return json(origin, { ok: true, channel: 'telegram' });

  const fallbackDelivered = await sendFormspreeFallback(validation.lead, env, fetchImpl).catch(() => false);
  if (fallbackDelivered) return json(origin, { ok: true, channel: 'formspree' });

  return json(origin, { ok: false, code: 'delivery_failed' }, 502);
};

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  }
};
