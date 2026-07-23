/** Prerendered PYQ landing pages (build book Prompt 12, point 5).
 *  These are the organic-search doors: static HTML with real counts and a
 *  topic breakdown — summaries only, never the questions themselves.
 *  Data comes from the repo snapshot so the build needs no live PocketBase. */
import { error } from '@sveltejs/kit';
import snapshot from '$lib/pyq-snapshot.json';

export const prerender = true;
export const ssr = true; // these must exist as crawlable HTML

/** Tells the prerenderer which slugs to emit. */
export function entries() {
	return snapshot.papers.map((p) => ({ slug: p.slug }));
}

export function load({ params }) {
	const paper = snapshot.papers.find((p) => p.slug === params.slug);
	if (!paper) error(404, 'Paper not found');
	return { paper, totalQuestions: snapshot.total_questions, papers: snapshot.papers.length };
}
