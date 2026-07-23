/** The Drill Ground — fitness catalog + pure helpers (build book Prompt 16,
 *  pivoted to a training-only home-workout tracker).
 *
 *  The exercise + routine catalog lives here as constants (like polity.ts UNITS
 *  / ranks.ts) — versioned in code, no DB round-trip. Only the user's
 *  `workout_logs` hit PocketBase. Level bands give instant motivational feedback
 *  (the bodyweight parallel to the rank ladder); all the maths below is pure and
 *  unit-tested so charts/PBs/levels never drift.
 */

export type Group = 'push' | 'pull' | 'legs' | 'core' | 'cardio';
export type Metric = 'reps' | 'time' | 'distance' | 'amrap';
export type Equipment = 'none' | 'bar' | 'optional';

export interface LevelBand {
	label: 'Recruit' | 'Soldier' | 'Fighter' | 'Commando';
	min: number; // threshold on the exercise's `best` value (reps / seconds / metres)
}

export interface Exercise {
	code: string;
	name: string;
	group: Group;
	metric: Metric;
	unit: string; // display unit for a set value
	equipment: Equipment;
	muscle: string;
	bands: LevelBand[]; // ascending by min
	tip: string;
}

/** One recorded set. Only the field matching the metric is used. */
export interface WorkoutSet {
	reps?: number;
	seconds?: number;
	distance_m?: number;
}

const R = (label: LevelBand['label'], min: number): LevelBand => ({ label, min });
const BANDS = (a: number, b: number, c: number): LevelBand[] => [
	R('Recruit', 0),
	R('Soldier', a),
	R('Fighter', b),
	R('Commando', c)
];

export const EXERCISES: Exercise[] = [
	// push
	{ code: 'pushups', name: 'Pushups', group: 'push', metric: 'reps', unit: 'reps', equipment: 'none', muscle: 'Chest · Triceps', bands: BANDS(15, 30, 50), tip: 'Elbows ~45°, body in a straight line.' },
	{ code: 'diamond_pushups', name: 'Diamond Pushups', group: 'push', metric: 'reps', unit: 'reps', equipment: 'none', muscle: 'Triceps', bands: BANDS(10, 20, 35), tip: 'Hands form a diamond under the chest.' },
	{ code: 'pike_pushups', name: 'Pike Pushups', group: 'push', metric: 'reps', unit: 'reps', equipment: 'none', muscle: 'Shoulders', bands: BANDS(8, 15, 25), tip: 'Hips high, head tracks the floor between hands.' },
	{ code: 'dips', name: 'Dips', group: 'push', metric: 'reps', unit: 'reps', equipment: 'optional', muscle: 'Triceps · Chest', bands: BANDS(8, 15, 30), tip: 'Two chairs or a bar; lower to 90°.' },
	// pull
	{ code: 'pullups', name: 'Pull-ups', group: 'pull', metric: 'reps', unit: 'reps', equipment: 'bar', muscle: 'Back · Biceps', bands: BANDS(3, 8, 15), tip: 'Full hang to chin over the bar.' },
	{ code: 'chinups', name: 'Chin-ups', group: 'pull', metric: 'reps', unit: 'reps', equipment: 'bar', muscle: 'Biceps · Back', bands: BANDS(4, 9, 16), tip: 'Underhand grip, shoulder width.' },
	{ code: 'inverted_rows', name: 'Inverted Rows', group: 'pull', metric: 'reps', unit: 'reps', equipment: 'optional', muscle: 'Back', bands: BANDS(8, 15, 25), tip: 'Under a sturdy table or low bar.' },
	// legs
	{ code: 'squats', name: 'Squats', group: 'legs', metric: 'reps', unit: 'reps', equipment: 'none', muscle: 'Quads · Glutes', bands: BANDS(25, 50, 80), tip: 'Thighs to parallel, heels planted.' },
	{ code: 'lunges', name: 'Lunges', group: 'legs', metric: 'reps', unit: 'reps', equipment: 'none', muscle: 'Legs', bands: BANDS(20, 40, 60), tip: 'Count both legs; knee tracks the toe.' },
	{ code: 'jump_squats', name: 'Jump Squats', group: 'legs', metric: 'reps', unit: 'reps', equipment: 'none', muscle: 'Legs · Power', bands: BANDS(15, 30, 50), tip: 'Land soft, sink straight into the next rep.' },
	{ code: 'wall_sit', name: 'Wall Sit', group: 'legs', metric: 'time', unit: 'sec', equipment: 'none', muscle: 'Quads', bands: BANDS(30, 60, 120), tip: 'Thighs parallel, back flat on the wall.' },
	{ code: 'calf_raises', name: 'Calf Raises', group: 'legs', metric: 'reps', unit: 'reps', equipment: 'none', muscle: 'Calves', bands: BANDS(25, 50, 100), tip: 'Full range, pause at the top.' },
	// core
	{ code: 'plank', name: 'Plank', group: 'core', metric: 'time', unit: 'sec', equipment: 'none', muscle: 'Core', bands: BANDS(30, 90, 180), tip: 'Squeeze glutes; no sagging hips.' },
	{ code: 'crunches', name: 'Crunches', group: 'core', metric: 'reps', unit: 'reps', equipment: 'none', muscle: 'Abs', bands: BANDS(20, 40, 70), tip: 'Curl the ribs down, slow on the way back.' },
	{ code: 'leg_raises', name: 'Leg Raises', group: 'core', metric: 'reps', unit: 'reps', equipment: 'none', muscle: 'Lower Abs', bands: BANDS(12, 25, 45), tip: 'Lower back stays pressed to the floor.' },
	{ code: 'russian_twists', name: 'Russian Twists', group: 'core', metric: 'reps', unit: 'reps', equipment: 'none', muscle: 'Obliques', bands: BANDS(20, 40, 70), tip: 'Rotate from the torso; count each side.' },
	{ code: 'mountain_climbers', name: 'Mountain Climbers', group: 'core', metric: 'reps', unit: 'reps', equipment: 'none', muscle: 'Core · Cardio', bands: BANDS(20, 40, 70), tip: 'Hips low, drive the knees fast.' },
	// cardio
	{ code: 'running', name: 'Running', group: 'cardio', metric: 'distance', unit: 'm', equipment: 'none', muscle: 'Endurance', bands: BANDS(1000, 3000, 5000), tip: 'Log distance; pace comes from time.' },
	{ code: 'skipping', name: 'Skipping', group: 'cardio', metric: 'reps', unit: 'skips', equipment: 'optional', muscle: 'Cardio · Calves', bands: BANDS(50, 150, 300), tip: 'Wrists turn the rope, not the arms.' },
	{ code: 'burpees', name: 'Burpees', group: 'cardio', metric: 'reps', unit: 'reps', equipment: 'none', muscle: 'Full body', bands: BANDS(10, 25, 50), tip: 'Chest to floor, jump at the top.' },
	{ code: 'high_knees', name: 'High Knees', group: 'cardio', metric: 'time', unit: 'sec', equipment: 'none', muscle: 'Cardio', bands: BANDS(30, 60, 120), tip: 'Knees to hip height, quick turnover.' }
];

const EX_BY_CODE = new Map(EXERCISES.map((e) => [e.code, e]));
export const exerciseByCode = (code: string): Exercise | undefined => EX_BY_CODE.get(code);

export const GROUPS: { key: Group; label: string }[] = [
	{ key: 'push', label: 'Push' },
	{ key: 'pull', label: 'Pull' },
	{ key: 'legs', label: 'Legs' },
	{ key: 'core', label: 'Core' },
	{ key: 'cardio', label: 'Cardio' }
];

/* ---------- guided circuits ---------- */

export interface RoutineBlock {
	exercise_code: string;
	mode: 'reps' | 'time';
	target: number; // reps, or seconds for a timed block
	rest_sec: number;
}
export interface Routine {
	code: string;
	name: string;
	focus: Group | 'full';
	duration_min: number;
	equipment: Equipment;
	difficulty: 'Recruit' | 'Soldier' | 'Fighter';
	rounds: number;
	blocks: RoutineBlock[];
	blurb: string;
}

export const ROUTINES: Routine[] = [
	{
		code: 'recruit_bootcamp', name: 'Recruit Bootcamp', focus: 'full', duration_min: 15,
		equipment: 'none', difficulty: 'Recruit', rounds: 3,
		blurb: 'Full-body starter — the daily parade-ground standard.',
		blocks: [
			{ exercise_code: 'pushups', mode: 'reps', target: 12, rest_sec: 30 },
			{ exercise_code: 'squats', mode: 'reps', target: 20, rest_sec: 30 },
			{ exercise_code: 'plank', mode: 'time', target: 40, rest_sec: 30 },
			{ exercise_code: 'mountain_climbers', mode: 'reps', target: 30, rest_sec: 45 }
		]
	},
	{
		code: 'core_assault', name: 'Core Assault', focus: 'core', duration_min: 10,
		equipment: 'none', difficulty: 'Soldier', rounds: 3,
		blurb: 'Ten minutes that make the midsection beg for mercy.',
		blocks: [
			{ exercise_code: 'plank', mode: 'time', target: 40, rest_sec: 20 },
			{ exercise_code: 'leg_raises', mode: 'reps', target: 15, rest_sec: 20 },
			{ exercise_code: 'russian_twists', mode: 'reps', target: 20, rest_sec: 20 },
			{ exercise_code: 'crunches', mode: 'reps', target: 20, rest_sec: 40 }
		]
	},
	{
		code: 'push_power', name: 'Push Power', focus: 'push', duration_min: 12,
		equipment: 'none', difficulty: 'Soldier', rounds: 3,
		blurb: 'Chest, shoulders, triceps — no equipment, no excuses.',
		blocks: [
			{ exercise_code: 'pushups', mode: 'reps', target: 15, rest_sec: 30 },
			{ exercise_code: 'diamond_pushups', mode: 'reps', target: 10, rest_sec: 30 },
			{ exercise_code: 'pike_pushups', mode: 'reps', target: 10, rest_sec: 40 }
		]
	},
	{
		code: 'endurance_march', name: 'Endurance March', focus: 'cardio', duration_min: 18,
		equipment: 'none', difficulty: 'Fighter', rounds: 4,
		blurb: 'Lungs and legs. Keep moving; the finish line is four rounds out.',
		blocks: [
			{ exercise_code: 'burpees', mode: 'reps', target: 12, rest_sec: 20 },
			{ exercise_code: 'high_knees', mode: 'time', target: 30, rest_sec: 20 },
			{ exercise_code: 'jump_squats', mode: 'reps', target: 15, rest_sec: 20 },
			{ exercise_code: 'skipping', mode: 'reps', target: 40, rest_sec: 30 }
		]
	}
];

const RT_BY_CODE = new Map(ROUTINES.map((r) => [r.code, r]));
export const routineByCode = (code: string): Routine | undefined => RT_BY_CODE.get(code);

/* ---------- pure maths (unit-tested) ---------- */

/** The value a set contributes for this metric (reps / seconds / metres). */
export function setValue(metric: Metric, s: WorkoutSet): number {
	if (metric === 'time') return s.seconds ?? 0;
	if (metric === 'distance') return s.distance_m ?? 0;
	return s.reps ?? 0; // reps + amrap
}

/** Summarise a list of sets into total volume + best single set. */
export function summarizeSets(metric: Metric, sets: WorkoutSet[]): { total: number; best: number } {
	let total = 0;
	let best = 0;
	for (const s of sets) {
		const v = setValue(metric, s);
		total += v;
		if (v > best) best = v;
	}
	return { total, best };
}

export interface Level {
	index: number; // 0..3
	label: LevelBand['label'];
	next: LevelBand | null; // the band above, or null at the top
}

/** Level for a `best` value against an exercise's bands. */
export function levelFor(ex: Exercise, best: number): Level {
	let idx = 0;
	for (let i = 0; i < ex.bands.length; i++) if (best >= ex.bands[i].min) idx = i;
	return { index: idx, label: ex.bands[idx].label, next: ex.bands[idx + 1] ?? null };
}

/** Weekly readiness ring fraction (0..1). */
export function ringFraction(sessionsThisWeek: number, goal: number): number {
	if (goal <= 0) return 0;
	return Math.min(1, sessionsThisWeek / goal);
}

/** Monday-00:00 IST of the week containing `ms` (workout-week boundary). */
export function istWeekStartMs(ms: number): number {
	const ist = new Date(ms + 5.5 * 3600 * 1000);
	const day = ist.getUTCDay(); // 0=Sun after the IST shift
	const diff = day === 0 ? 6 : day - 1;
	const monday = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - diff);
	return monday - 5.5 * 3600 * 1000; // back to a real UTC instant
}

/** Count distinct workout DAYS in the current IST week from logged_at strings. */
export function sessionsThisWeek(loggedAts: string[], now = Date.now()): number {
	const weekStart = istWeekStartMs(now);
	const days = new Set<string>();
	for (const s of loggedAts) {
		const ms = Date.parse(String(s).replace(' ', 'T'));
		if (isNaN(ms) || ms < weekStart) continue;
		days.add(new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10));
	}
	return days.size;
}

/** Format a metric value for display. */
export function formatValue(metric: Metric, v: number): string {
	if (metric === 'time') {
		const m = Math.floor(v / 60);
		const s = Math.round(v % 60);
		return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
	}
	if (metric === 'distance') return v >= 1000 ? `${(v / 1000).toFixed(2)} km` : `${v} m`;
	return String(v);
}
