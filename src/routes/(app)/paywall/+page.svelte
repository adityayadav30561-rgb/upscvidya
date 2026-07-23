<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { pb } from '$lib/pb';
	import { PRICING, formatINR, type Plan } from '$lib/pay';

	// context that hit the wall ("Unlocked from: Mock 05") — keeps the ask concrete
	const fromLabel = $derived($page.url.searchParams.get('from') || '');

	let selected = $state<Plan>('till_exam');
	let beta = $state(false);
	// seat counter is real when wired (P18); hidden until then rather than faked
	const seatsLeft: number | null = null;

	// beta-founder pricing is server-authoritative; we only PREVIEW it here
	$effect(() => {
		if (!pb.authStore.isValid) return;
		pb.collection('badges')
			.getFirstListItem('code = "beta_founder"')
			.then(() => (beta = true))
			.catch(() => (beta = false));
	});

	function priceOf(plan: Plan) {
		const p = PRICING[plan];
		return beta ? p.beta_inr : p.base_inr;
	}

	const rows = [
		{ label: 'PYQ Vault (all papers)', free: true, prem: true },
		{ label: 'Territory: Foundations region', free: true, prem: true },
		{ label: 'All 8 regions · every topic', free: '—', prem: true },
		{ label: 'Full mocks + percentile', free: '1 free', prem: true },
		{ label: 'Revision stack (SR)', free: 'free topics', prem: true },
		{ label: 'Daily Briefing archive', free: '2 days', prem: '365 days' }
	];

	function dismiss() {
		if (history.length > 1) history.back();
		else goto('/');
	}
	function choose() {
		goto(`/checkout?plan=${selected}`);
	}
</script>

<svelte:head><title>UPSCVidya — Go Premium</title></svelte:head>

<div class="wall">
	<header>
		<button class="x" onclick={dismiss} aria-label="close">
			<svg width="12" height="12" viewBox="0 0 10 10"
				><path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"
				></path></svg
			>
		</button>
		<div class="htext">
			<h1>Go full campaign</h1>
			{#if fromLabel}<div class="from">Unlocked from: {fromLabel}</div>{/if}
		</div>
	</header>

	{#if beta}
		<div class="beta">
			<span class="beta-tag">BETA · 50% OFF</span>
			<span class="beta-copy"
				>Founding-cohort price, locked in{#if seatsLeft !== null}
					· {seatsLeft} seats left{/if}.</span
			>
		</div>
	{/if}

	<!-- Till-exam: anchored default -->
	<button
		class="plan hero"
		class:on={selected === 'till_exam'}
		onclick={() => (selected = 'till_exam')}
		aria-pressed={selected === 'till_exam'}
	>
		<span class="badge">MOST CHOSEN</span>
		<span class="radio" class:sel={selected === 'till_exam'}></span>
		<span class="pinfo">
			<span class="pname">Till your exam</span>
			<span class="psub">Everything, until CAPF AC 2027 · one payment</span>
			<span class="prow">
				<span class="price">{formatINR(priceOf('till_exam'))}</span>
				<span class="mrp">{formatINR(PRICING.till_exam.anchor_inr)}</span>
				<span class="permo">≈ {formatINR(Math.round(priceOf('till_exam') / 13))}/month</span>
			</span>
			<span class="pnote">No renewal anxiety. If the exam date shifts, access shifts with it.</span>
		</span>
	</button>

	<!-- Monthly -->
	<button
		class="plan"
		class:on={selected === 'monthly'}
		onclick={() => (selected = 'monthly')}
		aria-pressed={selected === 'monthly'}
	>
		<span class="radio" class:sel={selected === 'monthly'}></span>
		<span class="pinfo">
			<span class="pname">Monthly</span>
			<span class="psub">30 days · renew when you want</span>
		</span>
		<span class="prow tight">
			<span class="price sm">{formatINR(priceOf('monthly'))}</span>
			<span class="mrp">{formatINR(PRICING.monthly.anchor_inr)}</span>
		</span>
	</button>

	<!-- Comparison -->
	<div class="cmp">
		<div class="cmp-head">
			<div></div>
			<div>FREE</div>
			<div class="prem">PREMIUM</div>
		</div>
		{#each rows as r (r.label)}
			<div class="cmp-row">
				<div class="cmp-label">{r.label}</div>
				<div class="cmp-cell">
					{#if r.free === true}<span class="tick">✓</span>{:else}<span class="dash">{r.free}</span
						>{/if}
				</div>
				<div class="cmp-cell prem">
					{#if r.prem === true}<span class="tick">✓</span>{:else}<span class="strong">{r.prem}</span
						>{/if}
				</div>
			</div>
		{/each}
	</div>

	<button class="cta" onclick={choose}>
		Continue · {formatINR(priceOf(selected))} →
	</button>
	<div class="trust">
		<span>UPI · cards · netbanking</span><span>·</span><span>7-day refund</span>
	</div>
	<p class="keep">The free tier stays yours — PYQ Vault and the Foundations region never lock.</p>
</div>

<style>
	.wall {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	header {
		display: flex;
		align-items: center;
		gap: 12px;
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
	.htext h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 22px;
		text-transform: uppercase;
	}
	.from {
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
		margin-top: 2px;
	}
	.beta {
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--green-tint);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 10px 14px;
	}
	.beta-tag {
		flex: none;
		font-size: 10px;
		font-weight: 900;
		background: var(--green);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-sm);
		padding: 3px 9px;
		transform: rotate(-2deg);
	}
	.beta-copy {
		font-size: 11.5px;
		font-weight: 700;
	}
	.plan {
		position: relative;
		display: flex;
		align-items: center;
		gap: 12px;
		text-align: left;
		width: 100%;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-xl);
		padding: 16px 18px;
		cursor: pointer;
		color: var(--ink-1);
		font-family: var(--font-ui);
	}
	.plan.hero {
		border-width: var(--bw-bold);
		flex-direction: row;
		align-items: flex-start;
		box-shadow: var(--shadow-2);
	}
	.plan.on {
		border-color: var(--orange-deep);
	}
	.badge {
		position: absolute;
		top: -11px;
		right: 16px;
		font-size: 10px;
		font-weight: 900;
		background: var(--orange);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-sm);
		padding: 4px 10px;
		transform: rotate(2deg);
		box-shadow: var(--shadow-2);
	}
	.radio {
		flex: none;
		width: 22px;
		height: 22px;
		margin-top: 2px;
		border-radius: var(--r-full);
		border: var(--bw) solid var(--line);
		background: var(--bg-0);
	}
	.radio.sel {
		box-shadow: inset 0 0 0 5px var(--orange-deep);
	}
	.pinfo {
		display: flex;
		flex-direction: column;
		gap: 5px;
		flex: 1;
	}
	.pname {
		font-weight: 900;
		font-size: 15px;
	}
	.psub {
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.prow {
		display: flex;
		align-items: baseline;
		gap: 9px;
		margin-top: 2px;
	}
	.prow.tight {
		margin: 0;
	}
	.price {
		font-family: var(--font-display);
		font-size: 30px;
	}
	.price.sm {
		font-size: 20px;
	}
	.mrp {
		font-size: 13px;
		font-weight: 700;
		color: var(--ink-3);
		text-decoration: line-through;
	}
	.permo {
		font-size: 11px;
		font-weight: 900;
		color: var(--green-deep);
	}
	.pnote {
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-2);
	}
	.cmp {
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		overflow: hidden;
	}
	.cmp-head,
	.cmp-row {
		display: grid;
		grid-template-columns: 1.6fr 1fr 1fr;
	}
	.cmp-head {
		background: var(--bg-1);
		border-bottom: var(--bw) solid var(--line);
		font-size: 10.5px;
		font-weight: 900;
	}
	.cmp-head > div {
		padding: 9px 12px;
		text-align: center;
	}
	.cmp-head > div:first-child {
		text-align: left;
	}
	.cmp-head .prem,
	.cmp-cell.prem {
		background: var(--orange-tint);
	}
	.cmp-row {
		border-bottom: 1px solid var(--line-soft);
	}
	.cmp-row:last-child {
		border-bottom: none;
	}
	.cmp-label {
		padding: 9px 12px;
		font-size: 12px;
		font-weight: 700;
	}
	.cmp-cell {
		padding: 9px 6px;
		text-align: center;
		font-size: 11px;
		border-left: 1px solid var(--line-soft);
	}
	.tick {
		color: var(--green-deep);
		font-weight: 900;
	}
	.dash {
		color: var(--ink-3);
	}
	.strong {
		font-weight: 900;
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
	.trust {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.keep {
		margin: 0;
		text-align: center;
		font-size: 11px;
		color: var(--ink-2);
	}
</style>
