<script lang="ts">
	import { goto } from '$app/navigation';
	import { onDestroy, onMount } from 'svelte';
	import { auth, bootAuth } from '$lib/auth.svelte';
	import { computePlan, PACES, monthYear } from '$lib/plan';

	/* Screen 18 — Path Generated. One-time takeover: terrain fades up, route
	   draws 2.2s, milestones cascade (120ms stagger), CTA pops. Tap skips.
	   Revisits (Profile → My plan) show the static version via ?static. */

	let plan = $state<ReturnType<typeof computePlan> | null>(null);
	let paceLabel = $state('');
	let paceName = $state('');
	let targetYear = $state(0);
	let ceremony = $state(true);
	let stage = $state(0); // 0 terrain, 1 route, 2 milestones, 3 cta
	let timers: ReturnType<typeof setTimeout>[] = [];

	onMount(async () => {
		await bootAuth();
		const u = auth.user;
		if (!u) {
			goto('/login', { replaceState: true });
			return;
		}
		if (!auth.isOnboarded) {
			goto('/onboarding', { replaceState: true });
			return;
		}
		targetYear = u.target_year;
		plan = computePlan(u.target_year, u.daily_minutes);
		const pace = PACES.find((p) => p.minutes === u.daily_minutes);
		paceLabel = pace?.label ?? '';
		paceName = pace?.name ?? '';

		ceremony = !new URLSearchParams(location.search).has('static');
		if (!ceremony) {
			stage = 3;
			return;
		}
		timers = [
			setTimeout(() => (stage = 1), 400),
			setTimeout(() => (stage = 2), 2600),
			setTimeout(() => (stage = 3), 3200)
		];
	});

	onDestroy(() => timers.forEach(clearTimeout));

	function skip() {
		if (stage < 3) {
			timers.forEach(clearTimeout);
			stage = 3;
		}
	}

	function begin() {
		localStorage.setItem('path-seen', '1');
		goto('/', { replaceState: true });
	}
</script>

<svelte:head><title>UPSCVidya — Your campaign</title></svelte:head>

<main onclick={skip} role="presentation">
	{#if plan}
		<div class="card">
			<div class="head" class:show={stage >= 0}>
				<span class="orders">ORDERS RECEIVED</span>
				<h1>Your campaign<br />is drawn</h1>
				<p>CAPF AC {targetYear} · {paceLabel}/day · {paceName}</p>
			</div>

			<div class="mapwrap" class:show={stage >= 0}>
				<svg viewBox="0 0 332 168" class="map">
					<path
						d="M10 30 Q40 8 100 14 T240 12 Q316 12 324 52 Q330 110 318 138 Q290 164 180 160 Q70 166 26 148 Q2 128 6 78 Q6 48 10 30 Z"
						fill="var(--bg-2)"
						stroke="#4d4433"
						stroke-width="1.5"
					/>
					<path
						class="route"
						class:draw={stage >= 1}
						d="M34 132 L86 112 L60 78 L128 84 L172 46 L216 88 L268 62 L298 96"
						fill="none"
						stroke="#e8703a"
						stroke-width="3"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<circle cx="34" cy="132" r="9" fill="var(--green)" stroke="#4d4433" stroke-width="1.5" />
					<text x="34" y="152" text-anchor="middle" class="maplabel">START</text>
					<circle cx="128" cy="84" r="5" fill="var(--bg-0)" stroke="#4d4433" stroke-width="1.5" />
					<circle cx="216" cy="88" r="5" fill="var(--bg-0)" stroke="#4d4433" stroke-width="1.5" />
					<g transform="translate(298 96)">
						<circle r="9" fill="var(--gold-hi)" stroke="#4d4433" stroke-width="1.5" />
						<path
							d="M0 -22 V-9 M0 -22 H10 L7 -18 L10 -14 H0"
							fill="var(--orange)"
							stroke="#4d4433"
							stroke-width="1.3"
							stroke-linejoin="round"
						/>
					</g>
					<text x="298" y="120" text-anchor="middle" class="maplabel">EXAM DAY</text>
				</svg>
			</div>

			<div class="timeline">
				{#each [
					{
						dot: 'green',
						title: 'Today — Foundations begins',
						meta: `${plan.topicsPerDay} topic${plan.topicsPerDay === 1 ? '' : 's'} + ${plan.quizzesPerDay} quiz daily · streak starts now`
					},
					{
						dot: 'paper',
						title: `${monthYear(plan.politySecured)} — Polity secured`,
						meta: 'all 8 regions conquered · gold retakes open'
					},
					{
						dot: 'paper',
						title: `${monthYear(plan.mockSeason)} — Mock season`,
						meta: 'full papers weekly · percentile tracking'
					},
					{
						dot: 'gold',
						title: `${monthYear(plan.examDay)} — Exam day`,
						meta: `${plan.bufferWeeks}-week revision buffer already built in`
					}
				] as row, i (row.title)}
					<div
						class="milestone"
						class:show={stage >= 2}
						style:transition-delay={stage >= 2 ? `${i * 120}ms` : '0ms'}
					>
						<div class="rail">
							<span class="tdot {row.dot}"></span>
							{#if i < 3}<span class="rline"></span>{/if}
						</div>
						<div class="mbody">
							<div class="mtitle">{row.title}</div>
							<div class="mmeta">{row.meta}</div>
						</div>
					</div>
				{/each}
			</div>

			<button class="cta" class:show={stage >= 3} onclick={begin}>Begin campaign →</button>
			<div class="retune" class:show={stage >= 3}>You can re-tune pace anytime in Settings.</div>
		</div>
	{/if}
</main>

<style>
	main {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
	}
	.card {
		width: min(420px, 100%);
		background: var(--bg-0);
		border: var(--bw-bold) solid var(--line);
		border-radius: 28px;
		box-shadow: var(--shadow-soft);
		padding: 30px 24px 26px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.head {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		text-align: center;
	}
	.orders {
		font-weight: 900;
		font-size: 12px;
		background: var(--green);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 5px 14px;
		transform: rotate(-2deg);
		box-shadow: var(--shadow-2);
	}
	h1 {
		margin: 6px 0 0;
		font-family: var(--font-display);
		font-size: 25px;
		line-height: 1.2;
		text-transform: uppercase;
	}
	.head p {
		margin: 0;
		font-size: 13px;
		color: var(--ink-2);
	}

	.mapwrap {
		background: var(--khaki-tint);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-xl);
		overflow: hidden;
		opacity: 0;
		transition: opacity 600ms var(--ease);
	}
	.mapwrap.show {
		opacity: 1;
	}
	.map {
		display: block;
		width: 100%;
	}
	.maplabel {
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 8px;
		fill: #4a463c;
	}
	.route {
		stroke-dasharray: 420;
		stroke-dashoffset: 420;
	}
	.route.draw {
		animation: drawPath 2.2s cubic-bezier(0.2, 0.7, 0.3, 1) both;
	}
	@keyframes drawPath {
		from {
			stroke-dashoffset: 420;
		}
		to {
			stroke-dashoffset: 0;
		}
	}

	.timeline {
		display: flex;
		flex-direction: column;
	}
	.milestone {
		display: flex;
		gap: 12px;
		opacity: 0;
		transform: translateY(8px);
		transition:
			opacity var(--t-base) var(--ease),
			transform var(--t-base) var(--ease);
	}
	.milestone.show {
		opacity: 1;
		transform: translateY(0);
	}
	.rail {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.tdot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: var(--bw) solid var(--line);
	}
	.tdot.green {
		background: var(--green);
	}
	.tdot.paper {
		background: var(--bg-2);
	}
	.tdot.gold {
		background: var(--gold-hi);
	}
	.rline {
		width: 2px;
		flex: 1;
		background: var(--line-soft);
	}
	.mbody {
		padding-bottom: 14px;
	}
	.mtitle {
		font-weight: 900;
		font-size: 13px;
	}
	.mmeta {
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
	}

	.cta {
		width: 100%;
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 15px;
		background: var(--orange);
		color: var(--line);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 14px;
		min-height: 48px;
		cursor: pointer;
		box-shadow: var(--shadow-2);
		opacity: 0;
		transform: scale(0.96);
		transition:
			opacity var(--t-base) var(--ease-pop),
			transform var(--t-base) var(--ease-pop);
	}
	.cta.show {
		opacity: 1;
		transform: scale(1);
	}
	.cta:hover {
		transform: translate(-1px, -1px);
	}
	.retune {
		text-align: center;
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
		opacity: 0;
		transition: opacity var(--t-base) var(--ease);
	}
	.retune.show {
		opacity: 1;
	}
</style>
