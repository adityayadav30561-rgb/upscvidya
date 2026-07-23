<script lang="ts">
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import { showToast } from '$lib/toast.svelte';
	import {
		EXERCISES,
		GROUPS,
		ROUTINES,
		exerciseByCode,
		levelFor,
		ringFraction,
		sessionsThisWeek,
		formatValue,
		type Exercise,
		type Group,
		type WorkoutSet
	} from '$lib/pt';
	import {
		fetchLogs,
		logWorkout,
		buildLog,
		getPending,
		getSyncVersion
	} from '$lib/workout.svelte';
	import type { WorkoutLog } from '$lib/types';
	import ProgressRing from '$lib/components/ProgressRing.svelte';
	import StreakFlame from '$lib/components/StreakFlame.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	const user = $derived(auth.user);
	const weeklyGoal = $derived(
		(user as unknown as { pt_weekly_goal?: number })?.pt_weekly_goal || 4
	);
	const ptStreak = $derived((user as unknown as { pt_streak_current?: number })?.pt_streak_current || 0);

	let logs = $state<WorkoutLog[] | null>(null);

	async function load() {
		try {
			logs = await fetchLogs();
		} catch {
			logs = [];
		}
	}
	// initial + re-load whenever the offline queue drains (sync version bumps)
	let lastVersion = -1;
	$effect(() => {
		const v = getSyncVersion();
		if (v !== lastVersion) {
			lastVersion = v;
			if (pb.authStore.isValid) void load();
			else logs = [];
		}
	});

	const weekSessions = $derived(
		logs ? sessionsThisWeek(logs.map((l) => l.logged_at)) : 0
	);
	const ringPct = $derived(Math.round(ringFraction(weekSessions, weeklyGoal) * 100));

	// personal best per exercise (max `best`)
	const pbByCode = $derived.by(() => {
		const m = new Map<string, number>();
		for (const l of logs ?? []) {
			const cur = m.get(l.exercise_code) ?? 0;
			if (l.best > cur) m.set(l.exercise_code, l.best);
		}
		return m;
	});

	let groupFilter = $state<Group | 'all'>('all');
	const shownExercises = $derived(
		groupFilter === 'all' ? EXERCISES : EXERCISES.filter((e) => e.group === groupFilter)
	);

	/* ---- log sheet ---- */
	let sheetOpen = $state(false);
	let selected = $state<Exercise | null>(null);
	let setValues = $state<number[]>([0]);
	let logDate = $state(todayStr());
	let saving = $state(false);

	function todayStr(): string {
		return new Date().toISOString().slice(0, 10);
	}
	function openLog(ex: Exercise) {
		selected = ex;
		setValues = [0];
		logDate = todayStr();
		sheetOpen = true;
	}
	function addSet() {
		setValues = [...setValues, setValues[setValues.length - 1] || 0];
	}
	function removeSet(i: number) {
		if (setValues.length > 1) setValues = setValues.filter((_, j) => j !== i);
	}

	function toSets(ex: Exercise, values: number[]): WorkoutSet[] {
		return values
			.filter((v) => v > 0)
			.map((v) => {
				if (ex.metric === 'time') return { seconds: v };
				if (ex.metric === 'distance') return { distance_m: v };
				return { reps: v };
			});
	}

	async function saveLog() {
		if (!selected || saving) return;
		const sets = toSets(selected, setValues);
		if (sets.length === 0) {
			showToast('Enter at least one set', 'info');
			return;
		}
		saving = true;
		const loggedAt = logDate + ' 12:00:00.000Z';
		const log = buildLog({
			exercise_code: selected.code,
			group: selected.group,
			metric: selected.metric,
			sets,
			source: 'manual',
			logged_at: loggedAt
		});
		try {
			await logWorkout(log);
			if (navigator.onLine) {
				await pb.collection('users').authRefresh().catch(() => {});
				await load();
				showToast('Workout logged 💪', 'success');
			} else {
				showToast('Saved offline — syncs when you reconnect', 'info');
			}
			sheetOpen = false;
		} catch {
			showToast('Could not save the workout', 'error');
		} finally {
			saving = false;
		}
	}

	const unitLabel = $derived(
		selected?.metric === 'time' ? 'seconds' : selected?.metric === 'distance' ? 'metres' : 'reps'
	);
	const selectedLevel = $derived(
		selected ? levelFor(selected, pbByCode.get(selected.code) ?? 0) : null
	);
</script>

<svelte:head><title>UPSCVidya — Drill Ground</title></svelte:head>

<div class="pt">
	<header>
		<h1>The Drill Ground</h1>
		{#if getPending() > 0}
			<span class="pending" title="workouts waiting to sync">⟳ {getPending()} to sync</span>
		{/if}
	</header>

	<!-- readiness hero -->
	<div class="hero">
		<div class="ring">
			<ProgressRing value={ringPct} size={104} stroke={10} label={`${weekSessions}/${weeklyGoal}`} />
			<div class="ring-cap">THIS WEEK</div>
		</div>
		<div class="hero-side">
			<div class="streak-box">
				<StreakFlame count={ptStreak} showLabel={false} size={28} />
				<div>
					<div class="streak-n">{ptStreak}-day</div>
					<div class="streak-l">training streak</div>
				</div>
			</div>
			<button class="log-btn" data-tour="pt-log" onclick={() => openLog(EXERCISES[0])}>Log a workout →</button>
		</div>
	</div>

	<!-- circuits -->
	<section class="group">
		<h2>Guided circuits</h2>
		<div class="circuits">
			{#each ROUTINES as r (r.code)}
				<button class="circuit" onclick={() => goto(`/pt/${r.code}`)}>
					<div class="c-top">
						<span class="c-name">{r.name}</span>
						<span class="c-diff">{r.difficulty}</span>
					</div>
					<div class="c-blurb">{r.blurb}</div>
					<div class="c-meta">
						<span>{r.duration_min} min</span><span>·</span><span>{r.rounds} rounds</span><span>·</span
						><span class="c-focus">{r.focus}</span>
					</div>
				</button>
			{/each}
		</div>
	</section>

	<!-- exercises -->
	<section class="group">
		<h2>Exercises</h2>
		<div class="filters">
			<button class="chip" class:on={groupFilter === 'all'} onclick={() => (groupFilter = 'all')}
				>All</button
			>
			{#each GROUPS as g (g.key)}
				<button class="chip" class:on={groupFilter === g.key} onclick={() => (groupFilter = g.key)}
					>{g.label}</button
				>
			{/each}
		</div>

		{#if logs === null}
			<Skeleton height="240px" radius="var(--r-lg)" />
		{:else}
			<div class="ex-list">
				{#each shownExercises as ex (ex.code)}
					{@const pb_ = pbByCode.get(ex.code) ?? 0}
					{@const lvl = levelFor(ex, pb_)}
					<button class="ex" onclick={() => openLog(ex)}>
						<div class="ex-main">
							<div class="ex-name">{ex.name}</div>
							<div class="ex-sub">{ex.muscle} · {ex.equipment === 'none' ? 'no kit' : ex.equipment}</div>
						</div>
						<div class="ex-stat">
							<span class="ex-lvl lvl-{lvl.index}">{lvl.label}</span>
							{#if pb_ > 0}<span class="ex-pb">PB {formatValue(ex.metric, pb_)}</span>{/if}
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</section>
</div>

<Sheet bind:open={sheetOpen} title={selected ? `Log · ${selected.name}` : 'Log a workout'}>
	{#if selected}
		<div class="form">
			<!-- exercise switcher -->
			<label class="field">
				<span class="flabel">Exercise</span>
				<select
					class="input"
					value={selected.code}
					onchange={(e) => {
						const ex = exerciseByCode((e.currentTarget as HTMLSelectElement).value);
						if (ex) {
							selected = ex;
							setValues = [0];
						}
					}}
				>
					{#each GROUPS as g (g.key)}
						<optgroup label={g.label}>
							{#each EXERCISES.filter((x) => x.group === g.key) as x (x.code)}
								<option value={x.code}>{x.name}</option>
							{/each}
						</optgroup>
					{/each}
				</select>
			</label>

			{#if selectedLevel}
				<div class="lvl-line">
					Level <strong class="lvl-{selectedLevel.index}">{selectedLevel.label}</strong>
					{#if selectedLevel.next}
						· {selectedLevel.next.min}
						{unitLabel} for {selectedLevel.next.label}{/if}
				</div>
			{/if}

			<div class="sets">
				<span class="flabel">Sets ({unitLabel})</span>
				{#each setValues as _, i (i)}
					<div class="set-row">
						<span class="set-no">{i + 1}</span>
						<input
							class="input"
							type="number"
							min="0"
							inputmode="numeric"
							bind:value={setValues[i]}
							placeholder={unitLabel}
						/>
						{#if setValues.length > 1}
							<button class="set-x" aria-label="remove set" onclick={() => removeSet(i)}>✕</button>
						{/if}
					</div>
				{/each}
				{#if selected.metric !== 'distance'}
					<button class="add-set" onclick={addSet}>+ Add set</button>
				{/if}
			</div>

			<label class="field">
				<span class="flabel">Date</span>
				<input class="input" type="date" max={todayStr()} bind:value={logDate} />
			</label>

			<button class="save" onclick={saveLog} disabled={saving}>
				{saving ? 'Saving…' : 'Save workout'}
			</button>
			<p class="tip">{selected.tip}</p>
		</div>
	{/if}
</Sheet>

<style>
	.pt {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 28px;
		text-transform: uppercase;
	}
	.pending {
		font-size: 10.5px;
		font-weight: 900;
		color: var(--ink-3);
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 4px 10px;
	}
	.hero {
		display: flex;
		align-items: center;
		gap: 18px;
		background: var(--bg-2);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		padding: 16px;
		box-shadow: var(--shadow-2);
	}
	.ring {
		flex: none;
		text-align: center;
	}
	.ring-cap {
		font-size: 9.5px;
		font-weight: 900;
		color: var(--ink-3);
		margin-top: 4px;
		letter-spacing: 0.06em;
	}
	.hero-side {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.streak-box {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.streak-n {
		font-family: var(--font-display);
		font-size: 18px;
	}
	.streak-l {
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.log-btn {
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 14px;
		background: var(--orange);
		color: #4d4433;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 12px;
		cursor: pointer;
		box-shadow: var(--shadow-2);
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.group h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 15px;
		text-transform: uppercase;
		color: var(--ink-2);
	}
	.circuits {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.circuit {
		text-align: left;
		background: var(--khaki-tint);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 13px 15px;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.c-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.c-name {
		font-weight: 900;
		font-size: 14.5px;
	}
	.c-diff {
		font-size: 9.5px;
		font-weight: 900;
		background: var(--bg-0);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-sm);
		padding: 3px 8px;
	}
	.c-blurb {
		font-size: 11.5px;
		font-weight: 700;
		color: var(--ink-2);
	}
	.c-meta {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.c-focus {
		text-transform: capitalize;
	}
	.filters {
		display: flex;
		gap: 7px;
		flex-wrap: wrap;
	}
	.chip {
		font-family: var(--font-ui);
		font-weight: 700;
		font-size: 12px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 6px 13px;
		cursor: pointer;
	}
	.chip.on {
		background: var(--khaki-deep);
		color: var(--bg-0);
	}
	.ex-list {
		display: flex;
		flex-direction: column;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		overflow: hidden;
		background: var(--bg-2);
	}
	.ex {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		text-align: left;
		background: none;
		border: none;
		border-bottom: 1px solid var(--line-soft);
		padding: 12px 14px;
		cursor: pointer;
	}
	.ex:last-child {
		border-bottom: none;
	}
	.ex-name {
		font-weight: 900;
		font-size: 13.5px;
	}
	.ex-sub {
		font-size: 10.5px;
		color: var(--ink-3);
		margin-top: 2px;
	}
	.ex-stat {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 3px;
	}
	.ex-lvl {
		font-size: 10px;
		font-weight: 900;
		border-radius: var(--r-sm);
		padding: 2px 8px;
		border: var(--bw) solid var(--line);
	}
	.ex-pb {
		font-size: 10px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.lvl-0 {
		background: var(--bg-1);
		color: var(--ink-3);
	}
	.lvl-1 {
		background: var(--blue-tint);
		color: var(--blue-deep);
	}
	.lvl-2 {
		background: var(--orange-tint);
		color: var(--orange-deep);
	}
	.lvl-3 {
		background: var(--green-tint);
		color: var(--green-deep);
	}
	/* log sheet form */
	.form {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding-bottom: 8px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.flabel {
		font-size: 11px;
		font-weight: 900;
		color: var(--ink-3);
		text-transform: uppercase;
	}
	.input {
		font-family: var(--font-ui);
		font-size: 15px;
		background: var(--bg-0);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 11px 12px;
		color: var(--ink-1);
		width: 100%;
	}
	.lvl-line {
		font-size: 12px;
		font-weight: 700;
		color: var(--ink-2);
	}
	.lvl-line strong {
		border-radius: var(--r-sm);
		padding: 1px 7px;
	}
	.sets {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.set-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.set-no {
		flex: none;
		width: 22px;
		font-size: 11px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.set-x {
		flex: none;
		background: none;
		border: none;
		color: var(--ink-3);
		font-size: 14px;
		cursor: pointer;
	}
	.add-set {
		align-self: flex-start;
		font-size: 12px;
		font-weight: 700;
		background: none;
		border: none;
		color: var(--blue-deep);
		cursor: pointer;
		padding: 2px 0;
	}
	.save {
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 15px;
		background: var(--green);
		color: #4d4433;
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 13px;
		min-height: 48px;
		cursor: pointer;
		box-shadow: var(--shadow-2);
	}
	.save:disabled {
		opacity: 0.7;
	}
	.tip {
		margin: 0;
		font-size: 11px;
		color: var(--ink-3);
		text-align: center;
	}
</style>
