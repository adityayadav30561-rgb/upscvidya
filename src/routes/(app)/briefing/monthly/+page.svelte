<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth.svelte';
	import { fetchMonthlyIndex, startMonthly, monthLabel, type MonthlyMonth } from '$lib/ca';
	import { showToast } from '$lib/toast.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	let months = $state<MonthlyMonth[] | null>(null);
	let error = $state('');
	let busy = $state('');

	let booted = false;
	$effect(() => {
		if (booted) return;
		booted = true;
		fetchMonthlyIndex()
			.then((d) => (months = d.months))
			.catch((e) => {
				error = e instanceof Error ? e.message : 'Could not load monthly sets';
				months = [];
			});
	});

	const isPremium = $derived(auth.isPremium);

	async function practise(m: MonthlyMonth) {
		if (busy) return;
		// older months are premium — nudge instead of a dead 403
		if (!m.is_current && !isPremium) {
			goto('/paywall?from=Monthly%20CA');
			return;
		}
		busy = m.month;
		try {
			const res = await startMonthly(m.month);
			goto(`/tests/${res.attempt_id}`);
		} catch (e) {
			if (e instanceof Error && /premium/i.test(e.message)) {
				goto('/paywall?from=Monthly%20CA');
			} else {
				showToast(e instanceof Error ? e.message : 'Could not start practice', 'error');
			}
			busy = '';
		}
	}
</script>

<svelte:head><title>Monthly Current Affairs — UPSCVidya</title></svelte:head>

<div class="screen">
	<header class="sub-head">
		<button class="back" aria-label="back" onclick={() => goto('/briefing')}>
			<svg viewBox="0 0 14 14" width="14" height="14"><path d="M9 2 L4 7 L9 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
		</button>
		<div class="head-text">
			<h1>Monthly CA</h1>
			<span class="sub">Every day's briefing MCQs, compiled per month.</span>
		</div>
	</header>

	{#if months === null}
		<Skeleton height="90px" radius="var(--r-lg)" />
		<Skeleton height="90px" radius="var(--r-lg)" />
	{:else if months.length === 0}
		<div class="empty">
			{error || 'No monthly current-affairs sets yet — they build up as daily briefings publish.'}
		</div>
	{:else}
		<div class="months">
			{#each months as m (m.month)}
				{@const locked = !m.is_current && !isPremium}
				<button class="month" class:locked onclick={() => practise(m)} disabled={busy === m.month}>
					<div class="m-top">
						<span class="m-name">{monthLabel(m.month)}</span>
						{#if m.is_current}
							<span class="tag live">THIS MONTH</span>
						{:else if locked}
							<span class="tag prem">PREMIUM</span>
						{/if}
					</div>
					<div class="m-meta">
						<span>{m.questions} MCQ{m.questions === 1 ? '' : 's'}</span>
						<span>{m.items} brief{m.items === 1 ? '' : 's'}</span>
						{#if m.attempted > 0}<span class="done">{m.attempted} attempted</span>{/if}
					</div>
					<div class="m-bar"><div class="m-fill" style:width="{m.questions ? (m.attempted / m.questions) * 100 : 0}%"></div></div>
					<div class="m-cta">
						{busy === m.month ? 'Opening…' : locked ? 'Unlock to practise →' : `Practise ${m.questions} MCQs →`}
					</div>
				</button>
			{/each}
		</div>
		<p class="foot">Practice set · +1 per correct · no negative marking · revise anytime.</p>
	{/if}
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		gap: 14px;
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
	.sub {
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
		margin-top: 3px;
	}
	.months {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.month {
		display: flex;
		flex-direction: column;
		gap: 8px;
		text-align: left;
		background: var(--bg-2);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		padding: 15px 17px;
		cursor: pointer;
		font-family: var(--font-ui);
		box-shadow: var(--shadow-2);
	}
	.month.locked {
		opacity: 0.72;
		box-shadow: none;
	}
	.month:disabled {
		opacity: 0.6;
	}
	.m-top {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.m-name {
		flex: 1;
		font-family: var(--font-display);
		font-size: 17px;
		text-transform: uppercase;
	}
	.tag {
		font-size: 9px;
		font-weight: 900;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-sm);
		padding: 2px 7px;
		transform: rotate(2deg);
	}
	.tag.live {
		background: var(--green);
	}
	.tag.prem {
		background: var(--khaki-tint);
		color: var(--khaki-deep);
	}
	.m-meta {
		display: flex;
		gap: 12px;
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-2);
	}
	.done {
		color: var(--green-deep);
	}
	.m-bar {
		height: 6px;
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-full);
		background: var(--bg-0);
		overflow: hidden;
	}
	.m-fill {
		height: 100%;
		background: var(--blue);
	}
	.m-cta {
		font-size: 12.5px;
		font-weight: 900;
		color: var(--blue-deep);
	}
	.month.locked .m-cta {
		color: var(--khaki-deep);
	}
	.foot {
		margin: 0;
		text-align: center;
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.empty {
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-lg);
		padding: 22px;
		text-align: center;
		font-size: 12.5px;
		color: var(--ink-3);
	}
</style>
