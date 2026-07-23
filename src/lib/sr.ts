/** Spaced repetition client (build book Prompt 08).
 *  sm2() is the canonical documented implementation — pb_hooks/sr.pb.js inlines
 *  the same math (JSVM can't import TS); the unit-test table guards the pair.
 *  Grades: again | good | easy | mastered. The UI exposes Again/Good/Mastered
 *  per the design; "easy" stays in the engine (build-book acceptance). */
import { pb } from './pb';
import { PUBLIC_PB_URL } from '$env/static/public';

export type SrGrade = 'again' | 'good' | 'easy' | 'mastered';

export interface Sm2State {
	reps: number;
	ease: number;
	interval: number; // days
	lapses: number;
	suspended: boolean;
}

/** SM-2 with the build book's tuning: lapse on "again", 60-day cap. */
export function sm2(state: Sm2State, grade: SrGrade): Sm2State {
	let { reps, ease, interval } = state;
	const { lapses, suspended } = state;
	if (grade === 'mastered') {
		return { reps, ease, interval, lapses, suspended: true };
	}
	if (grade === 'again') {
		return {
			reps: 0,
			interval: 1,
			ease: Math.max(1.3, +(ease - 0.2).toFixed(2)),
			lapses: lapses + 1,
			suspended
		};
	}
	reps += 1;
	interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(interval * ease);
	if (interval > 60) interval = 60;
	if (grade === 'easy') ease = +(ease + 0.1).toFixed(2);
	return { reps, ease, interval, lapses, suspended };
}

/* ---------- API ---------- */

export interface SrCardView {
	card_id: string;
	qid: string;
	stem: string;
	format: string;
	tier: number;
	topic_code: string;
	topic_title: string;
	missed: number;
	reread: boolean;
	last_seen: string;
	next_good_days: number;
}

export interface SrDue {
	count: number;
	cards: SrCardView[];
	forecast: { day: string; count: number }[];
	decays: { code: string; title: string; days: number }[];
}

export interface SrReveal {
	card_id: string;
	answer: string;
	explanation: string;
}

export interface SrGradeResult {
	card_id: string;
	grade: SrGrade;
	reps: number;
	ease: number;
	interval_days: number;
	due_date: string | null;
	suspended: boolean;
	remaining_due: number;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
	const res = await fetch(`${PUBLIC_PB_URL}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
		body: JSON.stringify(body)
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data?.message || 'Revision request failed');
	return data as T;
}

export const fetchDue = () => post<SrDue>('/api/sr/due', {});
export const revealCard = (card_id: string) => post<SrReveal>('/api/sr/reveal', { card_id });
export const gradeCard = (card_id: string, grade: SrGrade) =>
	post<SrGradeResult>('/api/sr/grade', { card_id, grade });
export const startRestore = (code: string) =>
	post<{ session_id: string; code: string; reused: boolean }>('/api/sr/restore', { code });

/** Dashboard integration point (Prompt 09 consumes): today's due count. */
export async function fetchDueCount(): Promise<number> {
	try {
		return (await fetchDue()).count;
	} catch {
		return 0;
	}
}

/* ---------- session queue (pure, unit-tested) ---------- */

/** Session chunk: cap 25 per sitting (design: "14 now · 11 this evening"). */
export const SESSION_CAP = 25;

export function sessionSplit(total: number): { now: number; later: number } {
	const now = Math.min(total, SESSION_CAP);
	return { now, later: total - now };
}

/** "Again" sends the card to the tail of the current session (acceptance:
 *  reappears in the same session); other grades drop it. Returns next queue. */
export function requeue(queue: string[], cardId: string, grade: SrGrade): string[] {
	const rest = queue.filter((id) => id !== cardId);
	return grade === 'again' ? [...rest, cardId] : rest;
}
