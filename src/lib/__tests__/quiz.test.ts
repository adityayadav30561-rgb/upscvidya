import { describe, expect, it } from 'vitest';
import { dotStates, firstUnanswered, parseStem, type QuizQuestion } from '../quiz';

const mk = (over: Partial<QuizQuestion>): QuizQuestion => ({
	qid: 'Q',
	index: 0,
	stem: '',
	format: 'single-factual',
	tier: 1,
	options: ['a', 'b', 'c', 'd'],
	flagged: false,
	chosen: null,
	correct: null,
	...over
});

describe('dotStates', () => {
	it('classifies answered/current/upcoming dots', () => {
		const qs = [
			mk({ chosen: 1, correct: true }),
			mk({ chosen: 0, correct: false }),
			mk({}),
			mk({})
		];
		expect(dotStates(qs, 2)).toEqual(['done-correct', 'done-wrong', 'current', 'upcoming']);
	});
});

describe('firstUnanswered', () => {
	it('finds the first question without a choice', () => {
		expect(firstUnanswered([mk({ chosen: 0 }), mk({ chosen: 1 }), mk({})])).toBe(2);
	});
	it('lands on the last question when all are answered', () => {
		expect(firstUnanswered([mk({ chosen: 0 }), mk({ chosen: 1 })])).toBe(1);
	});
});

describe('parseStem', () => {
	it('splits a statement-pattern stem into lead / statements / tail', () => {
		const stem =
			'Consider the following statements:\n1. The Rajya Sabha is a continuing chamber.\n2. The President is part of Parliament.\nHow many are correct?';
		const p = parseStem(stem);
		expect(p.lead).toBe('Consider the following statements:');
		expect(p.statements).toEqual([
			'The Rajya Sabha is a continuing chamber.',
			'The President is part of Parliament.'
		]);
		expect(p.tail).toBe('How many are correct?');
	});

	it('accepts "1)" style numbering', () => {
		const p = parseStem('Statements:\n1) alpha\n2) beta\nWhich is correct?');
		expect(p.statements).toEqual(['alpha', 'beta']);
	});

	it('returns the whole stem as a block when not statement-shaped', () => {
		const p = parseStem('Who was the first Vice-President of India?');
		expect(p.statements).toEqual([]);
		expect(p.lead).toBe('Who was the first Vice-President of India?');
	});
});
