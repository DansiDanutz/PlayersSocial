const { test, expect } = require('@playwright/test');
const { mockSupabase, videoRow, gotoLoaded, VIDEO_BASE, openDashboardSection } = require('../support/supabase-mock');

const MP4 = { name: 'seara-remi.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fake mp4 bytes') };
const POSTER = { name: 'coperta.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake jpg bytes') };

test.beforeEach(async ({ page }) => {
  await page.route('**/videos/*.mp4', route => route.fulfill({ status: 204, body: '' }));
});

async function openVideoAdmin(page) {
  await page.locator('#adminToggle').click();
  await expect(page.locator('#adminDashboard')).toBeVisible();
  await openDashboardSection(page, 'dashboardVideos');
  await expect(page.locator('#dashboardVideos')).toBeVisible();
}

test('uploaded event videos appear first in their category in the Video tab', async ({ page }) => {
  await mockSupabase(page, { videos: [videoRow()] });
  await gotoLoaded(page, '/#videos');

  await expect(page.locator('#videoList .library-video')).toHaveCount(11);
  await page.locator('#videoTabs [role="tab"]', { hasText: 'Remi' }).click();
  const remi = page.locator('#videoList .library-video:visible');
  await expect(remi).toHaveCount(3);
  await expect(remi.first().locator('h3')).toHaveText('Seara de Remi · 10 octombrie');
  await expect(remi.first().locator('.video-type')).toHaveText('Eveniment');
  await expect(remi.first().locator('video')).toHaveAttribute('src', `${VIDEO_BASE}seara-remi.mp4`);
});

test('the Video tab still shows the site videos when uploaded videos cannot load', async ({ page }) => {
  await mockSupabase(page, { videosFail: true });
  await gotoLoaded(page, '/#videos');

  await expect(page.locator('#videoList .library-video')).toHaveCount(10);
  await expect(page.locator('#videoStatus')).toBeHidden();
});

test('admin uploads an event video with a poster and it goes live in the Video tab', async ({ page }) => {
  const state = await mockSupabase(page, { admin: true });
  await gotoLoaded(page, '/#events');
  await openVideoAdmin(page);

  const form = page.locator('.video-upload-form');
  await form.getByLabel('Fișier video (MP4').setInputFiles(MP4);
  await form.getByLabel('Copertă').setInputFiles(POSTER);
  await form.getByLabel('Categorie').selectOption('ping-pong');
  await form.getByLabel('Tip').selectOption('event');
  await form.getByLabel('Titlu').fill('Turneu Ping-Pong · finala');
  await form.getByLabel('Descriere').fill('Finala primului turneu.');
  await form.getByRole('button', { name: 'Încarcă videoclipul' }).click();

  await expect(form.locator('.admin-form-status')).toHaveText('Videoclipul a fost publicat în tab-ul Video.');
  const uploads = state.calls.filter(call => call.name === 'storage:POST').map(call => call.path);
  expect(uploads).toHaveLength(2);
  expect(uploads[0]).toMatch(/^\/storage\/v1\/object\/players-videos\/[A-Za-z0-9._-]+\.mp4$/);
  expect(uploads[1]).toMatch(/^\/storage\/v1\/object\/players-videos\/[A-Za-z0-9._-]+\.jpg$/);
  const added = state.calls.find(call => call.name === 'players_admin_add_video');
  expect(added.body).toMatchObject({ p_category: 'ping-pong', p_type: 'event', p_title: 'Turneu Ping-Pong · finala', p_description: 'Finala primului turneu.' });
  expect(added.body.p_video_url).toBe(`${VIDEO_BASE}${uploads[0].split('/').pop()}`);
  expect(added.token).toBe('admin-access-token');

  await expect(page.locator('#videoAdminList .video-admin-item')).toContainText('Turneu Ping-Pong · finala');
  await expect(page.locator('#videoList .library-video', { hasText: 'Turneu Ping-Pong · finala' })).toHaveCount(1);
});

test('admin deletes an uploaded video and its files', async ({ page }) => {
  const state = await mockSupabase(page, { admin: true, videos: [videoRow({ poster_url: `${VIDEO_BASE}seara-remi.jpg` })] });
  await gotoLoaded(page, '/#events');
  await openVideoAdmin(page);

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#videoAdminList .video-admin-item', { hasText: 'Seara de Remi' }).getByRole('button', { name: 'Șterge' }).click();

  await expect(page.locator('#videoAdminList .video-admin-item')).toHaveCount(0);
  expect(state.calls.find(call => call.name === 'players_admin_delete_video').body).toEqual({ p_id: 'video-db-1' });
  const deleted = state.calls.filter(call => call.name === 'storage:DELETE').map(call => call.path.split('/').pop());
  expect(deleted.sort()).toEqual(['seara-remi.jpg', 'seara-remi.mp4']);
  await expect(page.locator('#videoList .library-video', { hasText: 'Seara de Remi' })).toHaveCount(0);
});
