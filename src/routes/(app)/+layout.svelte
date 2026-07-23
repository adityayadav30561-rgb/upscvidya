<script lang="ts">
	import BottomNav from '$lib/components/BottomNav.svelte';
	import TourGuide from '$lib/components/TourGuide.svelte';
	import { auth } from '$lib/auth.svelte';
	import { monthlyDaysLeft } from '$lib/pay';
	import { startTour, shouldAutoStart } from '$lib/tour.svelte';
	import { goto } from '$app/navigation';

	let { children } = $props();

	// Monthly premium expiry nudge at 7 and 1 days (build book §14.5). Till-exam
	// never nags; free users see nothing here.
	const daysLeft = $derived(auth.user ? monthlyDaysLeft(auth.user) : null);
	const warn = $derived(daysLeft !== null && daysLeft <= 7 && daysLeft >= 0);
	let dismissed = $state(false);

	// Ustad's first-run walkthrough — auto-start once for a freshly-onboarded
	// recruit who hasn't seen it (guarded by users.tour_done + a session flag).
	$effect(() => {
		if (shouldAutoStart(auth.user)) startTour();
	});
</script>

{#if warn && !dismissed}
	<div class="expiry" role="status">
		<span>
			Your monthly Premium ends in <strong>{daysLeft} day{daysLeft === 1 ? '' : 's'}</strong>.
		</span>
		<button class="renew" onclick={() => goto('/paywall?from=Renew%20Premium')}>Renew</button>
		<button class="dismiss" aria-label="dismiss" onclick={() => (dismissed = true)}>✕</button>
	</div>
{/if}

<div class="shell">
	{@render children()}
</div>
<BottomNav />
<TourGuide />

<style>
	.shell {
		max-width: 480px;
		margin: 0 auto;
		padding: 20px 20px 96px; /* clearance for the floating nav (mockup) */
		min-height: 100dvh;
	}
	.expiry {
		max-width: 480px;
		margin: 10px auto 0;
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--orange-tint);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 9px 14px;
		font-size: 12px;
		font-weight: 700;
	}
	.expiry span {
		flex: 1;
	}
	.renew {
		flex: none;
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 11.5px;
		background: var(--orange);
		color: #4d4433;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 6px 14px;
		cursor: pointer;
	}
	.dismiss {
		flex: none;
		background: none;
		border: none;
		color: var(--ink-3);
		font-size: 13px;
		cursor: pointer;
		padding: 2px 4px;
	}
</style>
