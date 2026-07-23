import { expect, test, type Page } from '@playwright/test';

/**
 * Referrals (build book Prompt 14) — acceptance:
 *   "Referral credit grants exactly once, on first quiz completion, to both
 *    parties."
 *
 * The grant fires server-side in /api/quiz/finish (see pb_hooks/quiz.pb.js →
 * lib/entitle.grantReferralCredit) and is idempotent via the unique
 * (user, referred_user) index. A full two-user quiz-completion e2e needs live
 * questions promoted to status='live' in the local PocketBase (the admin queue
 * / seed does this — see pb/SCHEMA.md "Dev note"). This spec covers the parts
 * that don't depend on seeded content: the referral link round-trips through
 * /r/[code] and the profile share surface renders the code. The grant-once
 * property itself is asserted server-side by the entitle unit behaviour +
 * the DB unique index.
 *
 * Requires local PocketBase on :8090.
 */

async function enlist(page: Page, name: string): Promise<string> {
	const email = `ref-${Date.now()}-${Math.floor(Math.random() * 1e4)}@local.test`;
	await page.goto('/login?mode=signup');
	await page.getByPlaceholder('As on your application form').fill(name);
	await page.getByPlaceholder('you@example.com').fill(email);
	await page.getByPlaceholder('8+ characters').fill('e2epassword123');
	await page.getByRole('button', { name: 'Create account →' }).click();
	await page.getByRole('button', { name: 'Continue →' }).click();
	await page
		.getByRole('button', { name: /CAPF AC \d{4}/ })
		.filter({ hasNotText: 'Sprint' })
		.first()
		.click();
	await page.getByRole('button', { name: 'Continue →' }).click();
	await page.getByRole('button', { name: /Assault pace/ }).click();
	await page.getByRole('button', { name: 'Generate my guided path →' }).click();
	await page.mouse.click(200, 200);
	await page.getByRole('button', { name: 'Begin campaign →' }).click();
	await expect(page).toHaveURL('/');
	return email;
}

test('profile exposes a shareable referral code', async ({ page }) => {
	await enlist(page, 'Referrer One');
	await page.goto('/profile');
	await expect(page.getByRole('heading', { name: 'Recruit a batchmate' })).toBeVisible();
	await expect(page.getByText(/7 days of Premium/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Share link' })).toBeVisible();
});

test('a /r/[code] link lands on signup with the code applied', async ({ page }) => {
	// grab a real referral code from an existing account
	await enlist(page, 'Referrer Two');
	await page.goto('/profile');
	const code = (await page.locator('.ref-code').innerText()).trim();
	expect(code).toMatch(/^[A-Z0-9]{6,}$/);

	// a fresh visitor following the link is routed into signup with it stashed
	await page.evaluate(() => localStorage.clear());
	await page.goto(`/r/${code}`);
	await expect(page).toHaveURL(/\/login/);
	const stashed = await page.evaluate(() => localStorage.getItem('referral-code'));
	expect(stashed).toBe(code);
});
