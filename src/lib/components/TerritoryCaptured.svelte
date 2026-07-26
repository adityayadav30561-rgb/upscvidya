<script lang="ts">
	/* TERRITORY CAPTURED — Field Dossier direction 4d.
	   The reward moment after a passing topic quiz: a flag plants on the sector,
	   the score is stamped out, the sector bar fills and the next front unlocks.
	   Shown in place of the plain results header when the territory flips. */
	import { haptic } from '$lib/native';

	let {
		title,
		correct,
		total,
		scorePct,
		xpAwarded,
		gold = false,
		bestRun = 0,
		index = null,
		sector = null,
		next = null,
		onAdvance,
		onReview
	}: {
		title: string;
		correct: number;
		total: number;
		scorePct: number;
		xpAwarded: number;
		gold?: boolean;
		/** longest run of correct answers in this attempt */
		bestRun?: number;
		/** 1-based territory number inside its sector */
		index?: number | null;
		sector?: { name: string; held: number; total: number } | null;
		next?: { label: string; index: number } | null;
		onAdvance: () => void;
		onReview: () => void;
	} = $props();

	const num = (n: number | null) => (n === null ? '' : String(n).padStart(2, '0'));
	const sectorPct = $derived(sector && sector.total > 0 ? Math.round((sector.held / sector.total) * 100) : 0);

	const CONFETTI = [
		{ l: 8, d: 0, c: 'var(--orange)' },
		{ l: 20, d: 0.5, c: 'var(--gold-hi)' },
		{ l: 33, d: 1.1, c: 'var(--green)' },
		{ l: 46, d: 0.3, c: 'var(--orange)' },
		{ l: 58, d: 1.5, c: 'var(--gold-hi)' },
		{ l: 70, d: 0.8, c: 'var(--green)' },
		{ l: 84, d: 1.9, c: 'var(--gold-hi)' },
		{ l: 92, d: 1.3, c: 'var(--orange)' }
	];

	const go = (fn: () => void) => {
		haptic(14);
		fn();
	};
</script>

<div class="captured">
	<!-- the field: rays, confetti and the planted flag -->
	<div class="field">
		<div class="grid" aria-hidden="true"></div>
		<div class="mass" aria-hidden="true"></div>
		<div class="rays" aria-hidden="true"></div>
		{#each CONFETTI as c, i (i)}
			<span class="confetti" style="left:{c.l}%; animation-delay:{c.d}s; background:{c.c}" aria-hidden="true"></span>
		{/each}

		<div class="planted">
			<div class="seal-big">
				<span class="flag" aria-hidden="true"></span>
				<span class="shine" aria-hidden="true"></span>
			</div>
			<span class="held-tag">
				{index !== null ? `TERRITORY ${num(index)} HELD` : 'TERRITORY HELD'}
			</span>
		</div>
	</div>

	<div class="body">
		<div class="kicker">
			{sector ? `${sector.name} · ` : ''}FRONT LINE ADVANCED
		</div>
		<h2 class="taken stencil">{title} {gold ? 'MASTERED' : 'TAKEN'}</h2>

		<div class="card plate-lift">
			<span class="xp-fly">+{xpAwarded} XP</span>

			<div class="stats">
				<div class="stat brass-tint">
					<div class="sv">{correct}/{total}</div>
					<div class="sk">Score</div>
				</div>
				<div class="stat olive-tint">
					<div class="sv">{scorePct}%</div>
					<div class="sk">Accuracy</div>
				</div>
				<div class="stat rust-tint">
					<div class="sv">×{bestRun}</div>
					<div class="sk">Best run</div>
				</div>
			</div>

			{#if sector}
				<div class="sector">
					<div class="sec-line">
						<span>SECTOR PROGRESS</span><span>{sector.held} / {sector.total} HELD</span>
					</div>
					<div class="track rust"><span class="fill" style:width="{sectorPct}%"></span></div>
				</div>
			{/if}

			{#if next}
				<div class="nextfront">
					<span class="nf-disc">{num(next.index)}</span>
					<span class="nf-text">
						<span class="nf-k">Next front unlocked</span>
						<span class="nf-v stencil">{next.label}</span>
					</span>
				</div>
			{/if}
		</div>

		<div class="ctas">
			<button class="btn3d advance" onclick={() => go(onAdvance)}>
				{next ? `Advance to ${num(next.index)} →` : 'Back to the map →'}
			</button>
			<button class="btn3d btn3d-quiet review" onclick={() => go(onReview)}>Review</button>
		</div>
	</div>
</div>

<style>
	.captured {
		margin: -20px -20px 0;
		border-radius: 0 0 var(--r-2xl) var(--r-2xl);
		overflow: hidden;
	}

	/* ── the field ─────────────────────────────────────────────── */
	.field {
		position: relative;
		height: 250px;
		background: radial-gradient(80% 80% at 30% 25%, #e9dfbd, #cfc49f 70%, #bcb086);
		box-shadow: inset 0 0 40px rgba(90, 78, 40, 0.28);
		overflow: hidden;
	}
	:global([data-theme='dark']) .field {
		background: radial-gradient(80% 80% at 30% 25%, #35341f, #262517 70%, #1d1c12);
	}
	.grid {
		position: absolute;
		inset: 0;
		background-image:
			repeating-linear-gradient(0deg, rgba(120, 105, 70, 0.13) 0 1px, transparent 1px 20px),
			repeating-linear-gradient(90deg, rgba(120, 105, 70, 0.13) 0 1px, transparent 1px 20px);
	}
	.mass {
		position: absolute;
		left: -30px;
		bottom: -50px;
		width: 260px;
		height: 150px;
		border-radius: 50%;
		background: rgba(127, 145, 83, 0.3);
	}
	.rays {
		position: absolute;
		left: 50%;
		top: 96px;
		width: 420px;
		height: 420px;
		margin-left: -210px;
		margin-top: -210px;
		background: conic-gradient(
			from 0deg,
			rgba(201, 82, 47, 0.18) 0 10deg,
			transparent 10deg 30deg,
			rgba(201, 82, 47, 0.12) 30deg 40deg,
			transparent 40deg 70deg
		);
	}
	.confetti {
		position: absolute;
		top: -20px;
		width: 7px;
		height: 11px;
		border-radius: 2px;
	}
	.planted {
		position: absolute;
		left: 50%;
		top: 34px;
		margin-left: -48px;
		width: 96px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}
	.seal-big {
		position: relative;
		width: 96px;
		height: 96px;
		border-radius: 50%;
		background: radial-gradient(circle at 34% 28%, #ffd7a8, #c9522f 62%, #8d3a17);
		border: 3px solid var(--orange-edge);
		box-shadow:
			0 0 0 5px rgba(201, 82, 47, 0.2),
			0 0 40px rgba(201, 82, 47, 0.55),
			inset 0 -5px 10px rgba(0, 0, 0, 0.3),
			inset 0 3px 6px rgba(255, 255, 255, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}
	.flag {
		width: 34px;
		height: 34px;
		background: #fff2df;
		clip-path: polygon(0 0, 100% 22%, 0 44%, 0 100%, 10% 100%, 10% 0);
	}
	.shine {
		position: absolute;
		top: -20%;
		left: 0;
		width: 32%;
		height: 150%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.75), transparent);
	}
	.held-tag {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 12px;
		letter-spacing: 0.18em;
		color: var(--red-deep);
		background: rgba(255, 255, 255, 0.6);
		padding: 4px 10px;
		border-radius: 6px;
		white-space: nowrap;
	}

	/* ── the report ────────────────────────────────────────────── */
	.body {
		padding: 18px 20px 4px;
		text-align: center;
	}
	.kicker {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.28em;
		color: var(--ink-3);
		text-transform: uppercase;
	}
	.taken {
		margin: 7px 0 0;
		font-size: 36px;
		line-height: 0.95;
	}
	.card {
		position: relative;
		margin-top: 16px;
		padding: 14px;
	}
	.xp-fly {
		position: absolute;
		right: 12px;
		top: -32px;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 20px;
		color: var(--orange-deep);
	}
	.stats {
		display: flex;
		gap: 9px;
	}
	.stat {
		flex: 1;
		padding: 9px 0;
		border-radius: 10px;
	}
	.brass-tint {
		background: #f0e7c9;
		border: var(--bw) solid var(--gold-lo);
	}
	.olive-tint {
		background: #eaf0da;
		border: var(--bw) solid var(--green);
	}
	.rust-tint {
		background: #f7e2d9;
		border: var(--bw) solid var(--orange);
	}
	.sv {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 19px;
		line-height: 1;
		color: var(--ink-1);
	}
	.olive-tint .sv {
		color: var(--green-edge);
	}
	.rust-tint .sv {
		color: var(--red-deep);
	}
	.sk {
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-3);
		margin-top: 2px;
	}
	.sector {
		margin-top: 13px;
		text-align: left;
	}
	.sec-line {
		display: flex;
		justify-content: space-between;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--ink-3);
		margin-bottom: 5px;
	}
	.nextfront {
		margin-top: 13px;
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 10px 11px;
		border-radius: 11px;
		background: #efe6c8;
		border: var(--bw) dashed var(--gold-lo);
		text-align: left;
	}
	:global([data-theme='dark']) .nextfront {
		background: var(--bg-1);
	}
	.nf-disc {
		flex: none;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--grad-brass);
		border: 2px solid var(--brass-dark);
		box-shadow: 0 3px 0 var(--brass-dark);
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 13px;
		color: #3b2f11;
	}
	.nf-text {
		flex: 1;
		min-width: 0;
	}
	.nf-k {
		display: block;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--gold-edge);
	}
	.nf-v {
		display: block;
		font-size: 16px;
		letter-spacing: 0.05em;
		margin-top: 2px;
	}
	.ctas {
		margin-top: 15px;
		display: flex;
		gap: 9px;
	}
	.advance {
		flex: 1.4;
		padding: 14px 0;
		border-radius: 14px;
		font-size: 13px;
		box-shadow: 0 5px 0 var(--orange-edge), inset 0 1px 0 rgba(255, 255, 255, 0.35);
	}
	.review {
		flex: 1;
		padding: 14px 0;
		border-radius: 14px;
		font-size: 13px;
		box-shadow: 0 5px 0 var(--edge);
	}

	@media (prefers-reduced-motion: no-preference) {
		.rays {
			animation: raySpin 20s linear infinite;
		}
		.confetti {
			animation: confettiFall 2.6s linear infinite;
		}
		.planted {
			animation: popIn 0.55s both;
		}
		.shine {
			animation: medalShine 3.4s 0.8s ease-in-out infinite;
		}
		.kicker {
			animation: rise 0.5s both;
		}
		.taken {
			animation: popIn 0.55s 0.08s both;
		}
		.card {
			animation: rise 0.5s 0.16s both;
		}
		.xp-fly {
			animation: xpFly 2.4s 0.4s ease-out infinite;
		}
		.sector :global(.fill) {
			transform-origin: left;
			animation: barGrow 1s 0.5s both ease-out;
		}
		.nextfront {
			animation: rise 0.5s 0.4s both;
		}
		.ctas {
			animation: rise 0.5s 0.5s both;
		}
	}
</style>
