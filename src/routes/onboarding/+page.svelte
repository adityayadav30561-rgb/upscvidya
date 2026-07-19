<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { auth, bootAuth, saveOnboarding } from '$lib/auth.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { computePlan, PACES, monthYear } from '$lib/plan';
	import Sheet from '$lib/components/Sheet.svelte';
	import Button from '$lib/components/Button.svelte';

	/* Screen 01 — Onboarding, 3 steps. Choices feed the guided-path generator. */

	let step = $state(1);
	let exam = $state<'capf' | null>('capf');
	let targetYear = $state<number | null>(null);
	let dailyMinutes = $state<number | null>(null);
	let sprintSheetOpen = $state(false);
	let busy = $state(false);
	let slideKey = $state(0); // retrigger slide-left animation per step

	const now = new Date();
	const baseYear = now.getUTCFullYear();
	// candidate attempts: this year (if exam not past), next, next+1
	const years = $derived(
		[baseYear, baseYear + 1, baseYear + 2]
			.map((y) => ({ year: y, plan: computePlan(y, 120, now) }))
			.filter((y) => y.plan.daysToExam > 0)
			.slice(0, 3)
	);

	const preview = $derived(
		targetYear && dailyMinutes ? computePlan(targetYear, dailyMinutes, now) : null
	);

	onMount(async () => {
		await bootAuth();
		if (!auth.isLoggedIn) {
			goto('/login', { replaceState: true });
			return;
		}
		if (auth.isOnboarded) goto('/', { replaceState: true });
	});

	function shakeSoon() {
		showToast('CAPF first. Reinforcements arriving.');
	}

	function next() {
		if (step === 1 && !exam) return;
		if (step === 2) {
			if (!targetYear) return;
			const p = computePlan(targetYear, 120, now);
			if (p.sprint && !sprintSheetOpen) {
				sprintSheetOpen = true; // confirm the sprint before committing
				return;
			}
		}
		step++;
		slideKey++;
	}

	function confirmSprint() {
		sprintSheetOpen = false;
		step = 3;
		slideKey++;
	}

	function back() {
		if (step > 1) {
			step--;
			slideKey++;
		}
	}

	async function finish() {
		if (!exam || !targetYear || !dailyMinutes) return;
		busy = true;
		try {
			await saveOnboarding({ exam, targetYear, dailyMinutes });
			goto('/path', { replaceState: true });
		} catch {
			showToast('Could not save — check your connection.', 'error');
		} finally {
			busy = false;
		}
	}

	const dayLabel = (days: number) => (days < 30 ? `${days}d` : `≈${days}d`);
</script>

<svelte:head><title>UPSCVidya — Onboarding</title></svelte:head>

<main>
	<div class="card">
		<div class="topbar">
			<button class="backbtn" class:hidden={step === 1} onclick={back} aria-label="back">
				<svg width="14" height="14" viewBox="0 0 14 14"
					><path d="M9 2 L4 7 L9 12" fill="none" stroke="#4d4433" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg
				>
			</button>
			<div class="segments">
				{#each [1, 2, 3] as s (s)}
					<span class="seg" class:done={step >= s}></span>
				{/each}
			</div>
			<span class="counter">{step}/3</span>
		</div>

		{#key slideKey}
			<div class="stepbody">
				{#if step === 1}
					<div class="intro">
						<svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
							<circle cx="28" cy="28" r="26" fill="var(--orange-tint)" stroke="#4d4433" stroke-width="1.5" />
							<path d="M28 12 L31 22 H41 L33 28 L36 38 L28 32 L20 38 L23 28 L15 22 H25 Z" fill="var(--orange)" stroke="#4d4433" stroke-width="1.3" stroke-linejoin="round" />
						</svg>
						<h1>Choose your battlefield</h1>
						<p>Which exam are you preparing for?</p>
					</div>

					<div class="options">
						<button class="opt selected orange" onclick={() => (exam = 'capf')}>
							<span class="radio"><span class="dot orange-dot"></span></span>
							<span class="optbody">
								<span class="opttitle">CAPF Assistant Commandant</span>
								<span class="optmeta">BSF · CRPF · CISF · ITBP · SSB</span>
							</span>
						</button>
						<button class="opt disabled" onclick={shakeSoon}>
							<span class="radio soft"></span>
							<span class="optbody">
								<span class="opttitle muted">UPSC CSE</span>
								<span class="optmeta muted">Civil Services</span>
							</span>
							<span class="soon" style="transform:rotate(2deg)">SOON</span>
						</button>
						<button class="opt disabled" onclick={shakeSoon}>
							<span class="radio soft"></span>
							<span class="optbody">
								<span class="opttitle muted">AFCAT</span>
								<span class="optmeta muted">Air Force Common Admission Test</span>
							</span>
							<span class="soon" style="transform:rotate(-2deg)">SOON</span>
						</button>
					</div>

					<button class="cta orange-bg" onclick={next}>Continue →</button>
				{:else if step === 2}
					<div class="intro">
						<svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
							<circle cx="28" cy="28" r="26" fill="var(--blue-tint)" stroke="#4d4433" stroke-width="1.5" />
							<rect x="16" y="17" width="24" height="23" rx="3" fill="var(--bg-2)" stroke="#4d4433" stroke-width="1.4" />
							<path d="M16 24 H40 M22 13.5 V20 M34 13.5 V20" stroke="#4d4433" stroke-width="1.4" stroke-linecap="round" />
							<circle cx="28" cy="32" r="4.5" fill="var(--blue)" stroke="#4d4433" stroke-width="1.2" />
						</svg>
						<h1>Target attempt</h1>
						<p>When do you face the paper?</p>
					</div>

					<div class="options">
						{#each years as y (y.year)}
							<button
								class="opt"
								class:selected={targetYear === y.year}
								class:blue={targetYear === y.year}
								onclick={() => (targetYear = y.year)}
							>
								<span class="radio">
									{#if targetYear === y.year}<span class="dot blue-dot"></span>{/if}
								</span>
								<span class="optbody">
									<span class="opttitle">CAPF AC {y.year}</span>
									{#if y.plan.sprint}
										<span class="optmeta sprint">
											{y.plan.examDay.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
											— {y.plan.daysToExam} days out. Sprint mode.
										</span>
									{:else if y.year === baseYear + 2}
										<span class="optmeta">The long campaign — steady pace</span>
									{:else}
										<span class="optmeta">Expected: first Sunday of August</span>
									{/if}
								</span>
								<span class="days" class:sprintdays={y.plan.sprint}>{dayLabel(y.plan.daysToExam)}</span>
							</button>
						{/each}
					</div>

					<div class="note">
						<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
							<circle cx="8" cy="8" r="7" fill="none" stroke="var(--ink-3)" stroke-width="1.4" />
							<path d="M8 4.5 V8.5 M8 11 V11.5" stroke="var(--ink-3)" stroke-width="1.6" stroke-linecap="round" />
						</svg>
						<span>Your guided path pace is built backwards from this date.</span>
					</div>

					<button class="cta orange-bg" onclick={next} disabled={!targetYear}>Continue →</button>
				{:else}
					<div class="intro">
						<svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
							<circle cx="28" cy="28" r="26" fill="var(--green-tint)" stroke="#4d4433" stroke-width="1.5" />
							<circle cx="28" cy="29" r="13" fill="var(--bg-2)" stroke="#4d4433" stroke-width="1.4" />
							<path d="M28 21 V29 L34 32" fill="none" stroke="#4d4433" stroke-width="1.8" stroke-linecap="round" />
							<path d="M24 13 H32" stroke="#4d4433" stroke-width="2" stroke-linecap="round" />
						</svg>
						<h1>Daily commitment</h1>
						<p>Honest answer — the path adapts to it.</p>
					</div>

					<div class="paces">
						{#each PACES as p (p.minutes)}
							<button
								class="pace"
								class:selected={dailyMinutes === p.minutes}
								onclick={() => (dailyMinutes = p.minutes)}
							>
								<span class="pacetime">{p.label}</span>
								<span class="pacename" class:chosen={dailyMinutes === p.minutes}>
									{p.name}{dailyMinutes === p.minutes ? ' ✓' : ''}
								</span>
							</button>
						{/each}
					</div>

					{#if preview}
						<div class="preview">
							<div class="previewhead">Your plan preview</div>
							<div class="previewbody">
								At {PACES.find((p) => p.minutes === dailyMinutes)?.label}/day:
								<strong>Polity secured by {monthYear(preview.politySecured)}</strong>
								· {preview.topicsPerDay} topic{preview.topicsPerDay === 1 ? '' : 's'} + 1 quiz daily ·
								mocks from {monthYear(preview.mockSeason)} · full revision buffer of
								{preview.bufferWeeks} weeks before exam day.
							</div>
						</div>
					{/if}

					<button class="cta green-bg" onclick={finish} disabled={!dailyMinutes || busy}>
						Generate my guided path →
					</button>
				{/if}
			</div>
		{/key}
	</div>
</main>

<Sheet bind:open={sprintSheetOpen} title="Sprint mode">
	<p class="sheettext">
		{targetYear} is {computePlan(targetYear ?? baseYear, 120, now).daysToExam} days out. The path
		compresses to essentials-only: highest-weight topics, daily drills, no buffer. Committed?
	</p>
	<div class="sheetrow">
		<Button variant="danger" onclick={confirmSprint}>Commit to the sprint</Button>
		<Button variant="ghost" onclick={() => (sprintSheetOpen = false)}>Pick another year</Button>
	</div>
</Sheet>

<style>
	main {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
	}
	.card {
		width: min(420px, 100%);
		background: var(--bg-0);
		border: var(--bw-bold) solid var(--line);
		border-radius: 28px;
		box-shadow: var(--shadow-soft);
		padding: 18px 20px 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		overflow: hidden;
	}

	.topbar {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.backbtn {
		width: 36px;
		height: 36px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		background: var(--bg-2);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.backbtn.hidden {
		opacity: 0.35;
		pointer-events: none;
	}
	.segments {
		flex: 1;
		display: flex;
		gap: 6px;
	}
	.seg {
		flex: 1;
		height: 8px;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		background: var(--bg-2);
		transition: background var(--t-base) var(--ease);
	}
	.seg.done {
		background: var(--green);
	}
	.counter {
		font-size: 12px;
		font-weight: 900;
		color: var(--ink-3);
	}

	.stepbody {
		display: flex;
		flex-direction: column;
		gap: 16px;
		animation: slide-in var(--t-slow) var(--ease);
	}
	@keyframes slide-in {
		from {
			transform: translateX(40px);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	.intro {
		display: flex;
		flex-direction: column;
		gap: 6px;
		text-align: center;
		padding: 6px 0 2px;
	}
	.intro svg {
		margin: 0 auto;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 22px;
		line-height: 1.25;
		text-transform: uppercase;
	}
	.intro p {
		margin: 0;
		font-size: 13.5px;
		color: var(--ink-2);
	}

	.options {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.opt {
		display: flex;
		align-items: center;
		gap: 14px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 16px;
		cursor: pointer;
		text-align: left;
		font-family: var(--font-ui);
		transition:
			box-shadow var(--t-fast) var(--ease-pop),
			background var(--t-fast) var(--ease);
	}
	.opt.selected {
		border-width: var(--bw-bold);
		box-shadow: var(--shadow-2);
	}
	.opt.selected.orange {
		background: var(--orange-tint);
	}
	.opt.selected.blue {
		background: var(--blue-tint);
	}
	.opt.disabled {
		background: var(--bg-1);
		border-color: var(--line-soft);
	}
	.radio {
		flex: none;
		width: 22px;
		height: 22px;
		border-radius: var(--r-full);
		border: var(--bw) solid var(--line);
		background: var(--bg-2);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.radio.soft {
		border-color: var(--line-soft);
	}
	.dot {
		width: 11px;
		height: 11px;
		border-radius: var(--r-full);
		animation: pop var(--t-fast) var(--ease-pop);
	}
	@keyframes pop {
		from {
			transform: scale(0);
		}
		to {
			transform: scale(1);
		}
	}
	.orange-dot {
		background: var(--orange-deep);
	}
	.blue-dot {
		background: var(--blue-deep);
	}
	.optbody {
		flex: 1;
		display: flex;
		flex-direction: column;
	}
	.opttitle {
		font-weight: 900;
		font-size: 15.5px;
	}
	.optmeta {
		font-size: 12px;
		color: var(--ink-2);
	}
	.muted {
		color: var(--ink-3);
	}
	.sprint {
		color: var(--red-deep);
		font-weight: 700;
	}
	.soon {
		font-size: 10.5px;
		font-weight: 900;
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		color: var(--ink-3);
		border-radius: var(--r-md);
		padding: 4px 9px;
	}
	.days {
		font-family: var(--font-display);
		font-size: 13px;
		color: var(--ink-3);
	}
	.opt.selected .days {
		color: var(--blue-deep);
	}
	.days.sprintdays {
		color: var(--red-deep);
	}

	.note {
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--bg-1);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-md);
		padding: 10px 14px;
	}
	.note span {
		font-size: 12px;
		color: var(--ink-2);
	}
	.note svg {
		flex: none;
	}

	.paces {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.pace {
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 14px;
		text-align: center;
		cursor: pointer;
		font-family: var(--font-ui);
		transition: box-shadow var(--t-fast) var(--ease-pop);
	}
	.pace.selected {
		background: var(--green-tint);
		border-width: var(--bw-bold);
		box-shadow: var(--shadow-2);
	}
	.pacetime {
		font-family: var(--font-display);
		font-size: 17px;
	}
	.pacename {
		font-size: 11.5px;
		color: var(--ink-2);
	}
	.pacename.chosen {
		font-weight: 900;
		color: var(--green-deep);
	}

	.preview {
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.previewhead {
		font-family: var(--font-display);
		font-size: 12px;
		text-transform: uppercase;
		color: var(--green-deep);
	}
	.previewbody {
		font-size: 13px;
		color: var(--ink-2);
		line-height: 1.55;
	}
	.previewbody strong {
		color: var(--ink-1);
	}

	.cta {
		width: 100%;
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 15px;
		color: var(--line);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 14px;
		min-height: 48px;
		cursor: pointer;
		transition:
			box-shadow var(--t-fast) var(--ease),
			transform var(--t-fast) var(--ease);
	}
	.cta:hover:not(:disabled) {
		box-shadow: var(--shadow-2);
		transform: translate(-1px, -1px);
	}
	.cta:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.orange-bg {
		background: var(--orange);
	}
	.green-bg {
		background: var(--green);
	}

	.sheettext {
		margin: 0 0 12px;
		font-size: 13.5px;
		color: var(--ink-2);
		line-height: 1.55;
	}
	.sheetrow {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}
</style>
