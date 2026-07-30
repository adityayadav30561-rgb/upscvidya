# Beta Setup — running checklist

> Everything between "the app is built" and "a stranger can use it".
> Tick items as they land. Beta hosting = **PocketHost** (free, hosted, runs
> without your machine); Oracle Always Free VPS is the launch destination.
> Distribution = **URL + install guide** (PWA). APK (TWA, self-hosted download,
> not Play Store) comes later.

**Current objective: make the app installable on a phone.** Content authoring
(POL-07 onward) is paused until a stranger can open a URL, tap *Add to Home
Screen*, and log in. Steps 1 → 2 → 2b → 5 → 7 → 9 are the **critical path** to
that; 3, 4, 6, 8 can land after the first install works.

| # | Step | State |
|---|---|---|
| 1 | Google login (Cloud Console + PB `users` OAuth2) | ⬅️ **in progress** — blocked on user |
| 2 | PocketHost deploy (backend) | ⬜ *critical path* |
| 2b | **Cloudflare Pages deploy (frontend) + HTTPS origin** | ⬜ *critical path* |
| 3 | API keys — AI ✅ (5 providers) · PostHog · OneSignal | 🟡 AI done |
| 4 | Notifications verified | ⬜ |
| 5 | Beta-free system (`beta_free_until` + founder badge + banner) | ⬜ *critical path* |
| 6 | Content | 🟡 8 of 103 units |
| 7 | Privacy policy + terms pages | ⬜ *critical path* (also unblocks Google "Production") |
| 8 | Feedback sheet + beta ribbon + remote config | ⬜ |
| 9 | Install guide (Android + iOS) | ⬜ *critical path* |

---

## What this costs

**Beta: ₹0 total.** Not "cheap" — zero. Nothing in the beta stack has a paid line.

| Thing | Beta plan | Cost |
|---|---|---|
| Backend + DB | PocketHost free instance (`*.pockethost.io`, TLS) | ₹0 |
| Frontend | Cloudflare Pages (`*.pages.dev`, TLS) | ₹0 |
| Domain | none — free subdomains from both hosts | ₹0 |
| AI (CA pipeline, `pnpm ingest`) | 5 free tiers in a failover chain | ₹0 |
| PostHog / OneSignal | free tiers; unset ⇒ no-op anyway | ₹0 |
| Payments | Razorpay keys **unset** all beta; paywall → beta banner | ₹0 |
| Distribution | URL + install guide (PWA). TWA later, self-hosted, not Play Store | ₹0 |

Users pay ₹0 too — `beta_free_until` (step 5) makes everyone premium for the window.

**Launch: the domain, and essentially nothing else.**

- **Domain ~₹700–1,500/yr** — the only guaranteed recurring spend. Compare
  *renewal* prices, not first-year promos.
- **Oracle ARM VPS ₹0**, but only on a **Pay As You Go tenancy** staying inside
  the Always Free allowances. An Always-Free-*tier* account gets its idle
  instance reclaimed and can rarely provision ARM capacity in Indian regions.
  A budget alert is **not** a spending cap. Full rules:
  `infra/SERVER.md` → "Oracle account posture"; rationale: `DECISIONS.md`.
- **Razorpay** ~2% + GST per transaction, once payments switch on. Out of
  revenue, no setup or monthly fee.
- **Cloudflare Pages + R2 backups** stay free on a custom domain.
- Free-tier ceilings that only bite at real volume: PostHog events, OneSignal
  subscribers, AI request caps (the 5-provider chain exists for exactly this).

---

## Step 1 — Google login

App code is **already done** — `loginWithGoogle()` in `src/lib/auth.svelte.ts`
calls PocketBase's `authWithOAuth2({ provider: 'google' })`, and the button is
live on `/login`. Nothing to build; this is config in two places.

### 1a. Google Cloud Console

1. <https://console.cloud.google.com> → **create a project** ("UPSCVidya").
2. **APIs & Services → OAuth consent screen**
   - User type: **External**
   - App name `UPSCVidya`, support email = yours
   - Scopes: leave the defaults (`email`, `profile`, `openid`). These are
     **non-sensitive** — no Google verification review needed.
   - Publishing status: while testing, **Testing** is fine but caps you at
     **100 users** and shows an "unverified app" warning. Before handing the
     link out widely, click **Publish app → Production**. That requires a
     privacy-policy URL (step 7), so this can wait until then.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized JavaScript origins:** `http://localhost:5173`
   - **Authorized redirect URIs:** the exact URL the PocketBase admin UI shows
     you in step 1b (do not guess it — copy it from PB, it is version-specific).
   - Save the **Client ID** and **Client secret**.

### 1b. PocketBase

Start PB locally (`pb/pocketbase.exe serve --http=127.0.0.1:8090`), open
<http://127.0.0.1:8090/_/> →
**Collections → `users` → ⚙ Options → OAuth2 → enable → + Google**.

Paste the Client ID and Client secret. The panel displays the **redirect URL**
to register — copy it back into the Google credential from 1a.

Keep the secret out of chat logs and out of git: it lives in PB's own database,
not in `.env`.

### 1c. Test

```bash
pb/pocketbase.exe serve --http=127.0.0.1:8090   # terminal 1
pnpm dev                                        # terminal 2
```

Open <http://localhost:5173/login> → **Continue with Google**. Expect: a Google
popup → account chooser → back to the app, landing on `/onboarding` for a new
account (or `/` if already onboarded).

Verify afterwards in PB Admin → `users`: the new row has the Google email, and
`verified` is true.

### Gotchas

- `authWithOAuth2` opens a **popup**. Browsers only allow it because it starts
  from a real click — keep the call inside the click handler (it is).
- Adding PocketHost later means **appending** a second origin + redirect URI to
  the *same* OAuth client. Nothing gets replaced, so nothing breaks locally.
- Google accounts skip password signup, so they arrive with no `displayName`
  conventions from the email path — check onboarding handles that.

---

## Step 2 — PocketHost deploy (not started)

Outline, for when step 1 is green:

1. Sign up at <https://pockethost.io>, create an instance → gives
   `https://<name>.pockethost.io` with TLS.
2. Upload `pb/pb_migrations/` and `pb/pb_hooks/` (hooks include `lib/`).
   Confirm the PB version matches what the hooks expect.
3. Create the superuser; re-do the step-1b Google config on the hosted instance
   (PB config lives in the database, so it does **not** travel with the code).
4. Add `https://<name>.pockethost.io`'s redirect URI + the Cloudflare Pages
   origin to the Google OAuth client.
5. `PB_URL_PROD=https://<name>.pockethost.io` in `.env`, then
   `pnpm validate && pnpm sync -- --env prod`.
6. Point the deployed frontend at it via `PUBLIC_PB_URL`.
7. Lock CORS to the Pages origin.

---

## Step 2b — Cloudflare Pages deploy (not started)

**This is the step that makes the app installable.** A PWA needs a secure
origin: without HTTPS there is no service worker, no *Add to Home Screen*, and
no Google OAuth. `adapter-static` already emits a pure static SPA, and
`static/manifest.webmanifest` is already install-ready (`display: standalone`,
maskable icon), so this is deploy config, not app code.

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**
   → the repo, branch `main`.
2. Build settings: build command `pnpm build`, output directory `build`.
3. **Environment variables** — every `PUBLIC_*` the code imports from
   `$env/static/public` must exist or the build fails, empty is fine:
   `PUBLIC_PB_URL=https://<name>.pockethost.io`, `PUBLIC_DEV_BYPASS_AUTH=false`,
   `PUBLIC_POSTHOG_KEY`, `PUBLIC_POSTHOG_HOST`, `PUBLIC_ONESIGNAL_APP_ID`.
   No server secrets here — this bundle is public.
4. Deploy → `https://<project>.pages.dev`. No domain, ₹0.
5. Add that origin to the Google OAuth client (**JavaScript origins**) and lock
   PB CORS to it (step 2.7).
6. Verify on a real phone: Chrome Android shows an install prompt; iOS is
   Safari-only via Share → *Add to Home Screen* with **no** prompt — that is the
   onboarding risk step 9 has to cover with screenshots.

### Known gaps to close here

- **No "new version" toast.** `src/service-worker.ts` calls `skipWaiting()` +
  `clients.claim()`, so a reload picks up a deploy — but an already-open tab
  keeps the old JS silently. Worth a toast before handing the link out.
- **`pnpm build` has never run against a real `PUBLIC_PB_URL`.** Run it locally
  with the PocketHost URL set before trusting the Pages build.

---

## Step 3 — API keys (not started)

| Key | For | Free tier |
|---|---|---|
| `OPENROUTER_API_KEY` ✅ set | primary AI: `pnpm ingest` — notes → draft MCQs; CA pipeline drafting. Model `nvidia/nemotron-3-ultra-550b-a55b:free` | openrouter.ai — **50 req/day** while the account has <10 credits, ~25s/question |
| `GEMINI_API_KEY` ✅ set | AI, 2nd in order. `gemini-3.6-flash` (1M ctx, native JSON mode) | Google Antigravity key (`AQ.*`) — ~5s/question; Pro models 429 |
| `MISTRAL_API_KEY` ✅ set | AI, 3rd in order. `mistral-large-latest` (262k ctx) | console.mistral.ai — **50 req/min**, 50k tokens/min, no daily cap in headers |
| `OPENCODE_API_KEY` ✅ set | AI, 4th in order. `deepseek-v4-flash-free` (~2s) | OpenCode Zen — every model free; no rate-limit headers |
| `GROQ_API_KEY` ✅ set | AI, 5th in order. `llama-3.3-70b-versatile` | console.groq.com — **1000 req/day**, 12k tokens/min, ~1s/question |
| `PUBLIC_POSTHOG_KEY` / `_HOST` | funnel analytics (already wired) | posthog.com |
| `PUBLIC_ONESIGNAL_APP_ID` + `ONESIGNAL_APP_ID` / `ONESIGNAL_REST_KEY` | web push | onesignal.com |

Chain is OpenRouter → Gemini → Mistral → OpenCode Zen → Groq. A call starts at
the first and **falls over** to the next when it's out of quota or rejects the
key, so a long ingest run keeps going after OpenRouter's 50/day is spent.
`AI_PROVIDER=mistral` (etc.) pins to one and disables failover — use it to spend
a chosen quota. For bulk MCQ drafting, pinning to Groq (1000/day, ~1s) or
Mistral (50/min) is far faster than letting the chain start on OpenRouter's
50/day at ~25s each.

Server-only keys (`ONESIGNAL_REST_KEY` + whichever AI key you want the CA hook
to use) go in the **PocketBase** environment, not the client bundle. All unset ⇒
no-op, so the app runs fine without them.

Razorpay stays **unset** for the whole beta — beta is free.
