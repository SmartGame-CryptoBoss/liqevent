const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'conferences/index.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const stripTags = value => value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

test('one literal conference H1, unique metadata, canonical and sitemap entry', () => {
  const headings = [...page.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(headings.length, 1);
  assert.equal(stripTags(headings[0][1]), 'Організація конференцій у Києві під ключ');
  assert.match(page, /<title>Організація конференцій у Києві під ключ — LIQ EVENT<\/title>/);
  assert.match(page, /<link rel="canonical" href="https:\/\/liqevent\.com\/conferences\/"/);
  assert.match(page, /<meta property="og:url" content="https:\/\/liqevent\.com\/conferences\/"/);
  assert.match(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/liqevent\.com\/conferences\/<\/loc>/);
  for (const [, json] of page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(json);
});

test('sections follow the agreed funnel and local links resolve to unique IDs', () => {
  const expected = ['formats', 'scope', 'process', 'cases', 'trust', 'faq', 'contact'];
  let previous = -1;
  for (const id of expected) {
    const position = page.indexOf(`id="${id}"`);
    assert.ok(position > previous, `${id} must follow the previous section`);
    previous = position;
  }
  const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate DOM IDs');
  for (const [, id] of page.matchAll(/\bhref="#([^"]+)"/g)) assert.ok(ids.includes(id), `missing #${id}`);
});

test('application CTAs use only the existing handler and same-page form', () => {
  const links = [...page.matchAll(/<a\b[^>]*\bdata-track="lead_cta_click"[^>]*>/g)].map(m => m[0]);
  assert.equal(links.length, 6);
  for (const link of links) {
    assert.match(link, /href="#lead-form"/);
    assert.match(link, /data-track-location="conferences_[a-z_]+"/);
    assert.doesNotMatch(link, /onclick=/);
  }
  assert.equal([...page.matchAll(/src="\.\.\/script\.js\?v=20261009p1"/g)].length, 1);
  assert.doesNotMatch(page, /gtag\('event'|fbq\('track',\s*'Lead'|event:\s*'lead_success'/);
});

test('the existing form contract is reused, with only Conference preselected', () => {
  const form = html => html.match(/<form\b[^>]*id="lead-form"[\s\S]*?<\/form>/)[0];
  const normalize = html => html.replace(/\sselected(?=[\s>])/g, '').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
  assert.equal(normalize(form(page)), normalize(form(home)));
  assert.match(form(page), /<option selected>Конференція<\/option>/);
  assert.match(page, /src="\.\.\/config\.js\?v=20260814a"/);
});

test('GTM, GA4 and Meta installations are identical to the current homepage', () => {
  const block = (html, start, end) => html.slice(html.indexOf(start), html.indexOf(end) + end.length);
  for (const [start, end] of [
    ['<!-- Google Tag Manager -->', '<!-- End Google Tag Manager -->'],
    ['<!-- Google tag (gtag.js) -->', '<!-- Meta Pixel Code -->'],
    ['<!-- Meta Pixel Code -->', '<!-- End Meta Pixel Code -->'],
    ['<!-- Google Tag Manager (noscript) -->', '<!-- End Google Tag Manager (noscript) -->']
  ]) assert.equal(block(page, start, end), block(home, start, end));
});

test('local images, script and styles exist; images reserve size and defer below-fold work', () => {
  for (const [, url] of page.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    if (/^(https?:|tel:|mailto:|#)/.test(url) || url.includes('#')) continue;
    const file = path.resolve(root, 'conferences', url.split('?')[0]);
    assert.ok(fs.existsSync(file), `missing local resource: ${url}`);
  }
  const images = [...page.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
  for (const image of images) {
    assert.match(image, /\bwidth="\d+"/);
    assert.match(image, /\bheight="\d+"/);
    assert.match(image, /\balt="[^"]*"/);
    if (!/logo-160|annual-awards/.test(image) && !/noscript=1/.test(image)) assert.match(image, /loading="lazy"/);
  }
  assert.doesNotMatch(page, /<video|fonts\.googleapis|swiper|slick|gsap/i);
});

test('no invented conference case counts, testimonials, online/hybrid claims or minimum budget', () => {
  assert.match(page, /Освітній івент · 2024/);
  assert.match(page, /СЦЕНІЧНИЙ КОРПОРАТИВ · 2019 · 250 ГОСТЕЙ/);
  assert.match(page, /реалізованих подій агенції/);
  assert.doesNotMatch(page, /500\+[^<]*конференц|найкращ|гарантований результат|№1|відгук|hybrid|online|гібрид|онлайн/i);
});
