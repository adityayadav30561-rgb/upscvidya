import { defineConfig } from '@playwright/test';

/** E2E config — suites land with Prompt 04 (auth golden path).
 *  Run `pnpm exec playwright install chromium` once before first use. */
export default defineConfig({
	testDir: 'e2e',
	webServer: {
		command: 'pnpm build && pnpm preview',
		port: 4173,
		reuseExistingServer: true
	},
	use: {
		baseURL: 'http://localhost:4173'
	}
});
