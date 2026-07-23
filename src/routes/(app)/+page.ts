/** Base Camp dashboard data (build book Prompt 09) — one parallel load:
 *  syllabus state (map data), SR due count, weekly XP ledger. The page
 *  renders skeletons while this resolves. */
import { pb } from '$lib/pb';
import type { TopicPublic, TopicProgress, User } from '$lib/types';

export interface XpEvent {
	id: string;
	amount: number;
	reason: string;
	created: string;
}

export async function load() {
	const user = pb.authStore.record as unknown as User | null;

	const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10) + ' 00:00:00.000Z';

	const [topics, progress, xpEvents] = await Promise.all([
		pb.collection('topics_public').getFullList<TopicPublic>({ sort: 'guided_order' }).catch(() => []),
		user
			? pb.collection('topic_progress').getFullList<TopicProgress>().catch(() => [])
			: Promise.resolve([] as TopicProgress[]),
		user
			? pb
					.collection('xp_events')
					.getFullList<XpEvent>({ filter: `created >= "${weekAgo}"`, sort: 'created' })
					.catch(() => [] as XpEvent[])
			: Promise.resolve([] as XpEvent[])
	]);

	return { topics, progress, xpEvents, isPremium: !!user?.is_premium };
}
