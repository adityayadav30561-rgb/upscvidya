<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'primary' | 'secondary' | 'success' | 'ghost' | 'danger' | 'locked';

	let {
		variant = 'primary',
		disabled = false,
		type = 'button',
		onclick,
		children
	}: {
		variant?: Variant;
		disabled?: boolean;
		type?: 'button' | 'submit';
		onclick?: (e: MouseEvent) => void;
		children: Snippet;
	} = $props();
</script>

<button class="btn {variant}" {type} disabled={disabled || variant === 'locked'} {onclick}>
	{@render children()}
</button>

<style>
	/* Foundations §05: Lato 900, black outlines, 44px min target, pill radius.
	   Hover lifts with the 3px hard shadow; press snaps flat. */
	.btn {
		font-family: var(--font-ui);
		font-weight: 700;
		font-size: 14.5px;
		border-radius: var(--r-full);
		padding: 12px 24px;
		min-height: 44px;
		cursor: pointer;
		border: var(--bw) solid var(--line);
		transition:
			box-shadow var(--t-fast) var(--ease),
			transform var(--t-fast) var(--ease),
			background var(--t-fast) var(--ease);
	}
	.btn:hover:not(:disabled) {
		box-shadow: var(--shadow-2);
		transform: translate(-1px, -1px);
	}
	.btn:active:not(:disabled) {
		box-shadow: none;
		transform: translate(0, 0);
	}

	.primary {
		font-weight: 900;
		background: var(--orange);
		color: var(--line);
	}
	.secondary {
		background: var(--bg-2);
		color: var(--line);
	}
	.secondary:hover:not(:disabled) {
		background: var(--bg-1);
	}
	.success {
		background: var(--green);
		color: var(--line);
	}
	.ghost {
		background: transparent;
		color: var(--ink-2);
		border: none;
		padding: 12px 14px;
	}
	.ghost:hover:not(:disabled) {
		color: var(--ink-1);
		box-shadow: none;
		transform: none;
	}
	.danger {
		background: var(--red-tint);
		color: var(--red-deep);
		border-color: var(--red-deep);
	}
	.locked {
		background: var(--bg-1);
		color: var(--ink-3);
		border-color: var(--line-soft);
		cursor: not-allowed;
	}
</style>
