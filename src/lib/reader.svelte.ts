/** Reader preferences + resume-position (build book Prompt 06).
 *  Persisted per device (localStorage). Reading theme is reader-scoped: PAPER
 *  and SEPIA are local classes; NIGHT drives the global [data-theme="dark"]
 *  tokens so the whole chrome follows. */
import { setTheme } from './theme.svelte';

export type ReaderTheme = 'paper' | 'sepia' | 'night';

const FONT_MIN = 15;
const FONT_MAX = 22;
const FONT_DEFAULT = 16;

function readNum(key: string, fallback: number, lo: number, hi: number): number {
	if (typeof localStorage === 'undefined') return fallback;
	const n = Number(localStorage.getItem(key));
	return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
}
function readBool(key: string, fallback: boolean): boolean {
	if (typeof localStorage === 'undefined') return fallback;
	const v = localStorage.getItem(key);
	return v === null ? fallback : v === 'true';
}
function readTheme(): ReaderTheme {
	if (typeof localStorage === 'undefined') return 'paper';
	const v = localStorage.getItem('reader-theme');
	return v === 'sepia' || v === 'night' ? v : 'paper';
}

const state = $state({
	fontSize: readNum('reader-font', FONT_DEFAULT, FONT_MIN, FONT_MAX),
	serif: readBool('reader-serif', true),
	theme: readTheme()
});

export const reader = {
	get fontSize() {
		return state.fontSize;
	},
	get serif() {
		return state.serif;
	},
	get theme() {
		return state.theme;
	},
	get min() {
		return FONT_MIN;
	},
	get max() {
		return FONT_MAX;
	}
};

export function setFontSize(px: number) {
	state.fontSize = Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(px)));
	if (typeof localStorage !== 'undefined') localStorage.setItem('reader-font', String(state.fontSize));
}

export function setSerif(on: boolean) {
	state.serif = on;
	if (typeof localStorage !== 'undefined') localStorage.setItem('reader-serif', String(on));
}

/** Applying NIGHT also flips the global theme; leaving NIGHT restores light. */
export function setReaderTheme(theme: ReaderTheme) {
	state.theme = theme;
	if (typeof localStorage !== 'undefined') localStorage.setItem('reader-theme', theme);
	setTheme(theme === 'night' ? 'dark' : 'light');
}

/** Re-assert the global theme on reader mount (NIGHT persists across nav). */
export function syncGlobalTheme() {
	if (state.theme === 'night') setTheme('dark');
}

/* ---------- resume position (interaction notes: "Continue from section N") ---------- */

export function saveResume(code: string, ratio: number) {
	if (typeof localStorage === 'undefined') return;
	if (ratio > 0.02 && ratio < 0.95) localStorage.setItem(`reader-pos-${code}`, ratio.toFixed(3));
	else localStorage.removeItem(`reader-pos-${code}`);
}

export function loadResume(code: string): number {
	if (typeof localStorage === 'undefined') return 0;
	const n = Number(localStorage.getItem(`reader-pos-${code}`));
	return Number.isFinite(n) && n > 0 && n < 1 ? n : 0;
}

/* ---------- in-chapter retrieval practice (ungraded, device-local) ----------
 * Attempts stay on the device on purpose: nothing here is server-scored, so
 * nothing here can be farmed for XP. Kept per topic so the reader can later
 * surface "facts you missed" without a single network call. */

export type RecallMark = 'hit' | 'miss';
/** A mark carries the fact itself, not just the block id — the quiz pre-flight
 *  has to print "Article 14 deals with…", and `cloze-2` says nothing. */
export type RecallEntry = { m: RecallMark; l: string; t: number };
type RecallMap = Record<string, RecallEntry>;

/** Entries written before labels existed were bare 'hit' | 'miss' strings. */
function coerce(v: unknown): RecallEntry | null {
	if (v === 'hit' || v === 'miss') return { m: v, l: '', t: 0 };
	if (v && typeof v === 'object') {
		const e = v as Partial<RecallEntry>;
		if (e.m === 'hit' || e.m === 'miss') {
			return { m: e.m, l: typeof e.l === 'string' ? e.l : '', t: typeof e.t === 'number' ? e.t : 0 };
		}
	}
	return null;
}

export function loadRecallMap(code: string): RecallMap {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw = localStorage.getItem(`recall-${code}`);
		const parsed: unknown = raw ? JSON.parse(raw) : null;
		if (!parsed || typeof parsed !== 'object') return {};
		const out: RecallMap = {};
		for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
			const e = coerce(v);
			if (e) out[k] = e;
		}
		return out;
	} catch {
		return {};
	}
}

export function loadRecall(code: string, id: string): RecallMark | null {
	return loadRecallMap(code)[id]?.m ?? null;
}

export function markRecall(code: string, id: string, mark: RecallMark, label = '') {
	if (typeof localStorage === 'undefined') return;
	const map = loadRecallMap(code);
	map[id] = { m: mark, l: label || map[id]?.l || '', t: Date.now() };
	localStorage.setItem(`recall-${code}`, JSON.stringify(map));
}

export type WeakFact = { id: string; label: string; at: number };

/** Facts this device got wrong while reading, newest first. */
export function weakFacts(code: string): WeakFact[] {
	const map = loadRecallMap(code);
	return Object.entries(map)
		.filter(([, e]) => e.m === 'miss')
		.map(([id, e]) => ({ id, label: e.l, at: e.t }))
		.sort((a, b) => b.at - a.at);
}

/** Misses the quiz pre-flight hasn't shown yet — so a chapter doesn't nag on
 *  every retake, but a fresh miss still gets surfaced. */
export function unseenWeakFacts(code: string): WeakFact[] {
	if (typeof localStorage === 'undefined') return [];
	const since = Number(localStorage.getItem(`recall-brief-${code}`)) || 0;
	return weakFacts(code).filter((f) => f.at > since);
}

export function stampWeakFactsSeen(code: string) {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(`recall-brief-${code}`, String(Date.now()));
}

export function clearRecall(code: string) {
	if (typeof localStorage === 'undefined') return;
	localStorage.removeItem(`recall-${code}`);
	localStorage.removeItem(`recall-brief-${code}`);
}

/* ---------- first-encounter explainer ----------
 * A prompt slip appearing mid-chapter reads as "what is this?" unless the app
 * says why once. Claimed by the first slip rendered on a page, shown once per
 * device. */
let introClaimed = false;

export function claimRecallIntro(): boolean {
	if (introClaimed) return false;
	if (typeof localStorage === 'undefined') return false;
	if (localStorage.getItem('recall-intro-seen') === '1') return false;
	introClaimed = true;
	return true;
}

export function dismissRecallIntro() {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem('recall-intro-seen', '1');
}

/** Free-recall drafts are kept per prompt so a scroll away doesn't lose them. */
export function saveRecallText(code: string, id: string, text: string) {
	if (typeof localStorage === 'undefined') return;
	if (text.trim()) localStorage.setItem(`recall-txt-${code}-${id}`, text);
	else localStorage.removeItem(`recall-txt-${code}-${id}`);
}

export function loadRecallText(code: string, id: string): string {
	if (typeof localStorage === 'undefined') return '';
	return localStorage.getItem(`recall-txt-${code}-${id}`) ?? '';
}
