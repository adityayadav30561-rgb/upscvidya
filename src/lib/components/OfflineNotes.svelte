<script lang="ts">
	/* "Download all my unlocked notes" (build book Prompt 06, point 3).
	   Prefetches every notes payload the user is entitled to — gating stays
	   server-side, since the fetch only returns topics the rules permit. */
	import { onMount } from 'svelte';
	import { pb } from '$lib/pb';
	import { cacheNote, cachedCodes, removeAllCached } from '$lib/offline';
	import { showToast } from '$lib/toast.svelte';
	import type { Topic } from '$lib/types';

	let count = $state(0);
	let busy = $state(false);
	let done = $state(0);
	let total = $state(0);

	async function refresh() {
		count = (await cachedCodes()).length;
	}
	onMount(refresh);

	async function downloadAll() {
		if (busy) return;
		busy = true;
		done = 0;
		try {
			// the entitled full read — rules return only permitted topics
			const topics = await pb.collection('topics').getFullList<Topic>({ sort: 'guided_order' });
			total = topics.length;
			for (const t of topics) {
				await cacheNote({
					code: t.id_code,
					title: t.title,
					notes_md: t.notes_md,
					est_read_minutes: t.est_read_minutes,
					mcq_floor: t.mcq_floor,
					region: t.region,
					book_ref: t.book_ref
				});
				done++;
			}
			await refresh();
			showToast(`${topics.length} topics saved for offline`, 'success');
		} catch {
			showToast('Download needs a connection', 'error');
		} finally {
			busy = false;
		}
	}

	async function clearAll() {
		await removeAllCached();
		await refresh();
		showToast('Offline notes cleared', 'info');
	}
</script>

<div class="offline-mgr">
	<div class="row">
		<div>
			<div class="title">Offline notes</div>
			<div class="sub">{count} {count === 1 ? 'topic' : 'topics'} saved on this device</div>
		</div>
		<button class="dl" disabled={busy} onclick={downloadAll}>
			{busy ? `Saving ${done}/${total}…` : 'Download all'}
		</button>
	</div>
	{#if count > 0}
		<button class="clear" onclick={clearAll}>Clear offline notes</button>
	{/if}
</div>

<style>
	.offline-mgr {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 12px 14px;
	}
	.title {
		font-weight: 900;
		font-size: 13px;
	}
	.sub {
		font-size: 10.5px;
		color: var(--ink-3);
	}
	.dl {
		flex: none;
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 12.5px;
		background: var(--green);
		color: var(--ink-1);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 9px 16px;
		min-height: 40px;
		cursor: pointer;
	}
	.dl:disabled {
		opacity: 0.7;
		cursor: default;
	}
	.clear {
		align-self: flex-start;
		background: none;
		border: none;
		font-family: var(--font-ui);
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
		cursor: pointer;
		padding: 2px;
	}
</style>
