<script lang="ts">
	import OfflineNotes from '$lib/components/OfflineNotes.svelte';
</script>

<svelte:head><title>UPSCVidya — Profile</title></svelte:head>

<h1>Profile</h1>
<p class="note">Full profile lands in a later prompt. Shell + nav live.</p>

<section class="group">
	<h2>Study prefs</h2>
	<OfflineNotes />
</section>

<style>
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 30px;
		text-transform: uppercase;
	}
	.note {
		font-size: 13px;
		color: var(--ink-2);
	}
	.group {
		margin-top: 22px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.group h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 14px;
		text-transform: uppercase;
		color: var(--ink-2);
	}
</style>
