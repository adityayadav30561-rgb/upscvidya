/** OneSignal web push (build book Prompt 15).
 *
 *  SERVICE-WORKER COEXISTENCE (the documented approach): this app already ships
 *  a hand-rolled SvelteKit service worker at src/service-worker.ts controlling
 *  scope "/". Two SWs cannot own the same scope, so OneSignal's worker is scoped
 *  to "/push/" instead — see static/push/OneSignalSDKWorker.js and the
 *  serviceWorkerParam/serviceWorkerPath below. SvelteKit keeps "/" (offline
 *  caching); OneSignal owns "/push/" (push receipt). They never collide.
 *
 *  The permission prompt is NEVER shown on load: initPush() only wires the SDK +
 *  identity + tags. The prompt is triggered exclusively by promptAfterFirstQuiz()
 *  (called from the quiz-results flow), gated by shouldPromptPush(). No-op until
 *  PUBLIC_ONESIGNAL_APP_ID is set.
 */
import { browser } from '$app/environment';
import { PUBLIC_ONESIGNAL_APP_ID } from '$env/static/public';

interface OneSignalSDK {
	init(cfg: Record<string, unknown>): Promise<void>;
	login(externalId: string): Promise<void>;
	logout(): Promise<void>;
	User: { addTags(tags: Record<string, string>): void };
	Notifications: { permission: boolean; requestPermission(): Promise<void> };
	Slidedown: { promptPush(): Promise<void> };
}
declare global {
	interface Window {
		OneSignalDeferred?: Array<(os: OneSignalSDK) => void | Promise<void>>;
	}
}

const enabled = () => browser && !!PUBLIC_ONESIGNAL_APP_ID;
let loaded = false;

function withOneSignal(fn: (os: OneSignalSDK) => void | Promise<void>): void {
	if (!enabled()) return;
	window.OneSignalDeferred = window.OneSignalDeferred || [];
	window.OneSignalDeferred.push(fn);
}

function loadSdk(): void {
	if (loaded || !enabled()) return;
	loaded = true;
	withOneSignal(async (os) => {
		await os.init({
			appId: PUBLIC_ONESIGNAL_APP_ID,
			// coexist with the SvelteKit SW: OneSignal's worker lives under /push/
			serviceWorkerParam: { scope: '/push/' },
			serviceWorkerPath: 'push/OneSignalSDKWorker.js',
			allowLocalhostAsSecureOrigin: true
		});
	});
	const s = document.createElement('script');
	s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
	s.defer = true;
	document.head.appendChild(s);
}

type LastActiveBucket = 'today' | 'this_week' | 'older' | 'never';
export function lastActiveBucket(lastActive: string | undefined, now = Date.now()): LastActiveBucket {
	if (!lastActive) return 'never';
	const ms = Date.parse(String(lastActive).replace(' ', 'T'));
	if (isNaN(ms)) return 'never';
	const days = Math.floor((now - ms) / 86400000);
	if (days <= 0) return 'today';
	if (days <= 7) return 'this_week';
	return 'older';
}

interface PushUser {
	id: string;
	rank_code?: string;
	streak_current?: number;
	is_premium?: boolean;
	last_active_date?: string;
}

/** Wire the SDK + identity + tags. Does NOT prompt. */
export function initPush(user: PushUser | null): void {
	if (!enabled() || !user?.id) return;
	loadSdk();
	withOneSignal(async (os) => {
		await os.login(user.id);
		syncTags(user);
	});
}

/** Per-user segmentation tags (build book: rank, streak, premium, last_active). */
export function syncTags(user: PushUser): void {
	withOneSignal((os) => {
		os.User.addTags({
			rank: String(user.rank_code || 'cadet'),
			streak: String(user.streak_current ?? 0),
			premium: user.is_premium ? '1' : '0',
			last_active: lastActiveBucket(user.last_active_date)
		});
	});
}

export interface PromptState {
	firstQuizDone: boolean;
	alreadyPrompted: boolean;
	permissionGranted: boolean;
}

/** Pure gate (exported for unit tests): prompt only AFTER the first quiz, only
 *  once, and only when the user hasn't already granted/decided. */
export function shouldPromptPush(s: PromptState): boolean {
	return s.firstQuizDone && !s.alreadyPrompted && !s.permissionGranted;
}

const PROMPTED_KEY = 'push-prompted';

/** Called from the quiz-results flow on a completed topic quiz. Marks the
 *  first-quiz milestone and, if the gate allows, raises the OneSignal prompt. */
export function promptAfterFirstQuiz(): void {
	if (!enabled()) return;
	loadSdk();
	withOneSignal(async (os) => {
		const alreadyPrompted = (() => {
			try {
				return localStorage.getItem(PROMPTED_KEY) === '1';
			} catch {
				return false;
			}
		})();
		if (!shouldPromptPush({ firstQuizDone: true, alreadyPrompted, permissionGranted: os.Notifications.permission })) {
			return;
		}
		try {
			localStorage.setItem(PROMPTED_KEY, '1');
		} catch {
			/* ignore */
		}
		await os.Slidedown.promptPush();
	});
}

export function logoutPush(): void {
	withOneSignal((os) => os.logout());
}
