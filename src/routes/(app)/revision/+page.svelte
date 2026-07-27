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
	// ammo belt reads as slugs up to 20 cards; past that a continuous track is honest
	const belt = $derived(sessionTotal > 0 && sessionTotal <= 20);

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
		<h1 class="stencil">Hold position</h1>
		<p>{errorMsg}</p>
		<button class="btn3d btn3d-quiet" onclick={boot}>Retry</button>
	</div>
{:else if phase === 'home' && due}
	<div class="home">
		<div class="head">
			<button class="iconb" aria-label="back" onclick={() => goto('/')}>
				<svg width="13" height="13" viewBox="0 0 14 14"><path d="M9 2 L4 7 L9 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
			</button>
			<div class="head-txt">
				<span class="label">field recall · sm-2</span>
				<h1 class="stencil">Revision Stack</h1>
			</div>
		</div>

		{#if due.count === 0}
			<div class="clear plate">
				<div class="clear-stamp stamp">
					<span class="cs-1">STACK</span>
					<span class="cs-2">CLEAR</span>
				</div>
				<div class="stencil clear-title">All clear, Commandant</div>
				<p class="clear-sub">No cards due. Wrong quiz answers report here for scheduled review.</p>
			</div>
		{:else}
			<div class="hero band plate-dark">
				<div class="stack-visual">
					<div class="sv sv3"></div>
					<div class="sv sv2"></div>
					<div class="sv sv1 brass"><span>{due.count}</span></div>
				</div>
				<div class="hero-text">
					<span class="hero-kick">recall dispatch</span>
					<div class="stencil hero-title">{due.count} {due.count === 1 ? 'card' : 'cards'} due today</div>
					<div class="hero-sub">
						~{Math.max(1, Math.round(due.count * 0.8))} min
						{#if split.later > 0}
							· {split.now} now · {split.later} this evening{/if}
					</div>
				</div>
			</div>
			<button class="btn3d wide" onclick={startSession}>Start review →</button>
		{/if}

		{#if due.decays.length > 0}
			<div class="section">
				<h2 class="stencil sec-t warn-title"><span class="pip"></span>Decay warnings</h2>
				{#each due.decays as d (d.code)}
					<button class="dossier-row decay" onclick={() => restore(d.code)}>
						<span class="row-ico decay-ico">
							<svg width="15" height="15" viewBox="0 0 18 18"><path d="M4 9.5 L7.5 13 L14 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
						</span>
						<span class="row-body">
							<span class="row-t">{d.title}</span>
							<span class="row-s decay-sub">{d.days} days untouched · territory dimming</span>
						</span>
						<span class="retake">RETAKE 5Q</span>
					</button>
				{/each}
			</div>
		{/if}

		<div class="section">
			<h2 class="stencil sec-t">This week</h2>
			<div class="week recess">
				{#each due.forecast.slice(0, 6) as f, i (f.day)}
					<div class="day" class:today={i === 0}>
						<div class="dlabel">{dayLabel(f.day, i)}</div>
						<div class="dnum">{f.count}</div>
					</div>
				{/each}
			</div>
			<p class="week-hint label">Clearing today keeps tomorrow light. Skipping doubles it.</p>
		</div>
	</div>
{:else if phase === 'review' && current}
	<div class="review">
		<div class="rhead band plate-dark">
			<button class="iconb dark" aria-label="quit" onclick={() => { phase = 'home'; boot(); }}>
				<svg width="12" height="12" viewBox="0 0 10 10"><path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
			</button>
			{#if belt}
				<div class="segbar rprog">
					{#each Array(sessionTotal) as _, i (i)}
						<span class="seg" class:on={i < graded}></span>
					{/each}
				</div>
			{:else}
				<div class="track rprog"><span class="fill" style:width="{progress * 100}%"></span></div>
			{/if}
			<span class="rcount">{graded}/{sessionTotal}</span>
		</div>

		<div class="stage">
			<div class="ghost g2" style:opacity={queue.length > 2 ? 1 : 0}></div>
			<div class="ghost g1" style:opacity={queue.length > 1 ? 1 : 0}></div>
			<div class="card plate" role="button" tabindex="0" onclick={reveal}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && reveal()}>
				<div class="card-top">
					<span class="ribbon">{current.topic_title || current.topic_code}</span>
					{#if current.missed > 1}<span class="statchip warn">missed {current.missed}×</span>{/if}
				</div>
				<div class="stem">{current.stem}</div>
				{#if revealed}
					<div class="fold recess">
						<span class="ans-label">ANSWER</span>
						<div class="ans"><strong>{revealed.answer}</strong></div>
						{#if revealed.explanation}<div class="expl">{revealed.explanation}</div>{/if}
					</div>
					{#if current.reread}
						<button class="btn3d btn3d-quiet reread" onclick={(e) => { e.stopPropagation(); goto(`/topic/${current.topic_code}`); }}>
							Missed {current.missed}× — re-read {current.topic_title} →
						</button>
					{/if}
					<div class="meta label">next if good: {goodDays} {goodDays === 1 ? 'day' : 'days'}</div>
				{:else}
					<div class="tap-hint label">tap to reveal</div>
				{/if}
			</div>
		</div>

		<div class="grades">
			{#if revealed}
				<div class="grade-row">
					<button class="btn3d g-btn again" disabled={busy} onclick={() => grade('again')}>
						Again<span>tomorrow</span>
					</button>
					<button class="btn3d btn3d-quiet g-btn" disabled={busy} onclick={() => grade('good')}>
						Good<span>{goodDays} {goodDays === 1 ? 'day' : 'days'}</span>
					</button>
					<button class="btn3d btn3d-olive g-btn" disabled={busy} onclick={() => grade('mastered')}>
						Mastered<span>retired</span>
					</button>
				</div>
				<p class="keys label">keys: 1 again · 2 good · 3 mastered</p>
			{:else}
				<button class="btn3d wide" onclick={reveal}>Reveal answer</button>
			{/if}
		</div>
	</div>
{:else if phase === 'done'}
	<div class="center done">
		<div class="done-seal seal">
			<span class="seal-n">✓</span>
			<span class="seal-k">CLEAR</span>
		</div>
		<h1 class="stencil">Stack clear</h1>
		<p>{sessionTotal} {sessionTotal === 1 ? 'card' : 'cards'} reviewed{againCount ? ` · ${againCount} lapsed back to tomorrow` : ''}.</p>
		<div class="done-cta">
			<button class="btn3d btn3d-quiet" onclick={() => { phase = 'home'; boot(); }}>Back to stack</button>
			<button class="btn3d btn3d-olive" onclick={() => goto('/map')}>To the map →</button>
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
		font-size: 24px;
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
		border-top-color: var(--orange);
		border-radius: var(--r-full);
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ── home ───────────────────────────────────────────────── */
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
	.head-txt {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.head h1 {
		margin: 0;
		font-size: 19px;
	}
	/* raised quiet disc — the file-tab control */
	.iconb {
		flex: none;
		width: 34px;
		height: 34px;
		border: var(--bw) solid var(--khaki);
		border-radius: var(--r-full);
		background: var(--grad-plate);
		box-shadow: 0 3px 0 var(--edge), var(--emboss);
		color: var(--ink-1);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: transform var(--t-fast) var(--ease);
	}
	.iconb:active {
		transform: translateY(2px);
		box-shadow: 0 1px 0 var(--edge), var(--emboss);
	}
	.iconb.dark {
		border-color: rgba(0, 0, 0, 0.45);
		background: rgba(0, 0, 0, 0.22);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
		color: var(--ink-inverse);
	}

	/* dark olive dispatch band (also the review header) */
	.band {
		background: var(--grad-olive);
		box-shadow:
			0 4px 0 var(--green-edge),
			0 12px 20px rgba(45, 38, 18, 0.28),
			inset 0 1px 0 rgba(255, 255, 255, 0.22);
	}
	.hero {
		padding: 18px 18px 20px;
		display: flex;
		align-items: center;
		gap: 18px;
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
		border-radius: var(--r-md);
		background: var(--grad-plate);
		border: var(--bw) solid var(--khaki-deep);
		box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
	}
	.sv3 {
		top: 12px;
		left: 12px;
		transform: rotate(7deg);
	}
	.sv2 {
		top: 6px;
		left: 6px;
		transform: rotate(3deg);
	}
	.sv1 {
		top: 0;
		left: 0;
	}
	.sv1 span {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 28px;
		color: #3b2f11;
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.55);
	}
	.hero-text {
		min-width: 0;
	}
	.hero-kick {
		display: block;
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: var(--track-label);
		text-transform: uppercase;
		color: var(--gold-hi);
	}
	.hero-title {
		font-size: 21px;
		color: var(--ink-inverse);
		text-shadow: 0 1px 0 rgba(0, 0, 0, 0.3);
		margin-top: 3px;
	}
	.hero-sub {
		font-family: var(--font-cond);
		font-size: 12.5px;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: rgba(246, 239, 217, 0.78);
		margin-top: 5px;
	}
	.wide {
		width: 100%;
		font-size: 15px;
		padding: 14px 16px;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.sec-t {
		margin: 0;
		font-size: 14px;
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.warn-title {
		color: var(--orange-deep);
	}
	.pip {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--grad-rust);
		box-shadow: 0 0 0 2px rgba(201, 98, 47, 0.22);
	}
	/* decay row: the file that is fading — dashed marker, rust caption */
	.decay-ico {
		border-style: dashed;
		border-color: var(--orange-deep);
		background: var(--orange-tint);
		color: var(--orange-deep);
		opacity: 0.9;
	}
	.decay-sub {
		color: var(--orange-deep);
		font-weight: 700;
	}
	.retake {
		flex: none;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 10px;
		letter-spacing: var(--track-label);
		color: #fff;
		background: var(--grad-rust);
		border-radius: var(--r-sm);
		padding: 5px 9px;
		box-shadow: 0 2px 0 var(--orange-edge);
	}
	.decay:active .retake {
		box-shadow: 0 1px 0 var(--orange-edge);
	}

	/* week rail: recessed magazine, today is the loaded round */
	.week {
		display: flex;
		gap: 6px;
		padding: 6px;
	}
	.day {
		flex: 1;
		text-align: center;
		border-radius: var(--r-sm);
		background: var(--grad-plate);
		border: var(--bw) solid var(--line-soft);
		box-shadow: 0 2px 0 var(--edge), var(--emboss);
		padding: 7px 0 6px;
	}
	.day.today {
		background: var(--grad-brass);
		border-color: var(--gold-edge);
		box-shadow: 0 2px 0 var(--gold-edge), inset 0 1px 0 rgba(255, 255, 255, 0.6);
	}
	.dlabel {
		font-size: 8.5px;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--ink-3);
	}
	.dnum {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 16px;
		color: var(--ink-1);
	}
	.day.today .dlabel,
	.day.today .dnum {
		color: #3b2f11;
	}
	.week-hint {
		margin: 0;
		text-align: center;
		letter-spacing: 0.04em;
		text-transform: none;
	}

	/* ── empty stack: an unstamped file ─────────────────────── */
	.clear {
		padding: 30px 20px 26px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: center;
		text-align: center;
	}
	.clear-stamp {
		width: 92px;
		height: 92px;
		border-color: var(--green-deep);
		color: var(--green-deep);
		gap: 2px;
	}
	.cs-1 {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 13px;
		letter-spacing: var(--track-label);
	}
	.cs-2 {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 19px;
		letter-spacing: 0.08em;
	}
	.clear-title {
		font-size: 19px;
	}
	.clear-sub {
		margin: 0;
		font-size: 12.5px;
		color: var(--ink-2);
		max-width: 280px;
		line-height: var(--lh-ui);
	}

	/* ── review ─────────────────────────────────────────────── */
	.review {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-height: 70vh;
	}
	.rhead {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 11px 13px;
	}
	.rprog {
		flex: 1;
	}
	.rcount {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 13px;
		letter-spacing: 0.06em;
		color: var(--gold-hi);
	}
	.stage {
		position: relative;
		flex: 1;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 14px;
	}
	.ghost {
		position: absolute;
		width: 292px;
		height: 200px;
		border-radius: var(--r-xl);
		background: var(--grad-plate);
		border: var(--bw) solid var(--line-soft);
		box-shadow: 0 3px 0 var(--edge);
		transition: opacity var(--t-base) var(--ease);
	}
	.g2 {
		top: 28px;
		transform: rotate(3.5deg);
	}
	.g1 {
		top: 22px;
		transform: rotate(-2deg);
	}
	.card {
		position: relative;
		width: 100%;
		max-width: 320px;
		padding: 16px 16px 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		cursor: pointer;
	}
	.card-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	.stem {
		font-family: var(--font-read);
		font-size: 14.5px;
		line-height: var(--lh-read);
		white-space: pre-wrap;
		color: var(--ink-1);
	}
	/* the fold: answer pressed into the sheet */
	.fold {
		padding: 11px 12px 12px;
		display: flex;
		flex-direction: column;
		gap: 7px;
		animation: unfold var(--t-base) var(--ease);
	}
	@keyframes unfold {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	.ans-label {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 10px;
		letter-spacing: var(--track-label);
		color: var(--green-deep);
	}
	.ans,
	.expl {
		font-family: var(--font-read);
		font-size: 14px;
		line-height: var(--lh-read);
	}
	.expl {
		color: var(--ink-2);
	}
	.reread {
		align-self: flex-start;
		font-size: 11px;
		letter-spacing: 0.08em;
		padding: 8px 11px;
		text-align: left;
	}
	.meta,
	.tap-hint {
		text-transform: none;
		letter-spacing: 0.03em;
	}
	.tap-hint {
		text-align: center;
		border-top: var(--bw) dashed var(--line-soft);
		padding: 10px 0 2px;
	}

	.grades {
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.grade-row {
		display: flex;
		gap: 9px;
	}
	.g-btn {
		flex: 1;
		font-size: 13px;
		padding: 9px 4px;
		min-height: 50px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1px;
	}
	.g-btn span {
		font-family: var(--font-cond);
		font-weight: 700;
		font-size: 10px;
		letter-spacing: 0.06em;
		opacity: 0.85;
		text-transform: uppercase;
	}
	/* again = alarm: the card lapses back */
	.g-btn.again {
		background: linear-gradient(#a5432f, #7d2a1a);
		box-shadow: 0 3px 0 #4f1509, inset 0 1px 0 rgba(255, 255, 255, 0.22);
	}
	.g-btn.again:active {
		box-shadow: 0 1px 0 #4f1509, inset 0 1px 0 rgba(255, 255, 255, 0.22);
	}
	.g-btn.again:disabled {
		box-shadow: 0 3px 0 #4f1509;
	}
	.keys {
		margin: 0;
		text-align: center;
		text-transform: none;
		letter-spacing: 0.03em;
	}

	/* ── done ───────────────────────────────────────────────── */
	.done-seal {
		width: 68px;
		height: 68px;
		gap: 2px;
	}
	.done-seal .seal-n {
		font-size: 26px;
	}
	.done-cta {
		display: flex;
		gap: 10px;
		margin-top: 4px;
	}

	@media (prefers-reduced-motion: reduce) {
		.fold {
			animation: none;
		}
	}
</style>
