import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import Chip from '../Chip.svelte';
import { text } from './helpers';

describe('Chip', () => {
	it('renders every variant', () => {
		for (const variant of [
			'sticker-green',
			'sticker-orange',
			'pill',
			'blue',
			'khaki',
			'red'
		] as const) {
			const { container, unmount } = render(Chip, { variant, children: text('c') });
			expect(container.querySelector('.chip')).toHaveClass(variant);
			unmount();
		}
	});

	it('stickers get their design tilt', () => {
		const { container } = render(Chip, { variant: 'sticker-green', children: text('FREE') });
		expect((container.querySelector('.chip') as HTMLElement).style.transform).toContain(
			'rotate(-2deg)'
		);
	});
});
