/** PYQ Vault client (build book Prompt 12) — fully free, works logged out.
 *  Every call goes to the public /api/pyq/* endpoints; the Authorization
 *  header is attached only when a session exists, which upgrades the response
 *  with per-user attempt state. */
import { pb } from './pb';
import { PUBLIC_PB_URL } from '$env/static/public';

export interface PyqYear {
	key: string; // CAPF-2024
	exam: string;
	year: number;
	count: number;
	topic_count: number;
	attempted: number;
}

export interface PyqTopic {
	code: string;
	title: string;
	region: string;
	count: number;
}

export interface PyqIndex {
	years: PyqYear[];
	topics: PyqTopic[];
	total: number;
	papers: number;
	attempted: number;
	correct: number;
}

export interface PyqQuestion {
	qid: string;
	stem: string;
	options: string[];
	tier: number;
	format: string;
	topic_code: string;
	topic_title: string;
	exam: string;
	year: number | null;
	qno: number | null;
	/** how many papers have asked this — the "asked 3×" recurrence chip */
	asked_times: number;
	attempted: boolean | null;
	was_correct: boolean | null;
}

export interface PyqCheck {
	qid: string;
	correct_index: number;
	is_correct: boolean;
	explanation: string;
	recorded: boolean;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	// optional auth: the vault is public, a session just adds progress tracking
	if (pb.authStore.isValid) headers.Authorization = pb.authStore.token;
	const res = await fetch(`${PUBLIC_PB_URL}${path}`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body)
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data?.message || 'PYQ request failed');
	return data as T;
}

export const fetchPyqIndex = () => post<PyqIndex>('/api/pyq/index', {});
export const fetchPyqPaper = (opts: { year?: string | number; topic?: string }) =>
	post<{ year: string | null; topic: string | null; questions: PyqQuestion[] }>('/api/pyq/paper', {
		year: opts.year ? String(opts.year) : '',
		topic: opts.topic ?? ''
	});
export const checkPyq = (qid: string, choice: number, ms = 0) =>
	post<PyqCheck>('/api/pyq/check', { qid, choice, ms });
export const attemptPyqPaper = (year: string | number) =>
	post<{ attempt_id: string; test_id: string; resumed: boolean }>('/api/pyq/attempt-paper', {
		year: String(year)
	});

/* ---------- anonymous nudge (pure, unit-tested) ---------- */

/** Soft signup nudge after N answered questions while logged out. It never
 *  blocks the current question — the answer is always revealed first. */
export const NUDGE_AFTER = 5;
const NUDGE_KEY = 'pyq-anon-answers';

export function anonAnswerCount(): number {
	if (typeof localStorage === 'undefined') return 0;
	const n = Number(localStorage.getItem(NUDGE_KEY));
	return Number.isFinite(n) && n > 0 ? n : 0;
}

export function recordAnonAnswer(): number {
	if (typeof localStorage === 'undefined') return 0;
	const next = anonAnswerCount() + 1;
	localStorage.setItem(NUDGE_KEY, String(next));
	return next;
}

export function resetAnonAnswers() {
	if (typeof localStorage !== 'undefined') localStorage.removeItem(NUDGE_KEY);
}

/** Show the nudge exactly on the 5th answer and every 5th thereafter. */
export function shouldNudge(count: number, loggedIn: boolean): boolean {
	if (loggedIn || count <= 0) return false;
	return count % NUDGE_AFTER === 0;
}

/* ---------- filters ---------- */

export type PyqFilter = 'all' | 'unattempted' | 'wrong';

export function filterQuestions(qs: PyqQuestion[], filter: PyqFilter): PyqQuestion[] {
	if (filter === 'unattempted') return qs.filter((q) => !q.attempted);
	if (filter === 'wrong') return qs.filter((q) => q.attempted && q.was_correct === false);
	return qs;
}

/** "10/22 attempted" / "complete ✓" / "untouched" */
export function paperProgressLabel(y: PyqYear): string {
	if (y.attempted === 0) return 'untouched';
	if (y.attempted >= y.count) return 'complete ✓';
	return `${y.attempted}/${y.count} attempted`;
}
