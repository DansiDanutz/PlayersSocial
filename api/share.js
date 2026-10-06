// Share page for one featured event (/e/<slug>, rewritten here by vercel.json).
// Link previews (WhatsApp, Facebook, Telegram) read its og: tags; people are sent on to the event on the site.
// Only public data from players_public_events is used — the same call and publishable key the page makes.
const SUPABASE_URL = 'https://lxhjfdxowpxzrybxdasi.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_JoxC66D5pZiyxWmSVB2Vrw_A9nL2B9C';
const SITE_URL = 'https://playersclub.live';
const SLUG_PATTERN = /^[a-z0-9-]{1,90}$/;
const ARCHIVE_DELAY_MS = 24 * 60 * 60 * 1000;
const CACHE_HEADER = 'public, s-maxage=300, stale-while-revalidate=600';

// Must match eventSlug() in dist/featured-events.js, which builds the card ids the share links point at.
const eventSlug = name => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const absoluteUrl = url => (/^https:\/\//.test(url) ? url : `${SITE_URL}${url.startsWith('/') ? '' : '/'}${url}`);

function eventWhen(row) {
  if (!row.event_date) return 'În curând';
  const date = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${row.event_date}T12:00:00Z`));
  const time = row.start_time ? String(row.start_time).slice(0, 5) : '';
  return time ? `${date} · ora ${time}` : date;
}

function hasEnded(row, now) {
  if (!row.event_date) return false;
  const time = row.start_time ? String(row.start_time).slice(0, 5) : '00:00';
  // Event times are Cluj local time; using summer time (+03:00) shifts winter events by at most one hour.
  return now - new Date(`${row.event_date}T${time}:00+03:00`).getTime() >= ARCHIVE_DELAY_MS;
}

function renderSharePage(row, now = Date.now()) {
  const slug = eventSlug(row.event_name), ended = hasEnded(row, now);
  const target = ended ? '/#eventHistory' : `/#eveniment-${slug}`;
  const title = ended ? `${row.event_name} · încheiat` : row.event_name;
  const description = ended ? 'Mulțumim tuturor celor care au participat! Te așteptăm la următorul eveniment Players Club.' : `${eventWhen(row)} · ${row.location || 'Players Club, Cluj-Napoca'}. ${row.description || ''}`.trim();
  const image = row.banner_url ? absoluteUrl(row.banner_url) : `${SITE_URL}/og-image.jpg`;
  const url = `${SITE_URL}/e/${slug}`;
  return `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} — Players Club</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Players Club">
<meta property="og:locale" content="ro_RO">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta http-equiv="refresh" content="0; url=${escapeHtml(target)}">
</head>
<body>
<p><a href="${escapeHtml(target)}">${escapeHtml(title)} — deschide pe Players Club</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body>
</html>`;
}

async function findFeaturedEvent(slug, fetchImpl = fetch) {
  const response = await fetchImpl(`${SUPABASE_URL}/rest/v1/rpc/players_public_events`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) throw new Error(`players_public_events failed with ${response.status}`);
  const rows = await response.json();
  return rows.find(row => row.is_featured && eventSlug(row.event_name) === slug) || null;
}

function redirectHome(res) {
  res.statusCode = 302;
  res.setHeader('Location', '/#events');
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

async function handler(req, res, fetchImpl = fetch) {
  const slug = String(req.query?.slug || '').toLowerCase();
  if (!SLUG_PATTERN.test(slug)) return redirectHome(res);
  let row;
  try {
    row = await findFeaturedEvent(slug, fetchImpl);
  } catch (error) {
    console.error('share page lookup failed', { slug, message: error.message });
    return redirectHome(res);
  }
  if (!row) return redirectHome(res);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', CACHE_HEADER);
  res.end(renderSharePage(row));
}

module.exports = handler;
module.exports.renderSharePage = renderSharePage;
module.exports.findFeaturedEvent = findFeaturedEvent;
module.exports.eventSlug = eventSlug;
