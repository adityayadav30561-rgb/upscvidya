import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Webhook idempotency (build book Prompt 14 acceptance):
 *   "replayed webhook does not double-extend"
 *
 * Pure server-level test against local PocketBase (:8090) started with
 * PAY_SIMULATE=1 — no browser, no live Razorpay. The `payments` row (unique on
 * razorpay_order_id) is the ledger: premium is granted only on the created→paid
 * transition inside a transaction, so firing the webhook twice for the same
 * order must extend access exactly once.
 *
 *   cd pb && PAY_SIMULATE=1 ./pocketbase serve
 */

const PB = 'http://127.0.0.1:8090';
const PASSWORD = 'e2epassword123';

interface Account {
	id: string;
	token: string;
	email: string;
}

async function signup(request: APIRequestContext, name: string): Promise<Account> {
	const email = `wh-${Date.now()}-${Math.floor(Math.random() * 1e6)}@local.test`;
	const created = await request.post(`${PB}/api/collections/users/records`, {
		data: { email, password: PASSWORD, passwordConfirm: PASSWORD, display_name: name }
	});
	expect(created.ok(), 'signup').toBeTruthy();
	const authed = await request.post(`${PB}/api/collections/users/auth-with-password`, {
		data: { identity: email, password: PASSWORD }
	});
	expect(authed.ok(), 'auth').toBeTruthy();
	const body = await authed.json();
	return { id: body.record.id, token: body.token, email };
}

async function readUser(request: APIRequestContext, acc: Account) {
	const res = await request.get(`${PB}/api/collections/users/records/${acc.id}`, {
		headers: { Authorization: acc.token }
	});
	expect(res.ok(), 'read user').toBeTruthy();
	return res.json();
}

// craft the Razorpay-shaped webhook event our handler parses
function webhookBody(orderId: string) {
	return {
		event: 'payment.captured',
		payload: { payment: { entity: { id: `pay_${orderId}`, order_id: orderId, status: 'captured' } } }
	};
}

test('replayed webhook grants premium exactly once (no double-extend)', async ({ request }) => {
	const user = await signup(request, 'Webhook Tester');

	// before: free
	const before = await readUser(request, user);
	expect(before.is_premium).toBeFalsy();

	// create a monthly order (simulate mode returns a synthetic order id)
	const orderRes = await request.post(`${PB}/api/pay/order`, {
		headers: { Authorization: user.token },
		data: { plan: 'monthly' }
	});
	expect(orderRes.ok(), 'order').toBeTruthy();
	const order = await orderRes.json();
	expect(order.simulate, 'server is in PAY_SIMULATE mode').toBeTruthy();
	const orderId: string = order.order_id;

	// first webhook — grants
	const wh1 = await request.post(`${PB}/api/pay/webhook`, { data: webhookBody(orderId) });
	expect(wh1.ok()).toBeTruthy();
	expect((await wh1.json()).ok).toBeTruthy();

	const after1 = await readUser(request, user);
	expect(after1.is_premium, 'premium after first webhook').toBeTruthy();
	expect(after1.premium_until, 'premium_until set').toBeTruthy();
	const until1: string = after1.premium_until;

	// second webhook — SAME order, replayed
	const wh2 = await request.post(`${PB}/api/pay/webhook`, { data: webhookBody(orderId) });
	expect(wh2.ok()).toBeTruthy();
	expect((await wh2.json()).already, 'replay is a no-op').toBeTruthy();

	const after2 = await readUser(request, user);
	// the whole point: access did NOT move
	expect(after2.premium_until, 'premium_until unchanged on replay').toBe(until1);

	// and there is exactly one paid payment row for this order
	const pays = await request.get(
		`${PB}/api/collections/payments/records?filter=${encodeURIComponent(
			`razorpay_order_id="${orderId}"`
		)}`,
		{ headers: { Authorization: user.token } }
	);
	const list = await pays.json();
	expect(list.totalItems, 'one ledger row').toBe(1);
	expect(list.items[0].status).toBe('paid');
});

test('a second distinct order does extend again (control)', async ({ request }) => {
	const user = await signup(request, 'Webhook Control');

	async function payMonthly(): Promise<string> {
		const o = await (
			await request.post(`${PB}/api/pay/order`, {
				headers: { Authorization: user.token },
				data: { plan: 'monthly' }
			})
		).json();
		await request.post(`${PB}/api/pay/webhook`, { data: webhookBody(o.order_id) });
		return (await readUser(request, user)).premium_until;
	}

	const until1 = await payMonthly();
	const until2 = await payMonthly();
	// distinct orders each add 30 days → the window genuinely moves forward
	expect(Date.parse(until2.replace(' ', 'T'))).toBeGreaterThan(
		Date.parse(until1.replace(' ', 'T'))
	);
});
