<script lang="ts">
	import BottomNav from '$lib/components/BottomNav.svelte';

	let { children } = $props();
</script>

<div class="shell">
	{@render children()}
</div>
<BottomNav />

<style>
	.shell {
		max-width: 480px;
		margin: 0 auto;
		padding: 20px 20px 96px; /* clearance for the floating nav (mockup) */
		min-height: 100dvh;
	}
</style>
