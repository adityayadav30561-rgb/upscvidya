<script module lang="ts">
	/** Achievement emblem — one distinct medallion per badge code (game-style).
	 *  A shared coin frame + ribbon, a family accent colour, and a unique inner
	 *  glyph. Locked badges render greyed with a padlock; earned badges get the
	 *  full colour, ribbon tails and a soft glow. */

	type Family = 'campaign' | 'region' | 'streak' | 'podium' | 'fitness' | 'beta';

	interface Spec {
		family: Family;
		/** accent fill for the disc */
		color: string;
		/** darker ring/stroke */
		ring: string;
		/** inner glyph paths (drawn on a -32..32 centred space) */
		glyph: string;
	}

	// glyph helper space: viewBox 64x64, everything below is translated to centre
	const G = {
		flag: '<path d="M-12 16 V-16 M-12 -14 H12 L6 -8 L12 -2 H-12" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>',
		pillar:
			'<path d="M-14 -14 H14 M-11 -8 V10 M0 -8 V10 M11 -8 V10 M-15 14 H15" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>',
		gears:
			'<circle r="8" cx="-4" cy="-3" fill="none" stroke="currentColor" stroke-width="3"/><circle r="6" cx="9" cy="8" fill="none" stroke="currentColor" stroke-width="3"/>',
		dome: '<path d="M-14 14 H14 M-11 14 V-2 A11 11 0 0 1 11 -2 V14 M0 -13 V-11" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>',
		territory:
			'<path d="M-14 -8 L-4 -12 L6 -8 L14 -12 V10 L6 14 L-4 10 L-14 14 Z M-4 -12 V10 M6 -8 V14" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round"/>',
		sprout:
			'<path d="M0 16 V-2 M0 -2 C-2 -12 -12 -12 -12 -4 C-12 2 -4 2 0 -2 M0 -4 C2 -13 12 -13 12 -6 C12 0 4 0 0 -4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
		bank: '<path d="M-15 -4 L0 -14 L15 -4 M-12 -4 V10 M-4 -4 V10 M4 -4 V10 M12 -4 V10 M-15 14 H15" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
		bolt: '<path d="M2 -16 L-10 2 H0 L-2 16 L12 -4 H2 Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>',
		scales:
			'<path d="M0 -15 V13 M-13 13 H13 M-13 -9 H13 M-13 -9 L-18 1 H-8 Z M13 -9 L8 1 H18 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>',
		flame:
			'<path d="M0 -18 C4 -8 15 -6 15 6 C15 15 8 18 0 18 C-8 18 -15 15 -15 6 C-15 -2 -8 -5 -5 -11 C-4 -6 0 -5 1 -8 C3 -12 0 -15 0 -18 Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>',
		medal:
			'<circle r="10" cy="4" fill="none" stroke="currentColor" stroke-width="3.2"/><path d="M-7 -6 L-12 -16 M7 -6 L12 -16" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>',
		burst:
			'<path d="M0 -16 L4 -5 L15 -5 L6 2 L10 14 L0 6 L-10 14 L-6 2 L-15 -5 L-4 -5 Z" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round"/>',
		checkFlag:
			'<path d="M-12 16 V-16 M-12 -14 H12 V0 H-12" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/><path d="M-12 -14 H0 V-7 H-12 M0 -7 H12 V0 H0" fill="currentColor" opacity="0.5"/>',
		boots:
			'<path d="M-10 -14 V6 H2 C8 6 10 10 16 12 V16 H-10 M-10 -6 H-2" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>',
		stopwatch:
			'<circle r="12" cy="3" fill="none" stroke="currentColor" stroke-width="3"/><path d="M0 3 V-5 M0 3 L7 6 M-4 -15 H4 M0 -15 V-9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
		dumbbell:
			'<path d="M-16 0 H16 M-16 -8 V8 M-10 -11 V11 M10 -11 V11 M16 -8 V8" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>',
		core: '<path d="M-16 -6 H16 M-16 6 H16 M-9 -6 V6 M9 -6 V6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>',
		runner:
			'<circle r="3.5" cx="6" cy="-12" fill="currentColor"/><path d="M-12 14 L-2 6 L4 -2 L12 2 M-2 6 L2 14 M4 -2 L10 -6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
		calendar:
			'<rect x="-14" y="-12" width="28" height="26" rx="3" fill="none" stroke="currentColor" stroke-width="3"/><path d="M-14 -4 H14 M-7 -16 V-8 M7 -16 V-8 M-6 4 L-1 9 L8 -1" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
		shieldCheck:
			'<path d="M0 -16 L14 -10 V2 C14 12 7 16 0 18 C-7 16 -14 12 -14 2 V-10 Z M-6 0 L-1 6 L8 -5" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>',
		rocket:
			'<path d="M0 -18 C8 -10 8 0 4 8 H-4 C-8 0 -8 -10 0 -18 Z M-4 8 L-9 15 M4 8 L9 15 M0 -6 a2 2 0 0 0 0 4 a2 2 0 0 0 0 -4" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>'
	};

	const GOLD = '#d8b04a';
	const SILVER = '#c4ccd4';
	const BRONZE = '#c08457';
	const GREEN = '#9db271';
	const KHAKI = '#a3925e';
	const BLUE = '#5872a8';
	const ORANGE = '#cf6a4a';
	const RED = '#b04a3c';

	const SPECS: Record<string, Spec> = {
		first_conquest: { family: 'campaign', color: ORANGE, ring: '#8a3d2e', glyph: G.flag },
		mock_finisher: { family: 'campaign', color: BLUE, ring: '#2e4a7a', glyph: G.checkFlag },
		beta_founder: { family: 'beta', color: GOLD, ring: '#8f6b1e', glyph: G.rocket },

		region_foundations: { family: 'region', color: GREEN, ring: '#57703c', glyph: G.pillar },
		region_system: { family: 'region', color: KHAKI, ring: '#5b5433', glyph: G.gears },
		region_centre: { family: 'region', color: ORANGE, ring: '#8a3d2e', glyph: G.dome },
		region_states: { family: 'region', color: BLUE, ring: '#2e4a7a', glyph: G.territory },
		region_grassroots: { family: 'region', color: GREEN, ring: '#57703c', glyph: G.sprout },
		region_institutions: { family: 'region', color: KHAKI, ring: '#5b5433', glyph: G.bank },
		region_dynamics: { family: 'region', color: RED, ring: '#8a3025', glyph: G.bolt },
		region_courtroom: { family: 'region', color: BLUE, ring: '#2e4a7a', glyph: G.scales },

		streak_7: { family: 'streak', color: ORANGE, ring: '#8a3d2e', glyph: G.flame },
		streak_30: { family: 'streak', color: RED, ring: '#8a3025', glyph: G.flame },
		streak_100: { family: 'streak', color: GOLD, ring: '#8f6b1e', glyph: G.flame },

		podium_1: { family: 'podium', color: GOLD, ring: '#8f6b1e', glyph: G.medal },
		podium_2: { family: 'podium', color: SILVER, ring: '#7c8894', glyph: G.medal },
		podium_3: { family: 'podium', color: BRONZE, ring: '#8a5a38', glyph: G.medal },
		commendation: { family: 'podium', color: KHAKI, ring: '#5b5433', glyph: G.burst },

		pet_ready: { family: 'fitness', color: GREEN, ring: '#57703c', glyph: G.shieldCheck },
		first_workout: { family: 'fitness', color: KHAKI, ring: '#5b5433', glyph: G.boots },
		circuit_finisher: { family: 'fitness', color: ORANGE, ring: '#8a3d2e', glyph: G.stopwatch },
		pushups_50: { family: 'fitness', color: RED, ring: '#8a3025', glyph: G.dumbbell },
		plank_5min: { family: 'fitness', color: BLUE, ring: '#2e4a7a', glyph: G.core },
		run_5k: { family: 'fitness', color: GREEN, ring: '#57703c', glyph: G.runner },
		regiment_30: { family: 'fitness', color: GOLD, ring: '#8f6b1e', glyph: G.calendar }
	};

	const FALLBACK: Spec = { family: 'campaign', color: KHAKI, ring: '#5b5433', glyph: G.burst };

	export function badgeSpec(code: string): { family: string; color: string } {
		const s = SPECS[code] ?? FALLBACK;
		return { family: s.family, color: s.color };
	}
</script>

<script lang="ts">
	let {
		code,
		earned = false,
		size = 60,
		engraved = false
	}: {
		code: string;
		earned?: boolean;
		size?: number;
		/** glyph only, no coin/ribbon/lock — for empty medal sockets */
		engraved?: boolean;
	} = $props();

	const spec = $derived(SPECS[code] ?? FALLBACK);
	const uid = `bi-${Math.random().toString(36).slice(2, 8)}`;
</script>

{#if engraved}
	<!-- socket engraving: the glyph etched into the felt, nothing else -->
	<div class="emblem etched" style:width="{size}px" style:height="{size}px">
		<svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label={code}>
			<g transform="translate(32 32) scale(0.72)" color="currentColor">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- spec.glyph is a hardcoded SVG-path constant from SPECS above, never user input -->
				{@html spec.glyph}
			</g>
		</svg>
	</div>
{:else}
<div class="emblem" class:earned style:width="{size}px" style:height="{size}px">
	<svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label={code}>
		<defs>
			<radialGradient id="{uid}-face" cx="0.5" cy="0.38" r="0.7">
				<stop offset="0" stop-color={earned ? spec.color : '#cbc3ac'} />
				<stop offset="1" stop-color={earned ? spec.ring : '#a49c85'} />
			</radialGradient>
		</defs>

		<!-- ribbon tails (earned only) -->
		{#if earned}
			<path d="M22 44 L16 62 L24 57 L30 62 L30 44 Z" fill={spec.ring} stroke="#4d4433" stroke-width="1.5" />
			<path d="M42 44 L48 62 L40 57 L34 62 L34 44 Z" fill={spec.ring} stroke="#4d4433" stroke-width="1.5" />
		{/if}

		<!-- coin -->
		<circle cx="32" cy="30" r="25" fill={earned ? spec.ring : '#9c957f'} />
		<circle cx="32" cy="30" r="25" fill="none" stroke="#4d4433" stroke-width="2.5" />
		<circle cx="32" cy="30" r="20" fill="url(#{uid}-face)" stroke="#4d4433" stroke-width="1.5" />

		<!-- scalloped notches -->
		{#each Array(12) as _, i (i)}
			<circle
				cx={32 + 25 * Math.cos((i / 12) * 6.283)}
				cy={30 + 25 * Math.sin((i / 12) * 6.283)}
				r="1.6"
				fill="#4d4433"
				opacity={earned ? 0.55 : 0.3}
			/>
		{/each}

		<!-- glyph -->
		<g transform="translate(32 29) scale(0.62)" color={earned ? '#33301f' : '#7d765f'} opacity={earned ? 1 : 0.7}>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- spec.glyph is a hardcoded SVG-path constant from SPECS above, never user input -->
			{@html spec.glyph}
		</g>

		<!-- lock overlay (unearned) -->
		{#if !earned}
			<g transform="translate(43 40)">
				<rect x="-7" y="-3" width="14" height="11" rx="2.5" fill="#5b5433" stroke="#33301f" stroke-width="1.3" />
				<path d="M-4 -3 V-6 a4 4 0 0 1 8 0 V-3" fill="none" stroke="#33301f" stroke-width="1.8" />
			</g>
		{/if}
	</svg>
</div>
{/if}

<style>
	.emblem {
		flex: none;
		filter: grayscale(0.15);
	}
	.emblem.earned {
		filter: drop-shadow(0 0 6px rgba(216, 176, 74, 0.35));
	}
	/* etched: takes its colour from the socket it sits in */
	.emblem.etched {
		filter: none;
		opacity: 0.85;
	}
</style>
