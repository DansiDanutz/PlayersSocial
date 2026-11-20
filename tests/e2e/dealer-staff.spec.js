// Dealer staff app: signing creates the dealer card, dealers record arrival/departure,
// floor managers approve hours and enter tips, admins add floor managers.
const { test, expect } = require('@playwright/test');
const { mockStaff, dealerRow } = require('../support/staff-mock');
const { USER } = require('../support/supabase-mock');

async function drawSignature(page) {
  const box = await page.locator('#semnare canvas').boundingBox();
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 3, box.y + 5, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 5, { steps: 5 });
  await page.mouse.up();
}

test('a signed-in dealer types the name, signs and gets a dealer card', async ({ page }) => {
  const { staff } = await mockStaff(page, { user: true });
  await page.goto('/dealers-payout/#semnare');

  const name = page.locator('#semnare input[name="fullName"]');
  await expect(name).toHaveValue(USER.user_metadata.full_name);
  await name.fill('Ion Popescu');
  await drawSignature(page);
  await page.getByRole('button', { name: 'Semnez și îmi creez cardul' }).click();

  await expect(page).toHaveURL(/\/dealer\/$/);
  await expect(page.locator('h1')).toHaveText('Ion Popescu');
  const call = staff.calls.find(row => row.name === 'players_dealer_sign');
  expect(call.body.p_full_name).toBe('Ion Popescu');
  expect(call.body.p_signature).toMatch(/^data:image\/png;base64,/);
});

test('signing asks for a name and a drawn signature', async ({ page }) => {
  const { staff } = await mockStaff(page, { user: true });
  await page.goto('/dealers-payout/#semnare');

  await page.locator('#semnare input[name="fullName"]').fill('Ion');
  await page.getByRole('button', { name: 'Semnez și îmi creez cardul' }).click();
  await expect(page.locator('.sign-status')).toHaveText('Scrie numele și prenumele.');
  await page.locator('#semnare input[name="fullName"]').fill('Ion Popescu');
  await page.getByRole('button', { name: 'Semnez și îmi creez cardul' }).click();
  await expect(page.locator('.sign-status')).toContainText('Semnează în chenarul');
  expect(staff.calls.some(row => row.name === 'players_dealer_sign')).toBe(false);
});

test('visitors are sent to sign in and come back to the signing form', async ({ page }) => {
  await mockStaff(page);
  await page.goto('/dealers-payout/');

  await page.getByRole('button', { name: 'Intră în cont ca să semnezi' }).click();

  await expect(page).toHaveURL(/\/\?login=1$/);
  await expect(page.locator('#authDialog')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('players-return-to')));
  expect(saved.path).toBe('/dealers-payout/');
});

test('after signing in on the home page the visitor returns to the staff page', async ({ page }) => {
  await mockStaff(page, { user: true, dealer: dealerRow() });
  await page.addInitScript(() => localStorage.setItem('players-return-to', JSON.stringify({ path: '/dealer/', at: Date.now() })));
  await page.goto('/');

  await expect(page).toHaveURL(/\/dealer\/$/);
  await expect(page.locator('h1')).toHaveText('Ana Maria Pop');
});

test('a dealer checks in and checks out; the shift waits for approval', async ({ page }) => {
  const { staff } = await mockStaff(page, { user: true, dealer: dealerRow() });
  await page.goto('/dealer/');

  await page.getByRole('button', { name: 'Am venit (check-in)' }).click();
  await expect(page.getByRole('heading', { name: /Ești la lucru de la/ })).toBeVisible();
  await page.getByRole('button', { name: 'Am plecat (check-out)' }).click();

  await expect(page.getByRole('button', { name: 'Am venit (check-in)' })).toBeVisible();
  await expect(page.locator('.chip.pending').first()).toHaveText('De aprobat');
  expect(staff.calls.map(row => row.name)).toEqual(expect.arrayContaining(['players_dealer_check_in', 'players_dealer_check_out']));
});

test('the dealer card shows the amounts from the rules', async ({ page }) => {
  await mockStaff(page, {
    user: true,
    dealer: dealerRow(),
    tips: [{ day: '2026-09-05', total: 2000 }, { day: '2026-09-06', total: 500 }],
    shifts: [{ id: 's1', check_in: '2026-09-05T15:00:00Z', check_out: '2026-09-05T23:00:00Z', status: 'approved' }],
    penalties: [],
  });
  await page.goto('/dealer/');

  await expect(page.locator('.tile').filter({ hasText: 'Depozitul tău' })).toContainText('300 RON');
  const september = page.locator('tbody tr').filter({ hasText: 'septembrie 2026' });
  await expect(september).toContainText('1.600 RON');
  await expect(september).toContainText('+3.400 RON');
  await expect(september).toContainText('8 h');
});

test('someone who has not signed is sent to the rules', async ({ page }) => {
  await mockStaff(page, { user: true });
  await page.goto('/dealer/');

  await expect(page.getByRole('link', { name: 'Citește și semnează regulamentul' })).toHaveAttribute('href', '/dealers-payout/#semnare');
});

test('a floor manager corrects and approves a shift, then enters the day tips', async ({ page }) => {
  const { staff } = await mockStaff(page, {
    user: true,
    managers: [USER.email],
    dealer: dealerRow(),
    shifts: [{ id: 's1', check_in: '2026-11-20T16:00:00Z', check_out: '2026-11-20T23:00:00Z', status: 'pending', overdue: true }],
  });
  await page.goto('/sef-de-sala/');

  await expect(page.locator('.chip.late')).toHaveText('Întârziat');
  await page.getByLabel('Sosire Ana Maria Pop').fill('2026-11-20T17:30');
  await page.getByRole('button', { name: 'Aprobă' }).click();
  await expect(page.getByText('Nimic de aprobat')).toBeVisible();
  const review = staff.calls.find(row => row.name === 'players_floor_review_shift');
  expect(review.body.p_approve).toBe(true);
  expect(new Date(review.body.p_check_in).getTime()).toBe(new Date('2026-11-20T17:30').getTime());

  await page.getByRole('tab', { name: 'Tips & ore pe zi' }).click();
  await page.getByLabel('Tips Ana Maria Pop').fill('2000');
  await expect(page.locator('.split')).toContainText('depozit 300 RON');
  await page.getByRole('button', { name: 'Salvează tips' }).click();
  await expect(page.getByText('Tips salvat.')).toBeVisible();
  expect(staff.calls.find(row => row.name === 'players_floor_set_tips').body.p_total).toBe(2000);
  await expect(page.getByRole('tab', { name: 'Șefi de sală' })).toHaveCount(0);
});

test('a floor manager records a penalty on a dealer card', async ({ page }) => {
  const { staff } = await mockStaff(page, { user: true, managers: [USER.email], dealer: dealerRow() });
  await page.goto('/sef-de-sala/');

  await page.getByRole('tab', { name: 'Dealeri' }).click();
  await page.getByRole('button', { name: /Ana Maria Pop/ }).click();
  await page.getByLabel('Suma (RON)').fill('100');
  await page.getByLabel('Motiv').fill('Întârziere 30 min');
  await page.getByRole('button', { name: 'Adaugă penalizarea' }).click();

  await expect(page.locator('.item').filter({ hasText: 'Întârziere 30 min' })).toContainText('−100 RON');
  expect(staff.calls.find(row => row.name === 'players_floor_add_penalty').body.p_amount).toBe(100);
});

test('accounts that are not floor managers are refused', async ({ page }) => {
  await mockStaff(page, { user: true });
  await page.goto('/sef-de-sala/');

  await expect(page.getByRole('heading', { name: 'Acces doar pentru șefii de sală' })).toBeVisible();
});

test('an admin adds a floor manager', async ({ page }) => {
  const { staff } = await mockStaff(page, { admin: true, dealer: dealerRow() });
  await page.goto('/sef-de-sala/');

  await page.getByRole('tab', { name: 'Șefi de sală' }).click();
  await page.getByLabel('Emailul șefului de sală').fill('Sef.Sala@Example.com');
  await page.getByRole('button', { name: 'Adaugă' }).click();

  await expect(page.locator('.item').filter({ hasText: 'sef.sala@example.com' })).toBeVisible();
  expect(staff.managers).toContain('sef.sala@example.com');
});
