<script lang="ts">
	/* Admin Validation Queue (Screen 16). Separate route with its own auth
	   check — deliberately not reachable from the student app's nav. */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		fetchQueue,
		approveCa,
		rejectCa,
		rejectQuestion,
		publishQuestion,
		batchApprove,
		lowRiskIds,
		BATCH_CONFIDENCE,
		type AdminQueue,
		type QueueCaItem,
		type QueueMcq
	} from '$lib/ca';
	import { showToast } from '$lib/toast.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import Button from '$lib/components/Button.svelte';

	let queue = $state<AdminQueue | null>(null);
	let loaded = $state(false);
	let denied = $state(false);
	let tab = $state<'ca' | 'mcq' | 'flagged'>('ca');
	let busy = $state(false);

	/* inline edits keyed by item id */
	let edits = $state<Record<string, { headline: string; summary: string }>>({});
	let openItem = $state<string | null>(null);

	onMount(load);

	async function load() {
		try {
			queue = await fetchQueue();
			denied = false;
			// seed inline-edit buffers HERE — mutating $state during render is
			// a Svelte 5 error (state_unsafe_mutation) that kills the branch
			const next: Record<string, { headline: string; summary: string }> = {};
			for (const item of queue.ca) {
				next[item.id] = edits[item.id] ?? { headline: item.headline, summary: item.summary };
			}
			edits = next;
		} catch (err) {
			const msg = err instanceof Error ? err.message : '';
			denied = /admin/i.test(msg);
			queue = null;
		}
		loaded = true;
	}

	async function approve(item: QueueCaItem, withQuiz: boolean) {
		if (busy) return;
		busy = true;
		try {
			const e = edits[item.id];
			const res = await approveCa(item.id, {
				with_quiz: withQuiz,
				headline: e?.headline,
				summary: e?.summary
			});
			showToast(
				res.scheduled
					? `Scheduled for ${res.publish_date} 07:00 · ${res.questions_published} questions live`
					: `Published · ${res.questions_published} questions live`,
				'success'
			);
			await load();
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Approve failed', 'error');
		} finally {
			busy = false;
		}
	}

	async function reject(item: QueueCaItem) {
		if (busy) return;
		busy = true;
		try {
			await rejectCa(item.id);
			showToast('Rejected', 'info');
			await load();
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Reject failed', 'error');
		} finally {
			busy = false;
		}
	}

	async function approveMcq(q: QueueMcq) {
		if (busy) return;
		busy = true;
		try {
			await publishQuestion(q.id);
			showToast('Question live', 'success');
			await load();
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Publish failed', 'error');
		} finally {
			busy = false;
		}
	}

	async function dropMcq(q: QueueMcq) {
		if (busy) return;
		busy = true;
		try {
			await rejectQuestion(q.id);
			showToast('Question retired', 'info');
			await load();
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Reject failed', 'error');
		} finally {
			busy = false;
		}
	}

	const lowRisk = $derived(queue ? lowRiskIds(queue.ca) : []);

	async function batch() {
		if (busy || lowRisk.length === 0) return;
		busy = true;
		try {
			const res = await batchApprove(lowRisk);
			showToast(`${res.approved} approved${res.skipped.length ? `, ${res.skipped.length} skipped` : ''}`, 'success');
			await load();
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Batch failed', 'error');
		} finally {
			busy = false;
		}
	}

	const today = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
</script>

<svelte:head><title>Validation Queue — UPSCVidya Admin</title></svelte:head>

<div class="admin">
	<header class="ahead">
		<div class="atop">
			<span class="badge">ADMIN</span>
			<h1>Validation queue</h1>
		</div>
		{#if queue}
			<p class="asub">
				{today} · {queue.counts.ca + queue.counts.mcq} pending
				{#if queue.counts.flagged > 0}· {queue.counts.flagged} flagged{/if}
			</p>
		{/if}
	</header>

	{#if !loaded}
		<Skeleton height="90px" radius="var(--r-lg)" />
		<Skeleton height="90px" radius="var(--r-lg)" />
	{:else if denied}
		<div class="denied">
			<div class="d-title">Admins only</div>
			<p>This route is separate from the student app and requires an admin account.</p>
			<Button variant="secondary" onclick={() => goto('/')}>Back to Base Camp</Button>
		</div>
	{:else if !queue}
		<div class="denied">
			<div class="d-title">Queue unavailable</div>
			<Button variant="secondary" onclick={load}>Retry</Button>
		</div>
	{:else}
		<div class="tabs">
			<button class="tab" class:on={tab === 'ca'} onclick={() => (tab = 'ca')}>CA · {queue.counts.ca}</button>
			<button class="tab" class:on={tab === 'mcq'} onclick={() => (tab = 'mcq')}>MCQ · {queue.counts.mcq}</button>
			<button class="tab" class:on={tab === 'flagged'} onclick={() => (tab = 'flagged')}>
				FLAGGED · {queue.counts.flagged}
			</button>
		</div>

		{#if tab === 'ca'}
			{#if lowRisk.length > 0}
				<div class="batch">
					<span>{lowRisk.length} low-risk item{lowRisk.length === 1 ? '' : 's'} (score ≥{BATCH_CONFIDENCE})</span>
					<button class="batch-btn" disabled={busy} onclick={batch}>Batch approve</button>
				</div>
			{/if}

			{#each queue.ca as item (item.id)}
				{@const e = edits[item.id] ?? { headline: item.headline, summary: item.summary }}
				<div class="card">
					<div class="c-top">
						<span class="kind">CA DRAFT</span>
						{#if item.category}<span class="meta">{item.category}</span>{/if}
						<span class="conf" class:low={item.confidence < 0.7}>confidence {item.confidence.toFixed(2)}</span>
					</div>

					{#if item.dupe_score >= 0.7}
						<div class="warn">⚠ {(item.dupe_score * 100).toFixed(0)}% similar to a recent item — check before publishing.</div>
					{/if}
					{#if item.confidence < 0.7}
						<div class="warn low">Low confidence — verify the summary against the source before approving.</div>
					{/if}

					<input class="edit-head" value={e.headline} oninput={(ev) => (edits = { ...edits, [item.id]: { ...e, headline: ev.currentTarget.value } })} aria-label="headline" />
					<textarea class="edit-sum" rows="4" value={e.summary} oninput={(ev) => (edits = { ...edits, [item.id]: { ...e, summary: ev.currentTarget.value } })} aria-label="summary"></textarea>

					<div class="chips">
						{#each item.linked_topics as t (t)}<span class="tchip">{t}</span>{/each}
						{#if item.source_name}<span class="srcchip">{item.source_name}</span>{/if}
					</div>

					{#if item.questions.length}
						<button class="acc" onclick={() => (openItem = openItem === item.id ? null : item.id)}>
							{item.questions.length} draft question{item.questions.length === 1 ? '' : 's'}
							{openItem === item.id ? '▲' : '▼'}
						</button>
						{#if openItem === item.id}
							<div class="qlist">
								{#each item.questions as q (q.id)}
									<div class="q">
										<div class="q-stem">{q.stem}</div>
										<ol class="q-opts">
											{#each q.options as o, i (i)}
												<li class:right={i === q.answer_index}>{o}</li>
											{/each}
										</ol>
										<div class="q-exp">{q.explanation}</div>
									</div>
								{/each}
							</div>
						{/if}
					{:else}
						<div class="noq">No draft questions — approving publishes the item alone.</div>
					{/if}

					<div class="actions">
						<button class="act ok" disabled={busy} onclick={() => approve(item, true)}>Approve</button>
						{#if item.questions.length}
							<button class="act alt" disabled={busy} onclick={() => approve(item, false)}>Approve without quiz</button>
						{/if}
						<button class="act no" disabled={busy} onclick={() => reject(item)}>Reject</button>
					</div>
				</div>
			{/each}
			{#if queue.ca.length === 0}
				<div class="clear">Queue cleared — nothing waiting on CA review.</div>
			{/if}
		{:else}
			{@const list = tab === 'flagged' ? queue.flagged : queue.mcq}
			{#each list as q (q.id)}
				<div class="card">
					<div class="c-top">
						<span class="kind">MCQ DRAFT</span>
						<span class="meta">{q.topic_title} · Tier {q.tier}</span>
						{#if q.dupe_of}<span class="dupe">⚠ {(q.dupe_score * 100).toFixed(0)}% DUPE</span>{/if}
					</div>
					{#if q.dupe_of}
						<div class="warn">Near-duplicate of {q.dupe_of} — same stem shape. Keep both, or reject.</div>
					{/if}
					<div class="q-stem">{q.stem}</div>
					<ol class="q-opts">
						{#each q.options as o, i (i)}<li class:right={i === q.answer_index}>{o}</li>{/each}
					</ol>
					<div class="q-exp">{q.explanation}</div>
					<div class="actions">
						<button class="act ok" disabled={busy} onclick={() => approveMcq(q)}>Publish</button>
						<button class="act no" disabled={busy} onclick={() => dropMcq(q)}>Reject</button>
					</div>
				</div>
			{/each}
			{#if list.length === 0}
				<div class="clear">Nothing here.</div>
			{/if}
		{/if}
	{/if}
</div>

<style>
	.admin {
		max-width: 560px;
		margin: 0 auto;
		padding: 18px 16px 60px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.atop {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.badge {
		font-size: 9px;
		font-weight: 900;
		background: var(--red);
		color: #fff;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-sm);
		padding: 3px 8px;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 20px;
		text-transform: uppercase;
	}
	.asub {
		margin: 4px 0 0;
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.tabs {
		display: flex;
		gap: 6px;
	}
	.tab {
		flex: 1;
		font-family: var(--font-ui);
		font-size: 10.5px;
		font-weight: 900;
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-md);
		padding: 8px 4px;
		cursor: pointer;
		color: var(--ink-3);
	}
	.tab.on {
		background: var(--khaki-tint);
		border-color: var(--khaki-deep);
		color: var(--khaki-deep);
	}
	.batch {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		background: var(--green-tint);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 9px 12px;
		font-size: 11.5px;
		font-weight: 700;
	}
	.batch-btn {
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 11.5px;
		background: var(--green);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 7px 14px;
		cursor: pointer;
	}
	.card {
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 13px;
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.c-top {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.kind {
		font-size: 9px;
		font-weight: 900;
		background: var(--bg-1);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-sm);
		padding: 2px 7px;
	}
	.meta {
		font-size: 10px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.conf {
		margin-left: auto;
		font-size: 10px;
		font-weight: 900;
		color: var(--green-deep);
	}
	.conf.low {
		color: var(--red-deep);
	}
	.dupe {
		margin-left: auto;
		font-size: 9.5px;
		font-weight: 900;
		background: var(--red-tint);
		color: var(--red-deep);
		border: var(--bw) solid var(--red-deep);
		border-radius: var(--r-sm);
		padding: 2px 7px;
	}
	.warn {
		font-size: 11.5px;
		background: var(--red-tint);
		border: var(--bw) solid var(--red-deep);
		border-radius: var(--r-md);
		padding: 8px 11px;
		color: var(--ink-1);
	}
	.warn.low {
		background: var(--khaki-tint);
		border-color: var(--khaki-deep);
	}
	.edit-head,
	.edit-sum {
		font-family: var(--font-ui);
		font-size: 13px;
		background: var(--bg-0);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-md);
		padding: 9px 11px;
		color: var(--ink-1);
		width: 100%;
		box-sizing: border-box;
	}
	.edit-head {
		font-weight: 900;
	}
	.edit-sum {
		font-family: var(--font-read);
		line-height: 1.55;
		resize: vertical;
	}
	.chips {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.tchip,
	.srcchip {
		font-size: 9.5px;
		font-weight: 900;
		border-radius: var(--r-full);
		padding: 2px 8px;
		border: var(--bw) solid var(--khaki-deep);
		background: var(--khaki-tint);
		color: var(--khaki-deep);
	}
	.srcchip {
		border-color: var(--line-soft);
		background: var(--bg-1);
		color: var(--ink-3);
	}
	.acc {
		align-self: flex-start;
		background: none;
		border: none;
		font-family: var(--font-ui);
		font-size: 11.5px;
		font-weight: 900;
		color: var(--blue-deep);
		cursor: pointer;
		padding: 0;
	}
	.qlist {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.q {
		background: var(--bg-raise);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-md);
		padding: 10px;
	}
	.q-stem {
		font-family: var(--font-read);
		font-size: 13px;
		line-height: 1.5;
	}
	.q-opts {
		margin: 8px 0;
		padding-left: 20px;
		font-size: 12px;
	}
	.q-opts li.right {
		font-weight: 900;
		color: var(--green-deep);
	}
	.q-exp {
		font-size: 11.5px;
		color: var(--ink-3);
		line-height: 1.5;
	}
	.noq {
		font-size: 11px;
		color: var(--ink-3);
	}
	.actions {
		display: flex;
		gap: 7px;
		flex-wrap: wrap;
	}
	.act {
		flex: 1;
		min-width: 90px;
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 11.5px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 9px 8px;
		min-height: 40px;
		cursor: pointer;
	}
	.act.ok {
		background: var(--green);
	}
	.act.alt {
		background: var(--bg-1);
	}
	.act.no {
		background: var(--red-tint);
		color: var(--red-deep);
		border-color: var(--red-deep);
	}
	.act:disabled {
		opacity: 0.6;
	}
	.clear,
	.denied {
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-lg);
		padding: 24px;
		text-align: center;
		font-size: 12.5px;
		color: var(--ink-3);
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: center;
	}
	.d-title {
		font-family: var(--font-display);
		font-size: 16px;
		text-transform: uppercase;
		color: var(--ink-1);
	}
</style>
