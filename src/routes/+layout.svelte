<script lang="ts">
	import '../app.css';
	import Toast from '$lib/components/Toast.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';
	import { bootAuth, auth } from '$lib/auth.svelte';
	import { initAnalytics } from '$lib/analytics';
	import { initPush } from '$lib/push';

	let { children } = $props();

	bootAuth(); // silent session refresh once per app load

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
