const { test, expect } = require('@playwright/test');
const { mockSupabase, gotoLoaded } = require('../support/supabase-mock');

test.beforeEach(async ({ page }) => {
  await page.route('**/videos/*.mp4', route => route.fulfill({ status: 204, body: '' }));
});

test('the header has only the logo, a green Login button and one menu button', async ({ page }) => {
  await mockSupabase(page);
  await gotoLoaded(page, '/');

  const login = page.locator('#adminLogin');
  await expect(login).toHaveText('Login');
  await expect(login).toBeVisible();
  const background = await login.evaluate(element => getComputedStyle(element).backgroundColor);
  const [red, green, blue] = background.match(/\d+/g).map(Number);
  expect(green).toBeGreaterThan(red + 40);
  expect(green).toBeGreaterThan(blue + 40);
  await expect(page.locator('#menuToggle')).toBeVisible();
  await expect(page.locator('#installApp')).toBeHidden();
  await expect(page.locator('header a:not(.brand)')).toHaveCount(0);
  for (const selector of ['#adminLogin', '#menuToggle']) {
    const box = await page.locator(selector).boundingBox();
    expect(box.height, selector).toBeGreaterThanOrEqual(40);
    expect(box.height, selector).toBeLessThanOrEqual(52);
  }
});

test('the menu opens submenus that take you to videos by category', async ({ page }) => {
  await mockSupabase(page);
  await gotoLoaded(page, '/');

  await page.locator('#menuToggle').click();
  const menu = page.locator('#siteMenu');
  await expect(menu).toBeVisible();
  await menu.getByText('Video', { exact: true }).click();
  await menu.getByRole('button', { name: 'Remi' }).click();

  await expect(menu).toBeHidden();
  await expect(page.locator('#videoTabs [aria-selected="true"]')).toHaveText('Remi');
  await expect(page.locator('#videos')).toBeInViewport();
});

test('the menu filters events by category', async ({ page }) => {
  await mockSupabase(page);
  await gotoLoaded(page, '/');

  await page.locator('#menuToggle').click();
  await page.locator('#siteMenu').getByText('Evenimente', { exact: true }).click();
  await page.locator('#siteMenu').getByRole('button', { name: 'Mișcare' }).click();

  await expect(page.locator('.filter[data-filter="active"]')).toHaveClass(/active/);
  await expect(page.locator('#eventGrid [data-name="Turneu de Ping-Pong"]')).toBeVisible();
  await expect(page.locator('#eventGrid [data-name="Seară de Șah"]')).toBeHidden();
});

test('after login the Login button gives way to Install App, which installs where the browser allows', async ({ page }) => {
  await mockSupabase(page, { user: true });
  await gotoLoaded(page, '/');

  await expect(page.locator('#adminLogin')).toBeHidden();
  const install = page.locator('#installApp');
  await expect(install).toBeVisible();
  await expect(install).toHaveText('Install App');

  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt');
    event.prompt = () => { window.installPrompted = true; return Promise.resolve(); };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
  });
  await install.click();
  await expect.poll(() => page.evaluate(() => window.installPrompted)).toBe(true);
});

test('Install App shows the steps on devices that cannot install automatically (iPhone)', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }));
  await mockSupabase(page, { user: true });
  await gotoLoaded(page, '/');

  await page.locator('#installApp').click();
  const help = page.locator('#installHelp');
  await expect(help).toBeVisible();
  await expect(help).toContainText('Adaugă pe ecranul principal');
});

test('the account section of the menu signs out', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/#access_token=user-access-token&refresh_token=refresh&token_type=bearer');
  await expect(page.locator('#installApp')).toBeVisible();

  await page.locator('#menuToggle').click();
  await expect(page.locator('#menuAccount')).toContainText('Ana Maria Pop');
  await page.locator('#menuLogout').click();

  await expect(page.locator('#adminLogin')).toHaveText('Login');
  await expect(page.locator('#adminLogin')).toBeVisible();
});

test('the site is an installable app: manifest, icons and service worker', async ({ page }) => {
  await mockSupabase(page);
  await gotoLoaded(page, '/');

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await page.request.get(manifestHref)).json();
  expect(manifest).toMatchObject({ name: 'Players Club', display: 'standalone', start_url: '/?source=app' });
  expect(manifest.icons.map(icon => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png');
  expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).active.scriptURL)).toMatch(/\/sw\.js$/);
});

test('on phones the admin dashboard is an app: compact header, 2×2 KPIs and a bottom tab bar', async ({ page }) => {
  test.skip(page.viewportSize().width > 600, 'phone layout');
  await mockSupabase(page, { admin: true });
  await gotoLoaded(page, '/');
  await page.locator('#adminToggle').click();

  const viewport = page.viewportSize();
  const nav = page.locator('.dashboard-nav');
  await expect(nav).toBeVisible();
  const bar = await nav.boundingBox();
  expect(Math.round(bar.y + bar.height)).toBeGreaterThanOrEqual(viewport.height - 2);
  expect(bar.width).toBeLessThanOrEqual(viewport.width);
  const tabs = nav.locator('button[data-section]');
  await expect(tabs).toHaveCount(6);
  for (const tab of await tabs.all()) {
    const box = await tab.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  }
  await expect(page.locator('.dashboard-menu-toggle')).toHaveCount(0);

  const title = page.locator('.dashboard-current-title');
  await expect(title).toHaveText('Prezentare');
  const header = await page.locator('.dashboard-topbar').boundingBox();
  expect(header.height).toBeLessThanOrEqual(72);
  const kpis = await page.locator('.dashboard-kpi').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)));
  expect(kpis[0]).toBe(kpis[1]);
  expect(kpis[2]).toBe(kpis[3]);

  await tabs.filter({ hasText: 'Program' }).click();
  await expect(page.locator('#dashboardProgram')).toBeVisible();
  await expect(title).toHaveText('Program');
  await expect(tabs.filter({ hasText: 'Program' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#dashboardProgramTitle')).toBeHidden();
  await expect(page.locator('#dashboardProgram .program-week-nav')).toBeVisible();
  const padding = await page.locator('.dashboard-main').evaluate(node => parseFloat(getComputedStyle(node).paddingBottom));
  expect(padding).toBeGreaterThanOrEqual(bar.height);
  expect(await page.evaluate(() => document.querySelector('#adminDashboard').scrollWidth <= innerWidth)).toBe(true);
});

const SAMSUNG = 'Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const useAgent = (page, agent) => page.addInitScript(value => Object.defineProperty(navigator, 'userAgent', { get: () => value }), agent);

test('Samsung Internet gets steps for its own menu and can copy the link for Chrome', async ({ page }) => {
  await useAgent(page, SAMSUNG);
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: text => { window.copied = text; return Promise.resolve(); } } }));
  await mockSupabase(page, { user: true });
  await gotoLoaded(page, '/');

  await page.locator('#installApp').click();
  const help = page.locator('#installHelp');
  await expect(help).toBeVisible();
  const steps = help.locator('.install-steps[data-platform="samsung"]');
  await expect(steps).toBeVisible();
  await expect(steps).toContainText('⋮');
  await expect(steps).toContainText('Adăugați pagina la');
  await expect(steps).toContainText('Ecran de pornire');
  await expect(help.locator('.install-steps[data-platform="other"]')).toBeHidden();
  await expect(help.locator('.install-browser')).toHaveText('Browser detectat: Samsung Internet 28');
  await expect(help.locator('a[href^="intent:"]')).toHaveCount(0);

  await help.getByRole('button', { name: 'Copiază linkul pentru Chrome' }).click();
  await expect(help.locator('.install-copy-status')).toHaveText('Link copiat. Deschide Chrome, lipește-l în bara de adrese și apasă Install App.');
  expect(await page.evaluate(() => window.copied)).toBe('http://127.0.0.1:4173/');
});

test('on Android Chrome a tap that comes before Chrome is ready waits for the install prompt', async ({ page }) => {
  await useAgent(page, ANDROID_CHROME);
  await mockSupabase(page, { user: true });
  await gotoLoaded(page, '/');

  await page.locator('#installApp').click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt');
    event.prompt = () => { window.installPrompted = true; return Promise.resolve(); };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
  });
  await expect.poll(() => page.evaluate(() => window.installPrompted)).toBe(true);
  await expect(page.locator('#installHelp')).toBeHidden();
});

test('on Android Chrome without a prompt the Chrome steps are shown', async ({ page }) => {
  await useAgent(page, ANDROID_CHROME);
  await mockSupabase(page, { user: true });
  await gotoLoaded(page, '/');

  await page.locator('#installApp').click();
  const help = page.locator('#installHelp');
  await expect(help).toBeVisible({ timeout: 8000 });
  await expect(help.locator('.install-steps[data-platform="android"]')).toBeVisible();
  await expect(help.locator('.install-steps[data-platform="android"]')).toContainText('Instalează aplicația');
});

test('when the app is already installed the button says so', async ({ page }) => {
  await useAgent(page, ANDROID_CHROME);
  await page.addInitScript(() => { navigator.getInstalledRelatedApps = () => Promise.resolve([{ platform: 'webapp', url: 'https://playersclub.live/manifest.webmanifest' }]); });
  await mockSupabase(page, { user: true });
  await gotoLoaded(page, '/');

  await page.locator('#installApp').click();
  await expect(page.locator('#installHelp .install-installed')).toBeVisible();
  await expect(page.locator('#installHelp .install-installed')).toContainText('Aplicația este deja instalată');
});

test('the admin overview shows today\'s programme and quick actions to the main tools', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-06T12:00:00'));
  await mockSupabase(page, { admin: true, scheduleTemplate: { 2: { linked_card: 'Seară de Șah', start_time: '18:00:00' } } });
  await gotoLoaded(page, '/');
  await page.locator('#adminToggle').click();

  const today = page.locator('.dashboard-today');
  await expect(today).toBeVisible();
  await expect(today.locator('.dashboard-today-day')).toHaveText('Astăzi · Marți 6 oct.');
  await expect(today.locator('.dashboard-today-event')).toHaveText('Seară de Șah');
  await expect(today.locator('.schedule-prize')).toHaveText(['Ora 18:00', 'Free entry', 'Garantat 500 lei', 'Min. 10 jucători']);

  await today.getByRole('button', { name: 'Programul implicit' }).click();
  await expect(page.locator('#dashboardProgram')).toBeVisible();
  await expect(page.locator('#dashboardProgram .program-template')).toHaveAttribute('open', '');
  await expect(page.locator('.dashboard-today')).toBeHidden();

  await page.locator('.dashboard-nav button[data-section="dashboardKpis"]').click();
  await today.getByRole('button', { name: 'Încarcă un video' }).click();
  await expect(page.locator('#dashboardVideos')).toBeVisible();
  await page.locator('.dashboard-nav button[data-section="dashboardKpis"]').click();
  await today.getByRole('button', { name: 'Creează eveniment' }).click();
  await expect(page.locator('#dashboardFeatured')).toBeVisible();
  await expect(page.locator('#createEventPanel')).toBeVisible();
});

test('on desktop the dashboard header names the current section and the sidebar has icons', async ({ page }) => {
  test.skip(page.viewportSize().width < 760, 'desktop layout');
  await mockSupabase(page, { admin: true });
  await gotoLoaded(page, '/');
  await page.locator('#adminToggle').click();

  await page.locator('.dashboard-nav button[data-section="dashboardProgram"]').click();
  await expect(page.locator('.dashboard-current-title')).toHaveText('Program');
  await expect(page.locator('.dashboard-current-title')).toBeVisible();
  await expect(page.getByText('Dashboard evenimente')).toBeHidden();
  await expect(page.locator('#dashboardProgramTitle')).toBeHidden();
  const icon = await page.locator('.dashboard-nav button[data-section="dashboardProgram"]').evaluate(node => getComputedStyle(node, '::before').content);
  expect(icon).toBe('"📅"');
  const fileButton = await page.locator('#videoFile').evaluate(node => { const style = getComputedStyle(node, '::file-selector-button'); return { radius: parseFloat(style.borderTopLeftRadius), weight: style.fontWeight }; });
  expect(fileButton.radius).toBeGreaterThanOrEqual(8);
  expect(Number(fileButton.weight)).toBeGreaterThanOrEqual(700);
});
