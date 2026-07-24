import { describe, expect, it } from 'vitest';
import { isFreeDate, istToday, dateStrip, stripLabel, lowRiskIds, BATCH_CONFIDENCE, monthLabel } from '../ca';

const DAY = 86400000;
// a fixed instant so IST-boundary maths is deterministic
const NOW = Date.parse('2026-07-23T09:00:00Z'); // 14:30 IST on 23 Jul

describe('archive gating', () => {
	it('today and yesterday are free', () => {
		expect(isFreeDate(istToday(NOW), NOW)).toBe(true);
		expect(isFreeDate(istToday(NOW - DAY), NOW)).toBe(true);
	});

	it('ACCEPTANCE: day-before-yesterday is behind the paywall', () => {
		expect(isFreeDate(istToday(NOW - 2 * DAY), NOW)).toBe(false);
		expect(isFreeDate(istToday(NOW - 30 * DAY), NOW)).toBe(false);
	});

	it('uses IST day boundaries, not UTC', () => {
		// 19:00 UTC on 22 Jul is already 00:30 IST on 23 Jul
		const lateUtc = Date.parse('2026-07-22T19:00:00Z');
		expect(istToday(lateUtc)).toBe('2026-07-23');
	});
});

describe('date strip', () => {
	it('lists the last N days newest first', () => {
		const strip = dateStrip(3, NOW);
		expect(strip).toEqual(['2026-07-23', '2026-07-22', '2026-07-21']);
	});
	it('labels the current day', () => {
		expect(stripLabel('2026-07-23', NOW).today).toBe(true);
		expect(stripLabel('2026-07-22', NOW).today).toBe(false);
		expect(stripLabel('2026-07-23', NOW).num).toBe('23');
	});
});

describe('batch approve gate', () => {
	const items = [
		{ id: 'a', confidence: 0.95 },
		{ id: 'b', confidence: 0.92 },
		{ id: 'c', confidence: 0.71 },
		{ id: 'd', confidence: 0.5 }
	];
	it('only low-risk items are selectable', () => {
		expect(BATCH_CONFIDENCE).toBe(0.92);
		expect(lowRiskIds(items)).toEqual(['a', 'b']);
	});
	it('heuristic-mode drafts (0.5) never batch-approve', () => {
		expect(lowRiskIds([{ id: 'h', confidence: 0.5 }])).toEqual([]);
	});
	it('threshold is adjustable for a stricter sweep', () => {
		expect(lowRiskIds(items, 0.94)).toEqual(['a']);
	});
});

describe('monthLabel', () => {
	it('renders a YYYY-MM as a readable month', () => {
		expect(monthLabel('2026-07')).toBe('July 2026');
		expect(monthLabel('2026-01')).toBe('January 2026');
		expect(monthLabel('2025-12')).toBe('December 2025');
	});
	it('passes through a malformed key unchanged', () => {
		expect(monthLabel('nope')).toBe('nope');
	});
});
