import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import MapNode from '../MapNode.svelte';

describe('MapNode', () => {
	it('renders all 5 states', () => {
		for (const state of ['free-roam', 'unconquered', 'conquered', 'decaying', 'gold'] as const) {
			const { container, unmount } = render(MapNode, { state });
			expect(container.querySelector('.node'), state).toHaveClass(state);
			unmount();
		}
	});

	it('unconquered shows the orange dot; conquered the check', () => {
		const un = render(MapNode, { state: 'unconquered' });
		expect(un.container.querySelector('.dot')).toBeInTheDocument();
		un.unmount();
		const cq = render(MapNode, { state: 'conquered' });
		expect(cq.container.querySelector('svg path')).toBeInTheDocument();
	});
});
