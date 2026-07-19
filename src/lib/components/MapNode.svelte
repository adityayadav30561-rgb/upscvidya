<script lang="ts">
	type NodeState = 'free-roam' | 'unconquered' | 'conquered' | 'decaying' | 'gold';

	let {
		state,
		label = '',
		onclick
	}: {
		/** Foundations §05 MAP NODE STATES — 44px */
		state: NodeState;
		label?: string;
		onclick?: (e: MouseEvent) => void;
	} = $props();
</script>

<button class="wrap" {onclick} aria-label="{label || 'topic'} — {state}">
	<span class="node {state}">
		{#if state === 'free-roam'}
			<!-- open book -->
			<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
				<path
					d="M2 3 C4 2 6 2 8 3.2 C10 2 12 2 14 3 V13 C12 12 10 12 8 13.2 C6 12 4 12 2 13 Z M8 3.2 V13.2"
					fill="none"
					stroke="#4d4433"
					stroke-width="1.3"
				/>
			</svg>
		{:else if state === 'unconquered'}
			<span class="dot"></span>
		{:else if state === 'conquered'}
			<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
				<path d="M4 9.5 L7.5 13 L14 5.5" fill="none" stroke="#4d4433" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		{:else if state === 'decaying'}
			<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
				<path d="M4 9.5 L7.5 13 L14 5.5" fill="none" stroke="var(--khaki-deep)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		{:else if state === 'gold'}
			<svg width="20" height="20" viewBox="-11 -11 22 22" aria-hidden="true">
				<path
					d="M0 -10 L2.35 -3.24 L9.51 -3.09 L3.8 1.24 L5.88 8.09 L0 4 L-5.88 8.09 L-3.8 1.24 L-9.51 -3.09 L-2.35 -3.24 Z"
					fill="#4d4433"
				/>
			</svg>
		{/if}
	</span>
	{#if label}<span class="label">{label}</span>{/if}
</button>

<style>
	.wrap {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}
	.node {
		width: 44px;
		height: 44px;
		border-radius: var(--r-full);
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			background var(--t-conquest) var(--ease-pop),
			box-shadow var(--t-conquest) var(--ease-pop);
	}
	.free-roam {
		background: var(--bg-0);
		border: var(--bw) solid var(--line);
	}
	.unconquered {
		background: var(--orange-tint);
		border: var(--bw-bold) solid var(--orange-deep);
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: var(--r-full);
		background: var(--orange-deep);
	}
	.conquered {
		background: var(--green);
		border: var(--bw) solid var(--line);
	}
	.decaying {
		background: var(--bg-1);
		border: 2px dashed var(--khaki);
		opacity: 0.6;
	}
	.gold {
		background: linear-gradient(180deg, #f2cd6a, #9c741f);
		border: var(--bw) solid var(--line);
		box-shadow: var(--shadow-glow-gold);
	}
	.label {
		font-size: 10px;
		font-weight: 700;
		color: var(--ink-3);
		text-align: center;
	}
</style>
