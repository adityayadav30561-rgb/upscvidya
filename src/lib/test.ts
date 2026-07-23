/** Test centre client: sectionals + mocks (build book Prompt 11).
 *  Scoring/percentile mirrors pb_hooks/test.pb.js; the pure functions here are
 *  the documented reference and are unit-tested — change both together. */
import { pb } from './pb';
import { PUBLIC_PB_URL } from '$env/static/public';
import type { Region } from './types';

export interface Marking {
	correct: number;
	negative: number;
}

/** CAPF default: +2 correct, −1/3 of 2 marks wrong. */
export const CAPF_MARKING: Marking = { correct: 2, negative: 0.667 };

/** Net score with negative marking, rounded to 2dp (skipped never penalised). */
export function scoreTest(correct: number, wrong: number, marking = CAPF_MARKING): number {
	return Math.round((correct * marking.correct - wrong * marking.negative) * 100) / 100;
}

/** Percent of submitted attempts scoring strictly below `score`. */
export function percentileOf(score: number, allScores: number[]): number | null {
	if (allScores.length === 0) return null;
	const below = allScores.filter((s) => s < score).length;
	return Math.round((below / allScores.length) * 100);
}

/** Palette cell state for the mock player grid. */
export type PaletteState = 'answered' | 'marked' | 'unanswered' | 'current';

export function paletteStates(
	questions: { qid: string }[],
	answers: Record<string, number>,
	marked: Record<string, boolean>,
	current: number
): PaletteState[] {
	return questions.map((q, i) => {
		if (i === current) return 'current';
		if (marked[q.qid]) return 'marked';
		return answers[q.qid] !== undefined && answers[q.qid] !== null ? 'answered' : 'unanswered';
	});
}

export function countPalette(states: PaletteState[]) {
	return {
		answered: states.filter((s) => s === 'answered').length,
		marked: states.filter((s) => s === 'marked').length,
		unanswered: states.filter((s) => s === 'unanswered').length
	};
}

/** "1:23:07" clock for the mock timer. */
export function formatClock(seconds: number): string {
	const s = Math.max(0, Math.floor(seconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	const mm = String(m).padStart(2, '0');
	const ss = String(sec).padStart(2, '0');
	return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Warning thresholds: 10-minute and 2-minute calls (build book). */
export type TimerWarning = 'ten' | 'two' | null;
export function timerWarning(remaining: number, previous: number): TimerWarning {
	if (previous > 600 && remaining <= 600) return 'ten';
	if (previous > 120 && remaining <= 120) return 'two';
	return null;
}

/* ---------- API ---------- */

export interface MockCard {
	id: string;
	title: string;
	is_free: boolean;
	locked: boolean;
	count: number;
	duration_sec: number;
	negative: number;
	blurb: string;
	attempted: boolean;
}

export interface HistoryRow {
	attempt_id: string;
	title: string;
	kind: 'sectional' | 'mock';
	score: number;
	max_score: number;
	percentile: number | null;
	submitted_at: string;
}

export interface TestQuestion {
	index: number;
	qid: string;
	stem: string;
	options: string[];
	tier: number;
	format: string;
	region: string;
}

export interface TestState {
	attempt_id: string;
	title: string;
	kind: 'sectional' | 'mock';
	submitted: boolean;
	duration_sec: number;
	remaining_sec: number;
	marking: Marking;
	questions: TestQuestion[];
	answers: Record<string, number>;
	marked: Record<string, boolean>;
	/** pinned paper order for dynamically-composed mocks; echo it back on save */
	pinned_qids: string[] | null;
}

export interface TestResult {
	attempt_id: string;
	title: string;
	kind: 'sectional' | 'mock';
	score: number;
	max_score: number;
	correct: number;
	wrong: number;
	skipped: number;
	marking: Marking;
	percentile: number | null;
	regions: { region: string; correct: number; total: number }[];
	tiers: { tier: number; correct: number; total: number }[];
	weakest_region: string | null;
	xp_awarded: number;
	review: {
		index: number;
		qid: string;
		stem: string;
		options: string[];
		tier: number;
		region: string;
		chosen: number | null;
		correct_index: number;
		is_correct: boolean;
		explanation: string;
		marked: boolean;
	}[];
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
	const res = await fetch(`${PUBLIC_PB_URL}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
		body: JSON.stringify(body)
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data?.message || 'Test request failed');
	return data as T;
}

export const fetchCatalogue = () => post<{ mocks: MockCard[]; history: HistoryRow[] }>('/api/test/catalogue', {});
export const startSectional = (regions: Region[], tiers: [number, number], count: number) =>
	post<{ attempt_id: string; test_id: string }>('/api/test/sectional', { regions, tiers, count });
export const startMock = (test_id: string) =>
	post<{ attempt_id: string; test_id: string; resumed: boolean }>('/api/test/start', { test_id });
export const fetchTestState = (attempt_id: string) => post<TestState>('/api/test/state', { attempt_id });
export const submitTest = (attempt_id: string) => post<TestResult>('/api/test/submit', { attempt_id });

/** Persist answers + palette mid-attempt. The collection rules allow the owner
 *  to write these two fields only; score/started_at stay server-owned. */
export async function saveProgress(
	attempt_id: string,
	answers: Record<string, number>,
	palette: Record<string, unknown>
): Promise<void> {
	await pb.collection('test_attempts').update(attempt_id, { answers, palette_state: palette });
}
