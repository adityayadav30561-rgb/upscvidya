import { describe, expect, it } from 'vitest';
import { shouldPromptPush, lastActiveBucket } from '../push';

describe('shouldPromptPush (never on first load; only post-first-quiz, once)', () => {
	it('does NOT prompt before the first quiz (the acceptance)', () => {
		expect(
			shouldPromptPush({ firstQuizDone: false, alreadyPrompted: false, permissionGranted: false })
		).toBe(false);
	});
	it('prompts once the first quiz is done and nothing decided yet', () => {
		expect(
			shouldPromptPush({ firstQuizDone: true, alreadyPrompted: false, permissionGranted: false })
		).toBe(true);
	});
	it('never prompts twice', () => {
		expect(
			shouldPromptPush({ firstQuizDone: true, alreadyPrompted: true, permissionGranted: false })
		).toBe(false);
	});
	it('does not prompt when permission is already granted', () => {
		expect(
			shouldPromptPush({ firstQuizDone: true, alreadyPrompted: false, permissionGranted: true })
		).toBe(false);
	});
});

describe('lastActiveBucket (push segmentation tag)', () => {
	const now = Date.parse('2026-07-24T12:00:00Z');
	it('never for a missing/blank date', () => {
		expect(lastActiveBucket(undefined, now)).toBe('never');
		expect(lastActiveBucket('', now)).toBe('never');
	});
	it('today for same-day activity', () => {
		expect(lastActiveBucket('2026-07-24 09:00:00.000Z', now)).toBe('today');
	});
	it('this_week within 7 days', () => {
		expect(lastActiveBucket('2026-07-20 09:00:00.000Z', now)).toBe('this_week');
	});
	it('older beyond 7 days', () => {
		expect(lastActiveBucket('2026-07-01 09:00:00.000Z', now)).toBe('older');
	});
});
