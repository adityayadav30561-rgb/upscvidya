<script lang="ts">
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { BADGES } from '$lib/xp';
	import BadgeIcon from '$lib/components/BadgeIcon.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	/* Featured badges: pick up to 5 to show other aspirants on the battalion
	 * board. Server-owned display list, self-writable. */
	const MAX_FEATURED = 5;
	let featured = $state<string[]>([]);
	let featInit = false;
	$effect(() => {
		if (featInit || !auth.user) return;
		featInit = true;
		const f = (auth.user as unknown as { featured_badges?: string[] }).featured_badges;
		featured = Array.isArray(f) ? f.slice(0, MAX_FEATURED) : [];
	});
	const isFeatured = (code: string) => featured.includes(code);
	let savingFeat = $state(false);
	async function toggleFeatured(code: string) {
		if (savingFeat) return;
		let next: string[];
		if (featured.includes(code)) {
			next = featured.filter((c) => c !== code);
		} else {
			if (featured.length >= MAX_FEATURED) {
				showToast(`Feature up to ${MAX_FEATURED} — remove one first`, 'info');
				return;
			}
			next = [...featured, code];
		}
		const prev = featured;
		featured = next;
		savingFeat = true;
		try {
			await pb.collection('users').update(pb.authStore.record!.id, { featured_badges: next });
			await pb.collection('users').authRefresh().catch(() => {});
		} catch {
			featured = prev;
			showToast('Could not save', 'error');
		} finally {
			savingFeat = false;
		}
	}

	/* board edit mode: taps pin/unpin straight from the case instead of
	 * opening the medal sheet */
	let pinMode = $state(false);

	let earned = $state<Set<string> | null>(null);
	let earnedAt = $state<Record<string, string>>({});
	let booted = false;
	$effect(() => {
		if (booted) return;
		booted = true;
		if (!pb.authStore.isValid) {
			earned = new Set();
			return;
		}
		pb.collection('badges')
			.getFullList<{ code: string; earned_at: string }>()
			.then((rows) => {
				earned = new Set(rows.map((r) => r.code));
				earnedAt = Object.fromEntries(rows.map((r) => [r.code, r.earned_at]));
			})
			.catch(() => (earned = new Set()));
	});

	/* categories in display order — each lists its badge codes */
	const CATEGORIES: { title: string; codes: string[]; cols: number; accent?: 'rust' }[] = [
		{ title: 'Campaign', codes: ['first_conquest', 'mock_finisher', 'beta_founder'], cols: 3 },
		{
			title: 'Regions Secured',
			cols: 4,
			codes: [
				'region_foundations', 'region_system', 'region_centre', 'region_states',
				'region_grassroots', 'region_institutions', 'region_dynamics', 'region_courtroom'
			]
		},
		{ title: 'Streaks', codes: ['streak_7', 'streak_30', 'streak_100'], cols: 3, accent: 'rust' },
		{ title: 'Battalion', codes: ['podium_1', 'podium_2', 'podium_3', 'commendation'], cols: 4 },
		{
			title: 'Drill Ground',
			cols: 4,
			codes: ['pet_ready', 'first_workout', 'circuit_finisher', 'pushups_50', 'plank_5min', 'run_5k', 'regiment_30']
		}
	];

	const total = Object.keys(BADGES).length;
	const earnedCount = $derived(earned ? earned.size : 0);
	/* the board reads as one hero medal + four supporting slots */
	const hero = $derived<string | null>(featured[0] ?? null);
	const restSlots = $derived(
		Array.from({ length: MAX_FEATURED - 1 }, (_, i) => featured[i + 1] ?? null)
	);

	const fmtDate = (s: string | undefined) =>
		s ? new Date(String(s).replace(' ', 'T')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
	const fmtShort = (s: string | undefined) =>
		s ? new Date(String(s).replace(' ', 'T')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }).toUpperCase() : '';
	/* most recent strike date, for the stat strip */
	const latest = $derived(
		Object.values(earnedAt).sort((a, b) => String(b).localeCompare(String(a)))[0] as string | undefined
	);

	let openCode = $state<string | null>(null);
	let sheetOpen = $state(false);
	function tapMedal(code: string, has: boolean) {
		if (pinMode && has) {
			toggleFeatured(code);
			return;
		}
		openCode = code;
		sheetOpen = true;
	}
</script>

<svelte:head><title>Decorations — UPSCVidya</title></svelte:head>

<div class="screen">
	<header class="subhead">
		<button class="backbtn" aria-label="back" onclick={() => goto('/profile')}>
			<span class="backchev"></span>
		</button>
		<div class="head-txt">
			<h1 class="stencil">Decorations</h1>
			<div class="label">
				{earnedCount} of {total} struck · {featured.length} of {MAX_FEATURED} on the board
			</div>
		</div>
	</header>

	<!-- ── the display board others actually see ────────────────────── -->
	<section class="board plate-dark" class:editing={pinMode}>
		<span class="felt" aria-hidden="true"></span>
		<span class="stitch" aria-hidden="true"></span>
		<div class="board-head">
			<span class="board-t">Battalion Board</span>
			<span class="board-k">{featured.length}/{MAX_FEATURED} pinned · seen by others</span>
		</div>

		<div class="slots">
			{#if hero}
				<button class="hero" onclick={() => tapMedal(hero, true)}>
					<span class="hero-medal">
						<BadgeIcon code={hero} earned size={78} />
						<span class="shine" aria-hidden="true"></span>
					</span>
					<span class="hero-n">{BADGES[hero]?.label ?? hero}</span>
					<span class="hero-d">Struck {fmtShort(earnedAt[hero])}</span>
				</button>
			{:else}
				<div class="hero empty">
					<span class="hero-medal">
						<span class="socket big"><span class="sock-ring"></span></span>
					</span>
					<span class="hero-n dim">No medal pinned</span>
					<span class="hero-d dim">Tap edit board</span>
				</div>
			{/if}

			<div class="rest">
				{#each restSlots as code, i (i)}
					{#if code}
						<button class="mini" onclick={() => tapMedal(code, true)} aria-label={BADGES[code]?.label ?? code}>
							<BadgeIcon {code} earned size={44} />
						</button>
					{:else}
						<span class="socket"><span class="sock-ring"></span></span>
					{/if}
				{/each}
			</div>
		</div>

		<div class="rail" aria-hidden="true"></div>

		<div class="board-foot">
			<span class="board-hint">
				{pinMode ? 'Tap any earned medal below to pin or unpin it' : 'Earned medals can be pinned here'}
			</span>
			<button class="btn3d btn3d-gold edit" onclick={() => (pinMode = !pinMode)} disabled={savingFeat}>
				{pinMode ? 'Done' : 'Edit board'}
			</button>
		</div>
	</section>

	<!-- ── service record strip ─────────────────────────────────────── -->
	<div class="stats">
		<div class="stat">
			<div class="label">Struck</div>
			<div class="stat-v">{earnedCount}<span class="stat-of">/{total}</span></div>
		</div>
		<div class="stat">
			<div class="label">On board</div>
			<div class="stat-v rust">{featured.length}<span class="stat-of">/{MAX_FEATURED}</span></div>
		</div>
		<div class="stat">
			<div class="label">Latest</div>
			<div class="stat-v gold">{latest ? fmtShort(latest) : '—'}</div>
		</div>
	</div>

	{#if earned === null}
		<Skeleton height="190px" radius="var(--r-xl)" />
		<Skeleton height="190px" radius="var(--r-xl)" />
	{:else}
		{#each CATEGORIES as cat (cat.title)}
			{@const catEarned = cat.codes.filter((c) => earned!.has(c)).length}
			<section class="case plate-dark" class:rust={cat.accent === 'rust'}>
				<span class="felt" aria-hidden="true"></span>
				<span class="stitch" aria-hidden="true"></span>
				<div class="case-head">
					<span class="case-t">{cat.title}</span>
					<span class="case-k">{catEarned} / {cat.codes.length}</span>
				</div>
				<div class="crail">
					<span class="crail-fill" style:width="{(catEarned / cat.codes.length) * 100}%"></span>
				</div>

				<div class="grid" style:grid-template-columns="repeat({cat.cols}, 1fr)">
					{#each cat.codes as code (code)}
						{@const has = earned.has(code)}
						<button
							class="cell"
							class:won={has}
							class:pinnable={pinMode && has}
							onclick={() => tapMedal(code, has)}
						>
							<span class="disc" class:socket={!has}>
								{#if has}
									<BadgeIcon {code} earned size={cat.cols === 4 ? 50 : 64} />
									<span class="shine" aria-hidden="true"></span>
								{:else}
									<span class="sock-ring"></span>
									<BadgeIcon {code} engraved size={cat.cols === 4 ? 30 : 38} />
								{/if}
								{#if isFeatured(code)}<span class="pin">★</span>{/if}
							</span>
							<span class="c-name">{BADGES[code]?.label ?? code}</span>
							<span class="c-sub">
								{#if has}Struck {fmtShort(earnedAt[code])}{:else}Locked{/if}
							</span>
						</button>
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</div>

<Sheet bind:open={sheetOpen} title="">
	{#if openCode}
		{@const has = !!earned?.has(openCode)}
		<div class="detail">
			<span class="d-disc" class:d-socket={!has}>
				{#if has}
					<BadgeIcon code={openCode} earned size={92} />
				{:else}
					<BadgeIcon code={openCode} engraved size={54} />
				{/if}
			</span>
			<div class="d-name stencil">{BADGES[openCode]?.label ?? openCode}</div>
			<div class="d-status {has ? 'ok' : 'locked'}">
				{has ? `Struck ${fmtDate(earnedAt[openCode])}` : 'Not yet struck'}
			</div>
			<p class="d-hint">{BADGES[openCode]?.hint ?? ''}</p>
			{#if has}
				<button
					class="btn3d {isFeatured(openCode) ? 'btn3d-gold' : 'btn3d-quiet'}"
					disabled={savingFeat}
					onclick={() => toggleFeatured(openCode!)}
				>
					{isFeatured(openCode) ? '★ On your board' : '☆ Pin to my board'}
				</button>
			{/if}
		</div>
	{/if}
</Sheet>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		gap: 13px;
	}

	/* ── header ───────────────────────────────────────────────────── */
	.subhead {
		display: flex;
		align-items: center;
		gap: 11px;
	}
	.backbtn {
		flex: none;
		width: 34px;
		height: 34px;
		border-radius: 10px;
		border: var(--bw) solid var(--khaki);
		background: var(--grad-plate);
		box-shadow: 0 3px 0 var(--edge), var(--emboss);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.backbtn:active {
		transform: translateY(2px);
		box-shadow: 0 1px 0 var(--edge), var(--emboss);
	}
	.backchev {
		width: 8px;
		height: 8px;
		border-left: 2px solid var(--ink-2);
		border-bottom: 2px solid var(--ink-2);
		transform: rotate(45deg);
		margin-left: -3px;
	}
	.head-txt {
		flex: 1;
		min-width: 0;
	}
	h1 {
		margin: 0;
		font-size: 26px;
		line-height: 1;
		letter-spacing: 0.05em;
	}
	.head-txt .label {
		margin-top: 2px;
		font-size: 10px;
		letter-spacing: 0.1em;
	}

	/* ── shared case material: felt lining + stitched inner edge ──── */
	.board,
	.case {
		position: relative;
		padding: 15px 14px 16px;
		overflow: hidden;
	}
	.felt {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(80% 55% at 50% -5%, rgba(240, 207, 130, 0.16), transparent 70%),
			repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.16) 0 2px, transparent 2px 5px);
		pointer-events: none;
	}
	.case.rust .felt {
		background:
			radial-gradient(80% 55% at 50% -5%, rgba(201, 98, 47, 0.2), transparent 70%),
			repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.16) 0 2px, transparent 2px 5px);
	}
	.stitch {
		position: absolute;
		inset: 5px;
		border: 1px dashed rgba(240, 207, 130, 0.18);
		border-radius: 10px;
		pointer-events: none;
	}
	.board-head,
	.slots,
	.rail,
	.board-foot,
	.case-head,
	.crail,
	.grid {
		position: relative;
	}

	/* ── board ────────────────────────────────────────────────────── */
	.board.editing {
		box-shadow:
			0 0 0 2px var(--gold-lo),
			0 4px 0 #3b3720,
			0 12px 20px rgba(45, 38, 18, 0.3);
	}
	.board-head,
	.case-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	.board-t,
	.case-t {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 15px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--gold-hi);
	}
	.case.rust .case-t {
		color: #ffb99f;
	}
	/* count reads as a small brass plate riveted to the case */
	.board-k,
	.case-k {
		flex: none;
		font-family: var(--font-cond);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #3b2f11;
		background: var(--grad-brass);
		border-radius: 4px;
		padding: 2px 7px;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 1px 0 rgba(0, 0, 0, 0.35);
	}

	.slots {
		margin-top: 14px;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.hero {
		flex: 1.15;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 7px;
		background: none;
		border: none;
		padding: 0;
		font-family: var(--font-ui);
		cursor: pointer;
	}
	.hero.empty {
		cursor: default;
	}
	.hero:active:not(.empty) {
		transform: scale(0.96);
	}
	.hero-medal {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 88px;
		height: 88px;
		border-radius: 50%;
		background: radial-gradient(circle at 36% 26%, rgba(255, 245, 216, 0.4), transparent 62%);
		box-shadow:
			0 0 26px rgba(240, 207, 130, 0.35),
			0 6px 12px rgba(0, 0, 0, 0.5);
		overflow: hidden;
		animation: floatBob 4.5s ease-in-out infinite;
	}
	.hero.empty .hero-medal {
		background: none;
		box-shadow: none;
		animation: none;
	}
	.hero-n {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 13px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		text-align: center;
		line-height: 1.1;
		color: var(--ink-inverse);
	}
	.hero-d {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--gold-mid);
	}
	.hero-n.dim,
	.hero-d.dim {
		color: rgba(246, 239, 217, 0.4);
	}

	.rest {
		flex: 1;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 9px;
		place-items: center;
	}
	.mini {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		aspect-ratio: 1 / 1;
		border-radius: 50%;
		border: none;
		background: radial-gradient(circle at 36% 26%, rgba(255, 245, 216, 0.28), transparent 62%);
		box-shadow: 0 0 14px rgba(240, 207, 130, 0.22), 0 3px 7px rgba(0, 0, 0, 0.4);
		cursor: pointer;
	}
	.mini:active {
		transform: scale(0.94);
	}

	/* empty medal bed pressed into the felt */
	.socket {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		aspect-ratio: 1 / 1;
		border-radius: 50%;
		background: radial-gradient(circle at 50% 62%, rgba(0, 0, 0, 0.36), rgba(0, 0, 0, 0.6));
		box-shadow: inset 0 5px 10px rgba(0, 0, 0, 0.65), 0 1px 0 rgba(255, 255, 255, 0.06);
		color: rgba(216, 196, 138, 0.32);
	}
	.socket.big {
		width: 88px;
		height: 88px;
	}
	.sock-ring {
		position: absolute;
		inset: 17%;
		border-radius: 50%;
		border: 1.5px dashed rgba(216, 196, 138, 0.28);
	}

	.rail {
		margin-top: 14px;
		height: 4px;
		border-radius: 3px;
		background: linear-gradient(90deg, var(--gold-edge), var(--gold-hi), var(--gold-edge));
		opacity: 0.7;
	}
	.board-foot {
		margin-top: 12px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
	}
	.board-hint {
		font-size: 10.5px;
		color: rgba(246, 239, 217, 0.65);
		line-height: 1.35;
	}
	.edit {
		flex: none;
		font-size: 11px;
		letter-spacing: 0.12em;
		padding: 7px 13px;
		border-radius: 7px;
	}

	/* ── service-record strip ─────────────────────────────────────── */
	.stats {
		display: flex;
		gap: 8px;
	}
	.stat {
		flex: 1;
		border: var(--bw) solid var(--khaki);
		border-radius: 11px;
		background: var(--grad-plate);
		box-shadow: 0 3px 0 var(--edge), var(--emboss);
		padding: 9px 10px;
	}
	.stat .label {
		font-size: 8px;
		letter-spacing: 0.14em;
	}
	.stat-v {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 20px;
		line-height: 1;
		margin-top: 3px;
		color: var(--ink-1);
	}
	.stat-v.rust {
		color: var(--orange-deep);
	}
	.stat-v.gold {
		color: var(--gold-edge);
	}
	.stat-of {
		font-size: 11px;
		color: var(--ink-3);
	}

	/* ── medal cases ──────────────────────────────────────────────── */
	.crail {
		margin-top: 7px;
		height: 5px;
		border-radius: 3px;
		background: rgba(0, 0, 0, 0.35);
		box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
		overflow: hidden;
	}
	.crail-fill {
		display: block;
		height: 100%;
		background: var(--grad-brass);
		transition: width var(--t-slow) var(--ease);
	}
	.case.rust .crail-fill {
		background: var(--grad-rust);
	}

	.grid {
		margin-top: 14px;
		display: grid;
		gap: 12px 10px;
	}
	.cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 7px;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-family: var(--font-ui);
		transition: transform var(--t-fast) var(--ease);
	}
	.cell:active {
		transform: scale(0.94);
	}
	.disc {
		position: relative;
		width: 100%;
		aspect-ratio: 1 / 1;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}
	/* struck: the medal sits proud of the felt, lit from above */
	.cell.won .disc {
		background: radial-gradient(circle at 34% 26%, rgba(255, 245, 216, 0.32), transparent 62%);
		box-shadow:
			0 0 18px rgba(240, 207, 130, 0.26),
			0 4px 9px rgba(0, 0, 0, 0.42);
	}
	.case.rust .cell.won .disc {
		box-shadow:
			0 0 18px rgba(201, 98, 47, 0.35),
			0 4px 9px rgba(0, 0, 0, 0.42);
	}
	.cell.pinnable .disc {
		box-shadow:
			0 0 0 2px var(--gold-hi),
			0 0 20px rgba(240, 207, 130, 0.45);
	}
	.pin {
		position: absolute;
		top: 3px;
		right: 5px;
		font-size: 11px;
		color: var(--gold-hi);
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
	}
	.shine {
		position: absolute;
		top: -20%;
		left: 0;
		width: 34%;
		height: 150%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.65), transparent);
		animation: medalShine 5s ease-in-out infinite;
		pointer-events: none;
	}
	.c-name {
		font-size: 9.5px;
		font-weight: 700;
		text-align: center;
		line-height: 1.2;
		color: var(--ink-inverse);
	}
	.cell:not(.won) .c-name {
		color: rgba(246, 239, 217, 0.55);
	}
	.c-sub {
		font-size: 8px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--gold-mid);
	}
	.cell:not(.won) .c-sub {
		color: rgba(246, 239, 217, 0.3);
	}
	.case.rust .cell.won .c-sub {
		color: #e08050;
	}

	/* ── medal sheet ──────────────────────────────────────────────── */
	.detail {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		text-align: center;
		padding: 6px 0 4px;
	}
	.d-disc {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 122px;
		height: 122px;
		border-radius: 50%;
		background: radial-gradient(circle at 35% 28%, rgba(240, 207, 130, 0.35), transparent 65%);
	}
	.d-disc.d-socket {
		border: 1.5px dashed var(--line-soft);
		background: var(--bg-1);
		box-shadow: var(--recess-in);
		color: var(--ink-3);
	}
	.d-name {
		font-size: 20px;
		margin-top: 4px;
	}
	.d-status {
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		border-radius: var(--r-sm);
		padding: 4px 12px;
	}
	.d-status.ok {
		background: var(--green-tint);
		color: var(--green-deep);
		box-shadow: inset 0 0 0 1px var(--line-soft);
	}
	.d-status.locked {
		background: var(--bg-1);
		color: var(--ink-3);
		box-shadow: var(--recess-in);
	}
	.d-hint {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--ink-2);
		max-width: 280px;
		line-height: 1.5;
	}
	.detail .btn3d {
		margin-top: 12px;
	}

	@media (prefers-reduced-motion: reduce) {
		.shine,
		.hero-medal {
			animation: none;
		}
	}
</style>
