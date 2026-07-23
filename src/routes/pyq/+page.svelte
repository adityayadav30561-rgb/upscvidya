<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth.svelte';
	import {
		fetchPyqIndex,
		fetchPyqPaper,
		checkPyq,
		attemptPyqPaper,
		filterQuestions,
		paperProgressLabel,
		recordAnonAnswer,
		shouldNudge,
		type PyqIndex,
		type PyqQuestion,
		type PyqFilter
	} from '$lib/pyq';
	import { showToast } from '$lib/toast.svelte';
	import OptionRow from '$lib/components/OptionRow.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import Button from '$lib/components/Button.svelte';
	import Modal from '$lib/components/Modal.svelte';

	let index = $state<PyqIndex | null>(null);
	let loaded = $state(false);
	let tab = $state<'year' | 'topic'>('year');

	/* drill-down */
	let openKey = $state<{ year?: number; topic?: string } | null>(null);
	let questions = $state<PyqQuestion[]>([]);
	let qLoading = $state(false);
	let filter = $state<PyqFilter>('all');

	/* per-question inline state */
	let chosen = $state<Record<string, number>>({});
	let verdict = $state<Record<string, { correct_index: number; is_correct: boolean; explanation: string }>>({});
	let nudgeOpen = $state(false);

	let booted = false;
	$effect(() => {
		if (booted) return;
		booted = true;
		fetchPyqIndex()
			.then((i) => (index = i))
			.catch(() => {})
			.finally(() => (loaded = true));
	});

	async function openYear(y: number) {
		openKey = { year: y };
		qLoading = true;
		filter = 'all';
		try {
			const res = await fetchPyqPaper({ year: y });
			questions = res.questions;
		} catch {
			questions = [];
		} finally {
			qLoading = false;
		}
	}

	async function openTopic(code: string) {
		openKey = { topic: code };
		qLoading = true;
		filter = 'all';
		try {
			const res = await fetchPyqPaper({ topic: code });
			questions = res.questions;
		} catch {
			questions = [];
		} finally {
			qLoading = false;
		}
	}

	async function check(q: PyqQuestion) {
		const pick = chosen[q.qid];
		if (pick === undefined || verdict[q.qid]) return;
		try {
			const res = await checkPyq(q.qid, pick);
			verdict = { ...verdict, [q.qid]: res };
			if (!res.is_correct && res.recorded) showToast('Added to your revision stack', 'info');
			// soft nudge for logged-out visitors — AFTER the answer is revealed
			if (!auth.isLoggedIn) {
				const n = recordAnonAnswer();
				if (shouldNudge(n, false)) nudgeOpen = true;
			}
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Could not check that', 'error');
		}
	}

	async function fullPaper(y: number) {
		if (!auth.isLoggedIn) {
			nudgeOpen = true;
			return;
		}
		try {
			const res = await attemptPyqPaper(y);
			goto(`/tests/${res.attempt_id}`);
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Could not open the paper', 'error');
		}
	}

	const shown = $derived(filterQuestions(questions, filter));
	const wrongCount = $derived(questions.filter((q) => q.attempted && q.was_correct === false).length);
	const unattemptedCount = $derived(questions.filter((q) => !q.attempted).length);
	const heading = $derived(
		openKey?.year
			? `CAPF AC ${openKey.year} — Polity PYQs`
			: openKey?.topic
				? `${questions[0]?.topic_title ?? openKey.topic} — PYQs`
				: ''
	);

	function optState(q: PyqQuestion, i: number) {
		const v = verdict[q.qid];
		if (!v) return chosen[q.qid] === i ? 'selected' : 'idle';
		if (i === v.correct_index) return chosen[q.qid] === i ? 'correct' : 'missed';
		if (i === chosen[q.qid]) return 'incorrect';
		return 'idle';
	}
</script>

<svelte:head>
	<title>PYQ Vault — free CAPF previous year questions | UPSCVidya</title>
	<meta
		name="description"
		content="Every CAPF Assistant Commandant Polity previous-year question, free. Browse by year or topic, attempt inline with explanations, or take a full past paper as a timed test."
	/>
</svelte:head>

<div class="vault">
	<header class="vhead">
		<div class="vtop">
			<h1>PYQ Vault</h1>
			<span class="free-flag">100% FREE</span>
		</div>
		{#if loaded && index}
			<p class="vsub">{index.total} questions · {index.papers} papers</p>
			{#if index.attempted > 0}
				<p class="vprog">
					You've attempted {index.attempted} · {Math.round((index.correct / index.attempted) * 100)}% correct
				</p>
			{/if}
		{:else}
			<Skeleton width="180px" height="12px" />
		{/if}
	</header>

	{#if !openKey}
		<div class="tabs">
			<button class="tab" class:on={tab === 'year'} onclick={() => (tab = 'year')}>BY YEAR</button>
			<button class="tab" class:on={tab === 'topic'} onclick={() => (tab = 'topic')}>BY TOPIC</button>
		</div>

		{#if !loaded}
			<Skeleton height="86px" radius="var(--r-lg)" />
			<Skeleton height="86px" radius="var(--r-lg)" />
		{:else if !index || index.total === 0}
			<div class="empty">No papers published yet.</div>
		{:else if tab === 'year'}
			<div class="years">
				{#each index.years as y, i (y.key)}
					<button class="year" onclick={() => openYear(y.year)}>
						<div class="y-top">
							<span class="y-num">{y.exam} {y.year}</span>
							{#if i === 0}<span class="latest">LATEST</span>{/if}
						</div>
						<div class="y-meta">{y.count} Q · {y.topic_count} topics</div>
						<div class="y-prog" class:done={y.attempted >= y.count && y.count > 0}>
							{paperProgressLabel(y)}
						</div>
					</button>
				{/each}
			</div>
		{:else}
			<div class="topics">
				{#each index.topics as t (t.code)}
					<button class="topic" onclick={() => openTopic(t.code)}>
						<span class="t-name">{t.title}</span>
						<span class="t-count">{t.count} PYQ{t.count === 1 ? '' : 's'}</span>
					</button>
				{/each}
			</div>
		{/if}
	{:else}
		<!-- paper / topic drill-down -->
		<div class="drill-head">
			<button class="back" onclick={() => (openKey = null)}>← Vault</button>
			<span class="drill-title">{heading}</span>
		</div>
		<p class="drill-sub">{questions.length} questions · attempt inline, no timer</p>

		<div class="filters">
			<button class="fchip" class:on={filter === 'all'} onclick={() => (filter = 'all')}>All {questions.length}</button>
			<button class="fchip" class:on={filter === 'unattempted'} onclick={() => (filter = 'unattempted')}>
				Unattempted {unattemptedCount}
			</button>
			<button class="fchip" class:on={filter === 'wrong'} onclick={() => (filter = 'wrong')}>Wrong {wrongCount}</button>
		</div>

		{#if openKey.year}
			<Button variant="primary" onclick={() => fullPaper(openKey!.year!)}>
				Attempt full paper as test →
			</Button>
		{/if}

		{#if qLoading}
			<Skeleton height="120px" radius="var(--r-lg)" />
			<Skeleton height="120px" radius="var(--r-lg)" />
		{:else}
			{#each shown as q (q.qid)}
				<div class="qcard" class:answered={!!verdict[q.qid]}>
					<div class="q-top">
						<span class="q-tag" class:ok={verdict[q.qid]?.is_correct} class:bad={verdict[q.qid] && !verdict[q.qid].is_correct}>
							Q{q.qno ?? '?'} ·
							{verdict[q.qid] ? (verdict[q.qid].is_correct ? 'CORRECT' : 'WRONG') : q.attempted ? (q.was_correct ? 'CORRECT' : 'WRONG') : 'UNATTEMPTED'}
						</span>
						<a class="q-topic" href="/topic/{q.topic_code}">{q.topic_title}</a>
						{#if q.asked_times > 1}
							<span class="recur">asked {q.asked_times}×</span>
						{/if}
					</div>
					<div class="q-stem">{q.stem}</div>
					<div class="q-opts">
						{#each q.options as opt, i (i)}
							<OptionRow
								state={optState(q, i)}
								onclick={verdict[q.qid] ? undefined : () => (chosen = { ...chosen, [q.qid]: i })}
							>
								{opt}
							</OptionRow>
						{/each}
					</div>
					{#if verdict[q.qid]}
						<div class="q-exp">
							<span class="exp-label">EXPLANATION</span>
							<p>{verdict[q.qid].explanation}</p>
						</div>
					{:else}
						<button class="check" disabled={chosen[q.qid] === undefined} onclick={() => check(q)}>
							Check answer
						</button>
					{/if}
				</div>
			{/each}
			{#if shown.length === 0}
				<div class="empty">Nothing matches that filter.</div>
			{/if}
		{/if}
	{/if}
</div>

<!-- soft signup nudge: never blocks the answer already shown -->
<Modal bind:open={nudgeOpen} title="Save your progress?">
	<p class="nudge-copy">
		You're doing this the hard way — as a guest, nothing is saved. Sign up free to track which PYQs
		you've cleared, feed wrong answers into spaced revision, and attempt full papers as timed tests.
	</p>
	<div class="nudge-cta">
		<Button variant="secondary" onclick={() => (nudgeOpen = false)}>Keep browsing</Button>
		<Button variant="primary" onclick={() => goto('/login')}>Enlist free →</Button>
	</div>
</Modal>

<style>
	.vault {
		max-width: 480px;
		margin: 0 auto;
		padding: 20px 20px 60px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-height: 100dvh;
	}
	.vhead {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.vtop {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 26px;
		text-transform: uppercase;
	}
	.free-flag {
		font-size: 10px;
		font-weight: 900;
		background: var(--green);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-sm);
		padding: 3px 9px;
		transform: rotate(-3deg);
		box-shadow: var(--shadow-2);
	}
	.vsub,
	.vprog {
		margin: 0;
		font-size: 11.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.vprog {
		color: var(--green-deep);
	}
	.tabs {
		display: flex;
		gap: 8px;
		border-bottom: var(--bw) solid var(--line-soft);
	}
	.tab {
		font-family: var(--font-ui);
		font-size: 11.5px;
		font-weight: 900;
		background: none;
		border: none;
		border-bottom: 3px solid transparent;
		padding: 8px 10px;
		cursor: pointer;
		color: var(--ink-3);
	}
	.tab.on {
		color: var(--ink-1);
		border-bottom-color: var(--green-deep);
	}
	.years {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.year {
		display: flex;
		flex-direction: column;
		gap: 4px;
		text-align: left;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 13px 14px;
		cursor: pointer;
		font-family: var(--font-ui);
	}
	.year:hover {
		box-shadow: var(--shadow-2);
		transform: translate(-1px, -1px);
	}
	.y-top {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.y-num {
		font-family: var(--font-display);
		font-size: 15px;
	}
	.latest {
		font-size: 8.5px;
		font-weight: 900;
		background: var(--orange);
		border: 1.5px solid var(--line);
		border-radius: var(--r-sm);
		padding: 1px 6px;
	}
	.y-meta {
		font-size: 10.5px;
		color: var(--ink-3);
	}
	.y-prog {
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-2);
	}
	.y-prog.done {
		color: var(--green-deep);
	}
	.topics {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.topic {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 11px 14px;
		cursor: pointer;
		font-family: var(--font-ui);
		text-align: left;
	}
	.t-name {
		font-weight: 900;
		font-size: 13px;
		color: var(--ink-1);
	}
	.t-count {
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
	}

	/* drill-down */
	.drill-head {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.back {
		background: none;
		border: none;
		font-family: var(--font-ui);
		font-size: 12px;
		font-weight: 700;
		color: var(--ink-3);
		cursor: pointer;
		padding: 0;
	}
	.drill-title {
		font-family: var(--font-display);
		font-size: 14px;
		text-transform: uppercase;
	}
	.drill-sub {
		margin: 0;
		font-size: 11px;
		color: var(--ink-3);
	}
	.filters {
		display: flex;
		gap: 7px;
	}
	.fchip {
		font-family: var(--font-ui);
		font-size: 11px;
		font-weight: 900;
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-full);
		padding: 5px 11px;
		cursor: pointer;
		color: var(--ink-2);
	}
	.fchip.on {
		background: var(--green-tint);
		border-color: var(--line);
		color: var(--ink-1);
	}
	.qcard {
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.q-top {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.q-tag {
		font-size: 9.5px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.q-tag.ok {
		color: var(--green-deep);
	}
	.q-tag.bad {
		color: var(--red-deep);
	}
	.q-topic {
		font-size: 9.5px;
		font-weight: 900;
		background: var(--khaki-tint);
		color: var(--khaki-deep);
		border: var(--bw) solid var(--khaki-deep);
		border-radius: var(--r-full);
		padding: 2px 8px;
		text-decoration: none;
	}
	.recur {
		font-size: 9.5px;
		font-weight: 900;
		background: var(--gold-hi);
		border: 1.5px solid var(--line);
		border-radius: var(--r-full);
		padding: 2px 8px;
	}
	.q-stem {
		font-family: var(--font-read);
		font-size: 14px;
		line-height: 1.55;
		white-space: pre-wrap;
	}
	.q-opts {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.check {
		align-self: flex-start;
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 12.5px;
		background: var(--orange);
		color: var(--ink-1);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 9px 18px;
		min-height: 40px;
		cursor: pointer;
	}
	.check:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.q-exp {
		background: var(--bg-raise);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-md);
		padding: 11px 13px;
	}
	.exp-label {
		font-size: 9.5px;
		font-weight: 900;
		letter-spacing: 0.08em;
		color: var(--green-deep);
	}
	.q-exp p {
		margin: 5px 0 0;
		font-family: var(--font-read);
		font-size: 13px;
		line-height: 1.6;
		color: var(--ink-2);
	}
	.empty {
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-lg);
		padding: 18px;
		text-align: center;
		font-size: 12px;
		color: var(--ink-3);
	}
	.nudge-copy {
		margin: 0 0 14px;
		font-size: 13px;
		line-height: 1.6;
		color: var(--ink-2);
	}
	.nudge-cta {
		display: flex;
		gap: 10px;
	}
	.nudge-cta :global(.btn) {
		flex: 1;
	}
</style>
