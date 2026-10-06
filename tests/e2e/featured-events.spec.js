const { test, expect } = require('@playwright/test');
const { mockSupabase, featuredRow, gotoLoaded } = require('../support/supabase-mock');

const NOW = new Date('2026-10-01T12:00:00');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test('promotes an upcoming featured event with its linked card styling and link', async ({ page }) => {
  await mockSupabase(page, { events: [featuredRow({ event_name: 'Turneu de Remi', event_date: '2026-10-10', joined_count: 5 })] });
  await gotoLoaded(page, '/#events');

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
  await gotoLoaded(page, '/#events');

  await expect(page.locator('#featuredEvents .event-featured', { hasText: 'Turneu Aseara' })).toBeVisible();
  await expect(page.locator('#eventHistory')).toBeHidden();
});

test('moves an ended event to history with final attendance and recap', async ({ page }) => {
  await mockSupabase(page, { events: [featuredRow({ event_name: 'Turneu de Șah', event_date: '2026-09-26', start_time: '09:30:00', joined_count: 7, final_participants: 12, public_recap: 'Felicitări câștigătorilor!' })] });
  await gotoLoaded(page, '/#events');

  await expect(page.locator('#featuredEvents .event-featured', { hasText: 'Turneu de Șah' })).toBeHidden();
  const history = page.locator('#eventHistoryList .history-card');
  await expect(history).toContainText('Turneu de Șah încheiat');
  await expect(history).toContainText('12 participanți. Felicitări câștigătorilor!');
  await expect(page.locator('.card-featured-link')).toHaveCount(0);
});

test('falls back to registrations and the default message in history', async ({ page }) => {
  await mockSupabase(page, { events: [featuredRow({ event_name: 'Turneu Vechi', event_date: '2026-09-20', joined_count: 20 })] });
  await gotoLoaded(page, '/#events');

  await expect(page.locator('#eventHistoryList')).toContainText('20 de participanți. Te așteptăm la următorul!');
});

test('does not show hidden events to visitors', async ({ page }) => {
  await mockSupabase(page, { events: [featuredRow({ event_name: 'Eveniment Ascuns', event_date: '2026-10-10', is_hidden: true })] });
  await gotoLoaded(page, '/#events');

  await expect(page.locator('#featuredEvents .event-featured')).toHaveCount(0);
  await expect(page.getByText('Eveniment Ascuns')).toHaveCount(0);
});

test('uses Romanian plural forms for participant counts', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/');

  const labels = await page.evaluate(() => [1, 7, 19, 20, 101, 120].map(participantsLabel));
  expect(labels).toEqual(['1 participant', '7 participanți', '19 participanți', '20 de participanți', '101 participanți', '120 de participanți']);
});

test('featured event shares a link with its own preview page on WhatsApp', async ({ page }) => {
  await mockSupabase(page, { events: [featuredRow({ event_name: 'Turneu de Remi', event_date: '2026-10-10' })] });
  await gotoLoaded(page, '/#events');

  const whatsapp = page.locator('#eveniment-turneu-de-remi .share-whatsapp');
  const href = new URL(await whatsapp.getAttribute('href'));
  expect(href.origin + href.pathname).toBe('https://wa.me/');
  expect(href.searchParams.get('text')).toBe('Turneu de Remi · sâmbătă, 10 octombrie 2026 · ora 18:00 — Players Club http://127.0.0.1:4173/e/turneu-de-remi');
  await expect(whatsapp).toHaveAttribute('target', '_blank');
});

test('featured event Distribuie opens the phone share sheet', async ({ page }) => {
  await page.addInitScript(() => { navigator.share = data => { window.sharedData = data; return Promise.resolve(); }; });
  await mockSupabase(page, { events: [featuredRow({ event_name: 'Turneu de Remi', event_date: '2026-10-10' })] });
  await gotoLoaded(page, '/#events');

  await page.locator('#eveniment-turneu-de-remi .share-native').click();
  await expect.poll(() => page.evaluate(() => window.sharedData)).toEqual({ title: 'Turneu de Remi', text: 'Turneu de Remi · sâmbătă, 10 octombrie 2026 · ora 18:00 — Players Club', url: 'http://127.0.0.1:4173/e/turneu-de-remi' });
});

test('featured event Distribuie copies the link without a share sheet', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: text => { window.copied = text; return Promise.resolve(); } } });
  });
  await mockSupabase(page, { events: [featuredRow({ event_name: 'Turneu de Remi', event_date: '2026-10-10' })] });
  await gotoLoaded(page, '/#events');

  await page.locator('#eveniment-turneu-de-remi .share-native').click();
  await expect(page.locator('#eveniment-turneu-de-remi .share-status')).toHaveText('Link copiat. Îl poți lipi oriunde.');
  expect(await page.evaluate(() => window.copied)).toBe('http://127.0.0.1:4173/e/turneu-de-remi');
});

test('home page announces a link preview image', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://playersclub.live/og-image.jpg');
  const image = await page.request.get('/og-image.jpg');
  expect(image.ok()).toBe(true);
});

test('event history sits right above the videos as a swiper with arrows', async ({ page }) => {
  const ended = ['2026-09-10', '2026-09-12', '2026-09-14', '2026-09-16', '2026-09-18'].map((date, index) => featuredRow({ event_name: `Turneu ${index + 1}`, event_date: date, joined_count: 10 }));
  await mockSupabase(page, { events: ended });
  await gotoLoaded(page, '/#events');

  const history = page.locator('#eventHistory');
  await expect(history.locator('.history-card')).toHaveCount(5);
  const order = await page.evaluate(() => [...document.querySelectorAll('#eventGrid, #eventHistory, #videos')].map(node => node.id));
  expect(order).toEqual(['eventGrid', 'eventHistory', 'videos']);

  const list = page.locator('#eventHistoryList');
  const layout = await list.evaluate(node => ({ overflowX: getComputedStyle(node).overflowX, snap: getComputedStyle(node).scrollSnapType, scrollable: node.scrollWidth > node.clientWidth }));
  expect(layout.overflowX).toBe('auto');
  expect(layout.snap).toContain('x');
  expect(layout.scrollable).toBe(true);
  const first = await history.locator('.history-card').first().boundingBox();
  const second = await history.locator('.history-card').nth(1).boundingBox();
  expect(second.x).toBeGreaterThan(first.x + first.width);
  expect(second.y).toBeLessThan(first.y + first.height);

  await history.getByRole('button', { name: 'Următorul eveniment' }).click();
  await expect.poll(() => list.evaluate(node => node.scrollLeft)).toBeGreaterThan(50);
  await history.getByRole('button', { name: 'Evenimentul anterior' }).click();
  await expect.poll(() => list.evaluate(node => node.scrollLeft)).toBeLessThan(5);
});
