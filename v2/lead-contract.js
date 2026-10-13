(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LIQEVENT_LEAD_CONTRACT = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const TEST_ID = 'liq_v2_landing_202610';
  const VARIANTS = ['control', 'corporate'];
  const EVENT_TYPES = ['Корпоратив', 'Тімбілдинг', 'Конференція', 'Community event', 'Інший формат'];
  const clean = value => String(value ?? '').trim();
  const fieldNames = {
    name: 'client_name', contact: 'phone_or_telegram', eventType: 'event_type',
    guests: 'guest_count', date: 'event_date', budget: 'budget',
    company: 'company', message: 'event_details', privacyConsent: 'privacy_consent'
  };
  const fail = (code, key, message) => ({ ok: false, code, field: fieldNames[key] || key, message });

  function parseContact(value) {
    const contact = clean(value).replace(/\u00a0/g, ' ').replace(/[‐‑‒–—−]/g, '-');
    if (/^\+?[\d\s().-]{7,24}$/.test(contact) && contact.replace(/\D/g, '').length >= 7) {
      return { type: 'phone', value: contact };
    }
    if (/^@[a-zA-Z0-9_]{5,32}$/.test(contact)) return { type: 'telegram', value: contact };
    const telegram = contact.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{5,32})\/?$/i);
    if (telegram) return { type: 'telegram', value: '@' + telegram[1] };
    if (contact.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
      return { type: 'email', value: contact };
    }
    return null;
  }

  function validateLead(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return fail('invalid_payload', 'form', 'Не вдалося прочитати заявку. Спробуйте ще раз.');
    }
    if (clean(input.website)) return fail('spam_detected', 'form', 'Не вдалося надіслати заявку.');
    const lead = Object.fromEntries(['name', 'phone', 'telegram', 'email', 'company', 'eventType', 'guests', 'date', 'budget', 'message']
      .map(key => [key, clean(input[key])]));
    if (lead.name.length < 2 || lead.name.length > 80) {
      return fail('invalid_name', 'name', 'Вкажіть ім’я: від 2 до 80 символів.');
    }
    const contacts = ['phone', 'telegram', 'email'].filter(key => lead[key]);
    const contact = contacts.length === 1 ? parseContact(lead[contacts[0]]) : null;
    if (!contact || contact.type !== contacts[0]) {
      return fail('invalid_contact', 'contact', 'Вкажіть телефон +380…, Telegram @username / t.me/username або email.');
    }
    lead[contact.type] = contact.value;
    if (!EVENT_TYPES.includes(lead.eventType)) {
      return fail('invalid_event_type', 'eventType', 'Оберіть формат події або «Інший формат».');
    }
    if (input.privacyConsent !== true) {
      return fail('consent_required', 'privacyConsent', 'Потрібна згода на використання даних для відповіді на запит.');
    }
    if (lead.guests) {
      const guests = Number(lead.guests);
      if (lead.guests.length > 10 || !Number.isInteger(guests) || guests < 1 || guests > 50000) {
        return fail('invalid_guests', 'guests', 'Вкажіть цілу кількість гостей від 1 до 50 000 або залиште поле порожнім.');
      }
      lead.guests = String(guests);
    }
    if (lead.date) {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(lead.date) ? new Date(lead.date + 'T00:00:00Z') : null;
      if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== lead.date) {
        return fail('invalid_date', 'date', 'Вкажіть коректну дату або залиште поле порожнім.');
      }
    }
    for (const [key, max] of [['company', 120], ['budget', 80], ['message', 1500]]) {
      if (lead[key].length > max) return fail('invalid_' + key, key, 'Скоротіть це поле до ' + max + ' символів.');
    }
    return { ok: true, lead };
  }

  function validateAttribution(input) {
    if (input?.test_id !== TEST_ID || !VARIANTS.includes(input?.variant)
      || typeof input?.lead_ref !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.lead_ref)) {
      return { ok: false, code: 'invalid_attribution', field: 'form', message: 'Не вдалося визначити варіант тесту. Оновіть сторінку.' };
    }
    return { ok: true, attribution: { test_id: TEST_ID, variant: input.variant, lead_ref: input.lead_ref.toLowerCase() } };
  }

  return Object.freeze({ TEST_ID, VARIANTS, EVENT_TYPES, parseContact, validateLead, validateAttribution });
});
