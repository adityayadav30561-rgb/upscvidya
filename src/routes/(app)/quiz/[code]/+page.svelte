<script lang="ts">
	import { onDestroy } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	// respect reduced-motion for the per-question slide
	const qReduced = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	import {
		startQuiz,
		resumeQuiz,
		answerQuiz,
		flagQuiz,
		finishQuiz,
		dotStates,
		firstUnanswered,
		parseStem,
		TIER_LABELS,
		QuizError,
		type QuizStart,
		type QuizSummary,
		type AnswerResult
	} from '$lib/quiz';
	import { stashConquest } from '$lib/map';
	import { UNITS } from '$lib/polity';
	import { showToast } from '$lib/toast.svelte';
	import { capture } from '$lib/analytics';
	import { promptAfterFirstQuiz } from '$lib/push';
	import OptionRow from '$lib/components/OptionRow.svelte';
	import Button from '$lib/components/Button.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import ProgressRing from '$lib/components/ProgressRing.svelte';
	import RankUp from '$lib/components/RankUp.svelte';
	import TerritoryCaptured from '$lib/components/TerritoryCaptured.svelte';
	import type { RankCode } from '$lib/ranks';

	const code = $derived(page.params.code ?? '');
	const unit = $derived(UNITS.find((u) => u.code === code));

	type Phase = 'loading' | 'error' | 'playing' | 'results' | 'review';
	let phase = $state<Phase>('loading');
	let errorMsg = $state('');

	let session = $state<QuizStart | null>(null);
	let current = $state(0);
	let selected = $state<number | null>(null);
	let feedback = $state<AnswerResult | null>(null); // set once the current Q is checked
	let summary = $state<QuizSummary | null>(null);
	let submitting = $state(false);
	let qStart = Date.now();

	/* drill timer */
	let secLeft = $state(0);
	let timer: ReturnType<typeof setInterval> | undefined;
	onDestroy(() => clearInterval(timer));

	const q = $derived(session ? session.questions[current] : null);
	const dots = $derived(session ? dotStates(session.questions, current) : []);

	async function boot() {
		phase = 'loading';
		const sid = page.url.searchParams.get('s');
		try {
			const data = sid ? await resumeQuiz(sid) : await startQuiz(code);
			session = data;
			if (data.status === 'finished') {
				// resumed a finished session → jump to results
				summary = await finishQuiz(data.session_id);
				phase = 'results';
				return;
			}
			if (!sid) {
				// keep session id in the URL so a refresh resumes
				const u = new URL(page.url);
				u.searchParams.set('s', data.session_id);
				goto(`${u.pathname}${u.search}`, { replaceState: true, noScroll: true, keepFocus: true });
			}
			current = firstUnanswered(data.questions);
			hydrateCurrent();
			phase = 'playing';
			startTimerIfDrill();
		} catch (err) {
			if (err instanceof QuizError && err.status === 401) {
				goto('/login');
				return;
			}
			errorMsg =
				err instanceof QuizError ? err.message : 'Could not start the quiz. Check your connection.';
			phase = 'error';
		}
	}

	let booted = false;
	$effect(() => {
		if (booted) return;
		booted = true;
		boot();
	});

	function hydrateCurrent() {
		const cur = session?.questions[current];
		selected = cur?.chosen ?? null;
		feedback =
			cur && cur.chosen !== null && cur.correct_display_index !== undefined
				? {
						qid: cur.qid,
						correct_display_index: cur.correct_display_index,
						is_correct: !!cur.correct,
						explanation: '' // explanations only stream on fresh answers; review has them
					}
				: null;
		qStart = Date.now();
	}

	function startTimerIfDrill() {
		clearInterval(timer);
		if (!session?.timed || !session.per_question_sec) return;
		secLeft = session.per_question_sec;
		timer = setInterval(() => {
			secLeft -= 1;
			if (secLeft <= 0) {
				clearInterval(timer);
				if (!feedback) check(); // auto-submit current selection (or blank)
			}
		}, 1000);
	}

	async function check() {
		if (!session || !q || submitting) return;
		if (selected === null) {
			if (!session.timed) {
				showToast('Pick an option first', 'info');
				return;
			}
		}
		submitting = true;
		clearInterval(timer);
		try {
			const res = await answerQuiz(session.session_id, q.qid, selected ?? -1, Date.now() - qStart);
			feedback = res;
			// reflect into local session state
			q.chosen = selected;
			q.correct = res.is_correct;
			q.correct_display_index = res.correct_display_index;
			if (!res.is_correct) showToast('Added to your revision stack', 'info');
		} catch (err) {
			showToast(err instanceof QuizError ? err.message : 'Answer failed', 'error');
		} finally {
			submitting = false;
		}
	}

	function next() {
		if (!session) return;
		if (current < session.questions.length - 1) {
			current += 1;
			hydrateCurrent();
			startTimerIfDrill();
		} else {
			finish();
		}
	}

	let rankUpTo = $state<RankCode | null>(null);

	/* ---- conquest ceremony inputs (4d) ---- */
	/** longest unbroken run of correct answers in this attempt */
	const bestRun = $derived.by(() => {
		if (!summary) return 0;
		let run = 0;
		let best = 0;
		for (const r of summary.review) {
			if (r.is_correct) best = Math.max(best, ++run);
			else run = 0;
		}
		return best;
	});
	/** this unit's 1-based position inside its sector, and the one after it */
	const sectorUnits = $derived(
		unit ? UNITS.filter((u) => u.region === unit.region).sort((a, b) => a.order - b.order) : []
	);
	const unitIndex = $derived(
		unit ? sectorUnits.findIndex((u) => u.code === unit.code) + 1 || null : null
	);
	const nextFront = $derived.by(() => {
		if (!unit || unitIndex === null) return null;
		const n = sectorUnits[unitIndex]; // unitIndex is 1-based → this is the next one
		return n ? { label: n.label, index: unitIndex + 1, code: n.code } : null;
	});

	async function finish() {
		if (!session || submitting) return;
		submitting = true;
		clearInterval(timer);
		try {
			summary = await finishQuiz(session.session_id);
			if (summary.state === 'conquered' || summary.state === 'gold') stashConquest(summary.code);
			// Prompt 15 analytics: topic quizzes only (drills are not the funnel)
			if (summary.kind === 'topic_quiz') {
				capture('first_quiz_completed', { code: summary.code, score_pct: summary.score_pct });
				if (summary.state === 'conquered' || summary.state === 'gold') {
					capture('topic_conquered', { code: summary.code, gold: summary.gold });
				}
				// the ONLY place the push permission prompt is raised (post-first-quiz)
				promptAfterFirstQuiz();
			}
			// Prompt 09: server-decided celebration + streak feedback
			if (summary.rank_up) rankUpTo = summary.rank_up.to as RankCode;
			if (summary.streak?.counted) {
				showToast(
					summary.streak.freezes_used > 0
						? `Streak saved — ${summary.streak.freezes_used} freeze burned. Day ${summary.streak.current}.`
						: `Streak day ${summary.streak.current} 🔥`,
					'success'
				);
			}
			phase = 'results';
		} catch (err) {
			showToast(err instanceof QuizError ? err.message : 'Could not finish', 'error');
		} finally {
			submitting = false;
		}
	}

	async function toggleFlag() {
		if (!session || !q) return;
		q.flagged = !q.flagged;
		try {
			await flagQuiz(session.session_id, q.qid, q.flagged);
		} catch {
			/* flag is best-effort */
		}
	}

	function optionState(i: number): 'idle' | 'selected' | 'correct' | 'incorrect' {
		if (!feedback) return selected === i ? 'selected' : 'idle';
		if (i === feedback.correct_display_index) return 'correct';
		if (i === selected && !feedback.is_correct) return 'incorrect';
		return 'idle';
	}

	async function retry() {
		clearInterval(timer);
		const u = new URL(page.url);
		u.searchParams.delete('s');
		booted = false;
		summary = null;
		session = null;
		feedback = null;
		selected = null;
		current = 0;
		await goto(`${u.pathname}`, { replaceState: true, noScroll: true });
		boot();
	}

	const parsed = $derived(q ? parseStem(q.stem) : null);
	const drillClock = $derived(`0:${String(secLeft).padStart(2, '0')}`);
</script>

<svelte:head><title>{unit ? `${unit.title} — Quiz` : 'Quiz'} — UPSCVidya</title></svelte:head>

{#if rankUpTo}
	<RankUp
		to={rankUpTo}
		from={(summary?.rank_up?.from ?? null) as RankCode | null}
		onclose={() => (rankUpTo = null)}
	/>
{/if}

<div class="quiz">
	{#if phase === 'loading'}
		<div class="center"><div class="spinner"></div><p>Composing your quiz…</p></div>
	{:else if phase === 'error'}
		<div class="center">
			<h1>Hold position</h1>
			<p>{errorMsg}</p>
			<Button variant="secondary" onclick={() => goto('/map')}>← Back to map</Button>
		</div>
	{:else if phase === 'playing' && session && q}
		<!-- header -->
		<div class="qhead">
			<div class="qrow">
				<button class="icon-btn" aria-label="quit to map" onclick={() => goto('/map')}>
					<svg width="12" height="12" viewBox="0 0 10 10"><path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
				</button>
				<div class="qmeta">
					<div class="qtitle stencil">{unit?.title ?? code}</div>
					<div class="qsub">
						{session.kind === 'drill' ? 'Drill · 20s/question' : 'Topic quiz · untimed · pass ≥70%'}
					</div>
				</div>
				{#if session.timed}
					<span class="clock" class:warn={secLeft <= 5}>{drillClock}</span>
				{:else}
					<span class="count">{current + 1}<span class="of">/{session.questions.length}</span></span>
				{/if}
			</div>
			<div class="dots">
				{#each dots as d, i (i)}
					<span class="dot {d}" class:flag={session.questions[i].flagged}></span>
				{/each}
			</div>
			<span class="rail"></span>
		</div>

		<!-- question (slides in as you advance) -->
		{#key current}
		<div class="qbody" in:fly={{ x: qReduced ? 0 : 22, duration: qReduced ? 0 : 210, easing: cubicOut }}>
			<div class="qtop">
				<span class="tier-tag">TIER {q.tier}</span>
				<button class="flag-btn" class:on={q.flagged} onclick={toggleFlag} aria-pressed={q.flagged}>
					<svg width="11" height="12" viewBox="0 0 12 14"><path d="M2 1 V13 M2 1 H10 L8 4 L10 7 H2" fill={q.flagged ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /></svg>
					FLAG
				</button>
			</div>

			{#if parsed && parsed.statements.length}
				{#if parsed.lead}<div class="lead">{parsed.lead}</div>{/if}
				<div class="statements">
					{#each parsed.statements as s, i (i)}
						<div class="statement"><span class="snum">{i + 1}</span><span class="stext">{s}</span></div>
					{/each}
				</div>
				{#if parsed.tail}<div class="tail">{parsed.tail}</div>{/if}
			{:else}
				<div class="stem">{q.stem}</div>
			{/if}

			<div class="options">
				{#each q.options as opt, i (i)}
					<OptionRow
						state={optionState(i)}
						note={feedback && i === feedback.correct_display_index && !feedback.is_correct
							? 'correct'
							: feedback && i === selected && feedback.is_correct
								? 'your answer'
								: ''}
						onclick={feedback ? undefined : () => (selected = i)}
					>
						{opt}
					</OptionRow>
				{/each}
			</div>

			{#if feedback}
				<div class="explain" class:good={feedback.is_correct}>
					<span class="ex-label">{feedback.is_correct ? 'CORRECT' : 'EXPLANATION'}</span>
					{#if feedback.explanation}
						<p>{feedback.explanation}</p>
					{:else}
						<p>{feedback.is_correct ? 'Well judged.' : 'Review this in your revision stack.'}</p>
					{/if}
				</div>
			{/if}
		</div>
		{/key}

		<!-- footer -->
		<div class="qfoot">
			{#if !feedback}
				<Button variant="primary" disabled={submitting} onclick={check}>Check answer</Button>
			{:else}
				<Button variant="success" disabled={submitting} onclick={next}>
					{current < session.questions.length - 1 ? 'Next question →' : 'See results →'}
				</Button>
			{/if}
		</div>
	{:else if phase === 'results' && summary}
		{@const s = summary}
		<div class="results">
			<!-- 4d: a conquest gets the full ceremony instead of a score card -->
			{#if s.pass && s.kind === 'topic_quiz'}
				<TerritoryCaptured
					title={unit?.label ?? s.code}
					correct={s.correct}
					total={s.total}
					scorePct={s.score_pct}
					xpAwarded={s.xp_awarded}
					gold={s.gold}
					bestRun={bestRun}
					index={unitIndex}
					next={nextFront}
					onAdvance={() => goto(nextFront ? `/topic/${nextFront.code}` : '/map')}
					onReview={() => (phase = 'review')}
				/>
			{/if}
			<div class="score-card" class:won={s.pass} class:goldcard={s.gold} class:secondary={s.pass && s.kind === 'topic_quiz'}>
				{#if s.pass}
					<span class="confetti c1"></span><span class="confetti c2"></span><span class="confetti c3"></span>
				{/if}
				<Chip variant={s.pass ? 'sticker-green' : 'sticker-orange'}>
					{s.gold ? 'GOLD MASTERY' : s.pass ? 'TERRITORY SECURED' : 'HOLD THE LINE'}
				</Chip>
				<ProgressRing value={s.score_pct} size={128} stroke={11} label={s.pass ? 'PASS ≥70%' : 'NEED 70%'} />
				<div class="score-chips">
					<span class="schip">+{s.xp_awarded} XP</span>
					<span class="schip">{s.correct}/{s.total} correct</span>
				</div>
			</div>

			<div class="tier-block">
				<div class="tb-title">Tier breakdown</div>
				{#each s.tiers as t (t.tier)}
					<div class="tb-row">
						<span class="tb-label">{TIER_LABELS[t.tier > 4 ? 4 : t.tier]}</span>
						<div class="tb-track">
							<div
								class="tb-fill"
								class:low={t.correct / t.total < 0.5}
								style:width="{(t.correct / t.total) * 100}%"
							></div>
						</div>
						<span class="tb-num">{t.correct}/{t.total}</span>
					</div>
				{/each}
				{#if !s.pass}
					<p class="tb-hint">Below 70% — revise the misses and retake to conquer.</p>
				{:else if !s.gold}
					<p class="tb-hint">Score ≥90% on a second pass with all tiers for gold mastery.</p>
				{/if}
			</div>

			{#if s.sr_added > 0}
				<div class="sr-card">
					<div class="sr-title">{s.sr_added} wrong {s.sr_added === 1 ? 'answer' : 'answers'} → revision stack</div>
					<div class="sr-sub">First review scheduled for tomorrow.</div>
				</div>
			{/if}

			<div class="rcta">
				<Button variant="secondary" onclick={() => (phase = 'review')}>Review answers</Button>
				{#if s.pass}
					<Button variant="success" onclick={() => goto('/map')}>Back to map →</Button>
				{:else}
					<Button variant="primary" onclick={retry}>Retry quiz</Button>
				{/if}
			</div>
			{#if !s.pass}
				<button class="text-link" onclick={() => goto('/map')}>Back to map</button>
			{/if}
		</div>
	{:else if phase === 'review' && summary}
		<div class="review">
			<div class="qhead rvhead">
				<div class="qrow">
					<button class="icon-btn" aria-label="back to results" onclick={() => (phase = 'results')}>
						<svg width="13" height="13" viewBox="0 0 14 14"><path d="M9 2 L4 7 L9 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
					</button>
					<div class="qmeta">
						<div class="qtitle stencil">Answer review</div>
						<div class="qsub">{unit?.title ?? summary.code} · {summary.correct}/{summary.total}</div>
					</div>
				</div>
				<span class="rail"></span>
			</div>
			{#each summary.review as r (r.qid)}
				<div class="rv-item" class:wrong={r.is_correct === false}>
					<div class="rv-top">
						<span class="rv-badge {r.is_correct ? 'ok' : 'no'}">
							{r.is_correct ? '✓' : '✕'}
						</span>
						<span class="rv-tag">Q{r.index + 1} · {r.is_correct ? 'CORRECT' : 'WRONG'} · TIER {r.tier}</span>
						{#if r.flagged}<span class="rv-flag">⚑</span>{/if}
					</div>
					<div class="rv-stem">{r.stem}</div>
					<div class="rv-opts">
						{#each r.options as opt, i (i)}
							<OptionRow
								state={i === r.correct_display_index
									? r.chosen === i
										? 'correct'
										: 'missed'
									: i === r.chosen
										? 'incorrect'
										: 'idle'}
							>
								{opt}
							</OptionRow>
						{/each}
					</div>
					{#if r.explanation}
						<div class="rv-explain"><span class="ex-label">EXPLANATION</span><p>{r.explanation}</p></div>
					{/if}
					{#if r.is_correct === false}
						<span class="rv-instack">IN REVISION STACK ✓</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.quiz {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-height: 70vh;
	}
	.center {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 14px;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 60px 20px;
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

	/* ── header: dark olive command band + brass rail ─────────────── */
	.qhead {
		display: flex;
		flex-direction: column;
		gap: 9px;
		padding: 12px 13px 0;
		border-radius: var(--r-lg);
		background: linear-gradient(#3d4429, #2c3120);
		box-shadow:
			0 4px 0 #21261a,
			0 12px 20px rgba(45, 38, 18, 0.28),
			inset 0 1px 0 rgba(255, 255, 255, 0.16);
		overflow: hidden;
	}
	.rvhead {
		gap: 12px;
	}
	.rail {
		display: block;
		height: 3px;
		margin: 0 -13px;
		background: linear-gradient(90deg, #b5883a, #f0cf82);
	}
	.qrow {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.icon-btn {
		flex: none;
		width: 32px;
		height: 32px;
		border: 1.5px solid rgba(255, 255, 255, 0.22);
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.3);
		color: #e8e2c8;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
		transition: transform var(--t-fast) var(--ease);
	}
	.icon-btn:active {
		transform: translateY(1px);
	}
	.qmeta {
		flex: 1;
		min-width: 0;
	}
	.qtitle {
		font-size: 14.5px;
		color: #f2ecd6;
		text-shadow: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.qsub {
		font-family: var(--font-cond);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #b3b98d;
	}
	.count {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 18px;
		color: var(--gold-hi);
		line-height: 1;
	}
	.of {
		font-size: 11px;
		color: #97a075;
	}
	.clock {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 15px;
		color: #f5e9c8;
		background: rgba(0, 0, 0, 0.34);
		border: 1.5px solid rgba(255, 255, 255, 0.16);
		border-radius: 6px;
		padding: 4px 10px;
		box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.4);
	}
	.clock.warn {
		color: #ffdccf;
		border-color: var(--red);
		background: rgba(150, 45, 25, 0.5);
		animation: pulse 1s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.6;
		}
	}
	/* answered-question belt, read as ammunition in the band */
	.dots {
		display: flex;
		gap: 3px;
		padding-bottom: 9px;
	}
	.dot {
		flex: 1;
		height: 6px;
		border-radius: 2px;
		background: rgba(0, 0, 0, 0.36);
		position: relative;
	}
	.dot.done-correct {
		background: var(--grad-olive);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
	}
	.dot.done-wrong {
		background: linear-gradient(#a8402f, #7d2a1a);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
	}
	.dot.current {
		background: var(--grad-brass);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
	}
	.dot.flag::after {
		content: '';
		position: absolute;
		top: -3px;
		right: -1px;
		width: 4px;
		height: 4px;
		background: var(--gold-hi);
		border-radius: var(--r-full);
	}

	/* question body: one raised dossier sheet */
	.qbody {
		display: flex;
		flex-direction: column;
		gap: 12px;
		flex: 1;
		padding: 14px 15px 17px;
		border: var(--bw) solid var(--khaki);
		border-radius: var(--r-xl);
		background: var(--grad-plate);
		box-shadow:
			0 3px 0 var(--edge),
			0 10px 18px rgba(60, 50, 25, 0.16),
			var(--emboss);
	}
	.qtop {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.tier-tag {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 10px;
		letter-spacing: 0.14em;
		padding: 3px 8px;
		border-radius: 4px;
		background: var(--khaki);
		color: var(--ink-inverse);
		box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.25);
	}
	.flag-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 10px;
		letter-spacing: 0.12em;
		color: var(--ink-2);
		background: var(--grad-plate);
		border: var(--bw) solid var(--khaki);
		border-radius: 6px;
		padding: 5px 10px;
		cursor: pointer;
		box-shadow: 0 2px 0 var(--edge), var(--emboss);
		transition:
			transform var(--t-fast) var(--ease),
			box-shadow var(--t-fast) var(--ease);
	}
	.flag-btn:active {
		transform: translateY(1px);
		box-shadow: 0 1px 0 var(--edge), var(--emboss);
	}
	.flag-btn.on {
		color: #3b2f11;
		background: var(--grad-gold);
		border-color: var(--gold-edge);
		box-shadow: 0 2px 0 var(--gold-edge), inset 0 1px 0 rgba(255, 255, 255, 0.6);
	}
	.lead {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 11px;
		letter-spacing: var(--track-label);
		color: var(--ink-3);
		text-transform: uppercase;
	}
	.statements {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	/* each statement sits in a pressed-in slot with a brass number tile */
	.statement {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		background: var(--bg-1);
		border-radius: var(--r-md);
		box-shadow: var(--recess-in);
		padding: 11px 13px;
	}
	.snum {
		flex: none;
		width: 20px;
		height: 20px;
		border-radius: 5px;
		background: var(--grad-brass);
		color: #3b2f11;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 11px;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
	}
	.stext {
		font-family: var(--font-read);
		font-size: 14.5px;
		line-height: 1.55;
	}
	.tail {
		font-weight: 700;
		font-size: 14.5px;
		color: var(--ink-1);
	}
	.stem {
		font-family: var(--font-read);
		font-size: 15.5px;
		line-height: 1.6;
		white-space: pre-wrap;
	}
	.options {
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	/* verdict note: a pressed-in margin note, olive when correct */
	.explain {
		background: var(--bg-1);
		border-left: 4px solid var(--khaki);
		border-radius: var(--r-md);
		box-shadow: var(--recess-in);
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.explain.good {
		background: var(--green-tint);
		border-left-color: var(--green-deep);
		box-shadow: none;
	}
	.ex-label {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 10px;
		letter-spacing: 0.16em;
		color: var(--ink-3);
	}
	.explain.good .ex-label {
		color: var(--green-deep);
	}
	.explain p,
	.rv-explain p {
		margin: 0;
		font-family: var(--font-read);
		font-size: 14px;
		line-height: 1.6;
	}
	.qfoot {
		position: sticky;
		bottom: 0;
		padding: 10px 0 4px;
		background: linear-gradient(180deg, transparent, var(--bg-0) 40%);
	}
	.qfoot :global(.btn) {
		width: 100%;
	}

	/* results */
	.results {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.score-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		padding: 24px 20px;
		border: var(--bw) solid var(--khaki);
		border-radius: var(--r-xl);
		background: var(--grad-plate);
		box-shadow:
			0 3px 0 var(--edge),
			0 10px 18px rgba(60, 50, 25, 0.16),
			var(--emboss);
		position: relative;
		overflow: hidden;
	}
	.score-card.won {
		background: linear-gradient(180deg, #e9efd8, var(--bg-2));
		border-color: var(--green-edge);
	}
	.score-card.goldcard {
		background: linear-gradient(180deg, #f7ecc8, var(--bg-2));
		border-color: var(--gold-edge);
		box-shadow:
			0 3px 0 var(--gold-edge),
			0 10px 18px rgba(60, 50, 25, 0.18),
			var(--emboss);
	}
	/* when the 4d ceremony leads, the old score card becomes a quiet appendix */
	.score-card.secondary {
		padding: 16px;
		border-width: var(--bw);
		border-color: var(--line-soft);
		background: var(--grad-plate);
		box-shadow: var(--emboss);
	}
	.score-card.secondary :global(.confetti) {
		display: none;
	}
	.score-chips {
		display: flex;
		gap: 10px;
	}
	.schip {
		font-family: var(--font-cond);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: var(--ink-1);
		background: #e6ddbf;
		border: 1px solid var(--line-soft);
		border-radius: 5px;
		padding: 5px 11px;
		white-space: nowrap;
	}
	.confetti {
		position: absolute;
		width: 9px;
		height: 9px;
		border: 1.5px solid var(--line);
	}
	.c1 {
		top: 16px;
		left: 22px;
		background: var(--orange);
		transform: rotate(15deg);
		animation: confetti 1.4s ease-in-out infinite alternate;
	}
	.c2 {
		top: 30px;
		right: 28px;
		background: var(--blue);
		border-radius: 50%;
		animation: confetti 1.8s ease-in-out infinite alternate-reverse;
	}
	.c3 {
		top: 70px;
		left: 40px;
		background: var(--gold-hi);
		border-radius: 50%;
		animation: confetti 1.6s ease-in-out infinite alternate;
	}
	@keyframes confetti {
		to {
			transform: translateY(6px) rotate(40deg);
		}
	}
	.tier-block {
		display: flex;
		flex-direction: column;
		gap: 8px;
		border: var(--bw) solid var(--khaki);
		border-radius: var(--r-xl);
		padding: 14px 16px;
		background: var(--grad-plate);
		box-shadow: 0 3px 0 var(--edge), var(--emboss);
	}
	.tb-title {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 13px;
		letter-spacing: var(--track-display);
		text-transform: uppercase;
	}
	.tb-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.tb-label {
		flex: none;
		width: 92px;
		font-family: var(--font-cond);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-2);
	}
	.tb-track {
		flex: 1;
		height: 10px;
		border-radius: 5px;
		background: var(--bg-1);
		box-shadow: var(--recess-in);
		overflow: hidden;
	}
	.tb-fill {
		height: 100%;
		background: var(--grad-olive);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
		transition: width var(--t-conquest) var(--ease);
	}
	.tb-fill.low {
		background: var(--grad-rust);
	}
	.tb-num {
		flex: none;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 12px;
	}
	.tb-hint {
		margin: 2px 0 0;
		font-size: 11.5px;
		font-weight: 500;
		color: var(--ink-3);
	}
	.sr-card {
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--grad-plate);
		border: var(--bw) solid var(--khaki);
		border-left: 4px solid var(--orange-deep);
		border-radius: var(--r-lg);
		box-shadow: 0 3px 0 var(--edge), var(--emboss);
		padding: 13px 15px;
	}
	.sr-title {
		font-weight: 700;
		font-size: 13px;
	}
	.sr-sub {
		font-size: 11px;
		color: var(--ink-2);
	}
	.rcta {
		display: flex;
		gap: 12px;
	}
	.rcta :global(.btn) {
		flex: 1;
	}
	.text-link {
		align-self: center;
		background: none;
		border: none;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 12px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-3);
		cursor: pointer;
	}

	/* review */
	.review {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.rv-item {
		border: var(--bw) solid var(--khaki);
		border-radius: var(--r-xl);
		padding: 13px 15px;
		background: var(--grad-plate);
		box-shadow: 0 3px 0 var(--edge), var(--emboss);
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.rv-item.wrong {
		border-color: var(--red);
		box-shadow: 0 3px 0 var(--red-edge), var(--emboss);
	}
	.rv-top {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.rv-badge {
		width: 20px;
		height: 20px;
		border-radius: var(--r-full);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-size: 11px;
		font-weight: 900;
	}
	.rv-badge.ok {
		background: var(--grad-olive);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
	}
	.rv-badge.no {
		background: linear-gradient(#a8402f, #7d2a1a);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
	}
	.rv-tag {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 10px;
		letter-spacing: 0.12em;
		color: var(--ink-3);
	}
	.rv-flag {
		color: var(--gold-lo);
	}
	.rv-stem {
		font-family: var(--font-read);
		font-size: 14px;
		line-height: 1.5;
	}
	.rv-opts {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.rv-explain {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.rv-instack {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 10px;
		letter-spacing: 0.12em;
		color: var(--ink-inverse);
		background: var(--khaki);
		border-radius: 4px;
		box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.25);
		padding: 4px 9px;
		align-self: flex-start;
	}
	@media (prefers-reduced-motion: reduce) {
		.confetti,
		.clock.warn {
			animation: none;
		}
	}
</style>
