/** Payments client (build book Prompt 14).
 *
 *  Prices here MIRROR the server (pb_hooks/lib/entitle.js) for DISPLAY only —
 *  the server is the sole authority on what is charged (it re-computes the
 *  amount, incl. the beta-founder 50%, and Razorpay orders carry the amount).
 *  Keep this table in sync with entitle.js PRICING. The struck `anchor_inr` is
 *  a marketing MRP shown crossed out; it is never charged.
 */
import { pb } from './pb';
import { PUBLIC_PB_URL } from '$env/static/public';

export type Plan = 'monthly' | 'till_exam';

export interface PlanPricing {
	base_inr: number;
	beta_inr: number;
	anchor_inr: number;
}

export const PRICING: Record<Plan, PlanPricing> = {
	monthly: { base_inr: 199, beta_inr: 99, anchor_inr: 399 },
	till_exam: { base_inr: 999, beta_inr: 499, anchor_inr: 1999 }
};

/** ₹ with Indian digit grouping. */
export function formatINR(n: number): string {
	return '₹' + n.toLocaleString('en-IN');
}

/** The price a given user would pay client-side (for the paywall preview only;
 *  the server recomputes on order). */
export function displayPrice(plan: Plan, beta: boolean): number {
	const p = PRICING[plan];
	return beta ? p.beta_inr : p.base_inr;
}

interface OrderResponse {
	order_id: string;
	amount_inr: number;
	amount_paise: number;
	currency: 'INR';
	plan: Plan;
	beta: boolean;
	anchor_inr: number;
	key_id: string;
	simulate: boolean;
	name: string;
	description: string;
}

interface VerifyResponse {
	status: 'paid';
	plan: Plan;
	already: boolean;
	premium_until: string | null;
}

export interface RestoreResponse {
	restored: boolean;
	premium: boolean;
	premium_until?: string;
	plan?: Plan;
	note?: string;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
	const res = await fetch(`${PUBLIC_PB_URL}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
		body: JSON.stringify(body)
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		const err = new Error(
			(data as { message?: string })?.message || 'Payment request failed'
		) as Error & { code?: string };
		err.code = (data as { code?: string })?.code;
		throw err;
	}
	return data as T;
}

export const createOrder = (plan: Plan) => post<OrderResponse>('/api/pay/order', { plan });
export const restorePurchase = () => post<RestoreResponse>('/api/pay/restore', {});

/** Refresh the local auth record so isPremium flips after a grant. */
export async function refreshEntitlement(): Promise<void> {
	try {
		await pb.collection('users').authRefresh();
	} catch {
		/* leave stale; UI will catch up on next load */
	}
}

/* ---------- Razorpay checkout ---------- */

interface RazorpayResponse {
	razorpay_order_id: string;
	razorpay_payment_id: string;
	razorpay_signature: string;
}
interface RazorpayOptions {
	key: string;
	order_id: string;
	amount: number;
	currency: string;
	name: string;
	description: string;
	prefill?: { name?: string; email?: string };
	theme?: { color?: string };
	handler: (r: RazorpayResponse) => void;
	modal?: { ondismiss?: () => void };
}
interface RazorpayCtor {
	new (opts: RazorpayOptions): { open: () => void };
}
declare global {
	interface Window {
		Razorpay?: RazorpayCtor;
	}
}

let scriptPromise: Promise<void> | null = null;
function loadRazorpay(): Promise<void> {
	if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
	if (scriptPromise) return scriptPromise;
	scriptPromise = new Promise((resolve, reject) => {
		const s = document.createElement('script');
		s.src = 'https://checkout.razorpay.com/v1/checkout.js';
		s.onload = () => resolve();
		s.onerror = () => {
			scriptPromise = null;
			reject(new Error('Could not load the payment gateway.'));
		};
		document.head.appendChild(s);
	});
	return scriptPromise;
}

export type CheckoutResult =
	| { status: 'paid'; plan: Plan; premium_until: string | null; already: boolean }
	| { status: 'dismissed' }
	| { status: 'failed'; message: string };

/** Full checkout: server order → Razorpay sheet (or dev simulation) → server
 *  verify → local entitlement refresh. Resolves with a discriminated result;
 *  the caller renders success / retry / pending from it. */
export async function startCheckout(
	plan: Plan,
	prefill?: { name?: string; email?: string }
): Promise<CheckoutResult> {
	const order = await createOrder(plan);

	// dev/e2e path: no Razorpay keys on the server → simulate a captured payment
	if (order.simulate) {
		const v = await post<VerifyResponse>('/api/pay/verify', {
			razorpay_order_id: order.order_id,
			razorpay_payment_id: 'pay_sim_' + order.order_id,
			razorpay_signature: 'SIMULATED'
		});
		await refreshEntitlement();
		return { status: 'paid', plan: v.plan, premium_until: v.premium_until, already: v.already };
	}

	await loadRazorpay();
	if (!window.Razorpay) return { status: 'failed', message: 'Payment gateway unavailable.' };

	return new Promise<CheckoutResult>((resolve) => {
		const rzp = new window.Razorpay!({
			key: order.key_id,
			order_id: order.order_id,
			amount: order.amount_paise,
			currency: order.currency,
			name: order.name,
			description: order.description,
			prefill,
			theme: { color: '#e07a2f' },
			handler: (r: RazorpayResponse) => {
				post<VerifyResponse>('/api/pay/verify', {
					razorpay_order_id: r.razorpay_order_id,
					razorpay_payment_id: r.razorpay_payment_id,
					razorpay_signature: r.razorpay_signature
				})
					.then(async (v) => {
						await refreshEntitlement();
						resolve({
							status: 'paid',
							plan: v.plan,
							premium_until: v.premium_until,
							already: v.already
						});
					})
					.catch((err: Error) =>
						resolve({ status: 'failed', message: err.message || 'Verification failed.' })
					);
			},
			modal: { ondismiss: () => resolve({ status: 'dismissed' }) }
		});
		rzp.open();
	});
}

/** Days left on a monthly plan (for the 7/1-day expiry warnings); null when
 *  not applicable (no premium, or till-exam which never nags). */
export function monthlyDaysLeft(user: {
	is_premium?: boolean;
	premium_plan?: string;
	premium_until?: string;
}): number | null {
	if (!user?.is_premium || user.premium_plan !== 'monthly' || !user.premium_until) return null;
	const ms = Date.parse(String(user.premium_until).replace(' ', 'T'));
	if (isNaN(ms)) return null;
	const days = Math.ceil((ms - Date.now()) / 86400000);
	return days;
}
