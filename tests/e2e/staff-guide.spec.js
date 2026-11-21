// /cum-functioneaza/: the staff guide explains the three roles and is linked from every staff page.
const { test, expect } = require('@playwright/test');
const { mockStaff } = require('../support/staff-mock');

test('the guide explains dealer, floor manager and administrator steps', async ({ page }) => {
  await page.goto('/cum-functioneaza/');

  for (const name of ['Dealer', 'Șef de sală', 'Administrator']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await expect(page.locator('#sef-de-sala')).toContainText('Aprobare administrator');
  await expect(page.locator('#administrator')).toContainText('expiră după 7 zile');
  await expect(page.getByRole('link', { name: 'Îmi fac contul' })).toHaveAttribute('href', '/dealers-payout/#semnare');
});

for (const path of ['/dealers-payout/', '/dealer/', '/sef-de-sala/', '/aprobare/#t=x']) {
  test(`${path} links to the guide`, async ({ page }) => {
    await mockStaff(page, { user: true });
    await page.goto(path);
    await expect(page.getByRole('link', { name: 'Cum funcționează' })).toHaveAttribute('href', '/cum-functioneaza/');
  });
}
