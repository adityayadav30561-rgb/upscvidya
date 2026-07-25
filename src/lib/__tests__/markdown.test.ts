import { describe, expect, it } from 'vitest';
import { renderNotes, wordCount } from '../markdown';

describe('renderNotes', () => {
	it('renders GFM headings, bold and lists', () => {
		const html = renderNotes('# Preamble\n\nThe **Preamble** is key.\n\n- one\n- two');
		expect(html).toContain('<h1');
		expect(html).toContain('<strong>Preamble</strong>');
		expect(html).toContain('<li>one</li>');
	});

	it('wraps tables in a horizontal-scroll container', () => {
		const md = '| A | B |\n|---|---|\n| 1 | 2 |';
		const html = renderNotes(md);
		expect(html).toContain('class="table-scroll"');
		expect(html).toContain('<table');
		expect(html).toContain('<th');
	});

	it('renders blockquotes (styled as EXAM ANGLE blocks)', () => {
		const html = renderNotes('> Parliament = President + both Houses.');
		expect(html).toContain('<blockquote');
	});

	it('sanitises script and event-handler injection', () => {
		const html = renderNotes('Hi <script>alert(1)</script> <img src=x onerror="alert(2)">');
		expect(html).not.toContain('<script');
		expect(html).not.toContain('onerror');
	});

	it('returns empty string for empty input', () => {
		expect(renderNotes('')).toBe('');
	});
});

describe('wordCount', () => {
	it('counts words for the teaser estimate', () => {
		expect(wordCount('one two three')).toBe(3);
		expect(wordCount('  padded   spaces  ')).toBe(2);
		expect(wordCount('')).toBe(0);
	});
});

describe('renderNotes callouts', () => {
	it('turns a [!note] blockquote into a FIELD NOTE callout', () => {
		const html = renderNotes('> [!note] Added by the **42nd Amendment**.');
		expect(html).toContain('class="callout note"');
		expect(html).toContain('FIELD NOTE');
		expect(html).toContain('<strong>42nd Amendment</strong>');
		expect(html).not.toContain('[!note]');
	});
	it('leaves an unmarked blockquote as a plain blockquote', () => {
		const html = renderNotes('> just a normal quote');
		expect(html).toContain('<blockquote');
		expect(html).not.toContain('callout');
	});
	it('maps [!exam] to EXAM ANGLE', () => {
		expect(renderNotes('> [!exam] asked in 2019')).toContain('class="callout exam"');
	});
});
