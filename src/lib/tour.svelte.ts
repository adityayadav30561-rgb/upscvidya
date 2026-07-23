/** Ustad's first-run walkthrough — a multi-screen guided tour (Home → Map →
 *  Topic → Quiz → Drill Ground). The engine here is pure state; the overlay
 *  component (TourGuide.svelte) reads `current` and handles navigation +
 *  element spotlighting. Completion persists to users.tour_done so it never
 *  auto-replays; a "Replay walkthrough" action can force it again.
 */
import { pb } from './pb';

export interface TourStep {
	id: string;
	route: string;
	/** data-tour attribute value of the element to spotlight; omit = centered */
	target?: string;
	title: string;
	body: string;
	placement?: 'auto' | 'top' | 'bottom';
}

/** Ustad — the drill instructor. Gruff-but-warm. POL-05 (Preamble) is free +
 *  live for every user, so the Topic/Quiz steps always have a real screen. */
export const STEPS: TourStep[] = [
	{
		id: 'welcome',
		route: '/',
		target: 'home-hero',
		title: 'Attention, recruit!',
		body: 'This is your base camp. Every officer started exactly where you stand.'
	},
	{
		id: 'mission',
		route: '/',
		target: 'home-mission',
		title: "Today's Mission",
		body: "Your daily orders live here. Clear them each day — that's how recruits become officers."
	},
	{
		id: 'ring',
		route: '/',
		target: 'home-ring',
		title: 'The syllabus',
		body: '103 territories to conquer. We take them one at a time — no shortcuts.'
	},
	{
		id: 'map',
		route: '/map',
		target: 'map-canvas',
		title: 'The battlefield',
		body: 'Your territory map. Tap any node to read its briefing, then prove it in a quiz.'
	},
	{
		id: 'reader',
		route: '/topic/POL-05',
		target: 'reader-cta',
		title: 'Read, then assault',
		body: 'Read the briefing first. When you are ready, THIS launches your 12-question quiz.'
	},
	{
		id: 'quiz',
		route: '/topic/POL-05',
		target: 'reader-cta',
		title: 'Conquer it',
		body: 'Score 70% or higher and the territory is yours. Miss it? Revise and hit it again.'
	},
	{
		id: 'drill',
		route: '/pt',
		target: 'pt-log',
		title: 'The Drill Ground',
		body: 'A sharp mind needs a sharp body. Train here every day, recruit.'
	},
	{
		id: 'dismiss',
		route: '/',
		title: 'Dismissed!',
		body: "That's the drill: base, map, briefing, quiz, training. Now move out — go earn your stars."
	}
];

const SEEN_KEY = 'tour-seen';

const state = $state<{ active: boolean; index: number }>({ active: false, index: 0 });

/** clamp an index into [0, total-1] (pure, unit-tested). */
export function clampIndex(i: number, total: number): number {
	if (i < 0) return 0;
	if (i > total - 1) return total - 1;
	return i;
}

export const tour = {
	get active() {
		return state.active;
	},
	get index() {
		return state.index;
	},
	get total() {
		return STEPS.length;
	},
	get current(): TourStep {
		return STEPS[state.index];
	},
	get isFirst() {
		return state.index === 0;
	},
	get isLast() {
		return state.index === STEPS.length - 1;
	}
};

export function startTour(): void {
	if (state.active) return;
	state.index = 0;
	state.active = true;
}

export function nextStep(): void {
	if (state.index >= STEPS.length - 1) {
		void finishTour();
		return;
	}
	state.index = clampIndex(state.index + 1, STEPS.length);
}

export function prevStep(): void {
	state.index = clampIndex(state.index - 1, STEPS.length);
}

/** End the tour (finished or skipped) and remember it, on the server + locally. */
export async function finishTour(): Promise<void> {
	state.active = false;
	try {
		localStorage.setItem(SEEN_KEY, '1');
	} catch {
		/* ignore */
	}
	if (pb.authStore.isValid && pb.authStore.record) {
		try {
			await pb.collection('users').update(pb.authStore.record.id, { tour_done: true });
			await pb.collection('users').authRefresh();
		} catch {
			/* the local flag still prevents a re-nag this session */
		}
	}
}
export const skipTour = finishTour;

/** Should the tour auto-start for this user? (onboarded, not yet done, not seen
 *  this session). Pure — the trigger passes the current user. */
export function shouldAutoStart(user: {
	exam?: string;
	target_year?: number;
	daily_minutes?: number;
	tour_done?: boolean;
} | null): boolean {
	if (!user) return false;
	const onboarded = !!(user.exam && user.target_year && user.daily_minutes);
	if (!onboarded || user.tour_done) return false;
	try {
		if (localStorage.getItem(SEEN_KEY) === '1') return false;
	} catch {
		/* ignore */
	}
	return true;
}
