import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

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
	]
});
