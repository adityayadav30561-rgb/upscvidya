/** Quiz engine client (build book Prompt 07).
 *  Thin typed wrapper over the /api/quiz/* PocketBase hooks. The server owns
 *  answers and scoring; the client only renders and reports choices. */
import { pb } from './pb';
import { PUBLIC_PB_URL } from '$env/static/public';

export interface QuizQuestion {
	qid: string;
	index: number;
	stem: string;
	format: string;
	tier: number;
	options: string[];
	flagged: boolean;
	chosen: number | null;
	correct: boolean | null;
	/** present only for already-answered questions (resume/review) */
	correct_display_index?: number;
}

export interface QuizStart {
	session_id: string;
	code: string;
	kind: 'topic_quiz' | 'drill';
	timed: boolean;
	per_question_sec: number | null;
	questions: QuizQuestion[];
	status?: string;
}

export interface AnswerResult {
	qid: string;
	correct_display_index: number;
	is_correct: boolean;
	explanation: string;
	already?: boolean;
}

export interface TierScore {
	tier: number;
	correct: number;
	total: number;
}

export interface ReviewItem {
	qid: string;
	index: number;
	stem: string;
	tier: number;
	format: string;
	options: string[];
	chosen: number | null;
	is_correct: boolean | null;
	correct_display_index: number;
	explanation: string;
	flagged: boolean;
}

export interface QuizSummary {
	session_id: string;
	code: string;
	kind: 'topic_quiz' | 'drill';
	score_pct: number;
	correct: number;
	total: number;
	pass: boolean;
	gold: boolean;
	state: string | null;
	xp_awarded: number;
	xp_total: number;
	wrong_count: number;
	sr_added: number;
	tiers: TierScore[];
	review: ReviewItem[];
	/** Prompt 09: server-decided promotion — fires exactly once per crossing */
	rank_up: { from: string; to: string } | null;
	streak: { current: number; counted: boolean; freezes_used: number; freezes_left: number } | null;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
	const res = await fetch(`${PUBLIC_PB_URL}${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: pb.authStore.token
		},
		body: JSON.stringify(body)
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new QuizError(res.status, data?.message || 'Quiz request failed');
	return data as T;
}

export class QuizError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
		this.name = 'QuizError';
	}
}

export const startQuiz = (code: string) => post<QuizStart>('/api/quiz/start', { code });
export const resumeQuiz = (session_id: string) => post<QuizStart>('/api/quiz/state', { session_id });
export const answerQuiz = (session_id: string, qid: string, choice: number, ms: number) =>
	post<AnswerResult>('/api/quiz/answer', { session_id, qid, choice, ms });
export const flagQuiz = (session_id: string, qid: string, flagged: boolean) =>
	post<{ ok: boolean }>('/api/quiz/flag', { session_id, qid, flagged });
export const finishQuiz = (session_id: string) => post<QuizSummary>('/api/quiz/finish', { session_id });

/* ---------- pure helpers (unit-tested) ---------- */

export const TIER_LABELS: Record<number, string> = {
	1: 'Tier 1 · core',
	2: 'Tier 2 · std',
	3: 'Tier 3 · hard',
	4: 'Tier 4+ · elite'
};

/** progress-dot state for the player header strip */
export type DotState = 'done-correct' | 'done-wrong' | 'current' | 'upcoming';

export function dotStates(questions: QuizQuestion[], current: number): DotState[] {
	return questions.map((q, i) => {
		if (q.correct === true) return 'done-correct';
		if (q.correct === false) return 'done-wrong';
		if (i === current) return 'current';
		return 'upcoming';
	});
}

/** first unanswered index — where a resumed session should land */
export function firstUnanswered(questions: QuizQuestion[]): number {
	const i = questions.findIndex((q) => q.chosen === null);
	return i === -1 ? questions.length - 1 : i;
}

/** split a statement-pattern stem into a lead-in, numbered statements, and the
 *  trailing question, so the player can render statements as their own rows.
 *  Falls back to a single block when the stem isn't statement-shaped. */
export interface ParsedStem {
	lead: string;
	statements: string[];
	tail: string;
}

export function parseStem(stem: string): ParsedStem {
	const lines = stem.split(/\r?\n/).map((l) => l.trim());
	const statements: string[] = [];
	const rest: string[] = [];
	let lead = '';
	let seenStatement = false;
	for (const line of lines) {
		const m = line.match(/^(\d+)[.)]\s*(.+)$/);
		if (m) {
			statements.push(m[2]);
			seenStatement = true;
		} else if (!seenStatement) {
			lead = lead ? `${lead} ${line}` : line;
		} else if (line) {
			rest.push(line);
		}
	}
	if (statements.length === 0) return { lead: stem, statements: [], tail: '' };
	return { lead, statements, tail: rest.join(' ') };
}
