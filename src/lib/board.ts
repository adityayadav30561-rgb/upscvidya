/** Battalion leaderboard client (build book Prompt 10).
 *  Rows are assembled server-side (users are self-read only), so this module
 *  only fetches, caches for 60s, and formats. */
import { pb } from './pb';
import { PUBLIC_PB_URL } from '$env/static/public';
import type { RankCode } from './ranks';

export interface BoardRow {
	rank: number;
	name: string;
	rank_code: RankCode;
	streak: number;
	xp_week: number;
	is_you: boolean;
	/** positions climbed since last week (+ve = up); null when no history */
	delta: number | null;
	anonymous?: boolean;
	unranked?: boolean;
}

export interface Board {
	battalion: { name: string; member_count: number } | null;
	week_start: string;
	week_no: number;
	seconds_left: number;
	rows: BoardRow[];
	you: BoardRow | null;
	behind: number | null;
}

/* 60s cache (build book: pull-to-refresh with 60s cache) */
const CACHE_MS = 60_000;
let cache: { at: number; data: Board } | null = null;

export function invalidateBoard() {
	cache = null;
}

export async function fetchBoard(force = false): Promise<Board> {
	if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
	const res = await fetch(`${PUBLIC_PB_URL}/api/board`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
		body: '{}'
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data?.message || 'Could not load the board');
	cache = { at: Date.now(), data: data as Board };
	return cache.data;
}

/** Settings toggle: "appear as Anonymous Cadet". Owner-writable field. */
export async function setAnonymous(on: boolean): Promise<void> {
	const id = pb.authStore.record?.id;
	if (!id) throw new Error('Not signed in');
	await pb.collection('users').update(id, { anonymous: on });
	invalidateBoard();
}

/* ---------- pure helpers (unit-tested) ---------- */

/** "2d 14h" / "14h 05m" / "48m" — countdown to the Monday reset. */
export function formatCountdown(seconds: number): string {
	if (seconds <= 0) return 'resetting';
	const d = Math.floor(seconds / 86400);
	const h = Math.floor((seconds % 86400) / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	if (d > 0) return `${d}d ${h}h`;
	if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
	return `${m}m`;
}

/** Final 6 hours pulse red (interaction notes). */
export function isFinalStretch(seconds: number): boolean {
	return seconds > 0 && seconds <= 6 * 3600;
}

/** Podium = ranks 1-3, ordered for the design's 2-1-3 pillar layout. */
export function podiumOrder(rows: BoardRow[]): (BoardRow | null)[] {
	const top = [rows[0] ?? null, rows[1] ?? null, rows[2] ?? null];
	return [top[1], top[0], top[2]]; // silver, gold, bronze
}

/** Rows below the podium (rank 4+). */
export function listRows(rows: BoardRow[]): BoardRow[] {
	return rows.slice(3);
}

/** "▲ 2 this week · 340 XP behind #6" style delta line. */
export function deltaLabel(row: BoardRow, behind: number | null): string {
	const parts: string[] = [];
	if (row.delta !== null && row.delta !== 0) {
		parts.push(`${row.delta > 0 ? '▲' : '▼'} ${Math.abs(row.delta)} this week`);
	}
	if (behind !== null && behind > 0) {
		parts.push(`${behind.toLocaleString('en-IN')} XP behind #${row.rank - 1}`);
	}
	return parts.join(' · ');
}
