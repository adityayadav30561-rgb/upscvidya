<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
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
	import OptionRow from '$lib/components/OptionRow.svelte';
	import Button from '$lib/components/Button.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import ProgressRing from '$lib/components/ProgressRing.svelte';
	import RankUp from '$lib/components/RankUp.svelte';
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

	async function finish() {
		if (!session || submitting) return;
		submitting = true;
		clearInterval(timer);
		try {
			summary = await finishQuiz(session.session_id);
			if (summary.state === 'conquered' || summary.state === 'gold') stashConquest(summary.code);
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
	<RankUp to={rankUpTo} onclose={() => (rankUpTo = null)} />
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
					<div class="qtitle">{unit?.title ?? code}</div>
					<div class="qsub">
						{session.kind === 'drill' ? 'Drill · 20s/question' : 'Topic quiz · untimed · pass ≥70%'}
					</div>
				</div>
				{#if session.timed}
					<span class="clock" class:warn={secLeft <= 5}>⏱ {drillClock}</span>
				{:else}
					<span class="count">{current + 1}<span class="of">/{session.questions.length}</span></span>
				{/if}
			</div>
			<div class="dots">
				{#each dots as d, i (i)}
					<span class="dot {d}" class:flag={session.questions[i].flagged}></span>
				{/each}
			</div>
		</div>

		<!-- question -->
		<div class="qbody">
			<div class="qtop">
				<span class="tier-tag">TIER {q.tier}</span>
				<button class="flag-btn" class:on={q.flagged} onclick={toggleFlag} aria-pressed={q.flagged}>
					<svg width="11" height="12" viewBox="0 0 12 14"><path d="M2 1 V13 M2 1 H10 L8 4 L10 7 H2" fill={q.flagged ? 'var(--blue)' : 'none'} stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /></svg>
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
			<div class="score-card" class:won={s.pass} class:goldcard={s.gold}>
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
			<div class="rvhead">
				<button class="icon-btn" aria-label="back to results" onclick={() => (phase = 'results')}>
					<svg width="13" height="13" viewBox="0 0 14 14"><path d="M9 2 L4 7 L9 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</button>
				<div>
					<div class="qtitle">Answer review</div>
					<div class="qsub">{unit?.title ?? summary.code} · {summary.correct}/{summary.total}</div>
				</div>
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

	/* header */
	.qhead {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.qrow {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.icon-btn {
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
	.qmeta {
		flex: 1;
		min-width: 0;
	}
	.qtitle {
		font-weight: 900;
		font-size: 13px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.qsub {
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.count {
		font-family: var(--font-display);
		font-size: 14px;
	}
	.of {
		font-size: 10px;
		color: var(--ink-3);
	}
	.clock {
		font-family: var(--font-display);
		font-size: 14px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 5px 12px;
	}
	.clock.warn {
		background: var(--red-tint);
		border-color: var(--red-deep);
		color: var(--red-deep);
		animation: pulse 1s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.6;
		}
	}
	.dots {
		display: flex;
		gap: 4px;
	}
	.dot {
		flex: 1;
		height: 7px;
		border-radius: var(--r-full);
		background: var(--bg-2);
		border: 1px solid var(--line-soft);
		position: relative;
	}
	.dot.done-correct {
		background: var(--green);
		border-color: var(--line);
	}
	.dot.done-wrong {
		background: var(--red);
		border-color: var(--line);
	}
	.dot.current {
		background: var(--orange);
		border: var(--bw) solid var(--line);
	}
	.dot.flag::after {
		content: '';
		position: absolute;
		top: -3px;
		right: -1px;
		width: 4px;
		height: 4px;
		background: var(--blue);
		border-radius: var(--r-full);
	}

	/* question body */
	.qbody {
		display: flex;
		flex-direction: column;
		gap: 12px;
		flex: 1;
	}
	.qtop {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.tier-tag {
		font-size: 11px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.flag-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-family: var(--font-ui);
		font-size: 11px;
		font-weight: 900;
		color: var(--ink-3);
		background: none;
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-full);
		padding: 4px 10px;
		cursor: pointer;
	}
	.flag-btn.on {
		color: var(--blue-deep);
		border-color: var(--blue-deep);
		background: var(--blue-tint);
	}
	.lead {
		font-size: 11px;
		font-weight: 900;
		color: var(--ink-3);
		text-transform: uppercase;
	}
	.statements {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.statement {
		display: flex;
		gap: 10px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 12px 14px;
	}
	.snum {
		flex: none;
		font-family: var(--font-display);
		font-size: 12px;
		color: var(--ink-3);
	}
	.stext {
		font-family: var(--font-read);
		font-size: 14.5px;
		line-height: 1.55;
	}
	.tail {
		font-weight: 900;
		font-size: 14.5px;
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
	.explain {
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.explain.good {
		background: var(--green-tint);
		border-color: var(--green-deep);
	}
	.ex-label {
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.08em;
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
		padding-top: 6px;
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
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		background: var(--bg-2);
		position: relative;
		overflow: hidden;
	}
	.score-card.won {
		background: var(--green-tint);
	}
	.score-card.goldcard {
		background: linear-gradient(180deg, #f7ecc8, var(--bg-2));
	}
	.score-chips {
		display: flex;
		gap: 10px;
	}
	.schip {
		font-size: 11px;
		font-weight: 900;
		background: var(--bg-0);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 5px 12px;
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
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 14px 16px;
		background: var(--bg-2);
	}
	.tb-title {
		font-family: var(--font-display);
		font-size: 13px;
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
		font-size: 11px;
		font-weight: 900;
		color: var(--ink-2);
	}
	.tb-track {
		flex: 1;
		height: 14px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		background: var(--bg-0);
		overflow: hidden;
	}
	.tb-fill {
		height: 100%;
		background: var(--green);
		transition: width var(--t-conquest) var(--ease);
	}
	.tb-fill.low {
		background: var(--orange);
	}
	.tb-num {
		flex: none;
		font-size: 11px;
		font-weight: 900;
	}
	.tb-hint {
		margin: 2px 0 0;
		font-size: 11.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.sr-card {
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--blue-tint);
		border: var(--bw) solid var(--blue-deep);
		border-radius: var(--r-lg);
		padding: 13px 15px;
	}
	.sr-title {
		font-weight: 900;
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
		font-family: var(--font-ui);
		font-size: 12px;
		font-weight: 700;
		color: var(--ink-3);
		cursor: pointer;
	}

	/* review */
	.review {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.rvhead {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.rv-item {
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 13px 15px;
		background: var(--bg-2);
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.rv-item.wrong {
		border-width: var(--bw-bold);
		border-color: var(--red-deep);
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
		background: var(--green-deep);
	}
	.rv-badge.no {
		background: var(--red-deep);
	}
	.rv-tag {
		font-size: 10px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.rv-flag {
		color: var(--blue-deep);
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
		font-size: 10px;
		font-weight: 900;
		color: var(--blue-deep);
		background: var(--blue-tint);
		border: var(--bw) solid var(--blue-deep);
		border-radius: var(--r-full);
		padding: 3px 9px;
		align-self: flex-start;
	}
	@media (prefers-reduced-motion: reduce) {
		.confetti,
		.clock.warn {
			animation: none;
		}
	}
</style>
