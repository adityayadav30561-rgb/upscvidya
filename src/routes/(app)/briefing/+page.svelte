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
	import { capture } from '$lib/analytics';
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
			if (!res.already) capture('ca_quiz_completed', { date: item.date });
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
		<div class="bhead-row">
			<h1 class="stencil">Daily Briefing</h1>
			<button class="monthly-btn" onclick={() => goto('/briefing/monthly')}>
				<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><rect x="3" y="4" width="14" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M3 8 H17 M7 2 V5 M13 2 V5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
				Monthly CA
			</button>
		</div>
		{#if brief && !brief.locked}
			<p class="bsub">{prettyDate(date)} · {readCount} of {brief.items.length} read</p>
		{:else}
			<p class="bsub">{prettyDate(date)}</p>
		{/if}
	</header>

	{#if brief && !brief.locked && brief.items.length > 0}
		{@const totalQ = brief.items.reduce((n, i) => n + i.quiz.length, 0)}
		{@const doneQ = brief.items.reduce((n, i) => n + i.quiz_answered, 0)}
		<div class="hero">
			<div class="hero-stat"><div class="hs-v">{brief.items.length}</div><div class="hs-k">BRIEFS</div></div>
			<div class="hero-stat"><div class="hs-v">{totalQ}</div><div class="hs-k">MCQs</div></div>
			<div class="hero-stat"><div class="hs-v">{doneQ}/{totalQ}</div><div class="hs-k">DONE</div></div>
			<div class="hero-stat"><div class="hs-v">~{Math.max(2, brief.items.length * 2)}m</div><div class="hs-k">READ</div></div>
		</div>
	{/if}

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
		<!-- 3e: the dispatch hasn't landed — a waiting sheet, not a grey box -->
		<div class="nodispatch">
			<div class="nd-clock">07</div>
			<div class="nd-title stencil">Dispatch not in yet</div>
			<p class="nd-body">
				{#if date === istToday()}
					Today's briefing lands at <strong>07:00 IST</strong> after review. Read it to bank
					<strong>+30 XP</strong> and hold your streak.
				{:else}
					No dispatch was filed for this date. Briefings land at <strong>07:00 IST</strong> after review.
				{/if}
			</p>
			<button class="nd-btn" onclick={() => pickDate(strip[1])}>Read yesterday's dispatch</button>
		</div>
		<button class="dossier-row" onclick={() => goto('/briefing/monthly')}>
			<span class="row-ico brassico">CA</span>
			<span class="row-body">
				<span class="row-t">Monthly CA — {date.slice(0, 7)}</span>
				<span class="row-s">Every dispatch this month, as one practice set</span>
			</span>
			<span class="chev"></span>
		</button>
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
		font-size: 30px;
	}
	.bhead-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
	}
	/* brass pressed tab — the month's compilation is the reward route */
	.monthly-btn {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #3b2f11;
		background: var(--grad-gold);
		border: var(--bw) solid var(--gold-edge);
		border-radius: 8px;
		padding: 7px 11px;
		cursor: pointer;
		box-shadow: 0 3px 0 var(--gold-edge), inset 0 1px 0 rgba(255, 255, 255, 0.6);
		transition:
			transform var(--t-fast) var(--ease),
			box-shadow var(--t-fast) var(--ease);
	}
	.monthly-btn:active {
		transform: translateY(2px);
		box-shadow: 0 1px 0 var(--gold-edge), inset 0 1px 0 rgba(255, 255, 255, 0.6);
	}
	.bsub {
		margin: 3px 0 0;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.hero {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
		background: var(--grad-plate);
		border: var(--bw) solid var(--khaki);
		border-radius: var(--r-xl);
		box-shadow: 0 3px 0 var(--edge), var(--emboss);
		padding: 12px;
	}
	.hero-stat {
		text-align: center;
	}
	.hs-v {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 18px;
		line-height: 1;
		color: var(--ink-1);
	}
	.hs-k {
		font-size: 8px;
		font-weight: 700;
		color: var(--ink-3);
		letter-spacing: 0.14em;
		margin-top: 3px;
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
	/* each day is a filing tab; the selected one is stamped dark */
	.day {
		flex: none;
		width: 52px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		background: linear-gradient(#fdf8ea, #efe6cd);
		border: var(--bw) solid var(--line-soft);
		border-radius: 10px;
		padding: 8px 0;
		cursor: pointer;
		font-family: var(--font-ui);
		box-shadow: 0 3px 0 var(--edge);
		transition:
			transform var(--t-fast) var(--ease),
			box-shadow var(--t-fast) var(--ease);
	}
	.day:active {
		transform: translateY(2px);
		box-shadow: 0 1px 0 var(--edge);
	}
	.day.on {
		background: linear-gradient(#3d4429, #2c3120);
		border-color: #21260f;
		box-shadow: 0 3px 0 #21260f;
	}
	.d-name {
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--ink-3);
	}
	.d-num {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 18px;
		line-height: 1;
		color: var(--ink-2);
		margin-top: 2px;
	}
	.day.on .d-name {
		color: var(--gold-hi);
	}
	.day.on .d-num {
		color: #f2ecd6;
	}
	.cats {
		display: flex;
		gap: 7px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.cat {
		flex: none;
		font-family: var(--font-cond);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		background: linear-gradient(#f6efd9, #e6ddbf);
		border: var(--bw) solid var(--line-soft);
		border-radius: 20px;
		padding: 6px 11px;
		cursor: pointer;
		color: var(--ink-2);
		box-shadow: 0 2px 0 var(--edge);
	}
	.cat.on {
		color: #fff;
		background: var(--grad-olive);
		border-color: var(--green-edge);
		box-shadow: 0 2px 0 var(--green-edge);
	}
	.item {
		background: var(--grad-plate);
		border: var(--bw) solid var(--khaki);
		border-radius: var(--r-xl);
		box-shadow:
			0 4px 0 var(--edge),
			0 12px 22px rgba(60, 50, 25, 0.16),
			var(--emboss);
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
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 9px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		background: var(--khaki);
		color: var(--ink-inverse);
		border-radius: 4px;
		box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.25);
		padding: 3px 8px;
	}
	.src {
		font-family: var(--font-cond);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.i-head {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
		line-height: 1.35;
	}
	.i-sum {
		margin: 0;
		font-family: var(--font-read);
		font-size: 14px;
		line-height: 1.6;
		color: var(--ink-2);
	}
	/* the exam angle is the field note — recessed, brass spine */
	.angle {
		font-size: 12px;
		line-height: 1.5;
		background: var(--bg-1);
		border-left: 4px solid var(--gold-lo);
		border-radius: var(--r-md);
		box-shadow: var(--recess-in);
		padding: 10px 12px;
	}
	.chips {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.tchip {
		font-family: var(--font-cond);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		background: #e6ddbf;
		color: var(--ink-1);
		border: 1px solid var(--line-soft);
		border-radius: 5px;
		padding: 3px 8px;
		text-decoration: none;
	}
	.i-actions {
		display: flex;
		gap: 8px;
		margin-top: 2px;
	}
	.mini,
	.mark {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 11.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		border: none;
		border-radius: var(--r-md);
		padding: 9px 14px;
		min-height: 40px;
		cursor: pointer;
		transition:
			transform var(--t-fast) var(--ease),
			box-shadow var(--t-fast) var(--ease);
	}
	.mini:active,
	.mark:active {
		transform: translateY(2px);
	}
	.mini {
		background: var(--grad-rust);
		color: #fff;
		box-shadow: 0 3px 0 var(--orange-edge), inset 0 1px 0 rgba(255, 255, 255, 0.35);
	}
	.mini:active {
		box-shadow: 0 1px 0 var(--orange-edge), inset 0 1px 0 rgba(255, 255, 255, 0.35);
	}
	.mark {
		background: linear-gradient(#f6efd9, #e6ddbf);
		border: var(--bw) solid var(--line-soft);
		color: var(--ink-2);
		box-shadow: 0 3px 0 var(--edge);
	}
	.mark:active {
		box-shadow: 0 1px 0 var(--edge);
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
		font-weight: 800;
		font-size: 12px;
		letter-spacing: var(--track-display);
		text-transform: uppercase;
	}
	.q-count {
		font-family: var(--font-cond);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
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
		background: var(--bg-1);
		border-left: 4px solid var(--green-deep);
		border-radius: var(--r-md);
		box-shadow: var(--recess-in);
		padding: 10px 12px;
	}
	.exp-label {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 10px;
		letter-spacing: 0.16em;
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
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 12px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #fff;
		border: none;
		border-radius: var(--r-md);
		padding: 9px 16px;
		min-height: 40px;
		cursor: pointer;
		transition:
			transform var(--t-fast) var(--ease),
			box-shadow var(--t-fast) var(--ease);
	}
	.qcheck:not(:disabled):active,
	.qnext:active {
		transform: translateY(2px);
	}
	.qcheck {
		background: var(--grad-rust);
		box-shadow: 0 3px 0 var(--orange-edge), inset 0 1px 0 rgba(255, 255, 255, 0.35);
	}
	.qcheck:not(:disabled):active {
		box-shadow: 0 1px 0 var(--orange-edge), inset 0 1px 0 rgba(255, 255, 255, 0.35);
	}
	.qcheck:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.qnext {
		background: var(--grad-olive);
		box-shadow: 0 3px 0 var(--green-edge), inset 0 1px 0 rgba(255, 255, 255, 0.4);
	}
	.qnext:active {
		box-shadow: 0 1px 0 var(--green-edge), inset 0 1px 0 rgba(255, 255, 255, 0.4);
	}
	.q-note {
		margin: 0;
		font-size: 10.5px;
		font-weight: 500;
		color: var(--ink-3);
	}
	.paywall {
		background: var(--grad-plate);
		border: var(--bw) solid var(--gold-edge);
		border-radius: var(--r-xl);
		box-shadow: 0 4px 0 #cbb079, 0 12px 22px rgba(60, 50, 25, 0.18), var(--emboss);
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
		font-weight: 800;
		font-size: 17px;
		letter-spacing: var(--track-display);
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
	/* ── 3e: dispatch hasn't landed ───────────────────────────────── */
	.nodispatch {
		background: var(--grad-plate);
		border: var(--bw) solid var(--khaki);
		border-radius: var(--r-xl);
		box-shadow:
			0 4px 0 var(--edge),
			0 12px 22px rgba(60, 50, 25, 0.18),
			var(--emboss);
		padding: 20px 18px;
		text-align: center;
	}
	/* the hour the dispatch is due, cast as a dial */
	.nd-clock {
		width: 60px;
		height: 60px;
		margin: 0 auto;
		border-radius: 50%;
		background: linear-gradient(#e4dbbd, #cfc4a0);
		border: 2px solid var(--ink-3);
		box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.5), 0 3px 0 var(--line-soft);
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 20px;
		color: var(--ink-3);
	}
	.nd-title {
		margin-top: 12px;
		font-size: 18px;
		letter-spacing: 0.09em;
	}
	.nd-body {
		margin: 5px 0 0;
		font-size: 13px;
		line-height: 1.5;
		font-weight: 500;
		color: var(--ink-3);
	}
	.nd-btn {
		width: 100%;
		margin-top: 14px;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 12px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-2);
		background: linear-gradient(#f6efd9, #e6ddbf);
		border: var(--bw) solid var(--line-soft);
		border-radius: 12px;
		padding: 12px 0;
		cursor: pointer;
		box-shadow: 0 4px 0 var(--edge);
		transition:
			transform var(--t-fast) var(--ease),
			box-shadow var(--t-fast) var(--ease);
	}
	.nd-btn:active {
		transform: translateY(2px);
		box-shadow: 0 2px 0 var(--edge);
	}
	/* brass icon tile on the monthly-CA row (beats the global .row-ico) */
	.dossier-row .brassico {
		background: var(--grad-gold);
		border-color: var(--gold-edge);
		color: #3b2f11;
	}
</style>
