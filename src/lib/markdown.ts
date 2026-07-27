/** Notes markdown → sanitised HTML (build book Prompt 06).
 *  GFM tables/lists, first-party content but sanitised anyway (CA/AI drafts
 *  could carry markup). Blockquotes render as the design's "EXAM ANGLE" accent
 *  block; tables are wrapped so they scroll horizontally past 3 columns. */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: false });

/** ~120 words ≈ the teaser cut; used for the free-tier fade estimate. */
export function wordCount(md: string): number {
	return md.trim().split(/\s+/).filter(Boolean).length;
}

let configured = false;
function configure() {
	if (configured) return;
	configured = true;
	// wrap every table so overflow scrolls inside its own container
	DOMPurify.addHook('afterSanitizeElements', (node) => {
		if (node.nodeName === 'TABLE' && node.parentElement?.className !== 'table-scroll') {
			const wrap = document.createElement('div');
			wrap.className = 'table-scroll';
			node.parentNode?.insertBefore(wrap, node);
			wrap.appendChild(node);
		}
	});
}

/** Admonition callouts. Authors (and the AI when it drafts notes) mark a key
 *  takeaway as a blockquote led by `[!type]`, e.g.
 *    > [!note] Socialist, secular and integrity were added by the 42nd Amendment.
 *  These render as the Field Dossier callout boxes. A plain blockquote with no
 *  marker stays the default EXAM ANGLE block. */
const CALLOUTS: Record<string, { cls: string; label: string }> = {
	note: { cls: 'note', label: 'FIELD NOTE' },
	field: { cls: 'note', label: 'FIELD NOTE' },
	exam: { cls: 'exam', label: 'EXAM ANGLE' },
	tip: { cls: 'tip', label: 'TIP' },
	warn: { cls: 'warn', label: 'WATCH OUT' }
};

/** Rewrite `<blockquote><p>[!type] …</p>…</blockquote>` → a callout div. */
function transformCallouts(html: string): string {
	return html.replace(/<blockquote>\s*([\s\S]*?)\s*<\/blockquote>/g, (whole, inner) => {
		const m = inner.match(/^<p>\s*\[!(\w+)\]\s*/i);
		if (!m) return whole; // unmarked → leave as an exam-angle blockquote
		const spec = CALLOUTS[m[1].toLowerCase()];
		if (!spec) return whole;
		const body = inner.replace(/^<p>\s*\[!\w+\]\s*/i, '<p>');
		return `<div class="callout ${spec.cls}"><span class="callout-label">${spec.label}</span><div class="callout-body">${body}</div></div>`;
	});
}

/** Render markdown to sanitised HTML. Runs only where a DOM exists (SPA). */
export function renderNotes(md: string): string {
	if (!md) return '';
	const raw = transformCallouts(marked.parse(md, { async: false }) as string);
	if (typeof document === 'undefined') return raw; // SSR guard (app is SPA)
	configure();
	return DOMPurify.sanitize(raw, {
		USE_PROFILES: { html: true },
		ADD_ATTR: ['class']
	});
}

/* ══════════════════════════════════════════════════════════════════════
   IN-CHAPTER RETRIEVAL PRACTICE
   Low-stakes recall woven through the notes, not just at the end of them.
   Authors mark a prompt with a `:::` block:

     :::predict Which amendment added "socialist" to the Preamble?
     The **42nd Amendment (1976)** — the only amendment to the Preamble.
     :::

     :::cloze
     Article {{14}} deals with the Right to Equality.
     The Objectives Resolution was moved by {{Nehru|Jawaharlal Nehru}}.
     :::

     :::recall Explain the basic structure doctrine in your own words.
     Model answer markdown …
     :::

   These are UNGRADED and never touch the server: a client-reported recall
   would be a free XP farm, and XP has exactly one authority (the hooks).
   Because a Svelte component cannot be mounted inside `{@html}`, the reader
   consumes a BLOCK LIST — prose chunks stay HTML, prompts become components.
   ══════════════════════════════════════════════════════════════════════ */

export type ClozePart = { text: string } | { blank: string[]; key: string };
export type ClozeLine = { id: string; parts: ClozePart[] };

export type NoteBlock =
	| { kind: 'html'; id: string; html: string }
	| { kind: 'predict'; id: string; prompt: string; html: string }
	| { kind: 'recall'; id: string; prompt: string; html: string }
	| { kind: 'cloze'; id: string; lines: ClozeLine[] };

/** Every block except prose — what RecallBlock.svelte renders. */
export type RecallPrompt = Exclude<NoteBlock, { kind: 'html' }>;

const BLOCK_OPEN = /^:::(predict|cloze|recall)\s*(.*)$/i;
const BLOCK_CLOSE = /^:::\s*$/;

/** `Article {{14}} deals with …` → text/blank parts. `|` separates accepted
 *  alternatives for one blank. */
function parseClozeLine(line: string, id: string): ClozeLine {
	const parts: ClozePart[] = [];
	const re = /\{\{([^}]+)\}\}/g;
	let last = 0;
	let k = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(line)) !== null) {
		if (m.index > last) parts.push({ text: line.slice(last, m.index) });
		parts.push({
			blank: m[1]
				.split('|')
				.map((s) => s.trim())
				.filter(Boolean),
			key: `${id}-b${k++}`
		});
		last = m.index + m[0].length;
	}
	if (last < line.length) parts.push({ text: line.slice(last) });
	return { id, parts };
}

/** Fold case/punctuation/spacing away so "22 January, 1947" matches
 *  "22 january 1947". Deliberately forgiving — this is practice, not marking. */
export function normalizeAnswer(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export function isClozeCorrect(input: string, answers: string[]): boolean {
	const got = normalizeAnswer(input);
	if (!got) return false;
	return answers.some((a) => normalizeAnswer(a) === got);
}

/** Split notes markdown into prose blocks + retrieval prompts, in order.
 *  Ids are positional, so they stay stable across re-renders of one topic
 *  (they key the local attempt memory). */
export function renderBlocks(md: string): NoteBlock[] {
	if (!md) return [];
	const lines = md.split(/\r?\n/);
	const blocks: NoteBlock[] = [];
	let buf: string[] = [];
	let fenced = false;
	let n = 0;

	const flushProse = () => {
		const src = buf.join('\n').trim();
		buf = [];
		if (src) blocks.push({ kind: 'html', id: `h${n++}`, html: renderNotes(src) });
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/^\s*```/.test(line)) fenced = !fenced;
		const open = fenced ? null : line.match(BLOCK_OPEN);
		if (!open) {
			buf.push(line);
			continue;
		}

		const kind = open[1].toLowerCase() as 'predict' | 'cloze' | 'recall';
		const head = open[2].trim();
		const body: string[] = [];
		for (i++; i < lines.length && !BLOCK_CLOSE.test(lines[i]); i++) body.push(lines[i]);

		flushProse();
		const id = `${kind}-${n++}`;
		if (kind === 'cloze') {
			const src = (head ? [head, ...body] : body).map((l) => l.trim()).filter(Boolean);
			blocks.push({ kind, id, lines: src.map((l, j) => parseClozeLine(l, `${id}-l${j}`)) });
		} else {
			blocks.push({ kind, id, prompt: head, html: renderNotes(body.join('\n').trim()) });
		}
	}
	flushProse();
	return blocks;
}
