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

/** Render markdown to sanitised HTML. Runs only where a DOM exists (SPA). */
export function renderNotes(md: string): string {
	if (!md) return '';
	const raw = marked.parse(md, { async: false }) as string;
	if (typeof document === 'undefined') return raw; // SSR guard (app is SPA)
	configure();
	return DOMPurify.sanitize(raw, {
		USE_PROFILES: { html: true },
		ADD_ATTR: ['class']
	});
}
