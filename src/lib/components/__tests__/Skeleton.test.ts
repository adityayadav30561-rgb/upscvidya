import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import Skeleton from '../Skeleton.svelte';

describe('Skeleton', () => {
	it('applies sizing props', () => {
		const { container } = render(Skeleton, { width: '60%', height: '20px' });
		const el = container.querySelector('.skeleton') as HTMLElement;
		expect(el.style.width).toBe('60%');
		expect(el.style.height).toBe('20px');
		expect(el).toHaveAttribute('aria-hidden', 'true');
	});
});
