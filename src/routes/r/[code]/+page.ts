import { redirect } from '@sveltejs/kit';

/** /r/[code] — stash the referral code, land on signup with it applied. */
export function load({ params }) {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem('referral-code', params.code.toUpperCase());
	}
	redirect(302, '/login?mode=signup');
}
