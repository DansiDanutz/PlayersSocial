// POST /api/promo-voucher — called by the /promotions page when Mirela (ElevenLabs agent) runs the
// client tool issue_voucher after the 3 questions and the confirmed first/last name. No phone here:
// the phone is attached later, when the "Confirm voucher …" WhatsApp message reaches the club (Memo).
//
// The browser cannot hold a secret, so the request is trusted only after a server-side check with the
// ElevenLabs API: the conversation must exist, belong to the promotions agent and have started recently.
// One voucher per conversation (enforced again in the database). Best-effort rate limit per IP.
// Vercel env (never in the repo): ELEVENLABS_API_KEY (read-only convai scope is enough), PROMO_VOUCHER_KEY.
// Preview deployments without those keys answer with a clearly marked DEMO serial (nothing stored).
const SUPABASE_URL = 'https://lxhjfdxowpxzrybxdasi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JoxC66D5pZiyxWmSVB2Vrw_A9nL2B9C';
const PROMO_AGENT_ID = 'agent_9401m85046mpep7se0yxgbm4wjd0';
const MAX_AGE_SECS = 20 * 60;
const Q1 = ['cash', 'tournaments', 'both', 'other'];
const Q2 = ['low_2_5', 'high_5_10_plus', 'both', 'not_applicable', 'other'];
const hits = new Map();   // per warm instance only

function reply(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

const clean = (v, max) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, max);

function limited(ip, now) {
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now); hits.set(ip, list);
  return list.length > 5;
}

async function verifyConversation(id, env, fetchImpl, nowSecs) {
  const r = await fetchImpl(`https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(id)}`, {
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
  });
  if (!r.ok) return false;
  const c = await r.json();
  const started = Number(c?.metadata?.start_time_unix_secs || 0);
  return c?.agent_id === (env.PROMO_AGENT_ID || PROMO_AGENT_ID)
    && ['initiated', 'in-progress', 'processing', 'done'].includes(c?.status)
    && started > 0 && nowSecs - started < MAX_AGE_SECS;
}

async function handler(req, res, deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const now = deps.now ? deps.now() : Date.now();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(res, 405, { ok: false, error: 'method' }); }
  const demo = (!env.ELEVENLABS_API_KEY || !env.PROMO_VOUCHER_KEY) && env.VERCEL_ENV === 'preview';
  if (!demo && (!env.ELEVENLABS_API_KEY || !env.PROMO_VOUCHER_KEY)) return reply(res, 503, { ok: false, message: 'Vouchers are not switched on yet.' });
  const ip = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip, now)) return reply(res, 429, { ok: false, message: 'Too many requests.' });

  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const conversationId = clean(b.conversation_id, 80);
  const fullName = clean(b.full_name, 120);
  const firstName = clean(b.first_name, 60) || fullName.split(' ')[0];
  const q1 = Q1.includes(b.q1_preference) ? b.q1_preference : 'other';
  const q2 = Q2.includes(b.q2_stakes) ? b.q2_stakes : (q1 === 'tournaments' ? 'not_applicable' : 'other');
  const consent = b.invite_consent === true || b.invite_consent === 'yes' ? true
    : b.invite_consent === false || b.invite_consent === 'no' ? false : null;
  if (!/^conv_[a-z0-9]{10,60}$/.test(conversationId) || fullName.length < 3 || consent === null) {
    return reply(res, 400, { ok: false, message: 'Missing data: conversation, confirmed name, answer to question 3.' });
  }

  if (demo) {
    return reply(res, 200, { ok: true, demo: true, serial: `PPC-V-${String(100000 + Math.floor(Math.random() * 900000)).slice(0, 6)}`, check: 'DEMO', first_name: firstName });
  }

  let valid = false;
  try { valid = await verifyConversation(conversationId, env, fetchImpl, Math.floor(now / 1000)); } catch { valid = false; }
  if (!valid) return reply(res, 403, { ok: false, message: 'Conversation not recognised.' });

  const r = await fetchImpl(`${SUPABASE_URL}/rest/v1/rpc/players_promo_voucher_issue`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_server_key: env.PROMO_VOUCHER_KEY, p_conversation_id: conversationId, p_full_name: fullName,
      p_first_name: firstName, p_q1: q1, p_q2: q2, p_invite_consent: consent }),
  });
  if (!r.ok) { console.error('promo voucher store failed', { status: r.status }); return reply(res, 502, { ok: false, message: 'Could not store the voucher now.' }); }
  const data = await r.json();
  return reply(res, 200, { ok: true, serial: data.serial, check: data.check, first_name: data.first_name, already_issued: data.already_issued });
}

module.exports = handler;
