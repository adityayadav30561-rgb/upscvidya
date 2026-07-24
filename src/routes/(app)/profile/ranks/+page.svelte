<script lang="ts">
	import { auth } from '$lib/auth.svelte';
	import { goto } from '$app/navigation';
	import { RANKS } from '$lib/ranks';
	import { rankProgress } from '$lib/xp';
	import RankInsignia from '$lib/components/RankInsignia.svelte';

	const user = $derived(auth.user);
	const rp = $derived(rankProgress(user?.xp ?? 0));
	const xp = $derived(user?.xp ?? 0);

	/* draw the ladder top-down (highest rank first) so the climb reads upward */
	const rungs = $derived([...RANKS].map((r, i) => ({ ...r, no: i + 1 })).reverse());
</script>

<svelte:head><title>Rank Ladder — UPSCVidya</title></svelte:head>

<div class="screen">
	<header class="sub-head">
		<button class="back" aria-label="back" onclick={() => goto('/profile')}>
			<svg viewBox="0 0 14 14" width="14" height="14"><path d="M9 2 L4 7 L9 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
		</button>
		<h1>Rank Ladder</h1>
	</header>

	<div class="current-card">
		<div class="cc-ins"><RankInsignia rank={rp.current.code} width={40} /></div>
		<div class="cc-text">
			<div class="cc-rank">{rp.current.label}</div>
			<div class="cc-sub">
				{xp.toLocaleString('en-IN')} XP
				{#if rp.next}· {(rp.next.xp - xp).toLocaleString('en-IN')} to next{/if}
			</div>
		</div>
		<div class="cc-grade">{rp.current.code === 'dg' ? 'MAX' : `${RANKS.length - RANKS.findIndex((r) => r.code === rp.current.code)}↑`}</div>
	</div>

	<div class="ladder">
		{#each rungs as r (r.code)}
			{@const reached = xp >= r.xp}
			{@const isCurrent = rp.current.code === r.code}
			<div class="rung" class:reached class:current={isCurrent}>
				<div class="ins"><RankInsignia rank={r.code} width={30} /></div>
				<div class="r-text">
					<div class="r-name">{r.label}</div>
					<div class="r-xp">{r.xp.toLocaleString('en-IN')} XP</div>
				</div>
				<div class="r-no">{r.no}</div>
				{#if isCurrent}<span class="you">YOU</span>{/if}
				{#if reached && !isCurrent}<span class="tick">✓</span>{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.sub-head {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.back {
		flex: none;
		width: 36px;
		height: 36px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		background: var(--bg-2);
		color: var(--ink-1);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 22px;
		text-transform: uppercase;
	}
	.current-card {
		display: flex;
		align-items: center;
		gap: 13px;
		background: var(--khaki-tint);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		padding: 14px 16px;
		box-shadow: var(--shadow-2);
	}
	.cc-ins {
		flex: none;
		background: var(--bg-0);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 6px 10px;
	}
	.cc-text {
		flex: 1;
	}
	.cc-rank {
		font-family: var(--font-display);
		font-size: 17px;
		text-transform: uppercase;
	}
	.cc-sub {
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-2);
		margin-top: 2px;
	}
	.cc-grade {
		flex: none;
		font-family: var(--font-display);
		font-size: 13px;
		color: var(--khaki-deep);
	}
	.ladder {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.rung {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-lg);
		padding: 10px 14px;
		opacity: 0.5;
		position: relative;
	}
	.rung.reached {
		opacity: 1;
	}
	.rung.current {
		border: var(--bw-bold) solid var(--khaki-deep);
		background: var(--bg-raise);
		box-shadow: var(--shadow-2);
	}
	.ins {
		flex: none;
		width: 34px;
		display: flex;
		justify-content: center;
	}
	.rung:not(.reached) .ins {
		filter: grayscale(1);
	}
	.r-text {
		flex: 1;
		min-width: 0;
	}
	.r-name {
		font-weight: 900;
		font-size: 13.5px;
	}
	.r-xp {
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.r-no {
		flex: none;
		font-family: var(--font-display);
		font-size: 16px;
		color: var(--ink-3);
		opacity: 0.5;
	}
	.you {
		position: absolute;
		right: 12px;
		top: -8px;
		font-size: 9px;
		font-weight: 900;
		background: var(--khaki-deep);
		color: var(--bg-0);
		border-radius: var(--r-sm);
		padding: 2px 7px;
	}
	.tick {
		position: absolute;
		right: 40px;
		font-size: 12px;
		color: var(--green-deep);
		font-weight: 900;
	}
</style>
