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
  await expect(page.locator('#videoList .library-video')).toHaveCount(8);
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
