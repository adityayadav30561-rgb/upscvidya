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
	import Button from '$lib/components/Button.svelte';

	let tab = $state<'sectional' | 'mocks'>('sectional');

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

	/* sectional composer */
	let picked = $state<Set<Region>>(new Set());
	let tierBand = $state<[number, number]>([1, 5]);
	let count = $state<20 | 50>(20);

	function toggleRegion(code: Region) {
		const next = new Set(picked);
		if (next.has(code)) next.delete(code);
		else next.add(code);
		picked = next;
	}

	const bands: { label: string; range: [number, number] }[] = [
		{ label: 'All tiers', range: [1, 5] },
		{ label: 'Core (T1-2)', range: [1, 2] },
		{ label: 'Hard (T3+)', range: [3, 5] }
	];

	async function beginSectional() {
		if (picked.size === 0) {
			showToast('Pick at least one region', 'info');
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
			showToast('This paper is premium', 'info');
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

	const trend = $derived(
		history
			.filter((h) => h.percentile !== null)
			.slice(0, 5)
			.reverse()
	);
	const fmtDate = (s: string) =>
		s ? new Date(s.replace(' ', 'T')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
</script>

<svelte:head><title>UPSCVidya — Test Centre</title></svelte:head>

<div class="centre">
	<h1>Test Centre</h1>

	<div class="tabs" role="tablist">
		<button class="tab" class:on={tab === 'sectional'} role="tab" aria-selected={tab === 'sectional'} onclick={() => (tab = 'sectional')}>
			SECTIONAL
		</button>
		<button class="tab" class:on={tab === 'mocks'} role="tab" aria-selected={tab === 'mocks'} onclick={() => (tab = 'mocks')}>
			FULL MOCKS
		</button>
	</div>

	{#if tab === 'sectional'}
		<div class="card">
			<div class="card-title">Compose your drill</div>

			<div class="field">
				<span class="f-label">REGIONS</span>
				<div class="chips">
					{#each REGIONS as r (r.code)}
						<button class="chip" class:on={picked.has(r.code)} onclick={() => toggleRegion(r.code)}>
							{r.name}{picked.has(r.code) ? ' ✓' : ''}
						</button>
					{/each}
				</div>
			</div>

			<div class="field">
				<span class="f-label">DIFFICULTY</span>
				<div class="segs">
					{#each bands as b (b.label)}
						<button
							class="seg"
							class:on={tierBand[0] === b.range[0] && tierBand[1] === b.range[1]}
							onclick={() => (tierBand = b.range)}
						>
							{b.label}
						</button>
					{/each}
				</div>
			</div>

			<div class="field">
				<span class="f-label">QUESTIONS</span>
				<div class="segs">
					<button class="seg" class:on={count === 20} onclick={() => (count = 20)}>20 Q · 15 min</button>
					<button class="seg" class:on={count === 50} onclick={() => (count = 50)}>50 Q · 37 min</button>
				</div>
			</div>

			<div class="exam-note">Timed · negative marking · no feedback until you submit</div>
			<Button variant="primary" disabled={busy} onclick={beginSectional}>Start drill →</Button>
		</div>
	{:else}
		{#if !loaded}
			<Skeleton height="120px" radius="var(--r-xl)" />
			<Skeleton height="120px" radius="var(--r-xl)" />
		{:else if mocks.length === 0}
			<div class="empty">No papers published yet.</div>
		{:else}
			{#each mocks as m (m.id)}
				<button class="mock" class:locked={m.locked} onclick={() => beginMock(m)} disabled={busy}>
					<div class="mock-head">
						<span class="mock-title">{m.title}</span>
						{#if m.is_free}
							<span class="tag free">FREE</span>
						{:else if m.locked}
							<span class="tag prem">PREMIUM</span>
						{/if}
					</div>
					<div class="mock-sub">{m.blurb}</div>
					<div class="mock-meta">
						<span>{m.count} Q</span>
						<span>{Math.round(m.duration_sec / 60)} min</span>
						<span class="neg">−{m.negative.toFixed(2)}</span>
						{#if m.attempted}<span class="done">attempted ✓</span>{/if}
					</div>
					<div class="mock-cta">{m.locked ? 'Premium paper' : 'Enter exam mode →'}</div>
				</button>
			{/each}
		{/if}
	{/if}

	<!-- attempt history -->
	<div class="hist">
		<div class="hist-head">
			<span class="h-title">Attempt history</span>
			{#if trend.length >= 2}
				<span class="h-trend">
					{trend[0].percentile} → {trend[trend.length - 1].percentile} over {trend.length} attempts
				</span>
			{/if}
		</div>

		{#if !loaded}
			<Skeleton height="48px" radius="var(--r-lg)" />
		{:else if history.length === 0}
			<div class="empty">No attempts yet — your first drill lands here.</div>
		{:else}
			{#if trend.length >= 2}
				<div class="spark" aria-label="percentile trend">
					{#each trend as t (t.attempt_id)}
						<div class="s-col">
							<div class="s-bar" style:height="{Math.max(4, (t.percentile ?? 0) * 0.44)}px"></div>
						</div>
					{/each}
				</div>
			{/if}
			{#each history as h (h.attempt_id)}
				<button class="hist-row" onclick={() => goto(`/tests/${h.attempt_id}`)}>
					<span class="hr-text">
						<span class="hr-title">{h.title} · {fmtDate(h.submitted_at)}</span>
						<span class="hr-sub">
							{h.score} / {h.max_score} net{h.percentile !== null ? ` · ${h.percentile}th percentile` : ''}
						</span>
					</span>
					<svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M5 2 L10 7 L5 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</button>
			{/each}
		{/if}
	</div>
</div>

<style>
	.centre {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 30px;
		text-transform: uppercase;
	}
	.tabs {
		display: flex;
		gap: 8px;
		border-bottom: var(--bw) solid var(--line-soft);
	}
	.tab {
		font-family: var(--font-ui);
		font-size: 11.5px;
		font-weight: 900;
		background: none;
		border: none;
		border-bottom: 3px solid transparent;
		padding: 8px 10px;
		cursor: pointer;
		color: var(--ink-3);
		transition: color var(--t-base) var(--ease), border-color var(--t-base) var(--ease);
	}
	.tab.on {
		color: var(--ink-1);
		border-bottom-color: var(--orange-deep);
	}
	.card {
		background: var(--bg-2);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		box-shadow: var(--shadow-2);
	}
	.card-title {
		font-family: var(--font-display);
		font-size: 14px;
		text-transform: uppercase;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.f-label {
		font-size: 10.5px;
		font-weight: 900;
		color: var(--ink-3);
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
		padding: 6px 11px;
		cursor: pointer;
		color: var(--ink-2);
	}
	.chip.on {
		background: var(--green-tint);
		border-color: var(--line);
		color: var(--ink-1);
	}
	.segs {
		display: flex;
		gap: 8px;
	}
	.seg {
		flex: 1;
		font-family: var(--font-ui);
		font-size: 11.5px;
		font-weight: 900;
		background: var(--bg-0);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-md);
		padding: 9px 6px;
		cursor: pointer;
		color: var(--ink-2);
	}
	.seg.on {
		background: var(--orange-tint);
		border: var(--bw) solid var(--line);
		color: var(--ink-1);
	}
	.exam-note {
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
		text-align: center;
	}
	.card :global(.btn) {
		width: 100%;
	}

	/* mocks */
	.mock {
		display: flex;
		flex-direction: column;
		gap: 6px;
		text-align: left;
		background: var(--bg-2);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		padding: 16px 18px;
		cursor: pointer;
		font-family: var(--font-ui);
		box-shadow: var(--shadow-2);
	}
	.mock.locked {
		opacity: 0.72;
		box-shadow: none;
	}
	.mock-head {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.mock-title {
		flex: 1;
		font-family: var(--font-display);
		font-size: 16px;
		text-transform: uppercase;
	}
	.tag {
		font-size: 9px;
		font-weight: 900;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-sm);
		padding: 2px 7px;
		transform: rotate(2deg);
	}
	.tag.free {
		background: var(--green);
	}
	.tag.prem {
		background: var(--khaki-tint);
		color: var(--khaki-deep);
	}
	.mock-sub {
		font-size: 11.5px;
		color: var(--ink-3);
	}
	.mock-meta {
		display: flex;
		gap: 10px;
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-2);
	}
	.neg {
		color: var(--red-deep);
	}
	.done {
		color: var(--green-deep);
	}
	.mock-cta {
		margin-top: 4px;
		font-size: 12.5px;
		font-weight: 900;
		color: var(--orange-deep);
	}

	/* history */
	.hist {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 4px;
	}
	.hist-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
	}
	.h-title {
		font-family: var(--font-display);
		font-size: 13px;
		text-transform: uppercase;
	}
	.h-trend {
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.spark {
		display: flex;
		align-items: flex-end;
		gap: 6px;
		height: 48px;
		padding: 0 2px;
	}
	.s-col {
		flex: 1;
		display: flex;
		align-items: flex-end;
	}
	.s-bar {
		width: 100%;
		background: var(--blue);
		border: 1.5px solid var(--line);
		border-radius: 3px 3px 0 0;
	}
	.hist-row {
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 11px 14px;
		cursor: pointer;
		font-family: var(--font-ui);
		text-align: left;
		color: var(--ink-1);
	}
	.hr-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.hr-title {
		font-weight: 900;
		font-size: 12.5px;
	}
	.hr-sub {
		font-size: 11px;
		color: var(--ink-3);
	}
	.empty {
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-lg);
		padding: 18px;
		text-align: center;
		font-size: 12px;
		color: var(--ink-3);
	}
</style>
