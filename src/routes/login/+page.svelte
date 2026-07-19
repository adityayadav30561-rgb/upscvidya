<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
</script>

<svelte:head><title>UPSCVidya — Sign in</title></svelte:head>

<main>
	<Card elevation="lifted" bold padding="24px">
		<h1>Report for duty</h1>
		<p class="note">
			Sign-in (Google OAuth + email) arrives with Prompt 04. Until then the app shell runs with
			the dev bypass flag.
		</p>
		<Button variant="locked">Sign in — coming in Prompt 04</Button>
	</Card>
</main>

<style>
	main {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
	}
	h1 {
		margin: 0 0 8px;
		font-family: var(--font-display);
		font-size: 24px;
		text-transform: uppercase;
	}
	.note {
		font-size: 13px;
		color: var(--ink-2);
		margin: 0 0 14px;
		max-width: 320px;
	}
</style>
