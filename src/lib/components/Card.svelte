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
	/* FIELD DOSSIER: card stock, lit from above. */
	.card {
		background: var(--grad-plate);
		border: var(--bw) solid var(--khaki);
		border-radius: var(--r-xl);
		box-shadow: var(--emboss);
	}
	.card.bold {
		border-color: var(--line);
		border-width: var(--bw-bold);
	}
	.lifted {
		box-shadow:
			0 3px 0 var(--edge),
			0 10px 18px rgba(60, 50, 25, 0.16),
			var(--emboss);
	}
	.gold {
		border-color: var(--gold-edge);
		box-shadow:
			0 3px 0 var(--gold-edge),
			var(--shadow-glow-gold),
			var(--emboss);
	}
</style>
