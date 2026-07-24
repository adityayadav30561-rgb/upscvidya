<script lang="ts">
	/** Ustad's guided-tour overlay. Spotlight + bubble both animate off the SAME
	 *  rect via CSS transitions, so they glide together (no scroll/measure lag).
	 *  The cutout is a box-shadow "hole" (GPU-cheap, smooth on mobile) rather than
	 *  an SVG mask that would snap. Mounted once in the authed layout. */
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { tour, nextStep, prevStep, skipTour, STEPS } from '$lib/tour.svelte';
	import UstadAvatar from './UstadAvatar.svelte';

	const PAD = 8;

	let vw = $state(0);
	let vh = $state(0);
	let bubbleH = $state(200);
	// the hole rect; for a targetless (centered) step it collapses to a point at
	// screen centre so the box-shadow still dims everything.
	let rect = $state({ x: 0, y: 0, w: 0, h: 0 });
	let targeted = $state(false);
	let currentEl: HTMLElement | null = null;

	function centre() {
		rect = { x: vw / 2, y: vh / 2, w: 0, h: 0 };
		targeted = false;
	}
	function measure() {
		if (!currentEl) return;
		const r = currentEl.getBoundingClientRect();
		rect = { x: r.left, y: r.top, w: r.width, h: r.height };
	}

	// navigation + target acquisition — instant scroll, measure next frame, let
	// CSS animate the move (no smooth-scroll/timeout desync)
	$effect(() => {
		if (!tour.active) {
			currentEl = null;
			return;
		}
		const step = tour.current; // dep: index
		const path = page.url.pathname; // dep: route
		if (path !== step.route) {
			currentEl = null;
			goto(step.route);
			return;
		}
		if (!step.target) {
			currentEl = null;
			centre();
			return;
		}
		let cancelled = false;
		let frames = 0;
		const find = () => {
			if (cancelled) return;
			const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
			if (el) {
				currentEl = el;
				const r = el.getBoundingClientRect();
				if (r.top < 48 || r.bottom > vh - 48) el.scrollIntoView({ block: 'center', behavior: 'auto' });
				requestAnimationFrame(() => {
					if (!cancelled) {
						targeted = true;
						measure();
					}
				});
				return;
			}
			if (frames++ < 180) requestAnimationFrame(find);
			else centre(); // graceful fallback: centred bubble
		};
		find();
		return () => {
			cancelled = true;
		};
	});

	const bubbleW = $derived(Math.min(320, vw - 24));

	const place = $derived.by(() => {
		const bw = bubbleW;
		if (!targeted) {
			return { top: Math.max(16, (vh - bubbleH) / 2), left: Math.max(12, (vw - bw) / 2) };
		}
		const below = rect.y + rect.h + 16;
		let top: number;
		if (below + bubbleH + 16 <= vh) top = below;
		else top = Math.max(16, rect.y - bubbleH - 16);
		let left = rect.x + rect.w / 2 - bw / 2;
		left = Math.min(Math.max(12, left), vw - bw - 12);
		return { top, left };
	});
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} onresize={measure} onscroll={measure} />

{#if tour.active}
	<div class="tour" role="dialog" aria-modal="true" aria-label="Guided walkthrough">
		<!-- interaction blocker (transparent) so the app underneath can't be tapped -->
		<div class="blocker"></div>
		<!-- box-shadow cutout = dim + spotlight, animated -->
		<div
			class="hole"
			class:ring={targeted}
			style="left:{rect.x - PAD}px; top:{rect.y - PAD}px; width:{rect.w + PAD * 2}px; height:{rect.h + PAD * 2}px"
		></div>

		<div
			class="bubble"
			style="top:{place.top}px; left:{place.left}px; width:{bubbleW}px"
			bind:clientHeight={bubbleH}
		>
			<div class="head">
				<UstadAvatar size={52} />
				<div class="who">
					<div class="name">USTAD</div>
					<div class="role">Drill Instructor</div>
				</div>
				<button class="skip" onclick={skipTour}>Skip</button>
			</div>
			{#key tour.index}
				<div class="copy">
					<div class="title">{tour.current.title}</div>
					<p class="body">{tour.current.body}</p>
				</div>
			{/key}
			<div class="foot">
				<div class="dots" aria-hidden="true">
					{#each STEPS as _, i (i)}
						<span class="dot" class:on={i <= tour.index}></span>
					{/each}
				</div>
				<div class="btns">
					{#if !tour.isFirst}<button class="back" onclick={prevStep}>Back</button>{/if}
					<button class="next" onclick={nextStep}>
						{tour.isLast ? 'Dismissed →' : 'Next →'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.tour {
		position: fixed;
		inset: 0;
		z-index: 9999;
	}
	.blocker {
		position: absolute;
		inset: 0;
	}
	.hole {
		position: absolute;
		border-radius: 14px;
		box-shadow: 0 0 0 100vmax rgba(26, 22, 14, 0.68);
		pointer-events: none;
		will-change: left, top, width, height;
	}
	.hole.ring {
		outline: 3px solid var(--orange);
		outline-offset: 0;
		box-shadow:
			0 0 0 100vmax rgba(26, 22, 14, 0.68),
			0 0 14px 2px rgba(224, 122, 47, 0.55);
	}
	.bubble {
		position: absolute;
		background: var(--bg-0);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		box-shadow: var(--shadow-soft);
		padding: 14px 16px 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		will-change: top, left;
	}
	/* smooth glide for the spotlight + bubble; the fade-in pop on first appear.
	   All motion is opt-out under prefers-reduced-motion. */
	@media (prefers-reduced-motion: no-preference) {
		.hole {
			transition:
				left 320ms cubic-bezier(0.4, 0, 0.2, 1),
				top 320ms cubic-bezier(0.4, 0, 0.2, 1),
				width 320ms cubic-bezier(0.4, 0, 0.2, 1),
				height 320ms cubic-bezier(0.4, 0, 0.2, 1),
				box-shadow 200ms ease,
				outline-color 200ms ease;
		}
		.bubble {
			transition:
				top 320ms cubic-bezier(0.4, 0, 0.2, 1),
				left 320ms cubic-bezier(0.4, 0, 0.2, 1);
			animation: bubble-in 240ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
		}
		.copy {
			animation: copy-in 260ms ease;
		}
	}
	@keyframes bubble-in {
		from {
			transform: scale(0.92);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}
	@keyframes copy-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.who {
		flex: 1;
	}
	.name {
		font-family: var(--font-display);
		font-size: 16px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.role {
		font-size: 10px;
		font-weight: 700;
		color: var(--ink-3);
		text-transform: uppercase;
	}
	.skip {
		background: none;
		border: none;
		color: var(--ink-3);
		font-size: 11.5px;
		font-weight: 700;
		cursor: pointer;
		padding: 4px;
	}
	.copy {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.title {
		font-family: var(--font-display);
		font-size: 17px;
		text-transform: uppercase;
		color: var(--ink-1);
	}
	.body {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--ink-2);
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-top: 2px;
	}
	.dots {
		display: flex;
		gap: 5px;
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: var(--r-full);
		background: var(--line-soft);
		transition: background 200ms ease;
	}
	.dot.on {
		background: var(--orange-deep);
	}
	.btns {
		display: flex;
		gap: 8px;
	}
	.back {
		font-family: var(--font-ui);
		font-weight: 700;
		font-size: 13px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 8px 16px;
		cursor: pointer;
	}
	.next {
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 13px;
		background: var(--orange);
		color: #4d4433;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 8px 18px;
		cursor: pointer;
		box-shadow: var(--shadow-2);
	}
</style>
