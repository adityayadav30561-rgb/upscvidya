import { describe, expect, it } from 'vitest';
import {
	formatCountdown,
	isFinalStretch,
	podiumOrder,
	listRows,
	deltaLabel,
	type BoardRow
} from '../board';

const row = (over: Partial<BoardRow>): BoardRow => ({
	rank: 1,
	name: 'Cadet',
	rank_code: 'cadet',
	streak: 0,
	xp_week: 0,
	is_you: false,
	delta: null,
	...over
});

describe('formatCountdown', () => {
	it('matches the design chip formats', () => {
		expect(formatCountdown(2 * 86400 + 14 * 3600)).toBe('2d 14h');
		expect(formatCountdown(14 * 3600 + 5 * 60)).toBe('14h 05m');
		expect(formatCountdown(48 * 60)).toBe('48m');
		expect(formatCountdown(0)).toBe('resetting');
	});
});

describe('isFinalStretch', () => {
	it('flags the last 6 hours only', () => {
		expect(isFinalStretch(7 * 3600)).toBe(false);
		expect(isFinalStretch(6 * 3600)).toBe(true);
		expect(isFinalStretch(60)).toBe(true);
		expect(isFinalStretch(0)).toBe(false);
	});
});

describe('podium', () => {
	const rows = [
		row({ rank: 1, name: 'Vikram', xp_week: 2410 }),
		row({ rank: 2, name: 'Priya', xp_week: 2140 }),
		row({ rank: 3, name: 'Anish', xp_week: 1980 }),
		row({ rank: 4, name: 'Meera', xp_week: 1870 })
	];
	it('orders pillars silver-gold-bronze for the design layout', () => {
		expect(podiumOrder(rows).map((r) => r?.name)).toEqual(['Priya', 'Vikram', 'Anish']);
	});
	it('tolerates a battalion with fewer than 3 scorers', () => {
		expect(podiumOrder([rows[0]]).map((r) => r?.name ?? null)).toEqual([null, 'Vikram', null]);
		expect(podiumOrder([])).toEqual([null, null, null]);
	});
	it('list starts at rank 4', () => {
		expect(listRows(rows).map((r) => r.name)).toEqual(['Meera']);
	});
});

describe('deltaLabel', () => {
	it('renders climb + gap like the mockup', () => {
		expect(deltaLabel(row({ rank: 7, delta: 2 }), 340)).toBe('▲ 2 this week · 340 XP behind #6');
	});
	it('renders a drop', () => {
		expect(deltaLabel(row({ rank: 9, delta: -3 }), null)).toBe('▼ 3 this week');
	});
	it('is empty for a new user at the top with no history', () => {
		expect(deltaLabel(row({ rank: 1, delta: null }), null)).toBe('');
	});
});
