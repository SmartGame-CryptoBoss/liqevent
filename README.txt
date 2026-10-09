LIQ EVENT — production landing page
Domain: https://liqevent.com/

WHAT IS INCLUDED
- Premium dark responsive design using the existing pink LIQ EVENT logo
- Conversion-oriented hero, trust proof, structured case studies and pricing
- Mobile quick actions for phone, Telegram (when configured) and the lead form
- Lead form with validation, honeypot, Cloudflare Turnstile and no mailto
- Hooks for Google Sheets, Telegram, CRM, GA4, Meta Pixel and conversion events
- Canonical, robots, sitemap, favicon, Open Graph, Twitter cards and JSON-LD

PUBLIC CONFIGURATION — config.js
Fill only public values:
- leadEndpoint: public primary Cloudflare Worker URL
- turnstileSiteKey: public Cloudflare Turnstile sitekey
- telegramUrl: public Telegram link, for example https://t.me/your_username

Never put Telegram bot tokens, CRM keys or other secrets into config.js.

LEAD DELIVERY
The production form posts JSON only to the public Cloudflare Worker endpoint:
https://liqevent-leads.v-kooov.workers.dev/

Before delivery, the Worker requires a valid Turnstile token for liqevent.com,
checks the token action and hostname, validates and normalizes every lead field,
rejects the honeypot, enforces consent and applies two native rate limits:
- ATTEMPT_RATE_LIMITER: 8 requests per 60 seconds before Turnstile verification
- LEAD_RATE_LIMITER: 2 validated leads per 60 seconds before delivery

The Worker tries Telegram first. Only after an authenticated, validated request
and a Telegram delivery failure does the Worker send the lead once to Formspree:
https://formspree.io/f/xwleowbk

Formspree is a server-side sequential fallback only. The browser never posts to it directly,
and a successful Telegram delivery is never duplicated.
The form stays on liqevent.com and shows loading, success and error states without reloading.
Never add TURNSTILE_SECRET_KEY, BOT_TOKEN, CHAT_ID or other secrets to frontend files.

CLOUDFLARE WORKER CONFIGURATION
The Worker source and tests are in worker/. Configure these bindings in Cloudflare:
- TURNSTILE_SECRET_KEY (encrypted secret)
- BOT_TOKEN (encrypted secret)
- CHAT_ID
- FORMSPREE_ENDPOINT
- ATTEMPT_RATE_LIMITER (native rate limiter, 8 requests / 60 seconds)
- LEAD_RATE_LIMITER (native rate limiter, 2 requests / 60 seconds)

Do not replace either rate limiter with frontend throttling. Server-side verification is mandatory.

GOOGLE SHEETS + TELEGRAM SETUP
1. Create a Google Sheet and copy its spreadsheet ID.
2. Create a Google Apps Script project and paste integrations/google-apps-script.gs.
3. Add Script properties:
   - SPREADSHEET_ID (required unless the script is bound to the sheet)
   - TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (optional)
   - CRM_WEBHOOK_URL (optional)
4. Deploy as a Web app: execute as yourself, access "Anyone".
5. Use that deployment as an independent integration or adapt the Cloudflare Worker to forward to it.
6. Submit a test lead and confirm the Leads sheet row and Telegram message.

ANALYTICS EVENTS
- GA4 Google tag: G-WRXR3VJPJH (installed directly in index.html)
- Meta Pixel: 1825655221761937 with PageView and successful Lead tracking
- lead_cta_click with cta_location (header, hero, mobile menu/sticky, services, gifts, pricing)
- pricing_cta retained for historical compatibility
- phone_click, telegram_click
- form_view (at least half of the introduction is visible, once per page)
- form_start (first input, once until a successful reset)
- form_submit_attempt (before validation; ignored while a request is in flight)
- form_validation_error, form_config_missing
- generate_lead, form_submit_error

SEARCH CONSOLE
Get the HTML verification token in Search Console, then uncomment the
google-site-verification meta tag in index.html and replace the placeholder.
DNS verification is also valid and requires no code change.

LOCAL CHECK
Serve the repository root over HTTP, then test desktop and mobile layouts.
The site is static and deploys from GitHub Pages.

P1 CONVERSION UPDATE — 2026-10-09
The hero and form do not wait for reveal JavaScript. Application CTAs target
#lead-form; #contact remains available for the contact section. Query/UTM
parameters are preserved by native same-page anchors. Required fields and
backend success delivery rules have not changed. New diagnostic form events
include form_id and funnel_version=p1_20261009 and contain no entered values.
Only a confirmed backend success sends generate_lead, lead_success and one
standard Meta Lead. Formspree remains a Worker-only fallback.
Turnstile loads on application intent or within 600px of the form; validation
and mandatory server-side anti-spam checks remain unchanged.
System fonts are used; no external font download or font preload is needed.
The optimized transparent WebP logo has 80/160/200px variants. Hero photos
have 320/640/960/1600px srcset candidates and viewport-specific sizes.
