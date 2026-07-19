<script lang="ts">
	import { onMount } from 'svelte';
	import Sheet from './Sheet.svelte';
	import Button from './Button.svelte';

	/* Custom install prompt — shown after the 2nd visit (build book Prompt 03).
	   Android/Chrome: captures beforeinstallprompt and offers native install.
	   iOS: shows manual "Add to Home Screen" instructions. */

	let visible = $state(false);
	let showIosSheet = $state(false);
	let deferredPrompt: (Event & { prompt: () => Promise<void> }) | null = null;

	const isIos = () =>
		/iphone|ipad|ipod/i.test(navigator.userAgent) && !('MSStream' in window);
	const isStandalone = () =>
		window.matchMedia('(display-mode: standalone)').matches ||
		('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true);

	onMount(() => {
		if (isStandalone() || localStorage.getItem('install-dismissed')) return;

		const visits = Number(localStorage.getItem('visit-count') ?? '0') + 1;
		localStorage.setItem('visit-count', String(visits));
		if (visits < 2) return;

		if (isIos()) {
			visible = true;
			return;
		}
		const handler = (e: Event) => {
			e.preventDefault();
			deferredPrompt = e as Event & { prompt: () => Promise<void> };
			visible = true;
		};
		window.addEventListener('beforeinstallprompt', handler);
		return () => window.removeEventListener('beforeinstallprompt', handler);
	});

	async function install() {
		if (deferredPrompt) {
			await deferredPrompt.prompt();
			visible = false;
		} else if (isIos()) {
			showIosSheet = true;
		}
	}

	function dismiss() {
		visible = false;
		localStorage.setItem('install-dismissed', '1');
	}
</script>

{#if visible}
	<div class="prompt">
		<div class="copy">
			<div class="head">Install UPSCVidya</div>
			<div class="sub">Full-screen app, offline notes, faster launch.</div>
		</div>
		<Button variant="primary" onclick={install}>Install</Button>
		<Button variant="ghost" onclick={dismiss}>Later</Button>
	</div>
{/if}

<Sheet bind:open={showIosSheet} title="Add to Home Screen">
	<ol class="ios-steps">
		<li>Tap the <strong>Share</strong> button in Safari's toolbar</li>
		<li>Scroll and tap <strong>Add to Home Screen</strong></li>
		<li>Tap <strong>Add</strong> — UPSCVidya installs like an app</li>
	</ol>
</Sheet>

<style>
	.prompt {
		position: fixed;
		left: 12px;
		right: 12px;
		bottom: 84px;
		max-width: 480px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--bg-2);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		box-shadow: var(--shadow-soft);
		padding: 12px 16px;
		z-index: 55;
	}
	.copy {
		flex: 1;
		min-width: 0;
	}
	.head {
		font-family: var(--font-display);
		font-size: 14px;
		text-transform: uppercase;
	}
	.sub {
		font-size: 11.5px;
		color: var(--ink-3);
	}
	.ios-steps {
		margin: 0;
		padding-left: 20px;
		font-size: 14px;
		line-height: 1.9;
		color: var(--ink-2);
	}
</style>
