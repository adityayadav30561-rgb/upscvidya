<script lang="ts">
	/* FIELD DOSSIER · direction 2a — a sector laid out as TERRAIN inside the
	   dossier: contour grid, terrain masses, a dashed FRONT LINE, and territory
	   markers scattered across it. The terrain scrolls HORIZONTALLY so a sector
	   with 14 territories keeps every marker at a readable size (the old SVG
	   squeezed them all into one screen width). The attack order sits on top of
	   the terrain and does not scroll away. */
	import type { MapRegionData, MapNodeData } from '$lib/map';

	let {
		region,
		conquestCode = null,
		onTap
	}: {
		region: MapRegionData;
		/** id_code freshly conquered — marker pops (interaction notes) */
		conquestCode?: string | null;
		onTap: (node: MapNodeData) => void;
	} = $props();

	/* markers march left→right on a gentle wave so the field reads as terrain,
	   not a list. Step is fixed, so the strip simply grows with the sector. */
	const STEP = 94;
	const LEAD = 26;
	const WAVE = [62, 100, 56, 118, 84, 70];
	const trackWidth = $derived(LEAD + region.nodes.length * STEP + 40);

	const pos = (i: number) => ({ x: LEAD + i * STEP, y: WAVE[i % WAVE.length] });
	const held = (n: MapNodeData) => n.visual === 'conquered' || n.visual === 'gold';
	const num = (i: number) => String(i + 1).padStart(2, '0');

	const next = $derived(region.nodes.find((n) => n.isNext) ?? null);
	const daysStale = (n: MapNodeData) => {
		const last = n.progress?.last_activity;
		if (!last) return '';
		const d = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
		return d > 0 ? ` · ${d}d` : '';
	};
</script>

<div class="sector plate" class:front={region.isFront}>
	<div class="head">
		<span class="stencil name">
			{region.meta.name}{#if region.isFront}&nbsp;— current front{/if}
		</span>
		<span class="count">{region.conquered} / {region.total} HELD</span>
	</div>

	<div class="terrain">
		<!-- the field scrolls; the order button below stays put -->
		<div class="scroller">
			<div class="track" style:width="{trackWidth}px">
				<div class="grid"></div>
				<div class="mass mass-a"></div>
				<div class="mass mass-b"></div>
				<div class="frontline"></div>
				<span class="frontline-lbl">FRONT LINE</span>

				{#each region.nodes as node, i (node.unit.code)}
					{@const p = pos(i)}
					<button
						class="marker"
						class:pop={node.unit.code === conquestCode}
						style="left:{p.x}px; top:{p.y}px"
						onclick={() => onTap(node)}
						aria-label="{node.unit.title} — {node.visual}"
					>
						{#if node.unit.kind === 'appendix'}
							<span class="hexnode" class:locked={node.drillLocked} class:done={held(node)}>
								{#if node.drillLocked}🔒{:else}◎{/if}
							</span>
						{:else}
							<span
								class="disc"
								class:brass={held(node) || node.isNext}
								class:current={node.isNext}
								class:pending={node.visual === 'unconquered'}
								class:decaying={node.visual === 'decaying'}
							>
								{num(i)}
								{#if node.visual === 'gold'}<span class="star">★</span>{/if}
							</span>
						{/if}
						<span class="mk-lbl" class:stale={node.visual === 'decaying'}>
							{node.unit.label}{node.visual === 'decaying' ? daysStale(node) : ''}
						</span>
					</button>
				{/each}
			</div>
		</div>

		{#if next}
			<button class="order btn3d" onclick={() => onTap(next)}>
				Attack {next.unit.label} →
			</button>
		{/if}
	</div>
</div>

<style>
	.sector {
		padding: 13px;
	}
	.sector.front {
		border-color: var(--line);
		box-shadow: var(--shadow-lift), var(--emboss);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
		margin-bottom: 11px;
	}
	.name {
		font-size: 17px;
		letter-spacing: 0.1em;
	}
	.sector.front .name {
		color: var(--orange-deep);
	}
	.count {
		flex: none;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--ink-3);
	}

	/* ── the field ─────────────────────────────────────────────── */
	.terrain {
		position: relative;
		height: 210px;
		border-radius: 10px;
		overflow: hidden;
		background: radial-gradient(80% 70% at 30% 25%, #e9dfbd, #cfc49f 70%, #bcb086);
		box-shadow:
			inset 0 0 30px rgba(90, 78, 40, 0.3),
			inset 0 0 0 1.5px #b3aa88;
	}
	:global([data-theme='dark']) .terrain {
		background: radial-gradient(80% 70% at 30% 25%, #35341f, #262517 70%, #1d1c12);
		box-shadow:
			inset 0 0 30px rgba(0, 0, 0, 0.5),
			inset 0 0 0 1.5px #47432e;
	}
	.scroller {
		position: absolute;
		inset: 0;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
	}
	.scroller::-webkit-scrollbar {
		display: none;
	}
	.track {
		position: relative;
		height: 100%;
		min-width: 100%;
	}
	/* survey grid */
	.grid {
		position: absolute;
		inset: 0;
		background-image:
			repeating-linear-gradient(0deg, rgba(120, 105, 70, 0.12) 0 1px, transparent 1px 20px),
			repeating-linear-gradient(90deg, rgba(120, 105, 70, 0.12) 0 1px, transparent 1px 20px);
	}
	:global([data-theme='dark']) .grid {
		background-image:
			repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 20px),
			repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 20px);
	}
	/* terrain masses */
	.mass {
		position: absolute;
		pointer-events: none;
	}
	.mass-a {
		left: -30px;
		bottom: -40px;
		width: 250px;
		height: 150px;
		border-radius: 50%;
		background: rgba(127, 145, 83, 0.26);
	}
	.mass-b {
		right: -40px;
		top: -30px;
		width: 190px;
		height: 150px;
		border-radius: 48%;
		background: rgba(181, 136, 58, 0.18);
	}
	.frontline {
		position: absolute;
		left: 14px;
		right: 14px;
		top: 34px;
		height: 2px;
		background: repeating-linear-gradient(
			90deg,
			var(--orange-deep) 0 8px,
			transparent 8px 15px
		);
	}
	.frontline-lbl {
		position: absolute;
		left: 16px;
		top: 14px;
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.16em;
		color: var(--orange-deep);
	}

	/* ── territory markers ─────────────────────────────────────── */
	.marker {
		position: absolute;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		width: 84px;
	}
	.disc {
		position: relative;
		width: 42px;
		height: 42px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 14px;
		/* not yet taken: dashed outpost */
		background: linear-gradient(#efe6cd, #ddd3b1);
		border: 2.5px dashed var(--ink-3);
		color: var(--ink-3);
		box-shadow: 0 3px 0 var(--line-soft);
		transition:
			transform var(--t-fast) var(--ease),
			box-shadow var(--t-fast) var(--ease);
	}
	/* taken (or the live objective): stamped brass */
	.disc.brass {
		width: 48px;
		height: 48px;
		font-size: 16px;
		background: var(--grad-brass);
		border: 2.5px solid var(--brass-dark);
		color: #3b2f11;
		box-shadow:
			0 4px 0 var(--brass-dark),
			0 8px 14px rgba(60, 48, 20, 0.35),
			inset 0 1px 0 rgba(255, 255, 255, 0.6);
	}
	.disc.current {
		border-color: var(--orange-edge);
		box-shadow:
			0 4px 0 var(--orange-edge),
			0 8px 14px rgba(90, 40, 15, 0.35),
			inset 0 1px 0 rgba(255, 255, 255, 0.6);
	}
	.disc.pending {
		border-style: solid;
		border-color: var(--orange-deep);
		color: var(--orange-deep);
	}
	.disc.decaying {
		opacity: 0.75;
	}
	.marker:active .disc {
		transform: translateY(2px);
		box-shadow: 0 1px 0 var(--brass-dark);
	}
	.star {
		position: absolute;
		top: -6px;
		right: -4px;
		font-size: 13px;
		color: var(--gold-hi);
		text-shadow: 0 1px 0 var(--brass-dark);
	}
	/* drill node: a hex bunker */
	.hexnode {
		width: 38px;
		height: 40px;
		background: #cfc4a0;
		clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		color: var(--ink-3);
	}
	.hexnode.done {
		background: var(--grad-olive);
		color: #fff;
	}
	.hexnode.locked {
		opacity: 0.85;
	}
	.mk-lbl {
		font-size: 9px;
		font-weight: 700;
		color: #4a4229;
		text-align: center;
		line-height: 1.15;
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
	}
	:global([data-theme='dark']) .mk-lbl {
		color: var(--ink-2);
		text-shadow: none;
	}
	.mk-lbl.stale {
		color: var(--ink-3);
	}

	/* ── the attack order (pinned over the terrain) ────────────── */
	.order {
		position: absolute;
		left: 14px;
		bottom: 12px;
		font-size: 11px;
		letter-spacing: 0.12em;
		padding: 8px 14px;
		box-shadow:
			0 3px 0 var(--orange-edge),
			0 8px 14px rgba(90, 40, 15, 0.3);
		max-width: calc(100% - 28px);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (prefers-reduced-motion: no-preference) {
		.marker.pop .disc {
			animation: conquest-pop var(--t-conquest) var(--ease-pop);
		}
		.disc.current::after {
			content: '';
			position: absolute;
			inset: -7px;
			border-radius: 50%;
			border: 2px solid var(--orange);
			opacity: 0.55;
			animation: here-pulse 1.8s ease-in-out infinite;
		}
	}
	@keyframes conquest-pop {
		0% {
			transform: scale(0.4);
		}
		60% {
			transform: scale(1.2);
		}
		100% {
			transform: scale(1);
		}
	}
	@keyframes here-pulse {
		0%,
		100% {
			transform: scale(1);
			opacity: 0.5;
		}
		50% {
			transform: scale(1.12);
			opacity: 0.15;
		}
	}
</style>
