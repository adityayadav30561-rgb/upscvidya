import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import Card from '../Card.svelte';
import { text } from './helpers';

describe('Card', () => {
	it('renders elevation classes', () => {
		for (const elevation of ['flat', 'lifted', 'gold'] as const) {
			const { container, unmount } = render(Card, { elevation, children: text('x') });
			expect(container.querySelector('.card')).toHaveClass(elevation);
			unmount();
		}
	});

	it('bold border option', () => {
		const { container } = render(Card, { bold: true, children: text('x') });
		expect(container.querySelector('.card')).toHaveClass('bold');
	});
});
