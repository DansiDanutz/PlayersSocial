// /echipa/: every dealer and floor manager sees all dealer cards; visitors and non-staff do not.
const { test, expect } = require('@playwright/test');
const { mockStaff, dealerRow } = require('../support/staff-mock');

const teammate = {
  dealer: { id: 'dealer-2', full_name: 'Bogdan Rus', signed_at: '2026-09-01T10:00:00Z', start_date: '2026-09-01', is_active: true },
  shifts: [{ id: 'b1', check_in: '2026-11-20T15:00:00Z', check_out: null, status: 'open' }],
  tips: [{ day: '2026-11-03', total: 2000 }],
  penalties: [{ id: 'bp1', day: '2026-11-04', amount: 100, reason: 'Întârziere' }],
};

test('a dealer sees every dealer card with this month figures and can open the full card', async ({ page }) => {
  await mockStaff(page, { user: true, dealer: dealerRow(), tips: [{ day: '2026-11-02', total: 1000 }], team: [teammate] });
  await page.goto('/echipa/');

  await expect(page.getByRole('heading', { name: 'Echipa de dealeri' })).toBeVisible();
  await expect(page.locator('.b-stat').filter({ hasText: 'Dealeri activi' })).toContainText('2');
  const bogdan = page.getByRole('button', { name: 'Deschide cardul lui Bogdan Rus' });
  await expect(bogdan).toContainText('La lucru');
  await expect(bogdan).toContainText('1 penalizare');
  await expect(bogdan).toContainText('1.200 RON');
  await expect(page.getByRole('button', { name: 'Deschide cardul lui Ana Maria Pop' })).toContainText('Fără penalizări');

  await bogdan.click();
  await expect(page.locator('#sheet')).toBeVisible();
  await expect(page.locator('#sheetTitle')).toHaveText('Bogdan Rus');
  await expect(page.locator('#sheet .item').filter({ hasText: 'Întârziere' })).toContainText('−100 RON');
  await page.getByRole('button', { name: 'Închide' }).click();
  await expect(page.locator('#sheet')).toBeHidden();
});

test('search and sort narrow the board', async ({ page }) => {
  await mockStaff(page, { user: true, dealer: dealerRow(), team: [teammate] });
  await page.goto('/echipa/');

  await page.getByRole('searchbox', { name: 'Caută dealer' }).fill('bog');
  await expect(page.locator('.b-dealer')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Caută dealer' }).fill('');
  await page.getByLabel('Ordonează').selectOption('name');
  await expect(page.locator('.b-dealer').first()).toContainText('Ana Maria Pop');
});

test('a floor manager who is not a dealer also sees the board', async ({ page }) => {
  await mockStaff(page, { admin: true, team: [teammate] });
  await page.goto('/echipa/');
  await expect(page.getByRole('button', { name: 'Deschide cardul lui Bogdan Rus' })).toBeVisible();
});

test('accounts that are not staff are refused and pointed to the signing form', async ({ page }) => {
  await mockStaff(page, { user: true, team: [teammate] });
  await page.goto('/echipa/');
  await expect(page.getByText('Acces doar pentru dealeri și șefi de sală')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Îmi fac contul de dealer' })).toHaveAttribute('href', '/dealers-payout/#semnare');
  await expect(page.locator('.b-dealer')).toHaveCount(0);
});
