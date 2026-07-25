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
	/* FIELD DOSSIER: a moulded key — raised on a hard bottom edge, pressed flat
	   on tap. Stencil face, 44px+ target. */
	.btn {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 15px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		border-radius: var(--r-md);
		padding: 12px 22px;
		min-height: 46px;
		cursor: pointer;
		border: none;
		transition:
			box-shadow var(--t-fast) var(--ease),
			transform var(--t-fast) var(--ease),
			background var(--t-fast) var(--ease);
	}
	.btn:active:not(:disabled) {
		transform: translateY(2px);
	}
	.btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.primary {
		color: #fff;
		background: var(--grad-rust);
		box-shadow:
			0 3px 0 var(--orange-edge),
			inset 0 1px 0 rgba(255, 255, 255, 0.35);
	}
	.primary:active:not(:disabled) {
		box-shadow:
			0 1px 0 var(--orange-edge),
			inset 0 1px 0 rgba(255, 255, 255, 0.35);
	}
	.secondary {
		color: var(--ink-1);
		background: var(--grad-plate);
		border: var(--bw) solid var(--khaki);
		box-shadow: 0 3px 0 var(--edge), var(--emboss);
	}
	.secondary:active:not(:disabled) {
		box-shadow: 0 1px 0 var(--edge), var(--emboss);
	}
	.success {
		color: #fff;
		background: var(--grad-olive);
		box-shadow:
			0 3px 0 var(--green-edge),
			inset 0 1px 0 rgba(255, 255, 255, 0.4);
	}
	.success:active:not(:disabled) {
		box-shadow:
			0 1px 0 var(--green-edge),
			inset 0 1px 0 rgba(255, 255, 255, 0.4);
	}
	.ghost {
		font-family: var(--font-ui);
		font-weight: 700;
		font-size: 13.5px;
		letter-spacing: 0;
		text-transform: none;
		background: transparent;
		color: var(--ink-2);
		box-shadow: none;
		padding: 12px 14px;
		min-height: 44px;
	}
	.ghost:active:not(:disabled) {
		transform: none;
		color: var(--ink-1);
	}
	.danger {
		color: #fff;
		background: linear-gradient(#a8402f, #7d2a1a);
		box-shadow:
			0 3px 0 #5d1d11,
			inset 0 1px 0 rgba(255, 255, 255, 0.25);
	}
	.danger:active:not(:disabled) {
		box-shadow: 0 1px 0 #5d1d11;
	}
	.locked {
		background: var(--bg-1);
		color: var(--ink-3);
		box-shadow: var(--recess-in);
		cursor: not-allowed;
	}
</style>
