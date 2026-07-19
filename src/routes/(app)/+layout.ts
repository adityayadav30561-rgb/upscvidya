import { redirect } from '@sveltejs/kit';
import { pb } from '$lib/pb';
import { PUBLIC_DEV_BYPASS_AUTH } from '$env/static/public';
import type { User } from '$lib/types';

/** Route guard (build book Prompt 04):
 *  unauthenticated → /login; authenticated without onboarding → /onboarding;
 *  else the app. PUBLIC_DEV_BYPASS_AUTH=true skips both (dev only). */
export function load() {
	if (PUBLIC_DEV_BYPASS_AUTH === 'true') return;
	if (!pb.authStore.isValid) redirect(302, '/login');
	const u = pb.authStore.record as unknown as User | null;
	if (!u?.exam || !u?.target_year || !u?.daily_minutes) redirect(302, '/onboarding');
}
