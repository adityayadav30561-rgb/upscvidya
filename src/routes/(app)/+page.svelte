<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth.svelte';
	import { buildMap } from '$lib/map';
	import { rankProgress, istDate } from '$lib/xp';
	import { fetchDue, type SrDue } from '$lib/sr';
	import { fetchBoard, formatCountdown, type Board } from '$lib/board';
	import { fetchBriefing, type Briefing } from '$lib/ca';
	import { TOTAL_UNITS } from '$lib/polity';
	import RankInsignia from '$lib/components/RankInsignia.svelte';
	import StreakFlame from '$lib/components/StreakFlame.svelte';
	import ProgressRing from '$lib/components/ProgressRing.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import Button from '$lib/components/Button.svelte';

	let { data } = $props();

	const user = $derived(auth.user);
	const map = $derived(buildMap(data.topics, data.progress, data.isPremium));
	const rp = $derived(rankProgress(user?.xp ?? 0));

	/* SR due loads client-side (needs auth token) with its own skeleton slot */
	let sr = $state<SrDue | null>(null);
	let srLoaded = $state(false);
	let booted = false;
	$effect(() => {
		if (booted) return;
		booted = true;
		fetchDue()
			.then((d) => (sr = d))
			.catch(() => (sr = null))
			.finally(() => (srLoaded = true));
		fetchBoard()
			.then((b) => (board = b))
			.catch(() => (board = null));
		fetchBriefing()
			.then((b) => (briefing = b))
			.catch(() => (briefing = null))
			.finally(() => (briefingLoaded = true));
	});

	let board = $state<Board | null>(null);
	let briefing = $state<Briefing | null>(null);
	let briefingLoaded = $state(false);
	const briefingCount = $derived(briefing?.items.length ?? 0);
	const briefingDone = $derived(
		!!briefing && briefingCount > 0 && briefing.items.every((i) => i.quiz.length > 0 && i.quiz_answered >= i.quiz.length)
	);

	/* greeting is time-aware (interaction notes) */
	const greeting = (() => {
		const h = new Date().getHours();
		if (h < 4) return 'Still at it?';
		if (h < 12) return 'Good morning,';
		if (h < 17) return 'Good afternoon,';
		return 'Good evening,';
	})();

	const firstName = $derived((user?.display_name || 'Recruit').split(' ')[0]);
	const rankLabel = $derived(rp.current.label);

	/* stats row */
	const held = $derived(map.held);
	const goldCount = $derived(map.regions.reduce((s, r) => s + r.gold, 0));
	const decayCount = $derived(
		map.regions.flatMap((r) => r.nodes).filter((n) => n.visual === 'decaying').length
	);
	const accuracy = $derived.by(() => {
		// quiz accuracy from progress best scores (rough but honest with local data)
		const scored = data.progress.filter((p) => p.best_score_pct > 0);
		if (!scored.length) return null;
		return Math.round(scored.reduce((s, p) => s + p.best_score_pct, 0) / scored.length);
	});

	/* mission assembly: next guided topic + SR due + daily briefing (P13 stub) */
	const nextTopic = $derived(map.next);
	const missionMinutes = $derived(
		(nextTopic?.topic?.est_read_minutes ?? 0) + 12 + Math.round((sr?.count ?? 0) * 0.8)
	);

	/* weekly XP sparkline: sum xp_events per IST day, last 7 days */
	const spark = $derived.by(() => {
		const days: { day: string; xp: number }[] = [];
		for (let i = 6; i >= 0; i--) {
			days.push({ day: istDate(Date.now() - i * 86400000), xp: 0 });
		}
		for (const ev of data.xpEvents) {
			const d = istDate(new Date(ev.created.replace(' ', 'T')).getTime());
			const slot = days.find((x) => x.day === d);
			if (slot) slot.xp += ev.amount;
		}
		const max = Math.max(1, ...days.map((d) => d.xp));
		return { days, max };
	});

	/* streak sheet: last 30 days calendar (active = XP earned that day) */
	let streakSheet = $state(false);
	const last30 = $derived.by(() => {
		const active = new Set(spark.days.filter((d) => d.xp > 0).map((d) => d.day));
		if (user?.last_active_date) active.add(user.last_active_date);
		const out: { day: string; active: boolean }[] = [];
		for (let i = 29; i >= 0; i--) {
			const day = istDate(Date.now() - i * 86400000);
			out.push({ day, active: active.has(day) });
		}
		return out;
	});

	function beginMission() {
		if (nextTopic) goto(`/topic/${nextTopic.unit.code}`);
		else if ((sr?.count ?? 0) > 0) goto('/revision');
		else goto('/map');
	}
</script>

<svelte:head><title>UPSCVidya — Base Camp</title></svelte:head>

<div class="dash">
	<!-- header: insignia, greeting, XP bar, streak -->
	<div class="header">
		<div class="insignia-slot">
			{#if user}
				<RankInsignia rank={auth.rankCode} width={34} />
			{:else}
				<Skeleton width="34px" height="56px" />
			{/if}
		</div>
		<div class="who">
			<div class="greet">{greeting}</div>
			{#if user}
				<div class="name">{rankLabel} {firstName}</div>
				<div class="xp-row">
					<div class="xp-track"><div class="xp-fill" style:width="{rp.pct}%"></div></div>
					<span class="xp-num">
						{(user.xp ?? 0).toLocaleString('en-IN')}{rp.next ? ` / ${rp.next.xp.toLocaleString('en-IN')}` : ''} XP
					</span>
				</div>
			{:else}
				<Skeleton width="150px" height="18px" />
				<Skeleton width="180px" height="10px" />
			{/if}
		</div>
		<button class="streak-chip" onclick={() => (streakSheet = true)} aria-label="streak details">
			{#if user}
				<StreakFlame count={user.streak_current ?? 0} freezes={user.streak_freezes ?? 0} size={18} showLabel={false} />
			{:else}
				<Skeleton width="40px" height="40px" />
			{/if}
		</button>
	</div>

	<!-- Today's Mission -->
	<div class="mission">
		<div class="m-head">
			<span class="m-title">Today's Mission</span>
			<span class="m-time">~{missionMinutes || 45} min</span>
		</div>
		<div class="m-items">
			<button class="m-item" onclick={() => nextTopic && goto(`/topic/${nextTopic.unit.code}`)} disabled={!nextTopic}>
				<span class="m-num">1</span>
				<span class="m-text">
					<span class="m-name">{nextTopic ? nextTopic.unit.title : 'All live territory held'}</span>
					<span class="m-sub">
						{nextTopic
							? `Guided path · ${nextTopic.unit.region} · read + ${nextTopic.topic?.mcq_floor ?? nextTopic.unit.floor}Q quiz`
							: 'New drops arrive with the content pipeline'}
					</span>
				</span>
				<span class="m-min">{nextTopic?.topic?.est_read_minutes ?? '—'}m</span>
			</button>
			<button class="m-item" onclick={() => goto('/revision')}>
				<span class="m-num" class:done-num={srLoaded && (sr?.count ?? 0) === 0}>
					{#if srLoaded && (sr?.count ?? 0) === 0}✓{:else}2{/if}
				</span>
				<span class="m-text">
					{#if !srLoaded}
						<Skeleton width="160px" height="14px" />
					{:else}
						<span class="m-name" class:done-line={(sr?.count ?? 0) === 0}>
							Revision stack{(sr?.count ?? 0) > 0 ? ` — ${sr?.count} cards due` : ' — clear'}
						</span>
						<span class="m-sub">
							{(sr?.decays.length ?? 0) > 0
								? `${sr?.decays.length} decaying ${sr?.decays.length === 1 ? 'territory' : 'territories'} inside`
								: 'wrong answers report here'}
						</span>
					{/if}
				</span>
				<span class="m-min">{srLoaded ? `${Math.max(1, Math.round((sr?.count ?? 0) * 0.8))}m` : ''}</span>
			</button>
			<button class="m-item" onclick={() => goto('/briefing')}>
				<span class="m-num" class:done-num={briefingDone}>
					{#if briefingDone}✓{:else}3{/if}
				</span>
				<span class="m-text">
					{#if !briefingLoaded}
						<Skeleton width="140px" height="14px" />
					{:else}
						<span class="m-name" class:done-line={briefingDone}>
							Daily briefing{briefingCount > 0 ? ` — ${briefingCount} item${briefingCount === 1 ? '' : 's'}` : ''}
						</span>
						<span class="m-sub">
							{briefingCount > 0
								? briefingDone
									? 'mini-quizzes cleared'
									: 'read + mini-quiz each item'
								: 'items land at 07:00 IST after review'}
						</span>
					{/if}
				</span>
				<span class="m-min">{briefingCount > 0 ? `${briefingCount * 2}m` : ''}</span>
			</button>
		</div>
		<Button variant="primary" onclick={beginMission}>Begin Mission →</Button>
	</div>

	<!-- ring + stats band -->
	<div class="band">
		<div class="ring-card">
			<ProgressRing value={map.pct} size={92} stroke={9} label="POLITY" />
		</div>
		<div class="stats">
			<div class="stat-row"><span>Territories held</span><span class="v green">{held} / {TOTAL_UNITS}</span></div>
			<div class="stat-row"><span>Gold mastery</span><span class="v gold">{goldCount}</span></div>
			<button class="stat-row link" onclick={() => goto('/revision')}>
				<span>Decaying</span>
				<span class="v" class:red={decayCount > 0}>{decayCount > 0 ? `${decayCount} — retake soon` : '0'}</span>
			</button>
			<div class="stat-row"><span>Quiz accuracy</span><span class="v">{accuracy === null ? '—' : `${accuracy}%`}</span></div>
		</div>
	</div>

	<!-- weekly XP sparkline -->
	<div class="spark-card">
		<div class="spark-head">
			<span class="s-title">This week</span>
			<span class="s-total">{spark.days.reduce((s, d) => s + d.xp, 0)} XP</span>
		</div>
		<div class="spark">
			{#each spark.days as d (d.day)}
				<div class="s-col">
					<div class="s-bar" style:height="{Math.max(3, (d.xp / spark.max) * 44)}px" class:zero={d.xp === 0}></div>
					<span class="s-day">{new Date(d.day + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'narrow' })}</span>
				</div>
			{/each}
		</div>
	</div>

	<!-- quick actions -->
	<div class="qa-block">
		<div class="qa-title">Quick actions</div>
		<div class="qa-grid">
			<button class="qa khaki" onclick={() => goto('/map')}>
				<span class="qa-name">Territory Map</span><span class="qa-sub">8 regions</span>
			</button>
			<button class="qa blue" onclick={() => goto('/revision')}>
				<span class="qa-name">Revision Stack</span>
				<span class="qa-sub" class:hot={(sr?.count ?? 0) > 0}>{srLoaded ? ((sr?.count ?? 0) > 0 ? `${sr?.count} due` : 'clear') : '…'}</span>
			</button>
			<button class="qa orange" onclick={() => goto('/tests')}>
				<span class="qa-name">Test Centre</span><span class="qa-sub">Prompt 11</span>
			</button>
			<button class="qa green" onclick={() => goto('/pyq')}>
				<span class="qa-name">PYQ Vault</span><span class="qa-sub">free · all years</span>
			</button>
			<button class="qa" onclick={() => goto('/briefing')}>
				<span class="qa-name">Daily Briefing</span>
				<span class="qa-sub" class:hot={briefingLoaded && briefingCount > 0 && !briefingDone}>
					{!briefingLoaded ? '…' : briefingCount > 0 ? (briefingDone ? 'read ✓' : `${briefingCount} new`) : 'none yet'}
				</span>
			</button>
			<button class="qa" onclick={() => goto('/profile')}>
				<span class="qa-name">Profile</span><span class="qa-sub">ranks & badges</span>
			</button>
		</div>
	</div>

	<!-- battalion standing (Prompt 10) -->
	<button class="batt-row" onclick={() => goto('/battalion')}>
		<span class="batt-icon">
			<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16 V9 M10 16 V4 M16 16 V12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /></svg>
		</span>
		<span class="batt-text">
			<span class="batt-title">
				Battalion board{board?.you ? ` — #${board.you.rank} of ${board.battalion?.member_count ?? ''}` : ''}
			</span>
			<span class="batt-sub">
				{#if board}
					Week resets in {formatCountdown(board.seconds_left)}{board.behind ? ` · ${board.behind.toLocaleString('en-IN')} XP behind #${(board.you?.rank ?? 2) - 1}` : ''}
				{:else}
					weekly XP race inside your cohort
				{/if}
			</span>
		</span>
		<svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M5 2 L10 7 L5 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
	</button>
</div>

<!-- streak sheet: 30-day calendar + freeze explainer -->
<Sheet bind:open={streakSheet} title="Streak">
	<div class="cal-head">
		{#if user}
			<StreakFlame count={user.streak_current ?? 0} freezes={user.streak_freezes ?? 0} size={24} />
		{/if}
		<p class="cal-note">
			A day counts with a topic quiz, 10+ reviews, or the daily briefing quiz. Miss a day and a
			freeze token burns automatically — {user?.streak_freezes ?? 0} left this month.
		</p>
	</div>
	<div class="cal">
		{#each last30 as d (d.day)}
			<span class="cal-day" class:on={d.active} title={d.day}></span>
		{/each}
	</div>
	<p class="cal-legend">last 30 days · filled = active</p>
</Sheet>

<style>
	.dash {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	/* header */
	.header {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.insignia-slot {
		flex: none;
		width: 52px;
		height: 66px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.greet {
		font-size: 12.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.name {
		font-family: var(--font-display);
		font-size: 17px;
		line-height: 1.2;
		text-transform: uppercase;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.xp-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 2px;
	}
	.xp-track {
		flex: 1;
		height: 8px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		background: var(--bg-2);
		overflow: hidden;
	}
	.xp-fill {
		height: 100%;
		background: var(--khaki);
		transition: width var(--t-conquest) var(--ease);
	}
	.xp-num {
		font-size: 10.5px;
		font-weight: 900;
		color: var(--ink-3);
		white-space: nowrap;
	}
	.streak-chip {
		flex: none;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 8px 12px;
		cursor: pointer;
	}

	/* mission */
	.mission {
		background: var(--bg-2);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		box-shadow: var(--shadow-2);
	}
	.m-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.m-title {
		font-family: var(--font-display);
		font-size: 12px;
		text-transform: uppercase;
		color: var(--orange-deep);
	}
	.m-time {
		font-size: 11.5px;
		font-weight: 900;
		background: var(--orange-tint);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 3px 10px;
	}
	.m-items {
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.m-item {
		display: flex;
		align-items: center;
		gap: 11px;
		background: none;
		border: none;
		padding: 0;
		text-align: left;
		cursor: pointer;
		font-family: var(--font-ui);
	}
	.m-item:disabled {
		cursor: default;
	}
	.m-num {
		flex: none;
		width: 22px;
		height: 22px;
		border-radius: var(--r-full);
		border: var(--bw) solid var(--line);
		background: var(--bg-0);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		font-weight: 900;
		color: var(--ink-1);
	}
	.m-num.done-num {
		background: var(--green);
	}
	.m-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.m-name {
		font-weight: 900;
		font-size: 14px;
		color: var(--ink-1);
	}
	.m-name.done-line {
		color: var(--ink-3);
		text-decoration: line-through;
	}
	.m-sub {
		font-size: 11.5px;
		color: var(--ink-3);
	}
	.m-min {
		flex: none;
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.mission :global(.btn) {
		width: 100%;
	}

	/* band */
	.band {
		display: flex;
		gap: 14px;
	}
	.ring-card {
		flex: none;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-xl);
		padding: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.stats {
		flex: 1;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-xl);
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 7px;
	}
	.stat-row {
		display: flex;
		justify-content: space-between;
		font-size: 11.5px;
		font-weight: 700;
		color: var(--ink-1);
		background: none;
		border: none;
		padding: 0;
		font-family: var(--font-ui);
	}
	.stat-row.link {
		cursor: pointer;
	}
	.v.green {
		color: var(--green-deep);
	}
	.v.gold {
		color: var(--gold-lo);
	}
	.v.red {
		color: var(--red-deep);
	}

	/* sparkline */
	.spark-card {
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-xl);
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.spark-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.s-title {
		font-family: var(--font-display);
		font-size: 13px;
		text-transform: uppercase;
	}
	.s-total {
		font-size: 11px;
		font-weight: 900;
		color: var(--ink-2);
	}
	.spark {
		display: flex;
		gap: 8px;
		align-items: flex-end;
	}
	.s-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}
	.s-bar {
		width: 100%;
		max-width: 26px;
		background: var(--khaki);
		border: 1.5px solid var(--line);
		border-radius: 3px 3px 0 0;
	}
	.s-bar.zero {
		background: var(--bg-1);
		border-color: var(--line-soft);
	}
	.s-day {
		font-size: 9px;
		font-weight: 900;
		color: var(--ink-3);
	}

	/* quick actions */
	.qa-block {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.qa-title {
		font-family: var(--font-display);
		font-size: 13px;
		text-transform: uppercase;
	}
	.qa-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.qa {
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 13px 14px;
		cursor: pointer;
		text-align: left;
		font-family: var(--font-ui);
		transition:
			box-shadow var(--t-fast) var(--ease),
			transform var(--t-fast) var(--ease);
	}
	.qa:hover {
		box-shadow: var(--shadow-2);
		transform: translate(-1px, -1px);
	}
	.qa.khaki {
		background: var(--khaki-tint);
	}
	.qa.blue {
		background: var(--blue-tint);
	}
	.qa.orange {
		background: var(--orange-tint);
	}
	.qa.green {
		background: var(--green-tint);
	}
	.qa-name {
		font-weight: 900;
		font-size: 13px;
		color: var(--ink-1);
	}
	.qa-sub {
		font-size: 10.5px;
		color: var(--ink-3);
	}
	.qa-sub.hot {
		color: var(--red-deep);
		font-weight: 700;
	}

	/* battalion row */
	.batt-row {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--bg-1);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 12px 16px;
		cursor: pointer;
		font-family: var(--font-ui);
		text-align: left;
		color: var(--ink-1);
	}
	.batt-row:hover {
		box-shadow: var(--shadow-2);
	}
	.batt-icon {
		flex: none;
		display: flex;
	}
	.batt-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.batt-title {
		font-weight: 900;
		font-size: 13px;
	}
	.batt-sub {
		font-size: 11px;
		color: var(--ink-3);
	}

	/* streak sheet */
	.cal-head {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 12px;
	}
	.cal-note {
		margin: 0;
		font-size: 12px;
		color: var(--ink-2);
		line-height: 1.5;
	}
	.cal {
		display: grid;
		grid-template-columns: repeat(10, 1fr);
		gap: 6px;
	}
	.cal-day {
		aspect-ratio: 1;
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-sm);
		background: var(--bg-1);
	}
	.cal-day.on {
		background: var(--orange);
		border-color: var(--line);
	}
	.cal-legend {
		margin: 10px 0 0;
		text-align: center;
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
</style>
