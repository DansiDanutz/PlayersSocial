// Role icons: every account shows Dealer (card), Șef de sală (clipboard) and Super Admin (crown) icons for the
// roles it holds — in the staff header, the home menu, the team board and the admin directory.
const { test, expect } = require('@playwright/test');
const { mockStaff, dealerRow } = require('../support/staff-mock');
const { gotoLoaded, USER } = require('../support/supabase-mock');

const roleKeys = locator => locator.locator('.role-icon').evaluateAll(nodes => nodes.map(node => node.classList[1]));

test('a dealer sees the dealer icon in the staff header', async ({ page }) => {
  await mockStaff(page, { user: true, dealer: dealerRow() });
  await page.goto('/dealer/');

  const mine = page.locator('.topbar #myRoles');
  await expect(mine).toHaveAttribute('aria-label', 'Roluri: Dealer');
  expect(await roleKeys(mine)).toEqual(['dealer']);
});

test('a floor manager who is also a dealer shows both icons', async ({ page }) => {
  await mockStaff(page, { user: true, dealer: dealerRow(), managers: [USER.email] });
  await page.goto('/sef-de-sala/');

  await expect(page.locator('.topbar #myRoles')).toHaveAttribute('aria-label', 'Roluri: Dealer, Șef de sală');
});

test('the super admin sees all three icons and every account with its roles', async ({ page }) => {
  await mockStaff(page, { admin: true, adminIsDealer: true, dealer: dealerRow(), managers: ['floor@example.com'] });
  await page.goto('/sef-de-sala/');

  await expect(page.locator('.topbar #myRoles')).toHaveAttribute('aria-label', 'Roluri: Dealer, Șef de sală, Super Admin');
  await page.getByRole('tab', { name: /Șefi de sală/ }).click();
  const directory = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Toate conturile' }) });
  await expect(directory.locator('.item').filter({ hasText: 'Ana Maria Pop' }).locator('.role-icons')).toHaveAttribute('aria-label', 'Roluri: Dealer');
  await expect(directory.locator('.item').filter({ hasText: 'floor@example.com' }).locator('.role-icon.floor')).toContainText('Șef de sală');
  await expect(directory.locator('.item .role-icon.admin')).toHaveCount(1);
});

test('team board cards carry role icons and a traffic-light colour', async ({ page }) => {
  const teammate = {
    dealer: { id: 'dealer-2', full_name: 'Bogdan Rus', signed_at: '2026-09-01T10:00:00Z', start_date: '2026-09-01', is_active: true },
    roles: { dealer: true, floor: true, admin: false },
    shifts: [], tips: [], payouts: [],
    penalties: [{ id: 'p1', day: new Date().toISOString().slice(0, 10), amount: 50, reason: 'Întârziere' }],
  };
  await mockStaff(page, { user: true, dealer: dealerRow({ start_date: new Date().toISOString().slice(0, 10) }), team: [teammate] });
  await page.goto('/echipa/');

  const bogdan = page.getByRole('button', { name: 'Deschide cardul lui Bogdan Rus' });
  await expect(bogdan.locator('.role-icons')).toHaveAttribute('aria-label', 'Roluri: Dealer, Șef de sală');
  await expect(bogdan).toHaveClass(/tone-red/);
  await expect(page.getByRole('button', { name: 'Deschide cardul lui Ana Maria Pop' })).toHaveClass(/tone-green/);
  await expect(page.locator('.legend')).toContainText('Penalizare');
});

test('the home page shows the role icons next to the signed-in name and in the menu', async ({ page }) => {
  await mockStaff(page, { user: true, dealer: dealerRow(), managers: [USER.email] });
  await gotoLoaded(page, '/');

  await expect(page.locator('#accountRoles .role-icons')).toHaveAttribute('aria-label', 'Roluri: Dealer, Șef de sală');
  await page.locator('.menu-toggle, #menuToggle, [aria-controls="siteMenu"]').first().click();
  await expect(page.locator('#menuAccount .role-icon.dealer')).toBeVisible();
});
