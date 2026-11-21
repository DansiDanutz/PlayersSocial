// /echipa/: every dealer and floor manager sees all dealer cards; visitors and non-staff do not.
const { test, expect } = require('@playwright/test');
const { mockStaff, dealerRow } = require('../support/staff-mock');

// Dates relative to today, so the board's "current month" always matches the fixtures.
const monthKey = offset => { const d = new Date(); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 7); };
const THIS = monthKey(0);
const LAST = monthKey(-1);
const start = `${monthKey(-3)}-01`;

const teammate = {
  dealer: { id: 'dealer-2', full_name: 'Bogdan Rus', signed_at: `${start}T10:00:00Z`, start_date: start, is_active: true },
  shifts: [
    { id: 'b1', check_in: `${THIS}-03T15:00:00Z`, check_out: null, status: 'open' },
    { id: 'b0', check_in: `${LAST}-05T15:00:00Z`, check_out: `${LAST}-05T23:00:00Z`, status: 'approved' },
  ],
  tips: [{ day: `${THIS}-03`, total: 2000 }, { day: `${LAST}-05`, total: 3000 }],
  penalties: [{ id: 'bp1', day: `${THIS}-04`, amount: 100, reason: 'Întârziere' }],
};
const me = { user: true, dealer: dealerRow({ start_date: start }), tips: [{ day: `${THIS}-02`, total: 1000 }], team: [teammate] };

test('a dealer sees every dealer card with this month figures and opens a full card in third person', async ({ page }) => {
  await mockStaff(page, me);
  await page.goto('/echipa/');

  await expect(page.getByRole('heading', { name: 'Echipa de dealeri' })).toBeVisible();
  await expect(page.locator('.b-stat').filter({ hasText: 'Dealeri activi' })).toContainText('2');
  await expect(page.locator('.b-month output')).toContainText('în curs');
  const bogdan = page.getByRole('button', { name: 'Deschide cardul lui Bogdan Rus' });
  await expect(bogdan).toContainText('La lucru');
  await expect(bogdan).toContainText('1 penalizare');
  await expect(bogdan).toContainText('1.200 RON');
  await expect(page.getByRole('button', { name: 'Deschide cardul lui Ana Maria Pop' })).toContainText('Fără penalizări');

  await bogdan.click();
  await expect(page.locator('#sheetTitle')).toHaveText('Bogdan Rus');
  await expect(page.locator('#sheet .tile').filter({ hasText: 'Depozit' }).first()).not.toContainText('Depozitul tău');
  await expect(page.locator('#sheet .item').filter({ hasText: 'Întârziere' })).toContainText('−100 RON');
  await page.getByRole('button', { name: 'Închide' }).click();
  await expect(page.locator('#sheet')).toBeHidden();
});

test('the month switcher shows earlier months and stops at the current one', async ({ page }) => {
  await mockStaff(page, me);
  await page.goto('/echipa/');

  await expect(page.getByRole('button', { name: 'Luna următoare' })).toBeDisabled();
  await page.getByRole('button', { name: 'Luna anterioară' }).click();
  await expect(page.locator('.b-month output')).not.toContainText('în curs');
  const bogdan = page.getByRole('button', { name: 'Deschide cardul lui Bogdan Rus' });
  await expect(bogdan).toContainText('8 h');
  await expect(bogdan).toContainText('3.000 RON');
  await expect(bogdan).toContainText('Fără penalizări');
});

test('the table view lists every dealer and remembers the choice', async ({ page }) => {
  await mockStaff(page, me);
  await page.goto('/echipa/');

  await page.getByRole('tab', { name: 'Tabel' }).click();
  const row = page.locator('table.b-table tbody tr').filter({ hasText: 'Bogdan Rus' });
  await expect(row).toContainText('1.200 RON');
  await expect(row).toContainText('−100 RON');
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Tabel' })).toHaveAttribute('aria-selected', 'true');
  await page.locator('table.b-table').getByRole('button', { name: 'Bogdan Rus' }).click();
  await expect(page.locator('#sheetTitle')).toHaveText('Bogdan Rus');
});

test('search and sort narrow the board', async ({ page }) => {
  await mockStaff(page, me);
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
