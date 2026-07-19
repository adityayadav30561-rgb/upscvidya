import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Toast from '../Toast.svelte';
import { showToast, dismissToast, getToasts } from '$lib/toast.svelte';

describe('Toast', () => {
	it('queue renders and dismisses', async () => {
		render(Toast);
		const id = showToast('Territory secured!', 'success', 60_000);
		expect(await screen.findByText('Territory secured!')).toBeInTheDocument();
		expect(screen.getByText('Territory secured!')).toHaveClass('success');

		dismissToast(id);
		expect(getToasts()).toHaveLength(0);
	});
});
