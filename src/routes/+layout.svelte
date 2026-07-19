<script lang="ts">
	import '../app.css';
	import Toast from '$lib/components/Toast.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';
	import { bootAuth } from '$lib/auth.svelte';

	let { children } = $props();

	bootAuth(); // silent session refresh once per app load
</script>

{@render children()}
<Toast />
<InstallPrompt />
