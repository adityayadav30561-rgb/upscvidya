<script lang="ts">
	import { getToasts, dismissToast } from '$lib/toast.svelte';
</script>

<div class="toasts" aria-live="polite">
	{#each getToasts() as toast (toast.id)}
		<button class="toast {toast.type}" onclick={() => dismissToast(toast.id)}>
			{toast.message}
		</button>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		top: 14px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		gap: 8px;
		z-index: 80;
		width: min(400px, calc(100vw - 32px));
	}
	.toast {
		font-family: var(--font-ui);
		font-weight: 700;
		font-size: 13.5px;
		text-align: left;
		background: var(--bg-2);
		color: var(--ink-1);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		box-shadow: var(--shadow-2);
		padding: 12px 16px;
		cursor: pointer;
		animation: toast-in var(--t-base) var(--ease-pop);
	}
	.success {
		background: var(--green-tint);
		border-color: var(--green-deep);
	}
	.error {
		background: var(--red-tint);
		border-color: var(--red-deep);
	}
	@keyframes toast-in {
		from {
			transform: translateY(-12px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}
</style>
