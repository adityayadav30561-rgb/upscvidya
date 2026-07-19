<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		elevation = 'flat',
		bold = false,
		padding = '18px',
		children
	}: {
		/** flat · lifted (3px hard) · gold glow (mastery only) — Foundations §03 */
		elevation?: 'flat' | 'lifted' | 'gold';
		/** bw-bold border (emphasised cards like Today's Mission) */
		bold?: boolean;
		padding?: string;
		children: Snippet;
	} = $props();
</script>

<div class="card {elevation}" class:bold style:padding>
	{@render children()}
</div>

<style>
	.card {
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-xl);
	}
	.card.bold {
		border-width: var(--bw-bold);
	}
	.lifted {
		box-shadow: var(--shadow-2);
	}
	.gold {
		box-shadow: var(--shadow-glow-gold);
	}
</style>
