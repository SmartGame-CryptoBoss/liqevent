/**
 * Public site configuration. Never put bot tokens, API keys or CRM secrets here.
 * See README.txt and integrations/google-apps-script.gs for setup instructions.
 */
window.LIQEVENT_CONFIG = Object.freeze({
  // Public delivery endpoint only. Fallback delivery is handled server-side after Turnstile validation.
  leadEndpoint: 'https://liqevent-leads.v-kooov.workers.dev/',

  // Public Cloudflare Turnstile sitekey. The secret key belongs only in the Worker binding.
  turnstileSiteKey: '0x4AAAAAAEQLf1BdOtiRJxRH',

  // Public link only, for example https://t.me/your_public_username
  telegramUrl: ''
});
