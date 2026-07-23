import { describe, expect, it } from 'vitest';
import {
	EXERCISES,
	ROUTINES,
	exerciseByCode,
	setValue,
	summarizeSets,
	levelFor,
	ringFraction,
	sessionsThisWeek,
	formatValue
} from '../pt';

describe('catalog integrity', () => {
	it('every exercise code is unique and resolvable', () => {
		const codes = EXERCISES.map((e) => e.code);
		expect(new Set(codes).size).toBe(codes.length);
		for (const e of EXERCISES) expect(exerciseByCode(e.code)).toBe(e);
	});
	it('every routine block references a real exercise', () => {
		for (const r of ROUTINES) {
			for (const b of r.blocks) expect(exerciseByCode(b.exercise_code), b.exercise_code).toBeTruthy();
		}
	});
	it('bands are ascending and start at Recruit 0', () => {
		for (const e of EXERCISES) {
			expect(e.bands[0]).toEqual({ label: 'Recruit', min: 0 });
			for (let i = 1; i < e.bands.length; i++) expect(e.bands[i].min).toBeGreaterThan(e.bands[i - 1].min);
		}
	});
});

describe('setValue + summarizeSets', () => {
	it('reads the right field per metric', () => {
		expect(setValue('reps', { reps: 12 })).toBe(12);
		expect(setValue('time', { seconds: 40 })).toBe(40);
		expect(setValue('distance', { distance_m: 2000 })).toBe(2000);
		expect(setValue('amrap', { reps: 30 })).toBe(30);
	});
	it('totals + best across sets', () => {
		expect(summarizeSets('reps', [{ reps: 12 }, { reps: 20 }, { reps: 8 }])).toEqual({ total: 40, best: 20 });
		expect(summarizeSets('time', [{ seconds: 40 }, { seconds: 90 }])).toEqual({ total: 130, best: 90 });
		expect(summarizeSets('reps', [])).toEqual({ total: 0, best: 0 });
	});
});

describe('levelFor', () => {
	const pushups = exerciseByCode('pushups')!; // bands 0/15/30/50
	it('maps best to the right band', () => {
		expect(levelFor(pushups, 0).label).toBe('Recruit');
		expect(levelFor(pushups, 14).label).toBe('Recruit');
		expect(levelFor(pushups, 15).label).toBe('Soldier');
		expect(levelFor(pushups, 35).label).toBe('Fighter');
		expect(levelFor(pushups, 60).label).toBe('Commando');
	});
	it('exposes the next band, null at the top', () => {
		expect(levelFor(pushups, 15).next?.label).toBe('Fighter');
		expect(levelFor(pushups, 60).next).toBeNull();
	});
});

describe('ringFraction', () => {
	it('is fraction of goal, capped at 1', () => {
		expect(ringFraction(2, 4)).toBe(0.5);
		expect(ringFraction(4, 4)).toBe(1);
		expect(ringFraction(6, 4)).toBe(1);
		expect(ringFraction(0, 4)).toBe(0);
		expect(ringFraction(3, 0)).toBe(0);
	});
});

describe('sessionsThisWeek', () => {
	// Fri 2026-07-24 12:00 UTC → 17:30 IST, so the IST week began Mon 2026-07-20.
	const now = Date.parse('2026-07-24T12:00:00Z');
	it('counts distinct workout days in the current IST week', () => {
		const logs = [
			'2026-07-20 06:00:00.000Z', // Mon (in week)
			'2026-07-22 06:00:00.000Z', // Wed (in week)
			'2026-07-22 18:00:00.000Z', // Wed again — same day, not double-counted
			'2026-07-19 06:00:00.000Z' // Sun before — previous week
		];
		expect(sessionsThisWeek(logs, now)).toBe(2);
	});
	it('is 0 with no logs', () => {
		expect(sessionsThisWeek([], now)).toBe(0);
	});
});

describe('formatValue', () => {
	it('reps as-is, time as clock, distance in km past 1000m', () => {
		expect(formatValue('reps', 20)).toBe('20');
		expect(formatValue('time', 45)).toBe('45s');
		expect(formatValue('time', 90)).toBe('1:30');
		expect(formatValue('distance', 800)).toBe('800 m');
		expect(formatValue('distance', 5000)).toBe('5.00 km');
	});
});
