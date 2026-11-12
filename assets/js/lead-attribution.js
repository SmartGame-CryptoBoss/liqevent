(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.LIQEVENT_ATTRIBUTION_API = api;
    // Tab-scoped form context only. This does not grant analytics/ad consent.
    root.LIQEVENT_ATTRIBUTION = api.createCollector({
      href: () => root.location.href,
      referrer: () => root.document.referrer,
      storage: () => root.sessionStorage,
      crypto: () => root.crypto,
      now: () => Date.now()
    });
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const KEY = 'liq_attribution_v1';
  const ORIGINS = new Set(['https://liqevent.com', 'https://www.liqevent.com']);
  const UTMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const IDS = ['gclid', 'gbraid', 'wbraid'];
  const bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const scalar = (value, limit) => typeof value === 'string' && value.length > 0
    && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;
  const tag = value => {
    const text = scalar(value, 160);
    // Do not propagate obvious contact data embedded in campaign parameters.
    // Numeric campaign/ad-group IDs are legitimate UTM values, not phone numbers.
    return text && !/@|\+\d[\d\s().-]{9,}/.test(text) ? text : null;
  };
  const clickId = value => {
    const text = scalar(value, 512);
    // Reject instead of truncating/normalizing an opaque ID into another value.
    return text && /^[A-Za-z0-9._~+\/=-]+$/.test(text) ? text : null;
  };
  function safeUrl(value, ownSite = false) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
        || (ownSite && !ORIGINS.has(url.origin))) return null;
      const clean = url.origin + url.pathname;
      return clean.length <= 384 ? clean : null;
    } catch { return null; }
  }
  function time(value) {
    if (typeof value !== 'string') return null;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value ? value : null;
  }
  function touch(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const landing_url = safeUrl(input.landing_url, true), captured_at = time(input.captured_at);
    if (!landing_url || !captured_at) return null;
    const result = {landing_url, captured_at, referrer: safeUrl(input.referrer)};
    for (const key of UTMS) result[key] = tag(input[key]);
    for (const key of IDS) result[key] = clickId(input[key]);
    return result;
  }
  function empty(status, submitPage) {
    return {schema_version: 1, status, storage_scope: 'tab_session',
      first_touch: null, latest_tagged_touch: null, submit_page: safeUrl(submitPage, true)};
  }
  function normalizeContext(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return empty('not_provided');
    if (input.schema_version !== 1) return empty('schema_invalid', input.submit_page);
    try { if (bytes(input) > 4096) return empty('metadata_size_limit', input.submit_page); }
    catch { return empty('metadata_invalid', input.submit_page); }
    const first = touch(input.first_touch), latest = touch(input.latest_tagged_touch);
    const statuses = ['captured', 'storage_unavailable', 'not_provided', 'body_budget', 'metadata_invalid'];
    return {...empty(first ? 'captured' : 'metadata_invalid', input.submit_page),
      status: statuses.includes(input.status) ? input.status : (first ? 'captured' : 'metadata_invalid'),
      first_touch: first, latest_tagged_touch: latest};
  }
  function capture(href, referrer, capturedAt) {
    const url = new URL(href);
    const data = {landing_url: safeUrl(href, true), referrer: safeUrl(referrer), captured_at: capturedAt};
    for (const key of [...UTMS, ...IDS]) {
      const values = url.searchParams.getAll(key);
      data[key] = values.length === 1 ? values[0] : null;
    }
    return touch(data);
  }
  const isTagged = value => value && [...UTMS, ...IDS].some(key => value[key]);
  const signature = value => value && JSON.stringify([value.landing_url, ...UTMS.map(k=>value[k]), ...IDS.map(k=>value[k])]);
  function createCollector(env) {
    const arrival = env.now();
    let memory = null, storageFailed = false;
    const currentUrl = () => { try { return env.href(); } catch { return ''; } };
    function refresh() {
      const now = env.now();
      if (!memory) {
        try {
          const raw = env.storage().getItem(KEY);
          if (raw && raw.length <= 8192) {
            const parsed = normalizeContext(JSON.parse(raw));
            const firstTime = Date.parse(parsed.first_touch?.captured_at || '');
            if (parsed.first_touch && firstTime <= now + 60_000) memory = parsed;
          }
        } catch { storageFailed = true; }
      }
      let pageTouch = null;
      try { pageTouch = capture(currentUrl(), env.referrer(), new Date(Math.min(arrival, now)).toISOString()); }
      catch {}
      if (!memory && pageTouch) memory = {...empty('captured', currentUrl()), first_touch: pageTouch};
      if (memory && isTagged(pageTouch) && signature(pageTouch) !== signature(memory.latest_tagged_touch)) {
        memory.latest_tagged_touch = pageTouch;
      }
      if (memory) {
        try { env.storage().setItem(KEY, JSON.stringify(memory)); }
        catch { storageFailed = true; }
      }
    }
    function context() {
      try {
        refresh();
        if (!memory) return empty('metadata_invalid', currentUrl());
        return normalizeContext({...memory, submit_page: currentUrl(),
          status: storageFailed ? 'storage_unavailable' : 'captured'});
      } catch { return empty('metadata_invalid', currentUrl()); }
    }
    function submission() {
      // Created only when building a form payload, never emitted to analytics.
      let id = null;
      try {
        const crypto = env.crypto?.();
        if (crypto?.randomUUID) id = crypto.randomUUID();
        else if (crypto?.getRandomValues) {
          const data = crypto.getRandomValues(new Uint8Array(16));
          data[6] = (data[6] & 15) | 64; data[8] = (data[8] & 63) | 128;
          const hex = Array.from(data, value => value.toString(16).padStart(2, '0')).join('');
          id = [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16), hex.slice(16,20), hex.slice(20)].join('-');
        }
      } catch {}
      return {submission_id: id || 'unknown', attribution_context: context()};
    }
    refresh();
    return Object.freeze({context, submission});
  }
  function fitPayload(payload) {
    if (bytes(payload) <= 16_384) return payload;
    // Optional metadata must not push an otherwise valid legacy lead over the cap.
    return {...payload, attribution_context: empty('body_budget', payload.attribution_context?.submit_page)};
  }
  return Object.freeze({KEY, UTMS, IDS, safeUrl, normalizeContext, empty, createCollector, fitPayload});
});
