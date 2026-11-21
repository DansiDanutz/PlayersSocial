// Floor managers edit the site content from the home dashboard (events, banners, schedule, videos), but only
// Super Admins see the administrators list and the floor manager access tab.
const { test, expect } = require('@playwright/test');
const { mockStaff, dealerRow } = require('../support/staff-mock');
const { gotoLoaded, openDashboardSection, USER } = require('../support/supabase-mock');

test('a floor manager opens the content dashboard without the administrators section', async ({ page }) => {
  await mockStaff(page, { user: true, dealer: dealerRow(), managers: [USER.email] });
  await gotoLoaded(page, '/');

  await expect(page.locator('#adminToggle')).toBeVisible();
  await page.locator('#adminToggle').click();
  await expect(page.locator('#adminDashboard')).toBeVisible();
  for (const section of ['dashboardFeatured', 'dashboardEvents', 'dashboardVideos', 'dashboardProgram']) {
    await openDashboardSection(page, section);
    await expect(page.locator(`#${section}`)).toBeVisible();
  }
  await expect(page.locator('#dashboardNav [data-section="dashboardAdmins"]')).toBeHidden();
  await expect(page.locator('#dashboardAdmins')).toBeHidden();
});

test('a floor manager does not get the access management tab', async ({ page }) => {
  await mockStaff(page, { user: true, dealer: dealerRow(), managers: [USER.email] });
  await page.goto('/sef-de-sala/');

  await expect(page.getByRole('tab', { name: /De aprobat/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Șefi de sală/ })).toHaveCount(0);
});

test('the super admin still sees the administrators section', async ({ page }) => {
  await mockStaff(page, { admin: true });
  await gotoLoaded(page, '/');

  await page.locator('#adminToggle').click();
  await openDashboardSection(page, 'dashboardAdmins');
  await expect(page.locator('#dashboardAdmins')).toBeVisible();
});
