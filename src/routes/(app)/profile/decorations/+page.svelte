<script lang="ts">
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pb';
	import { BADGES } from '$lib/xp';
	import BadgeIcon from '$lib/components/BadgeIcon.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	let earned = $state<Set<string> | null>(null);
	let earnedAt = $state<Record<string, string>>({});
	let booted = false;
	$effect(() => {
		if (booted) return;
		booted = true;
		if (!pb.authStore.isValid) {
			earned = new Set();
			return;
		}
		pb.collection('badges')
			.getFullList<{ code: string; earned_at: string }>()
			.then((rows) => {
				earned = new Set(rows.map((r) => r.code));
				earnedAt = Object.fromEntries(rows.map((r) => [r.code, r.earned_at]));
			})
			.catch(() => (earned = new Set()));
	});

	/* categories in display order — each lists its badge codes */
	const CATEGORIES: { title: string; codes: string[] }[] = [
		{ title: 'Campaign', codes: ['first_conquest', 'mock_finisher', 'beta_founder'] },
		{
			title: 'Regions Secured',
			codes: [
				'region_foundations', 'region_system', 'region_centre', 'region_states',
				'region_grassroots', 'region_institutions', 'region_dynamics', 'region_courtroom'
			]
		},
		{ title: 'Streaks', codes: ['streak_7', 'streak_30', 'streak_100'] },
		{ title: 'Battalion', codes: ['podium_1', 'podium_2', 'podium_3', 'commendation'] },
		{
			title: 'Drill Ground',
			codes: ['pet_ready', 'first_workout', 'circuit_finisher', 'pushups_50', 'plank_5min', 'run_5k', 'regiment_30']
		}
	];

	const total = Object.keys(BADGES).length;
	const earnedCount = $derived(earned ? earned.size : 0);

	let openCode = $state<string | null>(null);
	let sheetOpen = $state(false);
	function openBadge(code: string) {
		openCode = code;
		sheetOpen = true;
	}
	const fmtDate = (s: string | undefined) =>
		s ? new Date(String(s).replace(' ', 'T')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
</script>

<svelte:head><title>Decorations — UPSCVidya</title></svelte:head>

<div class="screen">
	<header class="sub-head">
		<button class="back" aria-label="back" onclick={() => goto('/profile')}>
			<svg viewBox="0 0 14 14" width="14" height="14"><path d="M9 2 L4 7 L9 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
		</button>
		<div class="head-text">
			<h1>Decorations</h1>
			<span class="count">{earnedCount} of {total} earned</span>
		</div>
	</header>

	{#if earned === null}
		<Skeleton height="140px" radius="var(--r-lg)" />
		<Skeleton height="140px" radius="var(--r-lg)" />
	{:else}
		{#each CATEGORIES as cat (cat.title)}
			{@const catEarned = cat.codes.filter((c) => earned!.has(c)).length}
			<section class="cat">
				<div class="cat-head">
					<h2>{cat.title}</h2>
					<span class="cat-count">{catEarned}/{cat.codes.length}</span>
				</div>
				<div class="grid">
					{#each cat.codes as code (code)}
						{@const has = earned.has(code)}
						<button class="cell" class:won={has} onclick={() => openBadge(code)}>
							<BadgeIcon {code} earned={has} size={58} />
							<span class="c-name">{BADGES[code]?.label ?? code}</span>
						</button>
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</div>

<Sheet bind:open={sheetOpen} title="">
	{#if openCode}
		{@const has = !!earned?.has(openCode)}
		<div class="detail">
			<BadgeIcon code={openCode} earned={has} size={96} />
			<div class="d-name">{BADGES[openCode]?.label ?? openCode}</div>
			<div class="d-status {has ? 'ok' : 'locked'}">
				{has ? `Earned ${fmtDate(earnedAt[openCode])}` : 'Locked'}
			</div>
			<p class="d-hint">{BADGES[openCode]?.hint ?? ''}</p>
		</div>
	{/if}
</Sheet>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		gap: 16px;
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
	.head-text {
		display: flex;
		flex-direction: column;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 22px;
		text-transform: uppercase;
		line-height: 1;
	}
	.count {
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
		margin-top: 3px;
	}
	.cat {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.cat-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.cat h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 14px;
		text-transform: uppercase;
		color: var(--ink-2);
	}
	.cat-count {
		font-size: 11px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
	}
	.cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 7px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-lg);
		padding: 13px 6px 11px;
		cursor: pointer;
		font-family: var(--font-ui);
		transition: transform var(--t-fast) var(--ease);
	}
	.cell:active {
		transform: scale(0.95);
	}
	.cell.won {
		border-color: var(--line);
		background: var(--bg-raise);
	}
	.c-name {
		font-size: 9.5px;
		font-weight: 900;
		text-align: center;
		line-height: 1.2;
		color: var(--ink-2);
	}
	.cell:not(.won) .c-name {
		color: var(--ink-3);
	}
	.detail {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		text-align: center;
		padding: 6px 0 4px;
	}
	.d-name {
		font-family: var(--font-display);
		font-size: 19px;
		text-transform: uppercase;
		margin-top: 4px;
	}
	.d-status {
		font-size: 11px;
		font-weight: 900;
		border-radius: var(--r-full);
		padding: 3px 12px;
		border: var(--bw) solid var(--line);
	}
	.d-status.ok {
		background: var(--green-tint);
		color: var(--green-deep);
	}
	.d-status.locked {
		background: var(--bg-1);
		color: var(--ink-3);
	}
	.d-hint {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--ink-2);
		max-width: 280px;
		line-height: 1.5;
	}
</style>
