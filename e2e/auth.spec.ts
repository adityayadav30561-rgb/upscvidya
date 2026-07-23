import { expect, test } from '@playwright/test';

/**
 * Golden path (build book Prompt 04): signup → onboarding (3 steps) →
 * path ceremony → dashboard. Requires local PocketBase on :8090
 * (pb/pocketbase.exe serve) and `pnpm exec playwright install chromium`.
 */

// signup then returning-login share one account, so they must run in order
// (parallel workers could otherwise log in before the account exists).
test.describe.configure({ mode: 'serial' });

const unique = Date.now();
const EMAIL = `e2e-${unique}@local.test`;
const PASSWORD = 'e2epassword123';

test('signup → onboarding → path → home', async ({ page }) => {
	await page.goto('/login?mode=signup');

	// Screen 17 — Enlist
	await expect(page.getByRole('heading', { name: 'Enlist' })).toBeVisible();
	await page.getByPlaceholder('As on your application form').fill('E2E Recruit');
	await page.getByPlaceholder('you@example.com').fill(EMAIL);
	await page.getByPlaceholder('8+ characters').fill(PASSWORD);
	await expect(page.getByText('✓ 8+ characters')).toBeVisible(); // live checklist
	await page.getByRole('button', { name: 'Create account →' }).click();

	// Screen 01 — step 1 exam
	await expect(page.getByRole('heading', { name: 'Choose your battlefield' })).toBeVisible();
	await page.getByRole('button', { name: 'Continue →' }).click();

	// step 2 target year (pick the non-sprint option)
	await expect(page.getByRole('heading', { name: 'Target attempt' })).toBeVisible();
	await page
		.getByRole('button', { name: /CAPF AC \d{4}/ })
		.filter({ hasNotText: 'Sprint' })
		.first()
		.click();
	await page.getByRole('button', { name: 'Continue →' }).click();

	// step 3 commitment
	await expect(page.getByRole('heading', { name: 'Daily commitment' })).toBeVisible();
	await page.getByRole('button', { name: /Assault pace/ }).click();
	await expect(page.getByText('Your plan preview')).toBeVisible();
	await page.getByRole('button', { name: 'Generate my guided path →' }).click();

	// Screen 18 — ceremony (tap to skip, then begin)
	await expect(page.getByText('ORDERS RECEIVED')).toBeVisible();
	await page.mouse.click(200, 200); // skip
	await page.getByRole('button', { name: 'Begin campaign →' }).click();

	// dashboard shell (target the nav link specifically — the a11y route
	// announcer also contains "Base Camp", which would make getByText ambiguous)
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('link', { name: 'BASE' })).toBeVisible();
});

test('returning login lands on home, skipping onboarding', async ({ page }) => {
	await page.goto('/login');
	await page.getByPlaceholder('you@example.com').fill(EMAIL);
	await page.getByPlaceholder('••••••••').fill(PASSWORD);
	await page.getByRole('button', { name: 'Report for duty →' }).click();
	await expect(page).toHaveURL('/');
});

test('unauthenticated user is redirected to /login', async ({ page }) => {
	await page.goto('/map');
	await expect(page).toHaveURL(/\/login/);
});
