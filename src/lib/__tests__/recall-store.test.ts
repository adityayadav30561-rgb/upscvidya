import { describe, it, expect, beforeEach } from 'vitest';
import {
	markRecall,
	loadRecall,
	weakFacts,
	unseenWeakFacts,
	stampWeakFactsSeen,
	clearRecall
} from '$lib/reader.svelte';

const CODE = 'POL-TEST';

describe('recall marks — the quiz pre-flight source', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('stores the fact label with the mark, not just the block id', () => {
		markRecall(CODE, 'cloze-2', 'miss', 'Article 14 deals with the Right to Equality.');
		expect(loadRecall(CODE, 'cloze-2')).toBe('miss');
		expect(weakFacts(CODE)).toEqual([
			expect.objectContaining({ id: 'cloze-2', label: 'Article 14 deals with the Right to Equality.' })
		]);
	});

	it('lists only misses, and drops one that is later recalled', () => {
		markRecall(CODE, 'cloze-2', 'miss', 'Article 14');
		markRecall(CODE, 'predict-1', 'hit', '42nd Amendment');
		expect(weakFacts(CODE).map((f) => f.id)).toEqual(['cloze-2']);

		markRecall(CODE, 'cloze-2', 'hit', 'Article 14');
		expect(weakFacts(CODE)).toEqual([]);
	});

	it('stops surfacing a fact once the brief has shown it, but not a newer miss', () => {
		markRecall(CODE, 'cloze-2', 'miss', 'Article 14');
		expect(unseenWeakFacts(CODE)).toHaveLength(1);

		stampWeakFactsSeen(CODE);
		expect(unseenWeakFacts(CODE)).toHaveLength(0);
		expect(weakFacts(CODE)).toHaveLength(1); // still remembered, just not nagged

		markRecall(CODE, 'recall-3', 'miss', 'Basic structure doctrine');
		expect(unseenWeakFacts(CODE).map((f) => f.id)).toEqual(['recall-3']);
	});

	it('reads marks written before labels existed', () => {
		localStorage.setItem(`recall-${CODE}`, JSON.stringify({ 'cloze-1': 'miss', 'predict-0': 'hit' }));
		expect(loadRecall(CODE, 'cloze-1')).toBe('miss');
		expect(weakFacts(CODE).map((f) => f.id)).toEqual(['cloze-1']);
	});

	it('clears a chapter, brief stamp included', () => {
		markRecall(CODE, 'cloze-2', 'miss', 'Article 14');
		stampWeakFactsSeen(CODE);
		clearRecall(CODE);
		expect(weakFacts(CODE)).toEqual([]);
		markRecall(CODE, 'cloze-2', 'miss', 'Article 14');
		expect(unseenWeakFacts(CODE)).toHaveLength(1);
	});
});
