// Floor manager panel: the "Istoric" column lists what was saved, newest first, and a click that took effect
// appears at the top straight away.
const { test, expect } = require('@playwright/test');
const { mockStaff, dealerRow } = require('../support/staff-mock');
const { USER } = require('../support/supabase-mock');

const pendingShift = { id: 's1', check_in: '2026-11-20T16:00:00Z', check_out: '2026-11-20T23:00:00Z', status: 'pending', overdue: false };
const earlier = { id: 1, at: '2026-11-20T23:05:00Z', action: 'check_out', dealer: 'Ana Maria Pop', actor: 'Ana Maria Pop', mine: false,
  details: { check_in: '2026-11-20T16:00:00Z', check_out: '2026-11-20T23:00:00Z', status: 'pending' } };

test('approving a shift adds it at the top of the history', async ({ page }) => {
  await mockStaff(page, { user: true, managers: [USER.email], dealer: dealerRow(), shifts: [pendingShift], activity: [earlier] });
  await page.goto('/sef-de-sala/');

  const history = page.getByRole('complementary', { name: 'Istoric' });
  await expect(history.locator('.activity-item')).toHaveCount(1);
  await expect(history.locator('.activity-item').first()).toContainText('a plecat');

  await page.getByRole('button', { name: 'Aprobă' }).click();
  const top = history.locator('.activity-item').first();
  await expect(top).toContainText('Ana Maria Pop · tură aprobată');
  await expect(top).toContainText('Tu');
  await expect(top).toHaveClass(/fresh/);
  await expect(history.locator('.activity-item')).toHaveCount(2);
});

test('the history sits on the right of the panel on wide screens', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Phones stack the history under the content.');
  await page.setViewportSize({ width: 1400, height: 900 });
  await mockStaff(page, { user: true, managers: [USER.email], dealer: dealerRow(), shifts: [pendingShift], activity: [earlier] });
  await page.goto('/sef-de-sala/');

  const history = await page.getByRole('complementary', { name: 'Istoric' }).boundingBox();
  const pending = await page.getByRole('heading', { name: 'Pontaje de aprobat' }).boundingBox();
  expect(history.x).toBeGreaterThan(pending.x + pending.width);
});

test('an empty history says so', async ({ page }) => {
  await mockStaff(page, { user: true, managers: [USER.email], dealer: dealerRow() });
  await page.goto('/sef-de-sala/');
  await expect(page.getByRole('complementary', { name: 'Istoric' })).toContainText('Nicio modificare încă.');
});
