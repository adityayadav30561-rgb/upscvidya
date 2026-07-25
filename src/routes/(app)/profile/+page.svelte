<script lang="ts">
	import { auth } from '$lib/auth.svelte';
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pb';
	import { rankProgress, BADGES } from '$lib/xp';
	import { RANKS } from '$lib/ranks';
	import { fetchBoard, type Board } from '$lib/board';
	import { haptic } from '$lib/native';
	import RankInsignia from '$lib/components/RankInsignia.svelte';
	import BadgeIcon from '$lib/components/BadgeIcon.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	const user = $derived(auth.user);
	const rp = $derived(rankProgress(user?.xp ?? 0));
	const isPremium = $derived(auth.isPremium);
	const gradeNo = $derived(RANKS.findIndex((r) => r.code === rp.current.code) + 1);

	const SEGMENTS = 8;
	const xpSegments = $derived(Math.round((rp.pct / 100) * SEGMENTS));

	let earned = $state<string[] | null>(null);
	let board = $state<Board | null>(null);
	const totalBadges = Object.keys(BADGES).length;
	const earnedCount = $derived(earned?.length ?? null);
	let booted = false;
	$effect(() => {
		if (booted) return;
		booted = true;
		if (!pb.authStore.isValid) {
			earned = [];
			return;
		}
		pb.collection('badges')
			.getFullList<{ code: string }>()
			.then((rows) => (earned = rows.map((r) => r.code)))
			.catch(() => (earned = []));
		fetchBoard()
			.then((b) => (board = b))
			.catch(() => (board = null));
	});

	/* medal case: 5 slots — earned first, rest empty */
	const CASE_SLOTS = 5;
	const caseSlots = $derived(
		Array.from({ length: CASE_SLOTS }, (_, i) => (earned ? (earned[i] ?? null) : null))
	);
	const nextMilestone = $derived([7, 30, 100].find((m) => (user?.streak_current ?? 0) < m) ?? null);

	interface Entry {
		href: string;
		label: string;
		sub: string;
		glyph: string;
		cta?: string;
		alert?: boolean;
	}
	const entries = $derived<Entry[]>([
		{
			href: '/profile/ranks',
			label: 'Rank Ladder',
			sub: rp.next
				? `${(rp.next.xp - (user?.xp ?? 0)).toLocaleString('en-IN')} XP to ${rp.next.label}`
				: 'Top of the ladder',
			glyph: '▮'
		},
		{
			href: '/profile/decorations',
			label: 'Decorations',
			sub: earnedCount === null ? '…' : `${earnedCount} of ${totalBadges} earned`,
			glyph: '★'
		},
		{
			href: '/profile/billing',
			label: 'Plan & Billing',
			sub: isPremium ? 'Premium active' : 'Free tier · go Premium',
			glyph: 'P',
			cta: isPremium ? undefined : 'UPGRADE',
			alert: !isPremium
		},
		{
			href: '/profile/settings',
			label: 'Settings',
			sub: 'Notifications · privacy · training',
			glyph: '⚙'
		}
	]);

	function open(href: string) {
		haptic();
		goto(href);
	}
</script>

<svelte:head><title>UPSCVidya — Profile</title></svelte:head>

<div class="hub">
	<!-- ============ SERVICE RECORD ============ -->
	{#if user}
		<div class="record plate-lift">
			<div class="rec-top">
				<button class="brass rank-board" onclick={() => open('/profile/ranks')} aria-label="rank ladder">
					<RankInsignia rank={auth.rankCode} width={38} />
				</button>
				<div class="who">
					<div class="stencil rank">{rp.current.label}</div>
					<div class="name">{user.display_name || 'Recruit'} · Grade {gradeNo} / {RANKS.length}</div>
					<!-- service bars: one per grade reached, capped at 5 -->
					<div class="bars">
						{#each Array(5) as _, i (i)}
							<span class="bar" class:on={i < Math.min(5, gradeNo)}></span>
						{/each}
					</div>
				</div>
				<div class="seal streak-seal">
					<span class="seal-n">{user.streak_current ?? 0}</span>
					<span class="seal-k">DAY ON</span>
				</div>
			</div>

			<div class="xp-block">
				<div class="xp-line">
					<span>{(user.xp ?? 0).toLocaleString('en-IN')} XP</span>
					{#if rp.next}<span class="muted">{rp.next.xp.toLocaleString('en-IN')}</span>{/if}
				</div>
				<div class="segbar">
					{#each Array(SEGMENTS) as _, i (i)}
						<span class="seg" class:on={i < xpSegments}></span>
					{/each}
				</div>
			</div>

			<div class="stat-strip">
				<div class="stat recess-tile">
					<div class="sv">{(user.xp ?? 0).toLocaleString('en-IN')}</div>
					<div class="sk">XP</div>
				</div>
				<div class="stat recess-tile">
					<div class="sv">{earnedCount ?? '—'}/{totalBadges}</div>
					<div class="sk">Medals</div>
				</div>
				<div class="stat recess-tile">
					<div class="sv rust">{board?.you ? `#${board.you.rank}` : `${gradeNo}/${RANKS.length}`}</div>
					<div class="sk">{board?.you ? 'Battalion' : 'Grade'}</div>
				</div>
			</div>
		</div>
	{:else}
		<Skeleton height="190px" radius="var(--r-xl)" />
	{/if}

	<!-- ============ MEDAL CASE ============ -->
	<button class="case plate-dark" onclick={() => open('/profile/decorations')}>
		<div class="case-head">
			<span class="case-k">Medal Case</span>
			<span class="case-n">{earnedCount ?? '—'} OF {totalBadges}</span>
		</div>
		<div class="case-grid">
			{#each caseSlots as code, i (i)}
				{#if code}
					<span class="slot"><BadgeIcon {code} earned size={44} /></span>
				{:else}
					<span class="hex locked"></span>
				{/if}
			{/each}
		</div>
		<div class="case-next">
			{#if nextMilestone}
				Next: {nextMilestone}-day streak badge — {nextMilestone - (user?.streak_current ?? 0)} days out
			{:else}
				Every streak medal secured — chase the region medals next
			{/if}
		</div>
	</button>

	<!-- ============ MENU ============ -->
	<div class="menu">
		{#each entries as e (e.href)}
			<button class="dossier-row" class:alert={e.alert} onclick={() => open(e.href)}>
				<span class="row-ico">{e.glyph}</span>
				<span class="row-body">
					<span class="row-t">{e.label}</span>
					<span class="row-s">{e.sub}</span>
				</span>
				{#if e.cta}
					<span class="btn3d row-cta">{e.cta}</span>
				{:else}
					<span class="chev"></span>
				{/if}
			</button>
		{/each}
	</div>
</div>

<style>
	.hub {
		display: flex;
		flex-direction: column;
		gap: 13px;
	}

	/* ---------- service record ---------- */
	.record {
		padding: 15px;
		display: flex;
		flex-direction: column;
		gap: 13px;
	}
	.rec-top {
		display: flex;
		gap: 13px;
		align-items: center;
	}
	.rank-board {
		flex: none;
		width: 66px;
		height: 86px;
		padding: 0;
		cursor: pointer;
	}
	.who {
		flex: 1;
		min-width: 0;
	}
	.rank {
		font-size: 27px;
	}
	.name {
		font-size: 12px;
		font-weight: 600;
		color: var(--ink-3);
		margin-top: 2px;
	}
	.bars {
		margin-top: 7px;
		display: flex;
		gap: 5px;
	}
	.bar {
		width: 26px;
		height: 12px;
		border-radius: 2px;
		background: var(--bg-1);
		box-shadow: inset 0 1px 2px rgba(80, 68, 35, 0.3);
	}
	.bar.on {
		background: var(--grad-rust);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
	}
	.streak-seal {
		flex: none;
		width: 56px;
		height: 56px;
	}
	.streak-seal .seal-n {
		font-size: 19px;
	}
	.xp-line {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--ink-2);
		margin-bottom: 5px;
	}
	.xp-line .muted {
		color: var(--ink-3);
	}
	.stat-strip {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 9px;
	}
	.recess-tile {
		border: var(--bw) solid var(--line-soft);
		border-radius: 10px;
		background: #f6efd9;
		box-shadow: var(--emboss);
		padding: 9px 4px;
		text-align: center;
	}
	:global([data-theme='dark']) .recess-tile {
		background: var(--bg-3);
	}
	.sv {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 20px;
		line-height: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sv.rust {
		color: var(--orange-deep);
	}
	.sk {
		font-size: 8px;
		font-weight: 700;
		color: var(--ink-3);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		margin-top: 3px;
	}

	/* ---------- medal case ---------- */
	.case {
		padding: 13px;
		cursor: pointer;
		text-align: left;
		display: block;
		width: 100%;
		transition: transform var(--t-fast) var(--ease);
	}
	.case:active {
		transform: translateY(2px);
	}
	.case-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.case-k {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 15px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.case-n {
		font-size: 10px;
		font-weight: 700;
		color: #d8c48a;
	}
	.case-grid {
		margin-top: 11px;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 9px;
		align-items: center;
	}
	.slot {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.case-next {
		margin-top: 11px;
		font-size: 11px;
		font-weight: 600;
		color: #ded5b6;
	}

	/* ---------- menu ---------- */
	.menu {
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.dossier-row.alert {
		border-color: var(--red);
		background: linear-gradient(#f7ddd4, #f0cabd);
		box-shadow: 0 3px 0 var(--red-edge), var(--emboss);
	}
	.dossier-row.alert .row-t {
		color: var(--red-deep);
	}
	.dossier-row.alert .row-s {
		color: #a05a44;
	}
	.dossier-row.alert .row-ico {
		background: var(--grad-gold);
		border-color: var(--gold-edge);
		color: #3b2f11;
	}
	.row-cta {
		flex: none;
		font-size: 10px;
		padding: 6px 11px;
	}
</style>
