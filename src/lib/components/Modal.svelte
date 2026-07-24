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
		background: rgba(38, 34, 22, 0.5);
		z-index: 70;
	}
	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		/* proper side margins on every phone; never touches the notch/home bar */
		width: min(420px, calc(100vw - 40px));
		max-height: calc(100dvh - 40px);
		overflow-y: auto;
		background: var(--bg-2);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		box-shadow: var(--shadow-soft);
		padding: 22px 22px calc(22px + env(safe-area-inset-bottom, 0px));
		z-index: 71;
	}
	@media (prefers-reduced-motion: no-preference) {
		.backdrop {
			animation: fade 200ms ease both;
		}
		.modal {
			/* soft spring: rises + settles, no hard snap */
			animation: pop 300ms cubic-bezier(0.22, 1, 0.36, 1) both;
		}
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@keyframes pop {
		0% {
			transform: translate(-50%, -42%) scale(0.94);
			opacity: 0;
		}
		100% {
			transform: translate(-50%, -50%) scale(1);
			opacity: 1;
		}
	}
	.title {
		font-family: var(--font-display);
		font-size: 18px;
		text-transform: uppercase;
		margin-bottom: 14px;
		line-height: 1.1;
	}
</style>
