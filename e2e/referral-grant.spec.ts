import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Referral grant (build book Prompt 14 acceptance):
 *   "Referral credit grants exactly once, on first quiz completion, to both
 *    parties."
 *
 * Pure server-level test against local PocketBase (:8090). Needs a free topic
 * with live questions — POL-05 (Preamble) qualifies in the seeded dev DB
 * (promote seed questions to status='live' if a fresh DB; see pb/SCHEMA.md
 * "Dev note"). The grant fires in /api/quiz/finish → lib/entitle; both parties
 * are free here, so each banks 7 days into premium_credit_days ("start-later
 * credit"), and the unique (user, referred_user) index makes it idempotent.
 */

const PB = 'http://127.0.0.1:8090';
const PASSWORD = 'e2epassword123';
const FREE_TOPIC = 'POL-05';

interface Account {
	id: string;
	token: string;
	email: string;
	referral_code: string;
}

async function signup(
	request: APIRequestContext,
	name: string,
	referredBy?: string
): Promise<Account> {
	const email = `rg-${Date.now()}-${Math.floor(Math.random() * 1e6)}@local.test`;
	const data: Record<string, unknown> = {
		email,
		password: PASSWORD,
		passwordConfirm: PASSWORD,
		display_name: name
	};
	if (referredBy) data.referred_by = referredBy;
	const created = await request.post(`${PB}/api/collections/users/records`, { data });
	expect(created.ok(), 'signup').toBeTruthy();
	const authed = await request.post(`${PB}/api/collections/users/auth-with-password`, {
		data: { identity: email, password: PASSWORD }
	});
	const body = await authed.json();
	return { id: body.record.id, token: body.token, email, referral_code: body.record.referral_code };
}

async function readUser(request: APIRequestContext, acc: Account) {
	const res = await request.get(`${PB}/api/collections/users/records/${acc.id}`, {
		headers: { Authorization: acc.token }
	});
	return res.json();
}

async function creditCount(request: APIRequestContext, acc: Account): Promise<number> {
	const res = await request.get(`${PB}/api/collections/referral_credits/records?perPage=100`, {
		headers: { Authorization: acc.token }
	});
	return (await res.json()).totalItems;
}

/** Compose → answer every question → finish one topic quiz as this user. */
async function completeQuiz(request: APIRequestContext, acc: Account, code: string): Promise<void> {
	const startRes = await request.post(`${PB}/api/quiz/start`, {
		headers: { Authorization: acc.token },
		data: { code }
	});
	expect(startRes.ok(), `quiz start ${code}`).toBeTruthy();
	const start = await startRes.json();
	expect(start.questions.length, 'live questions exist').toBeGreaterThan(0);

	for (const q of start.questions) {
		await request.post(`${PB}/api/quiz/answer`, {
			headers: { Authorization: acc.token },
			data: { session_id: start.session_id, qid: q.qid, choice: 0, ms: 120 }
		});
	}
	const finish = await request.post(`${PB}/api/quiz/finish`, {
		headers: { Authorization: acc.token },
		data: { session_id: start.session_id }
	});
	expect(finish.ok(), 'quiz finish').toBeTruthy();
}

test('first quiz completion credits BOTH parties, exactly once', async ({ request }) => {
	const referrer = await signup(request, 'Referrer');
	const referee = await signup(request, 'Referee', referrer.id);

	// baseline: nobody credited yet (signup alone must NOT grant — quality gate)
	expect(await creditCount(request, referrer)).toBe(0);
	expect(await creditCount(request, referee)).toBe(0);
	expect((await readUser(request, referrer)).premium_credit_days || 0).toBe(0);

	// referee completes their first real topic quiz → the grant fires
	await completeQuiz(request, referee, FREE_TOPIC);

	// both parties now hold exactly one credit and 7 banked days (both are free)
	expect(await creditCount(request, referrer), 'referrer credited once').toBe(1);
	expect(await creditCount(request, referee), 'referee credited once').toBe(1);
	expect((await readUser(request, referrer)).premium_credit_days, 'referrer +7 banked').toBe(7);
	expect((await readUser(request, referee)).premium_credit_days, 'referee +7 banked').toBe(7);

	// a SECOND quiz completion must not grant again (idempotent)
	await completeQuiz(request, referee, 'POL-10');
	expect(await creditCount(request, referrer), 'still once').toBe(1);
	expect(await creditCount(request, referee), 'still once').toBe(1);
	expect((await readUser(request, referrer)).premium_credit_days, 'still 7').toBe(7);
	expect((await readUser(request, referee)).premium_credit_days, 'still 7').toBe(7);
});

test('a user with no referrer earns no credit on quiz completion', async ({ request }) => {
	const solo = await signup(request, 'Solo Cadet'); // no referred_by
	await completeQuiz(request, solo, FREE_TOPIC);
	expect(await creditCount(request, solo)).toBe(0);
	expect((await readUser(request, solo)).premium_credit_days || 0).toBe(0);
});
