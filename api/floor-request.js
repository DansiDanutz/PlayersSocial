// POST /api/floor-request — a signed-in person asks for floor manager (șef de sală) access.
// The request is stored with the person's own Supabase token plus the private FLOOR_REQUEST_KEY, so only this
// function can create one. It keeps just the SHA-256 of a one-time token and emails the token link
// (/aprobare/#t=…) from the Gmail account in GMAIL_USER to SUPER_ADMIN_EMAIL (default: the same address).
// Settings (Vercel environment): FLOOR_REQUEST_KEY, GMAIL_USER, GMAIL_APP_PASSWORD, optional SUPER_ADMIN_EMAIL.
const crypto = require('node:crypto');

const SUPABASE_URL = 'https://lxhjfdxowpxzrybxdasi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JoxC66D5pZiyxWmSVB2Vrw_A9nL2B9C';
const SITE_URL = 'https://playersclub.live';
const TOKEN_BYTES = 32;
const MAX_NAME_LENGTH = 120;

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function reply(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function callRpc(fetchImpl, name, userToken, body) {
  const response = await fetchImpl(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || 'Cererea nu a putut fi salvată.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function approvalEmail({ fullName, link, to, from }) {
  const name = escapeHtml(fullName);
  return {
    from: `Players Club <${from}>`,
    to,
    subject: `Cerere acces șef de sală: ${fullName}`,
    text: `${fullName} a cerut acces de șef de sală pe playersclub.live.\n\nDeschide linkul ca să aprobi sau să respingi cererea (valabil 7 zile):\n${link}\n`,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#10233f;line-height:1.5">
<p><b>${name}</b> a cerut acces de <b>șef de sală</b> pe playersclub.live.</p>
<p><a href="${link}" style="display:inline-block;background:#0d3b2a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Deschide cererea</a></p>
<p style="color:#5b6b64;font-size:13px">Pe pagină alegi „Aprobă” sau „Respinge”. Linkul este valabil 7 zile și poate fi folosit o singură dată.</p>
</div>`,
  };
}

function gmailSender(env) {
  return async message => {
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD } });
    await transport.sendMail(message);
  };
}

async function handler(req, res, deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const sendMail = deps.sendMail || gmailSender(env);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(res, 405, { error: 'Metodă nepermisă.' }); }
  const userToken = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!userToken) return reply(res, 401, { error: 'Intră în cont ca să ceri acces.' });
  if (!env.FLOOR_REQUEST_KEY || !env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
    console.error('floor request email is not configured');
    return reply(res, 503, { error: 'Trimiterea cererilor nu este pornită încă. Anunță administratorul.' });
  }
  const fullName = String(req.body?.fullName || '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  let requestId;
  try {
    requestId = await callRpc(fetchImpl, 'players_floor_request_create', userToken, { p_server_key: env.FLOOR_REQUEST_KEY, p_full_name: fullName, p_token_hash: tokenHash });
  } catch (error) {
    if (!error.status) console.error('floor request store failed', { message: error.message });
    return reply(res, error.status ? 400 : 502, { error: error.status ? error.message : 'Cererea nu a putut fi salvată. Încearcă din nou.' });
  }

  const link = `${SITE_URL}/aprobare/#t=${token}`;
  try {
    await sendMail(approvalEmail({ fullName, link, to: env.SUPER_ADMIN_EMAIL || env.GMAIL_USER, from: env.GMAIL_USER }));
  } catch (error) {
    console.error('floor request email failed', { message: error.message });
    await callRpc(fetchImpl, 'players_floor_request_cancel', userToken, { p_server_key: env.FLOOR_REQUEST_KEY, p_id: requestId })
      .catch(cancelError => console.error('floor request cancel failed', { message: cancelError.message }));
    return reply(res, 502, { error: 'Nu am putut trimite emailul de aprobare. Încearcă din nou mai târziu.' });
  }
  return reply(res, 200, { ok: true });
}

module.exports = handler;
module.exports.approvalEmail = approvalEmail;
