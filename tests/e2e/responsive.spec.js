const { test, expect } = require('@playwright/test');
const { mockSupabase, featuredRow, gotoLoaded } = require('../support/supabase-mock');

const hasHorizontalOverflow = page => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-01T12:00:00'));
});

test('page and admin dashboard fit the viewport without horizontal scrolling', async ({ page }) => {
  await mockSupabase(page, { admin: true, events: [featuredRow({ event_name: 'Turneu de Remi', event_date: '2026-10-10' }), featuredRow({ event_name: 'Turneu de Șah', event_date: '2026-09-26' })] });
  await gotoLoaded(page, '/#events');
  await expect(page.locator('#eveniment-turneu-de-remi')).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);

  await page.locator('#adminToggle').click();
  await page.getByRole('button', { name: '+ Creează eveniment' }).click();
  await page.locator('#featuredEnded summary').first().click();
  const main = page.locator('.dashboard-main');
  expect(await main.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await hasHorizontalOverflow(page)).toBe(false);
});
