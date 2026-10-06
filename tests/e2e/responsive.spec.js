const { test, expect } = require('@playwright/test');
const { mockSupabase, featuredRow, gotoLoaded, SCHEDULE_BASE, openDashboardSection } = require('../support/supabase-mock');

const hasHorizontalOverflow = page => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-01T12:00:00'));
});

test('page and admin dashboard fit the viewport without horizontal scrolling', async ({ page }) => {
  await mockSupabase(page, { admin: true, events: [featuredRow({ event_name: 'Turneu de Remi', event_date: '2026-10-10' }), featuredRow({ event_name: 'Turneu de Șah', event_date: '2026-09-26' })] });
  await gotoLoaded(page, '/#events');
  await expect(page.locator('#eveniment-turneu-de-remi')).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);

  await page.locator('#adminToggle').click();
  await openDashboardSection(page, 'dashboardFeatured');
  await page.getByRole('button', { name: '+ Creează eveniment' }).click();
  await page.locator('#featuredEnded summary').first().click();
  const main = page.locator('.dashboard-main');
  expect(await main.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await hasHorizontalOverflow(page)).toBe(false);
});

const isPhone = page => page.viewportSize().width <= 600;
const SCHEDULE = {
  scheduleDays: { '2026-09-29': { linked_card: 'Seară de Șah', image_url: null }, '2026-10-02': { linked_card: 'Karaoke Club', image_url: null }, '2026-10-03': { linked_card: 'Remi & Prieteni', image_url: null } },
  scheduleWeeks: { '2026-09-28': { image_url: null, featured_day: '2026-10-02' } },
};

test('phone programme is a compact list and videos swipe sideways', async ({ page }) => {
  test.skip(!isPhone(page), 'phone layout');
  await page.route('**/videos/*.mp4', route => route.fulfill({ status: 204, body: '' }));
  await mockSupabase(page, SCHEDULE);
  await gotoLoaded(page, '/#program');
  await expect(page.locator('#program .schedule-day')).toHaveCount(7);

  expect((await page.locator('#program .schedule-days').boundingBox()).height).toBeLessThan(820);
  await expect(page.locator('#videoList .library-video')).toHaveCount(8);
  const list = page.locator('#videoList');
  expect(await list.evaluate(element => element.scrollWidth > element.clientWidth + 100)).toBe(true);
  expect((await page.locator('#videos').boundingBox()).height).toBeLessThan(1300);
  const link = (await page.locator('#videoList .video-card-link').first().boundingBox());
  expect(link.height).toBeGreaterThanOrEqual(40);
  expect(await hasHorizontalOverflow(page)).toBe(false);
});

test('admin dashboard tabs show one section at a time', async ({ page }) => {
  await mockSupabase(page, { admin: true, ...SCHEDULE });
  await gotoLoaded(page, '/#events');
  await page.locator('#adminToggle').click();

  await expect(page.locator('#dashboardKpis')).toBeVisible();
  await expect(page.locator('#dashboardEvents')).toBeHidden();
  const program = page.locator('.dashboard-nav button[data-section="dashboardProgram"]');
  await openDashboardSection(page, 'dashboardProgram');
  await expect(program).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#dashboardProgram')).toBeVisible();
  for (const hidden of ['#dashboardKpis', '#dashboardFeatured', '#dashboardEvents', '#dashboardVideos', '#dashboardAdmins']) await expect(page.locator(hidden)).toBeHidden();
  const radio = await page.locator('#dashboardProgram input[type="radio"]').first().boundingBox();
  expect(radio.width).toBeGreaterThanOrEqual(20);
  await openDashboardSection(page, 'dashboardEvents');
  await expect(page.locator('#dashboardEvents')).toBeVisible();
  // The header already names the section, so the section's own title is not repeated.
  await expect(page.locator('.dashboard-current-title')).toHaveText('Carduri & notificări');
  await expect(page.locator('.dashboard-section-title[data-panel="dashboardEvents"]')).toBeHidden();
  await expect(page.locator('#dashboardProgram')).toBeHidden();
  expect(await hasHorizontalOverflow(page)).toBe(false);
});
