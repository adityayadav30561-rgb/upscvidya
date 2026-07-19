<script lang="ts">
	import type { RankCode } from '$lib/types';

	let {
		rank,
		width = 56
	}: {
		rank: RankCode;
		width?: number;
	} = $props();

	/* SVG recipes lifted verbatim from Foundations §04 — the full 14-grade
	 * CAPF ladder. Codes + XP thresholds live in $lib/ranks. */
	const uid = `ri-${Math.random().toString(36).slice(2, 8)}`;
	const height = $derived(Math.round((width / 56) * 92));

	type Piece =
		| { kind: 'ring'; t: string }
		| { kind: 'chev'; t: string }
		| { kind: 'star'; t: string }
		| { kind: 'stripe'; t: string }
		| { kind: 'swords'; t: string }
		| { kind: 'emblem'; x: number; y: number; w: number; h: number };

	const recipes: Record<RankCode, Piece[]> = {
		cadet: [{ kind: 'ring', t: 'translate(28 46)' }],
		constable: [{ kind: 'chev', t: 'translate(28 50) scale(.85)' }],
		sr_constable: [
			{ kind: 'chev', t: 'translate(28 42) scale(.85)' },
			{ kind: 'chev', t: 'translate(28 57) scale(.85)' }
		],
		head_constable: [
			{ kind: 'chev', t: 'translate(28 34) scale(.85)' },
			{ kind: 'chev', t: 'translate(28 48) scale(.85)' },
			{ kind: 'chev', t: 'translate(28 62) scale(.85)' }
		],
		asi: [
			{ kind: 'star', t: 'translate(28 40) scale(.62)' },
			{ kind: 'stripe', t: 'translate(28 76)' }
		],
		si: [
			{ kind: 'star', t: 'translate(28 30) scale(.62)' },
			{ kind: 'star', t: 'translate(28 50) scale(.62)' },
			{ kind: 'stripe', t: 'translate(28 76)' }
		],
		inspector: [
			{ kind: 'star', t: 'translate(28 22) scale(.62)' },
			{ kind: 'star', t: 'translate(28 42) scale(.62)' },
			{ kind: 'star', t: 'translate(28 62) scale(.62)' },
			{ kind: 'stripe', t: 'translate(28 76)' }
		],
		ac: [
			{ kind: 'star', t: 'translate(28 26) scale(.68)' },
			{ kind: 'star', t: 'translate(28 46) scale(.68)' },
			{ kind: 'star', t: 'translate(28 66) scale(.68)' }
		],
		dc: [{ kind: 'emblem', x: 19.7, y: 32, w: 16.6, h: 24 }],
		second_in_command: [
			{ kind: 'emblem', x: 20.7, y: 17.5, w: 14.5, h: 21 },
			{ kind: 'star', t: 'translate(28 54) scale(.68)' }
		],
		commandant: [
			{ kind: 'emblem', x: 21.1, y: 14, w: 13.8, h: 20 },
			{ kind: 'star', t: 'translate(28 48) scale(.64)' },
			{ kind: 'star', t: 'translate(28 67) scale(.64)' }
		],
		dig: [
			{ kind: 'emblem', x: 21.4, y: 12.5, w: 13.1, h: 19 },
			{ kind: 'star', t: 'translate(28 44) scale(.56)' },
			{ kind: 'star', t: 'translate(20 60) scale(.56)' },
			{ kind: 'star', t: 'translate(36 60) scale(.56)' }
		],
		ig: [
			{ kind: 'star', t: 'translate(28 28) scale(.68)' },
			{ kind: 'swords', t: 'translate(28 54)' }
		],
		dg: [
			{ kind: 'emblem', x: 21.1, y: 16, w: 13.8, h: 20 },
			{ kind: 'swords', t: 'translate(28 56)' }
		]
	};

	const pieces = $derived(recipes[rank]);
</script>

<svg {width} {height} viewBox="0 0 56 92" role="img" aria-label="rank insignia: {rank}">
	<defs>
		<linearGradient id="{uid}-steel" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#d3dce4" /><stop offset="1" stop-color="#6f7c8a" />
		</linearGradient>
		<linearGradient id="{uid}-board" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#a3925e" /><stop offset="1" stop-color="#82744a" />
		</linearGradient>
	</defs>

	<!-- shoulder board -->
	<path d="M11 89 V24 L28 7 L45 24 V89 Z" fill="url(#{uid}-board)" stroke="#5f5537" stroke-width="1.5" />

	{#each pieces as p, i (i)}
		{#if p.kind === 'ring'}
			<g transform={p.t}><circle r="5" fill="none" stroke="url(#{uid}-steel)" stroke-width="1.8" /></g>
		{:else if p.kind === 'chev'}
			<g transform={p.t}><path d="M-11 3 L0 -6 L11 3 L11 9 L0 0 L-11 9 Z" fill="#b23b30" /></g>
		{:else if p.kind === 'star'}
			<g transform={p.t}>
				<path
					d="M0 -10 L2.35 -3.24 L9.51 -3.09 L3.8 1.24 L5.88 8.09 L0 4 L-5.88 8.09 L-3.8 1.24 L-9.51 -3.09 L-2.35 -3.24 Z"
					fill="url(#{uid}-steel)"
				/>
			</g>
		{:else if p.kind === 'stripe'}
			<g transform={p.t}>
				<rect x="-13" y="-3" width="26" height="6" fill="#a63a30" />
				<rect x="-13" y="-1" width="26" height="2" fill="#2e4a7a" />
			</g>
		{:else if p.kind === 'swords'}
			<g transform={p.t}>
				<path d="M-8 8 L8 -8 M8 8 L-8 -8" stroke="url(#{uid}-steel)" stroke-width="2.4" stroke-linecap="round" />
				<path d="M-7.2 3.4 L-3.4 7.2 M7.2 3.4 L3.4 7.2" stroke="url(#{uid}-steel)" stroke-width="1.6" stroke-linecap="round" />
			</g>
		{:else if p.kind === 'emblem'}
			<image href="/emblem.png" x={p.x} y={p.y} width={p.w} height={p.h} />
		{/if}
	{/each}
</svg>
