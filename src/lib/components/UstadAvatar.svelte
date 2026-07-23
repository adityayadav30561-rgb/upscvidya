<script lang="ts">
	/** Ustad — the drill instructor who runs the first-run walkthrough. A
	 *  stylized khaki-uniform bust (peaked cap + badge, stern brow, moustache).
	 *  Placeholder art in the token palette; swap for real illustration later. */
	let { size = 56 }: { size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 64 64"
	role="img"
	aria-label="Ustad, drill instructor"
>
	<!-- frame -->
	<circle cx="32" cy="32" r="31" fill="var(--khaki-tint)" stroke="var(--line)" stroke-width="2" />
	<clipPath id="ust-clip"><circle cx="32" cy="32" r="30" /></clipPath>
	<g clip-path="url(#ust-clip)">
		<!-- shoulders / uniform -->
		<path d="M8 64 C8 50 20 44 32 44 C44 44 56 50 56 64 Z" fill="var(--khaki-deep)" />
		<path d="M32 44 L26 64 M32 44 L38 64" stroke="#3f3a29" stroke-width="1.4" opacity="0.5" />
		<!-- collar tabs + rank pip -->
		<path d="M24 47 L32 52 L24 55 Z" fill="#6d6244" />
		<path d="M40 47 L32 52 L40 55 Z" fill="#6d6244" />
		<circle cx="27.5" cy="51" r="1.3" fill="var(--gold-hi)" />
		<circle cx="36.5" cy="51" r="1.3" fill="var(--gold-hi)" />
		<!-- neck -->
		<rect x="27" y="38" width="10" height="9" rx="3" fill="#d69a72" />
		<!-- face -->
		<path
			d="M21 26 C21 17 26 13 32 13 C38 13 43 17 43 26 C43 34 38 40 32 40 C26 40 21 34 21 26 Z"
			fill="#e6ac83"
		/>
		<!-- ears -->
		<circle cx="21" cy="28" r="2.4" fill="#e6ac83" />
		<circle cx="43" cy="28" r="2.4" fill="#e6ac83" />
		<!-- brows (stern) -->
		<path d="M24 24 L29.5 25.5 M40 24 L34.5 25.5" stroke="#5a4632" stroke-width="2" stroke-linecap="round" />
		<!-- eyes -->
		<circle cx="27" cy="28" r="1.7" fill="#3a2f22" />
		<circle cx="37" cy="28" r="1.7" fill="#3a2f22" />
		<!-- nose -->
		<path d="M32 28 L31 32 L33 32 Z" fill="#cf9068" />
		<!-- moustache -->
		<path d="M26 34 C29 33 31 34 32 34 C33 34 35 33 38 34 C36 36.5 33 36.5 32 36.2 C31 36.5 28 36.5 26 34 Z" fill="#4a3a29" />
		<!-- peaked cap -->
		<path d="M18 22 C18 12 24 7 32 7 C40 7 46 12 46 22 L46 23 L18 23 Z" fill="var(--khaki-deep)" />
		<rect x="16" y="22.5" width="32" height="4.5" rx="2" fill="#3f3a29" />
		<!-- cap peak -->
		<path d="M20 27 C24 30 40 30 44 27 L45 29 C40 32 24 32 19 29 Z" fill="#2f2b1e" />
		<!-- cap badge -->
		<circle cx="32" cy="15.5" r="3.4" fill="var(--gold-lo)" stroke="#3f3a29" stroke-width="1" />
		<path d="M32 13.4 L32.6 15 L34.3 15 L32.9 16 L33.4 17.6 L32 16.6 L30.6 17.6 L31.1 16 L29.7 15 L31.4 15 Z" fill="#3f3a29" />
	</g>
</svg>
