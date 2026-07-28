/** Topic reader loader (build book Prompt 06).
 *  Resolution order: entitled full record (with notes_md) → offline cache →
 *  server-trimmed teaser (free user on a gated topic) → miss. Premium gating is
 *  enforced by PocketBase rules; a free user physically cannot receive the full
 *  notes_md, so the teaser branch only ever carries the trimmed text. */
import { pb } from '$lib/pb';
import { getCachedNote, type CachedNote } from '$lib/offline';
import type { Topic, TopicProgress, User } from '$lib/types';

interface TeaserRow {
	id: string;
	id_code: string;
	title: string;
	region: string;
	kind: 'chapter' | 'appendix';
	book_ref: string;
	mcq_floor: number;
	est_read_minutes: number;
	is_free: boolean;
	notes_teaser: string;
	teaser_truncated: boolean;
	/** real count of live questions (SQL-computed on the view) */
	live_questions: number;
}

export type ReaderMode = 'full' | 'cached' | 'teaser' | 'offline-miss' | 'missing';

export interface ReaderData {
	code: string;
	mode: ReaderMode;
	topic?: Topic;
	cached?: CachedNote;
	teaser?: TeaserRow;
	progress: TopicProgress | null;
	/** how many questions the quiz will actually serve (0 = unknown/offline) */
	liveQuestions: number;
}

/** `questions` is not client-listable by design, so the count comes from the
 *  public view's SQL-computed column rather than a count query. */
async function loadQuestionCount(code: string): Promise<number> {
	try {
		const row = await pb
			.collection('topics_public')
			.getFirstListItem<{ live_questions: number }>(`id_code="${code}"`);
		return row.live_questions ?? 0;
	} catch {
		return 0;
	}
}

const online = () => typeof navigator === 'undefined' || navigator.onLine;

async function loadProgress(topicId: string): Promise<TopicProgress | null> {
	if (!pb.authStore.isValid) return null;
	try {
		return await pb.collection('topic_progress').getFirstListItem<TopicProgress>(`topic="${topicId}"`);
	} catch {
		return null;
	}
}

export async function load({ params }): Promise<ReaderData> {
	const code = params.code;
	const user = pb.authStore.record as unknown as User | null;

	// 1. entitled full record (notes_md present only when the rule allows it)
	let full: Topic | null = null;
	let networkFailed = false;
	try {
		full = await pb.collection('topics').getFirstListItem<Topic>(`id_code="${code}"`);
	} catch {
		if (!online()) networkFailed = true;
	}
	if (full) {
		const [progress, liveQuestions] = await Promise.all([
			loadProgress(full.id),
			loadQuestionCount(code)
		]);
		return { code, mode: 'full', topic: full, progress, liveQuestions };
	}

	// 2. offline cache (previously-read topic opens fully in airplane mode)
	const cached = await getCachedNote(code);
	if (cached) {
		// offline: nothing to count against, so the CTA drops the number
		return { code, mode: 'cached', cached, progress: null, liveQuestions: 0 };
	}
	if (networkFailed) {
		return { code, mode: 'offline-miss', progress: null, liveQuestions: 0 };
	}

	// 3. teaser (free user on a gated topic) — server-trimmed text only
	if (!user?.is_premium) {
		try {
			const teaser = await pb
				.collection('topics_teaser')
				.getFirstListItem<TeaserRow>(`id_code="${code}"`);
			return {
				code,
				mode: 'teaser',
				teaser,
				progress: null,
				liveQuestions: teaser.live_questions ?? 0
			};
		} catch {
			/* fall through */
		}
	}

	return { code, mode: 'missing', progress: null, liveQuestions: 0 };
}
