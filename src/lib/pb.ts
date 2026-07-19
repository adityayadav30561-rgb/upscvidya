/** PocketBase client singleton + typed collection helpers. */
import PocketBase, { type RecordService } from 'pocketbase';
import { PUBLIC_PB_URL } from '$env/static/public';
import type {
	Attempt,
	Battalion,
	CaItem,
	LeaderboardEntry,
	Payment,
	PetLog,
	Question,
	ReferralCredit,
	SrCard,
	Test,
	TestAttempt,
	Topic,
	TopicProgress,
	TopicPublic,
	User
} from './types';

interface TypedPocketBase extends PocketBase {
	collection(idOrName: 'users'): RecordService<User>;
	collection(idOrName: 'topics'): RecordService<Topic>;
	collection(idOrName: 'topics_public'): RecordService<TopicPublic>;
	collection(idOrName: 'questions'): RecordService<Question>;
	collection(idOrName: 'attempts'): RecordService<Attempt>;
	collection(idOrName: 'topic_progress'): RecordService<TopicProgress>;
	collection(idOrName: 'sr_cards'): RecordService<SrCard>;
	collection(idOrName: 'tests'): RecordService<Test>;
	collection(idOrName: 'test_attempts'): RecordService<TestAttempt>;
	collection(idOrName: 'ca_items'): RecordService<CaItem>;
	collection(idOrName: 'battalions'): RecordService<Battalion>;
	collection(idOrName: 'leaderboard_entries'): RecordService<LeaderboardEntry>;
	collection(idOrName: 'pet_logs'): RecordService<PetLog>;
	collection(idOrName: 'payments'): RecordService<Payment>;
	collection(idOrName: 'referral_credits'): RecordService<ReferralCredit>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	collection(idOrName: string): RecordService<any>;
}

export const pb = new PocketBase(PUBLIC_PB_URL) as TypedPocketBase;

// authStore persists to localStorage by default; SPA-friendly.
pb.autoCancellation(false);
