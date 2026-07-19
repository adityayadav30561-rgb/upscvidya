import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ProgressRing from '../ProgressRing.svelte';

describe('ProgressRing', () => {
	it('shows value and label', () => {
		render(ProgressRing, { value: 68, label: 'POLITY', animate: false });
		expect(screen.getByText('68%')).toBeInTheDocument();
		expect(screen.getByText('POLITY')).toBeInTheDocument();
	});

	it('dashoffset reflects value when not animating', () => {
		const { container } = render(ProgressRing, { value: 100, animate: false });
		const arc = container.querySelectorAll('circle')[1];
		expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 3);
	});
});
