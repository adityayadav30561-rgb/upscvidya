<script lang="ts">
	import { requestPasswordReset } from '$lib/auth.svelte';

	let email = $state('');
	let sent = $state(false);
	let error = $state('');
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (!email.trim()) {
			error = 'Enter the email you enlisted with.';
			return;
		}
		busy = true;
		try {
			await requestPasswordReset(email.trim());
			sent = true;
		} catch {
			sent = true; // never reveal whether an email exists
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>UPSCVidya — Reset password</title></svelte:head>

<main>
	<div class="card">
		{#if sent}
			<h1>Check your inbox</h1>
			<p>If that email is enlisted, a reset link is on its way. It expires in 30 minutes.</p>
			<a class="back" href="/login">← Back to login</a>
		{:else}
			<h1>Reset password</h1>
			<p>We'll email you a reset link.</p>
			<form onsubmit={submit}>
				<label class="field">
					<span class="label">EMAIL</span>
					<input type="email" bind:value={email} placeholder="you@example.com" autocomplete="email" />
				</label>
				{#if error}<div class="error">{error}</div>{/if}
				<button class="cta" type="submit" disabled={busy}>Send reset link →</button>
			</form>
			<a class="back" href="/login">← Back to login</a>
		{/if}
	</div>
</main>

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
		padding: 36px 26px 28px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		text-align: center;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 24px;
		text-transform: uppercase;
	}
	p {
		margin: 0;
		font-size: 13px;
		color: var(--ink-2);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
		text-align: left;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.label {
		font-size: 11px;
		font-weight: 900;
		color: var(--ink-3);
	}
	input {
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 13px 14px;
		font-family: var(--font-ui);
		font-size: 14px;
		font-weight: 700;
	}
	input:focus {
		outline: none;
		box-shadow: var(--shadow-2);
	}
	.error {
		font-size: 12px;
		font-weight: 700;
		color: var(--red-deep);
	}
	.cta {
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 15px;
		background: var(--orange);
		color: var(--line);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 14px;
		min-height: 48px;
		cursor: pointer;
		box-shadow: var(--shadow-2);
	}
	.back {
		font-size: 12.5px;
		font-weight: 700;
	}
</style>
