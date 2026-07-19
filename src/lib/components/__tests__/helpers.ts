import { createRawSnippet } from 'svelte';

/** Plain-text children snippet for component tests. */
export const text = (s: string) =>
	createRawSnippet(() => ({ render: () => `<span>${s}</span>` }));
