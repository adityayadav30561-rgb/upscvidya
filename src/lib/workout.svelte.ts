/** Workout logging with an OFFLINE QUEUE (build book Prompt 16, pivoted).
 *
 *  Workouts happen at home/outdoors, often without signal — so a log is written
 *  to a localStorage queue first and synced to `workout_logs` when online (on
 *  reconnect, on boot, and immediately when already online). Each queued log
 *  carries a client-generated `client_id`; the collection is unique on
 *  (user, client_id), so a replayed create collides and is dropped — the log
 *  syncs exactly once and the XP hook never double-awards.
 */
import { browser } from '$app/environment';
import { pb } from './pb';
import type { WorkoutLog } from './types';
import { summarizeSets, type Metric, type WorkoutSet, type Group } from './pt';

export interface PendingLog {
	client_id: string;
	exercise_code: string;
	group: Group | '';
	metric: Metric;
	sets: WorkoutSet[];
	total: number;
	best: number;
	source: 'manual' | 'routine';
	routine_code: string;
	logged_at: string;
}

const QKEY = 'pt-queue';

// reactive signals for the UI: pending count + a version that bumps on each sync
const sync = $state<{ pending: number; version: number }>({ pending: 0, version: 0 });
export const getPending = () => sync.pending;
export const getSyncVersion = () => sync.version;

function loadQueue(): PendingLog[] {
	if (!browser) return [];
	try {
		return JSON.parse(localStorage.getItem(QKEY) || '[]') as PendingLog[];
	} catch {
		return [];
	}
}
function saveQueue(q: PendingLog[]): void {
	if (!browser) return;
	try {
		localStorage.setItem(QKEY, JSON.stringify(q));
	} catch {
		/* quota — ignore */
	}
	sync.pending = q.length;
}

function uuid(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return 'w_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
	}
}

/** Build a queue-ready log from raw sets (computes total/best). */
export function buildLog(input: {
	exercise_code: string;
	group: Group | '';
	metric: Metric;
	sets: WorkoutSet[];
	source?: 'manual' | 'routine';
	routine_code?: string;
	logged_at?: string;
}): PendingLog {
	const { total, best } = summarizeSets(input.metric, input.sets);
	return {
		client_id: uuid(),
		exercise_code: input.exercise_code,
		group: input.group,
		metric: input.metric,
		sets: input.sets,
		total,
		best,
		source: input.source ?? 'manual',
		routine_code: input.routine_code ?? '',
		logged_at: input.logged_at ?? new Date().toISOString().replace('T', ' ')
	};
}

/** Queue one or more logs and attempt an immediate sync. */
export async function logWorkouts(logs: PendingLog[]): Promise<void> {
	const q = loadQueue();
	q.push(...logs);
	saveQueue(q);
	await flush();
}
export const logWorkout = (log: PendingLog) => logWorkouts([log]);

function isDuplicate(err: unknown): boolean {
	const e = err as { status?: number; response?: { data?: Record<string, { code?: string }> } };
	if (e?.status !== 400) return false;
	const data = e.response?.data;
	if (data) {
		for (const k of Object.keys(data)) if (data[k]?.code === 'validation_not_unique') return true;
	}
	// a 400 on our controlled payload is almost always the unique-index replay
	return true;
}

/** Flush the queue to PocketBase. Duplicates (already synced) are dropped;
 *  network failures stay queued for the next attempt. */
export async function flush(): Promise<void> {
	if (!browser || !navigator.onLine || !pb.authStore.isValid) return;
	const q = loadQueue();
	if (q.length === 0) return;
	const uid = pb.authStore.record!.id;
	const remaining: PendingLog[] = [];
	let changed = false;
	for (const item of q) {
		try {
			await pb.collection('workout_logs').create({ user: uid, ...item });
			changed = true;
		} catch (err) {
			if (isDuplicate(err)) {
				changed = true; // treat as synced; drop it
			} else {
				remaining.push(item); // network/other — retry later
			}
		}
	}
	saveQueue(remaining);
	if (changed) sync.version += 1;
}

/** Fetch this user's synced logs (newest first). */
export async function fetchLogs(exercise_code?: string): Promise<WorkoutLog[]> {
	if (!pb.authStore.isValid) return [];
	const filter = exercise_code ? `exercise_code = "${exercise_code}"` : '';
	return pb.collection('workout_logs').getFullList<WorkoutLog>({
		sort: '-logged_at',
		...(filter ? { filter } : {})
	});
}

// wire the queue drain: on boot + whenever connectivity returns
if (browser) {
	sync.pending = loadQueue().length;
	window.addEventListener('online', () => void flush());
	// a deferred first attempt (after authStore hydrates)
	setTimeout(() => void flush(), 1500);
}
