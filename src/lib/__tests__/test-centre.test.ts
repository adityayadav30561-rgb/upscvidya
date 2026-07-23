import { describe, expect, it } from 'vitest';
import {
	scoreTest,
	percentileOf,
	paletteStates,
	countPalette,
	formatClock,
	timerWarning,
	CAPF_MARKING
} from '../test';

/* ---------- negative marking (acceptance: math incl. rounding) ---------- */

describe('scoreTest — CAPF marking (+2 correct, −0.667 wrong)', () => {
	it('all correct scores full marks', () => {
		expect(scoreTest(125, 0)).toBe(250);
	});
	it('applies the one-third penalty to wrong answers', () => {
		// 72 correct, 40 wrong → 144 − 26.68 = 117.32
		expect(scoreTest(72, 40)).toBe(117.32);
	});
	it('skipped questions are never penalised', () => {
		// 60 correct, 0 wrong, 65 skipped
		expect(scoreTest(60, 0)).toBe(120);
	});
	it('rounds to two decimals', () => {
		expect(scoreTest(1, 1)).toBe(1.33); // 2 − 0.667 = 1.333
		expect(scoreTest(0, 3)).toBe(-2); // −2.001 → −2.00
		expect(scoreTest(10, 7)).toBe(15.33); // 20 − 4.669
	});
	it('can go negative on a bad paper', () => {
		expect(scoreTest(0, 10)).toBe(-6.67);
	});
	it('honours a custom marking scheme', () => {
		expect(scoreTest(10, 5, { correct: 1, negative: 0.25 })).toBe(8.75);
		expect(scoreTest(4, 2, { correct: 2, negative: 0 })).toBe(8);
	});
	it('exposes the CAPF default', () => {
		expect(CAPF_MARKING).toEqual({ correct: 2, negative: 0.667 });
	});
});

/* ---------- percentile (acceptance: recomputes with a second attempt) ---------- */

describe('percentileOf', () => {
	it('is null with no attempts recorded', () => {
		expect(percentileOf(100, [])).toBe(null);
	});
	it('a lone attempt beats nobody', () => {
		expect(percentileOf(100, [100])).toBe(0);
	});
	it('recomputes when a second, lower attempt lands', () => {
		expect(percentileOf(120, [120])).toBe(0);
		expect(percentileOf(120, [120, 80])).toBe(50); // now above one of two
	});
	it('recomputes when a second, higher attempt lands', () => {
		expect(percentileOf(80, [80, 120])).toBe(0);
		expect(percentileOf(120, [80, 120])).toBe(50);
	});
	it('ties do not count as below', () => {
		expect(percentileOf(100, [100, 100, 100, 40])).toBe(25);
	});
});

/* ---------- palette ---------- */

describe('palette', () => {
	const qs = [{ qid: 'a' }, { qid: 'b' }, { qid: 'c' }, { qid: 'd' }];
	it('classifies cells, current winning over the rest', () => {
		const states = paletteStates(qs, { a: 2, c: 0 }, { b: true }, 3);
		expect(states).toEqual(['answered', 'marked', 'answered', 'current']);
	});
	it('a marked question with a saved option still reads as marked', () => {
		const states = paletteStates(qs, { b: 1 }, { b: true }, 0);
		expect(states[1]).toBe('marked');
	});
	it('counts each bucket for the submit dialog', () => {
		const states = paletteStates(qs, { a: 2 }, { b: true }, 3);
		expect(countPalette(states)).toEqual({ answered: 1, marked: 1, unanswered: 1 });
	});
});

/* ---------- timer ---------- */

describe('formatClock', () => {
	it('matches the mockup format', () => {
		expect(formatClock(5 * 3600 + 3 * 60 + 7)).toBe('5:03:07');
		expect(formatClock(83 * 60 + 7)).toBe('1:23:07');
		expect(formatClock(59)).toBe('00:59');
		expect(formatClock(-5)).toBe('00:00');
	});
});

describe('timerWarning', () => {
	it('fires once crossing 10 minutes', () => {
		expect(timerWarning(600, 601)).toBe('ten');
		expect(timerWarning(599, 600)).toBe(null); // already crossed
	});
	it('fires once crossing 2 minutes', () => {
		expect(timerWarning(120, 121)).toBe('two');
		expect(timerWarning(119, 120)).toBe(null);
	});
	it('is silent mid-paper', () => {
		expect(timerWarning(3600, 3601)).toBe(null);
	});
});
