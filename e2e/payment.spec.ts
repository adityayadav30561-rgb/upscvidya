import { expect, test, type Page } from '@playwright/test';

/**
 * Payments (build book Prompt 14) — acceptance:
 *   "Test-mode Razorpay end-to-end for both plans flips entitlements."
 *
 * Runs WITHOUT live Razorpay keys: start PocketBase with PAY_SIMULATE=1 so
 * /api/pay/order returns a synthetic order and /api/pay/verify accepts the
 * "SIMULATED" signature (the client takes this path automatically — see
 * src/lib/pay.ts startCheckout). Requires local PocketBase on :8090 with the
 * Prompt-14 migration + hooks loaded:
 *
 *   cd pb && PAY_SIMULATE=1 ./pocketbase serve
 *
 * The idempotency / no-double-extend property is unit-covered server-side
 * (payment status ledger); here we assert the user-visible entitlement flip.
 */

async function enlist(page: Page): Promise<void> {
	// suppress Ustad's first-run walkthrough (its own spec covers it) so its
	// overlay doesn't intercept clicks in these payment flows
	await page.addInitScript(() => {
		try {
			localStorage.setItem('tour-seen', '1');
		} catch {
			/* ignore */
		}
	});
	const email = `pay-${Date.now()}-${Math.floor(Math.random() * 1e4)}@local.test`;
	await page.goto('/login?mode=signup');
	await page.getByPlaceholder('As on your application form').fill('Pay Recruit');
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

for (const plan of ['till_exam', 'monthly'] as const) {
	test(`checkout (${plan}) flips the user to premium`, async ({ page }) => {
		await enlist(page);

		await page.goto(`/checkout?plan=${plan}`);
		await expect(page.getByRole('button', { name: /Pay ₹/ })).toBeVisible();
		await page.getByRole('button', { name: /Pay ₹/ }).click();

		// success card (simulate path resolves synchronously)
		await expect(page.getByRole('heading', { name: 'Campaign unlocked' })).toBeVisible();

		// entitlement reflected on the plan card (moved to the billing sub-route)
		await page.goto('/profile/billing');
		await expect(page.getByText(/Active until/)).toBeVisible();
	});
}

test('free user hitting a premium wall sees the paywall CTA', async ({ page }) => {
	await enlist(page);
	await page.goto('/paywall?from=Mock%2005');
	await expect(page.getByRole('heading', { name: 'Go full campaign' })).toBeVisible();
	await expect(page.getByText('Unlocked from: Mock 05')).toBeVisible();
	await expect(page.getByRole('button', { name: /Continue · ₹/ })).toBeVisible();
});
