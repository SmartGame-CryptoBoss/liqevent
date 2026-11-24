const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runInNewContext } = require('node:vm');

const config = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');
const expected = 'https://t.me/Mariia_Liqevent';
const urlAt = pathname => {
  const window = { location: { pathname } };
  runInNewContext(config, { window });
  return window.LIQEVENT_CONFIG.telegramUrl;
};

test('public Telegram contact is scoped to the three approved pages and their aliases', () => {
  for (const route of ['/', '/index.html', '/corporate-events/', '/corporate-events', '/corporate-events/index.html', '/conferences/', '/conferences', '/conferences/index.html']) {
    assert.equal(urlAt(route), expected, route);
  }
  for (const route of ['/v2-corporate/', '/v2-control/', '/cases/bank-team-convention.html', '/not-a-landing/', '/corporate-events/other/']) {
    assert.equal(urlAt(route), '', route);
  }
});
