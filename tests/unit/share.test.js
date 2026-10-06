const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../../api/share');
const { renderSharePage, eventSlug } = handler;

const ROW = { event_name: 'Turneu de Remi & Prieteni', event_date: '2026-10-10', start_time: '18:00:00', location: 'Str. Louis Pasteur nr. 75', description: 'Premii pentru <primele> trei locuri.', banner_url: 'https://lxhjfdxowpxzrybxdasi.supabase.co/storage/v1/object/public/players-event-banners/1-a.webp', is_featured: true };
const BEFORE = new Date('2026-10-05T12:00:00Z').getTime();
const AFTER = new Date('2026-10-12T12:00:00Z').getTime();

function fakeResponse() {
  const headers = {};
  return { headers, statusCode: 0, body: '', setHeader(key, value) { headers[key.toLowerCase()] = value; }, end(body = '') { this.body = body; } };
}
const fakeFetch = rows => async () => ({ ok: true, json: async () => rows });

test('slug matches the card ids built by the site', () => {
  assert.equal(eventSlug('Turneu de Șah Amatori'), 'turneu-de-sah-amatori');
  assert.equal(eventSlug('Turneu de Remi & Prieteni'), 'turneu-de-remi-prieteni');
});

test('upcoming event page carries its own preview and sends people to the card', () => {
  const html = renderSharePage(ROW, BEFORE);
  assert.match(html, /<meta property="og:title" content="Turneu de Remi &amp; Prieteni">/);
  assert.match(html, /og:description" content="sâmbătă, 10 octombrie 2026 · ora 18:00 · Str\. Louis Pasteur nr\. 75\. Premii pentru &lt;primele&gt; trei locuri\.">/);
  assert.match(html, /og:image" content="https:\/\/lxhjfdxowpxzrybxdasi\.supabase\.co\/storage\/v1\/object\/public\/players-event-banners\/1-a\.webp">/);
  assert.match(html, /og:url" content="https:\/\/playersclub\.live\/e\/turneu-de-remi-prieteni">/);
  assert.match(html, /url=\/#eveniment-turneu-de-remi-prieteni"/);
  assert.doesNotMatch(html, /<primele>/);
});

test('site-relative banners become absolute and ended events point to the history', () => {
  const html = renderSharePage({ ...ROW, banner_url: '/turneu.jpg' }, AFTER);
  assert.match(html, /og:image" content="https:\/\/playersclub\.live\/turneu\.jpg">/);
  assert.match(html, /og:title" content="Turneu de Remi &amp; Prieteni · încheiat">/);
  assert.match(html, /location\.replace\("\/#eventHistory"\)/);
});

test('handler serves a cached share page for a featured event', async () => {
  const res = fakeResponse();
  await handler({ query: { slug: 'turneu-de-remi-prieteni' } }, res, fakeFetch([ROW]));
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
  assert.match(res.headers['cache-control'], /s-maxage=300/);
  assert.match(res.body, /og:title/);
});

test('handler redirects home for unknown, non-featured or malformed slugs and lookup failures', async () => {
  const cases = [
    [{ slug: 'nu-exista' }, fakeFetch([ROW])],
    [{ slug: 'seara-de-sah' }, fakeFetch([{ ...ROW, event_name: 'Seară de Șah', is_featured: false }])],
    [{ slug: '../etc<script>' }, fakeFetch([ROW])],
    [{ slug: 'turneu-de-remi-prieteni' }, async () => ({ ok: false, status: 500 })],
  ];
  for (const [query, fetchImpl] of cases) {
    const res = fakeResponse();
    await handler({ query }, res, fetchImpl);
    assert.equal(res.statusCode, 302, JSON.stringify(query));
    assert.equal(res.headers.location, '/#events');
  }
});
