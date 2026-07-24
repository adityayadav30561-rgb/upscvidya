<script lang="ts">
	import { auth } from '$lib/auth.svelte';
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pb';
	import { restorePurchase, formatINR, monthlyDaysLeft } from '$lib/pay';
	import { capture } from '$lib/analytics';
	import { showToast } from '$lib/toast.svelte';
	import type { Payment } from '$lib/types';

	const user = $derived(auth.user);
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
		return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	/* referrals */
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
				/* cancelled — fall through */
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
</script>

<svelte:head><title>Plan & Billing — UPSCVidya</title></svelte:head>

<div class="screen">
	<header class="sub-head">
		<button class="back" aria-label="back" onclick={() => goto('/profile')}>
			<svg viewBox="0 0 14 14" width="14" height="14"><path d="M9 2 L4 7 L9 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
		</button>
		<h1>Plan &amp; Billing</h1>
	</header>

	<section class="group">
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
				{#if lastPaid}<button class="chip" onclick={() => (showReceipt = !showReceipt)}>RECEIPT</button>{/if}
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
				<button class="upgrade" onclick={() => goto('/paywall?from=Extend%20access')}>Switch to till-exam →</button>
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
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		gap: 18px;
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
</style>
