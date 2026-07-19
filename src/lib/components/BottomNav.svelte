<script lang="ts">
	import { page } from '$app/state';

	/* Foundations §05 BOTTOM NAV — floating pill, active tab = orange pill.
	   Tabs: BASE (home), MAP, TESTS, BRIEFING, PROFILE. */
	const tabs = [
		{ href: '/', label: 'BASE', icon: 'base' },
		{ href: '/map', label: 'MAP', icon: 'map' },
		{ href: '/tests', label: 'TESTS', icon: 'tests' },
		{ href: '/briefing', label: 'BRIEFING', icon: 'briefing' },
		{ href: '/profile', label: 'PROFILE', icon: 'profile' }
	] as const;

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<nav class="bottom-nav" aria-label="primary">
	{#each tabs as tab (tab.href)}
		<a href={tab.href} class="tab" class:active={isActive(tab.href)} aria-current={isActive(tab.href) ? 'page' : undefined}>
			<svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true">
				{#if tab.icon === 'base'}
					<path d="M3 9 L10 3 L17 9 V17 H12 V12 H8 V17 H3 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
				{:else if tab.icon === 'map'}
					<path d="M3 5 L8 3 L12 5 L17 3 V15 L12 17 L8 15 L3 17 Z M8 3 V15 M12 5 V17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
				{:else if tab.icon === 'tests'}
					<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.6" />
					<path d="M10 6 V10 L13 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
				{:else if tab.icon === 'briefing'}
					<path d="M4 4 H16 V16 H4 Z M4 8 H16 M8 8 V16" fill="none" stroke="currentColor" stroke-width="1.5" />
				{:else if tab.icon === 'profile'}
					<circle cx="10" cy="7" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6" />
					<path d="M4 17 C4.5 13.5 7 12 10 12 C13 12 15.5 13.5 16 17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
				{/if}
			</svg>
			<span class="label">{tab.label}</span>
		</a>
	{/each}
</nav>

<style>
	.bottom-nav {
		position: fixed;
		left: 12px;
		right: 12px;
		bottom: 12px;
		max-width: 480px;
		margin: 0 auto;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 7px;
		display: flex;
		justify-content: space-around;
		box-shadow: var(--shadow-2);
		z-index: 50;
	}
	.tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 6px 11px;
		color: var(--ink-2);
		border-radius: var(--r-full);
		min-width: 44px;
		transition:
			background var(--t-fast) var(--ease),
			color var(--t-fast) var(--ease);
	}
	.tab:hover {
		color: var(--ink-1);
	}
	.tab.active {
		background: var(--orange);
		border: var(--bw) solid var(--line);
		color: var(--ink-1);
		padding: 6px 13px;
	}
	.label {
		font-size: 8.5px;
		font-weight: 700;
	}
	.tab.active .label {
		font-weight: 900;
	}
</style>
