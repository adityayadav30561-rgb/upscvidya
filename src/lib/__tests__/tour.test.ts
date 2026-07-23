import { describe, expect, it, beforeEach } from 'vitest';
import {
	STEPS,
	clampIndex,
	shouldAutoStart,
	tour,
	startTour,
	nextStep,
	prevStep
} from '../tour.svelte';

beforeEach(() => {
	try {
		localStorage.clear();
	} catch {
		/* ignore */
	}
});

describe('STEPS definition', () => {
	it('starts on the base (/) and every step has copy', () => {
		expect(STEPS[0].route).toBe('/');
		for (const s of STEPS) {
			expect(s.title.length).toBeGreaterThan(0);
			expect(s.body.length).toBeGreaterThan(0);
			expect(s.route.startsWith('/')).toBe(true);
		}
	});
	it('covers Home → Map → Topic → Quiz → Drill Ground', () => {
		const routes = STEPS.map((s) => s.route);
		expect(routes).toContain('/');
		expect(routes).toContain('/map');
		expect(routes).toContain('/topic/POL-05');
		expect(routes).toContain('/pt');
	});
	it('the final step is a centered send-off (no target)', () => {
		expect(STEPS[STEPS.length - 1].target).toBeUndefined();
	});
});

describe('clampIndex', () => {
	it('bounds into range', () => {
		expect(clampIndex(-2, 8)).toBe(0);
		expect(clampIndex(3, 8)).toBe(3);
		expect(clampIndex(99, 8)).toBe(7);
	});
});

describe('engine start / next / prev', () => {
	it('starts active at step 0 and steps forward + back', () => {
		startTour();
		expect(tour.active).toBe(true);
		expect(tour.index).toBe(0);
		expect(tour.isFirst).toBe(true);

		nextStep();
		expect(tour.index).toBe(1);

		prevStep();
		expect(tour.index).toBe(0);
		prevStep(); // clamped at 0
		expect(tour.index).toBe(0);
	});
});

describe('shouldAutoStart', () => {
	const onboarded = { exam: 'capf', target_year: 2027, daily_minutes: 60, tour_done: false };
	it('false for no user / not onboarded / already done', () => {
		expect(shouldAutoStart(null)).toBe(false);
		expect(shouldAutoStart({ exam: 'capf' })).toBe(false); // missing year/minutes
		expect(shouldAutoStart({ ...onboarded, tour_done: true })).toBe(false);
	});
	it('true for a fresh onboarded recruit who has not seen it', () => {
		expect(shouldAutoStart(onboarded)).toBe(true);
	});
	it('false once the session-seen flag is set', () => {
		localStorage.setItem('tour-seen', '1');
		expect(shouldAutoStart(onboarded)).toBe(false);
	});
});
