<script lang="ts">
	/** iOS/Android-style edge-swipe-to-go-back. A drag that STARTS within ~26px
	 *  of the left screen edge and travels right past a threshold calls
	 *  history.back(). A chevron affordance follows the finger and only commits
	 *  past the trigger point, so accidental edge touches do nothing. */
	import { onMount } from 'svelte';
	import { haptic } from '$lib/native';

	const EDGE = 26; // px from the left edge a drag must start within
	const TRIGGER = 88; // px of rightward travel to fire back
	const V_TOLERANCE = 0.8; // |dy| must stay below this × |dx| (mostly horizontal)

	let active = $state(false);
	let dx = $state(0);
	let armed = false;
	let startX = 0;
	let startY = 0;

	const progress = $derived(Math.min(1, dx / TRIGGER));

	function canGoBack(): boolean {
		return typeof history !== 'undefined' && history.length > 1;
	}

	function onStart(e: TouchEvent) {
		if (!canGoBack() || e.touches.length !== 1) return;
		const t = e.touches[0];
		if (t.clientX > EDGE) return;
		// ignore edge touches that land on an opted-out region (h-scrollers etc.)
		const el = e.target as HTMLElement | null;
		if (el?.closest('[data-no-swipe]')) return;
		armed = true;
		startX = t.clientX;
		startY = t.clientY;
		dx = 0;
	}

	function onMove(e: TouchEvent) {
		if (!armed) return;
		const t = e.touches[0];
		const moveX = t.clientX - startX;
		const moveY = t.clientY - startY;
		if (Math.abs(moveY) > Math.abs(moveX) * V_TOLERANCE && Math.abs(moveY) > 12) {
			// vertical intent — abandon (let the page scroll)
			cancel();
			return;
		}
		if (moveX <= 0) {
			dx = 0;
			active = false;
			return;
		}
		active = true;
		dx = moveX;
		e.preventDefault(); // stop horizontal rubber-banding while dragging
	}

	function onEnd() {
		if (!armed) return;
		const fire = dx >= TRIGGER;
		cancel();
		if (fire && canGoBack()) {
			haptic(10);
			history.back();
		}
	}

	function cancel() {
		armed = false;
		active = false;
		dx = 0;
	}

	onMount(() => {
		window.addEventListener('touchstart', onStart, { passive: true });
		window.addEventListener('touchmove', onMove, { passive: false });
		window.addEventListener('touchend', onEnd, { passive: true });
		window.addEventListener('touchcancel', cancel, { passive: true });
		return () => {
			window.removeEventListener('touchstart', onStart);
			window.removeEventListener('touchmove', onMove);
			window.removeEventListener('touchend', onEnd);
			window.removeEventListener('touchcancel', cancel);
		};
	});
</script>

{#if active}
	<div class="affordance" class:ready={progress >= 1} style:transform="translate(-50%, -50%) translateX({dx * 0.5}px)" aria-hidden="true">
		<div class="pill" style:opacity={0.3 + progress * 0.7}>
			<svg viewBox="0 0 14 14" width="16" height="16"><path d="M9 2 L4 7 L9 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
		</div>
	</div>
{/if}

<style>
	.affordance {
		position: fixed;
		left: 0;
		top: 50%;
		z-index: 9000;
		pointer-events: none;
	}
	.pill {
		width: 40px;
		height: 40px;
		border-radius: var(--r-full);
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		box-shadow: var(--shadow-2);
		color: var(--ink-2);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background var(--t-fast) var(--ease);
	}
	.affordance.ready .pill {
		background: var(--orange);
		color: #4d4433;
	}
</style>
