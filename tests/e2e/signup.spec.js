const { test, expect } = require('@playwright/test');
const { mockSupabase, featuredRow } = require('../support/supabase-mock');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-01T12:00:00'));
});

test('visitor signs up for a featured event and sees that event’s details', async ({ page }) => {
  const state = await mockSupabase(page, { events: [featuredRow({ event_name: 'Turneu de Remi', event_date: '2026-10-10', participant_target: 24 })] });
  await page.goto('/#events');

  await page.locator('#featuredEvents .event-featured').getByRole('button', { name: 'Înscrie-te la turneu' }).click();
  await expect(page.locator('#signupNote')).toContainText('10 octombrie 2026 · ora 18:00');
  await page.locator('#firstName').fill('Ana');
  await page.locator('#lastName').fill('Pop');
  await page.locator('#email').fill('ana@example.com');
  await page.getByRole('button', { name: 'Confirmă înscrierea' }).click();

  await expect(page.locator('#successMessage')).toContainText('Turneu de Remi');
  await expect(page.locator('#successMessage')).toContainText('10 octombrie 2026');
  await expect(page.locator('#successMessage')).toContainText('24 de locuri');
  await expect(page.locator('#successMessage')).not.toContainText('26 septembrie');
  const register = state.calls.find(call => call.name === 'players_register');
  expect(register.body).toEqual({ p_event_name: 'Turneu de Remi', p_first_name: 'Ana', p_last_name: 'Pop', p_email: 'ana@example.com', p_public_display_consent: false });
});

test('visitor signs up for a category card', async ({ page }) => {
  const state = await mockSupabase(page);
  await page.goto('/#events');

  await page.locator('#eventGrid [data-name="Seară de Table"] button.join').click();
  await page.locator('#firstName').fill('Ion');
  await page.locator('#lastName').fill('Rus');
  await page.locator('#email').fill('ion@example.com');
  await page.getByRole('button', { name: 'Confirmă înscrierea' }).click();

  await expect(page.locator('#successView')).toBeVisible();
  expect(state.calls.find(call => call.name === 'players_register').body.p_event_name).toBe('Seară de Table');
});
