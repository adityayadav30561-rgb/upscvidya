<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pb';
	import { showToast } from '$lib/toast.svelte';
	import { routineByCode, exerciseByCode, formatValue, type RoutineBlock } from '$lib/pt';
	import { logWorkouts, buildLog } from '$lib/workout.svelte';

	const code = $derived(page.params.routine ?? '');
	const routine = $derived(routineByCode(code));

	// flatten the routine into a step sequence: work → rest (no rest after the
	// final block of the final round)
	interface Step {
		kind: 'work' | 'rest';
		round: number;
		block?: RoutineBlock;
		rest?: number;
	}
	const steps = $derived.by<Step[]>(() => {
		if (!routine) return [];
		const out: Step[] = [];
		for (let r = 1; r <= routine.rounds; r++) {
			routine.blocks.forEach((b, bi) => {
				out.push({ kind: 'work', round: r, block: b });
				const isLast = r === routine.rounds && bi === routine.blocks.length - 1;
				if (!isLast && b.rest_sec > 0) out.push({ kind: 'rest', round: r, rest: b.rest_sec });
			});
		}
		return out;
	});

	type Phase = 'ready' | 'active' | 'done';
	let phase = $state<Phase>('ready');
	let idx = $state(0);
	let remaining = $state(0);
	let paused = $state(false);
	let timer: ReturnType<typeof setInterval> | null = null;

	interface Result {
		exercise_code: string;
		metric: 'reps' | 'time';
		value: number;
	}
	let results = $state<Result[]>([]);
	// editable rep count for the current reps-block (defaults to target)
	let repInput = $state(0);

	const step = $derived(steps[idx]);
	const totalWork = $derived(steps.filter((s) => s.kind === 'work').length);
	const workDone = $derived(results.length);

	function clearTimer() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	}
	onDestroy(clearTimer);

	function begin() {
		phase = 'active';
		idx = 0;
		results = [];
		enterStep();
	}

	function enterStep() {
		clearTimer();
		const s = steps[idx];
		if (!s) return finish();
		if (s.kind === 'rest') {
			remaining = s.rest ?? 0;
			runCountdown(() => advance());
		} else if (s.block?.mode === 'time') {
			remaining = s.block.target;
			runCountdown(() => {
				record(s.block!.exercise_code, 'time', s.block!.target);
				advance();
			});
		} else if (s.block) {
			// reps block — user taps Done; no countdown
			repInput = s.block.target;
		}
	}

	function runCountdown(onZero: () => void) {
		paused = false;
		timer = setInterval(() => {
			if (paused) return;
			remaining -= 1;
			if (remaining <= 0) {
				clearTimer();
				onZero();
			}
		}, 1000);
	}

	function record(exercise_code: string, metric: 'reps' | 'time', value: number) {
		results = [...results, { exercise_code, metric, value }];
	}

	function completeReps() {
		if (!step?.block) return;
		record(step.block.exercise_code, 'reps', Math.max(0, repInput || 0));
		advance();
	}

	function advance() {
		clearTimer();
		if (idx < steps.length - 1) {
			idx += 1;
			enterStep();
		} else {
			finish();
		}
	}

	function skip() {
		// skipping a work step still records its target so the log is complete
		if (step?.kind === 'work' && step.block) {
			record(step.block.exercise_code, step.block.mode === 'time' ? 'time' : 'reps', step.block.target);
		}
		advance();
	}

	let finishing = $state(false);
	async function finish() {
		clearTimer();
		phase = 'done';
		if (finishing || results.length === 0 || !routine) return;
		finishing = true;
		// aggregate per exercise → one log each (one set per round)
		const byEx = new Map<string, { metric: 'reps' | 'time'; values: number[] }>();
		for (const r of results) {
			const e = byEx.get(r.exercise_code) ?? { metric: r.metric, values: [] };
			e.values.push(r.value);
			byEx.set(r.exercise_code, e);
		}
		const logs = [...byEx].map(([exCode, { metric, values }]) =>
			buildLog({
				exercise_code: exCode,
				group: exerciseByCode(exCode)?.group ?? '',
				metric,
				sets: values.map((v) => (metric === 'time' ? { seconds: v } : { reps: v })),
				source: 'routine',
				routine_code: routine.code
			})
		);
		try {
			await logWorkouts(logs);
			if (navigator.onLine) await pb.collection('users').authRefresh().catch(() => {});
			showToast(navigator.onLine ? 'Circuit cleared 🎖️' : 'Saved offline — syncs later', 'success');
		} catch {
			showToast('Could not save the circuit', 'error');
		}
	}

	const nextExercise = $derived.by(() => {
		for (let i = idx + 1; i < steps.length; i++) {
			if (steps[i].kind === 'work' && steps[i].block) {
				return exerciseByCode(steps[i].block!.exercise_code)?.name ?? '';
			}
		}
		return null;
	});
	const curEx = $derived(step?.block ? exerciseByCode(step.block.exercise_code) : undefined);
</script>

<svelte:head><title>UPSCVidya — {routine?.name ?? 'Circuit'}</title></svelte:head>

{#if !routine}
	<div class="wrap center">
		<p>Circuit not found.</p>
		<button class="ghost" onclick={() => goto('/pt')}>← Drill Ground</button>
	</div>
{:else if phase === 'ready'}
	<div class="wrap">
		<button class="ghost" onclick={() => goto('/pt')}>← Drill Ground</button>
		<h1>{routine.name}</h1>
		<p class="blurb">{routine.blurb}</p>
		<div class="meta">
			<span>{routine.duration_min} min</span><span>·</span><span>{routine.rounds} rounds</span><span
				>·</span
			><span>{routine.difficulty}</span>
		</div>
		<div class="plan">
			{#each routine.blocks as b, i (i)}
				{@const ex = exerciseByCode(b.exercise_code)}
				<div class="plan-row">
					<span class="pl-name">{ex?.name ?? b.exercise_code}</span>
					<span class="pl-target"
						>{b.mode === 'time' ? formatValue('time', b.target) : `${b.target} reps`}</span
					>
				</div>
			{/each}
		</div>
		<button class="cta" onclick={begin}>Start circuit →</button>
	</div>
{:else if phase === 'active'}
	<div class="wrap runner" class:rest={step?.kind === 'rest'}>
		<div class="runner-top">
			<span class="rt-round">Round {step?.round}/{routine.rounds}</span>
			<span class="rt-prog">{workDone}/{totalWork}</span>
		</div>

		{#if step?.kind === 'rest'}
			<div class="phase-label">REST</div>
			<div class="big">{remaining}</div>
			{#if nextExercise}<div class="next">Next: {nextExercise}</div>{/if}
			<button class="skip" onclick={advance}>Skip rest →</button>
		{:else if step?.block}
			<div class="phase-label">{curEx?.name}</div>
			{#if step.block.mode === 'time'}
				<div class="big">{remaining}</div>
				<div class="unit">seconds</div>
				<div class="controls">
					<button class="ctl" onclick={() => (paused = !paused)}>{paused ? 'Resume' : 'Pause'}</button>
					<button class="ctl" onclick={skip}>Skip</button>
				</div>
			{:else}
				<div class="big">{step.block.target}</div>
				<div class="unit">reps — go!</div>
				<div class="rep-adjust">
					<span>Done:</span>
					<input class="rep-in" type="number" min="0" inputmode="numeric" bind:value={repInput} />
				</div>
				<button class="cta done" onclick={completeReps}>Done →</button>
			{/if}
			{#if curEx}<p class="tip">{curEx.tip}</p>{/if}
		{/if}
	</div>
{:else}
	<div class="wrap center">
		<div class="medal" aria-hidden="true">🎖️</div>
		<h1>Circuit cleared</h1>
		<p class="blurb">{routine.name} · {workDone} sets logged</p>
		<button class="cta" onclick={() => goto('/pt')}>Back to Drill Ground →</button>
	</div>
{/if}

<style>
	.wrap {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-height: 70dvh;
	}
	.center {
		align-items: center;
		justify-content: center;
		text-align: center;
	}
	.ghost {
		align-self: flex-start;
		background: none;
		border: none;
		color: var(--blue-deep);
		font-weight: 700;
		font-size: 13px;
		cursor: pointer;
		padding: 0;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 26px;
		text-transform: uppercase;
	}
	.blurb {
		margin: 0;
		font-size: 13px;
		color: var(--ink-2);
	}
	.meta {
		display: flex;
		gap: 7px;
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
		text-transform: capitalize;
	}
	.plan {
		display: flex;
		flex-direction: column;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		overflow: hidden;
	}
	.plan-row {
		display: flex;
		justify-content: space-between;
		padding: 11px 14px;
		border-bottom: 1px solid var(--line-soft);
	}
	.plan-row:last-child {
		border-bottom: none;
	}
	.pl-name {
		font-weight: 900;
		font-size: 13.5px;
	}
	.pl-target {
		font-size: 12px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.cta {
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 16px;
		background: var(--orange);
		color: #4d4433;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 15px;
		min-height: 50px;
		cursor: pointer;
		box-shadow: var(--shadow-2);
		margin-top: auto;
	}
	.cta.done {
		background: var(--green);
		margin-top: 8px;
	}
	.runner {
		align-items: center;
		text-align: center;
		gap: 10px;
	}
	.runner.rest {
		background: var(--blue-tint);
		margin: -20px;
		padding: 20px;
		border-radius: 0;
	}
	.runner-top {
		width: 100%;
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.phase-label {
		font-family: var(--font-display);
		font-size: 22px;
		text-transform: uppercase;
		margin-top: 24px;
	}
	.big {
		font-family: var(--font-display);
		font-size: 96px;
		line-height: 1;
		color: var(--ink-1);
	}
	.unit {
		font-size: 13px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.next {
		font-size: 13px;
		font-weight: 700;
		color: var(--blue-deep);
	}
	.controls {
		display: flex;
		gap: 10px;
		margin-top: 8px;
	}
	.ctl {
		font-family: var(--font-ui);
		font-weight: 700;
		font-size: 13px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 10px 22px;
		cursor: pointer;
	}
	.skip {
		background: none;
		border: none;
		color: var(--blue-deep);
		font-weight: 700;
		font-size: 13px;
		cursor: pointer;
		margin-top: 8px;
	}
	.rep-adjust {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 700;
		margin-top: 6px;
	}
	.rep-in {
		width: 72px;
		text-align: center;
		font-size: 15px;
		background: var(--bg-0);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 8px;
	}
	.tip {
		margin: 6px 0 0;
		font-size: 11px;
		color: var(--ink-3);
	}
	.medal {
		font-size: 64px;
	}
</style>
