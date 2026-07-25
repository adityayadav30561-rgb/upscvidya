<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { renderNotes } from '$lib/markdown';
	import { cacheNote, isCached } from '$lib/offline';
	import {
		reader,
		setFontSize,
		setSerif,
		setReaderTheme,
		syncGlobalTheme,
		saveResume,
		loadResume,
		type ReaderTheme
	} from '$lib/reader.svelte';
	import { pb } from '$lib/pb';
	import { showToast } from '$lib/toast.svelte';
	import { capture } from '$lib/analytics';
	import { UNITS } from '$lib/polity';
	import type { ReaderData } from './+page';
	import Sheet from '$lib/components/Sheet.svelte';

	let { data }: { data: ReaderData } = $props();

	const unit = $derived(UNITS.find((u) => u.code === data.code));

	/* unify the four content shapes into one view model */
	const view = $derived.by(() => {
		if (data.mode === 'full' && data.topic) {
			return {
				title: data.topic.title,
				md: data.topic.notes_md,
				region: data.topic.region,
				bookRef: data.topic.book_ref,
				minutes: data.topic.est_read_minutes,
				quizN: data.topic.mcq_floor,
				topicId: data.topic.id as string | null,
				teaser: false
			};
		}
		if (data.mode === 'cached' && data.cached) {
			return {
				title: data.cached.title,
				md: data.cached.notes_md,
				region: data.cached.region,
				bookRef: data.cached.book_ref,
				minutes: data.cached.est_read_minutes,
				quizN: data.cached.mcq_floor,
				topicId: null,
				teaser: false
			};
		}
		if (data.mode === 'teaser' && data.teaser) {
			return {
				title: data.teaser.title,
				md: data.teaser.notes_teaser,
				region: data.teaser.region,
				bookRef: data.teaser.book_ref,
				minutes: data.teaser.est_read_minutes,
				quizN: data.teaser.mcq_floor,
				topicId: null,
				teaser: true
			};
		}
		return null;
	});

	const html = $derived(view ? renderNotes(view.md) : '');
	const regionName = (r?: string) =>
		({
			foundations: 'Foundations',
			system: 'The System',
			centre: 'The Centre',
			states: 'The States',
			grassroots: 'Grassroots',
			institutions: 'The Institutions',
			dynamics: 'Dynamics',
			courtroom: 'The Courtroom'
		})[r ?? ''] ?? '';

	/* scroll progress + top-bar auto-hide + mark-read + resume */
	let scrollEl = $state<HTMLElement | null>(null);
	let bodyEl = $state<HTMLElement | null>(null);
	let progress = $state(0); // 0..1
	let barHidden = $state(false);
	let ctaPulsed = $state(false);
	let cached = $state(false);
	let lastY = 0;
	let markedRead = false;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	async function markRead() {
		if (markedRead || !view?.topicId || !pb.authStore.isValid) return;
		markedRead = true;
		const cur = data.progress;
		try {
			if (!cur) {
				await pb.collection('topic_progress').create({
					user: pb.authStore.record!.id,
					topic: view.topicId,
					state: 'read',
					last_activity: new Date().toISOString()
				});
			} else if (cur.state === 'unread') {
				await pb.collection('topic_progress').update(cur.id, {
					state: 'read',
					last_activity: new Date().toISOString()
				});
			}
			capture('first_topic_read', { code: data.code });
			// conquered/gold/decaying: never downgrade
		} catch {
			markedRead = false; // let a later scroll retry
		}
	}

	function onScroll() {
		const el = scrollEl;
		if (!el) return;
		const max = el.scrollHeight - el.clientHeight;
		const ratio = max > 0 ? el.scrollTop / max : 1;
		progress = Math.min(1, Math.max(0, ratio));

		// top bar hides on scroll-down, returns on scroll-up
		const y = el.scrollTop;
		if (y > lastY + 6 && y > 60) barHidden = true;
		else if (y < lastY - 6) barHidden = false;
		lastY = y;

		if (progress >= 0.99) ctaPulsed = true;
		if (progress >= 0.8 && !view?.teaser) markRead();

		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => saveResume(data.code, progress), 250);
	}

	/* Aa controls sheet */
	let controlsOpen = $state(false);
	const themes: { key: ReaderTheme; label: string }[] = [
		{ key: 'paper', label: 'PAPER' },
		{ key: 'sepia', label: 'SEPIA' },
		{ key: 'night', label: 'NIGHT' }
	];

	onMount(() => {
		syncGlobalTheme();

		// cache entitled full content for offline reuse (never the teaser)
		if (view && !view.teaser && data.mode === 'full' && data.topic) {
			cacheNote({
				code: data.code,
				title: view.title,
				notes_md: view.md,
				est_read_minutes: view.minutes,
				mcq_floor: view.quizN,
				region: view.region,
				book_ref: view.bookRef
			}).then(() => (cached = true));
		}
		isCached(data.code).then((c) => (cached = cached || c));

		// resume position
		const resume = loadResume(data.code);
		if (resume > 0) {
			tick().then(() => {
				const el = scrollEl;
				if (!el) return;
				el.scrollTop = (el.scrollHeight - el.clientHeight) * resume;
				showToast('Resumed where you left off', 'info');
			});
		}
	});

	function attemptQuiz() {
		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			showToast('Quiz needs a connection. Notes are available offline.', 'error');
			return;
		}
		goto(`/quiz/${data.code}`);
	}
</script>

<svelte:head><title>{view ? `${view.title} — UPSCVidya` : 'Reader — UPSCVidya'}</title></svelte:head>

{#if !view}
	<div class="miss">
		{#if data.mode === 'offline-miss'}
			<h1>Offline</h1>
			<p>This topic isn't saved for offline reading. Reconnect to read it, then it caches automatically.</p>
		{:else}
			<h1>Not available</h1>
			<p>This territory's notes haven't been deployed yet.</p>
		{/if}
		<button class="back-btn" onclick={() => goto('/map')}>← Back to map</button>
	</div>
{:else}
	<div class="reader reader-{reader.theme}" class:serif={reader.serif}>
		<!-- top bar -->
		<div class="topbar" class:hidden={barHidden}>
			<div class="topbar-row">
				<button class="icon-btn" aria-label="back to map" onclick={() => goto('/map')}>
					<svg width="13" height="13" viewBox="0 0 14 14"><path d="M9 2 L4 7 L9 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</button>
				<div class="crumb">
					<div class="ctitle">{view.title}</div>
					<div class="csub">{regionName(view.region)} · {view.minutes} min read</div>
				</div>
				{#if cached}
					<span class="offline-chip" aria-label="saved offline">
						<svg width="12" height="12" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="var(--green-tint)" stroke="var(--green-deep)" stroke-width="1.3" /><path d="M4.5 7 L6.3 8.8 L9.5 5.2" fill="none" stroke="var(--green-deep)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
						OFFLINE
					</span>
				{/if}
				<button class="icon-btn aa" aria-label="reading settings" onclick={() => (controlsOpen = true)}>Aa</button>
			</div>
			<div class="progress-track"><div class="progress-fill" style:width="{progress * 100}%"></div></div>
		</div>

		<!-- scrolling body -->
		<div class="scroll" bind:this={scrollEl} onscroll={onScroll}>
			<div class="col" bind:this={bodyEl} style:--reader-fs="{reader.fontSize}px">
				<div class="chips">
					{#if view.bookRef}<span class="rchip khaki">{view.bookRef}</span>{/if}
					<span class="rchip">{unit?.kind === 'appendix' ? 'Drill bank' : 'Chapter'}</span>
				</div>

				<div class="dossier-sheet">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- html is DOMPurify-sanitised in renderNotes() -->
					<article class="notes">{@html html}</article>
				</div>

				{#if !view.teaser}
					<div class="stat-tiles">
						<div class="stile">
							<div class="st-k">READ TIME</div>
							<div class="st-v">{view.minutes}<span class="st-u"> MIN</span></div>
						</div>
						<div class="stile">
							<div class="st-k">ON CAPTURE</div>
							<div class="st-v rust">+100<span class="st-u"> XP</span></div>
						</div>
					</div>
				{/if}

				{#if view.teaser}
					<div class="paywall">
						<div class="fade"></div>
						<div class="pcard">
							<div class="ptitle">Premium territory</div>
							<p>This chapter's full briefing is for enlisted cadets. Notes stay free-roam readable for free topics; unlock everything to read this one.</p>
							<button class="pcta" onclick={() => goto('/paywall')}>Enlist for full access →</button>
						</div>
					</div>
				{:else}
					<div class="endcap">— end of briefing —</div>
				{/if}
			</div>
		</div>

		<!-- sticky quiz CTA (hidden in teaser mode) -->
		{#if !view.teaser}
			<div class="cta-wrap">
				<button class="cta" class:pulse={ctaPulsed} data-tour="reader-cta" onclick={attemptQuiz}>
					Attempt quiz · {view.quizN} questions →
				</button>
			</div>
		{/if}
	</div>

	<!-- reading comfort sheet -->
	<Sheet bind:open={controlsOpen} title="Reading comfort">
		<div class="ctl">
			<div class="ctl-head"><span>TEXT SIZE</span><span class="val">{reader.fontSize}px</span></div>
			<div class="size-row">
				<span class="a-sm">A</span>
				<input
					type="range"
					min={reader.min}
					max={reader.max}
					value={reader.fontSize}
					oninput={(e) => setFontSize(+e.currentTarget.value)}
					aria-label="text size"
				/>
				<span class="a-lg">A</span>
			</div>
		</div>

		<div class="ctl">
			<span class="ctl-label">THEME</span>
			<div class="themes">
				{#each themes as t (t.key)}
					<button
						class="swatch sw-{t.key}"
						class:active={reader.theme === t.key}
						onclick={() => setReaderTheme(t.key)}
					>
						<span class="aa">Aa</span>
						<span class="sw-label">{t.label}</span>
					</button>
				{/each}
			</div>
		</div>

		<div class="ctl serif-row">
			<div>
				<div class="serif-title">Serif body</div>
				<div class="serif-sub">Source Serif · off = Lato</div>
			</div>
			<button
				class="toggle"
				class:on={reader.serif}
				role="switch"
				aria-checked={reader.serif}
				aria-label="serif body"
				onclick={() => setSerif(!reader.serif)}
			>
				<span class="knob"></span>
			</button>
		</div>
		<div class="ctl-foot">Settings persist per device</div>
	</Sheet>
{/if}

<style>
	/* the reader owns the full column; the app shell padding is neutralised */
	.reader {
		position: fixed;
		inset: 0;
		max-width: 480px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		background: var(--bg-0);
		z-index: 55; /* above the floating bottom nav (50); Sheet sits above at 60/61 */
	}
	/* SEPIA is reader-scoped; NIGHT rides the global dark tokens */
	.reader-sepia {
		--bg-0: #f3e6c9;
		--bg-1: #e9d8b0;
		--bg-2: #f7eed6;
		--ink-1: #4a3f28;
		--ink-2: #5f5333;
	}

	/* FIELD DOSSIER header — dark olive command band (chrome stays olive in
	   every reading theme; light comes from above) */
	.topbar {
		flex: none;
		background: linear-gradient(#3d4429, #2c3120);
		box-shadow:
			0 4px 0 #1f2313,
			0 10px 18px rgba(30, 26, 12, 0.3);
		color: #f2ecd6;
		transition: transform var(--t-base) var(--ease);
	}
	.topbar.hidden {
		transform: translateY(calc(-100% + 6px));
	}
	.topbar-row {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 12px 14px 11px;
	}
	.icon-btn {
		flex: none;
		width: 34px;
		height: 34px;
		border: 1.5px solid rgba(255, 255, 255, 0.25);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.12);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
		color: #f2ecd6;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.icon-btn.aa {
		font-family: var(--font-read);
		font-weight: 700;
		font-size: 13px;
	}
	.crumb {
		flex: 1;
		min-width: 0;
	}
	.ctitle {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 16px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.csub {
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #c3bb98;
		margin-top: 2px;
	}
	.offline-chip {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: #d8ecb4;
		background: rgba(127, 145, 83, 0.35);
		border: 1px solid rgba(180, 205, 130, 0.45);
		border-radius: 6px;
		padding: 5px 7px;
	}
	.offline-chip :global(svg circle) {
		fill: rgba(180, 205, 130, 0.25);
		stroke: #d8ecb4;
	}
	.offline-chip :global(svg path) {
		stroke: #d8ecb4;
	}
	/* brass progress rail — recessed track, warm fill */
	.progress-track {
		height: 7px;
		background: #ddd3b1;
		box-shadow: inset 0 1px 3px rgba(80, 68, 35, 0.4);
		overflow: hidden;
	}
	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #b5883a, #f0cf82);
		transition: width 80ms linear;
	}

	.scroll {
		flex: 1;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}
	.col {
		padding: 20px 22px 120px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.chips {
		display: flex;
		gap: 8px;
	}
	/* raised brass pills */
	.rchip {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #5c5537;
		background: linear-gradient(#f6efd9, #e6ddbf);
		border: 1.5px solid #b3aa88;
		border-radius: 20px;
		padding: 5px 10px;
		box-shadow: 0 2px 0 #c8bd99;
	}
	.rchip.khaki {
		color: #8d6a24;
	}
	/* raised cream dossier sheet wrapping the notes */
	.dossier-sheet {
		border: 1.5px solid #4f4a2e;
		border-radius: 14px;
		background: linear-gradient(var(--bg-raise, #fdf8ea), var(--bg-2, #f4ecd6));
		box-shadow:
			0 4px 0 #c2b795,
			0 12px 20px rgba(60, 50, 25, 0.16),
			inset 0 1px 0 #fff;
		padding: 15px 15px 16px;
	}
	.reader-sepia .dossier-sheet {
		background: linear-gradient(#f7eed6, #efe2c2);
	}
	/* stat tiles */
	.stat-tiles {
		display: flex;
		gap: 9px;
	}
	.stile {
		flex: 1;
		border: 1.5px solid #6d6440;
		border-radius: 11px;
		background: linear-gradient(#fdf8ea, #f2ead3);
		box-shadow: 0 3px 0 #c8bd99;
		padding: 9px 11px;
	}
	.st-k {
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.14em;
		color: #8b8158;
	}
	.st-v {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 15px;
		color: #2f2a1c;
		margin-top: 2px;
	}
	.st-v.rust {
		color: #a04a2c;
	}
	.st-u {
		font-size: 10px;
	}

	/* notes typography — Source Serif at reader sizes, one accent per block */
	.notes {
		font-size: var(--reader-fs, 16px);
	}
	.serif .notes {
		font-family: var(--font-read);
	}
	.notes :global(h1),
	.notes :global(h2),
	.notes :global(h3) {
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		line-height: 1.2;
		display: flex;
		align-items: center;
		gap: 9px;
		color: #5c5537;
	}
	/* accent bar to the left of each heading (rust for the lead title, brass under) */
	.notes :global(h1)::before,
	.notes :global(h2)::before,
	.notes :global(h3)::before {
		content: '';
		flex: none;
		width: 5px;
		border-radius: 3px;
		align-self: stretch;
		background: #b5883a;
	}
	.notes :global(h1) {
		font-size: 1.3em;
		margin: 4px 0 6px;
		color: #2f2a1c;
	}
	.notes :global(h1)::before {
		background: linear-gradient(#c9622f, #96401d);
	}
	.notes :global(h2) {
		font-size: 1.1em;
		margin: 18px 0 6px;
	}
	.notes :global(h3) {
		font-size: 0.98em;
		margin: 14px 0 4px;
	}
	.notes :global(p),
	.notes :global(li) {
		line-height: 1.7;
		margin: 0 0 2px;
	}
	.notes :global(ul),
	.notes :global(ol) {
		padding-left: 22px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 4px 0;
	}
	.notes :global(strong) {
		font-weight: 900;
	}
	.notes :global(em) {
		font-style: italic;
	}
	/* blockquote → EXAM ANGLE accent block */
	.notes :global(blockquote) {
		margin: 12px 0;
		padding: 12px 16px;
		background: var(--blue-tint);
		border: var(--bw) solid var(--blue-deep);
		border-radius: var(--r-lg);
		font-size: 0.92em;
	}
	.notes :global(blockquote p) {
		margin: 0;
	}
	.notes :global(hr) {
		border: none;
		border-top: var(--bw) solid var(--line-soft);
		margin: 16px 0;
	}
	.notes :global(code) {
		font-family: ui-monospace, monospace;
		font-size: 0.88em;
		background: var(--bg-2);
		padding: 1px 5px;
		border-radius: var(--r-sm);
	}
	.notes :global(a) {
		color: var(--blue-deep);
		text-decoration: underline;
	}
	/* tables scroll horizontally past their column with an edge affordance */
	.notes :global(.table-scroll) {
		overflow-x: auto;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		margin: 12px 0;
	}
	.notes :global(table) {
		border-collapse: collapse;
		width: 100%;
		font-size: 0.9em;
	}
	.notes :global(th),
	.notes :global(td) {
		padding: 9px 12px;
		text-align: left;
		border-bottom: var(--bw) solid var(--line-soft);
		border-left: var(--bw) solid var(--line-soft);
	}
	.notes :global(th) {
		background: var(--bg-1);
		font-weight: 900;
		font-size: 0.82em;
		font-family: var(--font-ui);
	}
	.notes :global(th:first-child),
	.notes :global(td:first-child) {
		border-left: none;
	}

	.endcap {
		text-align: center;
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
		padding: 12px 0;
	}

	/* paywall (free user, gated topic) */
	.paywall {
		position: relative;
		margin-top: -60px;
	}
	.fade {
		height: 80px;
		background: linear-gradient(180deg, transparent, var(--bg-0));
	}
	.pcard {
		background: var(--bg-2);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		padding: 18px;
		text-align: center;
		box-shadow: var(--shadow-2);
	}
	.ptitle {
		font-family: var(--font-display);
		font-size: 17px;
		text-transform: uppercase;
	}
	.pcard p {
		font-size: 13px;
		color: var(--ink-2);
		line-height: 1.6;
		margin: 8px 0 14px;
	}
	.pcta {
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 14px;
		background: var(--orange);
		color: var(--ink-1);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 12px 20px;
		min-height: 44px;
		cursor: pointer;
	}

	/* sticky quiz CTA */
	.cta-wrap {
		flex: none;
		padding: 14px 20px 18px;
		background: linear-gradient(180deg, transparent, var(--bg-0) 40%);
		margin-top: -8px;
	}
	/* raised rust ATTACK bar */
	.cta {
		width: 100%;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 15px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #fff;
		background: linear-gradient(#c9622f, #96401d);
		border: 1.5px solid #742d13;
		border-radius: 16px;
		padding: 15px;
		min-height: 50px;
		cursor: pointer;
		box-shadow:
			0 5px 0 #742d13,
			0 14px 22px rgba(90, 40, 15, 0.32),
			inset 0 1px 0 rgba(255, 255, 255, 0.35);
		transition:
			transform var(--t-fast) var(--ease),
			box-shadow var(--t-fast) var(--ease);
	}
	.cta:active {
		transform: translateY(3px);
		box-shadow:
			0 2px 0 #742d13,
			inset 0 1px 0 rgba(255, 255, 255, 0.35);
	}
	.cta.pulse {
		animation: cta-pulse 600ms var(--ease-pop);
	}
	@keyframes cta-pulse {
		50% {
			transform: scale(1.03);
		}
	}

	/* controls sheet */
	.ctl {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 18px;
	}
	.ctl-head {
		display: flex;
		justify-content: space-between;
		font-size: 11.5px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.ctl-head .val {
		color: var(--ink-1);
	}
	.ctl-label {
		font-size: 11.5px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.size-row {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.size-row input {
		flex: 1;
		accent-color: var(--blue);
	}
	.a-sm {
		font-family: var(--font-read);
		font-size: 13px;
	}
	.a-lg {
		font-family: var(--font-read);
		font-size: 21px;
	}
	.themes {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 10px;
	}
	.swatch {
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 12px 6px;
		text-align: center;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: center;
	}
	.swatch.active {
		border-width: var(--bw-bold);
		box-shadow: var(--shadow-2);
	}
	.sw-paper {
		background: #f3ecdc;
		color: #33301f;
	}
	.sw-sepia {
		background: #f3e6c9;
		color: #4a3f28;
	}
	.sw-night {
		background: #3d3626;
		color: #e9e6dd;
	}
	.swatch .aa {
		font-family: var(--font-read);
		font-size: 14px;
	}
	.sw-label {
		font-size: 9.5px;
		font-weight: 900;
	}
	.serif-row {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 12px 14px;
		margin-bottom: 10px;
	}
	.serif-title {
		font-weight: 900;
		font-size: 13px;
	}
	.serif-sub {
		font-size: 10.5px;
		color: var(--ink-3);
	}
	.toggle {
		width: 46px;
		height: 26px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		background: var(--bg-1);
		position: relative;
		cursor: pointer;
		flex: none;
		transition: background var(--t-fast) var(--ease);
	}
	.toggle.on {
		background: var(--green);
	}
	.knob {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 19px;
		height: 19px;
		border-radius: var(--r-full);
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		transition: left var(--t-fast) var(--ease);
	}
	.toggle.on .knob {
		left: 21px;
	}
	.ctl-foot {
		text-align: center;
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
	}

	/* miss / offline states */
	.miss {
		padding: 60px 24px;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 12px;
		align-items: center;
	}
	.miss h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 24px;
		text-transform: uppercase;
	}
	.miss p {
		font-size: 13px;
		color: var(--ink-2);
		max-width: 300px;
	}
	.back-btn {
		font-family: var(--font-ui);
		font-weight: 700;
		font-size: 14px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 10px 20px;
		cursor: pointer;
	}

	@media (prefers-reduced-motion: reduce) {
		.cta.pulse,
		.topbar {
			animation: none;
			transition: none;
		}
	}
</style>
