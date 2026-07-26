<script lang="ts">
	/* PROMOTION CEREMONY — Field Dossier direction 4c.
	   A full-screen rank ceremony: sweeping rays, falling confetti, and the new
	   chevrons rising onto a brass plate. Fires once per crossing, driven by the
	   server's rank_up payload — never recomputed client-side. */
	import { RANKS } from '$lib/ranks';
	import type { RankCode } from '$lib/ranks';
	import { haptic } from '$lib/native';
	import RankInsignia from './RankInsignia.svelte';

	let {
		to,
		from = null,
		onclose
	}: {
		to: RankCode;
		/** previous rank, for the "CONSTABLE →" line */
		from?: RankCode | null;
		onclose: () => void;
	} = $props();

	const idx = $derived(RANKS.findIndex((r) => r.code === to));
	const rank = $derived(RANKS[idx]);
	const prev = $derived(from ? RANKS.find((r) => r.code === from) : idx > 0 ? RANKS[idx - 1] : null);
	const next = $derived(idx >= 0 && idx < RANKS.length - 1 ? RANKS[idx + 1] : null);

	/* progress from this rank toward the next */
	const pct = $derived(
		next && rank ? Math.round(((rank.xp - (prev?.xp ?? 0)) / (next.xp - (prev?.xp ?? 0))) * 100) : 100
	);
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

	function accept() {
		haptic(18);
		onclose();
	}

	/* the ceremony is a full-screen modal: lock the page behind it, otherwise the
	   document scrollbar keeps a strip of canvas visible down the right edge. */
	$effect(() => {
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prevOverflow;
		};
	});

	/* SHARE TO BATTALION — native share sheet, clipboard as the fallback. */
	let shareState = $state<'idle' | 'copied' | 'failed'>('idle');
	let shareTimer: ReturnType<typeof setTimeout> | undefined;

	const shareLabel = $derived(
		shareState === 'copied'
			? 'COPIED TO CLIPBOARD'
			: shareState === 'failed'
				? 'SHARING UNAVAILABLE'
				: 'SHARE TO BATTALION'
	);

	function flash(state: 'copied' | 'failed') {
		shareState = state;
		clearTimeout(shareTimer);
		shareTimer = setTimeout(() => (shareState = 'idle'), 2400);
	}

	async function share() {
		haptic(12);
		const text = `Promoted to ${(rank?.label ?? to).toUpperCase()} — grade ${idx + 1} of ${RANKS.length} on UPSCVidya.`;
		try {
			if (navigator.share) {
				await navigator.share({ title: 'Promotion', text });
				return;
			}
			await navigator.clipboard.writeText(text);
			flash('copied');
		} catch (e) {
			/* user dismissed the native sheet — not a failure worth reporting */
			if ((e as DOMException)?.name !== 'AbortError') flash('failed');
		}
	}
</script>

<div class="ceremony" role="dialog" aria-modal="true" aria-label="promotion">
	<div class="glow" aria-hidden="true"></div>
	<div class="rays" aria-hidden="true"></div>
	{#each CONFETTI as c, i (i)}
		<span class="confetti" style="left:{c.l}%; animation-delay:{c.d}s; background:{c.c}" aria-hidden="true"></span>
	{/each}

	<div class="body">
		<div class="orders">ORDERS RECEIVED</div>
		<div class="promoted">PROMOTED</div>

		<!-- the brass plate: this rank's own insignia rises onto it -->
		<div class="plate-brass">
			<span class="insignia"><RankInsignia rank={to} width={86} /></span>
			<span class="shine" aria-hidden="true"></span>
		</div>

		{#if prev}<div class="from">{prev.label} →</div>{/if}
		<div class="to">{rank?.label ?? to}</div>
		<div class="grade">GRADE {idx + 1} OF {RANKS.length}</div>

		<div class="spoils">
			<div class="spoil">
				<div class="sp-k">Unlocked</div>
				<div class="sp-v">Hard drills</div>
			</div>
			<div class="spoil">
				<div class="sp-k">Total</div>
				<div class="sp-v">{rank ? rank.xp.toLocaleString('en-IN') : ''} XP</div>
			</div>
			<div class="spoil">
				<div class="sp-k">Medal</div>
				<div class="sp-v">{idx === 1 ? 'First rise' : 'Ascent'}</div>
			</div>
		</div>

		{#if next}
			<div class="nextbar">
				<div class="nb-line">
					<span>{rank.xp.toLocaleString('en-IN')} XP</span>
					<span>NEXT · {next.label.toUpperCase()} {next.xp.toLocaleString('en-IN')}</span>
				</div>
				<div class="nb-track"><span class="nb-fill" style:width="{pct}%"></span></div>
			</div>
		{/if}

		<button class="accept" onclick={accept}>Accept the stripes</button>
		<button class="share" onclick={share}>{shareLabel}</button>
	</div>
</div>

<style>
	.ceremony {
		position: fixed;
		inset: 0;
		z-index: 80;
		background: #161a12;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.glow {
		position: absolute;
		inset: 0;
		background: radial-gradient(70% 55% at 50% 26%, rgba(240, 207, 130, 0.3), transparent 70%);
	}
	.rays {
		position: absolute;
		left: 50%;
		top: 26%;
		width: 620px;
		height: 620px;
		margin-left: -310px;
		margin-top: -310px;
		background: conic-gradient(
			from 0deg,
			rgba(240, 207, 130, 0.2) 0 8deg,
			transparent 8deg 26deg,
			rgba(240, 207, 130, 0.13) 26deg 34deg,
			transparent 34deg 60deg
		);
	}
	.confetti {
		position: absolute;
		top: -20px;
		width: 7px;
		height: 11px;
		border-radius: 2px;
	}
	.body {
		position: relative;
		width: 100%;
		max-width: 393px;
		padding: 34px 20px calc(24px + env(safe-area-inset-bottom, 0px));
		text-align: center;
		max-height: 100dvh;
		overflow-y: auto;
	}
	.orders {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.3em;
		color: #c3bb98;
	}
	.promoted {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 40px;
		line-height: 0.92;
		letter-spacing: 0.04em;
		color: var(--gold-hi);
		margin-top: 7px;
		text-shadow: 0 2px 20px rgba(240, 207, 130, 0.6);
	}
	/* the brass shoulder plate */
	.plate-brass {
		position: relative;
		width: 132px;
		height: 170px;
		margin: 22px auto 0;
		border-radius: 10px;
		background: linear-gradient(150deg, #fff0c4, #d8b258 42%, #8d6a24);
		border: 2.5px solid var(--brass-dark);
		box-shadow:
			0 0 0 5px rgba(240, 207, 130, 0.18),
			0 0 46px rgba(240, 207, 130, 0.5),
			inset 0 3px 5px rgba(255, 255, 255, 0.7),
			inset 0 -6px 12px rgba(0, 0, 0, 0.35);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 9px;
		overflow: hidden;
	}
	/* the real 14-grade shoulder board for this rank, mounted on the plate */
	.insignia {
		display: block;
		line-height: 0;
		filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.45));
	}
	.shine {
		position: absolute;
		top: -20%;
		left: 0;
		width: 32%;
		height: 150%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.8), transparent);
	}
	.from {
		margin-top: 20px;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: #a8a98a;
	}
	.to {
		text-transform: uppercase;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 31px;
		line-height: 1;
		letter-spacing: 0.04em;
		color: var(--ink-inverse);
		margin-top: 5px;
	}
	.grade {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		color: #c9a24f;
		margin-top: 5px;
	}
	.spoils {
		margin-top: 20px;
		display: flex;
		gap: 9px;
	}
	.spoil {
		flex: 1;
		padding: 11px 8px;
		border-radius: 12px;
		border: 1px solid rgba(240, 207, 130, 0.3);
		background: rgba(255, 255, 255, 0.05);
	}
	.sp-k {
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #a8a98a;
	}
	.sp-v {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 15px;
		line-height: 1;
		color: var(--gold-hi);
		margin-top: 3px;
		text-transform: uppercase;
	}
	.nextbar {
		margin-top: 20px;
	}
	.nb-line {
		display: flex;
		justify-content: space-between;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: #a8a98a;
		margin-bottom: 5px;
	}
	.nb-track {
		height: 11px;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.1);
		overflow: hidden;
	}
	.nb-fill {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, var(--gold-edge), var(--gold-hi));
		transform-origin: left;
	}
	.accept {
		width: 100%;
		margin-top: 22px;
		padding: 14px 0;
		border: none;
		border-radius: 14px;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 14px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #3b2f11;
		background: var(--grad-gold);
		box-shadow:
			0 5px 0 var(--gold-edge),
			0 0 34px rgba(240, 207, 130, 0.35);
		cursor: pointer;
	}
	.accept:active {
		transform: translateY(3px);
		box-shadow: 0 2px 0 var(--gold-edge);
	}
	.share {
		display: block;
		width: 100%;
		margin-top: 11px;
		padding: 4px 0;
		border: none;
		background: none;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #8f9376;
		cursor: pointer;
	}
	.share:active {
		color: var(--gold-hi);
	}

	@media (prefers-reduced-motion: no-preference) {
		.rays {
			animation: raySpin 22s linear infinite;
		}
		.confetti {
			animation: confettiFall 2.6s linear infinite;
		}
		.orders {
			animation: rise 0.5s both;
		}
		.promoted {
			animation: popIn 0.6s 0.1s both;
		}
		.plate-brass {
			animation: popIn 0.6s 0.18s both;
		}
		.insignia {
			animation: chevRise 0.6s 0.5s both;
		}
		.shine {
			animation: medalShine 3.6s 1s ease-in-out infinite;
		}
		.from {
			animation: rise 0.5s 0.3s both;
		}
		.to {
			animation: popIn 0.5s 0.38s both;
		}
		.spoils {
			animation: rise 0.5s 0.45s both;
		}
		.nextbar {
			animation: rise 0.5s 0.55s both;
		}
		.nb-fill {
			animation: barGrow 1.1s 0.7s both ease-out;
		}
		.accept {
			animation: popIn 0.5s 0.65s both;
		}
		.share {
			animation: rise 0.5s 0.75s both;
		}
	}
</style>
