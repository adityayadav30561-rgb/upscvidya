<script lang="ts">
	import { page } from '$app/state';
	import { haptic } from '$lib/native';

	/* FIELD DOSSIER bottom nav — a moulded control bar sitting on a hard bottom
	   edge; each tab is a physical key: raised rust when active, pressed into
	   the panel when not. Tabs: BASE · MAP · TESTS · BRIEFING · PROFILE.
	   (The design mock labels the 4th key DRILL; BRIEFING is kept here because
	   the 07:00 push + daily-briefing loop deep-links to it — the Drill Ground
	   is reachable from the Base quick-actions.) */
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
		{@const on = isActive(tab.href)}
		<a
			href={tab.href}
			class="tab"
			class:active={on}
			aria-current={on ? 'page' : undefined}
			onclick={() => haptic()}
		>
			<span class="key">
				<svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true">
					{#if tab.icon === 'base'}
						<path d="M3 9 L10 3 L17 9 V17 H12 V12 H8 V17 H3 Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" />
					{:else if tab.icon === 'map'}
						<path d="M3 5 L8 3 L12 5 L17 3 V15 L12 17 L8 15 L3 17 Z M8 3 V15 M12 5 V17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
					{:else if tab.icon === 'tests'}
						<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.7" />
						<path d="M10 6 V10 L13 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
					{:else if tab.icon === 'briefing'}
						<path d="M4 4 H16 V16 H4 Z M4 8 H16 M8 8 V16" fill="none" stroke="currentColor" stroke-width="1.6" />
					{:else if tab.icon === 'profile'}
						<circle cx="10" cy="7" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7" />
						<path d="M4 17 C4.5 13.5 7 12 10 12 C13 12 15.5 13.5 16 17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
					{/if}
				</svg>
			</span>
			<span class="lbl">{tab.label}</span>
		</a>
	{/each}
</nav>

<style>
	.bottom-nav {
		position: fixed;
		left: 12px;
		right: 12px;
		/* sit above the iOS home indicator / Android gesture bar */
		bottom: calc(12px + env(safe-area-inset-bottom, 0px));
		max-width: 480px;
		margin: 0 auto;
		height: 62px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-2xl);
		background: var(--grad-nav);
		box-shadow:
			0 6px 0 var(--edge-deep),
			0 14px 24px rgba(50, 42, 20, 0.25);
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		align-items: center;
		padding: 0 6px;
		z-index: 50;
	}
	.tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		color: var(--ink-3);
		text-decoration: none;
	}
	/* each tab is a moulded key: pressed into the panel by default */
	.key {
		width: 26px;
		height: 26px;
		border-radius: 8px;
		background: #ded5b6;
		box-shadow: inset 0 2px 3px rgba(80, 68, 35, 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			background var(--t-base) var(--ease),
			box-shadow var(--t-base) var(--ease),
			transform var(--t-fast) var(--ease);
	}
	:global([data-theme='dark']) .key {
		background: var(--bg-1);
	}
	.lbl {
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.1em;
	}
	/* active: the key pops out, lit rust */
	.tab.active {
		color: var(--ink-1);
	}
	.tab.active .key {
		background: var(--grad-rust);
		color: #fff;
		box-shadow:
			0 2px 0 var(--orange-edge),
			inset 0 1px 0 rgba(255, 255, 255, 0.45);
	}
	.tab.active .lbl {
		font-weight: 800;
	}
	.tab:active .key {
		transform: translateY(1px);
	}
</style>
