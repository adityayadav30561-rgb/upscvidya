<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'sticker-green' | 'sticker-orange' | 'pill' | 'blue' | 'khaki' | 'red';

	let {
		variant = 'pill',
		rotate,
		children
	}: {
		variant?: Variant;
		/** sticker rotation in degrees; stickers default to their design tilt */
		rotate?: number;
		children: Snippet;
	} = $props();

	const defaultTilt: Record<Variant, number> = {
		'sticker-green': -2,
		'sticker-orange': 1.5,
		pill: 0,
		blue: 0,
		khaki: 0,
		red: 0
	};
	const tilt = $derived(rotate ?? defaultTilt[variant]);
</script>

<span class="chip {variant}" style:transform={tilt ? `rotate(${tilt}deg)` : undefined}>
	{@render children()}
</span>

<style>
	/* FIELD DOSSIER chips: stickers are stamped plaques with a hard bottom edge;
	   pills are pressed card stock. */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-ui);
		white-space: nowrap;
	}
	.sticker-green,
	.sticker-orange {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 12.5px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #fff;
		border: none;
		border-radius: var(--r-sm);
		padding: 6px 13px;
	}
	.sticker-green {
		background: var(--grad-olive);
		box-shadow:
			0 2px 0 var(--green-edge),
			inset 0 1px 0 rgba(255, 255, 255, 0.4);
	}
	.sticker-orange {
		background: var(--grad-rust);
		box-shadow:
			0 2px 0 var(--orange-edge),
			inset 0 1px 0 rgba(255, 255, 255, 0.35);
	}
	.pill {
		font-size: 12.5px;
		font-weight: 700;
		background: var(--grad-plate);
		color: var(--ink-1);
		border: var(--bw) solid var(--khaki);
		border-radius: var(--r-full);
		padding: 6px 13px;
		box-shadow: var(--emboss);
	}
	.blue {
		font-size: 12.5px;
		font-weight: 700;
		background: var(--blue-tint);
		color: var(--blue-deep);
		border: var(--bw) solid var(--blue-deep);
		border-radius: var(--r-full);
		padding: 6px 13px;
	}
	.khaki {
		font-size: 12.5px;
		font-weight: 700;
		background: var(--khaki-tint);
		color: var(--khaki-deep);
		border: var(--bw) solid var(--khaki-deep);
		border-radius: var(--r-full);
		padding: 6px 13px;
	}
	.red {
		font-size: 12.5px;
		font-weight: 700;
		background: var(--red-tint);
		color: var(--red-deep);
		border: var(--bw) solid var(--red-deep);
		border-radius: var(--r-full);
		padding: 6px 13px;
	}
</style>
