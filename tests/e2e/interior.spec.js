// Interior micro-interactions (https://github.com/ddoemonn/interior, MIT): async buttons run once, show
// pending → done, never change size; copy buttons confirm; tab lists work from the keyboard.
const { test, expect } = require('@playwright/test');
const { mockSupabase, gotoLoaded, openDashboardSection } = require('../support/supabase-mock');

const NOW = new Date('2026-10-07T12:00:00');
const slowRoute = (ms, json) => async (route) => { await new Promise((r) => setTimeout(r, ms)); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) }); };

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.route('**/videos/*.mp4', route => route.fulfill({ status: 204, body: '' }));
});

test('signup submits once while pending and the button keeps its size', async ({ page }) => {
  await mockSupabase(page);
  let registerCalls = 0;
  await page.route(/rpc\/players_register/, async (route) => { registerCalls += 1; await slowRoute(700, { token: 't', status: 'registered' })(route); });
  await gotoLoaded(page, '/#events');

  await page.locator('#eventGrid [data-name="Seară de Table"] button.join').click();
  await page.locator('#firstName').fill('Ion');
  await page.locator('#lastName').fill('Rus');
  await page.locator('#email').fill('ion@example.com');
  const submit = page.locator('#signupForm .submit, #formView .submit').first();
  const before = await submit.boundingBox();
  await submit.click();
  await submit.click({ force: true });

  await expect(submit).toHaveAttribute('aria-busy', 'true');
  await expect(submit).toHaveAccessibleName('Se trimite…');
  const during = await submit.boundingBox();
  expect(Math.round(during.width)).toBe(Math.round(before.width));
  expect(Math.round(during.height)).toBe(Math.round(before.height));

  await expect(page.locator('#successView')).toBeVisible();
  expect(registerCalls).toBe(1);
});

test('admin save shows saving, ignores a second click, then confirms', async ({ page }) => {
  await mockSupabase(page, { admin: true });
  let setDayCalls = 0;
  await page.route(/rpc\/players_admin_set_schedule_day/, async (route) => { setDayCalls += 1; await slowRoute(500, {})(route); });
  await gotoLoaded(page, '/#events');
  await page.locator('#adminToggle').click();
  await openDashboardSection(page, 'dashboardProgram');

  const wednesday = page.locator('#dashboardProgram .program-day').nth(2);
  await wednesday.getByLabel('Eveniment', { exact: true }).selectOption('Turneu de Ping-Pong');
  const save = wednesday.locator('button[type="submit"]');
  await save.click();

  await expect(save).toHaveAccessibleName('Se salvează…');
  await expect(save).toHaveAttribute('aria-busy', 'true');
  await save.click({ force: true });

  // The saved day is redrawn with a fresh form: the status confirms, the button is back to its label.
  const saved = page.locator('#dashboardProgram .program-day').nth(2);
  await expect(saved.locator('.admin-form-status')).toHaveText('Ziua a fost salvată.');
  await expect(saved.locator('button[type="submit"]')).toHaveAccessibleName('Salvează ziua');
  await expect(saved.locator('button[type="submit"]')).not.toHaveAttribute('aria-busy', 'true');
  expect(setDayCalls).toBe(1);
});

test('the video list shows placeholder cards while it loads slowly, then the videos', async ({ page }) => {
  await mockSupabase(page);
  await page.route('**/videos/videos.json', async (route) => { await new Promise((r) => setTimeout(r, 900)); await route.continue(); });
  await gotoLoaded(page, '/#videos');

  await expect(page.locator('#videoList .interior-skeleton').first()).toBeVisible();
  await expect(page.locator('#videoList')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#videoList .library-video:not(.interior-skeleton)').first()).toBeVisible({ timeout: 6000 });
  await expect(page.locator('#videoList .interior-skeleton')).toHaveCount(0);
  await expect(page.locator('#videoList')).not.toHaveAttribute('aria-busy', 'true');
});

test('copy confirms on the button itself', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: text => { window.copied = text; return Promise.resolve(); } } });
  });
  await mockSupabase(page);
  await gotoLoaded(page, '/');

  await page.locator('#players-sah .card-promo-button').click();
  const share = page.locator('#promoDialog .share-native');
  await share.click();

  await expect(share).toHaveAccessibleName('Link copiat ✓');
  await expect(page.locator('#promoDialog .share-status')).toHaveText('Link copiat. Îl poți lipi oriunde.');
  await expect(share).toHaveAccessibleName('Distribuie', { timeout: 4000 });
});

test('video tabs work from the keyboard with arrows, Home and End', async ({ page }) => {
  await mockSupabase(page);
  await gotoLoaded(page, '/#videos');

  const tabs = page.locator('#videoTabs [role="tab"]');
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.first()).toHaveAttribute('tabindex', '0');
  await expect(tabs.nth(1)).toHaveAttribute('tabindex', '-1');

  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('End');
  await expect(tabs.last()).toBeFocused();
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Home');
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.last()).toBeFocused();
});

test('state changes still apply with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.resolve() } });
  });
  await mockSupabase(page);
  await gotoLoaded(page, '/');

  await page.locator('#players-sah .card-promo-button').click();
  const share = page.locator('#promoDialog .share-native');
  await share.click();
  await expect(share).toHaveAccessibleName('Link copiat ✓');
  const duration = await share.locator('.interior-face.is-active').evaluate(el => getComputedStyle(el).transitionDuration);
  expect(duration).toBe('0s');
});
