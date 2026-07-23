<script lang="ts">
	import { auth, logout } from '$lib/auth.svelte';
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pb';
	import { RANKS } from '$lib/ranks';
	import { rankProgress, BADGES } from '$lib/xp';
	import { setAnonymous } from '$lib/board';
	import { showToast } from '$lib/toast.svelte';
	import RankInsignia from '$lib/components/RankInsignia.svelte';
	import OfflineNotes from '$lib/components/OfflineNotes.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	const user = $derived(auth.user);
	const rp = $derived(rankProgress(user?.xp ?? 0));

	/* earned badges */
	let earned = $state<Set<string> | null>(null);
	let booted = false;
	$effect(() => {
		if (booted) return;
		booted = true;
		if (!pb.authStore.isValid) {
			earned = new Set();
			return;
		}
		pb.collection('badges')
			.getFullList<{ code: string }>()
			.then((rows) => (earned = new Set(rows.map((r) => r.code))))
			.catch(() => (earned = new Set()));
	});

	const badgeList = $derived(Object.entries(BADGES));

	/* privacy toggle — masks the name for other viewers on battalion boards */
	let anon = $state(false);
	let anonBusy = $state(false);
	let anonInit = false;
	$effect(() => {
		if (anonInit || !user) return;
		anonInit = true;
		anon = !!(user as unknown as { anonymous?: boolean }).anonymous;
	});

	async function toggleAnon() {
		if (anonBusy) return;
		anonBusy = true;
		const next = !anon;
		try {
			await setAnonymous(next);
			anon = next;
			showToast(next ? 'You now appear as Anonymous Cadet' : 'Your name is visible again', 'info');
		} catch {
			showToast('Could not update privacy setting', 'error');
		} finally {
			anonBusy = false;
		}
	}

	function doLogout() {
		logout();
		goto('/login');
	}
</script>

<svelte:head><title>UPSCVidya — Profile</title></svelte:head>

<div class="profile">
	<h1>Profile</h1>

	{#if user}
		<div class="id-card">
			<div class="insignia"><RankInsignia rank={auth.rankCode} width={44} /></div>
			<div class="id-text">
				<div class="id-name">{rp.current.label} {user.display_name || ''}</div>
				<div class="id-sub">
					{(user.xp ?? 0).toLocaleString('en-IN')} XP
					{#if rp.next}
						· {(rp.next.xp - (user.xp ?? 0)).toLocaleString('en-IN')} to {rp.next.label}{/if}
				</div>
			</div>
		</div>
	{:else}
		<Skeleton height="76px" radius="var(--r-xl)" />
	{/if}

	<!-- Screen 14: the 14-grade CAPF ladder -->
	<section class="group">
		<h2>Rank ladder</h2>
		<div class="ladder">
			{#each RANKS as r, i (r.code)}
				{@const reached = (user?.xp ?? 0) >= r.xp}
				{@const isCurrent = rp.current.code === r.code}
				<div class="rung" class:reached class:current={isCurrent}>
					<span class="rung-no">{i + 1}</span>
					<span class="rung-ins"><RankInsignia rank={r.code} width={20} /></span>
					<span class="rung-name">{r.label}</span>
					<span class="rung-xp">{r.xp.toLocaleString('en-IN')} XP</span>
					{#if isCurrent}<span class="you">YOU</span>{/if}
				</div>
			{/each}
		</div>
	</section>

	<section class="group">
		<h2>Decorations</h2>
		{#if earned === null}
			<Skeleton height="120px" radius="var(--r-lg)" />
		{:else}
			<div class="badges">
				{#each badgeList as [code, b] (code)}
					<div class="badge" class:won={earned.has(code)} title={b.hint}>
						<span class="badge-mark">{earned.has(code) ? '★' : '☆'}</span>
						<span class="badge-name">{b.label}</span>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="group">
		<h2>Privacy</h2>
		<div class="toggle-row">
			<div>
				<div class="t-title">Appear as Anonymous Cadet</div>
				<div class="t-sub">Hides your name on battalion boards. Your insignia still shows.</div>
			</div>
			<button
				class="toggle"
				class:on={anon}
				role="switch"
				aria-checked={anon}
				aria-label="appear as anonymous cadet"
				disabled={anonBusy}
				onclick={toggleAnon}
			>
				<span class="knob"></span>
			</button>
		</div>
	</section>

	<section class="group">
		<h2>Study prefs</h2>
		<OfflineNotes />
	</section>

	<section class="group">
		<h2>Account</h2>
		<button class="logout" onclick={doLogout}>Sign out</button>
	</section>
</div>

<style>
	.profile {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 30px;
		text-transform: uppercase;
	}
	.id-card {
		display: flex;
		align-items: center;
		gap: 14px;
		background: var(--bg-2);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		padding: 14px 16px;
		box-shadow: var(--shadow-2);
	}
	.insignia {
		flex: none;
		background: var(--bg-0);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 6px 10px;
	}
	.id-name {
		font-family: var(--font-display);
		font-size: 16px;
		text-transform: uppercase;
	}
	.id-sub {
		font-size: 11.5px;
		font-weight: 700;
		color: var(--ink-3);
		margin-top: 2px;
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.group h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 14px;
		text-transform: uppercase;
		color: var(--ink-2);
	}
	.ladder {
		display: flex;
		flex-direction: column;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		overflow: hidden;
		background: var(--bg-2);
	}
	.rung {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 12px;
		border-bottom: 1px solid var(--line-soft);
		opacity: 0.55;
	}
	.rung:last-child {
		border-bottom: none;
	}
	.rung.reached {
		opacity: 1;
	}
	.rung.current {
		background: var(--khaki-tint);
		border-left: 4px solid var(--khaki-deep);
	}
	.rung-no {
		flex: none;
		width: 18px;
		font-size: 10px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.rung-ins {
		flex: none;
		width: 24px;
		display: flex;
		justify-content: center;
	}
	.rung-name {
		flex: 1;
		font-weight: 900;
		font-size: 13px;
	}
	.rung-xp {
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.you {
		font-size: 9px;
		font-weight: 900;
		background: var(--khaki-deep);
		color: var(--bg-0);
		border-radius: var(--r-sm);
		padding: 2px 6px;
	}
	.badges {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.badge {
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-md);
		padding: 9px 11px;
		opacity: 0.55;
	}
	.badge.won {
		opacity: 1;
		border-color: var(--line);
		background: var(--khaki-tint);
	}
	.badge-mark {
		font-size: 14px;
	}
	.badge.won .badge-mark {
		color: var(--gold-lo);
	}
	.badge-name {
		font-size: 11px;
		font-weight: 900;
	}
	.toggle-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 12px 14px;
	}
	.t-title {
		font-weight: 900;
		font-size: 13px;
	}
	.t-sub {
		font-size: 10.5px;
		color: var(--ink-3);
		margin-top: 2px;
	}
	.toggle {
		width: 46px;
		height: 26px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		background: var(--bg-1);
		position: relative;
		cursor: pointer;
		flex: none;
		transition: background var(--t-fast) var(--ease);
	}
	.toggle.on {
		background: var(--green);
	}
	.toggle:disabled {
		opacity: 0.6;
	}
	.knob {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 19px;
		height: 19px;
		border-radius: var(--r-full);
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		transition: left var(--t-fast) var(--ease);
	}
	.toggle.on .knob {
		left: 21px;
	}
	.logout {
		align-self: flex-start;
		font-family: var(--font-ui);
		font-weight: 700;
		font-size: 13px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 10px 20px;
		cursor: pointer;
	}
</style>
