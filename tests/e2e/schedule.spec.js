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
  const tuesday = days.filter({ hasText: 'Marți 6 oct.' }), friday = days.filter({ hasText: 'Vineri 9 oct.' });
  await expect(tuesday.locator('.schedule-event')).toHaveText('Seară de Șah');
  await expect(tuesday.locator('img')).toHaveAttribute('src', `${SCHEDULE_BASE}sah.jpg`);
  await expect(tuesday.locator('a')).toHaveAttribute('href', '#players-sah');
  await expect(days.filter({ hasText: 'Luni 5 oct.' })).toHaveClass(/is-empty/);
  await expect(friday).toHaveClass(/is-featured/);
  await expect(section.locator('.schedule-featured')).toContainText('Evenimentul săptămânii');
  await expect(section.locator('.schedule-featured')).toContainText('Karaoke Club');
  await expect(section.locator('.schedule-featured')).toContainText('Vineri 9 oct.');
  // The whole-week image is no longer shown: the programme is laid out day by day.
  await expect(section.locator(`img[src="${SCHEDULE_BASE}saptamana.jpg"]`)).toHaveCount(0);
});

test('the day cards start with today and tomorrow, marked Azi and Mâine, and today glows with the neon ring', async ({ page }) => {
  await mockSupabase(page, {
    scheduleDays: { '2026-10-06': { linked_card: 'Seară de Șah', image_url: null }, '2026-10-07': { linked_card: 'Karaoke Club', image_url: null }, '2026-10-08': { linked_card: 'Seară de Șah', image_url: null } },
  });
  await gotoLoaded(page, '/#program');

  const days = page.locator('#program .schedule-day');
  await expect(days.locator('.schedule-date')).toHaveText(['Miercuri 7 oct.', 'Joi 8 oct.', 'Vineri 9 oct.', 'Sâmbătă 10 oct.', 'Duminică 11 oct.', 'Luni 5 oct.', 'Marți 6 oct.']);
  await expect(days.nth(0).locator('.schedule-when')).toHaveText('Azi');
  await expect(days.nth(1).locator('.schedule-when')).toHaveText('Mâine');
  await expect(page.locator('#program .schedule-when')).toHaveCount(2);
  await expect(days.nth(0)).toHaveClass(/is-today/);
  await expect(days.nth(0).locator('.schedule-event')).toHaveText('Karaoke Club');
  await expect(days.nth(5)).toHaveClass(/is-past/);
  await expect(days.nth(6)).toHaveClass(/is-past/);
  await expect(days.nth(2)).not.toHaveClass(/is-past|is-today/);
  const ring = await days.nth(0).evaluate(tile => { const style = getComputedStyle(tile, '::before'); return { image: style.backgroundImage, animation: style.animationName }; });
  expect(ring.image).toContain('conic-gradient');
  expect(ring.animation).toBe('promoNeonSpin');
});

test('on Sunday only today is marked, since tomorrow belongs to next week', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-11T12:00:00'));
  await mockSupabase(page, { scheduleDays: { '2026-10-11': { linked_card: 'Seară de Șah', image_url: null } } });
  await gotoLoaded(page, '/#program');

  const days = page.locator('#program .schedule-day');
  await expect(days.first().locator('.schedule-date')).toHaveText('Duminică 11 oct.');
  await expect(page.locator('#program .schedule-when')).toHaveText(['Azi']);
});

test('a Seară de Șah day without its own image shows the default chess banner; an uploaded banner replaces it', async ({ page }) => {
  await mockSupabase(page, {
    scheduleDays: { '2026-10-06': { linked_card: 'Seară de Șah', image_url: null }, '2026-10-08': { linked_card: 'Seară de Șah', image_url: `${SCHEDULE_BASE}special.jpg` } },
  });
  await gotoLoaded(page, '/#program');

  const days = page.locator('#program .schedule-day');
  await expect(days.filter({ hasText: 'Marți 6 oct.' }).locator('img')).toHaveAttribute('src', '/program/seara-de-sah.jpg');
  await expect(days.filter({ hasText: 'Joi 8 oct.' }).locator('img')).toHaveAttribute('src', `${SCHEDULE_BASE}special.jpg`);
  expect((await page.request.get('/program/seara-de-sah.jpg')).ok()).toBe(true);
});

test('Remi, Table and Ping-Pong days without their own image show their default banners', async ({ page }) => {
  await mockSupabase(page, {
    scheduleDays: {
      '2026-10-05': { linked_card: 'Remi & Prieteni', image_url: null },
      '2026-10-09': { linked_card: 'Seară de Table', image_url: null },
      '2026-10-10': { linked_card: 'Turneu de Ping-Pong', image_url: null },
    },
  });
  await gotoLoaded(page, '/#program');

  const days = page.locator('#program .schedule-day');
  const expected = { 'Luni 5 oct.': '/program/remi.jpg', 'Vineri 9 oct.': '/program/table.jpg', 'Sâmbătă 10 oct.': '/program/ping-pong.jpg' };
  for (const [day, src] of Object.entries(expected)) {
    await expect(days.filter({ hasText: day }).locator('img')).toHaveAttribute('src', src);
    expect((await page.request.get(src)).ok(), src).toBe(true);
  }
});

test('clicking a programme image opens it large in a popup', async ({ page }) => {
  await mockSupabase(page, {
    scheduleDays: { '2026-10-08': { linked_card: 'Seară de Șah', image_url: `${SCHEDULE_BASE}special.jpg` } },
    scheduleWeeks: { '2026-10-05': { image_url: `${SCHEDULE_BASE}saptamana.jpg`, featured_day: '2026-10-08' } },
  });
  await gotoLoaded(page, '/#program');

  const viewer = page.locator('#imageViewer');
  await page.locator('#program .schedule-day').filter({ hasText: 'Joi 8 oct.' }).getByRole('button', { name: 'Mărește imaginea' }).click();
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('img')).toHaveAttribute('src', `${SCHEDULE_BASE}special.jpg`);
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();

  await page.locator('#program .schedule-featured').getByRole('button', { name: 'Mărește imaginea' }).click();
  await expect(viewer).toBeVisible();
  await viewer.getByRole('button', { name: 'Închide' }).click();
  await expect(viewer).toBeHidden();

  await expect(page.locator('#program .schedule-day').filter({ hasText: 'Joi 8 oct.' }).getByRole('link')).toHaveAttribute('href', '#players-sah');
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
    await expect(page.locator('#program .schedule-day').filter({ hasText: 'Joi 8 oct.' }).locator('.schedule-event')).toHaveText('Remi & Prieteni');
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
    await expect(page.locator('#program .schedule-day').filter({ hasText: 'Sâmbătă 10 oct.' })).toHaveClass(/is-featured/);
  });

  test('the day form previews the default banner for the chosen event and can go back to it from a custom one', async ({ page }) => {
    const state = await mockSupabase(page, { admin: true, scheduleDays: { '2026-10-08': { linked_card: 'Seară de Șah', image_url: `${SCHEDULE_BASE}special.jpg` } } });
    await gotoLoaded(page, '/#events');
    await openProgram(page);

    const tuesday = page.locator('#dashboardProgram .program-day').nth(1);
    await tuesday.getByLabel('Eveniment', { exact: true }).selectOption('Seară de Șah');
    await expect(tuesday.locator('.program-day-preview')).toHaveAttribute('src', '/program/seara-de-sah.jpg');
    await expect(tuesday.locator('.program-banner-note')).toContainText('Banner implicit');

    const thursday = page.locator('#dashboardProgram .program-day').nth(3);
    await expect(thursday.locator('.program-day-preview')).toHaveAttribute('src', `${SCHEDULE_BASE}special.jpg`);
    await expect(thursday.locator('.program-banner-note')).toContainText('Banner personalizat');
    await thursday.getByRole('button', { name: 'Folosește bannerul implicit' }).click();

    await expect(thursday.locator('.admin-form-status')).toHaveText('Ziua folosește bannerul implicit.');
    expect(state.calls.find(call => call.name === 'players_admin_set_schedule_day').body).toEqual({ p_day: '2026-10-08', p_linked_card: 'Seară de Șah', p_image_url: null });
    expect(state.calls.some(call => call.name === 'storage:DELETE' && call.path.endsWith('/special.jpg'))).toBe(true);
    await expect(page.locator('#dashboardProgram .program-day').nth(3).locator('.program-day-preview')).toHaveAttribute('src', '/program/seara-de-sah.jpg');
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

test('on phones every day fits on one line and the Azi chip stays readable on the featured card', async ({ page }) => {
  test.skip(page.viewportSize().width > 600, 'phone layout');
  await page.clock.setFixedTime(new Date('2026-10-06T12:00:00'));
  await mockSupabase(page, {
    scheduleDays: { '2026-10-06': { linked_card: 'Seară de Șah', image_url: null } },
    scheduleWeeks: { '2026-10-05': { image_url: null, featured_day: '2026-10-06' } },
  });
  await gotoLoaded(page, '/#program');

  for (const date of await page.locator('#program .schedule-date').all()) {
    const lines = await date.evaluate(node => Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight || '16')));
    expect(lines, await date.textContent()).toBeLessThanOrEqual(1);
  }
  const chip = page.locator('#program .schedule-day.is-today .schedule-when');
  expect(await chip.evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(255, 255, 255)');
});
