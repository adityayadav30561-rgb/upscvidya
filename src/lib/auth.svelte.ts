/** Auth/session state — PocketBase authStore wrapped in Svelte runes.
 *  authStore persists to localStorage; boot() silently refreshes it. */
import { pb } from './pb';
import type { User } from './types';
import { rankForXp } from './ranks';
import { removeAllCached } from './offline';

const state = $state<{ user: User | null; booted: boolean }>({
	user: (pb.authStore.record as unknown as User) ?? null,
	booted: false
});

pb.authStore.onChange(() => {
	state.user = (pb.authStore.record as unknown as User) ?? null;
});

/** Silent session refresh on app boot; clears a dead session. */
export async function bootAuth() {
	if (state.booted) return;
	state.booted = true;
	if (!pb.authStore.isValid) return;
	try {
		await pb.collection('users').authRefresh();
	} catch {
		pb.authStore.clear();
	}
}

export const auth = {
	get user() {
		return state.user;
	},
	get isLoggedIn() {
		return !!state.user;
	},
	get isPremium() {
		const u = state.user;
		if (!u?.is_premium) return false;
		return !u.premium_until || new Date(u.premium_until) > new Date();
	},
	get xp() {
		return state.user?.xp ?? 0;
	},
	get rankCode() {
		return state.user?.rank_code ?? rankForXp(state.user?.xp ?? 0).code;
	},
	/** onboarding complete = all three answers stored */
	get isOnboarded() {
		const u = state.user;
		return !!(u?.exam && u?.target_year && u?.daily_minutes);
	}
};

export async function loginWithPassword(email: string, password: string) {
	await pb.collection('users').authWithPassword(email, password);
}

export async function signup(opts: {
	displayName: string;
	email: string;
	password: string;
	referredBy?: string | null;
}) {
	await pb.collection('users').create({
		email: opts.email,
		password: opts.password,
		passwordConfirm: opts.password,
		display_name: opts.displayName,
		...(opts.referredBy ? { referred_by: opts.referredBy } : {})
	});
	// design: no confirmation wall — straight in (verification email can be
	// wired via SMTP later without changing this flow)
	await pb.collection('users').authWithPassword(opts.email, opts.password);
}

export async function loginWithGoogle() {
	await pb.collection('users').authWithOAuth2({ provider: 'google' });
}

export async function requestPasswordReset(email: string) {
	await pb.collection('users').requestPasswordReset(email);
}

export function logout() {
	pb.authStore.clear();
	// Purge offline notes: cached payloads were entitled to the session that
	// just ended (a premium/admin read of a gated topic must not survive logout).
	void removeAllCached();
}

/** /r/[code] → referrer user id (server-resolved; clients can't list users). */
export async function resolveReferralCode(code: string): Promise<string | null> {
	try {
		const res = await fetch(`${pb.baseURL}/api/referral/${encodeURIComponent(code)}`);
		if (!res.ok) return null;
		const data = (await res.json()) as { found: boolean; id?: string };
		return data.found && data.id ? data.id : null;
	} catch {
		return null;
	}
}

/** Update the three onboarding answers on the signed-in user. */
export async function saveOnboarding(opts: {
	exam: 'capf';
	targetYear: number;
	dailyMinutes: number;
}) {
	if (!state.user) throw new Error('not signed in');
	await pb.collection('users').update(state.user.id, {
		exam: opts.exam,
		target_year: opts.targetYear,
		daily_minutes: opts.dailyMinutes
	});
	await pb.collection('users').authRefresh();
}
