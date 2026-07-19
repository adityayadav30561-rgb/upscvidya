import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Modal from '../Modal.svelte';
import { text } from './helpers';

describe('Modal', () => {
	it('hidden when closed, dialog when open', () => {
		const closed = render(Modal, { open: false, children: text('x') });
		expect(closed.container.querySelector('.modal')).not.toBeInTheDocument();
		closed.unmount();

		render(Modal, { open: true, title: 'Abandon test?', children: text('x') });
		expect(screen.getByRole('dialog')).toBeInTheDocument();
		expect(screen.getByText('Abandon test?')).toBeInTheDocument();
	});
});
