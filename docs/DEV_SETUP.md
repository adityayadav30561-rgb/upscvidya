# Dev Setup — bringing this repo up on a new machine

> Written for a handover: the folder (or the GitHub clone) arrives on a new
> system and has to reach "`pnpm dev` works, I can log in, chapters are visible".
> Read `CLAUDE.md` §0 first for how to work in this repo; this file is only about
> getting it to run.

## 0. What git does NOT carry

This is the whole reason this file exists. Four things are deliberately
untracked, and the repo is inert without them:

| Missing | Why | Fix |
|---|---|---|
| **`.env`** | holds 5 live AI keys + PB admin credentials | §2 — copy it across out of band |
| **`pb/pocketbase.exe`** (or `pb/pocketbase`) | a platform-specific binary | §3 — download v0.39.7 |
| **`pb/pb_data/`** | the local SQLite database: dev users, synced content, and **PocketBase's own config including the Google OAuth secret** | §4–§6 — rebuilt, not copied |
| `node_modules/`, `/build`, `/.svelte-kit` | generated | `pnpm install` |

Everything else — migrations, hooks, `pb/seed/`, content, `.mcp.json`, CI
workflow — is tracked and arrives with the clone.

**If you are copying the folder directly** (USB, zip, sync) rather than cloning:
`.env` comes along, which saves §2 — but `pb_data/` and the binary come too, and
on a different OS the binary will not run. Delete `pb/pocketbase.exe` and
re-download for the new platform. `pb_data/` is portable across platforms (plain
SQLite), so a direct copy also carries your dev content and OAuth config, and
you can skip §4–§6 entirely. Confirm with `pb/pocketbase --version` → 0.39.7.

## 1. Toolchain

Verified working on **Node v24.14.0** and **pnpm 10.33.2**. Nothing is pinned in
`package.json`, so any current Node 22+/pnpm 10 should be fine.

```bash
node -v && pnpm -v          # pnpm via: corepack enable
git clone <repo> upscvidya && cd upscvidya
pnpm install
```

## 2. `.env`

Start from the template, then fill in the real values:

```bash
cp .env.example .env
```

**Copy the secrets from the old machine's `.env` out of band** — not through git,
not pasted into a chat, not into a commit. The keys that must be present:

- `PUBLIC_PB_URL=http://127.0.0.1:8090`, `PUBLIC_DEV_BYPASS_AUTH=false`
- `OPENROUTER_API_KEY` · `GEMINI_API_KEY` · `MISTRAL_API_KEY` ·
  `OPENCODE_API_KEY` · `GROQ_API_KEY` (+ the matching `*_MODEL` values)
- `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` — used by `pnpm sync` and `pnpm promote`
- `PUBLIC_ONESIGNAL_APP_ID`, `PUBLIC_POSTHOG_KEY`, `PUBLIC_POSTHOG_HOST` — may be
  **empty**, but the lines must exist: anything imported from
  `$env/static/public` fails the build if the variable is absent.

Without the AI keys everything still runs; only `pnpm ingest` and the CA
pipeline degrade. Without `PB_ADMIN_*`, sync and promote refuse to start.

## 3. PocketBase binary — v0.39.7, pinned

```bash
# from https://github.com/pocketbase/pocketbase/releases/tag/v0.39.7
# pick your platform: windows_amd64 / linux_amd64 / darwin_arm64 …
# unzip the `pocketbase` binary into pb/
pb/pocketbase --version     # must print 0.39.7
```

**Do not take "latest".** The `pb_hooks` are written against this JSVM surface,
and a newer PB fails at first request rather than at boot — see `DECISIONS.md`
→ PocketBase hooks.

## 4. First boot — schema

```bash
cd pb && ./pocketbase serve --http=127.0.0.1:8090
```

The 15 tracked migrations apply automatically on boot and rebuild the whole
schema. Open <http://127.0.0.1:8090/_/> and **create the superuser using the
exact `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` from `.env`** — sync and promote
authenticate with those.

Verify the collection list: `users topics questions attempts topic_progress
sr_cards tests test_attempts ca_items battalions leaderboard_entries pet_logs
payments referral_credits` plus `topics_public`, `topics_teaser`,
`quiz_sessions`, `badges`, `xp_events`, `sources`, `jobs_log`, `workout_logs`.

## 5. Content into the fresh database

```bash
pnpm validate                       # expect 8 topics, 2 PYQ papers, 416 questions
pnpm sync -- --env dev              # imports as draft — still invisible
pnpm promote -- --env dev --all     # draft → live
```

`pnpm sync` publishes nothing on its own; forgetting `promote` is the usual
reason a freshly-set-up machine shows an empty map. PB must be running.

## 6. Google login on the new machine

PocketBase's OAuth config lives in `pb_data/`, so a rebuilt database has OAuth2
**off**. Re-enter it — no code and **no Google Cloud Console change**:

Admin UI → Collections → `users` → ⚙ Options → OAuth2 → enable → **+ Google** →
paste the Client ID and secret **copied together from one client's page** in
Google Cloud Console.

The redirect URI is unchanged (`http://127.0.0.1:8090/api/oauth2-redirect`) and
is already registered, because it is derived from `PUBLIC_PB_URL` and every dev
machine uses the same localhost value. Re-read `docs/BETA_SETUP.md` §1 gotchas
before debugging anything here: PB masks the stored secret, so a mismatched
ID/secret pair looks identical to a correct one — diagnose from `/api/logs`.

The old dev account `reader-test@local.dev` does **not** exist in a fresh
`pb_data/`. Sign up again, through Google or email.

## 7. Verify the whole thing

```bash
pnpm check      # expect 525 files, 0 errors
pnpm test       # vitest
pnpm build      # static build, must be zero-error
pnpm dev        # → http://localhost:5173
```

Then in the browser: log in → the territory map shows held/unheld chapters →
open POL-01 → the reader pages horizontally → start its quiz and see a real
question count (from `live_questions`, never `mcq_floor`).

⚠️ A freshly-created user has `tour_done=false`, so the Ustad walkthrough will
navigate you away from whatever route you are testing. Set
`localStorage['tour-seen']='1'` to suppress it.

## 8. Browser verification (Chrome DevTools MCP)

`.mcp.json` is tracked and project-scoped, so the MCP server config arrives with
the clone; the new machine only needs Chrome installed and the server approved
on first use. It runs `--isolated` (fresh profile), so `(app)` routes need a
login each run, and `emulate` — not `resize_page` — is what gives true mobile
metrics.

## 9. Nothing to redo on the hosting side

There is no deployed backend yet, so a handover breaks nothing there. Step 2
(Oracle VPS) is blocked on a payment card, not on this machine — see
`docs/CURRENT_STATE.md`. When it happens, `PB_URL_PROD` goes in `.env` and the
Oracle runbook is `docs/BETA_SETUP.md` §2.1–2.9.
