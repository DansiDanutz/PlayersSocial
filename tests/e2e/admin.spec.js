const path = require('path');
const { test, expect } = require('@playwright/test');
const { mockSupabase, featuredRow, gotoLoaded, ADMIN_TOKEN } = require('../support/supabase-mock');

const BANNER = path.join(__dirname, '..', '..', 'dist', 'poster-remi.webp');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-01T12:00:00'));
});

async function openFeaturedAdmin(page) {
  await page.locator('#adminToggle').click();
  await expect(page.locator('#adminDashboard')).toBeVisible();
}

test('expired magic link explains what to do', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid');

  await expect(page.locator('#authDialog')).toBeVisible();
  await expect(page.locator('#authMessage')).toContainText('Linkul a expirat');
  await expect(page).toHaveURL(/#events$/);
});

test('email link logs the admin in only after confirming', async ({ page }) => {
  const state = await mockSupabase(page);
  await page.goto('/#token_hash=valid-hash&type=magiclink');

  await expect(page.locator('#authConfirm')).toBeVisible();
  expect(state.calls.some(call => call.name === 'verify')).toBe(false);
  await page.locator('#authConfirm').click();

  await expect(page.locator('#adminLogin')).toHaveText('Ieșire');
  expect(state.calls.find(call => call.name === 'verify').body).toEqual({ type: 'email', token_hash: 'valid-hash' });
});

test('admin creates a featured event with a banner', async ({ page }) => {
  const state = await mockSupabase(page, { admin: true });
  await gotoLoaded(page, '/#events');
  await openFeaturedAdmin(page);

  await page.getByRole('button', { name: '+ Creează eveniment' }).click();
  const form = page.locator('.create-event-form');
  await form.getByLabel('Card asociat').selectOption('Remi & Prieteni');
  await form.getByLabel('Numele evenimentului').fill('Turneu de Remi');
  await form.getByLabel('Data').fill('2026-10-10');
  await form.getByLabel('Ora de început').fill('18:00');
  await form.getByLabel('Locuri').fill('24');
  await form.getByLabel('Descriere').fill('Turneu de remi pe echipe, premii pentru primele trei locuri.');
  await form.locator('input[name="banner"]').setInputFiles(BANNER);
  await expect(form.locator('.banner-preview')).toHaveAttribute('src', /^blob:/);
  await form.getByRole('button', { name: 'Publică evenimentul' }).click();

  await expect(page.locator('#featuredUpcoming')).toContainText('Turneu de Remi');
  await expect(page.locator('#featuredUpcoming .featured-admin[open] .admin-form-status')).toHaveText('Evenimentul a fost publicat.');
  expect(state.calls.some(call => call.name === 'storage:POST')).toBe(true);
  const create = state.calls.find(call => call.name === 'players_admin_create_event');
  expect(create.token).toBe(ADMIN_TOKEN);
  expect(create.body).toMatchObject({ p_event_name: 'Turneu de Remi', p_linked_card: 'Remi & Prieteni', p_event_date: '2026-10-10', p_start_time: '18:00', p_target: 24 });
  expect(create.body.p_banner_url).toMatch(/\/storage\/v1\/object\/public\/players-event-banners\/\d+-[0-9a-f]{8}\.webp$/);
  await page.locator('.dashboard-close').click();
  await expect(page.locator('#featuredEvents .event-featured', { hasText: 'Turneu de Remi' })).toBeVisible();
});

test('admin records attendance, recap and notes for an ended event', async ({ page }) => {
  const state = await mockSupabase(page, { admin: true, events: [featuredRow({ event_name: 'Turneu de Șah', event_date: '2026-09-26', joined_count: 7 })] });
  await gotoLoaded(page, '/#events');
  await openFeaturedAdmin(page);

  await page.locator('#featuredEnded summary', { hasText: 'Turneu de Șah' }).click();
  const form = page.locator('#featuredEnded form');
  await form.getByLabel('Participanți reali').fill('12');
  await form.getByLabel('Mesaj public în istoric').fill('Felicitări câștigătorilor!');
  await form.getByLabel('Notițe interne (vizibile doar adminilor)').fill('Sala mare, 2 arbitri.');
  await form.getByRole('button', { name: 'Salvează' }).click();

  await expect(page.locator('#featuredEnded .admin-form-status')).toHaveText('Modificările au fost salvate.');
  const update = state.calls.find(call => call.name === 'players_admin_update_featured_event');
  expect(update.body).toMatchObject({ p_event_name: 'Turneu de Șah', p_final_participants: 12, p_public_recap: 'Felicitări câștigătorilor!', p_admin_notes: 'Sala mare, 2 arbitri.', p_is_hidden: false });
  await expect(page.locator('#eventHistoryList')).toContainText('12 participanți. Felicitări câștigătorilor!');
});

test('admin exports registrants as CSV with formula injection neutralised', async ({ page }) => {
  await mockSupabase(page, { admin: true, events: [featuredRow({ event_name: 'Turneu de Șah', event_date: '2026-09-26' })], registrants: [{ first_name: '=HYPERLINK("x")', last_name: 'Pop', email: 'ana@example.com', confirmation_status: 'accepted', created_at: '2026-09-20T10:00:00Z', public_display_consent: true }] });
  await gotoLoaded(page, '/#events');
  await openFeaturedAdmin(page);
  await page.locator('#featuredEnded summary', { hasText: 'Turneu de Șah' }).click();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descarcă CSV' }).click()]);
  const csv = (await (await download.createReadStream()).toArray()).join('');
  expect(download.suggestedFilename()).toBe('inscrisi-turneu-de-sah.csv');
  expect(csv).toContain('"\'=HYPERLINK(""x"")"');
  expect(csv).toContain('"Confirmat"');
  await expect(page.locator('#featuredEnded .registrants-admin')).toContainText('ana@example.com');
});
