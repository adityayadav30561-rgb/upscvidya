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
