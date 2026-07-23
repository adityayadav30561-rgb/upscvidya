<script lang="ts">
	/** Ustad's guided-tour overlay. Reads the tour engine, drives navigation to
	 *  each step's route, spotlights the target element (data-tour="…") with a
	 *  dimmed cutout, and floats a speech bubble beside it. Mounted once in the
	 *  authed layout so it survives route changes. */
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { tour, nextStep, prevStep, skipTour, STEPS } from '$lib/tour.svelte';
	import UstadAvatar from './UstadAvatar.svelte';

	const PAD = 8;

	let vw = $state(0);
	let vh = $state(0);
	let bubbleH = $state(220);
	let rect = $state<{ x: number; y: number; w: number; h: number } | null>(null);
	let currentEl: HTMLElement | null = null;

	function measure() {
		if (!currentEl) return;
		const r = currentEl.getBoundingClientRect();
		rect = { x: r.left, y: r.top, w: r.width, h: r.height };
	}

	// navigation + target acquisition, re-run on step or route change
	$effect(() => {
		if (!tour.active) {
			rect = null;
			currentEl = null;
			return;
		}
		const step = tour.current; // dep: index
		const path = page.url.pathname; // dep: route
		if (path !== step.route) {
			rect = null;
			currentEl = null;
			goto(step.route);
			return;
		}
		if (!step.target) {
			rect = null;
			currentEl = null;
			return;
		}
		let cancelled = false;
		let frames = 0;
		const find = () => {
			if (cancelled) return;
			const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
			if (el) {
				currentEl = el;
				el.scrollIntoView({ block: 'center', behavior: 'smooth' });
				setTimeout(() => {
					if (!cancelled) measure();
				}, 320);
				return;
			}
			if (frames++ < 150) requestAnimationFrame(find);
			else {
				currentEl = null;
				rect = null; // graceful: show a centered bubble
			}
		};
		find();
		return () => {
			cancelled = true;
		};
	});

	const bubbleW = $derived(Math.min(320, vw - 24));

	const place = $derived.by(() => {
		const bw = bubbleW;
		if (!rect) {
			return { top: Math.max(16, (vh - bubbleH) / 2), left: Math.max(12, (vw - bw) / 2) };
		}
		const below = rect.y + rect.h + 14;
		let top: number;
		if (below + bubbleH + 16 <= vh) top = below;
		else top = Math.max(16, rect.y - bubbleH - 14);
		let left = rect.x + rect.w / 2 - bw / 2;
		left = Math.min(Math.max(12, left), vw - bw - 12);
		return { top, left };
	});
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} onresize={measure} onscroll={measure} />

{#if tour.active}
	<div class="tour" role="dialog" aria-modal="true" aria-label="Guided walkthrough">
		<svg class="scrim" width={vw} height={vh} aria-hidden="true">
			<defs>
				<mask id="tour-hole">
					<rect x="0" y="0" width={vw} height={vh} fill="white" />
					{#if rect}
						<rect
							x={rect.x - PAD}
							y={rect.y - PAD}
							width={rect.w + PAD * 2}
							height={rect.h + PAD * 2}
							rx="12"
							fill="black"
						/>
					{/if}
				</mask>
			</defs>
			<rect x="0" y="0" width={vw} height={vh} fill="rgba(26,22,14,0.68)" mask="url(#tour-hole)" />
			{#if rect}
				<rect
					class="ring"
					x={rect.x - PAD}
					y={rect.y - PAD}
					width={rect.w + PAD * 2}
					height={rect.h + PAD * 2}
					rx="12"
				/>
			{/if}
		</svg>

		<div class="bubble" style="top:{place.top}px; left:{place.left}px; width:{bubbleW}px" bind:clientHeight={bubbleH}>
			<div class="head">
				<UstadAvatar size={52} />
				<div class="who">
					<div class="name">USTAD</div>
					<div class="role">Drill Instructor</div>
				</div>
				<button class="skip" onclick={skipTour}>Skip</button>
			</div>
			<div class="title">{tour.current.title}</div>
			<p class="body">{tour.current.body}</p>
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
	.scrim {
		position: absolute;
		inset: 0;
		display: block;
	}
	.ring {
		fill: none;
		stroke: var(--orange);
		stroke-width: 3;
		filter: drop-shadow(0 0 8px rgba(224, 122, 47, 0.7));
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
		animation: pop var(--t-fast, 160ms) var(--ease, ease);
	}
	@keyframes pop {
		from {
			transform: scale(0.96);
			opacity: 0.4;
		}
		to {
			transform: scale(1);
			opacity: 1;
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
