# Beta Setup — running checklist

> Everything between "the app is built" and "a stranger can use it".
> Tick items as they land. Beta hosting = **PocketHost** (free, hosted, runs
> without your machine); Oracle Always Free VPS is the launch destination.
> Distribution = **URL + install guide** (PWA). APK (TWA, self-hosted download,
> not Play Store) comes later.

| # | Step | State |
|---|---|---|
| 1 | Google login | ⬅️ **in progress** |
| 2 | PocketHost deploy | ⬜ |
| 3 | API keys — Groq · PostHog · OneSignal | ⬜ |
| 4 | Notifications verified | ⬜ |
| 5 | Beta-free system (`beta_free_until` + founder badge + banner) | ⬜ |
| 6 | Content | ⬜ |
| 7 | Privacy policy + terms pages | ⬜ |
| 8 | Feedback sheet + beta ribbon + remote config | ⬜ |
| 9 | Install guide (Android + iOS) | ⬜ |

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

## Step 3 — API keys (not started)

| Key | For | Free tier |
|---|---|---|
| `GROQ_API_KEY` | `pnpm ingest` — notes → draft MCQs; CA pipeline drafting | console.groq.com |
| `PUBLIC_POSTHOG_KEY` / `_HOST` | funnel analytics (already wired) | posthog.com |
| `PUBLIC_ONESIGNAL_APP_ID` + `ONESIGNAL_APP_ID` / `ONESIGNAL_REST_KEY` | web push | onesignal.com |

Server-only keys (`ONESIGNAL_REST_KEY`, Groq for the CA hook) go in the
**PocketBase** environment, not the client bundle. All unset ⇒ no-op, so the app
runs fine without them.

Razorpay stays **unset** for the whole beta — beta is free.
