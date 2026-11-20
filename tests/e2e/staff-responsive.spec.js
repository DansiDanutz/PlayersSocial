// Staff pages fit every phone: no sideways scrolling from 320 px wide up, in portrait and landscape.
const { test, expect } = require('@playwright/test');
const { mockStaff, dealerRow } = require('../support/staff-mock');
const { USER } = require('../support/supabase-mock');

const SCREENS = [
  { name: 'small phone', width: 320, height: 640 },
  { name: 'iPhone', width: 375, height: 812 },
  { name: 'large phone', width: 430, height: 932 },
  { name: 'landscape', width: 740, height: 360 },
];
const DATA = {
  user: true, managers: [USER.email], dealer: dealerRow({ full_name: 'Alexandra-Maria Constantinescu-Popovici' }),
  tips: [{ day: '2026-09-05', total: 12500 }, { day: '2026-11-03', total: 3000 }],
  shifts: [{ id: 's1', check_in: '2026-11-20T16:00:00Z', check_out: '2026-11-20T23:00:00Z', status: 'pending', overdue: true }],
  penalties: [{ id: 'p1', day: '2026-11-04', amount: 100, reason: 'Întârziere de 30 de minute la începutul programului' }],
};
const PAGES = [
  { name: 'dealer card', path: '/dealer/' },
  { name: 'approvals', path: '/sef-de-sala/' },
  { name: 'daily tips', path: '/sef-de-sala/', tab: 'Tips & ore pe zi' },
  { name: 'dealer list', path: '/sef-de-sala/', tab: 'Dealeri' },
  { name: 'rules and signing', path: '/dealers-payout/' },
];

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const screen of SCREENS) {
  for (const target of PAGES) {
    test(`${target.name} fits a ${screen.name} (${screen.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: screen.width, height: screen.height });
      await mockStaff(page, DATA);
      await page.goto(target.path);
      await page.locator('main, .page').first().waitFor();
      if (target.tab) await page.getByRole('tab', { name: target.tab }).click();
      await page.waitForLoadState('networkidle');

      expect(await overflow(page)).toBeLessThanOrEqual(1);
    });
  }
}

test('on phones the dealer tables turn into labelled cards', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockStaff(page, DATA);
  await page.goto('/dealer/');

  await expect(page.locator('table.stack thead').first()).toBeHidden();
  await expect(page.locator('table.stack td[data-label="De primit"]').first()).toBeVisible();
});

test('on phones the signature box is large enough for a finger', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockStaff(page, DATA);
  await page.goto('/dealers-payout/#semnare');

  const box = await page.locator('#semnare canvas').boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(100);
  expect(box.width).toBeGreaterThan(250);
});
