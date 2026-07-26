<script lang="ts">
	import { auth } from '$lib/auth.svelte';
	import { goto } from '$app/navigation';
	import { RANKS } from '$lib/ranks';
	import { rankProgress } from '$lib/xp';
	import RankInsignia from '$lib/components/RankInsignia.svelte';

	const user = $derived(auth.user);
	const rp = $derived(rankProgress(user?.xp ?? 0));
	const xp = $derived(user?.xp ?? 0);
	const n = (v: number) => v.toLocaleString('en-IN');

	/* draw the ladder top-down (highest rank first) so the climb reads upward.
	 * The summit (grade 14) is lifted out into its own glowing plate. */
	const rungs = $derived(
		[...RANKS]
			.map((r, i) => ({ ...r, no: i + 1 }))
			.reverse()
			.slice(1)
	);
	const summit = RANKS[RANKS.length - 1];
	const atSummit = $derived(rp.current.code === summit.code);
	const toSummit = $derived(Math.max(0, summit.xp - xp));
	const toNext = $derived(rp.next ? rp.next.xp - xp : 0);

	function state(code: string, rungXp: number) {
		if (rp.current.code === code) return 'current';
		if (rp.next?.code === code) return 'next';
		return xp >= rungXp ? 'cleared' : 'future';
	}
</script>

<svelte:head><title>Rank Ladder — UPSCVidya</title></svelte:head>

<div class="screen">
	<header class="subhead">
		<button class="backbtn" aria-label="back" onclick={() => goto('/profile')}>
			<span class="backchev"></span>
		</button>
		<div class="head-txt">
			<h1 class="stencil">Rank Ladder</h1>
			<div class="label">Climb from the bottom · {RANKS.length} ranks</div>
		</div>
	</header>

	<!-- ── summit: the grade the whole ladder points at ─────────────── -->
	<div class="summit" class:held={atSummit}>
		<span class="glow" aria-hidden="true"></span>
		<div class="sum-plate brass"><RankInsignia rank={summit.code} width={34} /></div>
		<div class="sum-txt">
			<div class="sum-k">{atSummit ? 'Summit held' : 'Summit'} · Grade {RANKS.length}</div>
			<div class="sum-n stencil">{summit.label}</div>
			<div class="sum-x">
				{n(summit.xp)} XP{#if !atSummit} · {n(toSummit)} to go{/if}
			</div>
		</div>
	</div>

	<div class="ladder">
		{#each rungs as r (r.code)}
			{@const st = state(r.code, r.xp)}

			{#if st === 'current' && rp.next}
				<div class="promo">
					<span class="promo-arrow" aria-hidden="true"></span>
					<span>{n(toNext)} XP to promotion</span>
					<span class="promo-arrow" aria-hidden="true"></span>
				</div>
			{/if}

			{#if st === 'current'}
				<div class="you">
					<div class="you-plate brass"><RankInsignia rank={r.code} width={32} /></div>
					<div class="you-txt">
						<div class="you-k">You are here · Grade {r.no}</div>
						<div class="you-n stencil">{r.label}</div>
						{#if rp.next}
							<div class="track rust"><span class="fill" style:width="{rp.pct}%"></span></div>
							<div class="you-x">{n(xp)} / {n(rp.next.xp)} XP</div>
						{:else}
							<div class="you-x">{n(xp)} XP · top of the ladder</div>
						{/if}
					</div>
				</div>
			{:else}
				<div class="rung {st}">
					<div class="rung-ins"><RankInsignia rank={r.code} width={26} /></div>
					<div class="rung-txt">
						<div class="rung-n">{r.label}</div>
						<div class="rung-x">
							{#if st === 'next'}
								Next up · {n(r.xp)} XP
							{:else if st === 'cleared'}
								Cleared · {n(r.xp)} XP
							{:else}
								{n(r.xp)} XP
							{/if}
						</div>
					</div>
					<span class="rung-no">{String(r.no).padStart(2, '0')}</span>
				</div>
			{/if}
		{/each}
	</div>
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		gap: 13px;
	}

	/* ── header ───────────────────────────────────────────────────── */
	.subhead {
		display: flex;
		align-items: center;
		gap: 11px;
	}
	.backbtn {
		flex: none;
		width: 34px;
		height: 34px;
		border-radius: 10px;
		border: var(--bw) solid var(--khaki);
		background: var(--grad-plate);
		box-shadow: 0 3px 0 var(--edge), var(--emboss);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.backbtn:active {
		transform: translateY(2px);
		box-shadow: 0 1px 0 var(--edge), var(--emboss);
	}
	.backchev {
		width: 8px;
		height: 8px;
		border-left: 2px solid var(--ink-2);
		border-bottom: 2px solid var(--ink-2);
		transform: rotate(45deg);
		margin-left: -3px;
	}
	.head-txt {
		flex: 1;
		min-width: 0;
	}
	h1 {
		margin: 0;
		font-size: 26px;
		line-height: 1;
		letter-spacing: 0.05em;
	}
	.head-txt .label {
		margin-top: 2px;
		font-size: 10px;
		letter-spacing: 0.1em;
	}

	/* ── summit plate ─────────────────────────────────────────────── */
	.summit {
		position: relative;
		display: flex;
		align-items: center;
		gap: 13px;
		padding: 15px 14px;
		border: var(--bw-bold) solid var(--gold-edge);
		border-radius: var(--r-2xl);
		background: radial-gradient(120% 90% at 50% 0%, #fff3d0, #f3dfa8 60%, #e8cd85);
		box-shadow:
			0 0 0 4px rgba(240, 207, 130, 0.35),
			0 0 34px rgba(201, 154, 69, 0.5),
			0 6px 0 #cbb079,
			0 16px 26px rgba(90, 70, 25, 0.25);
		overflow: hidden;
	}
	:global([data-theme='dark']) .summit {
		background: radial-gradient(120% 90% at 50% 0%, #4a3d1c, #33290f 60%, #262009);
		box-shadow:
			0 0 0 4px rgba(240, 207, 130, 0.18),
			0 0 30px rgba(201, 154, 69, 0.28),
			0 6px 0 #1b1608,
			0 16px 26px rgba(0, 0, 0, 0.45);
	}
	.summit .glow {
		position: absolute;
		inset: 0;
		background: radial-gradient(60% 40% at 50% -10%, rgba(255, 255, 255, 0.9), transparent 70%);
		animation: sumPulse 3s ease-in-out infinite;
		pointer-events: none;
	}
	:global([data-theme='dark']) .summit .glow {
		background: radial-gradient(60% 40% at 50% -10%, rgba(240, 207, 130, 0.32), transparent 70%);
	}
	.sum-plate {
		position: relative;
		flex: none;
		width: 52px;
		height: 66px;
	}
	.sum-txt {
		position: relative;
		flex: 1;
		min-width: 0;
	}
	.sum-k {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--gold-edge);
	}
	:global([data-theme='dark']) .sum-k {
		color: var(--gold-hi);
	}
	.sum-n {
		font-size: 25px;
		line-height: 1;
		margin-top: 2px;
		color: #3b2f11;
	}
	:global([data-theme='dark']) .sum-n {
		color: var(--gold-hi);
	}
	.sum-x {
		font-size: 11px;
		font-weight: 700;
		color: #7a5c1c;
		margin-top: 3px;
	}
	:global([data-theme='dark']) .sum-x {
		color: var(--ink-2);
	}
	.summit.held .sum-x {
		color: var(--green-edge);
	}

	/* ── ladder ───────────────────────────────────────────────────── */
	.ladder {
		display: flex;
		flex-direction: column;
		gap: 9px;
	}

	/* future + cleared rungs are pressed into the canvas */
	.rung {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 11px 12px;
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-lg);
		background: var(--bg-1);
		box-shadow: var(--recess-in);
	}
	.rung-ins {
		flex: none;
		width: 30px;
		display: flex;
		justify-content: center;
		filter: grayscale(1);
		opacity: 0.75;
	}
	.rung-txt {
		flex: 1;
		min-width: 0;
	}
	.rung-n {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 15px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.rung-x {
		font-size: 11px;
		font-weight: 600;
		color: var(--ink-4);
	}
	.rung-no {
		flex: none;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 13px;
		color: var(--ink-4);
	}

	/* the rung immediately above you — raised card stock, rust caption */
	.rung.next {
		border: var(--bw) solid var(--line);
		background: var(--grad-plate);
		box-shadow: 0 3px 0 var(--edge), var(--emboss);
	}
	.rung.next .rung-ins {
		filter: none;
		opacity: 1;
	}
	.rung.next .rung-n {
		color: var(--ink-1);
	}
	.rung.next .rung-x {
		color: var(--orange-deep);
		font-weight: 700;
	}
	.rung.next .rung-no {
		color: var(--ink-3);
	}

	/* already climbed — dashed and faded, kept as record */
	.rung.cleared {
		border-style: dashed;
		opacity: 0.75;
	}

	/* ── promotion marker ─────────────────────────────────────────── */
	.promo {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 2px 0;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--orange-deep);
	}
	.promo-arrow {
		width: 0;
		height: 0;
		border-left: 7px solid transparent;
		border-right: 7px solid transparent;
		border-bottom: 9px solid var(--orange-deep);
	}

	/* ── you are here ─────────────────────────────────────────────── */
	.you {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 13px;
		border: var(--bw-bold) solid #96401d;
		border-radius: var(--r-xl);
		background: linear-gradient(#fdeee6, #f6d8c9);
		box-shadow:
			0 5px 0 #d3a695,
			0 14px 22px rgba(120, 55, 25, 0.22),
			var(--emboss);
	}
	:global([data-theme='dark']) .you {
		background: linear-gradient(#3a2418, #241410);
		box-shadow: 0 5px 0 #4c1f12, 0 14px 22px rgba(0, 0, 0, 0.45), var(--emboss);
	}
	.you-plate {
		flex: none;
		width: 50px;
		height: 64px;
	}
	.you-txt {
		flex: 1;
		min-width: 0;
	}
	.you-k {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #a05a44;
	}
	.you-n {
		font-size: 24px;
		line-height: 1;
		margin-top: 2px;
		color: var(--red-deep);
		text-shadow: none;
	}
	:global([data-theme='dark']) .you-n {
		color: #ffb99f;
	}
	.you .track {
		margin-top: 7px;
		background: #e4c6b8;
		box-shadow: inset 0 1px 3px rgba(120, 60, 35, 0.35);
	}
	:global([data-theme='dark']) .you .track {
		background: rgba(0, 0, 0, 0.4);
	}
	.you-x {
		font-size: 10px;
		font-weight: 700;
		color: #8f4a35;
		margin-top: 4px;
	}
	:global([data-theme='dark']) .you-x {
		color: #c79a8a;
	}

	@keyframes sumPulse {
		0%,
		100% {
			opacity: 0.55;
		}
		50% {
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.summit .glow {
			animation: none;
		}
	}
</style>
