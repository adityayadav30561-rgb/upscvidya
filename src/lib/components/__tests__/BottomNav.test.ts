import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/map') }
}));

import BottomNav from '../BottomNav.svelte';

describe('BottomNav', () => {
	it('renders the 5 design tabs', () => {
		render(BottomNav);
		for (const label of ['BASE', 'MAP', 'TESTS', 'BRIEFING', 'PROFILE']) {
			expect(screen.getByText(label)).toBeInTheDocument();
		}
	});

	it('marks the current route active', () => {
		render(BottomNav);
		const active = screen.getByText('MAP').closest('a');
		expect(active).toHaveClass('active');
		expect(active).toHaveAttribute('aria-current', 'page');
		expect(screen.getByText('BASE').closest('a')).not.toHaveClass('active');
	});
});
