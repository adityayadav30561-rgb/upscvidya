import { expect, test, type Page } from '@playwright/test';

/**
 * Ustad's first-run walkthrough. A freshly-onboarded recruit should be greeted
 * by the guide on the dashboard; skipping it must stick (tour_done). Requires
 * local PocketBase on :8090.
 */

async function enlist(page: Page): Promise<void> {
	const email = `tour-${Date.now()}-${Math.floor(Math.random() * 1e4)}@local.test`;
	await page.goto('/login?mode=signup');
	await page.getByPlaceholder('As on your application form').fill('Tour Recruit');
	await page.getByPlaceholder('you@example.com').fill(email);
	await page.getByPlaceholder('8+ characters').fill('e2epassword123');
	await page.getByRole('button', { name: 'Create account →' }).click();

	await page.getByRole('button', { name: 'Continue →' }).click(); // exam
	await page
		.getByRole('button', { name: /CAPF AC \d{4}/ })
		.filter({ hasNotText: 'Sprint' })
		.first()
		.click();
	await page.getByRole('button', { name: 'Continue →' }).click(); // year
	await page.getByRole('button', { name: /Assault pace/ }).click();
	await page.getByRole('button', { name: 'Generate my guided path →' }).click();
	await page.mouse.click(200, 200); // skip ceremony
	await page.getByRole('button', { name: 'Begin campaign →' }).click();
	await expect(page).toHaveURL('/');
}

test('a new recruit is greeted by Ustad, and Skip sticks', async ({ page }) => {
	await enlist(page);

	// the guide auto-starts on the base
	await expect(page.getByText('USTAD')).toBeVisible();
	await expect(page.getByText('Attention, recruit!')).toBeVisible();

	// advance one step, then skip out
	await page.getByRole('button', { name: 'Next →' }).click();
	await page.getByRole('button', { name: 'Skip' }).click();
	await expect(page.getByText('USTAD')).toBeHidden();

	// and it does not re-appear on a fresh load (tour_done persisted)
	await page.reload();
	await expect(page).toHaveURL('/');
	await expect(page.getByText('USTAD')).toBeHidden();
});
