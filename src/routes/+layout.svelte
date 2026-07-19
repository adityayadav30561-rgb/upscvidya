<script lang="ts">
	import '../app.css';
	import Toast from '$lib/components/Toast.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';

	let { children } = $props();
</script>

{@render children()}
<Toast />
<InstallPrompt />
