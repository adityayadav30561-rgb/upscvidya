/** XP + streak math (build book Prompt 09) — pure client mirror of
 *  pb/pb_hooks/lib/xp.js. The unit-test table in __tests__/xp.test.ts guards
 *  both implementations; change them together. XP is only ever WRITTEN
 *  server-side — this module exists for previews, optimistic UI and tests. */
import { RANKS, rankForXp, type RankCode } from './ranks';

export { RANKS, rankForXp };

/** tier multiplier: T1-2 ×1.0, T3 ×1.4, T4 ×1.8, T5 ×2.2 */
export function tierMult(tier: number): number {
	return tier <= 2 ? 1.0 : tier === 3 ? 1.4 : tier === 4 ? 1.8 : 2.2;
}

/** XP for one correct topic-quiz answer (0 when anti-farmed). */
export function answerXp(tier: number, farmed: boolean): number {
	return farmed ? 0 : Math.round(10 * tierMult(tier));
}

/** XP for one correct SR review: 8 flat, 12 if the card ever lapsed. */
export function srReviewXp(lapses: number): number {
	return lapses >= 1 ? 12 : 8;
}

export const CONQUER_BONUS = 100;
export const GOLD_BONUS = 150;
export const REGION_BONUS = 500;
export const DRILL_XP = 40;
export const MOCK_XP = 200; // + score-scaled bonus (Prompt 11)
export const DAILY_CA_XP = 30; // Prompt 13

export interface QuizItemXp {
	tier: number;
	correct: boolean;
	farmed: boolean;
}

/** Total XP for a finished topic quiz (mirrors the server finish handler). */
export function quizXp(
	items: QuizItemXp[],
	opts: { newlyConquered: boolean; gold: boolean; regionComplete: boolean }
): number {
	let sum = 0;
	for (const it of items) if (it.correct) sum += answerXp(it.tier, it.farmed);
	if (opts.gold) sum += GOLD_BONUS;
	else if (opts.newlyConquered) sum += CONQUER_BONUS;
	if (opts.regionComplete) sum += REGION_BONUS;
	return sum;
}

/** progress toward the next rank, for the header XP bar */
export function rankProgress(xp: number): {
	current: (typeof RANKS)[number];
	next: (typeof RANKS)[number] | null;
	pct: number; // 0-100 within the current band
} {
	const current = rankForXp(xp);
	const i = RANKS.findIndex((r) => r.code === current.code);
	const next = i < RANKS.length - 1 ? RANKS[i + 1] : null;
	const pct = next ? Math.min(100, Math.round(((xp - current.xp) / (next.xp - current.xp)) * 100)) : 100;
	return { current, next, pct };
}

/* ---------- streak (Asia/Kolkata days) ---------- */

export interface StreakState {
	current: number;
	best: number;
	freezes: number;
	last: string; // YYYY-MM-DD IST, '' if never active
}

export interface StreakStep extends StreakState {
	counted: boolean;
	freezesUsed: number;
}

export function istDate(ms = Date.now()): string {
	return new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
	return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/** One qualifying activity on `today`. Freezes auto-apply to gap days; a gap
 *  larger than the remaining freezes breaks the chain. */
export function streakStep(state: StreakState, today: string): StreakStep {
	const { current, best, freezes, last } = state;
	if (last === today) return { current, best, freezes, last, counted: false, freezesUsed: 0 };

	let next: number;
	let used = 0;
	let left = freezes;
	if (!last) {
		next = 1;
	} else {
		const gap = daysBetween(last, today) - 1;
		if (gap <= 0) next = current + 1;
		else if (gap <= freezes) {
			used = gap;
			left = freezes - gap;
			next = current + 1;
		} else {
			next = 1;
		}
	}
	return { current: next, best: Math.max(best, next), freezes: left, last: today, counted: true, freezesUsed: used };
}

/** Streak milestones that award badges. */
export const STREAK_MILESTONES = [7, 30, 100] as const;

/** Badge catalogue (codes must match server awards). */
export const BADGES: Record<string, { label: string; hint: string }> = {
	first_conquest: { label: 'First Conquest', hint: 'Conquer your first territory' },
	region_foundations: { label: 'Foundations Secured', hint: 'Conquer all of Foundations' },
	region_system: { label: 'System Secured', hint: 'Conquer all of The System' },
	region_centre: { label: 'Centre Secured', hint: 'Conquer all of The Centre' },
	region_states: { label: 'States Secured', hint: 'Conquer all of The States' },
	region_grassroots: { label: 'Grassroots Secured', hint: 'Conquer Grassroots & Territories' },
	region_institutions: { label: 'Institutions Secured', hint: 'Conquer all of The Institutions' },
	region_dynamics: { label: 'Dynamics Secured', hint: 'Conquer Dynamics & Dimensions' },
	region_courtroom: { label: 'Courtroom Secured', hint: 'Conquer The Courtroom & The World' },
	streak_7: { label: '7-Day Streak', hint: 'Study 7 days straight' },
	streak_30: { label: '30-Day Streak', hint: 'Study 30 days straight' },
	streak_100: { label: '100-Day Streak', hint: 'Study 100 days straight' },
	pet_ready: { label: 'PET Ready', hint: 'Hit every PET standard' },
	mock_finisher: { label: 'Mock Finisher', hint: 'Submit your first mock test' },
	beta_founder: { label: 'Beta Founder', hint: 'Enlisted during the beta' }
};

export type { RankCode };
