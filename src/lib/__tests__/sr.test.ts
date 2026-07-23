import { describe, expect, it } from 'vitest';
import { sm2, requeue, sessionSplit, type Sm2State } from '../sr';

const st = (reps: number, ease: number, interval: number, lapses = 0): Sm2State => ({
	reps,
	ease,
	interval,
	lapses,
	suspended: false
});

/** THE documented SM-2 table (build book Prompt 08 acceptance).
 *  pb_hooks/sr.pb.js inlines identical math — change both together. */
describe('SM-2 table: (state, grade) → (reps, interval, ease)', () => {
	const table: {
		name: string;
		in: Sm2State;
		grade: 'again' | 'good' | 'easy';
		out: Partial<Sm2State>;
	}[] = [
		// fresh card from a quiz miss (reps 0, ease 2.5, interval 0)
		{ name: 'rep1 good → 1d', in: st(0, 2.5, 0), grade: 'good', out: { reps: 1, interval: 1, ease: 2.5 } },
		{ name: 'rep2 good → 6d', in: st(1, 2.5, 1), grade: 'good', out: { reps: 2, interval: 6, ease: 2.5 } },
		{ name: 'rep3 good → round(6·2.5)=15d', in: st(2, 2.5, 6), grade: 'good', out: { reps: 3, interval: 15, ease: 2.5 } },
		{ name: 'rep4 good → round(15·2.5)=38d', in: st(3, 2.5, 15), grade: 'good', out: { reps: 4, interval: 38, ease: 2.5 } },
		{ name: 'rep5 good → 38·2.5=95 capped at 60d', in: st(4, 2.5, 38), grade: 'good', out: { reps: 5, interval: 60 } },
		// easy: same interval ladder, ease +0.1 (acceptance: ≥4 days on rep 2)
		{ name: 'rep2 easy → 6d (≥4) and ease 2.6', in: st(1, 2.5, 1), grade: 'easy', out: { reps: 2, interval: 6, ease: 2.6 } },
		// again: lapse — reps reset, 1d, ease −0.2 floored at 1.3
		{ name: 'again → lapse to 1d, ease 2.3, lapses+1', in: st(3, 2.5, 15, 1), grade: 'again', out: { reps: 0, interval: 1, ease: 2.3, lapses: 2 } },
		{ name: 'again at ease 1.4 → floor 1.3', in: st(2, 1.4, 6), grade: 'again', out: { reps: 0, interval: 1, ease: 1.3 } },
		{ name: 'again at floor stays 1.3', in: st(0, 1.3, 1, 4), grade: 'again', out: { reps: 0, interval: 1, ease: 1.3, lapses: 5 } },
		// low ease growth
		{ name: 'rep3 good at ease 1.3 → round(6·1.3)=8d', in: st(2, 1.3, 6), grade: 'good', out: { reps: 3, interval: 8, ease: 1.3 } }
	];

	for (const row of table) {
		it(row.name, () => {
			const out = sm2(row.in, row.grade);
			for (const [k, v] of Object.entries(row.out)) {
				expect(out[k as keyof Sm2State], k).toBe(v);
			}
			expect(out.suspended).toBe(false);
		});
	}

	it('mastered suspends without touching schedule state', () => {
		const out = sm2(st(3, 2.5, 15, 1), 'mastered');
		expect(out.suspended).toBe(true);
		expect(out.reps).toBe(3);
		expect(out.interval).toBe(15);
	});
});

describe('requeue (session behaviour)', () => {
	it('"again" sends the card to the tail of the same session', () => {
		expect(requeue(['a', 'b', 'c'], 'a', 'again')).toEqual(['b', 'c', 'a']);
	});
	it('"good"/"easy"/"mastered" drop the card from the queue', () => {
		expect(requeue(['a', 'b', 'c'], 'a', 'good')).toEqual(['b', 'c']);
		expect(requeue(['a', 'b'], 'b', 'easy')).toEqual(['a']);
		expect(requeue(['a', 'b'], 'a', 'mastered')).toEqual(['b']);
	});
});

describe('sessionSplit', () => {
	it('caps a sitting at 25 and defers the rest', () => {
		expect(sessionSplit(14)).toEqual({ now: 14, later: 0 });
		expect(sessionSplit(25)).toEqual({ now: 25, later: 0 });
		expect(sessionSplit(39)).toEqual({ now: 25, later: 14 });
	});
});
