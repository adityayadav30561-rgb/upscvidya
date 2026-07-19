import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import RankInsignia from '../RankInsignia.svelte';
import { RANK_CODES } from '$lib/ranks';

describe('RankInsignia', () => {
	it('renders all 14 grades', () => {
		expect(RANK_CODES).toHaveLength(14);
		for (const rank of RANK_CODES) {
			const { container, unmount } = render(RankInsignia, { rank });
			expect(container.querySelector('svg'), rank).toBeInTheDocument();
			unmount();
		}
	});

	it('chevron counts: constable 1, sr_constable 2, head_constable 3', () => {
		for (const [rank, n] of [
			['constable', 1],
			['sr_constable', 2],
			['head_constable', 3]
		] as const) {
			const { container, unmount } = render(RankInsignia, { rank });
			expect(container.querySelectorAll('path[fill="#b23b30"]'), rank).toHaveLength(n);
			unmount();
		}
	});

	it('gorget stripe on asi/si/inspector only', () => {
		for (const rank of ['asi', 'si', 'inspector'] as const) {
			const { container, unmount } = render(RankInsignia, { rank });
			expect(container.querySelectorAll('rect[fill="#a63a30"]'), rank).toHaveLength(1);
			unmount();
		}
		const ac = render(RankInsignia, { rank: 'ac' });
		expect(ac.container.querySelectorAll('rect[fill="#a63a30"]')).toHaveLength(0);
	});

	it('emblem grades carry the Ashoka image; ig/dg carry swords', () => {
		for (const rank of ['dc', 'second_in_command', 'commandant', 'dig', 'dg'] as const) {
			const { container, unmount } = render(RankInsignia, { rank });
			expect(container.querySelector('image'), rank).toBeInTheDocument();
			unmount();
		}
		for (const rank of ['ig', 'dg'] as const) {
			const { container, unmount } = render(RankInsignia, { rank });
			// swords = two crossed stroke paths with round linecap at 2.4 width
			expect(container.querySelector('path[stroke-width="2.4"]'), rank).toBeInTheDocument();
			unmount();
		}
	});
});
