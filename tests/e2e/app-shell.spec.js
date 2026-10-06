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

test('the admin dashboard uses one menu button with its sections on phones', async ({ page }) => {
  test.skip(page.viewportSize().width > 600, 'phone layout');
  await mockSupabase(page, { admin: true });
  await gotoLoaded(page, '/');
  await page.locator('#adminToggle').click();

  const toggle = page.locator('.dashboard-menu-toggle');
  await expect(toggle).toContainText('Prezentare');
  await expect(page.locator('.dashboard-nav')).toBeHidden();
  await toggle.click();
  await page.locator('.dashboard-nav button[data-section="dashboardProgram"]').click();
  await expect(page.locator('#dashboardProgram')).toBeVisible();
  await expect(page.locator('.dashboard-nav')).toBeHidden();
  await expect(toggle).toContainText('Program');
});
