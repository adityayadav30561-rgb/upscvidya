import { describe, expect, it, beforeEach } from 'vitest';
import {
	shouldNudge,
	anonAnswerCount,
	recordAnonAnswer,
	resetAnonAnswers,
	filterQuestions,
	paperProgressLabel,
	NUDGE_AFTER,
	type PyqQuestion,
	type PyqYear
} from '../pyq';

const q = (over: Partial<PyqQuestion>): PyqQuestion => ({
	qid: 'CAPF-2024-Q001',
	stem: '',
	options: ['a', 'b', 'c', 'd'],
	tier: 1,
	format: 'single-factual',
	topic_code: 'POL-05',
	topic_title: 'Preamble',
	exam: 'CAPF',
	year: 2024,
	qno: 1,
	asked_times: 1,
	attempted: null,
	was_correct: null,
	...over
});

const year = (over: Partial<PyqYear>): PyqYear => ({
	key: 'CAPF-2024',
	exam: 'CAPF',
	year: 2024,
	count: 22,
	topic_count: 6,
	attempted: 0,
	...over
});

describe('anonymous nudge', () => {
	beforeEach(() => localStorage.clear());

	it('nudges on the 5th answer while logged out', () => {
		expect(NUDGE_AFTER).toBe(5);
		for (let i = 1; i <= 4; i++) expect(shouldNudge(i, false)).toBe(false);
		expect(shouldNudge(5, false)).toBe(true);
	});

	it('never nudges a signed-in user', () => {
		expect(shouldNudge(5, true)).toBe(false);
		expect(shouldNudge(50, true)).toBe(false);
	});

	it('repeats every 5 answers, so it never hard-blocks', () => {
		expect(shouldNudge(10, false)).toBe(true);
		expect(shouldNudge(11, false)).toBe(false);
		expect(shouldNudge(15, false)).toBe(true);
	});

	it('counts answers across reloads and resets on signup', () => {
		expect(anonAnswerCount()).toBe(0);
		expect(recordAnonAnswer()).toBe(1);
		expect(recordAnonAnswer()).toBe(2);
		expect(anonAnswerCount()).toBe(2);
		resetAnonAnswers();
		expect(anonAnswerCount()).toBe(0);
	});
});

describe('filterQuestions', () => {
	const qs = [
		q({ qid: 'a', attempted: null }),
		q({ qid: 'b', attempted: true, was_correct: true }),
		q({ qid: 'c', attempted: true, was_correct: false })
	];
	it('all keeps everything', () => {
		expect(filterQuestions(qs, 'all')).toHaveLength(3);
	});
	it('unattempted keeps the untouched ones', () => {
		expect(filterQuestions(qs, 'unattempted').map((x) => x.qid)).toEqual(['a']);
	});
	it('wrong keeps only misses', () => {
		expect(filterQuestions(qs, 'wrong').map((x) => x.qid)).toEqual(['c']);
	});
});

describe('paperProgressLabel', () => {
	it('matches the design copy', () => {
		expect(paperProgressLabel(year({ attempted: 0 }))).toBe('untouched');
		expect(paperProgressLabel(year({ attempted: 10, count: 22 }))).toBe('10/22 attempted');
		expect(paperProgressLabel(year({ attempted: 22, count: 22 }))).toBe('complete ✓');
	});
});
