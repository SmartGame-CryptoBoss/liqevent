# V2 landing preflight

This is a review candidate. It does not create or publish a Meta test and has not been merged or deployed.

## Candidate routes

- `/v2-control/`: P1 content with the shared form fixes.
- `/v2-corporate/`: the same page and fixes, plus the approved pre-form block and “Обговорити корпоратив” website CTA.

The root `index.html`, `script.js`, `styles.css`, public `config.js`, GTM snippets, Pixel ID and existing UTM handling are unchanged. Both new routes use `/v2/lead-contract.js`, `/v2/script.js` and `/v2/styles.css`. They are noindex and are not added to the sitemap.

## Shared behavior

`v2/lead-contract.js` is the single source of validation for the browser and the V2 branch of the Worker: trimmed name length, phone/Telegram/email parsing, event type, consent, optional guests/date and length constraints. Optional details remain optional. Invalid optional inputs open the details panel and show a field-specific error.

CAPTCHA status is separate from field/delivery errors. A refreshed token clears only CAPTCHA errors. Retry and expiry retain entered values. Pending disables submit and ignores concurrent submissions.

Each valid V2 POST includes the allowlisted `test_id=liq_v2_landing_202610`, `variant=control|corporate` and a random UUID `lead_ref`. These survive Telegram delivery and Formspree fallback. The Worker echoes them only on confirmed delivery. The browser rejects success with missing or mismatched attribution. Client-supplied identifiers are attribution metadata, not proof of business qualification or an authentication mechanism.

Only anonymous test/arm/reference values are added to analytics. No entered names, contact details, company, budget or comments are added to event parameters. Arbitrary query strings are excluded from tracked CTA URLs. Standard Meta `fbq('track', 'Lead')` remains unchanged and runs only after confirmed delivery; its setup and GTM are not modified.

`form_start` now includes change/autofill/submit fallback; interaction establishes one `form_view` if the observer has not fired. Both arms have the same definition. Historical P1 event ratios are not a directly equivalent control for these updated definitions.

## Checks

Run from the repository root:

```sh
node --test test/*.cjs worker/test/*.js
```

36 tests cover legacy V1 responses/protection, validation, client bypass, anonymous attribution, backend-confirmed success, fallback, pending, failed/unconfirmed delivery, scoped errors, and the allowed differences between routes.

The Worker bundle passed Wrangler 4.149.0 `deploy --dry-run`. No upload or deployment occurred. The rate-limit configuration is unchanged.

Offline browser QA covers 320/360/390/412 px, 16 px inputs, autocomplete attributes, visible field errors, consent, contact parsing, token expiry, fallback, pending and silent autofill simulation. It is not a real-device iOS/Android or in-app-browser test.

Current official Meta SDK and a public Pixel-config snapshot were exercised with transport intercepted and blocked. Each V2 success produced one custom generate_lead transport and one standard Lead transport. Nothing was sent to Meta. This does not establish the origin of the historical second custom event or prove receipt by the production Events Manager.

## Deployment sequence after approval

1. Approve this candidate and a controlled end-to-end test separately from any Meta launch.
2. Deploy the Worker first, preserving all existing dashboard variables and secrets. Use **`wrangler deploy --keep-vars`**; the config does not contain existing dashboard variables such as the delivery destination. Do not change rate limits or secret bindings.
3. Merge/deploy the additive static routes only after the attributed Worker response is available. Publishing routes against the old Worker would intentionally fail the attribution confirmation guard.
4. Run one clearly labeled test per arm on the deployed routes. Reconcile the anonymous reference in Telegram/Formspree, GA4 and the standard Meta Lead; exclude tests from business reporting. Verify real device/autofill and retry behavior where available.
5. Resolve or explicitly accept the remaining historical custom-event uncertainty. A historical HAR/initiator trace is unavailable; do not remove tags on inference.
6. Configure the native Meta A/B and its dates/budget only after separate approval. Meta CTA, creative, broad Kyiv, placements and enhancements remain the approved controls.

The ad-account spending limit, commercial qualification criteria, acceptable CPL and final publish permission remain separate launch gates.
