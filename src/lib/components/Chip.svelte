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
	/* Foundations §05 CHIPS & STICKERS */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-ui);
		white-space: nowrap;
	}
	.sticker-green,
	.sticker-orange {
		font-weight: 900;
		font-size: 12px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 6px 14px;
		box-shadow: var(--shadow-2);
	}
	.sticker-green {
		background: var(--green);
		color: var(--ink-1);
	}
	.sticker-orange {
		background: var(--orange);
		color: var(--ink-1);
	}
	.pill {
		font-size: 12.5px;
		font-weight: 700;
		background: var(--bg-2);
		color: var(--ink-1);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 6px 13px;
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
