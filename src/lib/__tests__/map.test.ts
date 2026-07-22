import { describe, expect, it } from 'vitest';
import { buildMap, guidedNextCode, visualFor, layoutNodes } from '../map';
import { UNITS, TOTAL_UNITS, REGIONS } from '../polity';
import type { TopicPublic, TopicProgress, TopicState } from '../types';

/* ---------- fixtures ---------- */

const topic = (id_code: string, over: Partial<TopicPublic> = {}): TopicPublic => {
	const unit = UNITS.find((u) => u.code === id_code)!;
	return {
		id: `t_${id_code}`,
		id_code,
		title: unit.title,
		part_no: 1,
		region: unit.region,
		kind: unit.kind === 'appendix' ? 'appendix' : 'chapter',
		book_ref: '',
		mcq_floor: unit.floor,
		tags: [],
		guided_order: unit.order,
		est_read_minutes: 6,
		prerequisites: [],
		status: 'live',
		is_free: true,
		...over
	};
};

const prog = (id_code: string, state: TopicState, over: Partial<TopicProgress> = {}): TopicProgress => ({
	id: `p_${id_code}`,
	created: '',
	updated: '',
	user: 'u1',
	topic: `t_${id_code}`,
	state,
	best_score_pct: 0,
	last_activity: new Date().toISOString(),
	quiz_passes: 0,
	...over
});

const byCode = (topics: TopicPublic[]) => new Map(topics.map((t) => [t.id_code, t]));
const progByCode = (topics: TopicPublic[], progress: TopicProgress[]) => {
	const idToCode = new Map(topics.map((t) => [t.id, t.id_code]));
	const m = new Map<string, TopicProgress>();
	for (const p of progress) {
		const c = idToCode.get(p.topic);
		if (c) m.set(c, p);
	}
	return m;
};

/* ---------- registry ---------- */

describe('polity registry', () => {
	it('has exactly 103 units — 94 chapters + 9 appendix drills', () => {
		expect(TOTAL_UNITS).toBe(103);
		expect(UNITS.filter((u) => u.kind === 'chapter')).toHaveLength(94);
		expect(UNITS.filter((u) => u.kind === 'appendix')).toHaveLength(9);
	});

	it('skips POL-55 (no ch. 55 in the reference book) and has no duplicates', () => {
		const codes = UNITS.map((u) => u.code);
		expect(codes).not.toContain('POL-55');
		expect(new Set(codes).size).toBe(codes.length);
	});

	it('every unit belongs to one of the 8 regions', () => {
		const regionCodes = new Set(REGIONS.map((r) => r.code));
		for (const u of UNITS) expect(regionCodes.has(u.region)).toBe(true);
	});

	it('region unit counts match the master doc split', () => {
		const count = (r: string) => UNITS.filter((u) => u.region === r).length;
		expect(count('foundations')).toBe(14); // 12 ch + APX-1, APX-4
		expect(count('system')).toBe(6); // 5 ch + APX-2
		expect(count('centre')).toBe(14); // 12 ch + APX-3, APX-8
		expect(count('states')).toBe(9);
		expect(count('grassroots')).toBe(4);
		expect(count('institutions')).toBe(30); // 29 ch + APX-9
		expect(count('dynamics')).toBe(20); // 18 ch + APX-6, APX-7
		expect(count('courtroom')).toBe(6); // 5 ch + APX-5
	});
});

/* ---------- state mapping ---------- */

describe('visualFor', () => {
	it('maps progress states to the 5 node visuals', () => {
		expect(visualFor(undefined)).toBe('free-roam');
		expect(visualFor('unread')).toBe('free-roam');
		expect(visualFor('read')).toBe('unconquered');
		expect(visualFor('conquered')).toBe('conquered');
		expect(visualFor('gold')).toBe('gold');
		expect(visualFor('decaying')).toBe('decaying');
	});
});

/* ---------- guided path ---------- */

describe('guidedNextCode', () => {
	it('picks the first live topic in guided_order when nothing is held', () => {
		const topics = [topic('POL-05'), topic('POL-10'), topic('POL-19')];
		expect(guidedNextCode(byCode(topics), new Map())).toBe('POL-05');
	});

	it('advances after conquering the current node', () => {
		const topics = [topic('POL-05'), topic('POL-10'), topic('POL-19')];
		const progress = progByCode(topics, [prog('POL-05', 'conquered')]);
		expect(guidedNextCode(byCode(topics), progress)).toBe('POL-10');
	});

	it('honours prerequisites among live topics', () => {
		const topics = [
			topic('POL-05'),
			topic('POL-10', { prerequisites: ['POL-05'] }),
			topic('POL-19')
		];
		// POL-05 not held → POL-10 blocked, but POL-05 itself is the pick anyway
		expect(guidedNextCode(byCode(topics), new Map())).toBe('POL-05');
		// POL-05 read-but-not-passed → still blocks POL-10; pick stays POL-05
		let progress = progByCode(topics, [prog('POL-05', 'read')]);
		expect(guidedNextCode(byCode(topics), progress)).toBe('POL-05');
		// POL-05 conquered → POL-10 unblocked
		progress = progByCode(topics, [prog('POL-05', 'conquered')]);
		expect(guidedNextCode(byCode(topics), progress)).toBe('POL-10');
	});

	it('treats prerequisites without live content as satisfied', () => {
		// POL-19's real prereq is POL-18, which has no content yet
		const topics = [topic('POL-19', { prerequisites: ['POL-18'] })];
		expect(guidedNextCode(byCode(topics), new Map())).toBe('POL-19');
	});

	it('counts decaying prerequisites as held (was conquered)', () => {
		const topics = [topic('POL-05'), topic('POL-10', { prerequisites: ['POL-05'] })];
		const progress = progByCode(topics, [prog('POL-05', 'decaying')]);
		expect(guidedNextCode(byCode(topics), progress)).toBe('POL-10');
	});

	it('returns null when everything live is held', () => {
		const topics = [topic('POL-05')];
		const progress = progByCode(topics, [prog('POL-05', 'gold')]);
		expect(guidedNextCode(byCode(topics), progress)).toBe(null);
	});
});

/* ---------- buildMap ---------- */

describe('buildMap', () => {
	const liveTopics = [topic('POL-05'), topic('POL-10'), topic('POL-19', { is_free: false })];

	it('renders all 103 units grouped into 8 regions', () => {
		const map = buildMap(liveTopics, [], false);
		expect(map.regions).toHaveLength(8);
		expect(map.regions.reduce((s, r) => s + r.nodes.length, 0)).toBe(103);
		expect(map.total).toBe(103);
	});

	it('flags units without live content as coming soon', () => {
		const map = buildMap(liveTopics, [], false);
		const all = map.regions.flatMap((r) => r.nodes);
		expect(all.filter((n) => !n.comingSoon)).toHaveLength(3);
		expect(all.find((n) => n.unit.code === 'POL-01')?.comingSoon).toBe(true);
	});

	it('premium-locks gated topics for free users only', () => {
		const free = buildMap(liveTopics, [], false);
		const paid = buildMap(liveTopics, [], true);
		const node = (m: typeof free) =>
			m.regions.flatMap((r) => r.nodes).find((n) => n.unit.code === 'POL-19')!;
		expect(node(free).premiumLocked).toBe(true);
		expect(node(paid).premiumLocked).toBe(false);
	});

	it('computes region % and held counts from progress', () => {
		const progress = [prog('POL-05', 'gold'), prog('POL-10', 'conquered')];
		const map = buildMap(liveTopics, progress, false);
		const foundations = map.regions.find((r) => r.meta.code === 'foundations')!;
		expect(foundations.conquered).toBe(2);
		expect(foundations.gold).toBe(1);
		expect(foundations.pct).toBe(Math.round((2 / 14) * 100));
		expect(map.held).toBe(2);
		expect(map.next?.unit.code).toBe('POL-19'); // next live chapter in order
	});

	it('marks the front region via the next-mission node', () => {
		const progress = [prog('POL-05', 'conquered'), prog('POL-10', 'conquered')];
		const map = buildMap(liveTopics, progress, false);
		expect(map.regions.find((r) => r.meta.code === 'centre')?.isFront).toBe(true);
		expect(map.regions.find((r) => r.meta.code === 'foundations')?.isFront).toBe(false);
	});

	it('APX-1 is always unlocked; other drills unlock when their region is entered', () => {
		const noProgress = buildMap(liveTopics, [], false);
		const nodes = (m: typeof noProgress) => m.regions.flatMap((r) => r.nodes);
		expect(nodes(noProgress).find((n) => n.unit.code === 'APX-1')?.drillLocked).toBe(false);
		expect(nodes(noProgress).find((n) => n.unit.code === 'APX-4')?.drillLocked).toBe(true);

		const entered = buildMap(liveTopics, [prog('POL-05', 'conquered')], false);
		expect(nodes(entered).find((n) => n.unit.code === 'APX-4')?.drillLocked).toBe(false);
	});
});

/* ---------- layout ---------- */

describe('layoutNodes', () => {
	it('positions every node inside the region viewBox', () => {
		for (const count of [1, 3, 14, 30]) {
			const { points, height } = layoutNodes(count);
			expect(points).toHaveLength(count);
			for (const p of points) {
				expect(p.x).toBeGreaterThan(20);
				expect(p.x).toBeLessThan(328);
				expect(p.y).toBeGreaterThan(0);
				expect(p.y).toBeLessThan(height);
			}
		}
	});

	it('is deterministic', () => {
		expect(layoutNodes(30)).toEqual(layoutNodes(30));
	});
});
