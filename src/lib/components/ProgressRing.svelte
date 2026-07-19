<script lang="ts">
	let {
		value,
		label = '',
		size = 84,
		stroke = 8,
		animate = true
	}: {
		/** 0-100 */
		value: number;
		label?: string;
		size?: number;
		stroke?: number;
		/** animates 0→value on first paint (700ms, --ease) per interaction notes */
		animate?: boolean;
	} = $props();

	const circumference = $derived(2 * Math.PI * (size / 2 - stroke));
	let displayValue = $state(0);

	$effect(() => {
		if (!animate) {
			displayValue = value;
			return;
		}
		const raf = requestAnimationFrame(() => (displayValue = value));
		return () => cancelAnimationFrame(raf);
	});

	const offset = $derived(circumference * (1 - Math.min(100, Math.max(0, displayValue)) / 100));
</script>

<div class="ring" style:width="{size}px" style:height="{size}px" role="img" aria-label="{value}% {label}">
	<svg width={size} height={size} viewBox="0 0 {size} {size}" style="transform:rotate(-90deg)">
		<circle cx={size / 2} cy={size / 2} r={size / 2 - stroke} fill="none" stroke="var(--bg-1)" stroke-width={stroke} />
		<circle
			cx={size / 2}
			cy={size / 2}
			r={size / 2 - stroke}
			fill="none"
			stroke="var(--orange-deep)"
			stroke-width={stroke}
			stroke-linecap="round"
			stroke-dasharray={circumference}
			stroke-dashoffset={offset}
			style="transition: stroke-dashoffset var(--t-conquest) var(--ease)"
		/>
	</svg>
	<div class="centre">
		<span class="value">{Math.round(value)}%</span>
		{#if label}<span class="label">{label}</span>{/if}
	</div>
</div>

<style>
	.ring {
		position: relative;
	}
	.centre {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}
	.value {
		font-family: var(--font-display);
		font-size: 18px;
		line-height: 1;
	}
	.label {
		font-size: 9.5px;
		font-weight: 700;
		color: var(--ink-3);
		text-transform: uppercase;
	}
</style>
