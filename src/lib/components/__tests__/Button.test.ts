import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Button from '../Button.svelte';
import { text } from './helpers';

describe('Button', () => {
	it('renders each variant with its class', () => {
		for (const variant of ['primary', 'secondary', 'success', 'ghost', 'danger'] as const) {
			const { unmount } = render(Button, { variant, children: text(variant) });
			const btn = screen.getByRole('button');
			expect(btn).toHaveClass(variant);
			unmount();
		}
	});

	it('locked variant is disabled', () => {
		render(Button, { variant: 'locked', children: text('Locked') });
		expect(screen.getByRole('button')).toBeDisabled();
	});

	it('fires onclick', async () => {
		const onclick = vi.fn();
		render(Button, { onclick, children: text('Go') });
		screen.getByRole('button').click();
		expect(onclick).toHaveBeenCalledOnce();
	});
});
