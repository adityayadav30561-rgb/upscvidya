import { redirect } from '@sveltejs/kit';
import { pb } from '$lib/pb';
import { PUBLIC_DEV_BYPASS_AUTH } from '$env/static/public';

/** Route guard: authenticated app shell. Auth UI lands in Prompt 04;
 *  until then PUBLIC_DEV_BYPASS_AUTH=true keeps the shell reachable in dev. */
export function load() {
	if (PUBLIC_DEV_BYPASS_AUTH === 'true') return;
	if (!pb.authStore.isValid) redirect(302, '/login');
}
