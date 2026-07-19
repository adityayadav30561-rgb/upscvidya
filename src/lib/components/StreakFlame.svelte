<script lang="ts">
	let {
		count,
		freezes = 0,
		size = 26,
		showLabel = true
	}: {
		count: number;
		/** freeze tokens shown as blue frost crosses below the count */
		freezes?: number;
		size?: number;
		showLabel?: boolean;
	} = $props();

	const uid = `flame-${Math.random().toString(36).slice(2, 8)}`;
	const h = $derived(Math.round((size / 26) * 32));
</script>

<div class="streak">
	<svg width={size} height={h} viewBox="0 0 26 32" class="flame" aria-hidden="true">
		<defs>
			<linearGradient id="{uid}-g" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#ffb184" />
				<stop offset="1" stop-color="#e8703a" />
			</linearGradient>
		</defs>
		<path
			d="M13 0 C14 7 20 9 21 15 C22 21 18.5 26 13 26 C7.5 26 4 21 5 15 C5.6 11.4 8 9.6 9 7 C9.6 9 11 10 12 9.4 C13.4 8.4 12.6 4 13 0 Z"
			fill="url(#{uid}-g)"
			stroke="#4d4433"
			stroke-width="1.2"
		/>
		<path
			d="M13 14 C15.5 17 16.5 19.5 15.5 22 C14.8 23.8 13 24.6 11.5 24 C9.6 23.2 9.4 20.6 10.5 18.5 C11.3 17 12.4 16 13 14 Z"
			fill="var(--bg-0)"
		/>
	</svg>
	<div class="meta">
		<div class="count">{count}</div>
		{#if showLabel}<div class="label">DAY STREAK</div>{/if}
		{#if freezes > 0}
			<div class="freezes" title="freeze tokens">
				{#each Array(freezes) as _, i (i)}
					<svg width="9" height="9" viewBox="0 0 12 12"
						><path
							d="M6 0 V12 M0 6 H12 M2 2 L10 10 M10 2 L2 10"
							stroke="var(--blue-deep)"
							stroke-width="1.6"
						/></svg
					>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.streak {
		display: inline-flex;
		align-items: center;
		gap: 12px;
	}
	.flame {
		animation: flicker 1.6s ease-in-out infinite;
		transform-origin: 50% 90%;
	}
	.count {
		font-family: var(--font-display);
		font-size: 22px;
		line-height: 1;
		color: var(--orange-deep);
	}
	.label {
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.freezes {
		display: flex;
		gap: 3px;
		margin-top: 2px;
	}
</style>
