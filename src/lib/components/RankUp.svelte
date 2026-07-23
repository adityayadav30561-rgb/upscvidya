<script lang="ts">
	/* Full-screen rank-up takeover (Prompt 09). Fires once per crossing —
	   driven by the server's rank_up payload, never recomputed client-side. */
	import { RANKS } from '$lib/ranks';
	import type { RankCode } from '$lib/ranks';
	import RankInsignia from './RankInsignia.svelte';
	import Button from './Button.svelte';

	let {
		to,
		onclose
	}: {
		to: RankCode;
		onclose: () => void;
	} = $props();

	const rank = $derived(RANKS.find((r) => r.code === to));
</script>

<div class="takeover" role="dialog" aria-modal="true" aria-label="promotion">
	<span class="confetti c1"></span>
	<span class="confetti c2"></span>
	<span class="confetti c3"></span>
	<span class="confetti c4"></span>
	<div class="panel">
		<div class="stamp">PROMOTION ORDER</div>
		<div class="insignia"><RankInsignia rank={to} width={84} /></div>
		<div class="rank-name">{rank?.label ?? to}</div>
		<p class="line">Field promotion confirmed. New insignia issued — wear it well.</p>
		<Button variant="primary" onclick={onclose}>Accept promotion →</Button>
	</div>
</div>

<style>
	.takeover {
		position: fixed;
		inset: 0;
		z-index: 80;
		background: rgba(51, 48, 31, 0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
	}
	.panel {
		width: 100%;
		max-width: 340px;
		background: var(--bg-0);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		box-shadow: var(--shadow-soft);
		padding: 28px 22px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		text-align: center;
		animation: land var(--t-conquest) var(--ease-pop);
	}
	@keyframes land {
		0% {
			transform: scale(0.6) rotate(-3deg);
			opacity: 0;
		}
		70% {
			transform: scale(1.06);
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}
	.stamp {
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 12px;
		background: var(--green);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 5px 14px;
		transform: rotate(-2deg);
		box-shadow: var(--shadow-2);
	}
	.insignia {
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 12px 20px;
	}
	.rank-name {
		font-family: var(--font-display);
		font-size: 24px;
		text-transform: uppercase;
		line-height: 1.2;
	}
	.line {
		margin: 0;
		font-size: 13px;
		color: var(--ink-2);
	}
	.confetti {
		position: absolute;
		width: 10px;
		height: 10px;
		border: 1.5px solid var(--line);
	}
	.c1 {
		top: 18%;
		left: 22%;
		background: var(--orange);
		transform: rotate(15deg);
		animation: drift 1.5s ease-in-out infinite alternate;
	}
	.c2 {
		top: 24%;
		right: 20%;
		background: var(--blue);
		border-radius: 50%;
		animation: drift 1.9s ease-in-out infinite alternate-reverse;
	}
	.c3 {
		bottom: 26%;
		left: 28%;
		background: var(--gold-hi);
		border-radius: 50%;
		animation: drift 1.7s ease-in-out infinite alternate;
	}
	.c4 {
		bottom: 20%;
		right: 26%;
		background: var(--green);
		transform: rotate(-12deg);
		animation: drift 1.4s ease-in-out infinite alternate-reverse;
	}
	@keyframes drift {
		to {
			transform: translateY(10px) rotate(35deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.panel,
		.confetti {
			animation: none;
		}
	}
</style>
