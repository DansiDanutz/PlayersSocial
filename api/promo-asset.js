// GET /promotions/<image> (rewritten here by vercel.json): the Mirela images for /promotions, decoded from
// api/_promo-assets.js. Long CDN cache, so the function runs about once per image per deployment.
const ASSETS = require('./_promo-assets.js');

const TYPES = { webp: 'image/webp', jpg: 'image/jpeg' };

function handler(req, res) {
  const name = String(req.query?.f || new URL(req.url, 'http://x').searchParams.get('f') || '');
  const data = Object.prototype.hasOwnProperty.call(ASSETS, name) ? ASSETS[name] : null;
  if (!data) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain'); return res.end('Not found'); }
  const body = Buffer.from(data, 'base64');
  res.statusCode = 200;
  res.setHeader('Content-Type', TYPES[name.split('.').pop()] || 'application/octet-stream');
  res.setHeader('Content-Length', String(body.length));
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
  return res.end(body);
}

module.exports = handler;
