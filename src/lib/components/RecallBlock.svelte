<script lang="ts">
	/** In-chapter retrieval practice (predict / cloze / free recall).
	 *  Ungraded and offline-safe by design: it never calls the server, so it can
	 *  never mint XP. Rendered by the topic reader between prose blocks —
	 *  see renderBlocks() in $lib/markdown. */
	import { factLabel, isClozeCorrect, type ClozePart, type RecallPrompt } from '$lib/markdown';
	import {
		loadRecall,
		markRecall,
		loadRecallText,
		saveRecallText,
		claimRecallIntro,
		dismissRecallIntro,
		type RecallMark
	} from '$lib/reader.svelte';
	import { haptic } from '$lib/native';

	let { block, code }: { block: RecallPrompt; code: string } = $props();

	/* stored state is read through a derived so a re-keyed block picks up its
	   own memory; the override holds this sitting's answer */
	let markOverride = $state<RecallMark | null>(null);
	const mark = $derived(markOverride ?? loadRecall(code, block.id));
	let draftOverride = $state<string | null>(null);
	const draft = $derived(
		draftOverride ?? (block.kind === 'recall' ? loadRecallText(code, block.id) : '')
	);

	let revealed = $state(false);
	let checked = $state(false);
	let shown = $state(false); // cloze: answers given away
	let values = $state<Record<string, string>>({});

	/* the first slip a device ever renders explains itself, once */
	let introOpen = $state(claimRecallIntro());
	function closeIntro() {
		introOpen = false;
		dismissRecallIntro();
	}

	type Blank = Extract<ClozePart, { blank: string[] }>;
	const isBlank = (p: ClozePart): p is Blank => 'blank' in p;

	const blanks = $derived(
		block.kind === 'cloze' ? block.lines.flatMap((l) => l.parts.filter(isBlank)) : []
	);
	const allCorrect = $derived(
		blanks.length > 0 && blanks.every((b) => isClozeCorrect(values[b.key] ?? '', b.blank))
	);

	const KICKER: Record<RecallPrompt['kind'], string> = {
		predict: 'predict · before you read on',
		cloze: 'fill the blank',
		recall: 'explain it back'
	};

	function setMark(m: RecallMark, label: string) {
		markOverride = m;
		markRecall(code, block.id, m, label);
		haptic();
	}

	function reveal() {
		revealed = true;
		haptic();
	}

	/** The fact itself, not the block id — this is what the quiz pre-flight
	 *  prints back ("Article 14 deals with the Right to Equality."). Built in
	 *  $lib/markdown so it stays pure and unit-tested. */
	const label = () => factLabel(block, values);

	function check() {
		checked = true;
		setMark(allCorrect ? 'hit' : 'miss', label());
	}

	function blankState(b: Blank): '' | 'ok' | 'bad' {
		if (shown) return 'ok';
		if (!checked) return '';
		return isClozeCorrect(values[b.key] ?? '', b.blank) ? 'ok' : 'bad';
	}

	function onDraft(e: Event) {
		draftOverride = (e.currentTarget as HTMLTextAreaElement).value;
		saveRecallText(code, block.id, draftOverride);
	}
</script>

{#if introOpen}
	<div class="intro">
		<span class="intro-k">new · how these work</span>
		<p class="intro-b">
			Try to answer <strong>before</strong> you reveal. Pulling a fact out of memory fixes it far
			better than reading it again — that's the whole point. Nothing here is scored and it never
			affects your XP.
		</p>
		<button class="btn3d btn3d-quiet intro-x" onclick={closeIntro}>Understood</button>
	</div>
{/if}

<div class="slip" class:hit={mark === 'hit'} class:miss={mark === 'miss'}>
	<div class="slip-head">
		<span class="kicker">{KICKER[block.kind]}</span>
		{#if mark}
			<span class="mark-chip" class:bad={mark === 'miss'}>{mark === 'hit' ? 'RECALLED' : 'REVIEW'}</span>
		{/if}
	</div>

	{#if block.kind === 'cloze'}
		<div class="cloze">
			{#each block.lines as line (line.id)}
				<p class="cline">
					{#each line.parts as part, i (i)}
						{#if isBlank(part)}
							<input
								class="socket {blankState(part)}"
								type="text"
								autocomplete="off"
								autocapitalize="off"
								spellcheck="false"
								aria-label="blank {i + 1}"
								style:width="{Math.max(4, Math.min(20, part.blank[0].length + 2))}ch"
								value={shown ? part.blank[0] : (values[part.key] ?? '')}
								disabled={shown}
								oninput={(e) => (values[part.key] = e.currentTarget.value)}
								onkeydown={(e) => e.key === 'Enter' && check()}
							/>
						{:else}<span>{part.text}</span>{/if}
					{/each}
				</p>
			{/each}
		</div>
		<div class="actions">
			{#if !shown}
				<button class="btn3d act" onclick={check}>{checked ? 'Check again' : 'Check'}</button>
			{/if}
			{#if checked && !allCorrect && !shown}
				<button class="btn3d btn3d-quiet act" onclick={() => (shown = true)}>Show answers</button>
			{/if}
		</div>
		{#if checked || shown}
			<p class="verdict rev" class:good={allCorrect && !shown}>
				{#if shown}Answers filled in — the fact is what matters, not the score.
				{:else if allCorrect}All blanks recalled.
				{:else}Some blanks missed — try again, then show.{/if}
			</p>
		{/if}
	{:else}
		<p class="prompt">{block.prompt}</p>

		{#if block.kind === 'recall'}
			<textarea
				class="scratch"
				rows="3"
				placeholder="Say it in your own words first — nothing is scored."
				value={draft}
				oninput={onDraft}
			></textarea>
		{/if}

		{#if !revealed}
			<div class="actions">
				<button class="btn3d {block.kind === 'recall' ? 'btn3d-quiet' : ''} act" onclick={reveal}>
					{block.kind === 'recall' ? 'Reveal model answer' : 'Reveal'}
				</button>
			</div>
		{:else}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- html is DOMPurify-sanitised in renderBlocks() -->
			<div class="answer rev">{@html block.html}</div>
			{#if !mark}
				<div class="selfmark">
					<span class="sm-q">Did you have it?</span>
					<button class="mk got" onclick={() => setMark('hit', label())}>Got it</button>
					<button class="mk missed" onclick={() => setMark('miss', label())}>Missed</button>
				</div>
			{/if}
		{/if}
	{/if}

	<span class="foot">not scored · retrieval practice</span>
</div>

<style>
	/* first-encounter explainer — raised card stock so it reads as the app
	   talking, not as another prompt */
	.intro {
		margin: 15px 0 -6px;
		padding: 12px 13px;
		border-radius: var(--r-lg);
		background: var(--grad-plate);
		border: var(--bw) solid var(--khaki);
		box-shadow: 0 3px 0 var(--edge), var(--emboss);
		display: flex;
		flex-direction: column;
		gap: 7px;
		animation: rise var(--t-base) var(--ease);
	}
	.intro-k {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 10px;
		letter-spacing: var(--track-label);
		text-transform: uppercase;
		color: var(--gold-edge);
	}
	.intro-b {
		margin: 0;
		font-family: var(--font-ui);
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--ink-2);
	}
	.intro-x {
		align-self: flex-start;
		font-size: 11px;
		letter-spacing: 0.1em;
		padding: 7px 12px;
	}

	/* a prompt slip pressed into the dossier sheet */
	.slip {
		margin: 15px 0;
		padding: 12px 13px 10px;
		border-radius: var(--r-lg);
		background: var(--bg-1);
		border: var(--bw) dashed var(--orange-deep);
		box-shadow: var(--recess-in);
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.slip.hit {
		border-color: var(--green-deep);
	}
	.slip.miss {
		border-color: var(--red-deep);
	}
	.slip-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.kicker {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 10px;
		letter-spacing: var(--track-label);
		text-transform: uppercase;
		color: var(--orange-deep);
	}
	.slip.hit .kicker {
		color: var(--green-deep);
	}
	.mark-chip {
		font-family: var(--font-cond);
		font-weight: 700;
		font-size: 9.5px;
		letter-spacing: 0.12em;
		color: #fff;
		background: var(--grad-olive);
		border-radius: var(--r-sm);
		padding: 3px 7px;
		box-shadow: 0 2px 0 var(--green-edge);
	}
	.mark-chip.bad {
		background: linear-gradient(#a5432f, #7d2a1a);
		box-shadow: 0 2px 0 #4f1509;
	}

	.prompt {
		margin: 0;
		font-family: var(--font-read);
		font-size: 0.95em;
		line-height: var(--lh-read);
		color: var(--ink-1);
	}

	/* cloze — the blank is a recessed socket in the sentence */
	.cloze {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.cline {
		margin: 0;
		font-family: var(--font-read);
		font-size: 0.95em;
		line-height: 2;
		color: var(--ink-1);
	}
	.socket {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 0.95em;
		letter-spacing: 0.04em;
		text-align: center;
		color: var(--ink-1);
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		border-bottom-width: 2.5px;
		border-radius: var(--r-sm);
		box-shadow: var(--recess-in);
		padding: 2px 5px;
		margin: 0 2px;
		min-width: 4ch;
	}
	.socket:focus {
		outline: none;
		border-color: var(--orange);
		box-shadow: var(--recess-in), 0 0 0 2px rgba(201, 98, 47, 0.25);
	}
	.socket.ok {
		background: var(--grad-brass);
		border-color: var(--gold-edge);
		color: #3b2f11;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
	}
	.socket.bad {
		background: var(--red-tint);
		border-color: var(--red-deep);
		color: var(--red-deep);
	}
	.socket:disabled {
		opacity: 1;
	}

	.scratch {
		width: 100%;
		font-family: var(--font-ui);
		font-size: 13px;
		line-height: 1.5;
		color: var(--ink-1);
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-md);
		box-shadow: var(--recess-in);
		padding: 9px 10px;
		resize: vertical;
	}
	.scratch:focus {
		outline: none;
		border-color: var(--orange);
	}

	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.act {
		font-size: 11.5px;
		letter-spacing: 0.1em;
		padding: 8px 13px;
	}

	.answer {
		font-family: var(--font-read);
		font-size: 0.93em;
		line-height: var(--lh-read);
		color: var(--ink-1);
		border-top: var(--bw) dashed var(--line-soft);
		padding-top: 9px;
	}
	.answer :global(p) {
		margin: 0 0 5px;
	}
	.answer :global(p:last-child) {
		margin-bottom: 0;
	}
	.answer :global(ul),
	.answer :global(ol) {
		margin: 4px 0;
		padding-left: 20px;
	}

	.verdict {
		margin: 0;
		font-family: var(--font-cond);
		font-size: 11.5px;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: var(--red-deep);
	}
	.verdict.good {
		color: var(--green-deep);
	}

	.selfmark {
		display: flex;
		align-items: center;
		gap: 7px;
		flex-wrap: wrap;
	}
	.sm-q {
		font-family: var(--font-cond);
		font-weight: 700;
		font-size: 11.5px;
		letter-spacing: 0.05em;
		color: var(--ink-2);
		margin-right: auto;
	}
	.mk {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #fff;
		border: none;
		border-radius: var(--r-sm);
		padding: 6px 11px;
		cursor: pointer;
	}
	.mk.got {
		background: var(--grad-olive);
		box-shadow: 0 2px 0 var(--green-edge);
	}
	.mk.missed {
		background: var(--grad-rust);
		box-shadow: 0 2px 0 var(--orange-edge);
	}
	.mk:active {
		transform: translateY(1px);
	}

	.foot {
		font-size: 8.5px;
		font-weight: 700;
		letter-spacing: var(--track-label);
		text-transform: uppercase;
		color: var(--ink-3);
	}

	/* the fold: an answer lifts into place */
	.rev {
		animation: rise var(--t-base) var(--ease);
	}
	@media (prefers-reduced-motion: reduce) {
		.rev,
		.intro {
			animation: none;
		}
		.mk:active {
			transform: none;
		}
	}
</style>
