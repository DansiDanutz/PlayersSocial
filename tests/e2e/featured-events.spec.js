const { test, expect } = require('@playwright/test');
const { mockSupabase, featuredRow } = require('../support/supabase-mock');

const NOW = new Date('2026-10-01T12:00:00');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test('promotes an upcoming featured event with its linked card styling and link', async ({ page }) => {
  await mockSupabase(page, { events: [featuredRow({ event_name: 'Turneu de Remi', event_date: '2026-10-10', joined_count: 5 })] });
  await page.goto('/#events');

  const card = page.locator('#featuredEvents .event-featured', { hasText: 'Turneu de Remi' });
  await expect(card).toBeVisible();
  await expect(card.locator('.event-date')).toContainText('10 octombrie 2026 · ora 18:00');
  await expect(card.locator('.icon-glyph')).toHaveText('🃏');
  await expect(card.locator('.whatsapp-group-link')).toHaveCount(1);
  await expect(page.locator('#eventGrid [data-name="Remi & Prieteni"] .card-featured-link')).toContainText('Turneu de Remi');
  await expect(page.locator('#eventHistory')).toBeHidden();
});

test('keeps an event promoted until 24 hours after it starts', async ({ page }) => {
  await mockSupabase(page, { events: [featuredRow({ event_name: 'Turneu Aseara', event_date: '2026-09-30', start_time: '18:00:00' })] });
  await page.goto('/#events');

  await expect(page.locator('#featuredEvents .event-featured', { hasText: 'Turneu Aseara' })).toBeVisible();
  await expect(page.locator('#eventHistory')).toBeHidden();
});

test('moves an ended event to history with final attendance and recap', async ({ page }) => {
  await mockSupabase(page, { events: [featuredRow({ event_name: 'Turneu de Șah', event_date: '2026-09-26', start_time: '09:30:00', joined_count: 7, final_participants: 12, public_recap: 'Felicitări câștigătorilor!' })] });
  await page.goto('/#events');

  await expect(page.locator('#featuredEvents .event-featured', { hasText: 'Turneu de Șah' })).toBeHidden();
  const history = page.locator('#eventHistoryList .history-card');
  await expect(history).toContainText('Turneu de Șah încheiat');
  await expect(history).toContainText('12 participanți. Felicitări câștigătorilor!');
  await expect(page.locator('.card-featured-link')).toHaveCount(0);
});

test('falls back to registrations and the default message in history', async ({ page }) => {
  await mockSupabase(page, { events: [featuredRow({ event_name: 'Turneu Vechi', event_date: '2026-09-20', joined_count: 20 })] });
  await page.goto('/#events');

  await expect(page.locator('#eventHistoryList')).toContainText('20 de participanți. Te așteptăm la următorul!');
});

test('does not show hidden events to visitors', async ({ page }) => {
  await mockSupabase(page, { events: [featuredRow({ event_name: 'Eveniment Ascuns', event_date: '2026-10-10', is_hidden: true })] });
  await page.goto('/#events');

  await expect(page.locator('#featuredEvents .event-featured')).toHaveCount(0);
  await expect(page.getByText('Eveniment Ascuns')).toHaveCount(0);
});

test('uses Romanian plural forms for participant counts', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/');

  const labels = await page.evaluate(() => [1, 7, 19, 20, 101, 120].map(participantsLabel));
  expect(labels).toEqual(['1 participant', '7 participanți', '19 participanți', '20 de participanți', '101 participanți', '120 de participanți']);
});
