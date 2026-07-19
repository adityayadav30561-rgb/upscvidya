<script lang="ts">
	let {
		width = '100%',
		height = '16px',
		radius = 'var(--r-md)'
	}: {
		width?: string;
		height?: string;
		radius?: string;
	} = $props();
</script>

<div class="skeleton" style:width style:height style:border-radius={radius} aria-hidden="true"></div>

<style>
	.skeleton {
		background: var(--bg-1);
		border: 1px solid var(--line-soft);
		animation: skeleton-pulse 1.4s ease-in-out infinite;
	}
</style>
