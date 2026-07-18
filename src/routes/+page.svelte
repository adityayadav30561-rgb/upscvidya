<!--
	Placeholder landing. Confirms the scaffold runs. Real app shell + bottom nav
	come with prompt 1 (built from the design handoff mockups).
-->
<main>
	<img src="/logo.svg" alt="UPSC Vidya" width="240" />
	<h1>Scaffold ready</h1>
	<p>SvelteKit PWA · static adapter · PocketBase backend (pending)</p>
	<p class="hint">Drop the design handoff into <code>/docs/design/</code>, then run prompt 1.</p>
</main>

<style>
	main {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		text-align: center;
		padding: 2rem;
	}
	h1 {
		margin: 1rem 0 0;
		color: var(--brand-primary);
	}
	p {
		margin: 0.25rem 0;
		color: var(--muted);
	}
	.hint {
		margin-top: 1rem;
		font-size: 0.85rem;
	}
	code {
		background: #f1f5f9;
		padding: 0.1rem 0.35rem;
		border-radius: 6px;
	}
</style>
