<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { renderBlocks } from '$lib/markdown';
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
	import RecallBlock from '$lib/components/RecallBlock.svelte';

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

	/* prose stays HTML; retrieval prompts become components — a Svelte
	   component cannot be mounted inside {@html}, so the notes arrive as a
	   block list instead of one string. */
	const blocks = $derived(view ? renderBlocks(view.md) : []);
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

	/* horizontal page-turn + mark-read + resume
	   Pagination is CSS multi-column: the content box is exactly one page wide and
	   `column-width` equal to it, so the flow spills into further columns to the
	   right. We then translate by whole pages. This reflows arbitrary HTML — tables,
	   callouts, RecallBlock — without measuring or splitting nodes by hand. */
	let pagerEl = $state<HTMLElement | null>(null);
	let pagesEl = $state<HTMLElement | null>(null);
	let bodyEl = $state<HTMLElement | null>(null);
	let page = $state(0);
	let pageCount = $state(1);
	let pageW = $state(0);
	let dragDX = $state(0);
	let dragging = $state(false);
	let measured = $state(false);
	const GAP = 36;
	const progress = $derived(pageCount > 1 ? page / (pageCount - 1) : 1);
	let ctaPulsed = $state(false);
	let cached = $state(false);
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

	/** Recount pages. Cheap, so it runs on resize and on any font-size change. */
	function measure() {
		const el = pagesEl;
		if (!el) return;
		const w = el.clientWidth;
		if (w <= 0) return;
		const total = Math.max(1, Math.round((el.scrollWidth + GAP) / (w + GAP)));
		pageCount = total;
		if (page > total - 1) page = total - 1;
		measured = true;
		if (import.meta.env.DEV) warnSparsePages(el, w, total);
	}

	/**
	 * Dev-only guard: a page must not come out (near-)empty.
	 *
	 * It happens when a MONOLITHIC block — one that cannot be fragmented, e.g. an
	 * `overflow: auto` wrapper or anything with `break-inside: avoid` — is taller
	 * than the space left, so it jumps to the next page as a unit and strands
	 * whatever preceded it (a heading, typically) on a nearly blank page.
	 * Authoring a new chapter surfaces the problem immediately instead of after
	 * someone notices it in the app.
	 */
	function warnSparsePages(el: HTMLElement, w: number, total: number) {
		const base = el.getBoundingClientRect();
		const h = el.clientHeight;
		if (h <= 0) return;
		const extent: Record<number, { top: number; bot: number }> = {};
		const walk = (node: Element) => {
			for (const c of node.children) {
				if (c.children.length && !['TABLE', 'UL', 'OL'].includes(c.tagName)) {
					walk(c);
					continue;
				}
				for (const r of c.getClientRects()) {
					if (r.height < 1) continue;
					const i = Math.round((r.left - base.left) / (w + GAP));
					const top = r.top - base.top;
					const e = (extent[i] ??= { top: Infinity, bot: -Infinity });
					e.top = Math.min(e.top, top);
					e.bot = Math.max(e.bot, top + r.height);
				}
			}
		};
		if (bodyEl) walk(bodyEl);
		const sparse: string[] = [];
		for (let i = 0; i < total - 1; i++) {
			// the final page is legitimately short — it is the end of the chapter
			const e = extent[i];
			const pct = e ? Math.round(((e.bot - e.top) / h) * 100) : 0;
			if (pct < 45) sparse.push(`page ${i + 1} (${pct}% full)`);
		}
		if (sparse.length) {
			console.warn(
				`[reader] ${data.code}: near-empty page(s) — ${sparse.join(', ')}. ` +
					`Usually a tall un-fragmentable block (overflow wrapper or break-inside:avoid) ` +
					`pushed to the next page, stranding the heading above it.`
			);
		}
	}

	function afterTurn() {
		if (progress >= 0.99) ctaPulsed = true;
		if (progress >= 0.8 && !view?.teaser) markRead();
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => saveResume(data.code, progress), 250);
	}

	function goTo(i: number) {
		page = Math.min(pageCount - 1, Math.max(0, i));
		afterTurn();
	}
	const nextPage = () => goTo(page + 1);
	const prevPage = () => goTo(page - 1);

	/* ---- drag / swipe: finger or mouse, horizontal only ---- */
	let startX = 0;
	let startY = 0;
	let axis: 'x' | 'y' | null = null;
	let pid = -1;

	function onDown(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		// never hijack a gesture that starts on something interactive
		const t = e.target as HTMLElement | null;
		if (t?.closest('input, textarea, select, button, a, .table-scroll')) return;
		pid = e.pointerId;
		startX = e.clientX;
		startY = e.clientY;
		axis = null;
		dragging = true;
		dragDX = 0;
	}

	function onMove(e: PointerEvent) {
		if (!dragging || e.pointerId !== pid) return;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		if (!axis) {
			if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
			axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
			if (axis === 'y') {
				dragging = false; // let a vertical gesture belong to the page/app
				dragDX = 0;
				return;
			}
		}
		let d = dx;
		// rubber-band past the first/last page so the edges feel like paper, not a wall
		if ((page === 0 && d > 0) || (page === pageCount - 1 && d < 0)) d *= 0.35;
		dragDX = d;
	}

	function onUp(e: PointerEvent) {
		if (!dragging || e.pointerId !== pid) return;
		dragging = false;
		const threshold = Math.min(90, Math.max(40, pageW * 0.2));
		if (dragDX <= -threshold) nextPage();
		else if (dragDX >= threshold) prevPage();
		dragDX = 0;
	}

	/* trackpad / wheel — both axes turn pages, since there is nothing to scroll */
	let wheelLock = false;
	function onWheel(e: WheelEvent) {
		const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
		if (Math.abs(d) < 12) return;
		e.preventDefault();
		if (wheelLock) return;
		wheelLock = true;
		setTimeout(() => (wheelLock = false), 380);
		if (d > 0) nextPage();
		else prevPage();
	}

	function onKey(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		if (t?.closest('input, textarea')) return;
		if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); nextPage(); }
		else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prevPage(); }
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

		// paginate, then restore the reader to the page they left on
		const resume = loadResume(data.code);
		tick().then(() => {
			measure();
			if (resume > 0 && pageCount > 1) {
				page = Math.round(resume * (pageCount - 1));
				showToast('Resumed where you left off', 'info');
			}
		});

		// fonts land after first paint and change how much text fits per page
		if (typeof document !== 'undefined' && 'fonts' in document) {
			(document as Document & { fonts: FontFaceSet }).fonts.ready.then(() => measure());
		}

		const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
		if (ro && pagesEl) ro.observe(pagesEl);
		window.addEventListener('resize', measure);
		window.addEventListener('keydown', onKey);
		return () => {
			ro?.disconnect();
			window.removeEventListener('resize', measure);
			window.removeEventListener('keydown', onKey);
			clearTimeout(saveTimer);
		};
	});

	// font-size / theme changes reflow the columns, so page count must be recounted
	$effect(() => {
		void reader.fontSize;
		if (!pagesEl) return;
		requestAnimationFrame(() => measure());
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
		<!-- the bar no longer auto-hides: with paging there is no scroll-down to hide on -->
		<div class="topbar">
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

		<!-- paged body: turns left/right like a page, never scrolls vertically -->
		<div
			class="pager"
			role="region"
			aria-roledescription="paged reader"
			aria-label="{view.title} — page {page + 1} of {pageCount}"
			bind:this={pagerEl}
			onpointerdown={onDown}
			onpointermove={onMove}
			onpointerup={onUp}
			onpointercancel={onUp}
			onwheel={onWheel}
		>
			<div
				class="pages"
				class:animate={!dragging}
				class:ready={measured}
				bind:this={pagesEl}
				bind:clientWidth={pageW}
				style:column-width="{pageW}px"
				style:transform="translate3d({-page * (pageW + GAP) + dragDX}px, 0, 0)"
			>
			<div class="col" bind:this={bodyEl} style:--reader-fs="{reader.fontSize}px">
				<div class="chips">
					{#if view.bookRef}<span class="rchip khaki">{view.bookRef}</span>{/if}
					<span class="rchip">{unit?.kind === 'appendix' ? 'Drill bank' : 'Chapter'}</span>
				</div>

				<div class="dossier-sheet">
					{#each blocks as b (b.id)}
						{#if b.kind === 'html'}
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- html is DOMPurify-sanitised in renderNotes() -->
							<article class="notes">{@html b.html}</article>
						{:else}
							<RecallBlock block={b} code={data.code} />
						{/if}
					{/each}
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

			<!-- page controls: arrows + folio -->
			<div class="turn">
				<button
					class="turn-btn"
					aria-label="previous page"
					disabled={page === 0}
					onclick={prevPage}>‹</button
				>
				<div class="folio">{page + 1} <span class="folio-sep">/</span> {pageCount}</div>
				<button
					class="turn-btn"
					aria-label="next page"
					disabled={page >= pageCount - 1}
					onclick={nextPage}>›</button
				>
			</div>
		</div>

		<!-- sticky quiz CTA (hidden in teaser mode) -->
		{#if !view.teaser}
			<div class="cta-wrap">
				<button class="cta" class:pulse={ctaPulsed} data-tour="reader-cta" onclick={attemptQuiz}>
					{data.liveQuestions > 0
						? `Attempt quiz · ${data.liveQuestions} questions`
						: 'Attempt quiz'} →
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

	/* ---- paged reader ---- */
	.pager {
		flex: 1;
		position: relative;
		overflow: hidden;
		padding: 18px 22px 0;
		/* claim the horizontal axis for page turns, leave the vertical one to the app */
		touch-action: pan-y;
		-webkit-user-select: none;
		user-select: none;
	}
	.pages {
		height: calc(100% - 46px);
		column-gap: 36px;
		column-fill: auto;
		will-change: transform;
		opacity: 0;
	}
	.pages.ready {
		opacity: 1;
	}
	.pages.animate {
		transition:
			transform 340ms cubic-bezier(0.22, 0.61, 0.36, 1),
			opacity 160ms linear;
	}
	@media (prefers-reduced-motion: reduce) {
		.pages.animate {
			transition: none;
		}
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	/* Keep SHORT self-contained blocks whole. Deliberately excludes tables and
	   long lists: an unbreakable block that is taller than the space left jumps
	   to the next page as a unit, and if a heading precedes it the heading is
	   stranded on a near-empty page. Tall content must be allowed to flow. */
	.col :global(.callout),
	.col :global(blockquote),
	.col :global(pre),
	.col :global(.slip),
	.col :global(.intro),
	.stat-tiles,
	.stile,
	.pcard,
	.chips {
		break-inside: avoid;
	}
	/* The markdown renderer wraps tables in .table-scroll (overflow-x: auto) for the
	   old vertical reader. A scroll container is MONOLITHIC — it cannot be split
	   across columns, so it jumped to the next page whole and stranded the heading
	   above it on a near-empty page. Paged mode drops the scroll container and
	   makes the table fit the page instead; a horizontal scroll inside a
	   horizontally-paging reader fights the turn gesture anyway. */
	/* must out-specify the `.notes :global(.table-scroll)` rule further down */
	.pager .col :global(.notes .table-scroll) {
		overflow: visible;
		max-width: 100%;
	}
	.col :global(table) {
		break-inside: auto;
		width: 100%;
		table-layout: fixed;
	}
	.col :global(th),
	.col :global(td) {
		overflow-wrap: anywhere;
	}
	.col :global(thead) {
		display: table-header-group;
	}
	.col :global(tr),
	.col :global(li) {
		break-inside: avoid;
	}
	/* a heading must never be the last thing in a column */
	.col :global(h1),
	.col :global(h2),
	.col :global(h3),
	.col :global(h4) {
		break-after: avoid;
		break-inside: avoid;
	}
	/* the sheet is a wrapper, not a page frame — let its children flow between columns */
	.dossier-sheet {
		display: contents;
	}

	.turn {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 46px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 18px;
	}
	.turn-btn {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		border: 1px solid rgba(92, 85, 55, 0.35);
		background: linear-gradient(180deg, #f6efd8, #e6dcbb);
		box-shadow:
			0 2px 0 #c3b894,
			0 2px 6px rgba(60, 50, 20, 0.18);
		color: #5c5537;
		font-size: 20px;
		line-height: 1;
		cursor: pointer;
	}
	.turn-btn:disabled {
		opacity: 0.32;
		cursor: default;
	}
	.turn-btn:active:not(:disabled) {
		transform: translateY(1px);
	}
	.folio {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 13px;
		letter-spacing: 0.12em;
		color: #6b6444;
		min-width: 56px;
		text-align: center;
	}
	.folio-sep {
		opacity: 0.45;
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
	/* admonition callouts (author marks `> [!note] …` etc.) */
	.notes :global(.callout) {
		margin: 13px 0;
		border-radius: 10px;
		padding: 11px 12px;
		box-shadow: inset 0 1px 0 #fff;
	}
	.notes :global(.callout .callout-label) {
		display: block;
		font-family: var(--font-ui);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.16em;
	}
	.notes :global(.callout .callout-body) {
		font-size: 0.92em;
		margin-top: 4px;
	}
	.notes :global(.callout .callout-body p) {
		margin: 0 0 4px;
	}
	.notes :global(.callout.note) {
		background: #f0e7c9;
		border: 1.5px dashed #b5883a;
	}
	.notes :global(.callout.note .callout-label) {
		color: #8d6a24;
	}
	.notes :global(.callout.exam) {
		background: var(--blue-tint);
		border: var(--bw) solid var(--blue-deep);
	}
	.notes :global(.callout.exam .callout-label) {
		color: var(--blue-deep);
	}
	.notes :global(.callout.tip) {
		background: var(--green-tint);
		border: var(--bw) solid var(--green-deep);
	}
	.notes :global(.callout.tip .callout-label) {
		color: var(--green-deep);
	}
	.notes :global(.callout.warn) {
		background: var(--red-tint);
		border: var(--bw) solid var(--red-deep);
	}
	.notes :global(.callout.warn .callout-label) {
		color: var(--red-deep);
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
