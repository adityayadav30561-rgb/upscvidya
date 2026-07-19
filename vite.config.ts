import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Static output for Cloudflare Pages. SPA fallback so client-side
			// routing works for dynamic routes (territory map, quiz player, etc.).
			adapter: adapter({
				fallback: 'index.html',
				strict: false
			})
		})
	],
	// vitest must resolve svelte's browser build, not the SSR one
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	test: {
		environment: 'jsdom',
		globals: true, // enables @testing-library auto-cleanup between tests
		include: ['src/**/*.test.ts'],
		setupFiles: ['src/vitest-setup.ts']
	}
});
