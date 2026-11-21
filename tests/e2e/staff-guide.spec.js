// /cum-functioneaza/: the staff guide explains the three roles and is linked from every staff page.
const { test, expect } = require('@playwright/test');
const { mockStaff, dealerRow } = require('../support/staff-mock');
const { gotoLoaded } = require('../support/supabase-mock');

test('the guide explains dealer, floor manager and super admin steps, each with its role icon', async ({ page }) => {
  await page.goto('/cum-functioneaza/');

  for (const name of ['Dealer', 'Șef de sală', 'Super Admin']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  for (const role of ['dealer', 'floor', 'admin']) {
    await expect(page.locator(`a.role .role-icon.${role}`)).toHaveCount(1);
  }
  await expect(page.locator('#sef-de-sala')).toContainText('Aprobare administrator');
  await expect(page.locator('#administrator')).toContainText('expiră după 7 zile');
  await expect(page.getByRole('link', { name: 'Îmi fac contul' })).toHaveAttribute('href', '/dealers-payout/#semnare');
});

for (const path of ['/dealers-payout/', '/dealer/', '/sef-de-sala/', '/aprobare/#t=x']) {
  test(`${path} links to the guide`, async ({ page }) => {
    await mockStaff(page, { user: true });
    await page.goto(path);
    // Desktop: header link; phones: the bottom tab bar (pages with a single link keep it in the header).
    await expect(page.locator('.topbar, .toolbar, .tabbar').locator('a[href="/cum-functioneaza/"]:visible')).toHaveCount(1);
  });
}

test('staff pages show one set of navigation links: header on desktop, tab bar on phones', async ({ page, isMobile }) => {
  await mockStaff(page, { user: true, dealer: dealerRow() });
  await page.goto('/dealer/');

  const tabbar = page.getByRole('navigation', { name: 'Navigare personal' });
  if (isMobile) {
    await expect(tabbar).toBeVisible();
    await expect(tabbar.getByRole('link', { name: 'Cardul meu' })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.topbar .site-links')).toBeHidden();
  } else {
    await expect(tabbar).toBeHidden();
    await expect(page.locator('.site-links a[href="/echipa/"]')).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'Echipa' }).filter({ visible: true })).toHaveCount(1);
});

test('signed-in people find the staff pages in the home menu, visitors do not', async ({ page }) => {
  await mockStaff(page, { user: true });
  await gotoLoaded(page, '/');
  await expect(page.locator('#menuStaff')).not.toHaveAttribute('hidden', '');
  await page.locator('#menuToggle').click();
  const menu = page.locator('#siteMenu');
  await menu.getByText('Personal', { exact: true }).click();
  await expect(menu.getByRole('link', { name: 'Cardul meu de dealer' })).toHaveAttribute('href', '/dealer/');
  await expect(menu.getByRole('link', { name: 'Șef de sală' })).toHaveAttribute('href', '/sef-de-sala/');
  await expect(menu.getByRole('link', { name: 'Ghid personal' })).toHaveAttribute('href', '/cum-functioneaza/');
});

test('visitors who are not signed in do not see the staff menu', async ({ page }) => {
  await mockStaff(page);
  await gotoLoaded(page, '/');
  await page.locator('#menuToggle').click();
  await expect(page.locator('#siteMenu')).toBeVisible();
  await expect(page.locator('#menuStaff')).toBeHidden();
});
