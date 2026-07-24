<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { goto, beforeNavigate } from '$app/navigation';
	import {
		fetchTestState,
		submitTest,
		saveProgress,
		paletteStates,
		countPalette,
		formatClock,
		timerWarning,
		type TestState,
		type TestResult
	} from '$lib/test';
	import { REGIONS } from '$lib/polity';
	import { showToast } from '$lib/toast.svelte';
	import { capture } from '$lib/analytics';
	import OptionRow from '$lib/components/OptionRow.svelte';
	import Button from '$lib/components/Button.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import ProgressRing from '$lib/components/ProgressRing.svelte';

	const attemptId = $derived(page.params.attempt ?? '');

	type Phase = 'loading' | 'error' | 'playing' | 'results';
	let phase = $state<Phase>('loading');
	let errorMsg = $state('');

	let paper = $state<TestState | null>(null);
	let result = $state<TestResult | null>(null);
	let current = $state(0);
	let answers = $state<Record<string, number>>({});
	let marked = $state<Record<string, boolean>>({});
	let remaining = $state(0);
	let submitting = $state(false);
	let paletteOpen = $state(false);
	let confirmOpen = $state(false);
	let reviewOpen = $state(false);
	let quitOpen = $state(false);

	// Guard: while a test is IN PROGRESS, block any attempt to leave (bottom nav,
	// back, a link) — pop an abort confirm. Confirming submits + shows the
	// evaluation on this page; only then (phase = results) is navigation free.
	beforeNavigate((nav) => {
		if (phase !== 'playing' || submitting) return; // results/loading: leave freely
		nav.cancel();
		quitOpen = true;
	});

	// native tab-close / refresh warning while a test is running
	$effect(() => {
		if (phase !== 'playing') return;
		const onUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = '';
		};
		window.addEventListener('beforeunload', onUnload);
		return () => window.removeEventListener('beforeunload', onUnload);
	});

	async function abortAndSubmit() {
		await doSubmit(); // → results (evaluation); the guard lifts afterwards
		quitOpen = false;
	}

	let ticker: ReturnType<typeof setInterval> | undefined;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	onDestroy(() => {
		clearInterval(ticker);
		clearTimeout(saveTimer);
	});

	let booted = false;
	$effect(() => {
		if (booted || !attemptId) return;
		booted = true;
		boot();
	});

	async function boot() {
		try {
			const s = await fetchTestState(attemptId);
			paper = s;
			answers = { ...s.answers };
			marked = { ...s.marked };
			remaining = s.remaining_sec;
			if (s.submitted) {
				result = await submitTest(attemptId); // idempotent: returns the stored result
				phase = 'results';
				return;
			}
			// resume at the first unanswered question
			const firstOpen = s.questions.findIndex((q) => answers[q.qid] === undefined);
			current = firstOpen === -1 ? 0 : firstOpen;
			phase = 'playing';
			startTicker();
			if (remaining <= 0) autoSubmit();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Could not open this attempt.';
			phase = 'error';
		}
	}

	function startTicker() {
		clearInterval(ticker);
		ticker = setInterval(() => {
			const prev = remaining;
			remaining = Math.max(0, remaining - 1);
			const warn = timerWarning(remaining, prev);
			if (warn === 'ten') showToast('10 minutes remaining', 'info');
			if (warn === 'two') showToast('2 minutes remaining', 'error');
			if (remaining === 0 && phase === 'playing') autoSubmit();
		}, 1000);
	}

	const q = $derived(paper ? paper.questions[current] : null);
	const pStates = $derived(paper ? paletteStates(paper.questions, answers, marked, current) : []);
	const counts = $derived(countPalette(pStates));

	function persist() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			// palette_state carries the pinned question order for mocks — preserve it
			const palette: Record<string, unknown> = { marked };
			if (paper?.pinned_qids) palette.qids = paper.pinned_qids;
			saveProgress(attemptId, answers, palette).catch(() => {});
		}, 600);
	}

	function choose(i: number) {
		if (!q) return;
		answers = { ...answers, [q.qid]: i };
		persist();
	}

	function clearChoice() {
		if (!q) return;
		const next = { ...answers };
		delete next[q.qid];
		answers = next;
		persist();
	}

	function toggleMark() {
		if (!q) return;
		marked = { ...marked, [q.qid]: !marked[q.qid] };
		persist();
	}

	function go(i: number) {
		if (!paper) return;
		current = Math.max(0, Math.min(paper.questions.length - 1, i));
		paletteOpen = false;
	}

	function markAndNext() {
		toggleMark();
		go(current + 1);
	}

	async function autoSubmit() {
		if (submitting || phase !== 'playing') return;
		showToast("Time's up — submitting", 'error');
		await doSubmit();
	}

	async function doSubmit() {
		if (submitting) return;
		submitting = true;
		clearInterval(ticker);
		clearTimeout(saveTimer);
		try {
			// flush any pending answers before scoring
			const palette: Record<string, unknown> = { marked };
			if (paper?.pinned_qids) palette.qids = paper.pinned_qids;
			await saveProgress(attemptId, answers, palette).catch(() => {});
			result = await submitTest(attemptId);
			if (result.kind === 'mock') {
				capture('mock_submitted', { test_id: result.attempt_id, score: result.score });
			}
			confirmOpen = false;
			phase = 'results';
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Submit failed', 'error');
		} finally {
			submitting = false;
		}
	}

	const regionName = (code: string) => REGIONS.find((r) => r.code === code)?.name ?? code;
	const pct = $derived(result && result.max_score > 0 ? Math.max(0, (result.score / result.max_score) * 100) : 0);
</script>

<svelte:head><title>{paper?.title ?? 'Test'} — UPSCVidya</title></svelte:head>

{#if phase === 'loading'}
	<div class="center"><div class="spinner"></div><p>Opening the paper…</p></div>
{:else if phase === 'error'}
	<div class="center">
		<h1>Hold position</h1>
		<p>{errorMsg}</p>
		<Button variant="secondary" onclick={() => goto('/tests')}>← Test Centre</Button>
	</div>
{:else if phase === 'playing' && paper && q}
	<div class="player">
		<!-- dense exam header -->
		<div class="ehead">
			<div class="etitle">{paper.title}</div>
			<div class="ecount">Q {current + 1} / {paper.questions.length}</div>
			<button class="clock" class:warn={remaining <= 600} class:crit={remaining <= 120} onclick={() => (paletteOpen = true)}>
				{formatClock(remaining)}
			</button>
		</div>
		<div class="ebar"><div class="efill" style:width="{((current + 1) / paper.questions.length) * 100}%"></div></div>

		<!-- question -->
		<div class="qwrap">
			<div class="qmeta">
				<span class="qtier">TIER {q.tier}{q.region ? ` · ${regionName(q.region)}` : ''}</span>
				{#if marked[q.qid]}<span class="qmark">MARKED</span>{/if}
			</div>
			<div class="stem">{q.stem}</div>
			<div class="opts">
				{#each q.options as opt, i (i)}
					<OptionRow state={answers[q.qid] === i ? 'selected' : 'idle'} onclick={() => choose(i)}>
						{opt}
					</OptionRow>
				{/each}
			</div>
			{#if answers[q.qid] !== undefined}
				<button class="clear" onclick={clearChoice}>Clear response</button>
			{/if}
			<p class="nofeedback">No feedback until submit — exam conditions.</p>
		</div>

		<!-- controls -->
		<div class="controls">
			<div class="crow">
				<button class="ctl" disabled={current === 0} onclick={() => go(current - 1)}>← Prev</button>
				<button class="ctl mark" onclick={markAndNext}>Mark + next</button>
				<button class="ctl save" onclick={() => go(current + 1)}>Save + next →</button>
			</div>
			<div class="crow2">
				<button class="link" onclick={() => (paletteOpen = true)}>Question palette</button>
				<button class="link submit" onclick={() => (confirmOpen = true)}>Submit test</button>
			</div>
		</div>
	</div>

	<!-- palette -->
	{#if paletteOpen}
		<div class="pal-backdrop" role="presentation" onclick={() => (paletteOpen = false)}></div>
		<div class="pal" role="dialog" aria-modal="true" aria-label="question palette">
			<div class="pal-head">
				<span class="pal-title">Question palette</span>
				<span class="pal-clock">{formatClock(remaining)}</span>
			</div>
			<div class="pal-legend">
				<span><i class="sw answered"></i>answered {counts.answered}</span>
				<span><i class="sw marked"></i>marked {counts.marked}</span>
				<span><i class="sw unanswered"></i>unanswered {counts.unanswered}</span>
			</div>
			<div class="grid">
				{#each pStates as s, i (i)}
					<button class="cell {s}" onclick={() => go(i)}>{i + 1}</button>
				{/each}
			</div>
			<Button variant="primary" onclick={() => { paletteOpen = false; confirmOpen = true; }}>Submit test</Button>
		</div>
	{/if}

	<!-- submit confirmation -->
	<Modal bind:open={confirmOpen} title="Submit {paper.title}?">
		<p class="conf-line">{formatClock(remaining)} still on the clock — this cannot be undone.</p>
		<div class="conf-grid">
			<div class="conf-cell"><div class="cv">{counts.answered}</div><div class="ck">ANSWERED</div></div>
			<div class="conf-cell"><div class="cv">{counts.marked}</div><div class="ck">MARKED</div></div>
			<div class="conf-cell warn"><div class="cv">{counts.unanswered}</div><div class="ck">UNANSWERED</div></div>
		</div>
		<p class="conf-note">Marked questions still count as answered if an option is saved.</p>
		<div class="conf-cta">
			<Button variant="secondary" onclick={() => (confirmOpen = false)}>Return to test</Button>
			<Button variant="primary" disabled={submitting} onclick={doSubmit}>Submit final answers</Button>
		</div>
	</Modal>

	<Modal bind:open={quitOpen} title="Abort the operation?">
		<p class="conf-line">
			Leaving ends the test. Your answers so far will be submitted and scored — there's no
			dropping back in.
		</p>
		<div class="conf-grid">
			<div class="conf-cell"><div class="cv">{counts.answered}</div><div class="ck">ANSWERED</div></div>
			<div class="conf-cell warn"><div class="cv">{counts.unanswered}</div><div class="ck">UNANSWERED</div></div>
		</div>
		<div class="conf-cta">
			<Button variant="secondary" onclick={() => (quitOpen = false)}>Resume test</Button>
			<Button variant="primary" disabled={submitting} onclick={abortAndSubmit}>Abort &amp; submit</Button>
		</div>
	</Modal>
{:else if phase === 'results' && result}
	{@const r = result}
	<div class="results">
		<div class="score-card">
			<div class="sc-title">{r.title}</div>
			<ProgressRing value={pct} size={116} stroke={10} label="NET" />
			<div class="sc-score">{r.score} <span class="sc-max">/ {r.max_score}</span></div>
			<div class="sc-chips">
				<span class="sc-chip ok">{r.correct} correct</span>
				<span class="sc-chip bad">{r.wrong} wrong</span>
				<span class="sc-chip">{r.skipped} skipped</span>
			</div>
			<div class="sc-marking">
				Marking: +{r.marking.correct} correct · −{r.marking.negative} wrong
				{#if r.wrong > 0}
					· penalty −{Math.round(r.wrong * r.marking.negative * 100) / 100}
				{/if}
			</div>
			{#if r.percentile !== null}
				<div class="sc-pct">{r.percentile}th percentile of all attempts</div>
			{/if}
			{#if r.xp_awarded > 0}<div class="sc-xp">+{r.xp_awarded} XP</div>{/if}
		</div>

		{#if r.regions.length > 0}
			<div class="block">
				<div class="b-title">Region accuracy</div>
				{#each r.regions as g (g.region)}
					<div class="bar-row">
						<span class="bl">{regionName(g.region)}</span>
						<div class="bt"><div class="bf" class:low={g.correct / g.total < 0.5} style:width="{(g.correct / g.total) * 100}%"></div></div>
						<span class="bn">{g.correct}/{g.total}</span>
					</div>
				{/each}
			</div>
		{/if}

		{#if r.tiers.length > 0}
			<div class="block">
				<div class="b-title">Tier accuracy</div>
				{#each r.tiers as t (t.tier)}
					<div class="bar-row">
						<span class="bl">Tier {t.tier}</span>
						<div class="bt"><div class="bf" class:low={t.correct / t.total < 0.5} style:width="{(t.correct / t.total) * 100}%"></div></div>
						<span class="bn">{t.correct}/{t.total}</span>
					</div>
				{/each}
			</div>
		{/if}

		{#if r.weakest_region}
			<button class="weak" onclick={() => goto('/tests')}>
				Weakest sector: <strong>{regionName(r.weakest_region)}</strong> — drill it →
			</button>
		{/if}

		<div class="res-cta">
			<Button variant="secondary" onclick={() => (reviewOpen = !reviewOpen)}>
				{reviewOpen ? 'Hide review' : 'Review answers'}
			</Button>
			<Button variant="success" onclick={() => goto('/tests')}>Test Centre →</Button>
		</div>

		{#if reviewOpen}
			<div class="review">
				{#each r.review as item (item.qid)}
					<div class="rv" class:wrong={!item.is_correct && item.chosen !== null} class:skip={item.chosen === null}>
						<div class="rv-tag">
							Q{item.index + 1} · {item.chosen === null ? 'SKIPPED' : item.is_correct ? 'CORRECT' : 'WRONG'} · TIER {item.tier}
							{#if item.marked}· ⚑{/if}
						</div>
						<div class="rv-stem">{item.stem}</div>
						<div class="rv-opts">
							{#each item.options as opt, i (i)}
								<OptionRow
									state={i === item.correct_index
										? item.chosen === i
											? 'correct'
											: 'missed'
										: i === item.chosen
											? 'incorrect'
											: 'idle'}
								>
									{opt}
								</OptionRow>
							{/each}
						</div>
						{#if item.explanation}
							<div class="rv-exp"><span class="rv-exp-label">EXPLANATION</span><p>{item.explanation}</p></div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.center {
		min-height: 60vh;
		display: flex;
		flex-direction: column;
		gap: 12px;
		align-items: center;
		justify-content: center;
		text-align: center;
	}
	.center h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 22px;
		text-transform: uppercase;
	}
	.center p {
		font-size: 13px;
		color: var(--ink-2);
		max-width: 300px;
	}
	.spinner {
		width: 34px;
		height: 34px;
		border: 3px solid var(--bg-1);
		border-top-color: var(--orange-deep);
		border-radius: var(--r-full);
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* dense exam mode */
	.player {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 76vh;
	}
	.ehead {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.etitle {
		flex: 1;
		font-family: var(--font-display);
		font-size: 13px;
		text-transform: uppercase;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ecount {
		font-size: 11px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.clock {
		font-family: var(--font-display);
		font-size: 15px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 5px 12px;
		cursor: pointer;
		color: var(--ink-1);
	}
	.clock.warn {
		background: var(--orange-tint);
		border-color: var(--orange-deep);
		color: var(--orange-deep);
	}
	.clock.crit {
		background: var(--red-tint);
		border-color: var(--red-deep);
		color: var(--red-deep);
		animation: pulse 1s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.55;
		}
	}
	.ebar {
		height: 5px;
		border: 1.5px solid var(--line);
		border-radius: var(--r-full);
		background: var(--bg-2);
		overflow: hidden;
	}
	.efill {
		height: 100%;
		background: var(--khaki);
	}
	.qwrap {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.qmeta {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.qtier {
		font-size: 10.5px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.qmark {
		font-size: 9.5px;
		font-weight: 900;
		background: var(--blue-tint);
		color: var(--blue-deep);
		border: var(--bw) solid var(--blue-deep);
		border-radius: var(--r-full);
		padding: 2px 8px;
	}
	.stem {
		font-family: var(--font-read);
		font-size: 15px;
		line-height: 1.55;
		white-space: pre-wrap;
	}
	.opts {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.clear {
		align-self: flex-start;
		background: none;
		border: none;
		font-family: var(--font-ui);
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
		cursor: pointer;
		padding: 2px;
	}
	.nofeedback {
		margin: 0;
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
		text-align: center;
	}
	.controls {
		display: flex;
		flex-direction: column;
		gap: 8px;
		position: sticky;
		bottom: 0;
		background: var(--bg-0);
		padding-top: 6px;
	}
	.crow {
		display: flex;
		gap: 8px;
	}
	.ctl {
		flex: 1;
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 12.5px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 11px 6px;
		min-height: 44px;
		cursor: pointer;
		color: var(--ink-1);
	}
	.ctl:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.ctl.mark {
		background: var(--blue-tint);
		flex: 1.2;
	}
	.ctl.save {
		background: var(--orange);
		flex: 1.4;
	}
	.crow2 {
		display: flex;
		justify-content: space-between;
	}
	.link {
		background: none;
		border: none;
		font-family: var(--font-ui);
		font-size: 11.5px;
		font-weight: 700;
		color: var(--ink-3);
		cursor: pointer;
	}
	.link.submit {
		color: var(--red-deep);
		font-weight: 900;
	}

	/* palette */
	.pal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(51, 48, 31, 0.45);
		z-index: 60;
	}
	.pal {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		max-width: 480px;
		margin: 0 auto;
		background: var(--bg-0);
		border: var(--bw-bold) solid var(--line);
		border-bottom: none;
		border-radius: var(--r-xl) var(--r-xl) 0 0;
		padding: 16px 18px 22px;
		z-index: 61;
		max-height: 76vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.pal-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.pal-title {
		font-family: var(--font-display);
		font-size: 15px;
		text-transform: uppercase;
	}
	.pal-clock {
		font-family: var(--font-display);
		font-size: 14px;
	}
	.pal-legend {
		display: flex;
		gap: 12px;
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-2);
		flex-wrap: wrap;
	}
	.pal-legend span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.sw {
		width: 10px;
		height: 10px;
		border: 1.5px solid var(--line);
		border-radius: 2px;
		display: inline-block;
	}
	.sw.answered {
		background: var(--green);
	}
	.sw.marked {
		background: var(--blue);
	}
	.sw.unanswered {
		background: var(--bg-2);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 7px;
	}
	.cell {
		aspect-ratio: 1;
		font-family: var(--font-ui);
		font-size: 11px;
		font-weight: 900;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-sm);
		background: var(--bg-2);
		cursor: pointer;
		color: var(--ink-1);
	}
	.cell.answered {
		background: var(--green);
	}
	.cell.marked {
		background: var(--blue);
		color: #fff;
	}
	.cell.current {
		background: var(--orange);
		border-width: var(--bw-bold);
		box-shadow: var(--shadow-2);
	}

	/* submit confirm */
	.conf-line {
		margin: 0 0 12px;
		font-size: 12.5px;
		color: var(--ink-2);
	}
	.conf-grid {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 10px;
	}
	.conf-cell {
		background: var(--bg-raise);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 10px;
		text-align: center;
	}
	.conf-cell.warn {
		background: var(--red-tint);
		border-color: var(--red-deep);
	}
	.cv {
		font-family: var(--font-display);
		font-size: 18px;
	}
	.ck {
		font-size: 9px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.conf-note {
		margin: 10px 0 14px;
		font-size: 11px;
		color: var(--ink-3);
		text-align: center;
	}
	.conf-cta {
		display: flex;
		gap: 10px;
	}
	.conf-cta :global(.btn) {
		flex: 1;
	}

	/* results */
	.results {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.score-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		background: var(--bg-2);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		padding: 20px;
		box-shadow: var(--shadow-2);
	}
	.sc-title {
		font-family: var(--font-display);
		font-size: 15px;
		text-transform: uppercase;
		text-align: center;
	}
	.sc-score {
		font-family: var(--font-display);
		font-size: 26px;
	}
	.sc-max {
		font-size: 15px;
		color: var(--ink-3);
	}
	.sc-chips {
		display: flex;
		gap: 8px;
	}
	.sc-chip {
		font-size: 10.5px;
		font-weight: 900;
		background: var(--bg-0);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 4px 10px;
	}
	.sc-chip.ok {
		background: var(--green-tint);
	}
	.sc-chip.bad {
		background: var(--red-tint);
		color: var(--red-deep);
	}
	.sc-marking,
	.sc-pct {
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
		text-align: center;
	}
	.sc-xp {
		font-size: 11.5px;
		font-weight: 900;
		background: var(--khaki-tint);
		border: var(--bw) solid var(--khaki-deep);
		border-radius: var(--r-full);
		padding: 4px 12px;
	}
	.block {
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.b-title {
		font-family: var(--font-display);
		font-size: 13px;
		text-transform: uppercase;
	}
	.bar-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.bl {
		flex: none;
		width: 96px;
		font-size: 11px;
		font-weight: 900;
		color: var(--ink-2);
	}
	.bt {
		flex: 1;
		height: 13px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		background: var(--bg-0);
		overflow: hidden;
	}
	.bf {
		height: 100%;
		background: var(--green);
	}
	.bf.low {
		background: var(--orange);
	}
	.bn {
		flex: none;
		font-size: 11px;
		font-weight: 900;
	}
	.weak {
		background: var(--orange-tint);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 12px 14px;
		font-family: var(--font-ui);
		font-size: 12.5px;
		cursor: pointer;
		text-align: left;
		color: var(--ink-1);
	}
	.res-cta {
		display: flex;
		gap: 10px;
	}
	.res-cta :global(.btn) {
		flex: 1;
	}
	.review {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.rv {
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 13px 15px;
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.rv.wrong {
		border-width: var(--bw-bold);
		border-color: var(--red-deep);
	}
	.rv.skip {
		border-style: dashed;
	}
	.rv-tag {
		font-size: 10px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.rv-stem {
		font-family: var(--font-read);
		font-size: 13.5px;
		line-height: 1.5;
	}
	.rv-opts {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.rv-exp-label {
		font-size: 10px;
		font-weight: 900;
		color: var(--ink-3);
		letter-spacing: 0.08em;
	}
	.rv-exp p {
		margin: 4px 0 0;
		font-family: var(--font-read);
		font-size: 13px;
		line-height: 1.6;
		color: var(--ink-2);
	}
	@media (prefers-reduced-motion: reduce) {
		.clock.crit {
			animation: none;
		}
	}
</style>
