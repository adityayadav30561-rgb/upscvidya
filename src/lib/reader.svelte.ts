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
