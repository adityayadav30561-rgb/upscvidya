<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		fetchCatalogue,
		startSectional,
		startMock,
		type MockCard,
		type HistoryRow
	} from '$lib/test';
	import { REGIONS } from '$lib/polity';
	import type { Region } from '$lib/types';
	import { showToast } from '$lib/toast.svelte';
	import { capture } from '$lib/analytics';
	import Skeleton from '$lib/components/Skeleton.svelte';

	type Tab = 'drills' | 'mocks' | 'record';
	let tab = $state<Tab>('mocks');

	let mocks = $state<MockCard[]>([]);
	let history = $state<HistoryRow[]>([]);
	let loaded = $state(false);
	let busy = $state(false);

	let booted = false;
	$effect(() => {
		if (booted) return;
		booted = true;
		fetchCatalogue()
			.then((c) => {
				mocks = c.mocks;
				history = c.history;
			})
			.catch(() => {})
			.finally(() => (loaded = true));
	});

	/* ---- gamified stats (client-computed, display only) ---- */
	type Medal = 'gold' | 'silver' | 'bronze' | null;
	function medalFor(p: number | null): Medal {
		if (p === null) return null;
		if (p >= 90) return 'gold';
		if (p >= 75) return 'silver';
		if (p >= 50) return 'bronze';
		return null;
	}
	const medalLabel: Record<Exclude<Medal, null>, string> = {
		gold: 'Gold',
		silver: 'Silver',
		bronze: 'Bronze'
	};

	const withPct = $derived(history.filter((h) => h.percentile !== null));
	const opsRun = $derived(history.length);
	const bestPct = $derived(withPct.length ? Math.max(...withPct.map((h) => h.percentile ?? 0)) : null);
	const bestMedal = $derived(medalFor(bestPct));
	const avgAcc = $derived(
		history.length
			? Math.round(
					(history.reduce((s, h) => s + (h.max_score > 0 ? h.score / h.max_score : 0), 0) /
						history.length) *
						100
				)
			: 0
	);

	/* ---- sectional loadout ---- */
	let picked = $state<Set<Region>>(new Set());
	let tierBand = $state<[number, number]>([1, 5]);
	let count = $state<20 | 50>(20);

	function toggleRegion(code: Region) {
		const next = new Set(picked);
		if (next.has(code)) next.delete(code);
		else next.add(code);
		picked = next;
	}

	const bands: { label: string; short: string; range: [number, number]; threat: number }[] = [
		{ label: 'All tiers', short: 'MIXED', range: [1, 5], threat: 2 },
		{ label: 'Core', short: 'T1–2', range: [1, 2], threat: 1 },
		{ label: 'Hard', short: 'T3+', range: [3, 5], threat: 3 }
	];
	const activeBand = $derived(
		bands.find((b) => b.range[0] === tierBand[0] && b.range[1] === tierBand[1]) ?? bands[0]
	);
	const drillMins = $derived(count === 20 ? 15 : 37);

	async function beginSectional() {
		if (picked.size === 0) {
			showToast('Select at least one battlefield', 'info');
			return;
		}
		busy = true;
		try {
			const res = await startSectional([...picked], tierBand, count);
			goto(`/tests/${res.attempt_id}`);
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Could not compose the drill', 'error');
			busy = false;
		}
	}

	async function beginMock(m: MockCard) {
		if (m.locked) {
			goto('/paywall?from=Mock%20operations');
			return;
		}
		busy = true;
		try {
			const res = await startMock(m.id);
			capture('mock_started', { test_id: m.id, free: m.is_free });
			goto(`/tests/${res.attempt_id}`);
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Could not open the paper', 'error');
			busy = false;
		}
	}

	/* ---- record ---- */
	const trend = $derived(withPct.slice(0, 6).reverse());
	const fmtDate = (s: string) =>
		s ? new Date(s.replace(' ', 'T')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
</script>

<svelte:head><title>UPSCVidya — Test Centre</title></svelte:head>

<div class="centre">
	<header class="masthead">
		<div>
			<h1 class="stencil">Test Centre</h1>
			<p class="tagline">Prove it under fire — timed, scored, ranked.</p>
		</div>
		{#if bestMedal}
			<div class="crest {bestMedal}" title="Best percentile: {bestPct}th">
				<span class="crest-star">★</span>
				<span class="crest-lbl">{medalLabel[bestMedal]}</span>
			</div>
		{/if}
	</header>

	<!-- command hub -->
	{#if loaded && opsRun > 0}
		<div class="hub">
			<div class="stat plate">
				<div class="stat-n">{opsRun}</div>
				<div class="stat-l">Ops run</div>
			</div>
			<div class="stat plate">
				<div class="stat-n rust">{bestPct !== null ? bestPct + 'th' : '—'}</div>
				<div class="stat-l">Best rank</div>
			</div>
			<div class="stat plate">
				<div class="stat-n">{avgAcc}%</div>
				<div class="stat-l">Accuracy</div>
			</div>
		</div>
	{/if}

	<!-- tabs -->
	<div class="tabrail" role="tablist">
		<button class="tab" class:on={tab === 'mocks'} role="tab" aria-selected={tab === 'mocks'} onclick={() => (tab = 'mocks')}>
			Mock Ops
		</button>
		<button class="tab" class:on={tab === 'drills'} role="tab" aria-selected={tab === 'drills'} onclick={() => (tab = 'drills')}>
			Drills
		</button>
		<button class="tab" class:on={tab === 'record'} role="tab" aria-selected={tab === 'record'} onclick={() => (tab = 'record')}>
			Record{#if opsRun > 0}<span class="tab-count">{opsRun}</span>{/if}
		</button>
	</div>

	<!-- ============ MOCK OPERATIONS ============ -->
	{#if tab === 'mocks'}
		{#if !loaded}
			<Skeleton height="150px" radius="var(--r-xl)" />
			<Skeleton height="150px" radius="var(--r-xl)" />
		{:else if mocks.length === 0}
			<div class="empty">No operations deployed yet. Full mock papers land here.</div>
		{:else}
			<div class="ops">
				{#each mocks as m (m.id)}
					{@const attemptedRow = history.find((h) => h.title === m.title && h.kind === 'mock') ?? null}
					{@const med = medalFor(attemptedRow?.percentile ?? null)}
					<!-- sealed operation folder: colour rail on the spine, tag on the flap -->
					<button class="op" class:locked={m.locked} onclick={() => beginMock(m)} disabled={busy}>
						{#if m.is_free}
							<span class="tag">FREE</span>
						{:else if m.locked}
							<span class="tag gold">PREMIUM</span>
						{/if}
						<span class="op-title stencil">{m.title}</span>
						<span class="op-sub">{m.blurb}</span>
						<span class="op-stats">
							<span class="statchip">{m.count} Q</span>
							<span class="statchip">{Math.round(m.duration_sec / 60)} MIN</span>
							{#if m.negative > 0}<span class="statchip warn">−{m.negative.toFixed(2)} WRONG</span>{/if}
						</span>
						<span class="op-foot">
							<span class="reward">
								UP TO +400 XP{#if m.attempted} · ATTEMPTED{/if}
							</span>
							{#if med}<span class="medal {med}">★ {medalLabel[med]}</span>{/if}
							<span class="deploy {m.locked ? 'btn3d btn3d-gold' : 'btn3d'}">
								{m.locked ? 'Unlock →' : 'Deploy →'}
							</span>
						</span>
					</button>
				{/each}
			</div>
		{/if}

	<!-- ============ SECTIONAL DRILLS (loadout) ============ -->
	{:else if tab === 'drills'}
		<div class="loadout">
			<div class="lo-title">Compose your drill</div>

			<div class="lo-field">
				<div class="lo-label"><span>BATTLEFIELDS</span><span class="lo-count">{picked.size} selected</span></div>
				<div class="chips">
					{#each REGIONS as r (r.code)}
						<button class="chip" class:on={picked.has(r.code)} onclick={() => toggleRegion(r.code)}>
							{r.name}
						</button>
					{/each}
				</div>
			</div>

			<div class="lo-field">
				<div class="lo-label"><span>THREAT LEVEL</span></div>
				<div class="segs">
					{#each bands as b (b.label)}
						<button
							class="seg"
							class:on={activeBand.label === b.label}
							onclick={() => (tierBand = b.range)}
						>
							<span class="seg-top">{b.label}</span>
							<span class="seg-threat">{'▲'.repeat(b.threat)}<span class="dim">{'▲'.repeat(3 - b.threat)}</span></span>
						</button>
					{/each}
				</div>
			</div>

			<div class="lo-field">
				<div class="lo-label"><span>OPERATION SIZE</span></div>
				<div class="segs">
					<button class="seg" class:on={count === 20} onclick={() => (count = 20)}>
						<span class="seg-top">20 Q</span><span class="seg-threat">15 min</span>
					</button>
					<button class="seg" class:on={count === 50} onclick={() => (count = 50)}>
						<span class="seg-top">50 Q</span><span class="seg-threat">37 min</span>
					</button>
				</div>
			</div>

			<div class="briefing">
				<div class="brief-line">
					<span class="brief-k">BRIEFING</span>
					<span class="brief-v">
						{count} Q · {drillMins} min · {activeBand.short}
						{#if picked.size}· {picked.size} region{picked.size > 1 ? 's' : ''}{/if}
					</span>
				</div>
				<div class="brief-warn">Timed · negative marking · no feedback until you submit</div>
			</div>

			<button class="deploy-btn" disabled={busy || picked.size === 0} onclick={beginSectional}>
				{picked.size === 0 ? 'Select a battlefield' : 'Deploy drill →'}
			</button>
		</div>

	<!-- ============ SERVICE RECORD ============ -->
	{:else}
		{#if !loaded}
			<Skeleton height="60px" radius="var(--r-lg)" />
			<Skeleton height="60px" radius="var(--r-lg)" />
		{:else if history.length === 0}
			<div class="empty">
				<div class="empty-big">No missions on record</div>
				Your first drill or mock lands here — with its score, rank, and medal.
			</div>
		{:else}
			{#if trend.length >= 2}
				<div class="rec-chart">
					<div class="rc-head"><span>PERCENTILE TREND</span><span class="rc-last">last {trend.length}</span></div>
					<div class="rc-bars">
						{#each trend as t (t.attempt_id)}
							{@const m = medalFor(t.percentile)}
							<div class="rc-col">
								<div class="rc-bar {m ?? ''}" style:height="{Math.max(6, (t.percentile ?? 0) * 0.9)}%">
									<span class="rc-val">{t.percentile}</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<div class="oplog">
				{#each history as h (h.attempt_id)}
					{@const m = medalFor(h.percentile)}
					<button class="log-row" onclick={() => goto(`/tests/${h.attempt_id}`)}>
						<span class="log-badge {m ?? 'none'}">{m ? '★' : h.kind === 'mock' ? 'M' : 'D'}</span>
						<span class="log-text">
							<span class="log-title">{h.title}</span>
							<span class="log-sub">
								{h.score} / {h.max_score} net{h.percentile !== null ? ` · ${h.percentile}th` : ''} · {fmtDate(h.submitted_at)}
							</span>
						</span>
						<svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M5 2 L10 7 L5 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
					</button>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.centre {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.masthead {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 30px;
		text-transform: uppercase;
	}
	.tagline {
		margin: 2px 0 0;
		font-size: 12px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.crest {
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-lg);
		padding: 6px 12px;
		box-shadow: var(--shadow-2);
	}
	.crest-star {
		font-size: 16px;
		line-height: 1;
	}
	.crest-lbl {
		font-size: 8.5px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.crest.gold {
		background: linear-gradient(160deg, var(--gold-hi), var(--gold-lo));
		color: #4d4433;
	}
	.crest.silver {
		background: linear-gradient(160deg, #e7ecf1, #aab6c2);
		color: #37414c;
	}
	.crest.bronze {
		background: linear-gradient(160deg, #e0a877, #b26a3c);
		color: #3f2a18;
	}

	/* command hub */
	.hub {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 8px;
	}
	.stat {
		padding: 10px 8px;
		text-align: center;
		border-radius: var(--r-lg);
	}
	.stat-n {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 24px;
		line-height: 1;
		color: var(--ink-1);
	}
	.stat-n.rust {
		color: var(--orange-deep);
	}
	.stat-l {
		font-size: 8px;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--ink-3);
		letter-spacing: 0.14em;
		margin-top: 3px;
	}
	.tab-count {
		display: inline-block;
		margin-left: 5px;
		font-size: 9px;
		background: rgba(0, 0, 0, 0.18);
		border-radius: var(--r-full);
		padding: 1px 6px;
	}

	/* mock operations */
	.ops {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	/* sealed operation folder */
	.op {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 7px;
		text-align: left;
		background: var(--grad-plate);
		border: var(--bw) solid var(--line);
		border-left: 7px solid var(--orange);
		border-radius: 4px var(--r-xl) var(--r-xl) 4px;
		cursor: pointer;
		font-family: var(--font-ui);
		box-shadow: var(--shadow-lift);
		padding: 13px;
		transition:
			transform var(--t-fast) var(--ease),
			box-shadow var(--t-fast) var(--ease);
	}
	.op:active {
		transform: translateY(2px);
		box-shadow: 0 2px 0 var(--edge-deep), 0 8px 14px rgba(60, 50, 25, 0.18);
	}
	.op.locked {
		border-left-color: var(--gold-lo);
	}
	.op-title {
		font-size: 20px;
		letter-spacing: 0.05em;
	}
	.op-sub {
		font-size: 11px;
		font-weight: 500;
		color: var(--ink-3);
		margin-top: -3px;
	}
	.op-stats {
		display: flex;
		gap: 7px;
		align-items: center;
		flex-wrap: wrap;
		margin-top: 2px;
	}
	.op-foot {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
	}
	.reward {
		flex: 1;
		min-width: 0;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		color: var(--ink-2);
	}
	.deploy {
		flex: none;
		font-size: 12px;
		padding: 8px 15px;
	}
	.medal {
		font-size: 10px;
		font-weight: 900;
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
		padding: 2px 7px;
	}
	.medal.gold {
		background: linear-gradient(160deg, var(--gold-hi), var(--gold-lo));
		color: #4d4433;
	}
	.medal.silver {
		background: linear-gradient(160deg, #e7ecf1, #aab6c2);
		color: #37414c;
	}
	.medal.bronze {
		background: linear-gradient(160deg, #e0a877, #b26a3c);
		color: #3f2a18;
	}

	/* loadout composer */
	.loadout {
		background: var(--bg-2);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		box-shadow: var(--shadow-2);
	}
	.lo-title {
		font-family: var(--font-display);
		font-size: 16px;
		text-transform: uppercase;
	}
	.lo-field {
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.lo-label {
		display: flex;
		justify-content: space-between;
		font-size: 10.5px;
		font-weight: 900;
		color: var(--ink-3);
		letter-spacing: 0.03em;
	}
	.lo-count {
		color: var(--orange-deep);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
	}
	.chip {
		font-family: var(--font-ui);
		font-size: 11px;
		font-weight: 900;
		background: var(--bg-0);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-full);
		padding: 7px 12px;
		cursor: pointer;
		color: var(--ink-2);
		transition: all var(--t-fast) var(--ease);
	}
	.chip.on {
		background: var(--orange-tint);
		border-color: var(--line);
		color: var(--ink-1);
		box-shadow: var(--shadow-2);
	}
	.segs {
		display: flex;
		gap: 8px;
	}
	.seg {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		font-family: var(--font-ui);
		background: var(--bg-0);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-md);
		padding: 10px 6px;
		cursor: pointer;
		color: var(--ink-2);
		transition: all var(--t-fast) var(--ease);
	}
	.seg.on {
		background: var(--orange-tint);
		border-color: var(--line);
		color: var(--ink-1);
		box-shadow: var(--shadow-2);
	}
	.seg-top {
		font-size: 12px;
		font-weight: 900;
	}
	.seg-threat {
		font-size: 10px;
		font-weight: 900;
		color: var(--red-deep);
		letter-spacing: 1px;
	}
	.seg-threat .dim {
		color: var(--line-soft);
	}
	.briefing {
		background: var(--bg-1);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.brief-line {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	.brief-k {
		font-size: 9.5px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.brief-v {
		font-family: var(--font-display);
		font-size: 14px;
		color: var(--ink-1);
	}
	.brief-warn {
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.deploy-btn {
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 15px;
		background: var(--orange);
		color: #4d4433;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 14px;
		min-height: 48px;
		cursor: pointer;
		box-shadow: var(--shadow-2);
	}
	.deploy-btn:disabled {
		opacity: 0.55;
		cursor: default;
		box-shadow: none;
	}

	/* record */
	.rec-chart {
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-xl);
		padding: 14px 16px;
		box-shadow: var(--shadow-2);
	}
	.rc-head {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		font-weight: 900;
		color: var(--ink-3);
		margin-bottom: 10px;
	}
	.rc-bars {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		height: 110px;
	}
	.rc-col {
		flex: 1;
		height: 100%;
		display: flex;
		align-items: flex-end;
	}
	.rc-bar {
		width: 100%;
		position: relative;
		background: var(--blue);
		border: 1.5px solid var(--line);
		border-radius: 5px 5px 0 0;
		min-height: 6px;
		transition: height var(--t-base) var(--ease);
	}
	.rc-bar.gold {
		background: linear-gradient(180deg, var(--gold-hi), var(--gold-lo));
	}
	.rc-bar.silver {
		background: linear-gradient(180deg, #e7ecf1, #aab6c2);
	}
	.rc-bar.bronze {
		background: linear-gradient(180deg, #e0a877, #b26a3c);
	}
	.rc-val {
		position: absolute;
		top: -16px;
		left: 0;
		right: 0;
		text-align: center;
		font-size: 10px;
		font-weight: 900;
		color: var(--ink-2);
	}
	.oplog {
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.log-row {
		display: flex;
		align-items: center;
		gap: 11px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 11px 14px;
		cursor: pointer;
		font-family: var(--font-ui);
		text-align: left;
		color: var(--ink-1);
	}
	.log-badge {
		flex: none;
		width: 30px;
		height: 30px;
		border-radius: var(--r-full);
		border: var(--bw) solid var(--line);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 13px;
		font-weight: 900;
	}
	.log-badge.none {
		background: var(--bg-1);
		color: var(--ink-3);
	}
	.log-badge.gold {
		background: linear-gradient(160deg, var(--gold-hi), var(--gold-lo));
		color: #4d4433;
	}
	.log-badge.silver {
		background: linear-gradient(160deg, #e7ecf1, #aab6c2);
		color: #37414c;
	}
	.log-badge.bronze {
		background: linear-gradient(160deg, #e0a877, #b26a3c);
		color: #3f2a18;
	}
	.log-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.log-title {
		font-weight: 900;
		font-size: 12.5px;
	}
	.log-sub {
		font-size: 11px;
		color: var(--ink-3);
	}
	.empty {
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-lg);
		padding: 22px 18px;
		text-align: center;
		font-size: 12px;
		color: var(--ink-3);
	}
	.empty-big {
		font-family: var(--font-display);
		font-size: 15px;
		color: var(--ink-2);
		text-transform: uppercase;
		margin-bottom: 4px;
	}
</style>
