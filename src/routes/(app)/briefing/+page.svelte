<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		fetchBriefing,
		answerCa,
		completeBriefing,
		dateStrip,
		stripLabel,
		prettyDate,
		istToday,
		type Briefing,
		type CaItem,
		type CaAnswer
	} from '$lib/ca';
	import { showToast } from '$lib/toast.svelte';
	import OptionRow from '$lib/components/OptionRow.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import Button from '$lib/components/Button.svelte';

	let date = $state(istToday());
	let brief = $state<Briefing | null>(null);
	let loading = $state(true);
	let category = $state<string>('ALL');

	/* per-item quiz state */
	let openQuiz = $state<string | null>(null); // ca_item id
	let qIndex = $state(0);
	let chosen = $state<Record<string, number>>({});
	let verdict = $state<Record<string, CaAnswer>>({});
	let readItems = $state<Set<string>>(new Set());

	const strip = dateStrip(7);

	let booted = false;
	$effect(() => {
		if (booted) return;
		booted = true;
		load(date);
	});

	async function load(d: string) {
		loading = true;
		try {
			brief = await fetchBriefing(d);
			date = brief.date;
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Could not load the briefing', 'error');
			brief = null;
		} finally {
			loading = false;
		}
	}

	function pickDate(d: string) {
		if (d === date) return;
		openQuiz = null;
		load(d);
	}

	const categories = $derived(
		brief ? ['ALL', ...new Set(brief.items.map((i) => i.category).filter(Boolean))] : ['ALL']
	);
	const items = $derived(
		brief ? (category === 'ALL' ? brief.items : brief.items.filter((i) => i.category === category)) : []
	);
	const readCount = $derived(readItems.size);

	function toggleRead(id: string) {
		const next = new Set(readItems);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		readItems = next;
	}

	function startQuiz(item: CaItem) {
		openQuiz = openQuiz === item.id ? null : item.id;
		qIndex = 0;
	}

	async function check(qid: string) {
		const pick = chosen[qid];
		if (pick === undefined || verdict[qid]) return;
		try {
			const res = await answerCa(qid, pick);
			verdict = { ...verdict, [qid]: res };
			if (!res.is_correct) showToast('Rotated into your revision stack', 'info');
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Could not check that', 'error');
		}
	}

	async function finishItemQuiz(item: CaItem) {
		openQuiz = null;
		toggleRead(item.id);
		try {
			const res = await completeBriefing();
			if (!res.already && res.xp_awarded > 0) {
				showToast(`Briefing cleared · +${res.xp_awarded} XP`, 'success');
			}
		} catch {
			/* XP is best-effort */
		}
	}

	function optState(qid: string, i: number) {
		const v = verdict[qid];
		if (!v) return chosen[qid] === i ? 'selected' : 'idle';
		if (i === v.correct_index) return chosen[qid] === i ? 'correct' : 'missed';
		if (i === chosen[qid]) return 'incorrect';
		return 'idle';
	}
</script>

<svelte:head><title>UPSCVidya — Daily Briefing</title></svelte:head>

<div class="brief">
	<header class="bhead">
		<h1>Daily Briefing</h1>
		{#if brief && !brief.locked}
			<p class="bsub">{prettyDate(date)} · {readCount} of {brief.items.length} read</p>
		{:else}
			<p class="bsub">{prettyDate(date)}</p>
		{/if}
	</header>

	<!-- date strip -->
	<div class="strip">
		{#each strip as d (d)}
			{@const l = stripLabel(d)}
			<button class="day" class:on={d === date} class:today={l.today} onclick={() => pickDate(d)}>
				<span class="d-name">{l.today ? 'TODAY' : l.day}</span>
				<span class="d-num">{l.num}</span>
			</button>
		{/each}
	</div>

	{#if loading}
		<Skeleton height="120px" radius="var(--r-lg)" />
		<Skeleton height="120px" radius="var(--r-lg)" />
	{:else if brief?.locked}
		<!-- archive paywall: free tier is today + yesterday -->
		<div class="paywall">
			<div class="pw-mark">🔒</div>
			<div class="pw-title">Archive is premium</div>
			<p>{brief.message}</p>
			<div class="pw-cta">
				<Button variant="secondary" onclick={() => pickDate(istToday())}>Back to today</Button>
				<Button variant="primary" onclick={() => goto('/paywall')}>Unlock archive →</Button>
			</div>
		</div>
	{:else if !brief || brief.items.length === 0}
		<div class="empty">
			No briefing published for this date yet. Items land at 07:00 IST after review.
		</div>
	{:else}
		{#if categories.length > 2}
			<div class="cats">
				{#each categories as c (c)}
					<button class="cat" class:on={category === c} onclick={() => (category = c)}>{c}</button>
				{/each}
			</div>
		{/if}

		{#each items as item (item.id)}
			<article class="item" class:read={readItems.has(item.id)}>
				<div class="i-top">
					<span class="cat-chip">{item.category}</span>
					{#if item.source_name}<span class="src">{item.source_name}</span>{/if}
				</div>
				<h2 class="i-head">{item.headline}</h2>
				<p class="i-sum">{item.summary}</p>

				{#if item.exam_angle}
					<div class="angle"><strong>Exam angle:</strong> {item.exam_angle}</div>
				{/if}

				{#if item.linked_topics.length}
					<div class="chips">
						{#each item.linked_topics as t (t)}
							<a class="tchip" href="/topic/{t}">{t}</a>
						{/each}
					</div>
				{/if}

				<div class="i-actions">
					{#if item.quiz.length}
						<button class="mini" onclick={() => startQuiz(item)}>
							{openQuiz === item.id ? 'Hide quiz' : `Take ${item.quiz.length}Q mini-quiz`}
						</button>
					{/if}
					<button class="mark" onclick={() => toggleRead(item.id)}>
						{readItems.has(item.id) ? 'Read ✓' : 'Mark read'}
					</button>
				</div>

				{#if openQuiz === item.id && item.quiz.length}
					{@const q = item.quiz[qIndex]}
					<div class="quiz">
						<div class="q-head">
							<span class="q-title">Briefing check</span>
							<span class="q-count">Q{qIndex + 1} of {item.quiz.length}</span>
						</div>
						<div class="q-stem">{q.stem}</div>
						<div class="q-opts">
							{#each q.options as opt, i (i)}
								<OptionRow
									state={optState(q.qid, i)}
									onclick={verdict[q.qid] ? undefined : () => (chosen = { ...chosen, [q.qid]: i })}
								>
									{opt}
								</OptionRow>
							{/each}
						</div>
						{#if verdict[q.qid]}
							<div class="q-exp">
								<span class="exp-label">{verdict[q.qid].is_correct ? 'CORRECT' : 'EXPLANATION'}</span>
								<p>{verdict[q.qid].explanation}</p>
							</div>
							{#if qIndex < item.quiz.length - 1}
								<button class="qnext" onclick={() => (qIndex += 1)}>Next question →</button>
							{:else}
								<button class="qnext" onclick={() => finishItemQuiz(item)}>Finish briefing →</button>
							{/if}
						{:else}
							<button class="qcheck" disabled={chosen[q.qid] === undefined} onclick={() => check(q.qid)}>
								Check answer
							</button>
						{/if}
						<p class="q-note">CA questions rotate into your revision stack if missed.</p>
					</div>
				{/if}
			</article>
		{/each}
	{/if}
</div>

<style>
	.brief {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 26px;
		text-transform: uppercase;
	}
	.bsub {
		margin: 2px 0 0;
		font-size: 11.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.strip {
		display: flex;
		gap: 7px;
		overflow-x: auto;
		padding-bottom: 4px;
		scrollbar-width: none;
	}
	.strip::-webkit-scrollbar {
		display: none;
	}
	.day {
		flex: none;
		min-width: 46px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-md);
		padding: 7px 6px;
		cursor: pointer;
		font-family: var(--font-ui);
	}
	.day.on {
		background: var(--blue);
		border-color: var(--line);
	}
	.d-name {
		font-size: 8.5px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.d-num {
		font-family: var(--font-display);
		font-size: 14px;
		color: var(--ink-1);
	}
	.day.on .d-name,
	.day.on .d-num {
		color: #fff;
	}
	.cats {
		display: flex;
		gap: 7px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.cat {
		flex: none;
		font-family: var(--font-ui);
		font-size: 10.5px;
		font-weight: 900;
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-full);
		padding: 5px 11px;
		cursor: pointer;
		color: var(--ink-3);
	}
	.cat.on {
		background: var(--khaki-tint);
		border-color: var(--khaki-deep);
		color: var(--khaki-deep);
	}
	.item {
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 15px;
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.item.read {
		opacity: 0.72;
	}
	.i-top {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.cat-chip {
		font-size: 9px;
		font-weight: 900;
		background: var(--orange-tint);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-sm);
		padding: 2px 8px;
	}
	.src {
		font-size: 10px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.i-head {
		margin: 0;
		font-size: 15px;
		font-weight: 900;
		line-height: 1.35;
	}
	.i-sum {
		margin: 0;
		font-family: var(--font-read);
		font-size: 14px;
		line-height: 1.6;
		color: var(--ink-2);
	}
	.angle {
		font-size: 12px;
		line-height: 1.5;
		background: var(--blue-tint);
		border: var(--bw) solid var(--blue-deep);
		border-radius: var(--r-md);
		padding: 9px 12px;
	}
	.chips {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.tchip {
		font-size: 9.5px;
		font-weight: 900;
		background: var(--khaki-tint);
		color: var(--khaki-deep);
		border: var(--bw) solid var(--khaki-deep);
		border-radius: var(--r-full);
		padding: 2px 8px;
		text-decoration: none;
	}
	.i-actions {
		display: flex;
		gap: 8px;
		margin-top: 2px;
	}
	.mini,
	.mark {
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 11.5px;
		border-radius: var(--r-full);
		padding: 8px 14px;
		min-height: 38px;
		cursor: pointer;
		border: var(--bw) solid var(--line);
	}
	.mini {
		background: var(--orange);
		color: var(--ink-1);
	}
	.mark {
		background: var(--bg-0);
		color: var(--ink-2);
	}
	.quiz {
		border-top: var(--bw) dashed var(--line-soft);
		padding-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.q-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.q-title {
		font-family: var(--font-display);
		font-size: 12px;
		text-transform: uppercase;
	}
	.q-count {
		font-size: 10px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.q-stem {
		font-family: var(--font-read);
		font-size: 13.5px;
		line-height: 1.55;
	}
	.q-opts {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.q-exp {
		background: var(--bg-raise);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-md);
		padding: 10px 12px;
	}
	.exp-label {
		font-size: 9.5px;
		font-weight: 900;
		letter-spacing: 0.08em;
		color: var(--green-deep);
	}
	.q-exp p {
		margin: 4px 0 0;
		font-family: var(--font-read);
		font-size: 12.5px;
		line-height: 1.55;
		color: var(--ink-2);
	}
	.qcheck,
	.qnext {
		align-self: flex-start;
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 12px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 8px 16px;
		min-height: 38px;
		cursor: pointer;
	}
	.qcheck {
		background: var(--orange);
		color: var(--ink-1);
	}
	.qcheck:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.qnext {
		background: var(--green);
		color: var(--ink-1);
	}
	.q-note {
		margin: 0;
		font-size: 10px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.paywall {
		background: var(--khaki-tint);
		border: var(--bw-bold) solid var(--khaki-deep);
		border-radius: var(--r-xl);
		padding: 28px 20px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		text-align: center;
	}
	.pw-mark {
		font-size: 26px;
	}
	.pw-title {
		font-family: var(--font-display);
		font-size: 17px;
		text-transform: uppercase;
	}
	.paywall p {
		margin: 0;
		font-size: 12.5px;
		color: var(--ink-2);
		max-width: 280px;
	}
	.pw-cta {
		display: flex;
		gap: 10px;
		margin-top: 4px;
	}
	.empty {
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-lg);
		padding: 20px;
		text-align: center;
		font-size: 12.5px;
		color: var(--ink-3);
	}
</style>
