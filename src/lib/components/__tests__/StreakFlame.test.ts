import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import StreakFlame from '../StreakFlame.svelte';

describe('StreakFlame', () => {
	it('shows count and label', () => {
		render(StreakFlame, { count: 17 });
		expect(screen.getByText('17')).toBeInTheDocument();
		expect(screen.getByText('DAY STREAK')).toBeInTheDocument();
	});

	it('renders one frost icon per freeze token', () => {
		const { container } = render(StreakFlame, { count: 3, freezes: 2 });
		expect(container.querySelectorAll('.freezes svg')).toHaveLength(2);
	});
});
