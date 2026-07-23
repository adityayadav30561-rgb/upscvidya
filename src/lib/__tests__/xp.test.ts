import { describe, expect, it } from 'vitest';
import {
	tierMult,
	answerXp,
	srReviewXp,
	quizXp,
	rankProgress,
	streakStep,
	daysBetween,
	DRILL_XP,
	type StreakState
} from '../xp';
import { rankForXp } from '../ranks';

/* ---------- XP rules (build book Prompt 09 — every rule) ---------- */

describe('tier multipliers', () => {
	it('T1-2 ×1.0, T3 ×1.4, T4 ×1.8, T5 ×2.2', () => {
		expect(tierMult(1)).toBe(1.0);
		expect(tierMult(2)).toBe(1.0);
		expect(tierMult(3)).toBe(1.4);
		expect(tierMult(4)).toBe(1.8);
		expect(tierMult(5)).toBe(2.2);
	});
});

describe('answerXp', () => {
	it('10 × multiplier per correct answer', () => {
		expect(answerXp(1, false)).toBe(10);
		expect(answerXp(2, false)).toBe(10);
		expect(answerXp(3, false)).toBe(14);
		expect(answerXp(4, false)).toBe(18);
		expect(answerXp(5, false)).toBe(22);
	});
	it('anti-farm: repeat correct within 7 days awards 0', () => {
		for (const t of [1, 3, 5]) expect(answerXp(t, true)).toBe(0);
	});
});

describe('srReviewXp', () => {
	it('8 flat, 12 if the card ever lapsed (SR exempt from anti-farm)', () => {
		expect(srReviewXp(0)).toBe(8);
		expect(srReviewXp(1)).toBe(12);
		expect(srReviewXp(4)).toBe(12);
	});
});

describe('quizXp (finish totals)', () => {
	const items = [
		{ tier: 1, correct: true, farmed: false }, // 10
		{ tier: 3, correct: true, farmed: false }, // 14
		{ tier: 4, correct: true, farmed: true }, // 0 (farmed)
		{ tier: 5, correct: false, farmed: false } // 0 (wrong)
	];
	it('sums per-answer XP with farm/wrong zeroed', () => {
		expect(quizXp(items, { newlyConquered: false, gold: false, regionComplete: false })).toBe(24);
	});
	it('conquest bonus +100', () => {
		expect(quizXp(items, { newlyConquered: true, gold: false, regionComplete: false })).toBe(124);
	});
	it('gold bonus +150 replaces the conquest bonus', () => {
		expect(quizXp(items, { newlyConquered: true, gold: true, regionComplete: false })).toBe(174);
	});
	it('region completion adds +500', () => {
		expect(quizXp(items, { newlyConquered: true, gold: false, regionComplete: true })).toBe(624);
	});
	it('drill session completes for a flat 40', () => {
		expect(DRILL_XP).toBe(40);
	});
});

/* ---------- ranks (14-grade design ladder) ---------- */

describe('rank-up boundaries', () => {
	it('fires exactly at the threshold, once', () => {
		expect(rankForXp(499).code).toBe('cadet');
		expect(rankForXp(500).code).toBe('constable');
		expect(rankForXp(501).code).toBe('constable'); // no double-fire past it
		expect(rankForXp(56000).code).toBe('dg');
	});
	it('rankProgress reports the band correctly', () => {
		const p = rankProgress(5940); // Screen 02 mockup: 5,940 / 7,500 → SI
		expect(p.current.code).toBe('si');
		expect(p.next?.code).toBe('inspector');
		expect(p.next?.xp).toBe(7500);
		expect(p.pct).toBe(Math.round(((5940 - 5200) / (7500 - 5200)) * 100));
	});
	it('DG is terminal — 100% with no next', () => {
		const p = rankProgress(60000);
		expect(p.next).toBe(null);
		expect(p.pct).toBe(100);
	});
});

/* ---------- streaks (IST days, auto-freezes) ---------- */

const st = (current: number, freezes: number, last: string, best = current): StreakState => ({
	current,
	best,
	freezes,
	last
});

describe('streakStep', () => {
	it('first ever activity starts at 1', () => {
		const s = streakStep(st(0, 2, ''), '2026-07-01');
		expect(s).toMatchObject({ current: 1, best: 1, freezes: 2, counted: true, freezesUsed: 0 });
	});
	it('second activity same day does not double-count', () => {
		const s = streakStep(st(3, 2, '2026-07-03'), '2026-07-03');
		expect(s.counted).toBe(false);
		expect(s.current).toBe(3);
	});
	it('consecutive day increments', () => {
		const s = streakStep(st(3, 2, '2026-07-03'), '2026-07-04');
		expect(s).toMatchObject({ current: 4, freezes: 2, freezesUsed: 0 });
	});

	it('ACCEPTANCE: 3-day pattern with 1 gap consumes exactly 1 freeze and preserves the streak', () => {
		// day 1 active → day 2 skipped → day 3 active
		let s: StreakState = st(0, 2, '');
		s = streakStep(s, '2026-07-01'); // streak 1
		expect(s.current).toBe(1);
		const day3 = streakStep(s, '2026-07-03'); // gap of 1 day
		expect(day3.freezesUsed).toBe(1);
		expect(day3.freezes).toBe(1); // exactly one consumed
		expect(day3.current).toBe(2); // streak preserved and advanced
	});

	it('gap of 2 with 2 freezes burns both and preserves', () => {
		const s = streakStep(st(5, 2, '2026-07-01'), '2026-07-04');
		expect(s).toMatchObject({ current: 6, freezes: 0, freezesUsed: 2 });
	});
	it('gap larger than freezes breaks the chain', () => {
		const s = streakStep(st(9, 2, '2026-07-01'), '2026-07-05'); // gap 3 > 2
		expect(s).toMatchObject({ current: 1, freezes: 2, freezesUsed: 0 });
		expect(s.best).toBe(9); // best survives
	});
	it('daysBetween is calendar-exact', () => {
		expect(daysBetween('2026-07-01', '2026-07-03')).toBe(2);
	});
});
