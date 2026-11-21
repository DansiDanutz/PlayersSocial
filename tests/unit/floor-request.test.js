// /api/floor-request: stores a floor manager request and emails the approval link to the super admin.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const handler = require('../../api/floor-request');

const ENV = { FLOOR_REQUEST_KEY: 'server-key', GMAIL_USER: 'owner@example.com', GMAIL_APP_PASSWORD: 'app-pass' };

function fakeResponse() {
  const headers = {};
  return { headers, statusCode: 0, body: '', setHeader(key, value) { headers[key.toLowerCase()] = value; }, end(body = '') { this.body = body; } };
}

function request(overrides = {}) {
  return { method: 'POST', headers: { authorization: 'Bearer user-jwt' }, body: { fullName: 'Maria <b>Ionescu</b>' }, ...overrides };
}

function fakeDeps({ rpcError = null, sendError = null, env = ENV } = {}) {
  const calls = { rpc: [], mail: [] };
  const fetchImpl = async (url, init) => {
    const name = url.split('/').pop();
    calls.rpc.push({ name, url, headers: init.headers, body: JSON.parse(init.body) });
    if (name === 'players_floor_request_create' && rpcError) return { ok: false, status: 400, text: async () => JSON.stringify({ message: rpcError }) };
    const result = name === 'players_floor_request_create' ? 'request-1' : true;
    return { ok: true, status: 200, text: async () => JSON.stringify(result) };
  };
  const sendMail = async message => { calls.mail.push(message); if (sendError) throw new Error(sendError); };
  return { calls, deps: { fetchImpl, sendMail, env } };
}

const json = res => JSON.parse(res.body);

test('stores the token hash with the user token and emails the approval link to the super admin', async () => {
  const { calls, deps } = fakeDeps();
  const res = fakeResponse();

  await handler(request(), res, deps);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(json(res), { ok: true });
  const create = calls.rpc[0];
  assert.equal(create.name, 'players_floor_request_create');
  assert.equal(create.headers.Authorization, 'Bearer user-jwt');
  assert.equal(create.body.p_server_key, 'server-key');
  assert.equal(create.body.p_full_name, 'Maria <b>Ionescu</b>');
  const [mail] = calls.mail;
  assert.equal(mail.to, 'owner@example.com');
  const token = mail.text.match(/https:\/\/playersclub\.live\/aprobare\/#t=([A-Za-z0-9_-]{43})/)[1];
  assert.equal(create.body.p_token_hash, crypto.createHash('sha256').update(token).digest('hex'));
  assert.match(mail.html, /Maria &lt;b&gt;Ionescu&lt;\/b&gt;/);
  assert.doesNotMatch(mail.html, /<b>Ionescu/);
});

test('refuses anything but a signed-in POST', async () => {
  const { calls, deps } = fakeDeps();
  const get = fakeResponse();
  await handler(request({ method: 'GET' }), get, deps);
  assert.equal(get.statusCode, 405);

  const anonymous = fakeResponse();
  await handler(request({ headers: {} }), anonymous, deps);
  assert.equal(anonymous.statusCode, 401);
  assert.equal(calls.rpc.length, 0);
});

test('passes the database refusal on to the person and sends no email', async () => {
  const { calls, deps } = fakeDeps({ rpcError: 'Ai trimis deja o cerere. Așteaptă aprobarea.' });
  const res = fakeResponse();

  await handler(request(), res, deps);

  assert.equal(res.statusCode, 400);
  assert.equal(json(res).error, 'Ai trimis deja o cerere. Așteaptă aprobarea.');
  assert.equal(calls.mail.length, 0);
});

test('cancels the request when the email cannot be sent', async () => {
  const { calls, deps } = fakeDeps({ sendError: 'Invalid login' });
  const res = fakeResponse();

  await handler(request(), res, deps);

  assert.equal(res.statusCode, 502);
  assert.match(json(res).error, /Nu am putut trimite emailul/);
  const cancel = calls.rpc.find(call => call.name === 'players_floor_request_cancel');
  assert.deepEqual(cancel.body, { p_server_key: 'server-key', p_id: 'request-1' });
});

test('says email is not set up yet when the Gmail settings are missing', async () => {
  const { calls, deps } = fakeDeps({ env: { FLOOR_REQUEST_KEY: 'server-key' } });
  const res = fakeResponse();

  await handler(request(), res, deps);

  assert.equal(res.statusCode, 503);
  assert.equal(calls.rpc.length, 0);
});
