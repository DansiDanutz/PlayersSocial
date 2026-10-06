const path = require('path');
const { test, expect } = require('@playwright/test');
const { mockSupabase, gotoLoaded, openDashboardSection } = require('../support/supabase-mock');

// 1024 × 1536 px (2:3 portrait)
const POSTER = path.join(__dirname, '..', '..', 'dist', 'poster-remi.webp');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-07T12:00:00'));
  await page.route('**/videos/*.mp4', route => route.fulfill({ status: 204, body: '' }));
});

async function openAdmin(page, section) {
  await mockSupabase(page, { admin: true });
  await gotoLoaded(page, '/#events');
  await page.locator('#adminToggle').click();
  await openDashboardSection(page, section);
}

test('every image upload shows the recommended size', async ({ page }) => {
  await openAdmin(page, 'dashboardProgram');
  await expect(page.locator('label[for="programWeekImage"]')).toContainText('Recomandat: 1080 × 1350 px');
  await expect(page.locator('label[for="program-image-2026-10-05"]')).toContainText('Recomandat: 1080 × 1440 px');

  await openDashboardSection(page, 'dashboardVideos');
  await expect(page.locator('label[for="videoPoster"]')).toContainText('Recomandat: 1080 × 1920 px');

  await openDashboardSection(page, 'dashboardFeatured');
  await page.getByRole('button', { name: '+ Creează eveniment' }).click();
  await expect(page.locator('.create-event-form')).toContainText('Recomandat: 1080 × 1620 px');
});

test('choosing a day image shows its size and warns when it will be cropped', async ({ page }) => {
  await openAdmin(page, 'dashboardProgram');
  await page.locator('#program-image-2026-10-05').setInputFiles(POSTER);

  const hint = page.locator('.program-day[data-day="2026-10-05"] .image-hint');
  await expect(hint).toContainText('Imaginea ta: 1024 × 1536 px');
  await expect(hint).toContainText('va fi decupată');
  await expect(hint).toHaveClass(/is-warning/);
});

test('an event banner with the right shape is confirmed', async ({ page }) => {
  await openAdmin(page, 'dashboardFeatured');
  await page.getByRole('button', { name: '+ Creează eveniment' }).click();
  await page.locator('.create-event-form input[name="banner"]').setInputFiles(POSTER);

  const hint = page.locator('.create-event-form .image-hint');
  await expect(hint).toContainText('Imaginea ta: 1024 × 1536 px');
  await expect(hint).toContainText('Proporția e potrivită');
  await expect(hint).not.toHaveClass(/is-warning/);
});

test('the week image is shown whole, so any shape is accepted with a note', async ({ page }) => {
  await openAdmin(page, 'dashboardProgram');
  await page.locator('#programWeekImage').setInputFiles(POSTER);

  const hint = page.locator('.program-week-form .image-hint');
  await expect(hint).toContainText('Imaginea ta: 1024 × 1536 px');
  await expect(hint).toContainText('se afișează întreagă');
});
