/**
 * Public site configuration. Never put bot tokens, API keys or CRM secrets here.
 * See README.txt and integrations/google-apps-script.gs for setup instructions.
 */
window.LIQEVENT_CONFIG = Object.freeze({
  // Deployed Google Apps Script / CRM / serverless webhook URL.
  leadEndpoint: '',

  // Use "no-cors" for the included Google Apps Script template; use "cors" for a JSON API.
  leadRequestMode: 'cors',

  // Public link only, for example https://t.me/your_public_username
  telegramUrl: '',

  // Public analytics identifiers (not secrets).
  ga4MeasurementId: '',
  metaPixelId: ''
});
