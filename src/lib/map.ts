/** Territory map assembly + guided-path math (Prompt 05, Screen 03).
 *  Pure functions over the static registry (polity.ts) + live PB data so the
 *  whole thing unit-tests without a DOM or network. */

import { REGIONS, UNITS, ALWAYS_UNLOCKED_DRILLS, type SyllabusUnit, type RegionMeta } from './polity';
import type { Region, TopicPublic, TopicProgress, TopicState } from './types';

/** The 5 visual node states from Foundations §05. */
export type NodeVisual = 'free-roam' | 'unconquered' | 'conquered' | 'decaying' | 'gold';

export interface MapNodeData {
	unit: SyllabusUnit;
	/** live topics_public row, when content exists */
	topic?: TopicPublic;
	progress?: TopicProgress;
	visual: NodeVisual;
	/** content not yet authored — readable/quizzable nothing */
	comingSoon: boolean;
	/** appendix drill still locked (region not entered) */
	drillLocked: boolean;
	/** quiz gated behind premium for this user */
	premiumLocked: boolean;
	isNext: boolean;
}

export interface MapRegionData {
	meta: RegionMeta;
	nodes: MapNodeData[];
	conquered: number; // conquered + gold
	gold: number;
	total: number;
	pct: number; // 0-100
	secured: boolean; // 100%
	isFront: boolean; // contains the next-mission node
	started: boolean; // any progress at all
}

export interface MapData {
	regions: MapRegionData[];
	held: number; // conquered+gold across all units
	total: number;
	pct: number;
	next: MapNodeData | null;
}

/** progress state → visual node state */
export function visualFor(state: TopicState | undefined): NodeVisual {
	switch (state) {
		case 'conquered':
			return 'conquered';
		case 'gold':
			return 'gold';
		case 'decaying':
			return 'decaying';
		case 'read':
			return 'unconquered';
		default:
			return 'free-roam'; // unread / no row — readable, untouched
	}
}

const HELD: ReadonlySet<string> = new Set(['conquered', 'gold']);
/** decaying counts as "was conquered" for prerequisite purposes */
const PREREQ_OK: ReadonlySet<string> = new Set(['conquered', 'gold', 'decaying']);

/** Guided-path pick: first chapter in guided_order that is not held, has live
 *  content, and whose prerequisites are all held (or not yet live — you cannot
 *  be blocked by content that does not exist). Free roam stays absolute; this
 *  only decides the highlight. */
export function guidedNextCode(
	topicsByCode: Map<string, TopicPublic>,
	progressByCode: Map<string, TopicProgress>
): string | null {
	const chapters = UNITS.filter((u) => u.kind === 'chapter').sort((a, b) => a.order - b.order);
	for (const unit of chapters) {
		const topic = topicsByCode.get(unit.code);
		if (!topic) continue; // no content yet — can't be the mission
		const state = progressByCode.get(unit.code)?.state;
		if (state && PREREQ_OK.has(state)) continue; // already held (or decaying → revision stack's job)
		const prereqs = topic.prerequisites ?? [];
		const blocked = prereqs.some((p) => {
			if (!topicsByCode.has(p)) return false; // prereq content not live → satisfied
			const ps = progressByCode.get(p)?.state;
			return !(ps && PREREQ_OK.has(ps));
		});
		if (!blocked) return unit.code;
	}
	return null;
}

/** A drill unlocks when its region has been entered (≥1 held chapter),
 *  APX-1 is always open (master doc: available from Phase 1). */
export function drillUnlocked(
	unit: SyllabusUnit,
	heldByRegion: Map<Region, number>
): boolean {
	if (unit.kind !== 'appendix') return true;
	if (ALWAYS_UNLOCKED_DRILLS.has(unit.code)) return true;
	return (heldByRegion.get(unit.region) ?? 0) > 0;
}

export function buildMap(
	topics: TopicPublic[],
	progress: TopicProgress[],
	isPremium: boolean
): MapData {
	const topicsByCode = new Map(topics.map((t) => [t.id_code, t]));
	const topicIdToCode = new Map(topics.map((t) => [t.id, t.id_code]));
	const progressByCode = new Map<string, TopicProgress>();
	for (const p of progress) {
		const code = topicIdToCode.get(p.topic);
		if (code) progressByCode.set(code, p);
	}

	const heldByRegion = new Map<Region, number>();
	for (const unit of UNITS) {
		const st = progressByCode.get(unit.code)?.state;
		if (unit.kind === 'chapter' && st && HELD.has(st)) {
			heldByRegion.set(unit.region, (heldByRegion.get(unit.region) ?? 0) + 1);
		}
	}

	const nextCode = guidedNextCode(topicsByCode, progressByCode);

	const regions: MapRegionData[] = REGIONS.map((meta) => {
		const units = UNITS.filter((u) => u.region === meta.code).sort((a, b) => a.order - b.order);
		const nodes: MapNodeData[] = units.map((unit) => {
			const topic = topicsByCode.get(unit.code);
			const prog = progressByCode.get(unit.code);
			return {
				unit,
				topic,
				progress: prog,
				visual: visualFor(prog?.state),
				comingSoon: !topic,
				drillLocked: !drillUnlocked(unit, heldByRegion),
				premiumLocked: !!topic && !topic.is_free && !isPremium,
				isNext: unit.code === nextCode
			};
		});
		const conquered = nodes.filter((n) => n.progress && HELD.has(n.progress.state)).length;
		const gold = nodes.filter((n) => n.progress?.state === 'gold').length;
		const total = nodes.length;
		const pct = total ? Math.round((conquered / total) * 100) : 0;
		return {
			meta,
			nodes,
			conquered,
			gold,
			total,
			pct,
			secured: conquered === total,
			isFront: nodes.some((n) => n.isNext),
			started: nodes.some((n) => n.progress)
		};
	});

	const held = regions.reduce((s, r) => s + r.conquered, 0);
	const total = UNITS.length;
	const next = regions.flatMap((r) => r.nodes).find((n) => n.isNext) ?? null;

	return { regions, held, total, pct: Math.round((held / total) * 100), next };
}

/* ---------- node layout (serpentine road inside each region SVG) ---------- */

export interface NodePoint {
	x: number;
	y: number;
}

export const REGION_W = 348;
const COLS = [64, 174, 284]; // 3 nodes per row
const ROW_H = 76;
const TOP = 56;

/** Deterministic serpentine positions: rows of 3, alternating direction, with
 *  a small per-index wobble so the road reads as terrain, not a grid. */
export function layoutNodes(count: number): { points: NodePoint[]; height: number } {
	const points: NodePoint[] = [];
	for (let i = 0; i < count; i++) {
		const row = Math.floor(i / COLS.length);
		const col = i % COLS.length;
		const x = COLS[row % 2 === 0 ? col : COLS.length - 1 - col];
		const wobbleX = ((i * 37) % 21) - 10; // -10..10, deterministic
		const wobbleY = ((i * 53) % 17) - 8;
		points.push({ x: x + wobbleX, y: TOP + row * ROW_H + wobbleY });
	}
	const rows = Math.max(1, Math.ceil(count / COLS.length));
	return { points, height: TOP + rows * ROW_H + 8 };
}

/** Dotted supply-road polyline through the node points. */
export function roadPath(points: NodePoint[]): string {
	return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
}

/* ---------- conquest hand-off (quiz results → map animation) ---------- */

const CONQUEST_KEY = 'uv-conquest';

/** Quiz results (Prompt 07) calls this right before navigating back to /map. */
export function stashConquest(idCode: string) {
	try {
		sessionStorage.setItem(CONQUEST_KEY, idCode);
	} catch {
		/* storage unavailable — animation is decorative */
	}
}

/** Map reads-and-clears on mount; returns the id_code to animate, if any. */
export function takeConquest(): string | null {
	try {
		const v = sessionStorage.getItem(CONQUEST_KEY);
		if (v) sessionStorage.removeItem(CONQUEST_KEY);
		return v;
	} catch {
		return null;
	}
}
