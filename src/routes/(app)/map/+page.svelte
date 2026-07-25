<script lang="ts">
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { buildMap, takeConquest, type MapNodeData } from '$lib/map';
	import { REGIONS } from '$lib/polity';
	import type { Region } from '$lib/types';
	import { startRestore } from '$lib/sr';
	import { showToast } from '$lib/toast.svelte';
	import RegionMap from '$lib/components/RegionMap.svelte';
	import ProgressRing from '$lib/components/ProgressRing.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import Button from '$lib/components/Button.svelte';
	import Chip from '$lib/components/Chip.svelte';

	let { data } = $props();

	const map = $derived(buildMap(data.topics, data.progress, data.isPremium));

	/* expanded regions: in-progress + the current front; secured and untouched
	   collapse to banner rows (interaction notes) */
	let expanded = $state<Set<Region>>(new Set());
	let expandedInit = false;
	$effect(() => {
		if (expandedInit) return;
		expandedInit = true;
		const open = new Set<Region>();
		for (const r of map.regions) {
			if (r.isFront || (r.started && !r.secured)) open.add(r.meta.code);
		}
		if (open.size === 0 && map.regions.length) open.add(map.regions[0].meta.code);
		expanded = open;
	});
	const toggle = (code: Region) => {
		const next = new Set(expanded);
		if (next.has(code)) next.delete(code);
		else next.add(code);
		expanded = next;
	};

	/* conquest hand-off from quiz results (Prompt 07 stashes the id_code) */
	let conquestCode = $state<string | null>(null);
	$effect(() => {
		const code = takeConquest();
		if (!code) return;
		conquestCode = code;
		const region = map.regions.find((r) => r.nodes.some((n) => n.unit.code === code));
		if (region && !expanded.has(region.meta.code)) {
			expanded = new Set([...expanded, region.meta.code]);
		}
		tick().then(() =>
			document
				.getElementById(`sec-${region?.meta.code ?? ''}`)
				?.scrollIntoView({ behavior: 'smooth', block: 'center' })
		);
	});

	/* topic sheet */
	let sheetOpen = $state(false);
	let selected = $state<MapNodeData | null>(null);
	const openSheet = (node: MapNodeData) => {
		selected = node;
		sheetOpen = true;
	};

	const jumpTo = (code: Region) => {
		if (!expanded.has(code)) expanded = new Set([...expanded, code]);
		tick().then(() =>
			document.getElementById(`sec-${code}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
		);
	};

	const stateChip = (n: MapNodeData): string => {
		if (n.comingSoon) return 'COMING SOON';
		if (n.drillLocked) return 'LOCKED DRILL';
		switch (n.visual) {
			case 'gold':
				return 'GOLD';
			case 'conquered':
				return 'HELD';
			case 'decaying':
				return 'DECAYING';
			case 'unconquered':
				return 'READ — QUIZ PENDING';
			default:
				return 'UNCONQUERED';
		}
	};

	const quizCta = (n: MapNodeData): string => {
		const q = n.topic?.mcq_floor ?? n.unit.floor;
		switch (n.visual) {
			case 'conquered':
				return 'Retake for gold';
			case 'decaying':
				return 'Reinforce now';
			default:
				return `Attempt quiz (${q}Q)`;
		}
	};

	const territoryIndex = (n: MapNodeData): string => {
		const region = map.regions.find((r) => r.meta.code === n.unit.region);
		if (!region) return '';
		const i = region.nodes.findIndex((x) => x.unit.code === n.unit.code);
		return `${region.meta.name} · Territory ${i + 1} of ${region.total}`;
	};

	const regionName = (code: Region) => REGIONS.find((r) => r.code === code)?.name ?? code;

	/** decaying → 5-Q restore micro-quiz (Prompt 08); everything else → full quiz */
	async function attemptQuiz(n: MapNodeData) {
		if (n.visual === 'decaying') {
			try {
				const res = await startRestore(n.unit.code);
				goto(`/quiz/${n.unit.code}?s=${res.session_id}`);
			} catch (err) {
				showToast(err instanceof Error ? err.message : 'Could not start the retake', 'error');
			}
			return;
		}
		goto(`/quiz/${n.unit.code}`);
	}
</script>

<svelte:head><title>UPSCVidya — Territory Map</title></svelte:head>

<!-- shared node-icon defs for every region SVG -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
	<defs>
		<linearGradient id="tm-gold" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#f2cd6a" /><stop offset="1" stop-color="#9c741f" />
		</linearGradient>
		<g id="tm-star">
			<path
				d="M0 -10 L2.35 -3.24 L9.51 -3.09 L3.8 1.24 L5.88 8.09 L0 4 L-5.88 8.09 L-3.8 1.24 L-9.51 -3.09 L-2.35 -3.24 Z"
				fill="var(--line)"
			/>
		</g>
		<g id="tm-check">
			<path d="M-5 0.5 L-1.5 4 L5 -3.5" fill="none" stroke="var(--line)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
		</g>
		<g id="tm-check-khaki">
			<path d="M-5 0.5 L-1.5 4 L5 -3.5" fill="none" stroke="var(--khaki-deep)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
		</g>
		<g id="tm-book">
			<path
				d="M-6 -4.5 C-4 -5.5 -2 -5.5 0 -4.3 C2 -5.5 4 -5.5 6 -4.5 V4.5 C4 3.5 2 3.5 0 4.7 C-2 3.5 -4 3.5 -6 4.5 Z M0 -4.3 V4.7"
				fill="none"
				stroke="var(--line)"
				stroke-width="1.3"
			/>
		</g>
	</defs>
</svg>

<div class="screen">
	<header class="head">
		<div class="titles">
			<h1>Indian Polity</h1>
			<p class="sub">8 regions · {map.total} territories · {map.held} held</p>
		</div>
		<ProgressRing value={map.pct} size={54} stroke={6} />
	</header>

	<!-- sector tabs: physical dossier tabs, the current front pulled forward -->
	<div class="foldertabs" aria-label="jump to region">
		{#each map.regions as r (r.meta.code)}
			<button
				class="foldertab"
				class:on={r.isFront}
				class:done={r.secured && r.started}
				onclick={() => jumpTo(r.meta.code)}
			>
				{r.meta.name} {r.pct}%
			</button>
		{/each}
	</div>

	{#each map.regions as region, i (region.meta.code)}
		<section id="sec-{region.meta.code}" data-tour={i === 0 ? 'map-canvas' : undefined}>
			{#if expanded.has(region.meta.code)}
				<RegionMap {region} {conquestCode} onTap={openSheet} />
				<button class="collapse" onclick={() => toggle(region.meta.code)}>collapse ↑</button>
			{:else}
				<button
					class="banner"
					class:secured={region.secured && region.started}
					onclick={() => toggle(region.meta.code)}
				>
					<svg width="20" height="20" viewBox="0 0 20 20" style="flex:none" aria-hidden="true">
						{#if region.secured && region.started}
							<path d="M5 18 V3 M5 3 H15 L12.5 6.5 L15 10 H5" fill="var(--green)" stroke="var(--line)" stroke-width="1.5" stroke-linejoin="round" />
						{:else}
							<path d="M3 5 L8 3 L12 5 L17 3 V15 L12 17 L8 15 L3 17 Z" fill="none" stroke="var(--line)" stroke-width="1.5" stroke-linejoin="round" opacity=".5" />
						{/if}
					</svg>
					<span class="btext">
						<span class="bname" class:muted={!region.started}>
							{region.meta.name}
							{#if region.secured && region.started}<span class="stamp">SECURED</span>{/if}
						</span>
						<span class="bsub">
							{#if region.secured && region.started}
								{region.total}/{region.total} territories · {region.gold} gold
							{:else}
								{region.total} territories · free roam — read anytime
							{/if}
						</span>
					</span>
					<svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
						<path d="M5 2 L10 7 L5 12" fill="none" stroke="var(--ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</button>
			{/if}
		</section>
	{/each}
</div>

<Sheet bind:open={sheetOpen}>
	{#if selected}
		{@const n = selected}
		<div class="sheet-chips">
			{#if n.isNext}<Chip variant="sticker-orange">NEXT MISSION</Chip>{/if}
			<Chip variant="pill">{stateChip(n)}</Chip>
			{#if n.unit.kind === 'appendix'}<Chip variant="khaki">DRILL BANK</Chip>{/if}
		</div>
		<h2 class="sheet-title">{n.unit.title}</h2>
		<p class="sheet-sub">{territoryIndex(n)}</p>

		<div class="stats">
			<div class="stat">
				<div class="big">
					{n.topic?.est_read_minutes ?? '—'}<span class="unit-sm">{n.topic ? ' min' : ''}</span>
				</div>
				<div class="cap">READ</div>
			</div>
			<div class="stat">
				<div class="big">{n.topic?.mcq_floor ?? n.unit.floor}<span class="unit-sm">Q</span></div>
				<div class="cap">QUIZ · PASS ≥70%</div>
			</div>
			<div class="stat">
				<div class="big">
					{n.progress?.best_score_pct != null && n.progress.best_score_pct > 0
						? `${n.progress.best_score_pct}%`
						: '—'}
				</div>
				<div class="cap">BEST SCORE</div>
			</div>
		</div>

		{#if n.comingSoon}
			<div class="note">Content marching in — this territory opens in a later drop. The map shows the full campaign from day one.</div>
		{:else if n.premiumLocked}
			<div class="note lock">🔒 Quiz is premium territory. Notes stay free-roam readable; enlist for full access.</div>
		{:else if n.drillLocked}
			<div class="note">Drill unlocks once you hold ground in {regionName(n.unit.region)}.</div>
		{/if}

		<div class="actions">
			{#if n.unit.kind === 'chapter'}
				<Button variant="secondary" disabled={n.comingSoon} onclick={() => goto(`/topic/${n.unit.code}`)}>
					Read notes
				</Button>
			{/if}
			<Button
				variant={n.premiumLocked ? 'locked' : 'primary'}
				disabled={n.comingSoon || n.drillLocked || n.premiumLocked}
				onclick={() => attemptQuiz(n)}
			>
				{n.premiumLocked ? 'Premium — locked' : quizCta(n)}
			</Button>
		</div>
	{/if}
</Sheet>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 4px;
	}
	.titles {
		flex: 1;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 18px;
		text-transform: uppercase;
	}
	.sub {
		margin: 0;
		font-size: 11.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	/* secured sectors get an olive tab; the front tab is rust (.on, global) */
	.foldertab.done {
		color: #fff;
		background: var(--grad-olive);
		box-shadow: 0 3px 0 var(--green-edge);
	}
	.banner {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		text-align: left;
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-lg);
		padding: 12px 16px;
		cursor: pointer;
		font-family: var(--font-ui);
	}
	.banner.secured {
		background: var(--green-tint);
		border-color: var(--line);
	}
	.btext {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.bname {
		font-family: var(--font-display);
		font-size: 13px;
		text-transform: uppercase;
		color: var(--ink-1);
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.bname.muted {
		color: var(--ink-3);
	}
	.stamp {
		font-family: var(--font-ui);
		font-size: 9px;
		font-weight: 900;
		background: var(--green);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-sm);
		padding: 2px 7px;
		transform: rotate(-2deg);
	}
	.bsub {
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.collapse {
		width: 100%;
		background: none;
		border: none;
		font-family: var(--font-ui);
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
		padding: 6px 0 0;
		cursor: pointer;
	}
	/* sheet */
	.sheet-chips {
		display: flex;
		gap: 8px;
		margin-bottom: 8px;
	}
	.sheet-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 20px;
		line-height: 1.25;
		text-transform: uppercase;
	}
	.sheet-sub {
		margin: 4px 0 0;
		font-size: 12px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.stats {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 10px;
		margin-top: 14px;
	}
	.stat {
		background: var(--bg-raise);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 10px;
		text-align: center;
	}
	.big {
		font-family: var(--font-display);
		font-size: 15px;
	}
	.unit-sm {
		font-size: 10px;
	}
	.cap {
		font-size: 9.5px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.note {
		margin-top: 12px;
		font-size: 12px;
		font-weight: 700;
		color: var(--ink-1);
		background: var(--blue-tint);
		border: var(--bw) solid var(--blue-deep);
		border-radius: var(--r-md);
		padding: 9px 13px;
	}
	.note.lock {
		background: var(--khaki-tint);
		border-color: var(--khaki-deep);
	}
	.actions {
		display: flex;
		gap: 12px;
		margin-top: 14px;
	}
	.actions :global(.btn) {
		flex: 1;
	}
</style>
