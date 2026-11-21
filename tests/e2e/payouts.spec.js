// Payouts: the floor manager records what was paid for each closed month and each bonus reached; the dealer
// card and the team board show what is paid and what is still owed.
const { test, expect } = require('@playwright/test');
const { mockStaff, dealerRow } = require('../support/staff-mock');

// Dates relative to today, so "last month" is always a closed month.
const monthKey = offset => { const d = new Date(); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 7); };
const LAST = monthKey(-1);
const todayIso = () => { const d = new Date(); const pad = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// Worked last month: 3.000 RON tips → 1.800 RON share, topped up to the 5.000 RON guarantee.
const worked = { dealer: dealerRow({ start_date: `${monthKey(-3)}-01` }), tips: [{ day: `${LAST}-05`, total: 3000 }] };
const paidLast = { id: 'payout-9', kind: 'month', period: LAST, amount: 5000, from_deposit: 0, paid_on: `${LAST}-28`, note: 'numerar' };

test('the floor manager records last month as paid from the Plăți tab', async ({ page }) => {
  const { staff } = await mockStaff(page, { admin: true, ...worked });
  await page.goto('/sef-de-sala/');

  const tab = page.getByRole('tab', { name: /Plăți/ });
  await expect(tab.locator('.count')).toHaveText('1');
  await tab.click();
  await expect(page.getByText('Total de plătit: 5.000 RON')).toBeVisible();
  await expect(page.getByLabel(/^Suma Ana Maria Pop/)).toHaveValue('5000');
  await page.getByLabel('Notă Ana Maria Pop').fill('numerar');
  await page.getByRole('button', { name: /Marchează plătit: Ana Maria Pop/ }).click();

  await expect(page.getByText('Toate plățile sunt la zi.')).toBeVisible();
  await expect(tab.locator('.count')).toBeHidden();
  const history = page.locator('.item').filter({ hasText: 'numerar' });
  await expect(history).toContainText('5.000 RON');
  expect(staff.calls.find(call => call.name === 'players_floor_record_payout').body).toEqual({
    p_dealer: 'dealer-1', p_kind: 'month', p_period: LAST, p_amount: 5000, p_from_deposit: 0, p_paid_on: todayIso(), p_note: 'numerar',
  });
});

test('a wrong payout is deleted and the month becomes due again', async ({ page }) => {
  const { staff } = await mockStaff(page, { admin: true, ...worked, payouts: [paidLast] });
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/sef-de-sala/');
  await page.getByRole('tab', { name: /Plăți/ }).click();
  await expect(page.getByText('Toate plățile sunt la zi.')).toBeVisible();

  await page.getByRole('button', { name: /Șterge plata: Ana Maria Pop/ }).click();

  await expect(page.getByRole('button', { name: /Marchează plătit: Ana Maria Pop/ })).toBeVisible();
  expect(staff.payouts).toHaveLength(0);
});

test('a bonus that is reached is due with its deposit part, and is paid as a bonus', async ({ page }) => {
  const bonusDate = `${monthKey(-1)}-01`;
  const { staff } = await mockStaff(page, { admin: true, dealer: dealerRow({ start_date: `${monthKey(-7)}-01` }) });
  await page.goto('/sef-de-sala/');
  await page.getByRole('tab', { name: /Plăți/ }).click();

  await expect(page.getByLabel(/^Suma Ana Maria Pop/)).toHaveValue('4000');
  await expect(page.getByLabel('Din depozit Ana Maria Pop')).toHaveValue('0');
  await page.getByRole('button', { name: /Marchează plătit: Ana Maria Pop, Bonus 6 luni/ }).click();

  await expect(page.getByText('Toate plățile sunt la zi.')).toBeVisible();
  const body = staff.calls.find(call => call.name === 'players_floor_record_payout').body;
  expect(body).toMatchObject({ p_kind: 'bonus', p_period: bonusDate, p_amount: 4000, p_from_deposit: 0 });
});

test('the dealer sees which months are paid and the payment history on their card', async ({ page }) => {
  await mockStaff(page, { user: true, ...worked, payouts: [paidLast] });
  await page.goto('/dealer/');

  await expect(page.locator('table.stack td[data-label="Plată"] .chip.approved')).toContainText('Plătit');
  const panel = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Plăți' }) });
  await expect(panel).toContainText('Ai primit în total 5.000 RON. Nimic restant.');
  await expect(panel).toContainText('numerar');
  await expect(panel.getByRole('button', { name: /Șterge/ })).toHaveCount(0);
});

test('the team board marks last month as due until it is paid', async ({ page }) => {
  await mockStaff(page, { user: true, ...worked });
  await page.goto('/echipa/');
  await page.getByRole('button', { name: 'Luna anterioară' }).click();

  await expect(page.getByRole('button', { name: 'Deschide cardul lui Ana Maria Pop' })).toContainText('De plătit');
  await expect(page.locator('.b-stat').filter({ hasText: 'De plătit' })).toContainText('rămas 5.000 RON');
});
