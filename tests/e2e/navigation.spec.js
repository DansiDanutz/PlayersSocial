// Staff navigation (dist/staff/nav.js): the same links in the same order on every staff page, filtered by role;
// the account sits behind one button; phones and tablets use a bottom tab bar; nothing overflows narrow screens.
const { test, expect } = require('@playwright/test');
const { mockStaff, dealerRow } = require('../support/staff-mock');
const { USER } = require('../support/supabase-mock');

const menu = (page, isMobile) => page.locator(isMobile ? '.tabbar' : '.site-links');
const visibleLabels = locator => locator.locator('a:visible').evaluateAll(nodes => nodes.map(node => node.textContent.trim()));

test('a dealer sees only the dealer menu', async ({ page, isMobile }) => {
  await mockStaff(page, { user: true, dealer: dealerRow() });
  await page.goto('/dealer/');
  await expect(page.locator('.topbar #myRoles')).toBeAttached();
  await expect.poll(() => visibleLabels(menu(page, isMobile))).toEqual(['Cardul meu', 'Echipa', 'Regulament', 'Ghid']);
});

test('a floor manager who is also a dealer gets the panel in the menu', async ({ page, isMobile }) => {
  await mockStaff(page, { user: true, dealer: dealerRow(), managers: [USER.email] });
  await page.goto('/sef-de-sala/');
  await expect.poll(() => visibleLabels(menu(page, isMobile))).toEqual(['Cardul meu', 'Șef de sală', 'Echipa', 'Regulament', 'Ghid']);
  await expect(menu(page, isMobile).getByRole('link', { name: 'Șef de sală' })).toHaveAttribute('aria-current', 'page');
});

test('a floor manager without a dealer card does not see "Cardul meu"', async ({ page, isMobile }) => {
  await mockStaff(page, { user: true, managers: [USER.email] });
  await page.goto('/sef-de-sala/');
  await expect.poll(() => visibleLabels(menu(page, isMobile))).toEqual(['Șef de sală', 'Echipa', 'Regulament', 'Ghid']);
});

test('the account button opens the email, home page and sign-out', async ({ page }) => {
  await mockStaff(page, { user: true, dealer: dealerRow() });
  await page.goto('/dealer/');
  const button = page.getByRole('button', { name: `Contul meu: ${USER.email}` });
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const accountMenu = page.locator('#accountMenu');
  await expect(accountMenu).toContainText(USER.email);
  await expect(accountMenu.getByRole('link', { name: 'Pagina principală' })).toHaveAttribute('href', '/');
  await expect(accountMenu.getByRole('button', { name: 'Ieși' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(accountMenu).toBeHidden();
});

test('the rules page uses the same menu', async ({ page, isMobile }) => {
  await mockStaff(page, { user: true, dealer: dealerRow() });
  await page.goto('/dealers-payout/');
  await expect.poll(() => visibleLabels(menu(page, isMobile))).toEqual(['Cardul meu', 'Echipa', 'Regulament', 'Ghid']);
  await expect(page.getByRole('link', { name: /Descarcă PDF/ })).toBeVisible();
});

test('every floor manager tab is visible on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await mockStaff(page, { admin: true, dealer: dealerRow(), managers: [USER.email] });
  await page.goto('/sef-de-sala/');
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(5);
  for (const box of await tabs.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()))) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(360);
  }
});

for (const path of ['/dealer/', '/sef-de-sala/', '/echipa/', '/cum-functioneaza/', '/dealers-payout/']) {
  test(`${path} fits a 320px screen without sideways scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await mockStaff(page, { user: true, dealer: dealerRow(), managers: [USER.email] });
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const account = page.locator('.account-btn');
    if (await account.count()) {
      const box = await account.boundingBox();
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
  });
}
