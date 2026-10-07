const { test, expect } = require('@playwright/test');
const { mockSupabase, gotoLoaded } = require('../support/supabase-mock');

test.beforeEach(async ({ page }) => {
  await mockSupabase(page);
  // Keep the suite fast: never download the real MP4s.
  await page.route('**/videos/*.mp4', route => route.fulfill({ status: 204, body: '' }));
});

test('lists every video from the library, grouped under category tabs', async ({ page }) => {
  await gotoLoaded(page, '/#videos');

  const tabs = page.locator('#videoTabs [role="tab"]');
  await expect(tabs).toHaveText(["Toate", "Player's Poker Club", 'Șah', 'Remi', 'Table', 'Ping-Pong']);
  await expect(page.locator('#videoTabs [aria-selected="true"]')).toHaveText('Toate');
  await expect(page.locator('#videoList .library-video')).toHaveCount(9);
  await expect(page.locator('#video-players-ping-pong-premium video')).toHaveAttribute('src', '/videos/players-ping-pong-premium.mp4');
});

test('filters the library by category and shows each video type', async ({ page }) => {
  await gotoLoaded(page, '/#videos');

  await page.locator('#videoTabs [role="tab"]', { hasText: 'Remi' }).click();
  await expect(page.locator('#videoTabs [aria-selected="true"]')).toHaveText('Remi');
  const remi = page.locator('#videoList .library-video:visible');
  await expect(remi).toHaveCount(2);
  await expect(remi.locator('.video-type')).toHaveText(['Promo', 'Premium']);
  await expect(remi.first().locator('.video-card-link')).toHaveAttribute('href', '#players-remi');
});

const CARD_PROMOS = [
  ['#players-sah', '/videos/players-sah-promo.mp4'],
  ['#players-remi', '/videos/players-remi-promo.mp4'],
  ['#players-backgammon', '/videos/players-backgammon-promo.mp4'],
  ['#players-ping-pong', '/videos/players-ping-pong-promo.mp4'],
];

for (const [card, src] of CARD_PROMOS) {
  test(`game card ${card} always plays its promo video`, async ({ page }) => {
    await gotoLoaded(page, '/#events');

    await page.locator(`${card} .card-promo-button`).click();
    const dialog = page.locator('#promoDialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('video')).toHaveAttribute('src', src);
    await dialog.locator('.promo-close').click();
    await expect(dialog).toBeHidden();
  });
}

test('hero button plays the Player’s Poker Club promo', async ({ page }) => {
  await gotoLoaded(page, '/');

  await page.locator('.hero-card .card-promo-button').click();
  await expect(page.locator('#promoDialog video')).toHaveAttribute('src', '/videos/players-club-promo.mp4');
  await page.keyboard.press('Escape');
  await expect(page.locator('#promoDialog')).toBeHidden();
});

test('on desktop and tablet the video cards line up their share buttons and card links', async ({ page }) => {
  test.skip(page.viewportSize().width < 700, 'grid layout');
  for (const width of [1280, 820]) {
    await page.setViewportSize({ width, height: 900 });
    await mockSupabase(page);
    await gotoLoaded(page, `/?width=${width}#videos`);
    const rows = await page.locator('#videos .library-video:not([hidden])').evaluateAll(cards => {
      const byRow = new Map();
      for (const card of cards) {
        const top = Math.round(card.getBoundingClientRect().top), share = card.querySelector('.share-row').getBoundingClientRect(), link = card.querySelector('.video-card-link').getBoundingClientRect();
        byRow.set(top, [...(byRow.get(top) || []), { share: Math.round(share.top), link: Math.round(link.top) }]);
      }
      return [...byRow.values()].filter(row => row.length > 1);
    });
    expect(rows.length, `rows at ${width}px`).toBeGreaterThan(0);
    const badge = await page.locator('#videos .library-video .video-type').first().evaluate(node => node.getBoundingClientRect().width / node.closest('.video-info').getBoundingClientRect().width);
    expect(badge, 'type badge keeps its own size').toBeLessThan(0.6);
    for (const row of rows) {
      expect(new Set(row.map(card => card.share)).size, `share buttons aligned at ${width}px`).toBe(1);
      expect(new Set(row.map(card => card.link)).size, `card links aligned at ${width}px`).toBe(1);
    }
  }
});

test('the Seara de Șah recap of 6 October is the newest event video in the Șah category', async ({ page }) => {
  await gotoLoaded(page, '/#videos');

  await page.locator('#videoTabs [role="tab"]', { hasText: 'Șah' }).click();
  const chess = page.locator('#videoList .library-video:visible');
  await expect(chess).toHaveCount(2);
  const recap = chess.first();
  await expect(recap.locator('h3')).toHaveText('Seara de Șah · marți 6 octombrie');
  await expect(recap.locator('.video-type')).toHaveText('Eveniment');
  await expect(recap.locator('video')).toHaveAttribute('src', '/videos/players-sah-seara-0610.mp4');
  await expect(recap.locator('video')).toHaveAttribute('poster', '/videos/players-sah-seara-0610-poster.jpg');
  await expect(recap.locator('.video-card-link')).toHaveAttribute('href', '#players-sah');
  expect((await page.request.get('/videos/players-sah-seara-0610-poster.jpg')).ok()).toBe(true);
  expect((await page.request.head('/videos/players-sah-seara-0610.mp4')).ok()).toBe(true);
});
