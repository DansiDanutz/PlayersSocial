const { test, expect } = require('@playwright/test');
const { mockSupabase, gotoLoaded, SCHEDULE_BASE, openDashboardSection } = require('../support/supabase-mock');

// Wednesday 7 October 2026: the current week runs Monday 5 – Sunday 11 October.
const NOW = new Date('2026-10-07T12:00:00');
const IMAGE = { name: 'seara.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake jpg bytes') };

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.route('**/videos/*.mp4', route => route.fulfill({ status: 204, body: '' }));
});

test('the site shows this week’s programme with the event of the week highlighted', async ({ page }) => {
  await mockSupabase(page, {
    scheduleDays: { '2026-10-06': { linked_card: 'Seară de Șah', image_url: `${SCHEDULE_BASE}sah.jpg` }, '2026-10-09': { linked_card: 'Karaoke Club', image_url: null } },
    scheduleWeeks: { '2026-10-05': { image_url: `${SCHEDULE_BASE}saptamana.jpg`, featured_day: '2026-10-09' } },
  });
  await gotoLoaded(page, '/#program');

  const section = page.locator('#program');
  await expect(section).toBeVisible();
  await expect(section.locator('.schedule-range')).toHaveText('5 – 11 octombrie 2026');
  const days = section.locator('.schedule-day');
  await expect(days).toHaveCount(7);
  await expect(days.locator('.schedule-date')).toHaveText(['Luni 5 oct.', 'Marți 6 oct.', 'Miercuri 7 oct.', 'Joi 8 oct.', 'Vineri 9 oct.', 'Sâmbătă 10 oct.', 'Duminică 11 oct.']);
  await expect(days.nth(1).locator('.schedule-event')).toHaveText('Seară de Șah');
  await expect(days.nth(1).locator('img')).toHaveAttribute('src', `${SCHEDULE_BASE}sah.jpg`);
  await expect(days.nth(1).locator('a')).toHaveAttribute('href', '#players-sah');
  await expect(days.nth(0)).toHaveClass(/is-empty/);
  await expect(days.nth(4)).toHaveClass(/is-featured/);
  await expect(section.locator('.schedule-featured')).toContainText('Evenimentul săptămânii');
  await expect(section.locator('.schedule-featured')).toContainText('Karaoke Club');
  await expect(section.locator('.schedule-featured')).toContainText('Vineri 9 oct.');
  await expect(section.locator('.schedule-week-image img')).toHaveAttribute('src', `${SCHEDULE_BASE}saptamana.jpg`);
});

test('the programme stays hidden when the week has nothing planned', async ({ page }) => {
  await mockSupabase(page);
  await gotoLoaded(page, '/#events');
  await expect(page.locator('#program')).toBeHidden();
});

test.describe('admin Program tab', () => {
  async function openProgram(page) {
    await page.locator('#adminToggle').click();
    await openDashboardSection(page, 'dashboardProgram');
    await expect(page.locator('#dashboardProgram')).toBeVisible();
  }

  test('shows every day of the week with its date and moves between weeks', async ({ page }) => {
    await mockSupabase(page, { admin: true });
    await gotoLoaded(page, '/#events');
    await openProgram(page);

    const program = page.locator('#dashboardProgram');
    await expect(program.locator('.program-week-label')).toHaveText('5 – 11 octombrie 2026');
    await expect(program.locator('.program-day h4')).toHaveText(['Luni 5 oct.', 'Marți 6 oct.', 'Miercuri 7 oct.', 'Joi 8 oct.', 'Vineri 9 oct.', 'Sâmbătă 10 oct.', 'Duminică 11 oct.']);
    await program.getByRole('button', { name: 'Săptămâna următoare' }).click();
    await expect(program.locator('.program-week-label')).toHaveText('12 – 18 octombrie 2026');
    await expect(program.locator('.program-day h4').first()).toHaveText('Luni 12 oct.');
  });

  test('admin plans a day with an event and an image', async ({ page }) => {
    const state = await mockSupabase(page, { admin: true });
    await gotoLoaded(page, '/#events');
    await openProgram(page);

    const thursday = page.locator('#dashboardProgram .program-day').nth(3);
    await thursday.getByLabel('Eveniment', { exact: true }).selectOption('Remi & Prieteni');
    await thursday.getByLabel('Imagine').setInputFiles(IMAGE);
    await thursday.getByRole('button', { name: 'Salvează ziua' }).click();

    await expect(thursday.locator('.admin-form-status')).toHaveText('Ziua a fost salvată.');
    const upload = state.calls.find(call => call.name === 'storage:POST');
    expect(upload.path).toMatch(/^\/storage\/v1\/object\/players-schedule\/[A-Za-z0-9._-]+\.jpg$/);
    expect(state.calls.find(call => call.name === 'players_admin_set_schedule_day').body).toEqual({ p_day: '2026-10-08', p_linked_card: 'Remi & Prieteni', p_image_url: `${SCHEDULE_BASE}${upload.path.split('/').pop()}` });
    await expect(page.locator('#program .schedule-day').nth(3).locator('.schedule-event')).toHaveText('Remi & Prieteni');
  });

  test('admin picks the event of the week among the planned days', async ({ page }) => {
    const state = await mockSupabase(page, { admin: true, scheduleDays: { '2026-10-10': { linked_card: 'Campionat de FIFA', image_url: null } } });
    await gotoLoaded(page, '/#events');
    await openProgram(page);

    const program = page.locator('#dashboardProgram');
    await expect(program.locator('.program-day').nth(0).getByLabel('Evenimentul săptămânii')).toBeDisabled();
    await program.locator('.program-day').nth(5).getByLabel('Evenimentul săptămânii').check();

    await expect(program.locator('.program-week-status')).toHaveText('Evenimentul săptămânii: Campionat de FIFA, Sâmbătă 10 oct.');
    expect(state.calls.find(call => call.name === 'players_admin_set_schedule_week').body).toEqual({ p_week_start: '2026-10-05', p_image_url: null, p_featured_day: '2026-10-10' });
    await expect(page.locator('#program .schedule-day').nth(5)).toHaveClass(/is-featured/);
  });

  test('admin adds an image with the whole week’s programme', async ({ page }) => {
    const state = await mockSupabase(page, { admin: true });
    await gotoLoaded(page, '/#events');
    await openProgram(page);

    const week = page.locator('#dashboardProgram .program-week-form');
    await week.getByLabel('Imaginea programului săptămânii').setInputFiles(IMAGE);
    await week.getByRole('button', { name: 'Salvează imaginea' }).click();

    await expect(week.locator('.admin-form-status')).toHaveText('Imaginea săptămânii a fost salvată.');
    const upload = state.calls.find(call => call.name === 'storage:POST');
    expect(state.calls.find(call => call.name === 'players_admin_set_schedule_week').body).toEqual({ p_week_start: '2026-10-05', p_image_url: `${SCHEDULE_BASE}${upload.path.split('/').pop()}`, p_featured_day: null });
    await expect(page.locator('#program .schedule-week-image img')).toHaveAttribute('src', `${SCHEDULE_BASE}${upload.path.split('/').pop()}`);
  });

  test('admin clears a day and its image is deleted', async ({ page }) => {
    const state = await mockSupabase(page, { admin: true, scheduleDays: { '2026-10-06': { linked_card: 'Seară de Șah', image_url: `${SCHEDULE_BASE}sah.jpg` } } });
    await gotoLoaded(page, '/#events');
    await openProgram(page);

    const tuesday = page.locator('#dashboardProgram .program-day').nth(1);
    await expect(tuesday.getByLabel('Eveniment', { exact: true })).toHaveValue('Seară de Șah');
    await tuesday.getByRole('button', { name: 'Golește' }).click();

    await expect(tuesday.getByLabel('Eveniment', { exact: true })).toHaveValue('');
    expect(state.calls.find(call => call.name === 'players_admin_clear_schedule_day').body).toEqual({ p_day: '2026-10-06' });
    expect(state.calls.filter(call => call.name === 'storage:DELETE').map(call => call.path.split('/').pop())).toEqual(['sah.jpg']);
  });
});

test('the logo always takes you back to the home page', async ({ page }) => {
  await mockSupabase(page);
  await gotoLoaded(page, '/#videos');

  await page.locator('header .brand').click();
  await expect(page).toHaveURL('http://127.0.0.1:4173/');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
