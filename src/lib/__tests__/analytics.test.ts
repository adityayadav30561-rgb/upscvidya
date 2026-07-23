import { describe, expect, it } from 'vitest';
import { shouldCapture, sanitize, type AnalyticsEvent } from '../analytics';

describe('shouldCapture (minimal-analytics gate)', () => {
	const essential: AnalyticsEvent[] = ['signup_completed', 'onboarding_completed', 'payment_success'];
	const optional: AnalyticsEvent[] = [
		'first_topic_read',
		'first_quiz_completed',
		'topic_conquered',
		'sr_session_completed',
		'mock_started',
		'mock_submitted',
		'paywall_viewed',
		'checkout_started',
		'ca_quiz_completed',
		'referral_shared'
	];

	it('captures everything when minimal is off', () => {
		for (const e of [...essential, ...optional]) expect(shouldCapture(e, false)).toBe(true);
	});
	it('captures only the essential spine when minimal is on', () => {
		for (const e of essential) expect(shouldCapture(e, true)).toBe(true);
		for (const e of optional) expect(shouldCapture(e, true)).toBe(false);
	});
});

describe('sanitize (no PII in payloads)', () => {
	it('strips identity keys, keeps analytics-safe ones', () => {
		const out = sanitize({
			email: 'a@b.com',
			name: 'Arjun',
			display_name: 'Arjun N',
			phone: '+9199',
			password: 'x',
			token: 'y',
			plan: 'till_exam',
			score_pct: 82
		});
		expect(out).toEqual({ plan: 'till_exam', score_pct: 82 });
	});
	it('is case-insensitive on key names', () => {
		expect(sanitize({ Email: 'a@b.com', Score: 1 })).toEqual({ Score: 1 });
	});
	it('leaves a clean payload untouched', () => {
		expect(sanitize({ code: 'POL-05', gold: true })).toEqual({ code: 'POL-05', gold: true });
	});
});
