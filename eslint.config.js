import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: {
				window: 'readonly',
				document: 'readonly',
				localStorage: 'readonly',
				navigator: 'readonly',
				fetch: 'readonly',
				console: 'readonly',
				process: 'readonly',
				setTimeout: 'readonly',
				requestAnimationFrame: 'readonly',
				cancelAnimationFrame: 'readonly',
				URL: 'readonly',
				Response: 'readonly',
				caches: 'readonly',
				location: 'readonly',
				self: 'readonly'
			}
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
				extraFileExtensions: ['.svelte']
			}
		}
	},
	{
		rules: {
			// static-adapter SPA — plain hrefs are fine
			'svelte/no-navigation-without-resolve': 'off',
			// we use Date as an immutable value, never mutated after creation
			'svelte/prefer-svelte-reactivity': 'off',
			// fully-TS project: svelte-check owns undefined-symbol errors,
			// no-undef false-positives on DOM lib types (KeyboardEvent etc.)
			'no-undef': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			]
		}
	},
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'node_modules/',
			'pb/',
			'static/',
			'e2e/',
			'docs/', // design prototypes — not project code
			'Army game app redesign directions/', // Fable handoff bundle (vendor)
			'content/'
		]
	}
);
