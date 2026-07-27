import { describe, it, expect } from 'vitest';
import { renderBlocks, normalizeAnswer, isClozeCorrect, type NoteBlock } from '$lib/markdown';

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
