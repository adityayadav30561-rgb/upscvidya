import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import RankInsignia from '../RankInsignia.svelte';
import type { RankCode } from '$lib/types';

const ALL: RankCode[] = [
	'cadet',
	'constable',
	'head_constable',
	'asi',
	'si',
	'inspector',
	'ac',
	'dc',
	'commandant',
	'dg'
];

describe('RankInsignia', () => {
	it('renders all 10 ranks', () => {
		for (const rank of ALL) {
			const { container, unmount } = render(RankInsignia, { rank });
			expect(container.querySelector('svg'), rank).toBeInTheDocument();
			unmount();
		}
	});

	it('head_constable shows 3 chevrons; inspector 3 stars + stripe', () => {
		const hc = render(RankInsignia, { rank: 'head_constable' });
		// chevrons: path with the chevron d-shape (fill #b23b30)
		expect(hc.container.querySelectorAll('path[fill="#b23b30"]')).toHaveLength(3);
		hc.unmount();

		const insp = render(RankInsignia, { rank: 'inspector' });
		expect(insp.container.querySelectorAll('rect[fill="#a63a30"]')).toHaveLength(1); // stripe
	});

	it('dc and dg carry the Ashoka emblem image', () => {
		for (const rank of ['dc', 'dg'] as const) {
			const { container, unmount } = render(RankInsignia, { rank });
			expect(container.querySelector('image')).toBeInTheDocument();
			unmount();
		}
	});
});
