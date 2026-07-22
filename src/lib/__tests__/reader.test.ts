import { describe, expect, it, beforeEach } from 'vitest';
import {
	reader,
	setFontSize,
	setSerif,
	setReaderTheme,
	saveResume,
	loadResume
} from '../reader.svelte';

beforeEach(() => localStorage.clear());

describe('reader font size', () => {
	it('clamps to the allowed range and persists', () => {
		setFontSize(19);
		expect(reader.fontSize).toBe(19);
		expect(localStorage.getItem('reader-font')).toBe('19');
		setFontSize(999);
		expect(reader.fontSize).toBe(reader.max);
		setFontSize(1);
		expect(reader.fontSize).toBe(reader.min);
	});
});

describe('reader serif toggle', () => {
	it('persists the choice', () => {
		setSerif(false);
		expect(reader.serif).toBe(false);
		expect(localStorage.getItem('reader-serif')).toBe('false');
		setSerif(true);
		expect(reader.serif).toBe(true);
	});
});

describe('reader theme', () => {
	it('NIGHT drives the global dark theme; leaving it restores light', () => {
		setReaderTheme('night');
		expect(reader.theme).toBe('night');
		expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
		setReaderTheme('sepia');
		expect(reader.theme).toBe('sepia');
		expect(document.documentElement.getAttribute('data-theme')).toBe(null);
	});
});

describe('resume position', () => {
	it('stores mid-read ratios and ignores the very start/end', () => {
		saveResume('POL-05', 0.5);
		expect(loadResume('POL-05')).toBeCloseTo(0.5, 2);
		saveResume('POL-05', 0.99); // treated as finished → cleared
		expect(loadResume('POL-05')).toBe(0);
		saveResume('POL-10', 0.01); // treated as unstarted → not stored
		expect(loadResume('POL-10')).toBe(0);
	});
});
