import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import OptionRow from '../OptionRow.svelte';
import { text } from './helpers';

describe('OptionRow', () => {
	it('renders all 5 states', () => {
		for (const state of ['idle', 'selected', 'correct', 'incorrect', 'missed'] as const) {
			const { container, unmount } = render(OptionRow, { state, children: text('opt') });
			expect(container.querySelector('.row'), state).toHaveClass(state);
			unmount();
		}
	});

	it('shows the note suffix', () => {
		render(OptionRow, { state: 'correct', note: 'correct', children: text('All three') });
		expect(screen.getByText('· correct')).toBeInTheDocument();
	});

	it('non-interactive without onclick', () => {
		render(OptionRow, { state: 'correct', children: text('x') });
		expect(screen.getByRole('button')).toBeDisabled();
	});
});
