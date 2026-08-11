/**
 * Public site configuration. Never put bot tokens, API keys or CRM secrets here.
 * See README.txt and integrations/google-apps-script.gs for setup instructions.
 */
window.LIQEVENT_CONFIG = Object.freeze({
  // Public Formspree / Google Apps Script / CRM endpoint.
  leadEndpoint: 'https://formspree.io/f/xwleowbk',

  // Formspree and JSON APIs use "cors"; the included Google Apps Script template uses "no-cors".
  leadRequestMode: 'cors',

  // Public link only, for example https://t.me/your_public_username
  telegramUrl: '',

  // Public analytics identifiers (not secrets).
  ga4MeasurementId: '',
  metaPixelId: ''
});
