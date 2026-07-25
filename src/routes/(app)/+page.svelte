<script lang="ts">
	import { onDestroy } from 'svelte';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth.svelte';
	import { buildMap } from '$lib/map';
	import { rankProgress, istDate } from '$lib/xp';
	import { fetchDue, type SrDue } from '$lib/sr';
	import { fetchBoard, formatCountdown, type Board } from '$lib/board';
	import { fetchBriefing, type Briefing } from '$lib/ca';
	import { TOTAL_UNITS } from '$lib/polity';
	import { haptic } from '$lib/native';
	import RankInsignia from '$lib/components/RankInsignia.svelte';
	import StreakFlame from '$lib/components/StreakFlame.svelte';
	import ProgressRing from '$lib/components/ProgressRing.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import Sheet from '$lib/components/Sheet.svelte';

	let { data } = $props();

	const user = $derived(auth.user);
	const map = $derived(buildMap(data.topics, data.progress, data.isPremium));
	const rp = $derived(rankProgress(user?.xp ?? 0));

	/* client-side loads (need the auth token) */
	let sr = $state<SrDue | null>(null);
	let srLoaded = $state(false);
	let board = $state<Board | null>(null);
	let briefing = $state<Briefing | null>(null);
	let briefingLoaded = $state(false);
	let secondsLeft = $state(0);
	let booted = false;
	$effect(() => {
		if (booted) return;
		booted = true;
		fetchDue().then((d) => (sr = d)).catch(() => (sr = null)).finally(() => (srLoaded = true));
		fetchBoard()
			.then((b) => {
				board = b;
				secondsLeft = b.seconds_left;
			})
			.catch(() => (board = null));
		fetchBriefing().then((b) => (briefing = b)).catch(() => (briefing = null)).finally(() => (briefingLoaded = true));
	});
	const tick = setInterval(() => {
		if (secondsLeft > 0) secondsLeft -= 1;
	}, 1000);
	onDestroy(() => clearInterval(tick));

	const briefingCount = $derived(briefing?.items.length ?? 0);
	const briefingDone = $derived(
		!!briefing && briefingCount > 0 && briefing.items.every((i) => i.quiz.length > 0 && i.quiz_answered >= i.quiz.length)
	);

	const greeting = (() => {
		const h = new Date().getHours();
		if (h < 4) return 'Still at it?';
		if (h < 12) return 'Good morning,';
		if (h < 17) return 'Good afternoon,';
		return 'Good evening,';
	})();
	const firstName = $derived((user?.display_name || 'Recruit').split(' ')[0]);

	/* count-ups (juice) */
	const xpDisplay = tweened(0, { duration: 700, easing: cubicOut });
	$effect(() => {
		xpDisplay.set(user?.xp ?? 0);
	});
	const heldDisplay = tweened(0, { duration: 650, easing: cubicOut });
	const weekDisplay = tweened(0, { duration: 650, easing: cubicOut });

	/* ---- campaign ---- */
	const held = $derived(map.held);
	const goldCount = $derived(map.regions.reduce((s, r) => s + r.gold, 0));
	const front = $derived(map.regions.find((r) => r.pct < 100) ?? map.regions[0] ?? null);
	const nextTopic = $derived(map.next);
	const nextName = $derived(nextTopic?.topic?.title ?? nextTopic?.unit?.code ?? '');

	/* ---- daily objectives (real, from today's xp_events + SR + briefing) ---- */
	const todayIST = istDate(Date.now());
	const evToday = $derived(
		data.xpEvents.filter(
			(e) => istDate(new Date(e.created.replace(' ', 'T')).getTime()) === todayIST
		)
	);
	const quizToday = $derived(evToday.some((e) => e.reason === 'topic_quiz'));
	const srToday = $derived(evToday.filter((e) => e.reason === 'sr_review').length);
	const caToday = $derived(evToday.some((e) => e.reason === 'daily_ca') || briefingDone);
	// no briefing published today → the objective is a no-op (auto-complete)
	const caApplicable = $derived(briefingLoaded ? briefingCount > 0 : true);

	interface Quest {
		key: string;
		label: string;
		sub: string;
		done: boolean;
		cur: number;
		target: number;
		xp: string;
		go: () => void;
	}
	const quests = $derived<Quest[]>([
		{
			key: 'quiz',
			label: 'Conquer a territory',
			sub: quizToday ? 'done today' : nextName ? `next: ${nextName}` : 'read + 12-question quiz',
			done: quizToday,
			cur: quizToday ? 1 : 0,
			target: 1,
			xp: '+100',
			go: () => (nextTopic ? goto(`/topic/${nextTopic.unit.code}`) : goto('/map'))
		},
		{
			key: 'sr',
			label: 'Clear 10 revision cards',
			sub: srToday >= 10 ? 'done today' : `${srToday}/10 reviewed`,
			done: srToday >= 10,
			cur: Math.min(srToday, 10),
			target: 10,
			xp: '+80',
			go: () => goto('/revision')
		},
		{
			key: 'ca',
			label: 'Daily briefing',
			sub: !caApplicable ? 'none today' : caToday ? 'cleared' : `${briefingCount} to read`,
			done: caToday || !caApplicable,
			cur: caToday || !caApplicable ? 1 : 0,
			target: 1,
			xp: '+30',
			go: () => goto('/briefing')
		}
	]);
	const doneCount = $derived(quests.filter((q) => q.done).length);
	const allDone = $derived(doneCount === quests.length);
	const streakSafeToday = $derived(quizToday || srToday >= 10 || caToday);
	const atRisk = $derived((user?.streak_current ?? 0) > 0 && !streakSafeToday);
	const firstUndone = $derived(quests.find((q) => !q.done) ?? null);

	/* ---- next decoration (streak milestone) ---- */
	const nextMilestone = $derived([7, 30, 100].find((m) => (user?.streak_current ?? 0) < m) ?? null);
	const milestoneLeft = $derived(nextMilestone ? nextMilestone - (user?.streak_current ?? 0) : 0);

	/* ---- weekly momentum ---- */
	const spark = $derived.by(() => {
		const days: { day: string; xp: number }[] = [];
		for (let i = 6; i >= 0; i--) days.push({ day: istDate(Date.now() - i * 86400000), xp: 0 });
		for (const ev of data.xpEvents) {
			const d = istDate(new Date(ev.created.replace(' ', 'T')).getTime());
			const slot = days.find((x) => x.day === d);
			if (slot) slot.xp += ev.amount;
		}
		const max = Math.max(1, ...days.map((d) => d.xp));
		return { days, max };
	});
	const weekXp = $derived(spark.days.reduce((s, d) => s + d.xp, 0));
	const dayInitials = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
	$effect(() => {
		heldDisplay.set(held);
	});
	$effect(() => {
		weekDisplay.set(weekXp);
	});

	/* streak sheet */
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

	function questTap(q: Quest) {
		haptic();
		q.go();
	}
	function nav(path: string) {
		haptic();
		goto(path);
	}
</script>

<svelte:head><title>UPSCVidya — Base Camp</title></svelte:head>

<div class="dash">
	<!-- ============ HUD ============ -->
	<div class="hud sect" style="--i:0" data-tour="home-hero">
		<button class="hud-ins" onclick={() => nav('/profile/ranks')} aria-label="ranks">
			{#if user}<RankInsignia rank={rp.current.code} width={34} />{:else}<Skeleton width="34px" height="52px" />{/if}
		</button>
		<div class="hud-mid">
			<div class="greet">{greeting}</div>
			<div class="name">{firstName}</div>
			<div class="rank-line">{rp.current.label}</div>
			{#if user}
				<div class="xp-wrap">
					<div class="xp-bar"><div class="xp-fill" style:width="{rp.pct}%"></div></div>
					<div class="xp-nums">
						<span class="xp-cur">{Math.round($xpDisplay).toLocaleString('en-IN')} XP</span>
						{#if rp.next}<span class="xp-next">{(rp.next.xp - (user.xp ?? 0)).toLocaleString('en-IN')} → {rp.next.label}</span>{/if}
					</div>
				</div>
			{/if}
		</div>
		<div class="hud-right">
			<button class="flame-btn" class:risk={atRisk} onclick={() => { haptic(); streakSheet = true; }} aria-label="streak">
				{#if user}
					<StreakFlame count={user.streak_current ?? 0} freezes={user.streak_freezes ?? 0} size={20} showLabel={false} />
				{:else}<Skeleton width="34px" height="40px" />{/if}
			</button>
			{#if rp.next}
				<div class="ghost-rank" title="next rank">
					<RankInsignia rank={rp.next.code} width={22} />
				</div>
			{/if}
		</div>
	</div>

	{#if atRisk}
		<button class="risk-bar sect" style="--i:1" onclick={() => firstUndone && questTap(firstUndone)}>
			🔥 Streak at risk — finish one objective to keep day {(user?.streak_current ?? 0) + 1}
		</button>
	{/if}

	<!-- ============ DAILY OBJECTIVES ============ -->
	<div class="quests sect" style="--i:2" data-tour="home-mission">
		<div class="q-head">
			<div class="q-title">Daily Objectives</div>
			<div class="q-ring">
				<ProgressRing value={(doneCount / quests.length) * 100} size={44} stroke={5} label={`${doneCount}/${quests.length}`} />
			</div>
		</div>

		{#if allDone}
			<div class="q-clear">
				<span class="q-clear-mark">✓</span>
				<div>
					<div class="q-clear-t">Day secured</div>
					<div class="q-clear-s">All objectives cleared — streak locked for today.</div>
				</div>
			</div>
		{/if}

		<div class="q-list">
			{#each quests as q (q.key)}
				<button class="quest" class:done={q.done} onclick={() => questTap(q)}>
					<span class="q-check" class:on={q.done}>{q.done ? '✓' : ''}</span>
					<span class="q-body">
						<span class="q-label">{q.label}</span>
						<span class="q-sub">{q.sub}</span>
						{#if q.target > 1 && !q.done}
							<span class="q-track"><span class="q-track-fill" style:width="{(q.cur / q.target) * 100}%"></span></span>
						{/if}
					</span>
					<span class="q-xp" class:spent={q.done}>{q.xp}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- ============ CAMPAIGN ============ -->
	<button class="campaign sect" style="--i:3" data-tour="home-ring" onclick={() => nav('/map')}>
		<div class="camp-top">
			<span class="camp-k">Campaign</span>
			<span class="camp-held">{Math.round($heldDisplay)}/{TOTAL_UNITS} held{goldCount > 0 ? ` · ${goldCount} gold` : ''}</span>
		</div>
		{#if front}
			<div class="camp-front">
				<span class="camp-region">{front.meta.name}</span>
				<span class="camp-pct">{front.pct}%</span>
			</div>
			<div class="camp-bar"><div class="camp-fill" style:width="{front.pct}%"></div></div>
		{/if}
		<div class="camp-next">
			{#if nextName}Next front: <strong>{nextName}</strong> →{:else}Open the territory map →{/if}
		</div>
	</button>

	<!-- ============ TILES: rival + medal ============ -->
	<div class="tiles sect" style="--i:4">
		<button class="tile rival" onclick={() => nav('/battalion')}>
			<div class="tile-k">Battalion</div>
			{#if board?.you}
				<div class="tile-big">#{board.you.rank}</div>
				<div class="tile-sub">
					{#if board.behind && board.behind > 0}
						+{board.behind.toLocaleString('en-IN')} to #{board.you.rank - 1}
					{:else if board.you.rank === 1}
						holding the top
					{:else}
						{board.you.xp_week.toLocaleString('en-IN')} XP this week
					{/if}
				</div>
				<div class="tile-foot">⏱ {formatCountdown(secondsLeft)}</div>
			{:else}
				<div class="tile-big">—</div>
				<div class="tile-sub">weekly cohort race</div>
			{/if}
		</button>

		<button class="tile medal" onclick={() => nav('/profile/decorations')}>
			<div class="tile-k">Next medal</div>
			{#if nextMilestone}
				<div class="tile-big">{nextMilestone}🔥</div>
				<div class="tile-sub">{milestoneLeft} day{milestoneLeft === 1 ? '' : 's'} to the {nextMilestone}-day badge</div>
			{:else}
				<div class="tile-big">★</div>
				<div class="tile-sub">collect region & mock medals</div>
			{/if}
			<div class="tile-foot">Decorations →</div>
		</button>
	</div>

	<!-- ============ WEEKLY MOMENTUM ============ -->
	<div class="momentum sect" style="--i:5">
		<div class="mo-head">
			<span class="mo-k">This week</span>
			<span class="mo-xp">{Math.round($weekDisplay).toLocaleString('en-IN')} XP</span>
		</div>
		<div class="mo-bars">
			{#each spark.days as d, i (d.day)}
				<div class="mo-col">
					<div class="mo-bar" class:today={d.day === todayIST} style="height:{Math.max(4, (d.xp / spark.max) * 46)}px; --j:{i}"></div>
					<span class="mo-lbl" class:today={d.day === todayIST}>{dayInitials[i]}</span>
				</div>
			{/each}
		</div>
	</div>

	<!-- ============ QUICK ACTIONS ============ -->
	<div class="qa sect" style="--i:6">
		<button class="qa-btn khaki" onclick={() => nav('/map')}><span class="qa-n">Map</span></button>
		<button class="qa-btn orange" onclick={() => nav('/tests')}><span class="qa-n">Tests</span></button>
		<button class="qa-btn blue" onclick={() => nav('/revision')}>
			<span class="qa-n">Revision</span>{#if srLoaded && (sr?.count ?? 0) > 0}<span class="qa-badge">{sr?.count}</span>{/if}
		</button>
		<button class="qa-btn green" onclick={() => nav('/pt')}><span class="qa-n">Drill</span></button>
	</div>
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
		gap: 14px;
	}
	.sect {
		animation: enter 0.42s cubic-bezier(0.2, 0.9, 0.3, 1) both;
		animation-delay: calc(var(--i, 0) * 55ms);
	}
	@keyframes enter {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sect {
			animation: none;
		}
	}

	/* ---------- HUD ---------- */
	.hud {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--bg-2);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		padding: 14px 15px;
		box-shadow: var(--shadow-2);
	}
	.hud-ins {
		flex: none;
		background: var(--bg-0);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 6px 10px;
		cursor: pointer;
	}
	.hud-mid {
		flex: 1;
		min-width: 0;
	}
	.greet {
		font-size: 11.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.name {
		font-family: var(--font-display);
		font-size: 19px;
		line-height: 1.05;
		text-transform: uppercase;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.rank-line {
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--khaki-deep);
		margin-top: 1px;
	}
	.xp-wrap {
		margin-top: 7px;
	}
	.xp-bar {
		height: 8px;
		background: var(--bg-0);
		border: 1.5px solid var(--line);
		border-radius: var(--r-full);
		overflow: hidden;
	}
	.xp-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--gold-lo), var(--gold-hi));
		transition: width 700ms cubic-bezier(0.2, 0.9, 0.3, 1);
	}
	.xp-nums {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		margin-top: 4px;
	}
	.xp-cur {
		font-size: 10.5px;
		font-weight: 900;
	}
	.xp-next {
		font-size: 10px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.hud-right {
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}
	.flame-btn {
		background: var(--bg-0);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 4px 8px;
		cursor: pointer;
	}
	.flame-btn.risk {
		border-color: var(--red-deep);
		background: var(--red-tint);
		animation: riskpulse 1.4s ease-in-out infinite;
	}
	@keyframes riskpulse {
		50% {
			opacity: 0.6;
		}
	}
	.ghost-rank {
		opacity: 0.4;
		filter: grayscale(0.5);
	}

	.risk-bar {
		background: var(--red-tint);
		border: var(--bw) solid var(--red-deep);
		border-radius: var(--r-md);
		padding: 9px 13px;
		font-size: 11.5px;
		font-weight: 900;
		color: var(--red-deep);
		text-align: left;
		cursor: pointer;
	}

	/* ---------- quests ---------- */
	.quests {
		background: var(--bg-0);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		box-shadow: var(--shadow-soft);
	}
	.q-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.q-title {
		font-family: var(--font-display);
		font-size: 17px;
		text-transform: uppercase;
	}
	.q-clear {
		display: flex;
		align-items: center;
		gap: 11px;
		background: var(--green-tint);
		border: var(--bw) solid var(--green-deep);
		border-radius: var(--r-lg);
		padding: 11px 14px;
	}
	.q-clear-mark {
		flex: none;
		width: 30px;
		height: 30px;
		border-radius: var(--r-full);
		background: var(--green);
		border: var(--bw) solid var(--green-deep);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 900;
		color: #2f4a22;
	}
	.q-clear-t {
		font-family: var(--font-display);
		font-size: 14px;
		text-transform: uppercase;
	}
	.q-clear-s {
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-2);
	}
	.q-list {
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.quest {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 12px 14px;
		cursor: pointer;
		text-align: left;
		font-family: var(--font-ui);
		transition: transform var(--t-fast) var(--ease);
	}
	.quest:active {
		transform: scale(0.985);
	}
	.quest.done {
		opacity: 0.62;
		background: var(--bg-1);
	}
	.q-check {
		flex: none;
		width: 24px;
		height: 24px;
		border-radius: var(--r-full);
		border: var(--bw) solid var(--line);
		background: var(--bg-0);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 900;
		font-size: 13px;
		color: #2f4a22;
	}
	.q-check.on {
		background: var(--green);
		border-color: var(--green-deep);
	}
	.q-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.q-label {
		font-weight: 900;
		font-size: 13.5px;
	}
	.quest.done .q-label {
		text-decoration: line-through;
	}
	.q-sub {
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.q-track {
		margin-top: 3px;
		height: 5px;
		background: var(--bg-0);
		border: 1px solid var(--line-soft);
		border-radius: var(--r-full);
		overflow: hidden;
	}
	.q-track-fill {
		display: block;
		height: 100%;
		background: var(--blue);
		transition: width var(--t-base) var(--ease);
	}
	.q-xp {
		flex: none;
		font-size: 11px;
		font-weight: 900;
		color: var(--green-deep);
		background: var(--green-tint);
		border: 1px solid var(--line-soft);
		border-radius: var(--r-sm);
		padding: 3px 8px;
	}
	.q-xp.spent {
		color: var(--ink-3);
		background: var(--bg-0);
	}

	/* ---------- campaign ---------- */
	.campaign {
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: var(--khaki-tint);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-xl);
		padding: 15px 16px;
		cursor: pointer;
		text-align: left;
		transition: transform var(--t-fast) var(--ease);
	}
	.campaign:active {
		transform: scale(0.99);
	}
	.camp-top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.camp-k {
		font-family: var(--font-display);
		font-size: 13px;
		text-transform: uppercase;
	}
	.camp-held {
		font-size: 10.5px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.camp-front {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.camp-region {
		font-weight: 900;
		font-size: 14.5px;
	}
	.camp-pct {
		font-family: var(--font-display);
		font-size: 16px;
		color: var(--khaki-deep);
	}
	.camp-bar {
		height: 9px;
		background: var(--bg-0);
		border: 1.5px solid var(--line);
		border-radius: var(--r-full);
		overflow: hidden;
	}
	.camp-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--khaki-deep), var(--khaki));
		transition: width var(--t-base) var(--ease);
	}
	.camp-next {
		font-size: 11.5px;
		font-weight: 700;
		color: var(--orange-deep);
	}

	/* ---------- tiles ---------- */
	.tiles {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: 3px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-xl);
		padding: 14px;
		cursor: pointer;
		text-align: left;
		box-shadow: var(--shadow-2);
		transition: transform var(--t-fast) var(--ease);
	}
	.tile:active {
		transform: translateY(1px);
	}
	.tile-k {
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		color: var(--ink-3);
		letter-spacing: 0.04em;
	}
	.tile-big {
		font-family: var(--font-display);
		font-size: 30px;
		line-height: 1.1;
	}
	.tile.rival .tile-big {
		color: var(--orange-deep);
	}
	.tile.medal .tile-big {
		color: var(--khaki-deep);
	}
	.tile-sub {
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-2);
		min-height: 26px;
	}
	.tile-foot {
		font-size: 10px;
		font-weight: 900;
		color: var(--ink-3);
		margin-top: 2px;
	}

	/* ---------- momentum ---------- */
	.momentum {
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-xl);
		padding: 14px 16px;
		box-shadow: var(--shadow-2);
	}
	.mo-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 10px;
	}
	.mo-k {
		font-family: var(--font-display);
		font-size: 13px;
		text-transform: uppercase;
	}
	.mo-xp {
		font-size: 11.5px;
		font-weight: 900;
		color: var(--ink-2);
	}
	.mo-bars {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		height: 64px;
	}
	.mo-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		justify-content: flex-end;
	}
	.mo-bar {
		width: 100%;
		background: var(--blue);
		border: 1.5px solid var(--line);
		border-radius: 4px 4px 0 0;
		transition: height var(--t-base) var(--ease);
	}
	.mo-bar.today {
		background: var(--orange);
	}
	.mo-lbl {
		font-size: 9px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.mo-lbl.today {
		color: var(--orange-deep);
	}

	/* ---------- game motion (all reduced-motion-guarded) ---------- */
	.xp-fill,
	.camp-fill {
		position: relative;
		overflow: hidden;
	}
	@media (prefers-reduced-motion: no-preference) {
		/* sheen sweeping the progress bars — the classic game-UI look */
		.xp-fill::after,
		.camp-fill::after {
			content: '';
			position: absolute;
			inset: 0;
			background: linear-gradient(
				100deg,
				transparent 20%,
				rgba(255, 255, 255, 0.55) 50%,
				transparent 80%
			);
			transform: translateX(-100%);
			animation: sheen 2.6s ease-in-out infinite;
		}
		.camp-fill::after {
			animation-duration: 3.2s;
			animation-delay: 0.6s;
		}
		/* momentum bars grow up on load, left→right */
		.mo-bar {
			transform-origin: bottom;
			animation: grow 0.5s cubic-bezier(0.2, 0.9, 0.3, 1) both;
			animation-delay: calc(0.25s + var(--j, 0) * 45ms);
		}
		/* next-rank ghost breathes — teases the unlock */
		.ghost-rank {
			animation: breathe 2.8s ease-in-out infinite;
		}
		/* undone objective's reward chip pulses to draw the eye */
		.quest:not(.done) .q-xp {
			animation: xpglow 2s ease-in-out infinite;
		}
		/* completed check pops in */
		.q-check.on {
			animation: checkpop 0.42s cubic-bezier(0.2, 0.9, 0.3, 1.5) both;
		}
		/* all-clear card bursts in with a glowing mark */
		.q-clear {
			animation: clearpop 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
		}
		.q-clear-mark {
			animation: markglow 1.6s ease-in-out infinite;
		}
	}
	@keyframes sheen {
		0% {
			transform: translateX(-120%);
		}
		60%,
		100% {
			transform: translateX(220%);
		}
	}
	@keyframes grow {
		from {
			transform: scaleY(0);
		}
	}
	@keyframes breathe {
		50% {
			opacity: 0.62;
			transform: scale(1.08);
		}
	}
	@keyframes xpglow {
		50% {
			box-shadow: 0 0 9px rgba(122, 168, 80, 0.6);
		}
	}
	@keyframes checkpop {
		from {
			transform: scale(0);
		}
	}
	@keyframes clearpop {
		from {
			opacity: 0;
			transform: scale(0.9);
		}
	}
	@keyframes markglow {
		50% {
			box-shadow: 0 0 12px 2px rgba(120, 170, 80, 0.7);
		}
	}

	/* ---------- quick actions ---------- */
	.qa {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr 1fr;
		gap: 9px;
	}
	.qa-btn {
		position: relative;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 14px 6px;
		cursor: pointer;
		box-shadow: var(--shadow-2);
		transition: transform var(--t-fast) var(--ease);
	}
	.qa-btn:active {
		transform: translateY(1px);
	}
	.qa-btn.khaki {
		background: var(--khaki-tint);
	}
	.qa-btn.orange {
		background: var(--orange-tint);
	}
	.qa-btn.blue {
		background: var(--blue-tint);
	}
	.qa-btn.green {
		background: var(--green-tint);
	}
	.qa-n {
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 12.5px;
	}
	.qa-badge {
		position: absolute;
		top: -6px;
		right: -6px;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		border-radius: var(--r-full);
		background: var(--red-deep);
		color: #fff;
		font-size: 10px;
		font-weight: 900;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1.5px solid var(--bg-0);
	}

	/* ---------- streak sheet ---------- */
	.cal-head {
		display: flex;
		gap: 12px;
		align-items: center;
		margin-bottom: 14px;
	}
	.cal-note {
		margin: 0;
		font-size: 11.5px;
		color: var(--ink-2);
	}
	.cal {
		display: grid;
		grid-template-columns: repeat(10, 1fr);
		gap: 6px;
	}
	.cal-day {
		aspect-ratio: 1;
		border-radius: var(--r-sm);
		background: var(--bg-1);
		border: 1px solid var(--line-soft);
	}
	.cal-day.on {
		background: var(--orange);
		border-color: var(--line);
	}
	.cal-legend {
		margin: 12px 0 0;
		font-size: 10.5px;
		color: var(--ink-3);
		text-align: center;
	}
</style>
