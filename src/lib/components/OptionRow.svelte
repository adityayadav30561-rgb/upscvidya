<script lang="ts">
	import type { Snippet } from 'svelte';

	type RowState = 'idle' | 'selected' | 'correct' | 'incorrect' | 'missed';

	let {
		state = 'idle',
		note = '',
		onclick,
		children
	}: {
		/** Foundations §05 OPTION ROWS. `missed` = the correct answer the user
		 *  did not pick during review (green tint, no shadow emphasis). */
		state?: RowState;
		note?: string;
		onclick?: (e: MouseEvent) => void;
		children: Snippet;
	} = $props();
</script>

<button class="row {state}" {onclick} disabled={!onclick}>
	<span class="indicator {state}">
		{#if state === 'selected'}
			<span class="sel-dot"></span>
		{:else if state === 'correct' || state === 'missed'}
			<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
				<path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		{:else if state === 'incorrect'}
			<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
				<path d="M2 2 L8 8 M8 2 L2 8" stroke="#fff" stroke-width="2" stroke-linecap="round" />
			</svg>
		{/if}
	</span>
	<span class="text" class:emphasis={state !== 'idle'}>
		{@render children()}
		{#if note}<span class="note {state}">· {note}</span>{/if}
	</span>
</button>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		text-align: left;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 13px 16px;
		min-height: 44px;
		cursor: pointer;
		font-family: var(--font-ui);
		/* answer feedback: border + tint transition 200ms (interaction notes) */
		transition:
			background var(--t-base) var(--ease),
			border-color var(--t-base) var(--ease),
			box-shadow var(--t-base) var(--ease);
	}
	.row:disabled {
		cursor: default;
	}
	.row.selected {
		background: var(--orange-tint);
		border: var(--bw-bold) solid var(--line);
		box-shadow: var(--shadow-2);
	}
	.row.correct,
	.row.missed {
		background: var(--green-tint);
		border: var(--bw-bold) solid var(--green-deep);
	}
	.row.incorrect {
		background: var(--red-tint);
		border: var(--bw-bold) solid var(--red-deep);
		animation: shake var(--t-base) var(--ease) 1;
	}
	@keyframes shake {
		0%,
		100% {
			transform: translateX(0);
		}
		25% {
			transform: translateX(-4px);
		}
		75% {
			transform: translateX(4px);
		}
	}

	.indicator {
		flex: none;
		width: 20px;
		height: 20px;
		border-radius: var(--r-full);
		border: var(--bw) solid var(--line);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.indicator.selected {
		background: var(--bg-2);
	}
	.sel-dot {
		width: 10px;
		height: 10px;
		border-radius: var(--r-full);
		background: var(--orange-deep);
	}
	.indicator.correct,
	.indicator.missed {
		background: var(--green-deep);
		border: none;
	}
	.indicator.incorrect {
		background: var(--red-deep);
		border: none;
	}

	.text {
		font-size: 14.5px;
		color: var(--ink-1);
	}
	.text.emphasis {
		font-weight: 700;
	}
	.note {
		font-size: 11px;
		font-weight: 400;
		color: var(--ink-3);
	}
	.note.correct,
	.note.missed {
		color: var(--green-deep);
		font-weight: 700;
	}
	.note.incorrect {
		color: var(--red-deep);
		font-weight: 700;
	}
</style>
