<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import {
		auth,
		bootAuth,
		loginWithPassword,
		loginWithGoogle,
		signup,
		resolveReferralCode
	} from '$lib/auth.svelte';
	import { showToast } from '$lib/toast.svelte';

	/* Screen 17 — Login / Sign up. Design is phone-number-first; until an SMS
	   provider is chosen the same layout runs on email (screen-map.md). Sign-up
	   and login toggle in place; single centered 420px card. */

	let mode = $state<'login' | 'signup'>('login');
	let fullName = $state('');
	let email = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let error = $state('');
	let shake = $state(false);
	let busy = $state(false);
	let referredBy: string | null = null;

	// live password checklist (signup) — validates as you type, not on submit
	const pwChecks = $derived([
		{ label: '8+ characters', ok: password.length >= 8 },
		{ label: 'contains a letter', ok: /[a-zA-Z]/.test(password) },
		{ label: 'contains a number', ok: /\d/.test(password) }
	]);

	onMount(async () => {
		await bootAuth();
		if (auth.isLoggedIn) {
			goto(auth.isOnboarded ? '/' : '/onboarding', { replaceState: true });
			return;
		}
		if (page.url.searchParams.get('mode') === 'signup') mode = 'signup';
		const code = localStorage.getItem('referral-code');
		if (code) referredBy = await resolveReferralCode(code);
	});

	function fail(message: string) {
		error = message;
		shake = true;
		setTimeout(() => (shake = false), 250);
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (!email.trim()) return fail('Email is required.');
		if (mode === 'signup') {
			if (!fullName.trim()) return fail('Name is required — as on your application form.');
			if (pwChecks.some((c) => !c.ok)) return fail('Password does not meet the checklist yet.');
		}
		busy = true;
		try {
			if (mode === 'login') {
				await loginWithPassword(email.trim(), password);
				const streak = auth.user?.streak_current ?? 0;
				if (streak > 0) showToast(`Day ${streak} — briefing awaits`, 'success');
				goto(auth.isOnboarded ? '/' : '/onboarding', { replaceState: true });
			} else {
				await signup({
					displayName: fullName.trim(),
					email: email.trim(),
					password,
					referredBy
				});
				localStorage.removeItem('referral-code');
				goto('/onboarding', { replaceState: true });
			}
		} catch {
			fail(
				mode === 'login'
					? 'Wrong credentials. Check email and password.'
					: 'Could not create the account — is this email already enlisted?'
			);
		} finally {
			busy = false;
		}
	}

	async function google() {
		error = '';
		busy = true;
		try {
			await loginWithGoogle();
			goto(auth.isOnboarded ? '/' : '/onboarding', { replaceState: true });
		} catch (err) {
			// Keep the original exception: a bare `catch {}` here hid the real
			// cause (PB's code-exchange failure) behind the generic copy below.
			const e = err as { status?: number; message?: string; response?: unknown };
			console.error('[oauth] google sign-in failed', {
				status: e?.status,
				message: e?.message,
				response: e?.response,
				raw: err
			});
			fail('Google sign-in failed or was cancelled.');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>UPSCVidya — {mode === 'login' ? 'Report for duty' : 'Enlist'}</title></svelte:head>

<main>
	<div class="card" class:shake>
		{#if mode === 'login'}
			<div class="head">
				<svg width="58" height="58" viewBox="0 0 56 56" aria-hidden="true">
					<circle cx="28" cy="28" r="26" fill="var(--khaki-tint)" stroke="#4d4433" stroke-width="1.5" />
					<path
						d="M28 12 L31 22 H41 L33 28 L36 38 L28 32 L20 38 L23 28 L15 22 H25 Z"
						fill="var(--khaki)"
						stroke="#4d4433"
						stroke-width="1.3"
						stroke-linejoin="round"
					/>
				</svg>
				<h1>Welcome back!</h1>
				<p>Your battalion held position while you were away.</p>
			</div>
		{:else}
			<div class="head">
				<h1>Enlist</h1>
				<p>Free to start: full PYQ Vault + the Foundations region. No card needed.</p>
			</div>
		{/if}

		<form onsubmit={submit}>
			{#if mode === 'signup'}
				<label class="field">
					<span class="label">FULL NAME</span>
					<input
						type="text"
						bind:value={fullName}
						placeholder="As on your application form"
						autocomplete="name"
					/>
				</label>
			{/if}

			<label class="field">
				<span class="label">EMAIL</span>
				<input type="email" bind:value={email} placeholder="you@example.com" autocomplete="email" />
				{#if mode === 'signup'}
					<span class="hint">We'll use this to secure your account.</span>
				{/if}
			</label>

			<label class="field">
				<span class="labelrow">
					<span class="label">{mode === 'signup' ? 'SET PASSWORD' : 'PASSWORD'}</span>
					{#if mode === 'login'}
						<a class="forgot" href="/forgot">Forgot?</a>
					{/if}
				</span>
				<span class="pwwrap">
					<input
						type={showPassword ? 'text' : 'password'}
						bind:value={password}
						placeholder={mode === 'signup' ? '8+ characters' : '••••••••'}
						autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
					/>
					<button
						type="button"
						class="eye"
						onclick={() => (showPassword = !showPassword)}
						aria-label={showPassword ? 'hide password' : 'show password'}
					>
						<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
							<path
								d="M2 10 C4.5 5.5 8 3.5 10 3.5 C12 3.5 15.5 5.5 18 10 C15.5 14.5 12 16.5 10 16.5 C8 16.5 4.5 14.5 2 10 Z"
								fill="none"
								stroke="var(--ink-3)"
								stroke-width="1.5"
							/>
							<circle cx="10" cy="10" r="3" fill="none" stroke="var(--ink-3)" stroke-width="1.5" />
						</svg>
					</button>
				</span>
				{#if mode === 'signup' && password}
					<ul class="checklist">
						{#each pwChecks as c (c.label)}
							<li class:ok={c.ok}>{c.ok ? '✓' : '·'} {c.label}</li>
						{/each}
					</ul>
				{/if}
			</label>

			{#if error}<div class="error">{error}</div>{/if}

			{#if mode === 'login'}
				<button class="cta orange" type="submit" disabled={busy}>Report for duty →</button>
			{:else}
				<button class="cta green" type="submit" disabled={busy}>Create account →</button>
			{/if}
		</form>

		<div class="divider"><span></span><em>or continue with</em><span></span></div>

		<div class="social">
			<button type="button" class="google" onclick={google} disabled={busy}>
				<svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
					<path d="M17.64 9.2 C17.64 8.57 17.58 7.95 17.47 7.36 H9 V10.85 H13.84 C13.63 11.97 13 12.92 12.05 13.56 V15.82 H14.96 C16.66 14.25 17.64 11.95 17.64 9.2 Z" fill="#4285F4" />
					<path d="M9 18 C11.43 18 13.47 17.19 14.96 15.82 L12.05 13.56 C11.24 14.1 10.21 14.42 9 14.42 C6.66 14.42 4.67 12.84 3.96 10.71 H0.96 V13.04 C2.44 15.98 5.48 18 9 18 Z" fill="#34A853" />
					<path d="M3.96 10.71 C3.78 10.17 3.68 9.59 3.68 9 C3.68 8.41 3.78 7.83 3.96 7.29 V4.96 H0.96 C0.35 6.17 0 7.55 0 9 C0 10.45 0.35 11.83 0.96 13.04 Z" fill="#FBBC05" />
					<path d="M9 3.58 C10.32 3.58 11.51 4.03 12.44 4.93 L15.02 2.35 C13.46 0.89 11.43 0 9 0 C5.48 0 2.44 2.02 0.96 4.96 L3.96 7.29 C4.67 5.16 6.66 3.58 9 3.58 Z" fill="#EA4335" />
				</svg>
				Google
			</button>
		</div>

		{#if mode === 'login'}
			<div class="switch">
				New recruit?
				<button type="button" class="linkbtn orange-link" onclick={() => ((mode = 'signup'), (error = ''))}>
					Enlist now
				</button>
			</div>
		{:else}
			<div class="switch small">
				By enlisting you accept the <a href="/terms">Terms</a> &amp;
				<a href="/privacy">Privacy Policy</a>.<br />
				Already serving?
				<button type="button" class="linkbtn orange-link" onclick={() => ((mode = 'login'), (error = ''))}>
					Log in
				</button>
			</div>
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
		gap: 18px;
	}
	.card.shake {
		animation: shake var(--t-base) var(--ease) 1;
	}
	@keyframes shake {
		0%, 100% { transform: translateX(0); }
		25% { transform: translateX(-4px); }
		75% { transform: translateX(4px); }
	}

	.head {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		text-align: center;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 24px;
		text-transform: uppercase;
	}
	.head p {
		margin: 0;
		font-size: 13px;
		color: var(--ink-2);
		max-width: 280px;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
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
	.labelrow {
		display: flex;
		justify-content: space-between;
	}
	.forgot {
		font-size: 11px;
		font-weight: 700;
		color: var(--blue-deep);
	}
	input {
		width: 100%;
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-md);
		padding: 13px 14px;
		font-family: var(--font-ui);
		font-size: 14px;
		font-weight: 700;
		color: var(--ink-1);
		transition: box-shadow var(--t-fast) var(--ease), transform var(--t-fast) var(--ease);
	}
	input::placeholder {
		color: var(--ink-3);
	}
	/* field focus lifts with the hard shadow, like option rows */
	input:focus {
		outline: none;
		box-shadow: var(--shadow-2);
		transform: translate(-1px, -1px);
		border-width: var(--bw-bold);
	}
	.pwwrap {
		position: relative;
		display: flex;
	}
	.pwwrap input {
		padding-right: 42px;
	}
	.eye {
		position: absolute;
		right: 6px;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		padding: 8px;
		cursor: pointer;
	}
	.hint {
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.checklist {
		list-style: none;
		margin: 2px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.checklist li {
		font-size: 11px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.checklist li.ok {
		color: var(--green-deep);
	}
	.error {
		font-size: 12px;
		font-weight: 700;
		color: var(--red-deep);
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
		box-shadow: var(--shadow-2);
		transition: transform var(--t-fast) var(--ease);
	}
	.cta:hover:not(:disabled) {
		transform: translate(-1px, -1px);
	}
	.cta:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.cta.orange {
		background: var(--orange);
	}
	.cta.green {
		background: var(--green);
	}

	.divider {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.divider span {
		flex: 1;
		height: 1px;
		background: var(--line-soft);
	}
	.divider em {
		font-style: normal;
		font-size: 10.5px;
		font-weight: 700;
		color: var(--ink-3);
	}

	.social {
		display: flex;
		justify-content: center;
	}
	.google {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		font-family: var(--font-ui);
		font-weight: 700;
		font-size: 13px;
		background: var(--bg-2);
		color: var(--ink-1);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 11px 24px;
		min-height: 44px;
		cursor: pointer;
		transition: box-shadow var(--t-fast) var(--ease);
	}
	.google:hover {
		box-shadow: var(--shadow-2);
	}

	.switch {
		text-align: center;
		font-size: 12.5px;
		font-weight: 700;
		color: var(--ink-2);
	}
	.switch.small {
		font-size: 11px;
		color: var(--ink-3);
		line-height: 1.6;
	}
	.linkbtn {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		cursor: pointer;
	}
	.orange-link {
		color: var(--orange-deep);
		font-size: 12.5px;
		font-weight: 700;
	}
</style>
