// Staff page /dealers-payout: dealer tips split and deposit rules, printable, with a PDF download.
const { test, expect } = require('@playwright/test');

const PAGE_URL = '/dealers-payout/';

test('shows the tips grid and deposit rules in Romanian', async ({ page }) => {
  await page.goto(PAGE_URL);

  await expect(page).toHaveTitle(/Regulament Dealeri/);
  await expect(page.locator('h1').first()).toContainText('Cum se împarte');
  await expect(page.locator('table').first().locator('tbody tr')).toHaveCount(5);
  await expect(page.getByText('Pierzi tot depozitul')).toBeVisible();
});

test('is hidden from search engines', async ({ page }) => {
  await page.goto(PAGE_URL);

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('offers a PDF download that exists', async ({ page, request }) => {
  await page.goto(PAGE_URL);

  const link = page.getByRole('link', { name: /Descarcă PDF/ });
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  const response = await request.get(new URL(href, page.url()).toString());

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('pdf');
});

test('has no horizontal scroll', async ({ page }) => {
  await page.goto(PAGE_URL);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('explains the guaranteed minimum and loyalty bonuses', async ({ page }) => {
  await page.goto(PAGE_URL);

  await expect(page.getByRole('heading', { name: /Venit minim garantat: 5.000 RON/ })).toBeVisible();
  await expect(page.getByText(/3 luni slabe la rând/)).toBeVisible();
  await expect(page.getByText('Bonus 4.000 RON')).toBeVisible();
  await expect(page.getByText('Bonus 8.000 RON')).toBeVisible();
});
