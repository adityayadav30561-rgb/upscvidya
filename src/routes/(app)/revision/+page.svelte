<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		fetchDue,
		revealCard,
		gradeCard,
		startRestore,
		requeue,
		sessionSplit,
		type SrDue,
		type SrCardView,
		type SrGrade,
		type SrReveal
	} from '$lib/sr';
	import { showToast } from '$lib/toast.svelte';
	import { capture } from '$lib/analytics';
	import Button from '$lib/components/Button.svelte';

	type Phase = 'loading' | 'error' | 'home' | 'review' | 'done';
	let phase = $state<Phase>('loading');
	let errorMsg = $state('');

	let due = $state<SrDue | null>(null);
	let queue = $state<string[]>([]); // card_ids for this sitting
	let sessionTotal = $state(0);
	let graded = $state(0);
	let againCount = $state(0);
	let revealed = $state<SrReveal | null>(null);
	let busy = $state(false);

	const cardById = $derived(new Map((due?.cards ?? []).map((c) => [c.card_id, c])));
	const currentId = $derived(queue[0] ?? null);
	const current = $derived<SrCardView | null>(currentId ? (cardById.get(currentId) ?? null) : null);
	const split = $derived(sessionSplit(due?.count ?? 0));
	const progress = $derived(sessionTotal ? Math.min(1, graded / sessionTotal) : 0);

	async function boot() {
		phase = 'loading';
		try {
			due = await fetchDue();
			phase = 'home';
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Could not load the stack.';
			phase = 'error';
		}
	}
	let booted = false;
	$effect(() => {
		if (booted) return;
		booted = true;
		boot();
	});

	function startSession() {
		if (!due || due.count === 0) return;
		queue = due.cards.slice(0, split.now).map((c) => c.card_id);
		sessionTotal = queue.length;
		graded = 0;
		againCount = 0;
		revealed = null;
		phase = 'review';
	}

	async function reveal() {
		if (!currentId || revealed || busy) return;
		busy = true;
		try {
			revealed = await revealCard(currentId);
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Reveal failed', 'error');
		} finally {
			busy = false;
		}
	}

	async function grade(g: SrGrade) {
		if (!currentId || !revealed || busy) return;
		busy = true;
		try {
			await gradeCard(currentId, g);
			if (g === 'again') {
				againCount += 1;
			} else {
				graded += 1;
			}
			queue = requeue(queue, currentId, g);
			revealed = null;
			if (queue.length === 0) {
				phase = 'done';
				capture('sr_session_completed', { graded });
			}
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Grade failed', 'error');
		} finally {
			busy = false;
		}
	}

	async function restore(code: string) {
		if (busy) return;
		busy = true;
		try {
			const res = await startRestore(code);
			goto(`/quiz/${code}?s=${res.session_id}`);
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Could not start the retake', 'error');
			busy = false;
		}
	}

	function onKey(e: KeyboardEvent) {
		if (phase !== 'review') return;
		if (e.key === ' ' && !revealed) {
			e.preventDefault();
			reveal();
		} else if (revealed) {
			if (e.key === '1') grade('again');
			else if (e.key === '2') grade('good');
			else if (e.key === '3') grade('mastered');
		}
	}

	const dayLabel = (iso: string, i: number) =>
		i === 0 ? 'TODAY' : new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase();

	const goodDays = $derived(current ? current.next_good_days : 1);
</script>

<svelte:window onkeydown={onKey} />
<svelte:head><title>UPSCVidya — Revision Stack</title></svelte:head>

{#if phase === 'loading'}
	<div class="center"><div class="spinner"></div></div>
{:else if phase === 'error'}
	<div class="center">
		<h1>Hold position</h1>
		<p>{errorMsg}</p>
		<Button variant="secondary" onclick={boot}>Retry</Button>
	</div>
{:else if phase === 'home' && due}
	<div class="home">
		<div class="head">
			<button class="icon-btn" aria-label="back" onclick={() => goto('/')}>
				<svg width="13" height="13" viewBox="0 0 14 14"><path d="M9 2 L4 7 L9 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
			</button>
			<h1>Revision Stack</h1>
		</div>

		{#if due.count === 0}
			<div class="clear-card">
				<div class="clear-mark">✓</div>
				<div class="clear-title">All clear, Commandant</div>
				<p class="clear-sub">No cards due. Wrong quiz answers report here for scheduled review.</p>
			</div>
		{:else}
			<div class="hero">
				<div class="stack-visual">
					<div class="sv sv3"></div>
					<div class="sv sv2"></div>
					<div class="sv sv1"><span>{due.count}</span></div>
				</div>
				<div class="hero-text">
					<div class="hero-title">{due.count} {due.count === 1 ? 'card' : 'cards'} due today</div>
					<div class="hero-sub">
						~{Math.max(1, Math.round(due.count * 0.8))} min
						{#if split.later > 0}
							· {split.now} now · {split.later} this evening{/if}
					</div>
				</div>
			</div>
			<Button variant="primary" onclick={startSession}>Start review →</Button>
		{/if}

		{#if due.decays.length > 0}
			<div class="section">
				<h2 class="warn-title">Decay warnings</h2>
				{#each due.decays as d (d.code)}
					<button class="decay-row" onclick={() => restore(d.code)}>
						<span class="decay-node">
							<svg width="15" height="15" viewBox="0 0 18 18"><path d="M4 9.5 L7.5 13 L14 5.5" fill="none" stroke="var(--khaki-deep)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
						</span>
						<span class="decay-text">
							<span class="decay-name">{d.title}</span>
							<span class="decay-sub">{d.days} days untouched · territory dimming</span>
						</span>
						<span class="retake">RETAKE 5Q</span>
					</button>
				{/each}
			</div>
		{/if}

		<div class="section">
			<h2>This week</h2>
			<div class="week">
				{#each due.forecast.slice(0, 6) as f, i (f.day)}
					<div class="day" class:today={i === 0}>
						<div class="dlabel">{dayLabel(f.day, i)}</div>
						<div class="dnum">{f.count}</div>
					</div>
				{/each}
			</div>
			<p class="week-hint">Clearing today keeps tomorrow light. Skipping doubles it.</p>
		</div>
	</div>
{:else if phase === 'review' && current}
	<div class="review">
		<div class="rhead">
			<button class="icon-btn" aria-label="quit" onclick={() => { phase = 'home'; boot(); }}>
				<svg width="12" height="12" viewBox="0 0 10 10"><path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
			</button>
			<div class="rtrack"><div class="rfill" style:width="{progress * 100}%"></div></div>
			<span class="rcount">{graded}/{sessionTotal}</span>
		</div>

		<div class="stage">
			<div class="ghost g2" style:opacity={queue.length > 2 ? 1 : 0}></div>
			<div class="ghost g1" style:opacity={queue.length > 1 ? 1 : 0}></div>
			<div class="card" role="button" tabindex="0" onclick={reveal}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && reveal()}>
				<div class="card-top">
					<span class="topic-chip">{current.topic_title || current.topic_code}</span>
					{#if current.missed > 1}<span class="missed">missed {current.missed}×</span>{/if}
				</div>
				<div class="stem">{current.stem}</div>
				{#if revealed}
					<div class="fold">
						<span class="ans-label">ANSWER</span>
						<div class="ans"><strong>{revealed.answer}</strong></div>
						{#if revealed.explanation}<div class="expl">{revealed.explanation}</div>{/if}
					</div>
					{#if current.reread}
						<button class="reread" onclick={(e) => { e.stopPropagation(); goto(`/topic/${current.topic_code}`); }}>
							Missed {current.missed}× — re-read {current.topic_title} →
						</button>
					{/if}
					<div class="meta">next if good: {goodDays} {goodDays === 1 ? 'day' : 'days'}</div>
				{:else}
					<div class="tap-hint">tap to reveal</div>
				{/if}
			</div>
		</div>

		<div class="grades">
			{#if revealed}
				<div class="grade-row">
					<button class="g-btn again" disabled={busy} onclick={() => grade('again')}>
						Again<span>tomorrow</span>
					</button>
					<button class="g-btn good" disabled={busy} onclick={() => grade('good')}>
						Good<span>{goodDays} {goodDays === 1 ? 'day' : 'days'}</span>
					</button>
					<button class="g-btn mastered" disabled={busy} onclick={() => grade('mastered')}>
						Mastered<span>retired</span>
					</button>
				</div>
				<p class="keys">keys: 1 again · 2 good · 3 mastered</p>
			{:else}
				<Button variant="secondary" onclick={reveal}>Reveal answer</Button>
			{/if}
		</div>
	</div>
{:else if phase === 'done'}
	<div class="center done">
		<div class="clear-mark big">✓</div>
		<h1>Stack clear</h1>
		<p>{sessionTotal} {sessionTotal === 1 ? 'card' : 'cards'} reviewed{againCount ? ` · ${againCount} lapsed back to tomorrow` : ''}.</p>
		<div class="done-cta">
			<Button variant="secondary" onclick={() => { phase = 'home'; boot(); }}>Back to stack</Button>
			<Button variant="success" onclick={() => goto('/map')}>To the map →</Button>
		</div>
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
		padding: 40px 20px;
	}
	.center h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 24px;
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
		border-top-color: var(--blue-deep);
		border-radius: var(--r-full);
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* home */
	.home {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.head h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 17px;
		text-transform: uppercase;
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
	.hero {
		background: var(--blue-tint);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		padding: 22px 20px;
		display: flex;
		align-items: center;
		gap: 18px;
		box-shadow: var(--shadow-2);
	}
	.stack-visual {
		position: relative;
		flex: none;
		width: 74px;
		height: 86px;
	}
	.sv {
		position: absolute;
		width: 58px;
		height: 72px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		background: var(--bg-2);
	}
	.sv3 {
		top: 10px;
		left: 10px;
		transform: rotate(6deg);
	}
	.sv2 {
		top: 5px;
		left: 5px;
		transform: rotate(2deg);
	}
	.sv1 {
		top: 0;
		left: 0;
		background: var(--blue);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.sv1 span {
		font-family: var(--font-display);
		font-size: 24px;
		color: #fff;
	}
	.hero-title {
		font-family: var(--font-display);
		font-size: 18px;
		line-height: 1.25;
		text-transform: uppercase;
	}
	.hero-sub {
		font-size: 12px;
		font-weight: 700;
		color: var(--ink-2);
		margin-top: 4px;
	}
	.home :global(.btn) {
		width: 100%;
	}
	.section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.section h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 13px;
		text-transform: uppercase;
	}
	.warn-title {
		color: var(--red-deep);
	}
	.decay-row {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 13px 15px;
		cursor: pointer;
		font-family: var(--font-ui);
		text-align: left;
		width: 100%;
	}
	.decay-row:hover {
		box-shadow: var(--shadow-2);
	}
	.decay-node {
		flex: none;
		width: 38px;
		height: 38px;
		border-radius: var(--r-full);
		background: var(--bg-1);
		border: 2px dashed var(--khaki);
		opacity: 0.7;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.decay-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.decay-name {
		font-weight: 900;
		font-size: 13px;
		color: var(--ink-1);
	}
	.decay-sub {
		font-size: 11px;
		font-weight: 700;
		color: var(--red-deep);
	}
	.retake {
		flex: none;
		font-size: 10.5px;
		font-weight: 900;
		background: var(--khaki-tint);
		color: var(--khaki-deep);
		border: var(--bw) solid var(--khaki-deep);
		border-radius: var(--r-full);
		padding: 4px 10px;
	}
	.week {
		display: flex;
		gap: 7px;
	}
	.day {
		flex: 1;
		text-align: center;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 8px 0;
	}
	.day.today {
		background: var(--blue);
	}
	.dlabel {
		font-size: 9px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.dnum {
		font-family: var(--font-display);
		font-size: 14px;
	}
	.day.today .dlabel,
	.day.today .dnum {
		color: #fff;
	}
	.week-hint {
		margin: 0;
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
		text-align: center;
	}

	/* empty / done */
	.clear-card {
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		background: var(--green-tint);
		padding: 34px 20px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		align-items: center;
		text-align: center;
	}
	.clear-mark {
		width: 46px;
		height: 46px;
		border-radius: var(--r-full);
		background: var(--green);
		border: var(--bw) solid var(--line);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 22px;
		font-weight: 900;
	}
	.clear-mark.big {
		width: 62px;
		height: 62px;
		font-size: 30px;
	}
	.clear-title {
		font-family: var(--font-display);
		font-size: 18px;
		text-transform: uppercase;
	}
	.clear-sub {
		margin: 0;
		font-size: 12px;
		font-weight: 700;
		color: var(--ink-2);
		max-width: 280px;
	}
	.done-cta {
		display: flex;
		gap: 12px;
	}

	/* review */
	.review {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-height: 70vh;
	}
	.rhead {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.rtrack {
		flex: 1;
		height: 8px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		background: var(--bg-2);
		overflow: hidden;
	}
	.rfill {
		height: 100%;
		background: var(--blue);
		transition: width var(--t-base) var(--ease);
	}
	.rcount {
		font-size: 12px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.stage {
		position: relative;
		flex: 1;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 16px;
	}
	.ghost {
		position: absolute;
		width: 296px;
		height: 200px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		transition: opacity var(--t-base) var(--ease);
	}
	.g2 {
		top: 26px;
		transform: rotate(3.5deg);
	}
	.g1 {
		top: 21px;
		transform: rotate(-2deg);
	}
	.card {
		position: relative;
		width: 100%;
		max-width: 320px;
		background: var(--bg-2);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-lg);
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		box-shadow: var(--shadow-2);
		cursor: pointer;
	}
	.card-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	.topic-chip {
		font-size: 10px;
		font-weight: 900;
		background: var(--khaki-tint);
		color: var(--khaki-deep);
		border: var(--bw) solid var(--khaki-deep);
		border-radius: var(--r-full);
		padding: 3px 9px;
	}
	.missed {
		font-size: 10px;
		font-weight: 900;
		color: var(--red-deep);
	}
	.stem {
		font-family: var(--font-read);
		font-size: 14.5px;
		line-height: 1.6;
		white-space: pre-wrap;
	}
	.fold {
		border-top: var(--bw) dashed var(--line-soft);
		padding-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		animation: unfold var(--t-base) var(--ease);
	}
	@keyframes unfold {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	.ans-label {
		font-size: 10px;
		font-weight: 900;
		color: var(--green-deep);
		letter-spacing: 0.08em;
	}
	.ans,
	.expl {
		font-family: var(--font-read);
		font-size: 14px;
		line-height: 1.6;
	}
	.expl {
		color: var(--ink-2);
	}
	.reread {
		align-self: flex-start;
		background: var(--blue-tint);
		border: var(--bw) solid var(--blue-deep);
		border-radius: var(--r-full);
		color: var(--blue-deep);
		font-family: var(--font-ui);
		font-size: 11px;
		font-weight: 900;
		padding: 6px 12px;
		cursor: pointer;
	}
	.meta {
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.tap-hint {
		text-align: center;
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
		padding: 10px 0 4px;
	}
	.grades {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.grades :global(.btn) {
		width: 100%;
	}
	.grade-row {
		display: flex;
		gap: 10px;
	}
	.g-btn {
		flex: 1;
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 13.5px;
		border-radius: var(--r-full);
		padding: 10px 6px;
		min-height: 48px;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		border: var(--bw) solid var(--line);
	}
	.g-btn span {
		font-size: 9.5px;
		font-weight: 700;
	}
	.g-btn:hover:not(:disabled) {
		box-shadow: var(--shadow-2);
		transform: translate(-1px, -1px);
	}
	.g-btn:disabled {
		opacity: 0.6;
	}
	.g-btn.again {
		background: var(--red-tint);
		color: var(--red-deep);
		border-color: var(--red-deep);
	}
	.g-btn.good {
		background: var(--bg-2);
		color: var(--ink-1);
	}
	.g-btn.mastered {
		background: var(--green);
		color: var(--ink-1);
	}
	.keys {
		margin: 0;
		text-align: center;
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	@media (prefers-reduced-motion: reduce) {
		.fold {
			animation: none;
		}
	}
</style>
