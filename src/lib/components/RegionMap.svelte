<script lang="ts">
	import type { MapRegionData, MapNodeData } from '$lib/map';
	import { layoutNodes, roadPath, REGION_W } from '$lib/map';

	let {
		region,
		conquestCode = null,
		onTap
	}: {
		region: MapRegionData;
		/** id_code freshly conquered — node pops (interaction notes) */
		conquestCode?: string | null;
		onTap: (node: MapNodeData) => void;
	} = $props();

	const layout = $derived(layoutNodes(region.nodes.length));
	const nextIdx = $derived(region.nodes.findIndex((n) => n.isNext));

	/** khaki travelled dots up to the next node; solid orange leg into it;
	 *  faded dashed orange onward (interaction notes) */
	const travelled = $derived(
		nextIdx > 0 ? roadPath(layout.points.slice(0, nextIdx)) : nextIdx === -1 ? roadPath(layout.points) : ''
	);
	const nextLeg = $derived(
		nextIdx > 0 ? roadPath(layout.points.slice(nextIdx - 1, nextIdx + 1)) : ''
	);
	const planned = $derived(
		nextIdx >= 0 && nextIdx < layout.points.length - 1 ? roadPath(layout.points.slice(nextIdx)) : ''
	);

	/** organic terrain blob scaled to the region height */
	const blob = $derived.by(() => {
		const h = layout.height;
		return `M14 36 Q42 10 122 15 T250 12 Q332 12 338 56 Q346 ${h * 0.5} 332 ${h - 46} Q304 ${h - 8} 190 ${h - 12} Q84 ${h - 4} 36 ${h - 28} Q6 ${h - 56} 10 ${h * 0.55} Q8 68 14 36 Z`;
	});

	const daysStale = (n: MapNodeData) => {
		const last = n.progress?.last_activity;
		if (!last) return '';
		const d = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
		return d > 0 ? ` · ${d}d` : '';
	};
</script>

<div class="region" class:front={region.isFront} id="region-{region.meta.code}">
	<div class="head">
		<span class="name" class:frontname={region.isFront}>
			{region.meta.name}{#if region.isFront}&nbsp;— current front{/if}
		</span>
		<span class="count">{region.conquered}/{region.total} · {region.pct}%</span>
	</div>
	<svg
		width="100%"
		viewBox="0 0 {REGION_W} {layout.height}"
		style="display:block"
		role="group"
		aria-label="{region.meta.name} — {region.conquered} of {region.total} territories held"
	>
		<path
			d={blob}
			fill={region.isFront ? 'var(--orange-tint)' : region.started ? 'var(--green-tint)' : 'var(--bg-1)'}
			stroke="var(--line)"
			stroke-width="1.5"
		/>
		{#if travelled}<path d={travelled} class="road-travelled" />{/if}
		{#if planned}<path d={planned} class="road-planned" />{/if}
		{#if nextLeg}<path d={nextLeg} class="road-next" />{/if}

		{#each region.nodes as node, i (node.unit.code)}
			{@const p = layout.points[i]}
			<g
				transform="translate({p.x} {p.y})"
				class="node"
				class:pop={node.unit.code === conquestCode}
				class:dim={node.comingSoon || node.drillLocked}
				role="button"
				tabindex="0"
				aria-label="{node.unit.title} — {node.visual}"
				onclick={() => onTap(node)}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onTap(node)}
			>
				{#if node.isNext}
					<circle r="17" class="pulse" />
				{/if}

				{#if node.unit.kind === 'appendix'}
					<!-- drill node: rotated square -->
					<rect
						x="-12.5"
						y="-12.5"
						width="25"
						height="25"
						rx="5"
						transform="rotate(45)"
						fill={node.visual === 'conquered' || node.visual === 'gold' ? 'var(--green)' : 'var(--khaki-tint)'}
						stroke="var(--line)"
						stroke-width="1.5"
						stroke-dasharray={node.drillLocked ? '3 3' : undefined}
					/>
					{#if node.drillLocked}
						<path d="M-3 0 h6 v4 h-6 Z M-2 0 v-2 a2 2 0 0 1 4 0 v2" fill="none" stroke="var(--khaki-deep)" stroke-width="1.4" />
					{:else}
						<circle r="4.5" fill="none" stroke="var(--khaki-deep)" stroke-width="1.6" />
						<circle r="1.4" fill="var(--khaki-deep)" />
					{/if}
				{:else if node.isNext}
					<circle r="15" fill="var(--orange)" stroke="var(--line)" stroke-width="2" />
					<circle r="5" fill="var(--line)" />
					<g transform="translate(0 -38)">
						<rect x="-42" y="-12" width="84" height="20" rx="6" fill="var(--line)" />
						<path d="M-4 8 L0 13 L4 8 Z" fill="var(--line)" />
						<text y="2.5" text-anchor="middle" class="flag">NEXT MISSION</text>
					</g>
				{:else if node.visual === 'gold'}
					<circle r="15" fill="url(#tm-gold)" stroke="var(--line)" stroke-width="1.5" />
					<use href="#tm-star" transform="scale(.72)" />
				{:else if node.visual === 'conquered'}
					<circle r="15" fill="var(--green)" stroke="var(--line)" stroke-width="1.5" />
					<use href="#tm-check" />
				{:else if node.visual === 'decaying'}
					<circle r="15" fill="var(--bg-1)" stroke="var(--khaki)" stroke-width="2" stroke-dasharray="4 3" opacity=".8" />
					<use href="#tm-check-khaki" />
				{:else if node.visual === 'unconquered'}
					<circle r="15" fill="var(--orange-tint)" stroke="var(--orange-deep)" stroke-width="2.5" />
					<circle r="5" fill="var(--orange)" />
				{:else}
					<!-- free-roam: readable, untouched -->
					<circle r="15" fill="var(--bg-0)" stroke="var(--line)" stroke-width="1.5" />
					<use href="#tm-book" />
				{/if}

				<text y="30" text-anchor="middle" class="lbl" class:stale={node.visual === 'decaying'}>
					{node.unit.label}{node.visual === 'decaying' ? daysStale(node) : ''}
				</text>
			</g>
		{/each}
	</svg>
</div>

<style>
	.region {
		border: var(--bw) solid var(--line);
		border-radius: var(--r-xl);
		overflow: hidden;
		background: var(--bg-2);
	}
	.region.front {
		border-width: var(--bw-bold);
		box-shadow: var(--shadow-2);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px 4px;
	}
	.name {
		font-family: var(--font-display);
		font-size: 13px;
		text-transform: uppercase;
	}
	.frontname {
		color: var(--orange-deep);
	}
	.count {
		font-size: 11px;
		font-weight: 900;
		color: var(--ink-2);
	}
	.road-travelled {
		fill: none;
		stroke: var(--khaki);
		stroke-width: 2.5;
		stroke-dasharray: 1 7;
		stroke-linecap: round;
	}
	.road-next {
		fill: none;
		stroke: var(--orange);
		stroke-width: 3.5;
		stroke-linecap: round;
	}
	.road-planned {
		fill: none;
		stroke: var(--orange);
		stroke-width: 2.5;
		stroke-dasharray: 6 5;
		stroke-linecap: round;
		opacity: 0.55;
	}
	.node {
		cursor: pointer;
		outline: none;
	}
	.node:focus-visible circle:first-of-type {
		stroke-width: 3;
	}
	.node.dim {
		opacity: 0.55;
	}
	.node.pop {
		animation: conquest-pop var(--t-conquest) var(--ease-pop);
		transform-origin: center;
		transform-box: fill-box;
	}
	@keyframes conquest-pop {
		0% {
			transform: scale(0.4);
		}
		60% {
			transform: scale(1.25);
		}
		100% {
			transform: scale(1);
		}
	}
	.pulse {
		fill: none;
		stroke: var(--orange);
		stroke-width: 2;
		opacity: 0.5;
		animation: here-pulse 1.8s ease-in-out infinite;
	}
	@keyframes here-pulse {
		0%,
		100% {
			r: 16;
		}
		50% {
			r: 19;
		}
	}
	.lbl {
		font-family: var(--font-ui);
		font-weight: 700;
		font-size: 9px;
		fill: var(--ink-2);
	}
	.lbl.stale {
		fill: var(--ink-3);
	}
	.flag {
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 9.5px;
		fill: var(--ink-inverse);
	}
	@media (prefers-reduced-motion: reduce) {
		.pulse,
		.node.pop {
			animation: none;
		}
	}
</style>
