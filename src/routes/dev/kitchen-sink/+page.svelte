<script lang="ts">
	import {
		Button,
		Card,
		Chip,
		ProgressRing,
		StreakFlame,
		RankInsignia,
		MapNode,
		OptionRow,
		BottomNav,
		Sheet,
		Modal,
		Skeleton
	} from '$lib/components';
	import RankUp from '$lib/components/RankUp.svelte';
	import TerritoryCaptured from '$lib/components/TerritoryCaptured.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { getTheme, toggleTheme } from '$lib/theme.svelte';
	import { RANKS } from '$lib/ranks';
	import type { RankCode } from '$lib/ranks';

	let sheetOpen = $state(false);
	let modalOpen = $state(false);

	/* reward moments 4c / 4d — replayable without gaming XP on the server */
	let rankUpTo = $state<RankCode | null>(null);
	let conquest = $state(false);
</script>

<svelte:head><title>Kitchen Sink — UPSCVidya</title></svelte:head>

{#if rankUpTo}
	<RankUp to={rankUpTo} from={null} onclose={() => (rankUpTo = null)} />
{/if}
{#if conquest}
	<TerritoryCaptured
		title="Preamble"
		correct={18}
		total={20}
		scorePct={90}
		xpAwarded={236}
		gold={false}
		bestRun={7}
		index={1}
		next={{ label: 'Fundamental Rights', index: 2 }}
		onAdvance={() => (conquest = false)}
		onReview={() => (conquest = false)}
	/>
{/if}

<div class="page">
	<header>
		<h1>Kitchen <span class="accent">Sink</span></h1>
		<Button variant="secondary" onclick={toggleTheme}>theme: {getTheme()}</Button>
	</header>

	<section>
		<h2>Reward moments (4c / 4d)</h2>
		<div class="row">
			{#each ['sr_constable', 'inspector', 'commandant', 'dg'] as const as code (code)}
				<Button variant="secondary" onclick={() => (rankUpTo = code)}>
					Promote → {RANKS.find((r) => r.code === code)?.label}
				</Button>
			{/each}
			<Button variant="primary" onclick={() => (conquest = true)}>Territory captured</Button>
		</div>
	</section>

	<section>
		<h2>Buttons</h2>
		<div class="row">
			<Button variant="primary">Attempt Quiz</Button>
			<Button variant="secondary">Review Later →</Button>
			<Button variant="success">Territory Secured</Button>
			<Button variant="ghost">Skip</Button>
			<Button variant="danger">Abandon Test</Button>
			<Button variant="locked">Locked</Button>
		</div>
	</section>

	<section>
		<h2>Chips &amp; stickers</h2>
		<div class="row">
			<Chip variant="sticker-green">FREE</Chip>
			<Chip variant="sticker-orange">PREMIUM</Chip>
			<Chip variant="pill">PIB · 18 Jul</Chip>
			<Chip variant="blue">
				<svg width="12" height="12" viewBox="0 0 12 12"
					><path d="M6 0 V12 M0 6 H12 M2 2 L10 10 M10 2 L2 10" stroke="currentColor" stroke-width="1.4" /></svg
				>
				2 freeze tokens
			</Chip>
			<Chip variant="khaki">The Centre · 62%</Chip>
			<Chip variant="red">14 due</Chip>
		</div>
	</section>

	<section>
		<h2>Cards</h2>
		<div class="row">
			<Card><span class="cardlabel">flat</span></Card>
			<Card elevation="lifted"><span class="cardlabel">lifted</span></Card>
			<Card elevation="gold"><span class="cardlabel">gold glow</span></Card>
			<Card elevation="lifted" bold><span class="cardlabel">bold border</span></Card>
		</div>
	</section>

	<section>
		<h2>Progress ring · Streak flame</h2>
		<div class="row centered">
			<Card padding="16px"><ProgressRing value={68} label="POLITY" /></Card>
			<Card padding="14px 20px"><StreakFlame count={17} freezes={2} /></Card>
			<Card padding="16px"><ProgressRing value={34} label="POLITY" size={92} stroke={9} /></Card>
		</div>
	</section>

	<section>
		<h2>Rank insignia — 14 grades</h2>
		<div class="ranks">
			{#each RANKS as r (r.code)}
				<div class="rank" class:target={r.code === 'ac'}>
					<RankInsignia rank={r.code} />
					<span class="ranklabel" class:targetlabel={r.code === 'ac'}>{r.label}</span>
					<span class="rankxp">{r.xp.toLocaleString('en-IN')} XP{r.code === 'ac' ? ' · target rank' : ''}</span>
				</div>
			{/each}
		</div>
	</section>

	<section>
		<h2>Map nodes — 5 states</h2>
		<Card padding="16px 20px">
			<div class="row">
				<MapNode state="free-roam" label="free roam" />
				<MapNode state="unconquered" label="unconquered" />
				<MapNode state="conquered" label="conquered" />
				<MapNode state="decaying" label="decaying · 21d+" />
				<MapNode state="gold" label="gold · mastery" />
			</div>
		</Card>
	</section>

	<section>
		<h2>Option rows — quiz states</h2>
		<div class="stack" style="max-width: 380px">
			<OptionRow state="idle" onclick={() => {}}>Only one</OptionRow>
			<OptionRow state="selected" note="selected" onclick={() => {}}>Only two</OptionRow>
			<OptionRow state="correct" note="correct">All three</OptionRow>
			<OptionRow state="incorrect" note="your answer">None</OptionRow>
			<OptionRow state="missed" note="correct answer">Both one and three</OptionRow>
		</div>
	</section>

	<section>
		<h2>Sheet · Modal · Toast · Skeleton</h2>
		<div class="row">
			<Button variant="secondary" onclick={() => (sheetOpen = true)}>Open sheet</Button>
			<Button variant="secondary" onclick={() => (modalOpen = true)}>Open modal</Button>
			<Button variant="secondary" onclick={() => showToast('Territory secured!', 'success')}>
				Success toast
			</Button>
			<Button variant="secondary" onclick={() => showToast('Quiz needs a connection.', 'error')}>
				Error toast
			</Button>
		</div>
		<div class="stack" style="max-width: 380px; margin-top: 12px">
			<Skeleton height="20px" width="60%" />
			<Skeleton height="14px" />
			<Skeleton height="14px" width="80%" />
			<Skeleton height="90px" radius="var(--r-xl)" />
		</div>
	</section>

	<section>
		<h2>Bottom nav (live)</h2>
		<p class="hint">Fixed at viewport bottom — active tab = current route.</p>
	</section>
</div>

<Sheet bind:open={sheetOpen} title="Preamble">
	<p style="margin:0 0 12px;font-size:13.5px;color:var(--ink-2)">
		Est. read 6 min · best score 75% · 20 MCQs
	</p>
	<div class="row">
		<Button variant="primary">Read notes</Button>
		<Button variant="secondary">Attempt quiz</Button>
	</div>
</Sheet>

<Modal bind:open={modalOpen} title="Abandon test?">
	<p style="margin:0 0 14px;font-size:13.5px;color:var(--ink-2)">
		Your answers stay saved. The timer keeps running — server time is truth.
	</p>
	<div class="row">
		<Button variant="danger" onclick={() => (modalOpen = false)}>Abandon</Button>
		<Button variant="ghost" onclick={() => (modalOpen = false)}>Keep going</Button>
	</div>
</Modal>

<BottomNav />

<style>
	.page {
		max-width: 900px;
		margin: 0 auto;
		padding: 32px 20px 120px;
		display: flex;
		flex-direction: column;
		gap: 30px;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 36px;
		text-transform: uppercase;
	}
	.accent {
		color: var(--orange-deep);
	}
	h2 {
		margin: 0 0 12px;
		font-family: var(--font-display);
		font-size: 18px;
		text-transform: uppercase;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: center;
	}
	.row.centered {
		align-items: center;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.cardlabel {
		font-size: 12px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.ranks {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
		gap: 14px;
	}
	.rank {
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 14px 6px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		text-align: center;
	}
	.ranklabel {
		font-family: var(--font-display);
		font-size: 11px;
		text-transform: uppercase;
	}
	.rankxp {
		font-size: 10.5px;
		color: var(--ink-3);
	}
	/* AC — target rank emphasis per Foundations */
	.rank.target {
		background: var(--orange-tint);
		border-width: var(--bw-bold);
		box-shadow: var(--shadow-2);
	}
	.targetlabel {
		color: var(--orange-deep);
	}
	.hint {
		font-size: 13px;
		color: var(--ink-2);
		margin: 0;
	}
</style>
