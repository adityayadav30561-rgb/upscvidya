/** The real CAPF ladder — 14 grades (Foundations §04). Design is source of
 *  truth: codes, display names, and XP thresholds all come from the design.
 *  Server-side XP logic (pb_hooks, Prompt 09) mirrors this table — keep both
 *  in sync (pb/pb_hooks reads its own copy; single source documented in
 *  pb/SCHEMA.md). */

export const RANKS = [
	{ code: 'cadet', label: 'Cadet', xp: 0 },
	{ code: 'constable', label: 'Constable', xp: 500 },
	{ code: 'sr_constable', label: 'Sr. Constable', xp: 1200 },
	{ code: 'head_constable', label: 'Head Constable', xp: 2200 },
	{ code: 'asi', label: 'Asst. Sub Inspector', xp: 3500 },
	{ code: 'si', label: 'Sub Inspector', xp: 5200 },
	{ code: 'inspector', label: 'Inspector', xp: 7500 },
	{ code: 'ac', label: 'Assistant Commandant', xp: 10500 }, // target rank
	{ code: 'dc', label: 'Deputy Commandant', xp: 14500 },
	{ code: 'second_in_command', label: 'Second in Command', xp: 19500 },
	{ code: 'commandant', label: 'Commandant', xp: 26000 },
	{ code: 'dig', label: 'Dy. Inspector General', xp: 34000 },
	{ code: 'ig', label: 'Inspector General', xp: 44000 },
	{ code: 'dg', label: 'Director General', xp: 56000 }
] as const;

export type RankCode = (typeof RANKS)[number]['code'];

export const RANK_CODES = RANKS.map((r) => r.code) as RankCode[];

export function rankForXp(xp: number) {
	let current: (typeof RANKS)[number] = RANKS[0];
	for (const r of RANKS) if (xp >= r.xp) current = r;
	return current;
}

export function nextRank(code: RankCode) {
	const i = RANKS.findIndex((r) => r.code === code);
	return i >= 0 && i < RANKS.length - 1 ? RANKS[i + 1] : null;
}
