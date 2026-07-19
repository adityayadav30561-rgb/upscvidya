<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';

	/* Placeholder — the real Home/Base Camp dashboard is Prompt 09
	   (needs XP/streak/mission data). Shell + nav are live now. */
</script>

<svelte:head><title>UPSCVidya — Base Camp</title></svelte:head>

<div class="stack">
	<h1>Base Camp</h1>
	<Card elevation="lifted" bold>
		<div class="mission-head">TODAY'S MISSION</div>
		<p class="placeholder-note">
			Dashboard assembles in Prompt 09 — XP, streak, mission card, syllabus ring. Components ready
			in the <a href="/dev/kitchen-sink">kitchen sink</a>.
		</p>
		<Button variant="primary">Begin Mission →</Button>
	</Card>
</div>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 30px;
		text-transform: uppercase;
	}
	.mission-head {
		font-family: var(--font-display);
		font-size: 12px;
		text-transform: uppercase;
		color: var(--orange-deep);
		margin-bottom: 8px;
	}
	.placeholder-note {
		font-size: 13px;
		color: var(--ink-2);
		margin: 0 0 12px;
	}
</style>
