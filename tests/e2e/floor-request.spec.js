// Account type choice: dealers sign and get their card at once; floor managers send a request that the
// super admin approves from the emailed /aprobare/ link.
const { test, expect } = require('@playwright/test');
const { mockStaff } = require('../support/staff-mock');
const { USER } = require('../support/supabase-mock');

const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
const pendingApproval = () => ({ [TOKEN]: { full_name: 'Maria Ionescu', email: 'maria@example.com', created_at: '2026-11-21T10:00:00Z', status: 'pending' } });

test('choosing floor manager hides the signature and sends an access request', async ({ page }) => {
  const { staff } = await mockStaff(page, { user: true });
  await page.goto('/dealers-payout/#semnare');

  await page.getByLabel('Șef de sală').check();
  await expect(page.locator('#semnare canvas')).toBeHidden();
  await expect(page.locator('#semnare h4')).toHaveText('Cerere acces șef de sală');
  await page.locator('#semnare input[name="fullName"]').fill('Maria   Ionescu');
  await page.getByRole('button', { name: 'Trimite cererea de acces' }).click();

  await expect(page.locator('.sign-status')).toContainText('Cererea a fost trimisă');
  await expect(page.getByRole('button', { name: 'Trimite cererea de acces' })).toBeDisabled();
  expect(staff.floorRequests).toHaveLength(1);
  expect(staff.floorRequests[0].body).toEqual({ fullName: 'Maria Ionescu' });
  expect(staff.floorRequests[0].authorization).toMatch(/^Bearer .+/);
  expect(staff.calls.some(call => call.name === 'players_dealer_sign')).toBe(false);
});

test('switching back to dealer shows the signature again and signs as before', async ({ page }) => {
  await mockStaff(page, { user: true });
  await page.goto('/dealers-payout/#semnare');

  await page.getByLabel('Șef de sală').check();
  await page.getByLabel('Dealer', { exact: true }).check();

  await expect(page.locator('#semnare canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Semnez și îmi creez cardul' })).toBeEnabled();
  const box = await page.locator('#semnare canvas').boundingBox();
  expect(box.width).toBeGreaterThan(100);
});

test('a pending request is shown when the person comes back', async ({ page }) => {
  await mockStaff(page, { user: true, request: { status: 'pending', full_name: 'Maria Ionescu', created_at: '2026-11-21T10:00:00Z' } });
  await page.goto('/dealers-payout/#semnare');

  await expect(page.getByLabel('Șef de sală')).toBeChecked();
  await expect(page.locator('.sign-status')).toHaveText('Cererea ta a fost trimisă și așteaptă aprobarea.');
});

test('the request error from the server is shown', async ({ page }) => {
  await mockStaff(page, { user: true, floorRequestError: 'Ai trimis prea multe cereri azi. Încearcă mâine.' });
  await page.goto('/dealers-payout/#semnare');

  await page.getByLabel('Șef de sală').check();
  await page.locator('#semnare input[name="fullName"]').fill('Maria Ionescu');
  await page.getByRole('button', { name: 'Trimite cererea de acces' }).click();

  await expect(page.locator('.sign-status')).toHaveText('Ai trimis prea multe cereri azi. Încearcă mâine.');
});

test('an account without access asks for it from the floor manager page', async ({ page }) => {
  const { staff } = await mockStaff(page, { user: true });
  await page.goto('/sef-de-sala/');

  await expect(page.getByRole('heading', { name: 'Acces doar pentru șefii de sală' })).toBeVisible();
  await expect(page.getByLabel('Nume și prenume')).toHaveValue(USER.user_metadata.full_name);
  await page.getByLabel('Nume și prenume').fill('Maria Ionescu');
  await page.getByRole('button', { name: 'Cere acces de șef de sală' }).click();

  await expect(page.getByText(/Cererea ta \(Maria Ionescu\) a fost trimisă/)).toBeVisible();
  expect(staff.floorRequests[0].body.fullName).toBe('Maria Ionescu');
});

test('the super admin approves a request from the email link', async ({ page }) => {
  const { staff } = await mockStaff(page, { approvals: pendingApproval() });
  await page.goto(`/aprobare/#t=${TOKEN}`);

  await expect(page.getByText('Maria Ionescu')).toBeVisible();
  await expect(page.getByText('maria@example.com', { exact: false })).toBeVisible();
  expect(staff.calls.some(call => call.name === 'players_floor_request_decide')).toBe(false);
  await page.getByRole('button', { name: 'Aprobă' }).click();

  await expect(page.locator('.chip.approved')).toHaveText('Aprobat');
  expect(staff.calls.find(call => call.name === 'players_floor_request_decide').body).toEqual({ p_token: TOKEN, p_approve: true });
  expect(staff.managers).toContain('maria@example.com');
});

test('the super admin can reject a request', async ({ page }) => {
  const { staff } = await mockStaff(page, { approvals: pendingApproval() });
  await page.goto(`/aprobare/#t=${TOKEN}`);

  await page.getByRole('button', { name: 'Respinge' }).click();

  await expect(page.locator('.chip.rejected')).toHaveText('Respins');
  expect(staff.managers).not.toContain('maria@example.com');
});

test('an already decided or unknown link cannot be used again', async ({ page }) => {
  const approvals = pendingApproval();
  approvals[TOKEN].status = 'approved';
  await mockStaff(page, { approvals });
  await page.goto(`/aprobare/#t=${TOKEN}`);
  await expect(page.locator('.chip.approved')).toHaveText('Aprobat');
  await expect(page.getByRole('button', { name: 'Aprobă' })).toHaveCount(0);

  await page.goto('/aprobare/#t=wrong');
  await page.reload();
  await expect(page.getByText('Linkul nu este valid.')).toBeVisible();
});

test('one account can be floor manager and dealer: a manager still signs and gets a dealer card', async ({ page }) => {
  const { staff } = await mockStaff(page, { user: true, managers: [USER.email] });
  await page.goto('/dealers-payout/#semnare');

  await expect(page.getByLabel('Șef de sală')).toBeChecked();
  await expect(page.locator('.sign-status')).toHaveText('Ai deja acces de șef de sală.');
  await page.getByLabel('Dealer', { exact: true }).check();
  await page.locator('#semnare input[name="fullName"]').fill('Ion Popescu');
  const box = await page.locator('#semnare canvas').boundingBox();
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 5, { steps: 5 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Semnez și îmi creez cardul' }).click();

  await expect(page).toHaveURL(/\/dealer\/$/);
  expect(staff.calls.some(call => call.name === 'players_dealer_sign')).toBe(true);
  expect(staff.floorRequests).toHaveLength(0);
});

test('the admin sees pending requests in the panel and approves one there', async ({ page }) => {
  const { staff } = await mockStaff(page, { admin: true, adminRequests: [{ id: 'r1', full_name: 'Maria Ionescu', email: 'maria@example.com', created_at: '2026-11-21T10:00:00Z', expires_at: '2026-11-28T10:00:00Z', status: 'pending' }] });
  await page.goto('/sef-de-sala/');

  await expect(page.getByRole('tab', { name: /Șefi de sală/ }).locator('.count')).toHaveText('1');
  await page.getByRole('tab', { name: /Șefi de sală/ }).click();
  await page.getByRole('button', { name: 'Aprobă Maria Ionescu' }).click();

  await expect(page.getByText('Nicio cerere în așteptare.')).toBeVisible();
  await expect(page.locator('.item').filter({ hasText: 'maria@example.com' })).toBeVisible();
  expect(staff.calls.find(call => call.name === 'players_admin_decide_floor_request').body).toEqual({ p_id: 'r1', p_approve: true });
});
