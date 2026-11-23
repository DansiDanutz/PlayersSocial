const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../../api/promo-voucher.js');
const asset = require('../../api/promo-asset.js');

const NOW = 1795000000000;
const env = { ELEVENLABS_API_KEY: 'test-el', PROMO_VOUCHER_KEY: 'test-key' };
const body = { conversation_id: 'conv_4501m852f5vcfhgtdr7ezjamk5w3', full_name: 'Andrei Testescu', first_name: 'Andrei',
  q1_preference: 'cash', q2_stakes: 'low_2_5', invite_consent: false };
let ip = 0;

function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.raw = b; try { this.body = JSON.parse(b); } catch { this.body = b; } } };
}

function fakeFetch(conversation = {}, calls = []) {
  return async (url, options) => {
    calls.push({ url, options });
    if (url.includes('api.elevenlabs.io')) {
      return { ok: true, json: async () => ({ agent_id: 'agent_9401m85046mpep7se0yxgbm4wjd0', status: 'in-progress',
        metadata: { start_time_unix_secs: NOW / 1000 - 60 }, ...conversation }) };
    }
    return { ok: true, json: async () => ({ serial: 'PPC-V-000007', check: 'K7QM', first_name: 'Andrei', already_issued: false }) };
  };
}

async function call(req, deps) {
  const res = response();
  await handler({ method: 'POST', headers: { 'x-forwarded-for': `10.0.0.${ip++}` }, ...req }, res, { now: () => NOW, ...deps });
  return res;
}

test('issues a serial for a verified, recent conversation of the promotions agent', async () => {
  const calls = [];
  const res = await call({ body }, { env, fetchImpl: fakeFetch({}, calls) });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, serial: 'PPC-V-000007', check: 'K7QM', first_name: 'Andrei', already_issued: false });
  const rpc = JSON.parse(calls[1].options.body);
  assert.equal(rpc.p_conversation_id, body.conversation_id);
  assert.equal(rpc.p_invite_consent, false);
  assert.ok(!('p_phone' in rpc));
});

test('refuses conversations of another agent or older than 20 minutes', async () => {
  assert.equal((await call({ body }, { env, fetchImpl: fakeFetch({ agent_id: 'agent_other' }) })).statusCode, 403);
  assert.equal((await call({ body }, { env, fetchImpl: fakeFetch({ metadata: { start_time_unix_secs: NOW / 1000 - 3600 } }) })).statusCode, 403);
});

test('validates the body and the method', async () => {
  assert.equal((await call({ body: { ...body, conversation_id: 'x' } }, { env, fetchImpl: fakeFetch() })).statusCode, 400);
  assert.equal((await call({ body: { ...body, invite_consent: undefined } }, { env, fetchImpl: fakeFetch() })).statusCode, 400);
  assert.equal((await call({ method: 'GET' }, { env })).statusCode, 405);
});

test('production without keys is off; preview without keys answers a DEMO serial and stores nothing', async () => {
  assert.equal((await call({ body }, { env: {} })).statusCode, 503);
  const calls = [];
  const res = await call({ body }, { env: { VERCEL_ENV: 'preview' }, fetchImpl: fakeFetch({}, calls) });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.demo, true);
  assert.match(res.body.serial, /^PPC-V-\d{6}$/);
  assert.equal(calls.length, 0);
});

test('rate-limits one address to 5 requests per 10 minutes', async () => {
  const statuses = [];
  for (let i = 0; i < 7; i += 1) {
    const res = response();
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '192.0.2.1' }, body }, res, { env, now: () => NOW, fetchImpl: fakeFetch() });
    statuses.push(res.statusCode);
  }
  assert.deepEqual(statuses.slice(5), [429, 429]);
});

test('serves the Mirela images and 404s anything else', () => {
  const ok = response();
  asset({ query: { f: 'og.jpg' }, url: '/api/promo-asset?f=og.jpg' }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers['Content-Type'], 'image/jpeg');
  assert.equal(ok.raw[0], 0xff);
  const missing = response();
  asset({ query: { f: '../vercel.json' }, url: '/api/promo-asset' }, missing);
  assert.equal(missing.statusCode, 404);
});
