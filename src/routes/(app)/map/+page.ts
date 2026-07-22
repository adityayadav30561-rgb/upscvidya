/** Territory map data: all live topics + own progress in one load (Prompt 05). */
import { pb } from '$lib/pb';
import type { TopicPublic, TopicProgress, User } from '$lib/types';

export async function load() {
	const user = pb.authStore.record as unknown as User | null;
	const [topics, progress] = await Promise.all([
		pb.collection('topics_public').getFullList<TopicPublic>({ sort: 'guided_order' }),
		user
			? pb.collection('topic_progress').getFullList<TopicProgress>().catch(() => [])
			: Promise.resolve([] as TopicProgress[])
	]);
	return { topics, progress, isPremium: !!user?.is_premium };
}
