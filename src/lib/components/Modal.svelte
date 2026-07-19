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
	<div class="modal" role="dialog" aria-modal="true" aria-label={title || 'dialog'}>
		{#if title}<div class="title">{title}</div>{/if}
		{@render children()}
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(51, 48, 31, 0.4);
		z-index: 70;
	}
	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(420px, calc(100vw - 32px));
		background: var(--bg-2);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		box-shadow: var(--shadow-soft);
		padding: 20px;
		z-index: 71;
		animation: pop var(--t-base) var(--ease-pop);
	}
	@keyframes pop {
		from {
			transform: translate(-50%, -50%) scale(0.92);
			opacity: 0;
		}
		to {
			transform: translate(-50%, -50%) scale(1);
			opacity: 1;
		}
	}
	.title {
		font-family: var(--font-display);
		font-size: 17px;
		text-transform: uppercase;
		margin-bottom: 10px;
	}
</style>
