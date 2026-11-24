const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const repo = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(repo, file), 'utf8');

test('three primary forms share one contact field and expose the gift format', () => {
  for (const [file, landingFormat] of [
    ['index.html', null],
    ['corporate-events/index.html', 'Корпоратив'],
    ['conferences/index.html', 'Конференція']
  ]) {
    const html = read(file);
    assert.equal((html.match(/name="phone_or_telegram"/g) || []).length, 1, file);
    assert.match(html, /Телефон, Telegram або email<input[^>]+placeholder="[^"]*name@company\.ua"/, file);
    const select = html.match(/<select name="event_type"[^>]*>(.*?)<\/select>/)?.[1];
    assert.ok(select?.includes('<option>Корпоративні подарунки</option>'), file);
    assert.equal(select.match(/<option selected>([^<]+)<\/option>/)?.[1] || null, landingFormat, file);
    assert.match(html, /script\.js\?v=20261124form1/, file);
    for (const link of html.match(/<a [^>]*(?:href="(?:tel:|mailto:)|data-config-link="telegramUrl")[^>]*>/g) || []) {
      const name = link.includes('tel:') ? 'phone_click' : link.includes('mailto:') ? 'email_click' : 'telegram_click';
      assert.ok(link.includes(`data-track="${name}"`), `${file}: ${link}`);
      assert.match(link, /data-track-location="[^"]+"/, file);
    }
  }
});

test('Bank Convention uses one shared case hook for the original destination, with no form conversion', () => {
  const html = read('cases/bank-team-convention.html');
  const marker = 'case_bank_team_convention_result';
  assert.equal((html.match(/case-lead-cta\.js/g) || []).length, 1);
  assert.match(html, /<a [^>]*href="\.\.\/conferences\/#lead-form"[^>]*data-track="lead_cta_click"[^>]*data-track-location="case_bank_team_convention_result"[^>]*data-case-lead-cta>/);
  assert.doesNotMatch(html, /(?:href="tel:|href="mailto:|data-track="telegram_click")/);
  const calls = [];
  let click;
  const link = {
    href: 'https://liqevent.com/conferences/#lead-form',
    dataset: { trackLocation: marker },
    textContent: 'Обговорити подію ↗',
    addEventListener(type, handler) { assert.equal(type, 'click'); assert.equal(click, undefined); click = handler; }
  };
  vm.runInNewContext(read('assets/js/case-lead-cta.js'), {
    document: { querySelectorAll(selector) {
      assert.equal(selector, 'a[data-case-lead-cta][data-track="lead_cta_click"]');
      return [link];
    } },
    window: { gtag: (...args) => calls.push(args), fbq: (...args) => calls.push(args) }
  });
  click({ preventDefault() { throw new Error('native navigation should be preserved'); } });
  assert.deepEqual(calls.map(([type, event, fields]) => [type, event, fields.cta_location, fields.link_url]), [
    ['event', 'lead_cta_click', marker, link.href],
    ['trackCustom', 'lead_cta_click', marker, link.href]
  ]);
});
