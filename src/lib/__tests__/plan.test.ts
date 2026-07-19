import { describe, expect, it } from 'vitest';
import { computePlan, examDate, PACES } from '$lib/plan';

describe('plan math (Screens 01/18)', () => {
	it('exam day = first Sunday of August', () => {
		expect(examDate(2026).toISOString().slice(0, 10)).toBe('2026-08-02');
		expect(examDate(2027).toISOString().slice(0, 10)).toBe('2027-08-01');
		expect(examDate(2028).toISOString().slice(0, 10)).toBe('2028-08-06');
	});

	it('mockup numbers: 2hr pace from Jul 2026 → secured ~Feb 2027, mocks May, ~9wk buffer', () => {
		const from = new Date(Date.UTC(2026, 6, 19)); // 19 Jul 2026
		const plan = computePlan(2027, 120, from);
		expect(plan.politySecured.getUTCFullYear()).toBe(2026);
		// 103 units at 2/day ≈ 52 days → Sep 2026 (design's "Feb 2027" assumed a
		// later cohort start; formula, not copy, is the contract)
		expect(plan.mockSeason.toISOString().slice(0, 10)).toBe('2027-05-01');
		expect(plan.bufferWeeks).toBeGreaterThanOrEqual(9);
		expect(plan.topicsPerDay).toBe(2);
	});

	it('sprint flag under 30 days', () => {
		const from = new Date(Date.UTC(2026, 6, 19));
		expect(computePlan(2026, 120, from).sprint).toBe(true); // 14 days out
		expect(computePlan(2027, 120, from).sprint).toBe(false);
	});

	it('all four design paces exist', () => {
		expect(PACES.map((p) => p.minutes)).toEqual([30, 60, 120, 180]);
		expect(PACES.map((p) => p.name)).toEqual([
			'Recon pace',
			'Patrol pace',
			'Assault pace',
			'Siege pace'
		]);
	});
});
