import api from '../../assets/js/lead-attribution.js';

const escape = value => String(value ?? 'unknown').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
})[char]);
const known = value => value || 'unknown';
export const validSubmissionId = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
export function attributionRecord(input, id, now) {
  return {submission_id: id, received_at: new Date(now).toISOString(),
    attribution_context: api.normalizeContext(input)};
}
function lines(record) {
  const context = record.attribution_context;
  const first = context.first_touch;
  const result = [
    '<b>Attribution</b>',
    'Submission ID: ' + escape(record.submission_id),
    'Source / medium (first): ' + escape(known(first?.utm_source) + ' / ' + known(first?.utm_medium)),
    'Campaign (first): ' + escape(known(first?.utm_campaign)),
    'Landing: ' + escape(known(first?.landing_url)),
    'Submit page: ' + escape(known(context.submit_page)),
    'Referrer (first): ' + escape(known(first?.referrer)),
    'First visit UTC: ' + escape(known(first?.captured_at)),
    'UTM content / term: ' + escape(known(first?.utm_content) + ' / ' + known(first?.utm_term)),
    ...api.IDS.map(key => key.toUpperCase() + ': ' + escape(known(first?.[key]))),
    'Capture: ' + escape(context.status)
  ];
  const latest = context.latest_tagged_touch;
  if (latest && JSON.stringify(latest) !== JSON.stringify(first)) {
    result.push('Latest tagged touch (separate from first): ' + escape(JSON.stringify(latest)));
  }
  return result;
}
export function appendAttribution(base, record) {
  const full = base + '\n\n' + lines(record).join('\n');
  if (full.length <= 4096) return full;
  // Never truncate a click ID into a different ID, or sacrifice the business lead.
  const compact = base + '\n\n<b>Attribution</b>\nSubmission ID: ' + escape(record.submission_id)
    + '\nSource / medium: unknown / unknown\nCampaign: unknown\nLanding: unknown'
    + '\nSubmit page: unknown\nGCLID / UTM: unknown\nCapture: telegram_message_limit';
  return compact.length <= 4096 ? compact : base;
}
