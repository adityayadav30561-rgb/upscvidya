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
		composeBriefing,
		lowRiskIds,
		BATCH_CONFIDENCE,
		istToday,
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

	/* compose-from-text (manual CA ingestion) */
	let composeOpen = $state(false);
	let composeText = $state('');
	let composeDate = $state(istToday());
	let composing = $state(false);
	async function runCompose() {
		if (composing || !composeText.trim()) return;
		composing = true;
		try {
			const res = await composeBriefing(composeText.trim(), composeDate);
			showToast(`${res.created} draft item${res.created === 1 ? '' : 's'} added to the queue`, 'success');
			composeText = '';
			composeOpen = false;
			tab = 'ca';
			await load();
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Compose failed';
			showToast(msg, 'error');
		} finally {
			composing = false;
		}
	}

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
			<h1 class="stencil">Validation queue</h1>
		</div>
		{#if queue}
			<p class="asub">
				{today} · {queue.counts.ca + queue.counts.mcq} pending
				{#if queue.counts.flagged > 0}· {queue.counts.flagged} flagged{/if}
			</p>
		{/if}
		<span class="rail"></span>
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
		<!-- compose from pasted content → AI drafts briefs + MCQs into the queue -->
		<div class="composer">
			<button class="compose-toggle" onclick={() => (composeOpen = !composeOpen)}>
				<span>✎ Compose briefing from text</span>
				<span class="c-chev">{composeOpen ? '▲' : '▼'}</span>
			</button>
			{#if composeOpen}
				<div class="compose-body">
					<label class="c-label" for="c-date">Briefing date</label>
					<input id="c-date" class="c-date" type="date" bind:value={composeDate} />
					<label class="c-label" for="c-text">Paste today's current-affairs notes</label>
					<textarea
						id="c-text"
						class="c-text"
						rows="7"
						bind:value={composeText}
						placeholder="Paste raw notes — multiple items, one after another. The model turns each into a brief (60-90 words) plus 2-3 MCQs, tagged to Polity topics, and drops them into the queue as drafts for your review."
					></textarea>
					<div class="c-actions">
						<span class="c-hint">Drafts land below for approval — nothing goes live automatically.</span>
						<button class="c-run" disabled={composing || !composeText.trim()} onclick={runCompose}>
							{composing ? 'Drafting…' : 'Draft with AI →'}
						</button>
					</div>
				</div>
			{/if}
		</div>

		<div class="tabrail">
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
	/* ── header: dark olive command band + brass rail ─────────────── */
	.ahead {
		padding: 13px 14px 0;
		border-radius: var(--r-lg);
		background: linear-gradient(#3d4429, #2c3120);
		box-shadow:
			0 4px 0 #21261a,
			0 12px 20px rgba(45, 38, 18, 0.28),
			inset 0 1px 0 rgba(255, 255, 255, 0.16);
		overflow: hidden;
	}
	.rail {
		display: block;
		height: 3px;
		margin: 12px -14px 0;
		background: linear-gradient(90deg, #b5883a, #f0cf82);
	}
	.atop {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.badge {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 9px;
		letter-spacing: 0.16em;
		background: var(--grad-rust);
		color: #fff;
		border-radius: 4px;
		box-shadow: 0 2px 0 var(--orange-edge);
		padding: 4px 8px;
	}
	h1 {
		margin: 0;
		font-size: 20px;
		color: #f2ecd6;
		text-shadow: none;
	}
	.asub {
		margin: 5px 0 0;
		font-family: var(--font-cond);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: #b3b98d;
	}
	/* ── composer: a folder that opens ────────────────────────────── */
	.composer {
		border: var(--bw) solid var(--khaki);
		border-radius: var(--r-xl);
		background: var(--grad-plate);
		box-shadow: 0 3px 0 var(--edge), var(--emboss);
		overflow: hidden;
	}
	.compose-toggle {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: var(--khaki);
		border: none;
		padding: 11px 14px;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 12.5px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-inverse);
		box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.25);
		cursor: pointer;
	}
	.compose-body {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 14px;
	}
	.c-label {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 10px;
		letter-spacing: var(--track-label);
		text-transform: uppercase;
		color: var(--ink-3);
	}
	/* every input is a pressed-in slot */
	.c-date,
	.c-text {
		font-family: var(--font-ui);
		font-size: 13px;
		background: var(--bg-1);
		border: none;
		border-radius: var(--r-md);
		box-shadow: var(--recess-in);
		padding: 10px 12px;
		color: var(--ink-1);
		width: 100%;
		box-sizing: border-box;
	}
	.c-text {
		font-family: var(--font-read);
		line-height: 1.5;
		resize: vertical;
	}
	.c-date {
		align-self: flex-start;
		width: auto;
	}
	.c-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		justify-content: space-between;
	}
	.c-hint {
		font-size: 10.5px;
		color: var(--ink-3);
		flex: 1;
	}
	.c-run {
		flex: none;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 12.5px;
		letter-spacing: var(--track-label);
		text-transform: uppercase;
		background: var(--grad-olive);
		color: #fff;
		border: none;
		border-radius: var(--r-md);
		padding: 10px 16px;
		cursor: pointer;
		box-shadow: 0 3px 0 var(--green-edge), inset 0 1px 0 rgba(255, 255, 255, 0.4);
		transition:
			transform var(--t-fast) var(--ease),
			box-shadow var(--t-fast) var(--ease);
	}
	.c-run:active {
		transform: translateY(2px);
		box-shadow: 0 1px 0 var(--green-edge), inset 0 1px 0 rgba(255, 255, 255, 0.4);
	}
	.c-run:disabled {
		opacity: 0.5;
		transform: none;
		box-shadow: 0 3px 0 var(--green-edge);
	}
	.batch {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		background: var(--grad-plate);
		border: var(--bw) solid var(--khaki);
		border-left: 4px solid var(--green-deep);
		border-radius: var(--r-lg);
		box-shadow: 0 3px 0 var(--edge), var(--emboss);
		padding: 10px 13px;
		font-size: 11.5px;
		font-weight: 500;
	}
	.batch-btn {
		flex: none;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 11.5px;
		letter-spacing: var(--track-label);
		text-transform: uppercase;
		background: var(--grad-olive);
		color: #fff;
		border: none;
		border-radius: var(--r-md);
		padding: 8px 14px;
		cursor: pointer;
		box-shadow: 0 3px 0 var(--green-edge), inset 0 1px 0 rgba(255, 255, 255, 0.4);
	}
	.batch-btn:active {
		transform: translateY(2px);
		box-shadow: 0 1px 0 var(--green-edge), inset 0 1px 0 rgba(255, 255, 255, 0.4);
	}
	.batch-btn:disabled {
		opacity: 0.55;
	}
	/* ── each pending item is a dossier sheet ─────────────────────── */
	.card {
		background: var(--grad-plate);
		border: var(--bw) solid var(--khaki);
		border-radius: var(--r-xl);
		box-shadow:
			0 3px 0 var(--edge),
			0 10px 18px rgba(60, 50, 25, 0.14),
			var(--emboss);
		padding: 14px;
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
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 9px;
		letter-spacing: 0.14em;
		background: var(--khaki);
		color: var(--ink-inverse);
		border-radius: 4px;
		box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.25);
		padding: 3px 8px;
	}
	.meta {
		font-family: var(--font-cond);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.conf {
		margin-left: auto;
		font-family: var(--font-cond);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: var(--ink-1);
		background: #e6ddbf;
		border: 1px solid var(--line-soft);
		border-radius: 5px;
		padding: 3px 8px;
		white-space: nowrap;
	}
	.conf.low {
		color: var(--red);
		background: var(--red-tint);
		border-color: #d8a898;
	}
	.dupe {
		margin-left: auto;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 9.5px;
		letter-spacing: 0.12em;
		background: var(--grad-rust);
		color: #fff;
		border-radius: 4px;
		box-shadow: 0 2px 0 var(--orange-edge);
		padding: 3px 8px;
	}
	/* warnings read as a stamped margin note, not a flat alert box */
	.warn {
		font-size: 11.5px;
		background: var(--red-tint);
		border-left: 4px solid var(--red);
		border-radius: var(--r-md);
		padding: 9px 12px;
		color: var(--ink-1);
	}
	.warn.low {
		background: var(--bg-1);
		border-left-color: var(--khaki);
		box-shadow: var(--recess-in);
	}
	.edit-head,
	.edit-sum {
		font-family: var(--font-ui);
		font-size: 13px;
		background: var(--bg-1);
		border: none;
		border-radius: var(--r-md);
		box-shadow: var(--recess-in);
		padding: 10px 12px;
		color: var(--ink-1);
		width: 100%;
		box-sizing: border-box;
	}
	.edit-head {
		font-weight: 700;
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
		font-family: var(--font-cond);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		border-radius: 5px;
		padding: 3px 8px;
		border: 1px solid var(--line-soft);
		background: #e6ddbf;
		color: var(--ink-1);
	}
	.srcchip {
		background: var(--bg-1);
		color: var(--ink-3);
		box-shadow: var(--recess-in);
		border: none;
	}
	.acc {
		align-self: flex-start;
		background: none;
		border: none;
		font-family: var(--font-display);
		font-size: 11.5px;
		font-weight: 800;
		letter-spacing: var(--track-label);
		text-transform: uppercase;
		color: var(--orange-deep);
		cursor: pointer;
		padding: 0;
	}
	.qlist {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.q {
		background: var(--bg-1);
		border: none;
		border-radius: var(--r-md);
		box-shadow: var(--recess-in);
		padding: 11px 12px;
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
		font-weight: 700;
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
	/* verdict keys: raised, pressable, colour-coded */
	.act {
		flex: 1;
		min-width: 90px;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 11.5px;
		letter-spacing: var(--track-label);
		text-transform: uppercase;
		border: none;
		border-radius: var(--r-md);
		padding: 10px 8px;
		min-height: 42px;
		cursor: pointer;
		transition:
			transform var(--t-fast) var(--ease),
			box-shadow var(--t-fast) var(--ease);
	}
	.act:active {
		transform: translateY(2px);
	}
	.act.ok {
		background: var(--grad-olive);
		color: #fff;
		box-shadow: 0 3px 0 var(--green-edge), inset 0 1px 0 rgba(255, 255, 255, 0.4);
	}
	.act.ok:active {
		box-shadow: 0 1px 0 var(--green-edge), inset 0 1px 0 rgba(255, 255, 255, 0.4);
	}
	.act.alt {
		background: var(--grad-plate);
		color: var(--ink-1);
		border: var(--bw) solid var(--khaki);
		box-shadow: 0 3px 0 var(--edge), var(--emboss);
	}
	.act.alt:active {
		box-shadow: 0 1px 0 var(--edge), var(--emboss);
	}
	.act.no {
		background: var(--grad-rust);
		color: #fff;
		box-shadow: 0 3px 0 var(--orange-edge), inset 0 1px 0 rgba(255, 255, 255, 0.35);
	}
	.act.no:active {
		box-shadow: 0 1px 0 var(--orange-edge), inset 0 1px 0 rgba(255, 255, 255, 0.35);
	}
	.act:disabled {
		opacity: 0.55;
		transform: none;
	}
	.clear,
	.denied {
		background: var(--grad-plate);
		border: var(--bw) solid var(--khaki);
		border-radius: var(--r-xl);
		box-shadow: 0 3px 0 var(--edge), var(--emboss);
		padding: 26px 24px;
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
		font-weight: 800;
		font-size: 16px;
		letter-spacing: var(--track-display);
		text-transform: uppercase;
		color: var(--ink-1);
	}
</style>
