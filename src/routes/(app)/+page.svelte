<script lang="ts">
	import { onDestroy } from 'svelte';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth.svelte';
	import { buildMap } from '$lib/map';
	import { rankProgress, istDate } from '$lib/xp';
	import { RANKS } from '$lib/ranks';
	import { fetchDue, type SrDue } from '$lib/sr';
	import { fetchBoard, formatCountdown, type Board } from '$lib/board';
	import { fetchBriefing, type Briefing } from '$lib/ca';
	import { TOTAL_UNITS } from '$lib/polity';
	import { haptic } from '$lib/native';
	import RankInsignia from '$lib/components/RankInsignia.svelte';
	import StreakFlame from '$lib/components/StreakFlame.svelte';
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
	const rankIndex = $derived(RANKS.findIndex((r) => r.code === rp.current.code));

	/* ammo-belt progress: the design reads progress as discrete rounds, not a bar */
	const SEGMENTS = 8;
	const xpSegments = $derived(Math.round((rp.pct / 100) * SEGMENTS));

	/* "RESETS IN 5H 12M" — objectives roll over at IST midnight */
	let now = $state(Date.now());
	const resetTick = setInterval(() => (now = Date.now()), 60000);
	onDestroy(() => clearInterval(resetTick));
	const resetsIn = $derived.by(() => {
		const ist = now + 5.5 * 3600 * 1000;
		const msIntoDay = ist % 86400000;
		const left = 86400000 - msIntoDay;
		const h = Math.floor(left / 3600000);
		const m = Math.floor((left % 3600000) / 60000);
		return h > 0 ? `${h}H ${m}M` : `${m}M`;
	});

	/* count-ups (juice) */
	const xpDisplay = tweened(0, { duration: 700, easing: cubicOut });
	$effect(() => {
		xpDisplay.set(user?.xp ?? 0);
	});
	const heldDisplay = tweened(0, { duration: 650, easing: cubicOut });
	const weekDisplay = tweened(0, { duration: 650, easing: cubicOut });

	/* ---- campaign ---- */
	const held = $derived(map.held);
	const front = $derived(map.regions.find((r) => r.pct < 100) ?? map.regions[0] ?? null);
	const nextTopic = $derived(map.next);
	const nextName = $derived(nextTopic?.topic?.title ?? nextTopic?.unit?.code ?? '');
	const campSegments = $derived(Math.round((held / TOTAL_UNITS) * SEGMENTS));

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
	<!-- ============ HUD — service dossier header ============ -->
	<div class="hud plate sect" style="--i:0" data-tour="home-hero">
		<div class="hud-row">
			<button class="brass rank-plate" onclick={() => nav('/profile/ranks')} aria-label="rank ladder">
				{#if user}<RankInsignia rank={rp.current.code} width={30} />{:else}<Skeleton width="30px" height="46px" />{/if}
			</button>
			<div class="hud-mid">
				<div class="label">{greeting}</div>
				<div class="stencil name">{firstName}</div>
				<span class="ribbon">
					{rp.current.label}
					<span class="grade">GRADE {rankIndex + 1}/{RANKS.length}</span>
				</span>
			</div>
			<button class="seal streak-seal" class:risk={atRisk} onclick={() => { haptic(); streakSheet = true; }} aria-label="streak">
				<span class="seal-n">{user?.streak_current ?? 0}</span>
				<span class="seal-k">DAY ON</span>
			</button>
		</div>
		{#if user}
			<div class="xp-wrap">
				<div class="xp-nums">
					<span class="xp-cur">{Math.round($xpDisplay).toLocaleString('en-IN')} XP</span>
					{#if rp.next}<span class="xp-next">{(rp.next.xp - (user.xp ?? 0)).toLocaleString('en-IN')} TO {rp.next.label}</span>{/if}
				</div>
				<div class="segbar">
					{#each Array(SEGMENTS) as _, i (i)}
						<span class="seg" class:on={i < xpSegments}></span>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	{#if atRisk}
		<button class="risk-bar sect" style="--i:1" onclick={() => firstUndone && questTap(firstUndone)}>
			<span class="risk-dot"></span>
			<span>STREAK AT RISK — clear one objective to hold day {(user?.streak_current ?? 0) + 1}</span>
		</button>
	{/if}

	<!-- ============ DAILY OBJECTIVES ============ -->
	<div class="quests plate sect" style="--i:2" data-tour="home-mission">
		<div class="q-head">
			<div>
				<div class="stencil q-title">Daily Objectives</div>
				<div class="label q-reset">RESETS IN {resetsIn}</div>
			</div>
			<div class="stamp q-stamp">
				<span class="q-pct">{Math.round((doneCount / quests.length) * 100)}%</span>
				<span class="q-frac">{doneCount} / {quests.length}</span>
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
						{#if q.target > 1 && !q.done}
							<span class="track olive q-track"><span class="fill" style:width="{(q.cur / q.target) * 100}%"></span></span>
							<span class="q-sub">{q.sub}</span>
						{:else}
							<span class="q-sub">{q.sub}</span>
						{/if}
					</span>
					<span class="q-xp" class:spent={q.done}>{q.xp}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- ============ CAMPAIGN ============ -->
	<button class="campaign plate-dark sect" style="--i:3" data-tour="home-ring" onclick={() => nav('/map')}>
		<div class="camp-top">
			<span class="camp-k">Campaign{front ? ` · ${front.meta.name}` : ''}</span>
			<span class="camp-held">{Math.round($heldDisplay)} / {TOTAL_UNITS} HELD</span>
		</div>
		<div class="segbar camp-belt">
			{#each Array(SEGMENTS) as _, i (i)}
				<span class="seg" class:on={i < campSegments}></span>
			{/each}
		</div>
		<div class="camp-foot">
			<span class="camp-next">{nextName ? `Next front · ${nextName}` : 'Open the territory map'}</span>
			<span class="btn3d btn3d-gold camp-cta">Deploy →</span>
		</div>
	</button>

	<!-- ============ TILES: rival + medal ============ -->
	<div class="tiles sect" style="--i:4">
		<button class="tile plate rival" onclick={() => nav('/battalion')}>
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

		<button class="tile plate medal" onclick={() => nav('/profile/decorations')}>
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
	<div class="momentum plate sect" style="--i:5">
		<div class="mo-head">
			<span class="stencil mo-k">This week</span>
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

	/* ---------- HUD (service dossier header) ---------- */
	.hud {
		padding: 14px 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.hud-row {
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}
	.rank-plate {
		flex: none;
		width: 56px;
		height: 74px;
		cursor: pointer;
		padding: 0;
	}
	.hud-mid {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-top: 2px;
		align-items: flex-start;
	}
	.name {
		font-size: 30px;
		max-width: 100%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ribbon {
		margin-top: 3px;
	}
	.grade {
		color: #d8c48a;
		letter-spacing: 0.04em;
	}
	.streak-seal {
		flex: none;
		width: 58px;
		height: 58px;
		border: none;
		cursor: pointer;
		padding: 0;
	}
	.streak-seal .seal-n {
		font-size: 20px;
	}
	.streak-seal.risk {
		animation: riskpulse 1.6s ease-in-out infinite;
	}
	@keyframes riskpulse {
		50% {
			opacity: 0.62;
		}
	}
	.xp-nums {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
		margin-bottom: 5px;
	}
	.xp-cur {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--ink-2);
	}
	.xp-next {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--ink-3);
		text-transform: uppercase;
	}

	/* alarm strip */
	.risk-bar {
		display: flex;
		align-items: center;
		gap: 9px;
		background: linear-gradient(#f7ddd4, #f2cec2);
		border: var(--bw) solid var(--red);
		border-radius: var(--r-lg);
		padding: 10px 12px;
		font-size: 12px;
		font-weight: 700;
		color: var(--red-deep);
		text-align: left;
		cursor: pointer;
		box-shadow: 0 3px 0 var(--red-edge), inset 0 1px 0 rgba(255, 255, 255, 0.7);
	}
	.risk-dot {
		flex: none;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: #c9522f;
		box-shadow: inset 0 -2px 4px rgba(0, 0, 0, 0.3);
	}
	@media (prefers-reduced-motion: no-preference) {
		.risk-dot {
			animation: pulseGlow 1.8s infinite;
		}
	}
	@keyframes pulseGlow {
		0%,
		100% {
			opacity: 0.55;
		}
		50% {
			opacity: 1;
		}
	}

	/* ---------- quests ---------- */
	.quests {
		padding: 13px 13px 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.q-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}
	.q-title {
		font-size: 20px;
		letter-spacing: 0.06em;
	}
	.q-reset {
		margin-top: 3px;
		letter-spacing: 0.12em;
	}
	.q-stamp {
		flex: none;
		width: 58px;
		height: 58px;
		margin-top: -4px;
	}
	.q-pct {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 19px;
	}
	.q-frac {
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.1em;
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
		gap: 11px;
		background: var(--grad-plate-2);
		border: var(--bw) solid var(--line);
		border-radius: 11px;
		padding: 11px 12px;
		cursor: pointer;
		text-align: left;
		font-family: var(--font-ui);
		box-shadow: 0 3px 0 #cfc4a0, var(--emboss);
		transition:
			transform var(--t-fast) var(--ease),
			box-shadow var(--t-fast) var(--ease);
	}
	.quest:active {
		transform: translateY(2px);
		box-shadow: 0 1px 0 #cfc4a0, var(--emboss);
	}
	/* cleared objectives sink into the card */
	.quest.done {
		background: var(--bg-1);
		border-color: var(--line-soft);
		box-shadow: inset 0 2px 5px rgba(90, 78, 40, 0.18);
	}
	.q-check {
		flex: none;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		border: 2px solid var(--khaki);
		background: radial-gradient(circle at 35% 30%, #fff, #e6ddbf);
		box-shadow: inset 0 -2px 4px rgba(90, 78, 40, 0.25);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 14px;
		color: #fff;
	}
	.q-check.on {
		background: var(--grad-olive);
		border-color: var(--green-edge);
	}
	.q-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.q-label {
		font-weight: 700;
		font-size: 14px;
		color: var(--ink-1);
	}
	.quest.done .q-label {
		color: var(--ink-3);
		text-decoration: line-through;
	}
	.q-sub {
		font-size: 11px;
		font-weight: 500;
		color: var(--ink-3);
	}
	.q-track {
		height: 8px;
		margin-top: 2px;
	}
	/* the reward plaque — stamped brass-green, dulled once banked */
	.q-xp {
		flex: none;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 13px;
		color: #fff;
		background: var(--grad-olive);
		border-radius: 6px;
		padding: 5px 9px;
		box-shadow:
			0 2px 0 var(--green-edge),
			inset 0 1px 0 rgba(255, 255, 255, 0.4);
	}
	.q-xp.spent {
		color: var(--ink-3);
		background: #ded5b6;
		box-shadow: none;
	}

	/* ---------- campaign (official dark panel) ---------- */
	.campaign {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 13px;
		cursor: pointer;
		text-align: left;
		transition: transform var(--t-fast) var(--ease);
	}
	.campaign:active {
		transform: translateY(2px);
	}
	.camp-top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
	}
	.camp-k {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 15px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.camp-held {
		flex: none;
		font-size: 11px;
		font-weight: 700;
		color: #d8c48a;
	}
	.camp-belt {
		margin-top: 1px;
	}
	.camp-foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		margin-top: 1px;
	}
	.camp-next {
		font-size: 11px;
		font-weight: 600;
		color: #ded5b6;
	}
	.camp-cta {
		flex: none;
		font-size: 12px;
		padding: 7px 14px;
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
		padding: 11px;
		cursor: pointer;
		text-align: left;
		transition: transform var(--t-fast) var(--ease);
	}
	.tile:active {
		transform: translateY(2px);
	}
	.tile-k {
		font-size: 9px;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--ink-3);
		letter-spacing: 0.14em;
	}
	.tile-big {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 30px;
		line-height: 1;
		text-shadow: 0 1px 0 #fff;
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
		padding: 13px 15px;
	}
	.mo-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 10px;
	}
	.mo-k {
		font-size: 15px;
		letter-spacing: 0.12em;
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
		background: linear-gradient(#a99c6d, #837751);
		border-radius: 4px 4px 0 0;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
		transition: height var(--t-base) var(--ease);
	}
	.mo-bar.today {
		background: var(--grad-rust);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
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
	.q-track :global(.fill) {
		position: relative;
		overflow: hidden;
	}
	@media (prefers-reduced-motion: no-preference) {
		/* sheen sweeping a filled bar — the classic game-UI gloss */
		.q-track :global(.fill)::after {
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
		/* rounds seat into the belt, left to right */
		.hud :global(.segbar .seg.on),
		.campaign :global(.segbar .seg.on) {
			animation: seat 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.4) both;
		}
		/* momentum bars grow up on load, left→right */
		.mo-bar {
			transform-origin: bottom;
			animation: grow 0.5s cubic-bezier(0.2, 0.9, 0.3, 1) both;
			animation-delay: calc(0.25s + var(--j, 0) * 45ms);
		}
		/* the brass plate catches the light once on arrival */
		.rank-plate {
			animation: gleam 1.6s ease-out 0.3s 1;
		}
		/* undone objective's reward plaque pulses to draw the eye */
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
	@keyframes seat {
		from {
			transform: scaleY(0.3);
			opacity: 0.4;
		}
	}
	@keyframes gleam {
		0%,
		100% {
			filter: brightness(1);
		}
		40% {
			filter: brightness(1.18);
		}
	}
	@keyframes grow {
		from {
			transform: scaleY(0);
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
		background: var(--grad-plate);
		border: var(--bw) solid var(--khaki);
		border-radius: var(--r-lg);
		padding: 13px 6px;
		cursor: pointer;
		box-shadow: 0 3px 0 var(--edge), var(--emboss);
		transition:
			transform var(--t-fast) var(--ease),
			box-shadow var(--t-fast) var(--ease);
	}
	.qa-btn:active {
		transform: translateY(2px);
		box-shadow: 0 1px 0 var(--edge), var(--emboss);
	}
	.qa-btn.khaki {
		background: linear-gradient(#efe7cf, #e2d8ba);
	}
	.qa-btn.orange {
		background: linear-gradient(#f8e3d3, #f0d0ba);
	}
	.qa-btn.blue {
		background: linear-gradient(#e6edf1, #d6e0e7);
	}
	.qa-btn.green {
		background: linear-gradient(#eaefdb, #dce4c6);
	}
	.qa-n {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 13px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
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
