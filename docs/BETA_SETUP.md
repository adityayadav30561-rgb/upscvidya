# Beta Setup — running checklist

> Everything between "the app is built" and "a stranger can use it".
> Tick items as they land. Beta hosting = **Oracle Always Free VPS** (the launch
> box, stood up early) + a free **DuckDNS** hostname; frontend on Cloudflare
> Pages. PocketHost was the original beta host and **dropped its free tier on
> 2026-07-31** — see `DECISIONS.md` → Distribution & hosting.
> Distribution = **URL + install guide** (PWA). APK (TWA, self-hosted download,
> not Play Store) comes later.

**Current objective: make the app installable on a phone.** Content authoring
(POL-07 onward) is paused until a stranger can open a URL, tap *Add to Home
Screen*, and log in. Steps 1 → 2 → 2b → 5 → 7 → 9 are the **critical path** to
that; 3, 4, 6, 8 can land after the first install works.

| # | Step | State |
|---|---|---|
| 1 | Google login (Cloud Console + PB `users` OAuth2) | ✅ **done (local)** — redo on the VPS in step 2 |
| 2 | Oracle VPS deploy (backend) + DuckDNS host | ⬅️ **next** — *critical path* |
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
| Backend + DB | Oracle Always Free VPS (PAYG tenancy), Caddy TLS | ₹0 |
| Frontend | Cloudflare Pages (`*.pages.dev`, TLS) | ₹0 |
| Domain | none — free DuckDNS name + free `*.pages.dev` | ₹0 |
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

- **The redirect URI is built from `PUBLIC_PB_URL`, not from PB's Application
  URL.** The SDK sends `pb.buildURL('/api/oauth2-redirect')`, so with
  `PUBLIC_PB_URL=http://127.0.0.1:8090` the value Google must have registered is
  `http://127.0.0.1:8090/api/oauth2-redirect`. The PB admin panel *displays* a
  redirect URL derived from its own `meta.appURL` (`http://localhost:8090/...`) —
  register that one and you get `redirect_uri_mismatch`, because Google compares
  the strings exactly and `localhost` ≠ `127.0.0.1`. Register the `127.0.0.1`
  form. Don't "fix" it by switching `PUBLIC_PB_URL` to `localhost`: on Windows
  that can resolve to `::1` while PB binds `127.0.0.1` only.
- **`invalid_client` after the consent screen** means the ID and secret in PB
  belong to different OAuth clients (or the secret was rotated). Symptom: PB logs
  `Failed to fetch OAuth2 token` / `oauth2: "invalid_client"`, status 400 on
  `/api/collections/users/auth-with-oauth2`. The admin API masks the stored
  secret, so it always *looks* empty — check PB's logs, not the config screen.
  Fix by pasting a matched ID+secret pair from one client's screen.
- **A Google login for an email that already has an account links to it** rather
  than creating a duplicate (PB adds a `_externalAuths` row). Existing XP, rank
  and streak survive — this is the wanted behaviour, not a bug.
- `authWithOAuth2` opens a **popup**. Browsers only allow it because it starts
  from a real click — keep the call inside the click handler (it is).
- Adding the hosted backend later means **appending** a second origin + redirect
  URI to the *same* OAuth client. Nothing gets replaced, so nothing breaks
  locally. Same again when the DuckDNS name is swapped for a real domain.
- Google accounts skip password signup, so they arrive with no `displayName`
  conventions from the email path — check onboarding handles that.

---

## Step 2 — Oracle VPS deploy (next)

Step 1 is green locally, so this is next. Everything here is already scripted:
`infra/setup.sh` installs Caddy, PocketBase, systemd, ufw, the nightly backup
cron and Node, and **copies `pb/pb_migrations` + `pb/pb_hooks` out of the repo
checkout** — so there is no file upload step, just a `git clone` on the box.

**PocketBase is pinned to v0.39.7** in the script. The hooks are written against
that JSVM surface; do not float it.

Pre-flight (local, already verified): `pocketbase.exe --version` → 0.39.7 ·
`pnpm validate` → 8 topics, 2 PYQ papers, 416 questions.

### 2.1 Oracle tenancy

1. <https://signup.oraclecloud.com> → sign up. **Home region: pick an Indian one**
   (Mumbai / Hyderabad) — it cannot be changed later.
2. **Upgrade to Pay As You Go** (Billing → Upgrade). Mandatory, not optional:
   an Always-Free-*tier* account has its idle instance reclaimed after ~7 days
   of low CPU and constantly fails ARM provisioning here. Card gets a ~₹100
   refundable hold. **Always Free resources stay free on a PAYG tenancy.**
3. Billing → **Budgets** → ₹100, alert at 1% of forecast. It is a smoke alarm,
   **not a spending cap** — OCI has no hard cap. Read
   `infra/SERVER.md` → "Oracle account posture" before creating anything.

### 2.2 The instance

Compute → Instances → **Create instance**:

| Field | Value |
|---|---|
| Image | **Canonical Ubuntu 24.04** |
| Shape | `VM.Standard.A1.Flex` — **Always Free eligible**, 2 OCPU / 12 GB |
| SSH | paste your **public** key (`ssh-ed25519 …`) |
| Networking | assign a **public IPv4** |

Note the public IP. If you hit *"Out of host capacity"* (common for ARM in
Indian regions even on PAYG), fall back to `VM.Standard.E2.1.Micro` (AMD, 1 GB,
also Always Free — plenty for PocketBase) and pass `ARCH=amd64` in 2.4.

Then **VCN → Security List → add ingress 80/tcp and 443/tcp from 0.0.0.0/0**.
ufw alone is not enough on Oracle; the VCN filters first. 22 is already open.

### 2.3 DuckDNS hostname

Caddy needs a name — Let's Encrypt will not issue a certificate for a bare IP,
and without TLS there is no service worker, no *Add to Home Screen* and no
Google OAuth.

1. <https://duckdns.org> → sign in with GitHub/Google → create subdomain
   `upscvidya` → set **current ip** = the VPS public IP → update.
2. Verify from your machine: `nslookup upscvidya.duckdns.org` → the VPS IP.

A DuckDNS name has no room for an `api.` prefix, so `setup.sh` is run with
`API_HOST` overriding its default of `api.$DOMAIN`.

### 2.4 Bootstrap the box

```bash
ssh -i <your-private-key> ubuntu@<VPS-IP>

sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/<you>/upscvidya.git
cd upscvidya

sudo DOMAIN=upscvidya.duckdns.org \
     API_HOST=upscvidya.duckdns.org \
     ADMIN_SSH_KEY="ssh-ed25519 AAAA... you@machine" \
     bash infra/setup.sh
# add ARCH=amd64 if you fell back to the E2.1.Micro shape
```

Idempotent — safe to re-run. Verify:

```bash
systemctl status pocketbase caddy      # both active
curl -s https://upscvidya.duckdns.org/api/health   # 200
```

A TLS failure here is almost always DNS not yet pointing at the box, or 80/443
still closed in the VCN security list (Let's Encrypt does an HTTP-01 challenge
on port 80).

Then open `https://upscvidya.duckdns.org/_/` → **create the superuser** and
confirm the collection list: `users topics questions attempts topic_progress
sr_cards tests test_attempts ca_items battalions leaderboard_entries pet_logs
payments referral_credits` + `topics_public`, `topics_teaser`, `quiz_sessions`,
`badges`, `xp_events`, `sources`, `jobs_log`, `workout_logs`. Missing collections
⇒ the migrations did not copy; check `/opt/pocketbase/pb_migrations` and
`sudo systemctl restart pocketbase`.

⚠️ Confirm `/opt/pocketbase/pb_hooks/lib/` holds `xp.js`, `entitle.js`,
`notify.js`. Hooks `require` them **at call time**, so a missing `lib/` boots
clean and then throws on the first quiz/XP/pay request.

### 2.5 Google config (it does not travel with the code)

PB config lives in PB's own database, so the new box starts with OAuth2 off.

1. Google Cloud Console → **Credentials** → the existing OAuth client →
   **Authorized redirect URIs → + ADD** →
   `https://upscvidya.duckdns.org/api/oauth2-redirect`. **Append**, never
   replace — deleting the `127.0.0.1` entry breaks local login.
2. `https://upscvidya.duckdns.org/_/` → `users` → ⚙ Options → OAuth2 → enable →
   **+ Google** → paste ID and secret **copied in one sitting from the same
   client's page**.

Re-read the Step 1 gotchas: a mismatched ID/secret pair gives `invalid_client`,
and PB masks the stored secret so the config screen looks identical either way —
diagnose from `/api/logs`.

### 2.6 Server-only environment

`sudo systemctl edit pocketbase` (or the unit's `Environment=` lines): one AI key
for `/api/ca/compose` (`OPENROUTER_API_KEY` or `GROQ_API_KEY`), plus
`ONESIGNAL_APP_ID` / `ONESIGNAL_REST_KEY` if push is wanted. Restart after.
**Razorpay stays unset all beta.** Never in the client bundle.

### 2.7 Push the content

```bash
# .env (local, gitignored)
PB_URL_PROD=https://upscvidya.duckdns.org
PB_ADMIN_EMAIL=<superuser>
PB_ADMIN_PASSWORD=<superuser password>

pnpm validate
pnpm sync -- --env prod            # lands everything as draft
pnpm promote -- --env prod --all --dry-run
pnpm promote -- --env prod --all   # draft → live; users can now see it
```

Sync publishes nothing on its own. Expect **8 topics / 416 questions**
(POL-01 50, 02 70, 03 45, 04 70, 05 50, 06 100, 10 10, 19 10; CAPF-2023 5,
CAPF-2024 6). Verify:
`https://upscvidya.duckdns.org/api/collections/topics_public/records`
returns 8 rows with non-zero `live_questions`.

### 2.8 Wire CI

GitHub → Settings → Secrets → Actions: `PB_URL` = `https://upscvidya.duckdns.org`,
`PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD`. `content-sync.yml` then syncs on every
push touching `content/**`. It has been failing until now because no prod
existed. Promote stays manual — that is the review gate.

### 2.9 Deferred to step 2b

`PUBLIC_PB_URL` on Cloudflare Pages and the CORS lockdown both need the Pages
origin, which does not exist yet. R2 backup keys (`/etc/rclone-r2.conf`) and the
admin-UI IP allowlist in the Caddyfile are Prompt 17 hardening.

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
   `PUBLIC_PB_URL=https://upscvidya.duckdns.org`, `PUBLIC_DEV_BYPASS_AUTH=false`,
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
  with the DuckDNS API URL set before trusting the Pages build.

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
