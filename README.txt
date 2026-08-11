LIQ EVENT — production landing page
Domain: https://liqevent.com/

WHAT IS INCLUDED
- Premium dark responsive design using the existing pink LIQ EVENT logo
- Conversion-oriented hero, trust proof, structured case studies and pricing
- Mobile quick actions for phone, Telegram (when configured) and the lead form
- Lead form with validation, anti-spam honeypot, UTM attribution and no mailto
- Hooks for Google Sheets, Telegram, CRM, GA4, Meta Pixel and conversion events
- Canonical, robots, sitemap, favicon, Open Graph, Twitter cards and JSON-LD

PUBLIC CONFIGURATION — config.js
Fill only public values:
- leadEndpoint: public Formspree endpoint or deployed webhook URL
- leadRequestMode: "cors" for Formspree/JSON APIs, "no-cors" for the included Apps Script
- telegramUrl: public Telegram link, for example https://t.me/your_username
- ga4MeasurementId: GA4 ID in G-XXXXXXXXXX format
- metaPixelId: numeric Meta Pixel ID

Never put Telegram bot tokens, CRM keys or other secrets into config.js.

FORMSPREE
The production form posts to https://formspree.io/f/xwleowbk via AJAX using
FormData and an application/json response. The endpoint is public by design;
no Formspree API key or secret is stored in the frontend.

GOOGLE SHEETS + TELEGRAM SETUP
1. Create a Google Sheet and copy its spreadsheet ID.
2. Create a Google Apps Script project and paste integrations/google-apps-script.gs.
3. Add Script properties:
   - SPREADSHEET_ID (required unless the script is bound to the sheet)
   - TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (optional)
   - CRM_WEBHOOK_URL (optional)
4. Deploy as a Web app: execute as yourself, access "Anyone".
5. Put the deployment /exec URL into config.js and set leadRequestMode to "no-cors".
6. Submit a test lead and confirm the Leads sheet row and Telegram message.

ANALYTICS EVENTS
- hero_cta, pricing_cta, mobile_form_cta
- phone_click, telegram_click
- form_start, form_validation_error, form_config_missing
- generate_lead, form_submit_error

SEARCH CONSOLE
Get the HTML verification token in Search Console, then uncomment the
google-site-verification meta tag in index.html and replace the placeholder.
DNS verification is also valid and requires no code change.

LOCAL CHECK
Serve the repository root over HTTP, then test desktop and mobile layouts.
The site is static and deploys from GitHub Pages.
