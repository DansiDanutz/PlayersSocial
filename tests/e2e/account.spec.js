const { test, expect } = require('@playwright/test');
const { mockSupabase, gotoLoaded, ADMIN_EMAIL, USER_TOKEN } = require('../support/supabase-mock');

test('visitors always see the account button and can continue with Google', async ({ page }) => {
  await mockSupabase(page);
  let authorizeUrl = null;
  await page.route('**/auth/v1/authorize**', route => { authorizeUrl = new URL(route.request().url()); return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>google</p>' }); });
  await gotoLoaded(page, '/#events');

  const account = page.locator('#adminLogin');
  await expect(account).toHaveText('Intră în cont');
  await expect(page.locator('#adminToggle')).toBeHidden();
  await account.click();
  await expect(page.locator('#authDialog h2')).toHaveText('Intră în cont');
  await page.getByRole('button', { name: 'Continuă cu Google' }).click();

  await expect.poll(() => authorizeUrl && authorizeUrl.searchParams.get('provider')).toBe('google');
  expect(authorizeUrl.searchParams.get('redirect_to')).toBe('http://127.0.0.1:4173/');
});

test('any email can ask for a sign-in link', async ({ page }) => {
  const state = await mockSupabase(page);
  await gotoLoaded(page, '/#events');

  await page.locator('#adminLogin').click();
  await page.locator('#adminEmail').fill('Ana.Pop@Example.com');
  await page.getByRole('button', { name: 'Trimite linkul de autentificare' }).click();

  await expect(page.locator('#authMessage')).toContainText('Link trimis');
  expect(state.calls.find(call => call.name === 'otp').body).toEqual({ email: 'ana.pop@example.com', create_user: true });
});

test('returning from Google signs a regular member in without admin access', async ({ page }) => {
  await mockSupabase(page);
  const loaded = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/players_public_events'));
  await page.goto(`/#access_token=${USER_TOKEN}&refresh_token=refresh&token_type=bearer&expires_in=3600`);
  await loaded;

  await expect(page.locator('#adminLogin')).toHaveText('Ieșire');
  await expect(page.locator('#accountName')).toHaveText('Ana Maria Pop');
  await expect(page.locator('#adminToggle')).toBeHidden();
  await expect(page).toHaveURL(/#events$/);
});

test('a signed-in member registers with their name and email filled in', async ({ page }) => {
  const state = await mockSupabase(page, { user: true });
  await gotoLoaded(page, '/#events');
  await expect(page.locator('#accountName')).toHaveText('Ana Maria Pop');

  await page.locator('#players-remi button.join').click();
  await expect(page.locator('#firstName')).toHaveValue('Ana Maria');
  await expect(page.locator('#lastName')).toHaveValue('Pop');
  await expect(page.locator('#email')).toHaveValue('ana.pop@example.com');
  await page.locator('#signupForm .submit').click();

  await expect(page.locator('#successMessage')).toContainText('Ești înscris la Remi & Prieteni');
  expect(state.calls.find(call => call.name === 'players_register').body).toMatchObject({ p_event_name: 'Remi & Prieteni', p_first_name: 'Ana Maria', p_last_name: 'Pop', p_email: 'ana.pop@example.com' });
});

test('an admin who signs in gets the admin button', async ({ page }) => {
  await mockSupabase(page, { admin: true });
  await gotoLoaded(page, '/#events');

  await expect(page.locator('#adminLogin')).toHaveText('Ieșire');
  await expect(page.locator('#accountName')).toHaveText('David Admin');
  await expect(page.locator('#adminToggle')).toBeVisible();
});

test('signing out clears the session', async ({ page }) => {
  await mockSupabase(page);
  await page.goto(`/#access_token=${USER_TOKEN}&refresh_token=refresh&token_type=bearer`);
  await expect(page.locator('#adminLogin')).toHaveText('Ieșire');

  await page.locator('#adminLogin').click();
  await expect(page.locator('#adminLogin')).toHaveText('Intră în cont');
  expect(await page.evaluate(() => localStorage.getItem('players-admin-session'))).toBeNull();
});

test.describe('admin management', () => {
  async function openAdmins(page) {
    await page.locator('#adminToggle').click();
    await page.locator('.dashboard-nav button[data-section="dashboardAdmins"]').click();
    await expect(page.locator('#dashboardAdmins')).toBeVisible();
  }

  test('lists admins and adds a new one by email', async ({ page }) => {
    const state = await mockSupabase(page, { admin: true });
    await gotoLoaded(page, '/#events');
    await openAdmins(page);

    const list = page.locator('#adminList .admin-member');
    await expect(list).toHaveCount(2);
    await expect(list.filter({ hasText: ADMIN_EMAIL }).getByRole('button', { name: 'Elimină' })).toHaveCount(0);

    const form = page.locator('.admin-add-form');
    await form.getByLabel('Email nou administrator').fill('  Maria@Example.com ');
    await form.getByRole('button', { name: 'Adaugă administrator' }).click();

    await expect(form.locator('.admin-form-status')).toHaveText('maria@example.com este acum administrator.');
    await expect(list).toHaveCount(3);
    expect(state.calls.find(call => call.name === 'players_admin_add_admin').body).toEqual({ p_email: 'maria@example.com' });
  });

  test('shows the server error for an invalid email', async ({ page }) => {
    await mockSupabase(page, { admin: true });
    await gotoLoaded(page, '/#events');
    await openAdmins(page);

    const form = page.locator('.admin-add-form');
    await form.getByLabel('Email nou administrator').fill('nu-e-email');
    await form.getByRole('button', { name: 'Adaugă administrator' }).click();
    await expect(form.locator('.admin-form-status')).toHaveText('Adresă de email invalidă');
  });

  test('removes another admin after confirmation', async ({ page }) => {
    const state = await mockSupabase(page, { admin: true });
    await gotoLoaded(page, '/#events');
    await openAdmins(page);

    page.once('dialog', dialog => dialog.accept());
    await page.locator('#adminList .admin-member', { hasText: 'toma.alinflorin@yahoo.com' }).getByRole('button', { name: 'Elimină' }).click();

    await expect(page.locator('#adminList .admin-member')).toHaveCount(1);
    expect(state.calls.find(call => call.name === 'players_admin_remove_admin').body).toEqual({ p_email: 'toma.alinflorin@yahoo.com' });
  });
});
