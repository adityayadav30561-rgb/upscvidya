/** Daily Briefing + admin queue client (build book Prompt 13). */
import { pb } from './pb';
import { PUBLIC_PB_URL } from '$env/static/public';

export interface CaQuizQuestion {
	qid: string;
	stem: string;
	options: string[];
}

export interface CaItem {
	id: string;
	date: string;
	headline: string;
	summary: string;
	source_name: string;
	source_url: string;
	category: string;
	exam_angle: string;
	linked_topics: string[];
	quiz: CaQuizQuestion[];
	quiz_answered: number;
}

export interface Briefing {
	date: string;
	locked: boolean;
	premium: boolean;
	dates: string[];
	items: CaItem[];
	message?: string;
}

export interface CaAnswer {
	qid: string;
	correct_index: number;
	is_correct: boolean;
	explanation: string;
	already: boolean;
}

/* admin queue shapes */
export interface QueueCaItem {
	id: string;
	headline: string;
	summary: string;
	source_name: string;
	source_url: string;
	category: string;
	confidence: number;
	exam_angle: string;
	linked_topics: string[];
	dupe_score: number;
	dupe_of: string;
	questions: {
		id: string;
		qid: string;
		stem: string;
		options: string[];
		answer_index: number;
		explanation: string;
		tier: number;
		status: string;
	}[];
}

export interface QueueMcq {
	id: string;
	qid: string;
	stem: string;
	options: string[];
	answer_index: number;
	explanation: string;
	tier: number;
	topic_title: string;
	source_type: string;
	dupe_score: number;
	dupe_of: string;
}

export interface AdminQueue {
	ca: QueueCaItem[];
	mcq: QueueMcq[];
	flagged: QueueMcq[];
	counts: { ca: number; mcq: number; flagged: number };
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (pb.authStore.isValid) headers.Authorization = pb.authStore.token;
	const res = await fetch(`${PUBLIC_PB_URL}${path}`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body)
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data?.message || 'Briefing request failed');
	return data as T;
}

export const fetchBriefing = (date?: string) => post<Briefing>('/api/ca/briefing', { date: date ?? '' });
export const answerCa = (qid: string, choice: number, ms = 0) =>
	post<CaAnswer>('/api/ca/answer', { qid, choice, ms });
export const completeBriefing = () =>
	post<{ xp_awarded: number; already: boolean; streak: { current: number } | null }>(
		'/api/ca/complete',
		{}
	);

export const fetchQueue = () => post<AdminQueue>('/api/ca/queue', {});
export const approveCa = (id: string, opts: { with_quiz?: boolean; summary?: string; headline?: string; linked_topics?: string[] } = {}) =>
	post<{ id: string; publish_date: string; scheduled: boolean; questions_published: number }>(
		'/api/ca/approve',
		{ id, ...opts }
	);
export const rejectCa = (id: string) => post<{ id: string; status: string }>('/api/ca/reject', { id });
export const rejectQuestion = (question_id: string) =>
	post<{ question_id: string; status: string }>('/api/ca/reject', { question_id });
export const publishQuestion = (question_id: string, edits: Record<string, unknown> = {}) =>
	post<{ question_id: string; status: string }>('/api/ca/publish-question', { question_id, ...edits });
export const batchApprove = (ids: string[], min_confidence = 0.92) =>
	post<{ approved: number; skipped: { id: string; reason: string }[] }>('/api/ca/batch', {
		ids,
		min_confidence
	});

/** Admin: paste a day's raw CA notes → AI drafts briefs + MCQs into the queue.
 *  (Or pass a pre-structured `items` array to author manually.) */
export interface ComposeResult {
	created: number;
	date: string;
	mode: 'ai' | 'manual';
	need_key?: boolean;
	detail: { headline: string; questions?: number; skipped?: string }[];
}
export const composeBriefing = (raw: string, date?: string) =>
	post<ComposeResult>('/api/ca/compose', { raw, date: date ?? '' });

/* ---------- Monthly Current Affairs ---------- */

export interface MonthlyMonth {
	month: string; // YYYY-MM
	items: number;
	questions: number;
	attempted: number;
	is_current: boolean;
}
export const fetchMonthlyIndex = () =>
	post<{ months: MonthlyMonth[]; current_month: string }>('/api/ca/monthly-index', {});
export const startMonthly = (month: string) =>
	post<{ attempt_id: string; test_id: string; resumed: boolean; count: number }>(
		'/api/ca/monthly-start',
		{ month }
	);

/** "July 2026" from a YYYY-MM key. */
export function monthLabel(month: string): string {
	const [y, m] = month.split('-').map(Number);
	if (!y || !m) return month;
	return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
}

/* ---------- pure helpers (unit-tested) ---------- */

/** IST calendar date, matching the server's day boundary. */
export function istToday(ms = Date.now()): string {
	return new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Free tier: today + yesterday. Anything older needs premium. */
export function isFreeDate(date: string, now = Date.now()): boolean {
	return date === istToday(now) || date === istToday(now - 86400000);
}

/** Last N dates for the date-strip calendar, newest first. */
export function dateStrip(n = 7, now = Date.now()): string[] {
	const out: string[] = [];
	for (let i = 0; i < n; i++) out.push(istToday(now - i * 86400000));
	return out;
}

export function prettyDate(date: string): string {
	const d = new Date(date + 'T00:00:00');
	return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function stripLabel(date: string, now = Date.now()): { day: string; num: string; today: boolean } {
	const d = new Date(date + 'T00:00:00');
	return {
		day: d.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase(),
		num: String(d.getDate()),
		today: date === istToday(now)
	};
}

/** Batch-approve selection: only low-risk items clear the bar automatically. */
export const BATCH_CONFIDENCE = 0.92;
export function lowRiskIds(items: { id: string; confidence: number }[], threshold = BATCH_CONFIDENCE): string[] {
	return items.filter((i) => i.confidence >= threshold).map((i) => i.id);
}
