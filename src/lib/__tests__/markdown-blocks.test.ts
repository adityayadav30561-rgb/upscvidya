import { describe, it, expect } from 'vitest';
import {
	renderBlocks,
	normalizeAnswer,
	isClozeCorrect,
	clipLabel,
	factLabel,
	type NoteBlock,
	type RecallPrompt
} from '$lib/markdown';

const kinds = (blocks: NoteBlock[]) => blocks.map((b) => b.kind);

describe('renderBlocks — in-chapter retrieval prompts', () => {
	it('keeps prose as html when there are no prompts', () => {
		const blocks = renderBlocks('# Preamble\n\nSome notes.');
		expect(kinds(blocks)).toEqual(['html']);
		expect(blocks[0].kind === 'html' && blocks[0].html).toContain('<h1');
	});

	it('splits prose around a predict block and keeps document order', () => {
		const blocks = renderBlocks(
			['Before.', '', ':::predict Which amendment?', 'The **42nd**.', ':::', '', 'After.'].join('\n')
		);
		expect(kinds(blocks)).toEqual(['html', 'predict', 'html']);
		const p = blocks[1];
		expect(p.kind === 'predict' && p.prompt).toBe('Which amendment?');
		expect(p.kind === 'predict' && p.html).toContain('<strong>42nd</strong>');
	});

	it('parses each cloze line into text + blank parts with accepted alternatives', () => {
		const blocks = renderBlocks(
			[':::cloze', 'Article {{14}} is equality.', 'Moved by {{Nehru|Jawaharlal Nehru}}.', ':::'].join('\n')
		);
		expect(kinds(blocks)).toEqual(['cloze']);
		const c = blocks[0];
		if (c.kind !== 'cloze') throw new Error('expected cloze');
		expect(c.lines).toHaveLength(2);
		const [first] = c.lines;
		expect(first.parts).toHaveLength(3); // "Article ", blank, " is equality."
		const blank = first.parts[1];
		expect('blank' in blank && blank.blank).toEqual(['14']);
		const second = c.lines[1].parts.find((p) => 'blank' in p);
		expect(second && 'blank' in second && second.blank).toEqual(['Nehru', 'Jawaharlal Nehru']);
	});

	it('gives every block a stable, unique id', () => {
		const md = ['A', ':::predict Q?', 'A.', ':::', 'B', ':::recall Q2?', 'A2.', ':::'].join('\n');
		const ids = renderBlocks(md).map((b) => b.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(renderBlocks(md).map((b) => b.id)).toEqual(ids); // deterministic
	});

	it('ignores a ::: line inside a fenced code block', () => {
		const blocks = renderBlocks(['```', ':::predict not a prompt', '```'].join('\n'));
		expect(kinds(blocks)).toEqual(['html']);
	});

	it('recovers from an unclosed block by running to the end of the notes', () => {
		const blocks = renderBlocks([':::predict Q?', 'Answer with no close.'].join('\n'));
		expect(kinds(blocks)).toEqual(['predict']);
	});
});

describe('cloze answer matching', () => {
	it('folds case, punctuation and spacing', () => {
		expect(normalizeAnswer('  22 January, 1947 ')).toBe('22 january 1947');
		expect(isClozeCorrect('22 january 1947', ['22 January 1947'])).toBe(true);
		expect(isClozeCorrect('Basic-Structure', ['basic structure'])).toBe(true);
	});

	it('accepts any listed alternative and rejects blanks/wrong answers', () => {
		expect(isClozeCorrect('nehru', ['Nehru', 'Jawaharlal Nehru'])).toBe(true);
		expect(isClozeCorrect('Jawaharlal  Nehru', ['Nehru', 'Jawaharlal Nehru'])).toBe(true);
		expect(isClozeCorrect('', ['Nehru'])).toBe(false);
		expect(isClozeCorrect('Ambedkar', ['Nehru'])).toBe(false);
	});
});

describe('weak-fact labels', () => {
	const only = (md: string): RecallPrompt => {
		const b = renderBlocks(md).find((x): x is RecallPrompt => x.kind !== 'html');
		if (!b) throw new Error('expected a prompt block');
		return b;
	};

	it('clips on a word boundary, never mid-word', () => {
		const s = 'The Preamble was adopted on 26 November 1949 by the Constituent Assembly of India today';
		const out = clipLabel(s, 60);
		expect(out.endsWith('…')).toBe(true);
		expect(out.length).toBeLessThanOrEqual(61);
		expect(s.startsWith(out.slice(0, -1))).toBe(true); // no invented characters
		expect(out.slice(0, -1).endsWith(' ')).toBe(false);
		// the cut lands between words: the kept text is a whole-word prefix
		const kept = out.slice(0, -1);
		expect(s[kept.length] === ' ' || s[kept.length] === undefined).toBe(true);
	});

	it('leaves a short label untouched and collapses whitespace', () => {
		expect(clipLabel('  Article 14  is\nequality. ')).toBe('Article 14 is equality.');
	});

	it('drops a dangling comma before the ellipsis', () => {
		expect(clipLabel('one two three, four five', 15)).toBe('one two three…');
	});

	it('peels back trailing words that carry no fact', () => {
		const s = 'The Preamble was adopted on 26 November 1949, and the Constitution commenced on 26 January 1950.';
		expect(clipLabel(s)).toBe('The Preamble was adopted on 26 November 1949, and the Constitution commenced…');
		// a bare numeral, a preposition and an article all go
		expect(clipLabel('Article 368 governs amendment of the 42nd', 38)).toBe('Article 368 governs amendment…');
	});

	it('never peels a label away to nothing', () => {
		expect(clipLabel('the of on in', 8)).toBe('the…');
	});

	it('labels a predict prompt with the ANSWER, not the question', () => {
		const b = only(
			[
				':::predict Which single amendment is the only one ever made to the Preamble?',
				'The **42nd Constitutional Amendment Act, 1976**. It inserted socialist, secular and integrity.',
				':::'
			].join('\n')
		);
		const label = factLabel(b);
		expect(label).toBe('The 42nd Constitutional Amendment Act, 1976.');
		expect(label).not.toContain('Which single amendment');
	});

	it('keeps the whole answer when its first sentence is a stub', () => {
		const b = only([':::recall Why does it matter?', 'It aids. Courts read it for intent.', ':::'].join('\n'));
		expect(factLabel(b)).toBe('It aids. Courts read it for intent.');
	});

	it('falls back to the prompt when a block has no answer body', () => {
		const b = only([':::predict Name the mover of the Objectives Resolution.', ':::'].join('\n'));
		expect(factLabel(b)).toBe('Name the mover of the Objectives Resolution.');
	});

	it('labels a cloze with the missed line, blanks filled in', () => {
		const b = only(
			[
				':::cloze',
				'Adopted on {{26 November 1949}}.',
				'Tested against the {{basic structure}} doctrine.',
				':::'
			].join('\n')
		);
		if (b.kind !== 'cloze') throw new Error('expected cloze');
		const keyOf = (i: number) => {
			const p = b.lines[i].parts.find((x) => 'blank' in x);
			if (!p || !('blank' in p)) throw new Error('no blank');
			return p.key;
		};
		// first line right, second wrong → the second is what needs review
		const values = { [keyOf(0)]: '26 november 1949', [keyOf(1)]: 'harmonious construction' };
		expect(factLabel(b, values)).toBe('Tested against the basic structure doctrine.');
		// nothing typed → first line
		expect(factLabel(b, {})).toBe('Adopted on 26 November 1949.');
	});
});
