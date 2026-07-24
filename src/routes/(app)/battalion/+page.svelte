<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		fetchBoard,
		formatCountdown,
		isFinalStretch,
		podiumOrder,
		listRows,
		deltaLabel,
		type Board,
		type BoardRow
	} from '$lib/board';
	import RankInsignia from '$lib/components/RankInsignia.svelte';
	import BadgeIcon from '$lib/components/BadgeIcon.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import { RANKS } from '$lib/ranks';
	import { BADGES } from '$lib/xp';

	const rankLabel = (code: string) => RANKS.find((r) => r.code === code)?.label ?? 'Cadet';

	let board = $state<Board | null>(null);
	let error = $state('');
	let refreshing = $state(false);
	let secondsLeft = $state(0);

	let booted = false;
	$effect(() => {
		if (booted) return;
		booted = true;
		load();
	});

	async function load(force = false) {
		refreshing = force;
		try {
			board = await fetchBoard(force);
			secondsLeft = board.seconds_left;
			error = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not load the board';
		} finally {
			refreshing = false;
		}
	}

	/* live countdown tick */
	const tick = setInterval(() => {
		if (secondsLeft > 0) secondsLeft -= 1;
	}, 1000);
	onDestroy(() => clearInterval(tick));

	const podium = $derived(board ? podiumOrder(board.rows) : [null, null, null]);
	const rest = $derived(board ? listRows(board.rows) : []);
	const you = $derived(board?.you ?? null);
	/* your row is only "floating" when it isn't already visible in the list */
	const youInList = $derived(!!you && you.rank > 3 && rest.some((r) => r.is_you));

	/* mini-profile sheet (design: tap an aspirant → rank, streak, XP; no chat) */
	let peek = $state<BoardRow | null>(null);
	let peekOpen = $state(false);
	function openPeek(r: BoardRow) {
		peek = r;
		peekOpen = true;
	}

	const pillarHeights = [56, 74, 44]; // silver, gold, bronze
	const pillarColors = ['var(--green)', 'var(--orange)', 'var(--blue)'];
</script>

<svelte:head><title>UPSCVidya — Battalion Board</title></svelte:head>

<div class="board">
	<div class="head">
		<button class="icon-btn" aria-label="back" onclick={() => goto('/')}>
			<svg width="13" height="13" viewBox="0 0 14 14"><path d="M9 2 L4 7 L9 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
		</button>
		<div class="head-text">
			{#if board?.battalion}
				<div class="b-name">{board.battalion.name}</div>
				<div class="b-sub">{board.battalion.member_count} aspirants · week {board.week_no}</div>
			{:else if error}
				<div class="b-name">Battalion</div>
			{:else}
				<Skeleton width="120px" height="17px" />
			{/if}
		</div>
		{#if board}
			<span class="clock" class:hot={isFinalStretch(secondsLeft)}>
				⏱ {formatCountdown(secondsLeft)}
			</span>
		{/if}
	</div>

	{#if error}
		<div class="empty">
			<p>{error}</p>
			<button class="retry" onclick={() => load(true)}>Retry</button>
		</div>
	{:else if !board}
		<Skeleton height="180px" radius="var(--r-xl)" />
		<Skeleton height="52px" radius="var(--r-lg)" />
		<Skeleton height="52px" radius="var(--r-lg)" />
	{:else if board.rows.length === 0}
		<!-- new battalion: nobody has scored yet this week -->
		<div class="empty">
			<div class="empty-mark">⚑</div>
			<div class="empty-title">Week not started</div>
			<p>No XP earned in this battalion yet. Finish a topic quiz and you take point.</p>
			<button class="retry" onclick={() => goto('/map')}>To the map →</button>
		</div>
	{:else}
		<!-- podium -->
		<div class="podium">
			{#each podium as p, i (i)}
				<div class="pillar-col">
					{#if p}
						{#if i === 1}<span class="crown">♛</span>{/if}
						<div class="p-ins"><RankInsignia rank={p.rank_code} width={i === 1 ? 30 : 26} /></div>
						<button class="p-name" onclick={() => openPeek(p)}>{p.name}</button>
						<div class="p-rank">{rankLabel(p.rank_code)}</div>
						<div class="p-xp">{p.xp_week.toLocaleString('en-IN')} XP</div>
						<div
							class="pillar"
							class:gold={i === 1}
							class:mine={p.is_you}
							style:height="{pillarHeights[i]}px"
							style:background={pillarColors[i]}
						>
							{p.rank}
						</div>
					{:else}
						<div class="p-empty" style:height="{pillarHeights[i]}px">—</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- ranks 4+ -->
		<div class="rows">
			{#each rest as r (r.rank)}
				<button class="row" class:me={r.is_you} onclick={() => openPeek(r)}>
					<span class="r-num">{r.rank}</span>
					<span class="r-ins"><RankInsignia rank={r.rank_code} width={17} /></span>
					<span class="r-text">
						<span class="r-name">{r.is_you ? `You — ${r.name}` : r.name}</span>
						<span class="r-rank">
							{rankLabel(r.rank_code)}
							{#if r.is_you}{@const label = deltaLabel(r, board.behind)}{#if label} · {label}{/if}{/if}
						</span>
					</span>
					{#if r.badges && r.badges.length}
						<span class="r-badges">
							{#each r.badges.slice(0, 3) as code (code)}<BadgeIcon {code} earned size={18} />{/each}
						</span>
					{/if}
					<span class="r-xp">{r.xp_week.toLocaleString('en-IN')}</span>
				</button>
			{/each}
			{#if board.rows.length < (board.battalion?.member_count ?? 0)}
				<div class="more">
					{board.rows.length + 1} – {board.battalion?.member_count} yet to score this week
				</div>
			{/if}
		</div>

		<div class="note">
			<span class="note-star">★</span>
			<span>Top 5 at week's end earn a Commendation badge; the podium earns rank insignia for the profile.</span>
		</div>

		<button class="refresh" disabled={refreshing} onclick={() => load(true)}>
			{refreshing ? 'Refreshing…' : 'Refresh standings'}
		</button>
	{/if}
</div>

<!-- sticky "you" bar when your row is off-podium and out of the rendered list -->
{#if you && !youInList && board && board.rows.length > 0}
	<div class="sticky-you">
		<span class="r-num">{you.rank}</span>
		<span class="r-ins"><RankInsignia rank={you.rank_code} width={17} /></span>
		<span class="r-text">
			<span class="r-name">You — {you.name}</span>
			<span class="r-delta">
				{you.unranked ? 'No XP yet this week' : deltaLabel(you, board.behind)}
			</span>
		</span>
		<span class="r-xp">{you.xp_week.toLocaleString('en-IN')}</span>
	</div>
{/if}

<!-- mini-profile: rank, streak, weekly XP. No chat by design. -->
<Sheet bind:open={peekOpen} title={peek?.name ?? ''}>
	{#if peek}
		<div class="peek">
			<div class="peek-ins"><RankInsignia rank={peek.rank_code} width={44} /></div>
			<div class="peek-stats">
				<div class="peek-row"><span>Rank</span><span class="pv">{rankLabel(peek.rank_code)}</span></div>
				<div class="peek-row"><span>Position</span><span class="pv">#{peek.rank}</span></div>
				<div class="peek-row"><span>XP this week</span><span class="pv">{peek.xp_week.toLocaleString('en-IN')}</span></div>
				<div class="peek-row"><span>Streak</span><span class="pv">{peek.streak} {peek.streak === 1 ? 'day' : 'days'}</span></div>
			</div>
		</div>

		{#if peek.badges && peek.badges.length}
			<div class="peek-decos">
				<div class="pd-title">DECORATIONS</div>
				<div class="pd-grid">
					{#each peek.badges as code (code)}
						<div class="pd-item">
							<BadgeIcon {code} earned size={44} />
							<span class="pd-name">{BADGES[code]?.label ?? code}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<p class="peek-note">Weekly XP only — everyone restarts Monday, so a bad week never buries anyone.</p>
	{/if}
</Sheet>

<style>
	.board {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding-bottom: 70px; /* clearance for the sticky row */
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.icon-btn {
		flex: none;
		width: 34px;
		height: 34px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		background: var(--bg-2);
		color: var(--ink-1);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.head-text {
		flex: 1;
		min-width: 0;
	}
	.b-name {
		font-family: var(--font-display);
		font-size: 17px;
		text-transform: uppercase;
	}
	.b-sub {
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.clock {
		flex: none;
		font-size: 11px;
		font-weight: 900;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 5px 11px;
	}
	.clock.hot {
		background: var(--red-tint);
		color: var(--red-deep);
		border-color: var(--red-deep);
		animation: pulse 1.2s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.55;
		}
	}

	/* podium */
	.podium {
		display: flex;
		align-items: flex-end;
		gap: 10px;
		padding: 8px 4px 0;
	}
	.pillar-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}
	.crown {
		color: var(--gold-hi);
		font-size: 16px;
		line-height: 1;
	}
	.p-ins {
		display: flex;
		justify-content: center;
	}
	.p-name {
		font-weight: 900;
		font-size: 11.5px;
		text-align: center;
		background: none;
		border: none;
		cursor: pointer;
		font-family: var(--font-ui);
		color: var(--ink-1);
		padding: 0;
	}
	.p-xp {
		font-size: 10px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.pillar {
		width: 100%;
		border: var(--bw) solid var(--line);
		border-radius: 12px 12px 0 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-display);
		font-size: 16px;
		color: var(--ink-1);
		animation: rise var(--t-conquest) var(--ease-pop);
		transform-origin: bottom;
	}
	.pillar.gold {
		border-width: var(--bw-bold);
		font-size: 20px;
		box-shadow: var(--shadow-2);
	}
	.pillar.mine {
		outline: 2px dashed var(--khaki-deep);
		outline-offset: 2px;
	}
	@keyframes rise {
		from {
			transform: scaleY(0.1);
		}
	}
	.p-empty {
		width: 100%;
		border: var(--bw) dashed var(--line-soft);
		border-radius: 12px 12px 0 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--ink-3);
		font-size: 12px;
	}

	/* rows */
	.rows {
		display: flex;
		flex-direction: column;
		gap: 9px;
		border-top: var(--bw-bold) solid var(--line);
		padding-top: 14px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 11px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 10px 14px;
		font-family: var(--font-ui);
		text-align: left;
		cursor: pointer;
		width: 100%;
	}
	.row.me {
		background: var(--orange-tint);
		border-width: var(--bw-bold);
		box-shadow: var(--shadow-2);
		padding: 12px 14px;
	}
	.r-num {
		flex: none;
		width: 20px;
		font-family: var(--font-display);
		font-size: 13px;
		color: var(--ink-3);
	}
	.row.me .r-num {
		color: var(--ink-1);
		font-size: 14px;
	}
	.r-ins {
		flex: none;
		width: 19px;
		display: flex;
		justify-content: center;
	}
	.r-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.r-name {
		font-weight: 700;
		font-size: 13px;
		color: var(--ink-1);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row.me .r-name {
		font-weight: 900;
		font-size: 13.5px;
	}
	.r-delta {
		font-size: 10px;
		font-weight: 700;
		color: var(--orange-deep);
	}
	.r-xp {
		flex: none;
		font-size: 11.5px;
		font-weight: 900;
		color: var(--ink-2);
	}
	.row.me .r-xp {
		font-size: 12px;
		color: var(--ink-1);
	}
	.more {
		text-align: center;
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.r-rank {
		font-size: 10px;
		font-weight: 700;
		color: var(--ink-3);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row.me .r-rank {
		color: var(--orange-deep);
	}
	.r-badges {
		flex: none;
		display: flex;
		gap: 2px;
		align-items: center;
	}
	.p-rank {
		font-size: 9px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--khaki-deep);
	}
	.peek-decos {
		margin-top: 18px;
	}
	.pd-title {
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.04em;
		color: var(--ink-3);
		margin-bottom: 10px;
	}
	.pd-grid {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}
	.pd-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		width: 60px;
	}
	.pd-name {
		font-size: 9px;
		font-weight: 900;
		text-align: center;
		color: var(--ink-2);
		line-height: 1.15;
	}

	.note {
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--khaki-tint);
		border: var(--bw) solid var(--khaki-deep);
		border-radius: var(--r-md);
		padding: 10px 14px;
		font-size: 12px;
		font-weight: 700;
	}
	.note-star {
		color: var(--khaki-deep);
	}
	.refresh {
		align-self: center;
		background: none;
		border: none;
		font-family: var(--font-ui);
		font-size: 11.5px;
		font-weight: 700;
		color: var(--ink-3);
		cursor: pointer;
	}

	/* empty / error */
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		text-align: center;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-xl);
		padding: 34px 20px;
	}
	.empty-mark {
		font-size: 26px;
		color: var(--khaki-deep);
	}
	.empty-title {
		font-family: var(--font-display);
		font-size: 17px;
		text-transform: uppercase;
	}
	.empty p {
		margin: 0;
		font-size: 12.5px;
		color: var(--ink-2);
		max-width: 260px;
	}
	.retry {
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 13px;
		background: var(--orange);
		color: var(--ink-1);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 10px 20px;
		cursor: pointer;
	}

	/* sticky you */
	.sticky-you {
		position: fixed;
		left: 12px;
		right: 12px;
		bottom: 84px;
		max-width: 456px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 11px;
		background: var(--orange-tint);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-lg);
		padding: 10px 14px;
		box-shadow: var(--shadow-2);
		z-index: 40;
	}

	/* mini profile */
	.peek {
		display: flex;
		gap: 16px;
		align-items: center;
	}
	.peek-ins {
		flex: none;
		background: var(--bg-raise);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 8px 12px;
	}
	.peek-stats {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.peek-row {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
		font-weight: 700;
		color: var(--ink-2);
	}
	.pv {
		color: var(--ink-1);
		font-weight: 900;
	}
	.peek-note {
		margin: 14px 0 0;
		font-size: 11.5px;
		color: var(--ink-3);
		text-align: center;
	}
	@media (prefers-reduced-motion: reduce) {
		.pillar,
		.clock.hot {
			animation: none;
		}
	}
</style>
