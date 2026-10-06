const { test, expect } = require('@playwright/test');
const { mockSupabase, gotoLoaded, VIDEO_BASE, openDashboardSection } = require('../support/supabase-mock');

const MB = 1024 * 1024;

test.beforeEach(async ({ page }) => {
  await page.route('**/videos/*.mp4', route => route.fulfill({ status: 204, body: '' }));
});

test.describe('compression plan', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await gotoLoaded(page, '/#events');
    await page.waitForFunction(() => window.PlayersVideoCompressor);
  });

  test('only re-encodes videos that are not MP4 or are over 50 MB', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { needsCompression } = window.PlayersVideoCompressor;
      const file = (type, size) => ({ type, size });
      return [needsCompression(file('video/mp4', 49 * 1024 * 1024)), needsCompression(file('video/mp4', 51 * 1024 * 1024)), needsCompression(file('video/quicktime', 5 * 1024 * 1024))];
    });
    expect(result).toEqual([false, true, true]);
  });

  test('keeps 1080p for a one-minute video and sizes the bitrate to ~45 MB', async ({ page }) => {
    const plan = await page.evaluate(() => window.PlayersVideoCompressor.planCompression({ duration: 60, width: 1920, height: 1080 }));
    expect(plan).toMatchObject({ tooLong: false, width: 1920, height: 1080 });
    const totalMb = ((plan.videoBitrate + 128000) * 60) / 8 / MB;
    expect(totalMb).toBeGreaterThan(40);
    expect(totalMb).toBeLessThanOrEqual(45);
  });

  test('drops a long portrait phone video to 720p and keeps its orientation', async ({ page }) => {
    const plan = await page.evaluate(() => window.PlayersVideoCompressor.planCompression({ duration: 300, width: 1080, height: 1920 }));
    expect(plan).toMatchObject({ tooLong: false, width: 720, height: 1280 });
    expect(plan.videoBitrate).toBeGreaterThan(1000000);
  });

  test('refuses videos too long to fit even at low quality', async ({ page }) => {
    const plan = await page.evaluate(() => window.PlayersVideoCompressor.planCompression({ duration: 20 * 60, width: 1920, height: 1080 }));
    expect(plan).toEqual({ tooLong: true, maxMinutes: 10 });
  });
});

test.describe('admin upload with compression', () => {
  async function openVideoAdmin(page) {
    await page.locator('#adminToggle').click();
    await openDashboardSection(page, 'dashboardVideos');
    await expect(page.locator('#dashboardVideos')).toBeVisible();
  }

  test('compresses an iPhone MOV to MP4 before uploading it', async ({ page }) => {
    const state = await mockSupabase(page, { admin: true });
    await gotoLoaded(page, '/#events');
    await page.waitForFunction(() => window.PlayersVideoCompressor);
    await page.evaluate(() => {
      window.PlayersVideoCompressor.compress = async (file, { onProgress }) => {
        window.compressedName = file.name;
        onProgress(0.5); onProgress(1);
        return new File([new Uint8Array(2048)], 'seara.mp4', { type: 'video/mp4' });
      };
    });
    await openVideoAdmin(page);

    const form = page.locator('.video-upload-form');
    await form.getByLabel('Fișier video (MP4').setInputFiles({ name: 'seara.mov', mimeType: 'video/quicktime', buffer: Buffer.alloc(4096) });
    await form.getByLabel('Titlu').fill('Seara de table');
    await form.getByRole('button', { name: 'Încarcă videoclipul' }).click();

    await expect(form.locator('.admin-form-status')).toHaveText('Videoclipul a fost publicat în tab-ul Video.');
    expect(await page.evaluate(() => window.compressedName)).toBe('seara.mov');
    const upload = state.calls.find(call => call.name === 'storage:POST');
    expect(upload.path).toMatch(/\.mp4$/);
    expect(state.calls.find(call => call.name === 'players_admin_add_video').body.p_video_url).toBe(`${VIDEO_BASE}${upload.path.split('/').pop()}`);
  });

  test('explains when the browser cannot compress and uploads nothing', async ({ page }) => {
    const state = await mockSupabase(page, { admin: true });
    await gotoLoaded(page, '/#events');
    await page.waitForFunction(() => window.PlayersVideoCompressor);
    await page.evaluate(() => {
      window.PlayersVideoCompressor.compress = async () => { throw new Error('Browserul nu poate comprima video. Folosește Chrome sau Edge pe calculator.'); };
    });
    await openVideoAdmin(page);

    const form = page.locator('.video-upload-form');
    await form.getByLabel('Fișier video (MP4').setInputFiles({ name: 'seara.mov', mimeType: 'video/quicktime', buffer: Buffer.alloc(4096) });
    await form.getByLabel('Titlu').fill('Seara de table');
    await form.getByRole('button', { name: 'Încarcă videoclipul' }).click();

    await expect(form.locator('.admin-form-status')).toHaveText('Browserul nu poate comprima video. Folosește Chrome sau Edge pe calculator.');
    expect(state.calls.some(call => call.name.startsWith('storage:'))).toBe(false);
  });

  test('rejects files that are not videos', async ({ page }) => {
    const state = await mockSupabase(page, { admin: true });
    await gotoLoaded(page, '/#events');
    await openVideoAdmin(page);

    const form = page.locator('.video-upload-form');
    await form.getByLabel('Fișier video (MP4').setInputFiles({ name: 'notite.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
    await form.getByLabel('Titlu').fill('Fișier greșit');
    await form.getByRole('button', { name: 'Încarcă videoclipul' }).click();

    await expect(form.locator('.admin-form-status')).toHaveText('Alege un fișier video (MP4 sau MOV).');
    expect(state.calls.some(call => call.name.startsWith('storage:'))).toBe(false);
  });
});
