/** PostHog analytics (build book Prompt 15) — a thin, dependency-free client
 *  over PostHog's HTTP capture API. We only need the funnel events + identify +
 *  person properties the build book lists, so a fetch wrapper beats bundling
 *  the full SDK (smaller, no autocapture, nothing runs when unconfigured).
 *
 *  Privacy: no PII in event payloads beyond the PB user id (the distinct_id).
 *  `sanitize()` strips any accidental identity keys, and the "minimal analytics"
 *  setting suppresses everything except the few essential funnel milestones.
 *  Fully no-op until PUBLIC_POSTHOG_KEY is set (dev/e2e send nothing).
 */
import { browser } from '$app/environment';
import { PUBLIC_POSTHOG_KEY, PUBLIC_POSTHOG_HOST } from '$env/static/public';

export type AnalyticsEvent =
	| 'signup_completed'
	| 'onboarding_completed'
	| 'first_topic_read'
	| 'first_quiz_completed'
	| 'topic_conquered'
	| 'sr_session_completed'
	| 'mock_started'
	| 'mock_submitted'
	| 'paywall_viewed'
	| 'checkout_started'
	| 'payment_success'
	| 'ca_quiz_completed'
	| 'referral_shared';

/** Events that still fire in "minimal analytics" mode — the conversion spine. */
const ESSENTIAL = new Set<AnalyticsEvent>([
	'signup_completed',
	'onboarding_completed',
	'payment_success'
]);

/** Keys we never send even if a caller passes them by mistake (no PII). */
const PII_KEYS = new Set(['email', 'name', 'display_name', 'phone', 'password', 'token']);

const HOST = (PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '');
const enabled = () => browser && !!PUBLIC_POSTHOG_KEY;

const state = {
	distinctId: '',
	minimal: false
};

/** Stable anonymous id for pre-login events (paywall etc.). */
function anonId(): string {
	try {
		let id = localStorage.getItem('ph-anon');
		if (!id) {
			id = 'anon_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
			localStorage.setItem('ph-anon', id);
		}
		return id;
	} catch {
		return 'anon';
	}
}

/** Pure gate — exported for unit tests. */
export function shouldCapture(event: AnalyticsEvent, minimal: boolean): boolean {
	return !minimal || ESSENTIAL.has(event);
}

/** Pure — strip identity keys from a props object. Exported for unit tests. */
export function sanitize(props: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(props)) {
		if (PII_KEYS.has(k.toLowerCase())) continue;
		out[k] = v;
	}
	return out;
}

function post(payload: Record<string, unknown>): void {
	if (!enabled()) return;
	// fire-and-forget; keepalive so it survives a navigation
	void fetch(`${HOST}/capture/`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ api_key: PUBLIC_POSTHOG_KEY, ...payload }),
		keepalive: true
	}).catch(() => {});
}

/** Bind the current user (call on login/boot). Sets distinct_id + person props
 *  and the minimal-analytics flag from the user record. */
export function initAnalytics(
	user: {
		id?: string;
		rank_code?: string;
		is_premium?: boolean;
		target_year?: number;
		analytics_minimal?: boolean;
	} | null
): void {
	state.minimal = !!user?.analytics_minimal;
	if (user?.id) {
		state.distinctId = user.id;
		identify(user.id, {
			rank: user.rank_code,
			premium: !!user.is_premium,
			target_year: user.target_year
		});
	} else {
		state.distinctId = enabled() ? anonId() : '';
	}
}

export function setMinimal(minimal: boolean): void {
	state.minimal = minimal;
}

/** PostHog identify = a $identify event carrying $set person properties. */
export function identify(userId: string, personProps: Record<string, unknown>): void {
	state.distinctId = userId;
	post({
		event: '$identify',
		distinct_id: userId,
		properties: { $set: sanitize(personProps) }
	});
}

export function capture(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
	if (!shouldCapture(event, state.minimal)) return;
	post({
		event,
		distinct_id: state.distinctId || anonId(),
		properties: sanitize(props)
	});
}

/** Clear identity on logout (subsequent events fall back to a fresh anon id). */
export function resetAnalytics(): void {
	state.distinctId = '';
	try {
		localStorage.removeItem('ph-anon');
	} catch {
		/* ignore */
	}
}
