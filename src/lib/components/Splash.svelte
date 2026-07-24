<script module lang="ts">
	// module-scoped: survives component churn during a single page load, so
	// client-side navigation never re-shows the splash. A full reload resets it.
	let seen = false;
</script>

<script lang="ts">
	/** Cold-start launch splash — the brand mark for a brief beat, then fades to
	 *  reveal the app (mobile app-open feel). The mark SVG is inlined so it paints
	 *  instantly with no network flash. Honours prefers-reduced-motion. */
	import { onMount } from 'svelte';

	let gone = $state(seen);
	let fading = $state(false);

	onMount(() => {
		if (seen) {
			gone = true;
			return;
		}
		seen = true;
		const hold = setTimeout(() => (fading = true), 720);
		const drop = setTimeout(() => (gone = true), 720 + 400);
		return () => {
			clearTimeout(hold);
			clearTimeout(drop);
		};
	});
</script>

{#if !gone}
	<div class="splash" class:fading aria-hidden="true">
		<div class="mark">
			<svg viewBox="0 0 112 112">
				<defs>
					<linearGradient id="sp-board" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" stop-color="#a3925e" /><stop offset="1" stop-color="#82744a" />
					</linearGradient>
					<linearGradient id="sp-steel" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" stop-color="#d3dce4" /><stop offset="1" stop-color="#6f7c8a" />
					</linearGradient>
				</defs>
				<rect x="4" y="4" width="104" height="104" rx="20" fill="none" stroke="#4d4433" stroke-width="5" />
				<path class="board" d="M36 92 V38 L56 18 L76 38 V92 Z" fill="url(#sp-board)" stroke="#5f5537" stroke-width="3" />
				<g class="star" transform="translate(56 58) scale(1.9)">
					<path d="M0 -10 L2.35 -3.24 L9.51 -3.09 L3.8 1.24 L5.88 8.09 L0 4 L-5.88 8.09 L-3.8 1.24 L-9.51 -3.09 L-2.35 -3.24 Z" fill="url(#sp-steel)" />
				</g>
			</svg>
		</div>
		<div class="word">UPSCVIDYA</div>
		<div class="bar" aria-hidden="true"><span></span></div>
	</div>
{/if}

<style>
	.splash {
		position: fixed;
		inset: 0;
		z-index: 10000;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		background: var(--bg-0);
		background-image:
			repeating-linear-gradient(0deg, rgba(110, 95, 58, 0.035) 0 1px, transparent 1px 3px),
			repeating-linear-gradient(90deg, rgba(110, 95, 58, 0.03) 0 1px, transparent 1px 4px);
		transition: opacity 380ms ease;
	}
	.splash.fading {
		opacity: 0;
		pointer-events: none;
	}
	.mark {
		width: 96px;
		height: 96px;
		filter: drop-shadow(var(--shadow-2, 3px 3px 0 rgba(77, 68, 51, 0.25)));
	}
	.mark svg {
		width: 100%;
		height: 100%;
	}
	.word {
		font-family: var(--font-display);
		font-size: 22px;
		letter-spacing: 0.14em;
		color: var(--ink-1);
	}
	.bar {
		width: 120px;
		height: 4px;
		border-radius: var(--r-full);
		background: var(--bg-2);
		border: 1px solid var(--line-soft);
		overflow: hidden;
	}
	.bar span {
		display: block;
		width: 40%;
		height: 100%;
		border-radius: var(--r-full);
		background: var(--orange);
	}

	@media (prefers-reduced-motion: no-preference) {
		.mark {
			animation: mark-in 520ms cubic-bezier(0.2, 0.9, 0.3, 1.25) both;
		}
		.star {
			transform-box: fill-box;
			transform-origin: center;
			animation: star-spin 620ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
		}
		.word {
			animation: word-in 460ms ease 120ms both;
		}
		.bar span {
			animation: bar-slide 900ms ease-in-out infinite;
		}
	}
	@keyframes mark-in {
		from {
			transform: scale(0.8);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}
	@keyframes star-spin {
		from {
			transform: rotate(-90deg) scale(0.4);
			opacity: 0;
		}
		to {
			transform: rotate(0) scale(1);
			opacity: 1;
		}
	}
	@keyframes word-in {
		from {
			transform: translateY(6px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}
	@keyframes bar-slide {
		0% {
			transform: translateX(-120%);
		}
		100% {
			transform: translateX(320%);
		}
	}
</style>
