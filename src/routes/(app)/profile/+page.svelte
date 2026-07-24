<script lang="ts">
	import { auth } from '$lib/auth.svelte';
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pb';
	import { rankProgress, BADGES } from '$lib/xp';
	import { RANKS } from '$lib/ranks';
	import RankInsignia from '$lib/components/RankInsignia.svelte';
	import StreakFlame from '$lib/components/StreakFlame.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	const user = $derived(auth.user);
	const rp = $derived(rankProgress(user?.xp ?? 0));
	const isPremium = $derived(auth.isPremium);
	const gradeNo = $derived(RANKS.findIndex((r) => r.code === rp.current.code) + 1);

	let earnedCount = $state<number | null>(null);
	const totalBadges = Object.keys(BADGES).length;
	let booted = false;
	$effect(() => {
		if (booted) return;
		booted = true;
		if (!pb.authStore.isValid) {
			earnedCount = 0;
			return;
		}
		pb.collection('badges')
			.getFullList<{ code: string }>()
			.then((rows) => (earnedCount = rows.length))
			.catch(() => (earnedCount = 0));
	});

	interface Entry {
		href: string;
		label: string;
		sub: string;
		icon: string; // svg path in a 0..24 box
		accent: string;
	}
	const entries = $derived<Entry[]>([
		{
			href: '/profile/ranks',
			label: 'Rank Ladder',
			sub: rp.next ? `${(rp.next.xp - (user?.xp ?? 0)).toLocaleString('en-IN')} XP to ${rp.next.label}` : 'Top of the ladder',
			icon: 'M4 20 h16 M7 20 V10 M12 20 V5 M17 20 V13',
			accent: 'var(--khaki)'
		},
		{
			href: '/profile/decorations',
			label: 'Decorations',
			sub: earnedCount === null ? '…' : `${earnedCount} of ${totalBadges} earned`,
			icon: 'M12 2 l3 6 6 1 -4.5 4.5 1 6 -5.5 -3 -5.5 3 1 -6 L3 9 l6 -1 Z',
			accent: 'var(--gold-hi)'
		},
		{
			href: '/profile/billing',
			label: 'Plan & Billing',
			sub: isPremium ? 'Premium active' : 'Free tier · go Premium',
			icon: 'M3 7 h18 v11 h-18 Z M3 11 h18',
			accent: isPremium ? 'var(--orange)' : 'var(--blue)'
		},
		{
			href: '/profile/settings',
			label: 'Settings',
			sub: 'Notifications · privacy · training · account',
			icon: 'M12 8 a4 4 0 1 0 0 8 a4 4 0 0 0 0 -8 M12 2 v3 M12 19 v3 M2 12 h3 M19 12 h3 M5 5 l2 2 M17 17 l2 2 M19 5 l-2 2 M7 17 l-2 2',
			accent: 'var(--ink-2)'
		}
	]);
</script>

<svelte:head><title>UPSCVidya — Profile</title></svelte:head>

<div class="hub">
	<!-- hero -->
	{#if user}
		<div class="hero">
			<div class="hero-top">
				<div class="insignia"><RankInsignia rank={auth.rankCode} width={52} /></div>
				<div class="who">
					<div class="rank">{rp.current.label}</div>
					<div class="name">{user.display_name || 'Recruit'}</div>
				</div>
				<button class="streak" onclick={() => goto('/profile/settings')} aria-label="streak">
					<StreakFlame count={user.streak_current ?? 0} freezes={user.streak_freezes ?? 0} size={20} showLabel={false} />
				</button>
			</div>

			<div class="xp-block">
				<div class="xp-line">
					<span>{(user.xp ?? 0).toLocaleString('en-IN')} XP</span>
					{#if rp.next}<span class="muted">{rp.next.xp.toLocaleString('en-IN')}</span>{/if}
				</div>
				<div class="xp-track"><div class="xp-fill" style:width="{rp.pct}%"></div></div>
			</div>

			<div class="stat-strip">
				<div class="stat"><div class="sv">{(user.xp ?? 0).toLocaleString('en-IN')}</div><div class="sk">XP</div></div>
				<div class="stat"><div class="sv">{earnedCount ?? '—'}/{totalBadges}</div><div class="sk">MEDALS</div></div>
				<div class="stat"><div class="sv">{gradeNo}/{RANKS.length}</div><div class="sk">GRADE</div></div>
			</div>
		</div>
	{:else}
		<Skeleton height="150px" radius="var(--r-xl)" />
	{/if}

	<!-- menu -->
	<div class="menu">
		{#each entries as e (e.href)}
			<button class="entry" onclick={() => goto(e.href)}>
				<span class="e-icon" style:color={e.accent}>
					<svg viewBox="0 0 24 24" width="22" height="22"><path d={e.icon} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</span>
				<span class="e-text">
					<span class="e-label">{e.label}</span>
					<span class="e-sub">{e.sub}</span>
				</span>
				<svg class="chev" viewBox="0 0 14 14" width="13" height="13"><path d="M5 2 L10 7 L5 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
			</button>
		{/each}
	</div>
</div>

<style>
	.hub {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.hero {
		background: var(--bg-2);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		box-shadow: var(--shadow-2);
		position: relative;
		overflow: hidden;
	}
	.hero::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at 82% -10%, rgba(207, 106, 74, 0.14), transparent 55%);
		pointer-events: none;
	}
	.hero-top {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.insignia {
		flex: none;
		background: var(--bg-0);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 8px 12px;
	}
	.who {
		flex: 1;
		min-width: 0;
	}
	.rank {
		font-family: var(--font-display);
		font-size: 18px;
		text-transform: uppercase;
		line-height: 1.1;
	}
	.name {
		font-size: 12px;
		font-weight: 700;
		color: var(--ink-3);
		margin-top: 2px;
	}
	.streak {
		flex: none;
		background: var(--bg-0);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 7px 10px;
		cursor: pointer;
	}
	.xp-block {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.xp-line {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		font-weight: 900;
		color: var(--ink-2);
	}
	.xp-line .muted {
		color: var(--ink-3);
	}
	.xp-track {
		height: 9px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		background: var(--bg-0);
		overflow: hidden;
	}
	.xp-fill {
		height: 100%;
		background: var(--khaki);
		transition: width var(--t-conquest) var(--ease);
	}
	.stat-strip {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 8px;
	}
	.stat {
		background: var(--bg-0);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-md);
		padding: 8px 4px;
		text-align: center;
	}
	.sv {
		font-family: var(--font-display);
		font-size: 15px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sk {
		font-size: 8.5px;
		font-weight: 900;
		color: var(--ink-3);
		letter-spacing: 0.05em;
	}
	.menu {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.entry {
		display: flex;
		align-items: center;
		gap: 13px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 14px 15px;
		cursor: pointer;
		font-family: var(--font-ui);
		text-align: left;
		color: var(--ink-1);
		transition:
			box-shadow var(--t-fast) var(--ease),
			transform var(--t-fast) var(--ease);
	}
	.entry:active {
		transform: scale(0.985);
	}
	.entry:hover {
		box-shadow: var(--shadow-2);
	}
	.e-icon {
		flex: none;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-0);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-md);
	}
	.e-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.e-label {
		font-weight: 900;
		font-size: 14px;
	}
	.e-sub {
		font-size: 11px;
		color: var(--ink-3);
	}
	.chev {
		flex: none;
		color: var(--ink-3);
	}
</style>
