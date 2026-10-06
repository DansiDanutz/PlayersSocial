const { test, expect } = require('@playwright/test');
const { mockSupabase, videoRow, gotoLoaded, VIDEO_BASE } = require('../support/supabase-mock');

test.beforeEach(async ({ page }) => {
  await page.route('**/videos/*.mp4', route => route.fulfill({ status: 204, body: '' }));
});

test('on a phone the title is smaller and the whole yellow card fits on the first screen', async ({ page }) => {
  test.skip(page.viewportSize().width > 600, 'phone layout');
  await page.setViewportSize({ width: 390, height: 700 });
  await mockSupabase(page);
  await gotoLoaded(page, '/');

  const fontSize = await page.locator('.hero h1').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  expect(fontSize).toBeLessThanOrEqual(46);
  const card = await page.locator('.hero-card').boundingBox();
  expect(card.y + card.height).toBeLessThanOrEqual(700);
});

test('promo buttons have a pink play icon and a rotating neon ring', async ({ page }) => {
  await mockSupabase(page);
  await gotoLoaded(page, '/');

  for (const button of await page.locator('.card-promo-button').all()) {
    await expect(button.locator('.play-icon')).toHaveCount(1);
  }
  const button = page.locator('#players-remi .card-promo-button');
  expect(await button.evaluate(element => getComputedStyle(element, '::before').animationName)).toBe('promoNeonSpin');
  const play = await button.locator('.play-icon').evaluate(element => getComputedStyle(element).backgroundColor);
  const [red, green, blue] = play.match(/\d+/g).map(Number);
  expect(red).toBeGreaterThan(200);
  expect(red).toBeGreaterThan(green + 80);
  expect(blue).toBeGreaterThan(green);
});

test('the promo player shares the video on WhatsApp with a link that opens it', async ({ page }) => {
  await mockSupabase(page);
  await gotoLoaded(page, '/');

  await page.locator('#players-remi .card-promo-button').click();
  const whatsapp = page.locator('#promoDialog .share-whatsapp');
  await expect(whatsapp).toBeVisible();
  const href = new URL(await whatsapp.getAttribute('href'));
  expect(href.origin + href.pathname).toBe('https://wa.me/');
  expect(href.searchParams.get('text')).toContain('Players Remi · Promo');
  expect(href.searchParams.get('text')).toContain('http://127.0.0.1:4173/?video=players-remi-promo');
  await expect(whatsapp).toHaveAttribute('target', '_blank');
});

test('Distribuie uses the phone share sheet when available', async ({ page }) => {
  await page.addInitScript(() => { navigator.share = data => { window.sharedData = data; return Promise.resolve(); }; });
  await mockSupabase(page);
  await gotoLoaded(page, '/');

  await page.locator('#players-ping-pong .card-promo-button').click();
  await page.locator('#promoDialog .share-native').click();
  await expect.poll(() => page.evaluate(() => window.sharedData)).toEqual({ title: 'Players Ping Pong · Promo', text: 'Uită-te la Players Ping Pong · Promo — Players Club', url: 'http://127.0.0.1:4173/?video=players-ping-pong-promo' });
});

test('Distribuie copies the link where there is no share sheet', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: text => { window.copied = text; return Promise.resolve(); } } });
  });
  await mockSupabase(page);
  await gotoLoaded(page, '/');

  await page.locator('#players-sah .card-promo-button').click();
  await page.locator('#promoDialog .share-native').click();
  await expect(page.locator('#promoDialog .share-status')).toHaveText('Link copiat. Îl poți lipi oriunde.');
  expect(await page.evaluate(() => window.copied)).toBe('http://127.0.0.1:4173/?video=players-sah-promo');
});

test('a shared link opens the video straight away', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/?video=players-backgammon-promo');

  await expect(page.locator('#promoDialog')).toBeVisible();
  await expect(page.locator('#promoDialog video')).toHaveAttribute('src', '/videos/players-backgammon-promo.mp4');
});

test('a shared link to an uploaded event video opens it too', async ({ page }) => {
  await mockSupabase(page, { videos: [videoRow()] });
  await page.goto('/?video=video-db-1');

  await expect(page.locator('#promoDialog')).toBeVisible();
  await expect(page.locator('#promoDialog video')).toHaveAttribute('src', `${VIDEO_BASE}seara-remi.mp4`);
  await expect(page.locator('#promoDialog .promo-title')).toHaveText('Seara de Remi · 10 octombrie');
});

test('every video in the Video tab can be sent on WhatsApp', async ({ page }) => {
  await mockSupabase(page);
  await gotoLoaded(page, '/#videos');

  await expect(page.locator('#videoList .library-video')).toHaveCount(8);
  await expect(page.locator('#videoList .library-video .share-whatsapp')).toHaveCount(8);
  const href = await page.locator('#video-players-club-promo .share-whatsapp').getAttribute('href');
  expect(decodeURIComponent(href)).toContain('?video=players-club-promo');
});
