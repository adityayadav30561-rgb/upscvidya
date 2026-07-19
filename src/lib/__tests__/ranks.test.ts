import { describe, expect, it } from 'vitest';
import { RANKS, rankForXp, nextRank } from '$lib/ranks';

describe('ranks (design Foundations §04 thresholds)', () => {
	it('14 grades, strictly ascending XP', () => {
		expect(RANKS).toHaveLength(14);
		for (let i = 1; i < RANKS.length; i++) {
			expect(RANKS[i].xp).toBeGreaterThan(RANKS[i - 1].xp);
		}
	});

	it('design threshold spot checks', () => {
		expect(rankForXp(0).code).toBe('cadet');
		expect(rankForXp(499).code).toBe('cadet');
		expect(rankForXp(500).code).toBe('constable');
		expect(rankForXp(1200).code).toBe('sr_constable');
		expect(rankForXp(5940).code).toBe('si'); // dashboard mockup: 5,940 XP → SI
		expect(rankForXp(10500).code).toBe('ac');
		expect(rankForXp(56000).code).toBe('dg');
		expect(rankForXp(999999).code).toBe('dg');
	});

	it('nextRank walks the ladder and tops out', () => {
		expect(nextRank('cadet')?.code).toBe('constable');
		expect(nextRank('si')?.code).toBe('inspector');
		expect(nextRank('si')?.xp).toBe(7500); // mockup: "5,940 / 7,500 XP"
		expect(nextRank('dg')).toBeNull();
	});
});
