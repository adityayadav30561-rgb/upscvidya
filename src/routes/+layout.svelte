<script lang="ts">
	import '../app.css';
	import Toast from '$lib/components/Toast.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';
	import Splash from '$lib/components/Splash.svelte';
	import { bootAuth, auth } from '$lib/auth.svelte';
	import { initAnalytics } from '$lib/analytics';
	import { initPush } from '$lib/push';
	import { onNavigate } from '$app/navigation';

	let { children } = $props();

	bootAuth(); // silent session refresh once per app load

	// Smooth route/tab transitions via the View Transitions API (mobile-first).
	// Progressive enhancement — unsupported browsers just navigate instantly, and
	// reduced-motion users get no animation.
	onNavigate((navigation) => {
		const doc = document as Document & {
			startViewTransition?: (cb: () => void | Promise<void>) => void;
		};
		if (typeof document === 'undefined' || !doc.startViewTransition) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		return new Promise<void>((resolve) => {
			doc.startViewTransition!(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	// Analytics + push (Prompt 15). initPush wires OneSignal but NEVER prompts —
	// the permission ask is raised only after the first quiz (quiz-results flow).
	let boundId = '';
	$effect(() => {
		const u = auth.user;
		if (u?.id && u.id !== boundId) {
			boundId = u.id;
			initAnalytics(u);
			initPush(u);
		} else if (!u && !boundId) {
			initAnalytics(null); // anon distinct_id for pre-login events
		}
	});
</script>

{@render children()}
<Toast />
<InstallPrompt />
<Splash />
