<script lang="ts">
	import { auth, logout } from '$lib/auth.svelte';
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pb';
	import { RANKS } from '$lib/ranks';
	import { rankProgress, BADGES } from '$lib/xp';
	import { setAnonymous } from '$lib/board';
	import { showToast } from '$lib/toast.svelte';
	import { restorePurchase, formatINR, monthlyDaysLeft } from '$lib/pay';
	import { capture, setMinimal } from '$lib/analytics';
	import type { Payment } from '$lib/types';
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

	/* ---- Plan & Billing (Prompt 14) ---- */
	const isPremium = $derived(auth.isPremium);
	const daysLeft = $derived(user ? monthlyDaysLeft(user) : null);

	let lastPaid = $state<Payment | null>(null);
	let showReceipt = $state(false);
	let planBooted = false;
	$effect(() => {
		if (planBooted || !pb.authStore.isValid) return;
		planBooted = true;
		pb.collection('payments')
			.getFirstListItem<Payment>('status = "paid"', { sort: '-created' })
			.then((p) => (lastPaid = p))
			.catch(() => (lastPaid = null));
	});

	let restoring = $state(false);
	async function doRestore() {
		if (restoring) return;
		restoring = true;
		try {
			const r = await restorePurchase();
			if (r.restored || r.premium) {
				await pb.collection('users').authRefresh();
				showToast('Purchase restored — premium is active', 'success');
			} else {
				showToast(r.note || 'No active purchase found to restore', 'info');
			}
		} catch {
			showToast('Could not restore purchase', 'error');
		} finally {
			restoring = false;
		}
	}

	function planLabel(plan: string | undefined): string {
		return plan === 'till_exam' ? 'Premium · till exam' : plan === 'monthly' ? 'Premium · monthly' : 'Premium';
	}
	function fmtDate(s: string | undefined | null): string {
		if (!s) return '';
		const d = new Date(String(s).replace(' ', 'T'));
		return isNaN(d.getTime())
			? ''
			: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	/* ---- Referrals: "Recruit a batchmate" (Prompt 14) ---- */
	const referralLink = $derived(
		user?.referral_code && typeof window !== 'undefined'
			? `${window.location.origin}/r/${user.referral_code}`
			: ''
	);
	let creditsEarned = $state<number | null>(null);
	let refBooted = false;
	$effect(() => {
		if (refBooted || !pb.authStore.isValid) return;
		refBooted = true;
		pb.collection('referral_credits')
			.getFullList({ filter: `user = "${user?.id}"` })
			.then((rows) => (creditsEarned = rows.length))
			.catch(() => (creditsEarned = 0));
	});

	async function shareReferral() {
		if (!referralLink) return;
		const text = `I'm prepping for CAPF AC on UPSCVidya — join my battalion and we both get 7 days of Premium. ${referralLink}`;
		const nav = navigator as Navigator & { share?: (d: { title: string; text: string; url: string }) => Promise<void> };
		if (nav.share) {
			try {
				await nav.share({ title: 'UPSCVidya', text, url: referralLink });
				return;
			} catch {
				/* user cancelled — fall through to copy */
			}
		}
		try {
			await navigator.clipboard.writeText(referralLink);
			showToast('Referral link copied', 'success');
		} catch {
			showToast(referralLink, 'info', 6000);
		}
		capture('referral_shared', {});
	}

	/* ---- Notifications + analytics settings (Prompt 15) ---- */
	const NOTIF_TYPES = [
		{ key: 'daily_briefing', label: 'Daily Briefing', sub: '07:00 · new current affairs' },
		{ key: 'streak_risk', label: 'Streak alerts', sub: "warns at 20:30 if today's mission is open" },
		{ key: 'sr_pileup', label: 'Revision pile-up', sub: 'when 25+ cards are due' },
		{ key: 'battalion_weekly', label: 'Battalion results', sub: 'Monday morning standings' },
		{ key: 'pt_reminder', label: 'Time to train', sub: 'weekly Drill Ground nudge' }
	] as const;

	/* ---- PT weekly training goal (Prompt 16) ---- */
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

	// prefs default ON (a missing key = opted-in, matching the server)
	let prefs = $state<Record<string, boolean>>({});
	let minimal = $state(false);
	let prefsInit = false;
	$effect(() => {
		if (prefsInit || !user) return;
		prefsInit = true;
		const stored = (user as unknown as { notification_prefs?: Record<string, boolean> })
			.notification_prefs;
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
			prefs = { ...prefs, [key]: !prefs[key] }; // revert
			showToast('Could not save preference', 'error');
		}
	}

	async function toggleMinimal() {
		if (!user) return;
		const next = !minimal;
		minimal = next;
		setMinimal(next); // takes effect immediately, no reload
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

	<!-- Plan & Billing (Screen 19 · Prompt 14) -->
	<section class="group">
		<h2>Plan &amp; billing</h2>
		{#if isPremium}
			<div class="plan-card premium">
				<div class="plan-info">
					<div class="plan-name">{planLabel(user?.premium_plan)}</div>
					<div class="plan-sub">
						Active until {fmtDate(user?.premium_until)}
						{#if lastPaid}· paid {formatINR(lastPaid.amount_inr)} · {fmtDate(lastPaid.created)}{/if}
					</div>
					{#if daysLeft !== null && daysLeft <= 7}
						<div class="plan-warn">Renews in {daysLeft} day{daysLeft === 1 ? '' : 's'}</div>
					{/if}
				</div>
				{#if lastPaid}
					<button class="chip" onclick={() => (showReceipt = !showReceipt)}>RECEIPT</button>
				{/if}
			</div>
			{#if showReceipt && lastPaid}
				<div class="receipt-mini">
					<div><span>Product</span><span>{planLabel(lastPaid.plan)}</span></div>
					<div><span>Paid</span><span>{formatINR(lastPaid.amount_inr)}</span></div>
					<div><span>Date</span><span>{fmtDate(lastPaid.created)}</span></div>
					<div><span>Order</span><span class="mono">{lastPaid.razorpay_order_id}</span></div>
				</div>
			{/if}
			{#if user?.premium_plan === 'monthly'}
				<button class="upgrade" onclick={() => goto('/paywall?from=Extend%20access')}
					>Switch to till-exam →</button
				>
			{/if}
		{:else}
			<div class="plan-card free">
				<div class="plan-info">
					<div class="plan-name">Free tier</div>
					<div class="plan-sub">PYQ Vault + Foundations region. Unlock all 8 regions with Premium.</div>
				</div>
			</div>
			<button class="upgrade" onclick={() => goto('/paywall')}>Go Premium →</button>
		{/if}
		<button class="restore" onclick={doRestore} disabled={restoring}>
			{restoring ? 'Restoring…' : 'Restore purchase'}
		</button>
	</section>

	<!-- Recruit a batchmate (Prompt 14 referrals) -->
	<section class="group">
		<h2>Recruit a batchmate</h2>
		<div class="recruit">
			<div class="recruit-copy">
				When a batchmate signs up with your link and clears their first quiz, you
				<strong>both get 7 days of Premium</strong>.
				{#if creditsEarned !== null && creditsEarned > 0}
					<div class="recruit-earned">{creditsEarned} credit{creditsEarned === 1 ? '' : 's'} earned</div>
				{/if}
			</div>
			{#if user?.referral_code}
				<div class="code-row">
					<code class="ref-code">{user.referral_code}</code>
					<button class="share" onclick={shareReferral}>Share link</button>
				</div>
			{/if}
		</div>
	</section>

	<!-- Training goal (Prompt 16) -->
	<section class="group">
		<h2>Training</h2>
		<div class="goal-row">
			<div>
				<div class="t-title">Weekly workout goal</div>
				<div class="t-sub">Drives your Drill Ground readiness ring.</div>
			</div>
			<div class="stepper">
				<button aria-label="fewer" onclick={() => setGoal(weeklyGoal - 1)} disabled={weeklyGoal <= 1}
					>−</button
				>
				<span class="goal-n">{weeklyGoal}</span>
				<button aria-label="more" onclick={() => setGoal(weeklyGoal + 1)} disabled={weeklyGoal >= 7}
					>+</button
				>
			</div>
		</div>
	</section>

	<!-- Notifications (Screen 19 · Prompt 15) — opt-outs honoured server-side -->
	<section class="group">
		<h2>Notifications</h2>
		<div class="notif-list">
			{#each NOTIF_TYPES as t (t.key)}
				<div class="notif-row">
					<div class="notif-text">
						<div class="notif-title">{t.label}</div>
						<div class="notif-sub">{t.sub}</div>
					</div>
					<button
						class="toggle"
						class:on={prefs[t.key]}
						role="switch"
						aria-checked={prefs[t.key]}
						aria-label={t.label}
						onclick={() => toggleNotif(t.key)}
					>
						<span class="knob"></span>
					</button>
				</div>
			{/each}
		</div>
	</section>

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
		<div class="toggle-row">
			<div>
				<div class="t-title">Minimal analytics</div>
				<div class="t-sub">Send only essential product events. No personal data ever leaves with them.</div>
			</div>
			<button
				class="toggle"
				class:on={minimal}
				role="switch"
				aria-checked={minimal}
				aria-label="minimal analytics"
				onclick={toggleMinimal}
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
	.plan-card {
		display: flex;
		align-items: center;
		gap: 12px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 14px 16px;
	}
	.plan-card.premium {
		background: var(--orange-tint);
	}
	.plan-card.free {
		background: var(--bg-2);
	}
	.plan-info {
		flex: 1;
	}
	.plan-name {
		font-weight: 900;
		font-size: 13.5px;
	}
	.plan-sub {
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-2);
		margin-top: 2px;
	}
	.plan-warn {
		font-size: 10.5px;
		font-weight: 900;
		color: var(--red-deep);
		margin-top: 4px;
	}
	.chip {
		flex: none;
		font-size: 10px;
		font-weight: 900;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-sm);
		padding: 4px 9px;
		cursor: pointer;
	}
	.receipt-mini {
		display: flex;
		flex-direction: column;
		gap: 6px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 12px 14px;
		font-size: 11.5px;
	}
	.receipt-mini > div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	.receipt-mini span:first-child {
		font-weight: 900;
		color: var(--ink-3);
	}
	.mono {
		font-family: var(--font-read);
		font-size: 10.5px;
	}
	.upgrade {
		align-self: flex-start;
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 13px;
		background: var(--orange);
		color: #4d4433;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 11px 22px;
		cursor: pointer;
		box-shadow: var(--shadow-2);
	}
	.restore {
		align-self: flex-start;
		font-size: 11.5px;
		font-weight: 700;
		background: none;
		border: none;
		color: var(--blue-deep);
		cursor: pointer;
		padding: 2px 0;
	}
	.restore:disabled {
		opacity: 0.6;
	}
	.recruit {
		display: flex;
		flex-direction: column;
		gap: 12px;
		background: var(--khaki-tint);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 14px 16px;
	}
	.recruit-copy {
		font-size: 12px;
		font-weight: 700;
		color: var(--ink-1);
	}
	.recruit-earned {
		margin-top: 6px;
		font-size: 10.5px;
		font-weight: 900;
		color: var(--green-deep);
	}
	.code-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.ref-code {
		flex: 1;
		font-family: var(--font-read);
		font-weight: 700;
		font-size: 15px;
		letter-spacing: 0.12em;
		background: var(--bg-0);
		border: var(--bw) dashed var(--line);
		border-radius: var(--r-md);
		padding: 9px 12px;
		text-align: center;
	}
	.share {
		flex: none;
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 12.5px;
		background: var(--green);
		color: #4d4433;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 10px 16px;
		cursor: pointer;
	}
	.goal-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 12px 14px;
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
	.notif-list {
		display: flex;
		flex-direction: column;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		overflow: hidden;
	}
	.notif-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--line-soft);
	}
	.notif-row:last-child {
		border-bottom: none;
	}
	.notif-text {
		flex: 1;
	}
	.notif-title {
		font-weight: 900;
		font-size: 13px;
	}
	.notif-sub {
		font-size: 10.5px;
		color: var(--ink-3);
		margin-top: 2px;
	}
</style>
