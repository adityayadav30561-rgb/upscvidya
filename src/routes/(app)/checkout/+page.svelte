<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { pb } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { PRICING, formatINR, startCheckout, type Plan } from '$lib/pay';
	import { capture } from '$lib/analytics';

	const planParam = $derived(($page.url.searchParams.get('plan') as Plan) || 'till_exam');
	const plan = $derived<Plan>(planParam === 'monthly' ? 'monthly' : 'till_exam');

	let beta = $state(false);
	$effect(() => {
		if (!pb.authStore.isValid) return;
		pb.collection('badges')
			.getFirstListItem('code = "beta_founder"')
			.then(() => (beta = true))
			.catch(() => (beta = false));
	});

	// The order summary is an honest subtraction chain: subtotal = the plan's
	// list (base) price; the BETA line is the *real* founder saving (base−beta)
	// and appears only for a beta founder. The ₹1999 MRP anchor is paywall
	// framing, not a receipt line — showing it here would fake a discount for
	// everyone.
	const base = $derived(PRICING[plan].base_inr);
	const price = $derived(beta ? PRICING[plan].beta_inr : base);
	const discount = $derived(beta ? base - PRICING[plan].beta_inr : 0);
	const title = $derived(plan === 'till_exam' ? 'Premium — till your exam' : 'Premium — monthly');
	const accessLine = $derived(
		plan === 'till_exam'
			? 'Access until CAPF AC 2027 (date-shift protected)'
			: '30 days of full access from today'
	);

	type Phase = 'review' | 'paying' | 'success' | 'failed';
	let phase = $state<Phase>('review');
	let failMsg = $state('');
	let paidUntil = $state<string | null>(null);

	async function pay() {
		if (phase === 'paying') return;
		phase = 'paying';
		failMsg = '';
		capture('checkout_started', { plan });
		try {
			const r = await startCheckout(plan, {
				name: auth.user?.display_name || '',
				email: auth.user?.email || ''
			});
			if (r.status === 'paid') {
				paidUntil = r.premium_until;
				phase = 'success';
				capture('payment_success', { plan });
				showToast('Campaign unlocked', 'success');
			} else if (r.status === 'dismissed') {
				// UPI/app-switch or a plain close — order stays intact, let them retry
				phase = 'review';
				showToast('Checkout closed — your order is saved', 'info');
			} else {
				failMsg = r.message;
				phase = 'failed';
			}
		} catch (err) {
			failMsg = err instanceof Error ? err.message : 'Something went wrong.';
			phase = 'failed';
		}
	}

	function fmtDate(s: string | null): string {
		if (!s) return '';
		const d = new Date(String(s).replace(' ', 'T'));
		return isNaN(d.getTime())
			? ''
			: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
	}
</script>

<svelte:head><title>UPSCVidya — Checkout</title></svelte:head>

<div class="co">
	{#if phase !== 'success'}
		<header>
			<button class="x" onclick={() => history.back()} aria-label="back">
				<svg width="13" height="13" viewBox="0 0 14 14"
					><path
						d="M9 2 L4 7 L9 12"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					></path></svg
				>
			</button>
			<div class="htitle">Checkout</div>
			<span class="secured">SECURED BY RAZORPAY</span>
		</header>

		<div class="summary">
			<div class="skey">ORDER SUMMARY</div>
			<div class="line">
				<div>
					<div class="lname">{title}</div>
					<div class="lsub">{accessLine}</div>
				</div>
				<span class="lamt">{formatINR(base)}</span>
			</div>
			{#if discount > 0}
				<div class="line">
					<span class="disc"><span class="btag">BETA 50%</span> founding cohort</span>
					<span class="lamt green">−{formatINR(discount)}</span>
				</div>
			{/if}
			<div class="total">
				<span>Total (incl. GST)</span>
				<span class="tamt">{formatINR(price)}</span>
			</div>
		</div>

		{#if phase === 'failed'}
			<div class="fail">
				<strong>Payment didn't go through.</strong>
				<span>{failMsg}</span>
				<span class="hint">If a card failed, UPI usually works. Your beta price is safe.</span>
			</div>
		{/if}

		<button class="cta" onclick={pay} disabled={phase === 'paying'}>
			{#if phase === 'paying'}Opening Razorpay…{:else}Pay {formatINR(price)} →{/if}
		</button>
		<div class="fineprint">7-day refund, no questions · GST invoice by email</div>
	{:else}
		<!-- Success (Screen 20) — the celebration already happened; confirm & return -->
		<div class="ok-mark" aria-hidden="true">
			<svg width="30" height="30" viewBox="0 0 30 30"
				><path
					d="M7 15.5 L12.5 21 L23 9.5"
					fill="none"
					stroke="var(--green-deep)"
					stroke-width="3.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				></path></svg
			>
		</div>
		<h1 class="ok-title">Campaign unlocked</h1>
		<p class="ok-sub">Receipt sent to <strong>{auth.user?.email}</strong>.</p>

		<div class="receipt">
			<div class="rrow">
				<span class="rk">ACCESS</span>
				<div class="rv">
					<div>
						{#if plan === 'till_exam'}Until CAPF AC 2027 exam day{:else}Until {fmtDate(
								paidUntil
							)}{/if}
					</div>
					{#if plan === 'till_exam'}<div class="rvsub">shifts automatically if UPSC moves the date</div
						>{/if}
				</div>
			</div>
			<div class="rrow">
				<span class="rk">PRODUCT</span>
				<div class="rv">
					<div>{title}{beta ? ' · beta 50%' : ''}</div>
					<div class="rvsub">{formatINR(base)}{discount > 0 ? ' − ' + formatINR(discount) : ''}</div>
				</div>
			</div>
			<div class="rrow paid">
				<span class="rk-strong">Paid</span>
				<span class="paid-amt">{formatINR(price)}</span>
			</div>
		</div>

		<div class="unlock">
			<span
				>All 8 regions are now open on your map — new territories on the guided path this
				month.</span
			>
		</div>

		<button class="cta green" onclick={() => goto('/map')}>Back to the mission →</button>
	{/if}
</div>

<style>
	.co {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	header {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.x {
		flex: none;
		width: 34px;
		height: 34px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		background: var(--bg-2);
		color: var(--ink-1);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.htitle {
		flex: 1;
		font-family: var(--font-display);
		font-size: 17px;
		text-transform: uppercase;
	}
	.secured {
		font-size: 9px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.summary {
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-xl);
		padding: 16px 18px;
		display: flex;
		flex-direction: column;
		gap: 11px;
	}
	.skey {
		font-size: 11px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.line {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 10px;
	}
	.lname {
		font-weight: 900;
		font-size: 14px;
	}
	.lsub {
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.lamt {
		font-family: var(--font-display);
		font-size: 15px;
	}
	.lamt.green,
	.disc {
		color: var(--green-deep);
	}
	.disc {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 700;
	}
	.btag {
		font-size: 9px;
		font-weight: 900;
		background: var(--green);
		color: #4d4433;
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
		padding: 2px 7px;
		transform: rotate(-2deg);
	}
	.total {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-top: var(--bw) solid var(--line);
		padding-top: 11px;
		font-weight: 900;
		font-size: 14px;
	}
	.tamt {
		font-family: var(--font-display);
		font-size: 24px;
	}
	.fail {
		display: flex;
		flex-direction: column;
		gap: 4px;
		background: var(--red-tint);
		border: var(--bw) solid var(--red-deep);
		border-radius: var(--r-lg);
		padding: 12px 14px;
		font-size: 12px;
	}
	.fail .hint {
		color: var(--ink-2);
		font-size: 11px;
	}
	.cta {
		width: 100%;
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
	.cta.green {
		background: var(--green);
	}
	.cta:disabled {
		opacity: 0.7;
		cursor: default;
	}
	.fineprint {
		text-align: center;
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.ok-mark {
		align-self: center;
		width: 62px;
		height: 62px;
		border-radius: var(--r-full);
		background: var(--green-tint);
		border: var(--bw-bold) solid var(--green-deep);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-top: 12px;
	}
	.ok-title {
		margin: 0;
		text-align: center;
		font-family: var(--font-display);
		font-size: 22px;
		text-transform: uppercase;
	}
	.ok-sub {
		margin: 0;
		text-align: center;
		font-size: 12.5px;
		color: var(--ink-2);
	}
	.receipt {
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-xl);
		padding: 4px 18px;
	}
	.rrow {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		padding: 13px 0;
		border-bottom: 1px solid var(--line-soft);
	}
	.rrow.paid {
		border-bottom: none;
		align-items: center;
	}
	.rk {
		font-size: 11px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.rk-strong {
		font-weight: 900;
		font-size: 14px;
	}
	.rv {
		text-align: right;
		font-weight: 700;
		font-size: 12.5px;
	}
	.rvsub {
		font-size: 10.5px;
		font-weight: 400;
		color: var(--ink-3);
	}
	.paid-amt {
		font-family: var(--font-display);
		font-size: 22px;
	}
	.unlock {
		background: var(--orange-tint);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 12px 15px;
		font-size: 12px;
		font-weight: 700;
	}
</style>
