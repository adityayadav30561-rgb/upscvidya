import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Sheet from '../Sheet.svelte';
import { text } from './helpers';

describe('Sheet', () => {
	it('hidden when closed, visible when open', () => {
		const closed = render(Sheet, { open: false, children: text('body') });
		expect(closed.container.querySelector('.sheet')).not.toBeInTheDocument();
		closed.unmount();

		render(Sheet, { open: true, title: 'Preamble', children: text('body') });
		expect(screen.getByRole('dialog')).toBeInTheDocument();
		expect(screen.getByText('Preamble')).toBeInTheDocument();
	});
});
