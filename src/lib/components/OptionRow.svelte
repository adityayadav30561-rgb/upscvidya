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
	/* FIELD DOSSIER: each option is a raised card-stock key. Selecting presses
	   it into the page; verdicts recolour the whole plate. */
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		text-align: left;
		background: var(--grad-plate-2);
		border: var(--bw) solid var(--line);
		border-radius: 11px;
		padding: 13px 15px;
		min-height: 46px;
		cursor: pointer;
		font-family: var(--font-ui);
		box-shadow: 0 3px 0 #cfc4a0, var(--emboss);
		transition:
			background var(--t-base) var(--ease),
			border-color var(--t-base) var(--ease),
			box-shadow var(--t-base) var(--ease),
			transform var(--t-fast) var(--ease);
	}
	.row:not(:disabled):active {
		transform: translateY(2px);
		box-shadow: 0 1px 0 #cfc4a0, var(--emboss);
	}
	.row:disabled {
		cursor: default;
	}
	/* chosen: seated into the page */
	.row.selected {
		background: linear-gradient(#f8e3d3, #f0d0ba);
		border-color: var(--orange-deep);
		box-shadow: inset 0 2px 5px rgba(120, 60, 25, 0.22);
	}
	.row.correct,
	.row.missed {
		background: linear-gradient(#e9efd8, #dbe4c3);
		border-color: var(--green-deep);
		box-shadow: 0 3px 0 #b8c298, var(--emboss);
	}
	.row.incorrect {
		background: linear-gradient(#f7ddd4, #f0cabd);
		border-color: var(--red);
		box-shadow: 0 3px 0 var(--red-edge), var(--emboss);
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

	/* the pip: a moulded socket that fills when answered */
	.indicator {
		flex: none;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 2px solid var(--khaki);
		background: radial-gradient(circle at 35% 30%, #fff, #e6ddbf);
		box-shadow: inset 0 -2px 4px rgba(90, 78, 40, 0.25);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.sel-dot {
		width: 11px;
		height: 11px;
		border-radius: 50%;
		background: var(--grad-rust);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
	}
	.indicator.correct,
	.indicator.missed {
		background: var(--grad-olive);
		border-color: var(--green-edge);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
	}
	.indicator.incorrect {
		background: linear-gradient(#a8402f, #7d2a1a);
		border-color: #5d1d11;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
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
