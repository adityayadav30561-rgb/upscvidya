<script lang="ts">
	import { auth, logout } from '$lib/auth.svelte';
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pb';
	import { setAnonymous } from '$lib/board';
	import { setMinimal } from '$lib/analytics';
	import { startTour } from '$lib/tour.svelte';
	import { showToast } from '$lib/toast.svelte';
	import OfflineNotes from '$lib/components/OfflineNotes.svelte';

	const user = $derived(auth.user);

	/* PT weekly training goal */
	let weeklyGoal = $state(4);
	let goalInit = false;
	$effect(() => {
		if (goalInit || !user) return;
		goalInit = true;
		weeklyGoal = (user as unknown as { pt_weekly_goal?: number }).pt_weekly_goal || 4;
	});
	async function setGoal(next: number) {
		if (!user || next < 1 || next > 7) return;
		const prev = weeklyGoal;
		weeklyGoal = next;
		try {
			await pb.collection('users').update(user.id, { pt_weekly_goal: next });
			await pb.collection('users').authRefresh().catch(() => {});
		} catch {
			weeklyGoal = prev;
			showToast('Could not save goal', 'error');
		}
	}

	/* notifications */
	const NOTIF_TYPES = [
		{ key: 'daily_briefing', label: 'Daily Briefing', sub: '07:00 · new current affairs' },
		{ key: 'streak_risk', label: 'Streak alerts', sub: "warns at 20:30 if today's mission is open" },
		{ key: 'sr_pileup', label: 'Revision pile-up', sub: 'when 25+ cards are due' },
		{ key: 'battalion_weekly', label: 'Battalion results', sub: 'Monday morning standings' },
		{ key: 'pt_reminder', label: 'Time to train', sub: 'weekly Drill Ground nudge' }
	] as const;

	let prefs = $state<Record<string, boolean>>({});
	let minimal = $state(false);
	let prefsInit = false;
	$effect(() => {
		if (prefsInit || !user) return;
		prefsInit = true;
		const stored = (user as unknown as { notification_prefs?: Record<string, boolean> }).notification_prefs;
		const seed: Record<string, boolean> = {};
		for (const t of NOTIF_TYPES) seed[t.key] = stored?.[t.key] !== false;
		prefs = seed;
		minimal = !!(user as unknown as { analytics_minimal?: boolean }).analytics_minimal;
	});

	async function toggleNotif(key: string) {
		if (!user) return;
		const next = { ...prefs, [key]: !prefs[key] };
		prefs = next;
		try {
			await pb.collection('users').update(user.id, { notification_prefs: next });
		} catch {
			prefs = { ...prefs, [key]: !prefs[key] };
			showToast('Could not save preference', 'error');
		}
	}

	/* privacy */
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
	async function toggleMinimal() {
		if (!user) return;
		const next = !minimal;
		minimal = next;
		setMinimal(next);
		try {
			await pb.collection('users').update(user.id, { analytics_minimal: next });
		} catch {
			minimal = !next;
			showToast('Could not save preference', 'error');
		}
	}

	function doLogout() {
		logout();
		goto('/login');
	}
</script>

<svelte:head><title>Settings — UPSCVidya</title></svelte:head>

<div class="screen">
	<header class="sub-head">
		<button class="back" aria-label="back" onclick={() => goto('/profile')}>
			<svg viewBox="0 0 14 14" width="14" height="14"><path d="M9 2 L4 7 L9 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
		</button>
		<h1>Settings</h1>
	</header>

	<section class="group">
		<h2>Notifications</h2>
		<div class="list">
			{#each NOTIF_TYPES as t (t.key)}
				<div class="row">
					<div class="row-text">
						<div class="r-title">{t.label}</div>
						<div class="r-sub">{t.sub}</div>
					</div>
					<button class="toggle" class:on={prefs[t.key]} role="switch" aria-checked={prefs[t.key]} aria-label={t.label} onclick={() => toggleNotif(t.key)}>
						<span class="knob"></span>
					</button>
				</div>
			{/each}
		</div>
	</section>

	<section class="group">
		<h2>Training</h2>
		<div class="goal-row">
			<div>
				<div class="r-title">Weekly workout goal</div>
				<div class="r-sub">Drives your Drill Ground readiness ring.</div>
			</div>
			<div class="stepper">
				<button aria-label="fewer" onclick={() => setGoal(weeklyGoal - 1)} disabled={weeklyGoal <= 1}>−</button>
				<span class="goal-n">{weeklyGoal}</span>
				<button aria-label="more" onclick={() => setGoal(weeklyGoal + 1)} disabled={weeklyGoal >= 7}>+</button>
			</div>
		</div>
	</section>

	<section class="group">
		<h2>Privacy</h2>
		<div class="toggle-row">
			<div>
				<div class="r-title">Appear as Anonymous Cadet</div>
				<div class="r-sub">Hides your name on battalion boards. Your insignia still shows.</div>
			</div>
			<button class="toggle" class:on={anon} role="switch" aria-checked={anon} aria-label="anonymous cadet" disabled={anonBusy} onclick={toggleAnon}>
				<span class="knob"></span>
			</button>
		</div>
		<div class="toggle-row">
			<div>
				<div class="r-title">Minimal analytics</div>
				<div class="r-sub">Send only essential product events. No personal data ever leaves with them.</div>
			</div>
			<button class="toggle" class:on={minimal} role="switch" aria-checked={minimal} aria-label="minimal analytics" onclick={toggleMinimal}>
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
		<button class="ghost" onclick={() => { startTour(); goto('/'); }}>Replay Ustad's walkthrough</button>
		<button class="ghost" onclick={doLogout}>Sign out</button>
	</section>
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		gap: 20px;
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
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 22px;
		text-transform: uppercase;
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
	.list {
		display: flex;
		flex-direction: column;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		overflow: hidden;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--line-soft);
	}
	.row:last-child {
		border-bottom: none;
	}
	.row-text {
		flex: 1;
	}
	.r-title {
		font-weight: 900;
		font-size: 13px;
	}
	.r-sub {
		font-size: 10.5px;
		color: var(--ink-3);
		margin-top: 2px;
	}
	.toggle-row,
	.goal-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 12px 14px;
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
	.stepper {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.stepper button {
		width: 32px;
		height: 32px;
		font-size: 18px;
		font-weight: 900;
		background: var(--bg-0);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		cursor: pointer;
		color: var(--ink-1);
	}
	.stepper button:disabled {
		opacity: 0.4;
	}
	.goal-n {
		font-family: var(--font-display);
		font-size: 20px;
		min-width: 18px;
		text-align: center;
	}
	.ghost {
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
