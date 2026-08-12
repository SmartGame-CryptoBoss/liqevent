/**
 * Public site configuration. Never put bot tokens, API keys or CRM secrets here.
 * See README.txt and integrations/google-apps-script.gs for setup instructions.
 */
window.LIQEVENT_CONFIG = Object.freeze({
  // Public delivery endpoints only. Never add Telegram bot tokens or chat IDs here.
  leadEndpoint: 'https://liqevent-leads.v-kooov.workers.dev/',
  leadFallbackEndpoint: 'https://formspree.io/f/xwleowbk',

  // Public link only, for example https://t.me/your_public_username
  telegramUrl: ''
});
