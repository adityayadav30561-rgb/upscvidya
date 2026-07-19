<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title = '',
		children
	}: {
		open?: boolean;
		title?: string;
		children: Snippet;
	} = $props();

	const close = () => (open = false);
	const onkeydown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') close();
	};
</script>

<svelte:window {onkeydown} />

{#if open}
	<div class="backdrop" onclick={close} role="presentation"></div>
	<div class="sheet" role="dialog" aria-modal="true" aria-label={title || 'sheet'}>
		<div class="grab" aria-hidden="true"></div>
		{#if title}<div class="title">{title}</div>{/if}
		{@render children()}
	</div>
{/if}

<style>
	/* interaction notes: topic sheet slides up 350ms */
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(51, 48, 31, 0.4);
		z-index: 60;
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		max-width: 480px;
		margin: 0 auto;
		background: var(--bg-2);
		border: var(--bw-bold) solid var(--line);
		border-bottom: none;
		border-radius: var(--r-xl) var(--r-xl) 0 0;
		padding: 14px 20px 24px;
		z-index: 61;
		animation: slide-up var(--t-slow) var(--ease);
	}
	@keyframes slide-up {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}
	.grab {
		width: 44px;
		height: 5px;
		border-radius: var(--r-full);
		background: var(--line-soft);
		margin: 0 auto 12px;
	}
	.title {
		font-family: var(--font-display);
		font-size: 17px;
		text-transform: uppercase;
		margin-bottom: 10px;
	}
</style>
