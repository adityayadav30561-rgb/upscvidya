import { describe, expect, it, vi, afterEach } from 'vitest';
import { PRICING, displayPrice, formatINR, monthlyDaysLeft } from '../pay';

/**
 * Client pricing MUST mirror the server (pb_hooks/lib/entitle.js). This table
 * is the guard: if either side drifts, one of these assertions fails. The
 * numbers are the build-book matrix locked with the user.
 */
describe('PRICING mirrors entitle.js', () => {
	it('monthly: ₹199 base / ₹99 beta, ₹399 anchor', () => {
		expect(PRICING.monthly).toEqual({ base_inr: 199, beta_inr: 99, anchor_inr: 399 });
	});
	it('till_exam: ₹999 base / ₹499 beta, ₹1999 anchor', () => {
		expect(PRICING.till_exam).toEqual({ base_inr: 999, beta_inr: 499, anchor_inr: 1999 });
	});
	it('beta is exactly half of the base price (rounded), both plans', () => {
		for (const plan of ['monthly', 'till_exam'] as const) {
			const p = PRICING[plan];
			expect(p.beta_inr).toBeLessThan(p.base_inr);
			// build-book "50% prices": 199→99, 999→499 (floor of half)
			expect(p.beta_inr).toBe(Math.floor(p.base_inr / 2));
		}
	});
});

describe('displayPrice', () => {
	it('returns base price for a non-beta user', () => {
		expect(displayPrice('monthly', false)).toBe(199);
		expect(displayPrice('till_exam', false)).toBe(999);
	});
	it('returns beta price for a beta founder', () => {
		expect(displayPrice('monthly', true)).toBe(99);
		expect(displayPrice('till_exam', true)).toBe(499);
	});
});

describe('formatINR', () => {
	it('groups digits Indian-style with the rupee sign', () => {
		expect(formatINR(999)).toBe('₹999');
		expect(formatINR(1999)).toBe('₹1,999');
		expect(formatINR(199)).toBe('₹199');
	});
});

describe('monthlyDaysLeft', () => {
	const REAL_NOW = Date.now;
	afterEach(() => {
		Date.now = REAL_NOW;
		vi.useRealTimers();
	});

	it('is null for a free user', () => {
		expect(monthlyDaysLeft({ is_premium: false })).toBeNull();
	});
	it('is null for a till-exam plan (never nags)', () => {
		expect(
			monthlyDaysLeft({ is_premium: true, premium_plan: 'till_exam', premium_until: '2027-08-31 23:59:59.000Z' })
		).toBeNull();
	});
	it('counts whole days left on a monthly plan', () => {
		const now = Date.parse('2026-07-23T00:00:00Z');
		Date.now = () => now;
		const until = new Date(now + 5 * 86400000).toISOString().replace('T', ' ');
		expect(
			monthlyDaysLeft({ is_premium: true, premium_plan: 'monthly', premium_until: until })
		).toBe(5);
	});
	it('is <= 0 once the window has passed', () => {
		const now = Date.parse('2026-07-23T00:00:00Z');
		Date.now = () => now;
		const until = new Date(now - 2 * 86400000).toISOString().replace('T', ' ');
		expect(
			monthlyDaysLeft({ is_premium: true, premium_plan: 'monthly', premium_until: until })
		).toBeLessThanOrEqual(0);
	});
});
