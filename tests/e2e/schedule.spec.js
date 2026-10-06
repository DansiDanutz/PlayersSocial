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

test('days without an event show one of the club logos, different on neighbouring days and stable on reload', async ({ page }) => {
  await mockSupabase(page, { scheduleDays: { '2026-10-06': { linked_card: 'Seară de Șah', image_url: null } } });
  await gotoLoaded(page, '/#program');

  const DEFAULTS = ['/players-sah-logo.jpg', '/players-backgammon-logo.jpg', '/players-ping-pong-logo.jpg', '/players-remi-logo.jpg', '/players-poker-club-logo.jpg'];
  const empty = page.locator('#program .schedule-day.is-empty');
  await expect(empty).toHaveCount(6);
  const sources = await empty.locator('img').evaluateAll(images => images.map(image => image.getAttribute('src')));
  expect(sources).toHaveLength(6);
  sources.forEach(src => expect(DEFAULTS).toContain(src));
  const byDay = await page.locator('#program .schedule-day').evaluateAll(tiles => Object.fromEntries(tiles.map(tile => [tile.querySelector('.schedule-date').textContent, tile.querySelector('img')?.getAttribute('src')])));
  expect(byDay['Miercuri 7 oct.']).not.toBe(byDay['Joi 8 oct.']);
  expect(byDay['Joi 8 oct.']).not.toBe(byDay['Vineri 9 oct.']);
  await expect(empty.first()).toContainText('Fără eveniment');
  expect(await empty.first().locator('img').evaluate(image => getComputedStyle(image).objectFit)).toBe('contain');

  await page.reload();
  await expect(page.locator('#program .schedule-day.is-empty img')).toHaveCount(6);
  expect(await page.locator('#program .schedule-day.is-empty img').evaluateAll(images => images.map(image => image.getAttribute('src')))).toEqual(sources);
});

test('the day card and the event of the week always show the start time, buy-in and guaranteed prize', async ({ page }) => {
  await mockSupabase(page, {
    scheduleDays: { '2026-10-08': { linked_card: 'Seară de Șah', image_url: null, start_time: '18:00:00', buy_in: 10, guaranteed: 500 }, '2026-10-09': { linked_card: 'Seară de Table', image_url: null } },
    scheduleWeeks: { '2026-10-05': { image_url: null, featured_day: '2026-10-08' } },
  });
  await gotoLoaded(page, '/#program');

  const thursday = page.locator('#program .schedule-day').filter({ hasText: 'Joi 8 oct.' });
  await expect(thursday.locator('.schedule-prize')).toHaveText(['Ora 18:00', 'Buy-in 10 lei', 'Garantat 500 lei']);
  await expect(page.locator('#program .schedule-featured .schedule-prize')).toHaveText(['Ora 18:00', 'Buy-in 10 lei', 'Garantat 500 lei']);
  await expect(page.locator('#program .schedule-day').filter({ hasText: 'Vineri 9 oct.' }).locator('.schedule-prize')).toHaveCount(0);
});

test('a buy-in of 0 lei is shown as Free entry', async ({ page }) => {
  await mockSupabase(page, { scheduleDays: { '2026-10-08': { linked_card: 'Seară de Șah', image_url: null, start_time: '18:00:00', buy_in: 0, guaranteed: 500 } } });
  await gotoLoaded(page, '/#program');

  await expect(page.locator('#program .schedule-day').filter({ hasText: 'Joi 8 oct.' }).locator('.schedule-prize')).toHaveText(['Ora 18:00', 'Free entry', 'Garantat 500 lei']);
});

test('the image popup shows the event, day, start time, buy-in and guaranteed prize', async ({ page }) => {
  await mockSupabase(page, {
    scheduleDays: { '2026-10-08': { linked_card: 'Seară de Șah', image_url: null, start_time: '18:00:00', buy_in: 0, guaranteed: 500 } },
    scheduleWeeks: { '2026-10-05': { image_url: null, featured_day: '2026-10-08' } },
  });
  await gotoLoaded(page, '/#program');

  const viewer = page.locator('#imageViewer');
  await page.locator('#program .schedule-day').filter({ hasText: 'Joi 8 oct.' }).getByRole('button', { name: 'Mărește imaginea' }).click();
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('.image-viewer-title')).toHaveText('Seară de Șah · Joi 8 oct.');
  await expect(viewer.locator('.schedule-prize')).toHaveText(['Ora 18:00', 'Free entry', 'Garantat 500 lei']);
  await page.keyboard.press('Escape');

  await page.locator('#program .schedule-featured').getByRole('button', { name: 'Mărește imaginea' }).click();
  await expect(viewer.locator('.schedule-prize')).toHaveText(['Ora 18:00', 'Free entry', 'Garantat 500 lei']);
  await page.keyboard.press('Escape');

  await page.locator('#program .schedule-day').filter({ hasText: 'Vineri 9 oct.' }).getByRole('button', { name: 'Mărește imaginea' }).click();
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('.schedule-prize')).toHaveCount(0);
  await expect(viewer.locator('.image-viewer-info')).toBeHidden();
  await page.keyboard.press('Escape');
});

test('day cards line up on desktop and tablet, become rows on phones, and nothing overflows', async ({ page }) => {
  test.skip(page.viewportSize().width < 600, 'resizes itself through every size');
  await mockSupabase(page, {
    scheduleDays: {
      '2026-10-06': { linked_card: 'Seară de Șah', image_url: null, start_time: '18:00:00', buy_in: 0, guaranteed: 500 },
      '2026-10-08': { linked_card: 'Seară de Șah', image_url: null, buy_in: 0, guaranteed: 500 },
      '2026-10-10': { linked_card: 'Karaoke Club', image_url: null, start_time: '20:00:00', buy_in: 0, guaranteed: 500 },
    },
    scheduleWeeks: { '2026-10-05': { image_url: null, featured_day: '2026-10-06' } },
  });
  const tops = (selector) => page.locator(`#program .schedule-day ${selector}`).evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)));
  const fits = () => page.evaluate(() => {
    const days = document.querySelector('#program .schedule-days').getBoundingClientRect();
    const outside = [...document.querySelectorAll('#program .schedule-day *')].filter(node => { const box = node.getBoundingClientRect(); return box.width && (box.left < days.left - 1 || box.right > days.right + 1); });
    return { pageFits: document.documentElement.scrollWidth <= innerWidth, outside: outside.map(node => node.className || node.tagName) };
  });

  for (const [width, columns] of [[1280, 7], [1200, 7], [1060, 4], [768, 4]]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoLoaded(page, `/?width=${width}#program`);
    const dateTops = await tops('.schedule-date'), imageTops = await tops('.image-zoom');
    const firstRow = (values) => values.slice(0, columns);
    expect(new Set(firstRow(dateTops)).size, `dates aligned at ${width}px`).toBe(1);
    expect(new Set(firstRow(imageTops)).size, `images aligned at ${width}px`).toBe(1);
    expect(await fits(), `fits at ${width}px`).toEqual({ pageFits: true, outside: [] });
    const cut = await page.locator('#program .schedule-day .schedule-prize, #program .schedule-day .schedule-date').evaluateAll(nodes => nodes.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent));
    expect(cut, `no truncated text at ${width}px`).toEqual([]);
  }

  const info = page.locator('#program .schedule-day').filter({ hasText: 'Sâmbătă 10 oct.' }).locator('.schedule-prize');
  await expect(info).toHaveText(['Ora 20:00', 'Free entry', 'Garantat 500 lei']);
  expect(await info.evaluateAll(nodes => nodes.map(node => getComputedStyle(node, '::before').content))).toEqual(['"⏰"', '"🎟"', '"🏆"']);

  await page.setViewportSize({ width: 375, height: 812 });
  await gotoLoaded(page, '/?width=375#program');
  const rows = await page.locator('#program .schedule-day').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { left: Math.round(box.left), width: Math.round(box.width) }; }));
  expect(new Set(rows.map(row => row.left)).size, 'one card per row on phones').toBe(1);
  expect(await fits(), 'fits at 375px').toEqual({ pageFits: true, outside: [] });
});

test('the big event cards show their next programme day with time, entry and guaranteed prize', async ({ page }) => {
  await mockSupabase(page, {
    scheduleDays: {
      '2026-10-06': { linked_card: 'Seară de Șah', image_url: null, start_time: '18:00:00', buy_in: 0, guaranteed: 500 },
      '2026-10-08': { linked_card: 'Seară de Șah', image_url: null, start_time: '18:00:00', buy_in: 0, guaranteed: 500 },
      '2026-10-10': { linked_card: 'Karaoke Club', image_url: null, start_time: '20:00:00', buy_in: 0, guaranteed: 500 },
      '2026-10-12': { linked_card: 'Remi & Prieteni', image_url: null, start_time: '19:00:00', buy_in: 20, guaranteed: null },
    },
  });
  await gotoLoaded(page, '/#events');

  const card = (name) => page.locator(`#eventGrid .event[data-name="${name}"]`);
  await expect(card('Seară de Șah').locator('.card-next-day')).toHaveText('Mâine · Joi 8 oct.');
  await expect(card('Seară de Șah').locator('.card-next .schedule-prize')).toHaveText(['Ora 18:00', 'Free entry', 'Garantat 500 lei']);
  await expect(card('Karaoke Club').locator('.card-next-day')).toHaveText('Sâmbătă 10 oct.');
  await expect(card('Karaoke Club').locator('.card-next .schedule-prize')).toHaveText(['Ora 20:00', 'Free entry', 'Garantat 500 lei']);
  await expect(card('Remi & Prieteni').locator('.card-next-day')).toHaveText('Luni 12 oct.');
  await expect(card('Remi & Prieteni').locator('.card-next .schedule-prize')).toHaveText(['Ora 19:00', 'Buy-in 20 lei']);
  await expect(card('Seară de Table').locator('.card-next')).toHaveCount(0);
  // A card that is in the programme no longer says "În curând"; one that is not keeps saying it.
  await expect(card('Seară de Șah').locator('.coming-soon-banner')).toBeHidden();
  await expect(card('Seară de Șah').locator('.event-date')).toBeHidden();
  await expect(card('Seară de Table').locator('.coming-soon-banner')).toBeVisible();
  await expect(card('Seară de Table').locator('.event-date')).toBeVisible();
  const fits = await card('Seară de Șah').evaluate(node => { const box = node.getBoundingClientRect(); return [...node.querySelectorAll('.card-next *')].every(child => { const inner = child.getBoundingClientRect(); return inner.left >= box.left - 1 && inner.right <= box.right + 1; }); });
  expect(fits).toBe(true);
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
    expect(state.calls.find(call => call.name === 'players_admin_set_schedule_day').body).toEqual({ p_day: '2026-10-08', p_linked_card: 'Remi & Prieteni', p_image_url: `${SCHEDULE_BASE}${upload.path.split('/').pop()}`, p_start_time: null, p_buy_in: null, p_guaranteed: null });
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

  test('admin sets the start time, buy-in and guaranteed prize of a day', async ({ page }) => {
    const state = await mockSupabase(page, { admin: true });
    await gotoLoaded(page, '/#events');
    await openProgram(page);

    const tuesday = page.locator('#dashboardProgram .program-day').nth(1);
    await tuesday.getByLabel('Eveniment', { exact: true }).selectOption('Seară de Șah');
    await tuesday.getByLabel('Ora de început').fill('18:00');
    await tuesday.getByLabel('Buy-in (lei)').fill('10');
    await tuesday.getByLabel('Garantat (lei)').fill('500');
    await tuesday.getByRole('button', { name: 'Salvează ziua' }).click();

    await expect(page.locator('#dashboardProgram .program-day').nth(1).locator('.admin-form-status')).toHaveText('Ziua a fost salvată.');
    expect(state.calls.find(call => call.name === 'players_admin_set_schedule_day').body).toEqual({ p_day: '2026-10-06', p_linked_card: 'Seară de Șah', p_image_url: null, p_start_time: '18:00', p_buy_in: 10, p_guaranteed: 500 });
    const saved = page.locator('#dashboardProgram .program-day').nth(1);
    await expect(saved.getByLabel('Ora de început')).toHaveValue('18:00');
    await expect(saved.getByLabel('Buy-in (lei)')).toHaveValue('10');
    await expect(saved.getByLabel('Garantat (lei)')).toHaveValue('500');
    await expect(page.locator('#program .schedule-day').filter({ hasText: 'Marți 6 oct.' }).locator('.schedule-prize')).toHaveText(['Ora 18:00', 'Buy-in 10 lei', 'Garantat 500 lei']);
  });

  test('the buy-in and guaranteed prize must be whole amounts in lei', async ({ page }) => {
    const state = await mockSupabase(page, { admin: true });
    await gotoLoaded(page, '/#events');
    await openProgram(page);

    const tuesday = page.locator('#dashboardProgram .program-day').nth(1);
    await tuesday.getByLabel('Eveniment', { exact: true }).selectOption('Seară de Șah');
    await tuesday.getByLabel('Buy-in (lei)').fill('-5');
    await tuesday.getByRole('button', { name: 'Salvează ziua' }).click();

    await expect(tuesday.locator('.admin-form-status')).toHaveText('Buy-in-ul și garantatul trebuie să fie sume întregi în lei (0 sau mai mult).');
    expect(state.calls.some(call => call.name === 'players_admin_set_schedule_day')).toBe(false);
  });

  test('every event has its own default banner, preselected as soon as it is chosen in admin', async ({ page }) => {
    await mockSupabase(page, { admin: true });
    await gotoLoaded(page, '/#events');
    await openProgram(page);

    const BANNERS = {
      'Seară de Șah': 'seara-de-sah', 'Seară de Table': 'table', 'Turneu de Ping-Pong': 'ping-pong', 'Karaoke Club': 'karaoke', 'Stand-up Open Mic': 'stand-up',
      'Remi & Prieteni': 'remi', 'Campionat de FIFA': 'fifa', 'Seară Champions League': 'champions', 'Team Building': 'team-building', 'Evenimente Caritabile': 'caritabile',
    };
    const options = await page.locator('#dashboardProgram .program-day').first().locator('select option').evaluateAll(list => list.map(option => option.value).filter(Boolean));
    expect(options.sort()).toEqual(Object.keys(BANNERS).sort());
    const day = page.locator('#dashboardProgram .program-day').nth(2);
    for (const [card, file] of Object.entries(BANNERS)) {
      await day.getByLabel('Eveniment', { exact: true }).selectOption(card);
      await expect(day.locator('.program-day-preview'), card).toHaveAttribute('src', `/program/${file}.jpg`);
      expect((await page.request.get(`/program/${file}.jpg`)).ok(), file).toBe(true);
    }
  });

  test('the day form previews the default banner for the chosen event and can go back to it from a custom one', async ({ page }) => {
    const state = await mockSupabase(page, { admin: true, scheduleDays: { '2026-10-08': { linked_card: 'Seară de Șah', image_url: `${SCHEDULE_BASE}special.jpg`, start_time: '18:00:00', buy_in: 10, guaranteed: 500 } } });
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
    expect(state.calls.find(call => call.name === 'players_admin_set_schedule_day').body).toEqual({ p_day: '2026-10-08', p_linked_card: 'Seară de Șah', p_image_url: null, p_start_time: '18:00', p_buy_in: 10, p_guaranteed: 500 });
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
