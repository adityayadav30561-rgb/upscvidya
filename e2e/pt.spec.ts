import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Drill Ground progression (build book Prompt 16, pivoted) — acceptance:
 *   - a logged workout awards 40 XP exactly once per IST day + advances the PT
 *     streak; a second workout the same day gives PT progress but 0 XP.
 *   - an offline re-sync (same client_id) creates no duplicate and no extra XP.
 *
 * Pure server-level test against local PocketBase (:8090). The XP/streak hook
 * (pt.pb.js) fires on workout_logs create; workout_logs is unique on
 * (user, client_id), which is what makes the offline queue safe.
 */

const PB = 'http://127.0.0.1:8090';
const PASSWORD = 'e2epassword123';

interface Account {
	id: string;
	token: string;
}

async function signup(request: APIRequestContext): Promise<Account> {
	const email = `pt-${Date.now()}-${Math.floor(Math.random() * 1e6)}@local.test`;
	const created = await request.post(`${PB}/api/collections/users/records`, {
		data: { email, password: PASSWORD, passwordConfirm: PASSWORD, display_name: 'PT Tester' }
	});
	expect(created.ok(), 'signup').toBeTruthy();
	const authed = await request.post(`${PB}/api/collections/users/auth-with-password`, {
		data: { identity: email, password: PASSWORD }
	});
	const body = await authed.json();
	return { id: body.record.id, token: body.token };
}

async function readUser(request: APIRequestContext, acc: Account) {
	const res = await request.get(`${PB}/api/collections/users/records/${acc.id}`, {
		headers: { Authorization: acc.token }
	});
	return res.json();
}

function todayLog(over: Record<string, unknown> = {}) {
	return {
		exercise_code: 'pushups',
		group: 'push',
		metric: 'reps',
		sets: [{ reps: 20 }, { reps: 15 }],
		total: 35,
		best: 20,
		source: 'manual',
		client_id: 'c_' + Math.random().toString(36).slice(2),
		logged_at: new Date().toISOString().replace('T', ' '),
		...over
	};
}

async function logWorkout(request: APIRequestContext, acc: Account, data: Record<string, unknown>) {
	return request.post(`${PB}/api/collections/workout_logs/records`, {
		headers: { Authorization: acc.token },
		data: { user: acc.id, ...data }
	});
}

test('first workout of the day awards 40 XP + streak; second gives 0 extra', async ({ request }) => {
	const user = await signup(request);
	const before = await readUser(request, user);
	const xp0 = before.xp ?? 0;

	// first workout today
	const first = await logWorkout(request, user, todayLog());
	expect(first.ok(), 'first log').toBeTruthy();

	const afterFirst = await readUser(request, user);
	expect(afterFirst.xp, '+40 XP').toBe(xp0 + 40);
	expect(afterFirst.pt_streak_current, 'streak → 1').toBe(1);
	expect(afterFirst.pt_sessions_total, 'sessions → 1').toBe(1);

	// second workout, same day, different exercise + client_id
	const second = await logWorkout(
		request,
		user,
		todayLog({ exercise_code: 'squats', group: 'legs', best: 30, total: 60 })
	);
	expect(second.ok(), 'second log').toBeTruthy();

	const afterSecond = await readUser(request, user);
	expect(afterSecond.xp, 'no extra XP same day').toBe(xp0 + 40);
	expect(afterSecond.pt_sessions_total, 'still one session').toBe(1);
});

test('re-syncing the same client_id creates no duplicate and no extra XP', async ({ request }) => {
	const user = await signup(request);
	const xp0 = (await readUser(request, user)).xp ?? 0;

	const log = todayLog({ client_id: 'fixed-offline-id' });
	const a = await logWorkout(request, user, log);
	expect(a.ok(), 'initial sync').toBeTruthy();
	const afterA = await readUser(request, user);
	expect(afterA.xp).toBe(xp0 + 40);

	// replay (offline queue re-flush) — unique (user, client_id) rejects it
	const b = await logWorkout(request, user, log);
	expect(b.ok(), 'duplicate rejected').toBeFalsy();
	expect(b.status()).toBe(400);

	const afterB = await readUser(request, user);
	expect(afterB.xp, 'XP not doubled').toBe(xp0 + 40);

	// exactly one row persisted for that client_id
	const rows = await request.get(
		`${PB}/api/collections/workout_logs/records?filter=${encodeURIComponent('client_id="fixed-offline-id"')}`,
		{ headers: { Authorization: user.token } }
	);
	expect((await rows.json()).totalItems).toBe(1);
});

test('a fresh user earns the first_workout badge on their first log', async ({ request }) => {
	const user = await signup(request);
	await logWorkout(request, user, todayLog());
	const badges = await request.get(
		`${PB}/api/collections/badges/records?filter=${encodeURIComponent('code="first_workout"')}`,
		{ headers: { Authorization: user.token } }
	);
	expect((await badges.json()).totalItems).toBe(1);
});
