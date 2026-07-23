/** Collection record types — hand-written from pb/SCHEMA.md. */

export type Region =
	| 'foundations'
	| 'system'
	| 'centre'
	| 'states'
	| 'grassroots'
	| 'institutions'
	| 'dynamics'
	| 'courtroom';

export type { RankCode } from './ranks';
import type { RankCode } from './ranks';

export type QuestionFormat =
	| 'single-factual'
	| 'statement-based'
	| 'match-pairs'
	| 'assertion-reason'
	| 'chronology'
	| 'odd-one-out'
	| 'fill-appropriate';

export type TopicState = 'unread' | 'read' | 'conquered' | 'gold' | 'decaying';

interface BaseRecord {
	id: string;
	created: string;
	updated: string;
}

export interface User extends BaseRecord {
	email: string;
	display_name: string;
	avatar_seed: string;
	exam: 'capf' | '';
	target_year: number;
	daily_minutes: number;
	xp: number;
	rank_code: RankCode;
	streak_current: number;
	streak_best: number;
	streak_freezes: number;
	last_active_date: string;
	battalion_id: string;
	is_premium: boolean;
	premium_until: string;
	premium_plan: 'monthly' | 'till_exam' | '';
	premium_credit_days: number; // banked referral days (server-owned)
	referral_code: string;
	referred_by: string;
	role: 'user' | 'admin';
}

export interface Topic extends BaseRecord {
	id_code: string;
	title: string;
	part_no: number;
	region: Region;
	kind: 'chapter' | 'appendix';
	book_ref: string;
	mcq_floor: number;
	tags: string[];
	guided_order: number;
	est_read_minutes: number;
	prerequisites: string[];
	notes_md: string;
	status: 'draft' | 'live';
	is_free: boolean;
}

/** topics_public view — everything except notes_md, live only. */
export type TopicPublic = Omit<Topic, 'notes_md' | 'created' | 'updated'>;

export interface Question extends BaseRecord {
	qid: string;
	topic: string;
	stem: string;
	options: string[];
	answer_index: number; // admin-only; never present in client-facing quiz payloads
	explanation: string;
	tier: 1 | 2 | 3 | 4 | 5;
	format: QuestionFormat;
	exams: string[];
	source_type: 'ai' | 'self' | 'external' | 'pyq' | 'ca';
	source_meta: Record<string, unknown>;
	status: 'draft' | 'validated' | 'live' | 'retired';
	attempts_count: number;
	correct_count: number;
}

export interface Attempt extends BaseRecord {
	user: string;
	question: string;
	topic: string;
	context: 'topic_quiz' | 'sectional' | 'mock' | 'pyq' | 'daily_ca' | 'sr_review' | 'drill';
	chosen_index: number;
	is_correct: boolean;
	time_taken_ms: number;
	attempted_at: string;
}

export interface TopicProgress extends BaseRecord {
	user: string;
	topic: string;
	state: TopicState;
	best_score_pct: number;
	last_activity: string;
	quiz_passes: number;
}

export interface SrCard extends BaseRecord {
	user: string;
	question: string;
	ease: number;
	interval_days: number;
	reps: number;
	due_date: string;
	lapses: number;
	suspended: boolean;
}

export interface Test extends BaseRecord {
	title: string;
	kind: 'sectional' | 'mock';
	config: {
		regions?: Region[];
		tiers?: [number, number];
		count?: number;
		duration_sec?: number;
		correct?: number;
		negative?: number;
	};
	question_ids: string[] | null;
	is_free: boolean;
	status: 'draft' | 'live';
}

export interface TestAttempt extends BaseRecord {
	user: string;
	test: string;
	started_at: string;
	submitted_at: string;
	answers: Record<string, number>;
	score: number;
	max_score: number;
	percentile: number | null;
	palette_state: Record<string, unknown>;
}

export interface CaItem extends BaseRecord {
	date: string;
	headline: string;
	summary: string;
	source_name: string;
	source_url: string;
	linked_topics: string[];
	status: 'draft' | 'approved' | 'rejected' | 'published';
	quiz_question_ids: string[];
}

export interface Battalion extends BaseRecord {
	name: string;
	week_start: string;
	member_count: number;
}

export interface LeaderboardEntry extends BaseRecord {
	battalion: string;
	user: string;
	week_start: string;
	xp_week: number;
}

export interface PetLog extends BaseRecord {
	user: string;
	event: 'sprint_100m' | 'run_800m' | 'long_jump' | 'shot_put';
	value: number; // seconds or metres
	logged_at: string;
}

export interface Payment extends BaseRecord {
	user: string;
	razorpay_order_id: string;
	razorpay_payment_id: string;
	amount_inr: number;
	plan: 'monthly' | 'till_exam';
	status: 'created' | 'paid' | 'failed' | 'refunded';
	raw: Record<string, unknown>;
}

export interface ReferralCredit extends BaseRecord {
	user: string;
	referred_user: string;
	days_granted: number;
	granted_at: string;
}
