# Website attribution context

The shared collector in `assets/js/lead-attribution.js` keeps first-touch context
in same-origin `sessionStorage` for the current tab. There is no time-based TTL,
cookie, localStorage, cross-device identity, or analytics/ad consent override.
A later tagged touch is saved separately and never overwrites first touch.
Browser storage restrictions fall back to current-page memory without blocking
the existing form. Closing/clearing the tab ends this attribution history.

Only the allowlisted UTM and click-ID parameters are retained. Landing, referrer
and submit URLs omit query strings, fragments and credentials; the permitted
parameters are separate fields. Missing/invalid values are displayed as
`unknown` in Telegram. A GCLID is not decoded or treated as proof of a particular
campaign or conversion. An untagged referral is not guessed into source/medium.

At form-payload creation, a random `submission_id` is added separately from V2's
existing `test_id` / `variant` / `lead_ref` contract. The Worker validates the ID
or creates its own if unavailable. This ID is a join reference, not a durable
idempotency key. No context or new ID is sent to GA4, Google Ads or Meta events.

After existing validation, mandatory Turnstile verification and rate limits,
the same sanitized context and submission ID are used for Telegram and the
existing Formspree fallback. No new delivery channel or retry was added.
Success events still depend on the existing confirmed-delivery response.
Delivery logs contain only ID, UTC received time, channel and capture status,
not contacts, campaign parameters, click IDs or tokens.

Optional context is limited to 4096 UTF-8 bytes; existing request cap remains
16384 bytes. Invalid/oversized context becomes unavailable without invalidating
the business lead. If full Telegram metadata exceeds the message limit, the
compact block explicitly says `telegram_message_limit`; identifiers are never
silently truncated into different identifiers.

Run offline tests with Node:

```
node --test test/*.test.cjs worker/test/*.test.js
```

Tests mock Turnstile, Telegram and Formspree. A production test lead requires
separate owner approval; these tests do not prove live Telegram delivery.
