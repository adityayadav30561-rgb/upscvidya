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

The table above is the **clone** case. A zipped folder carries the untracked
files too — see below.

### Two routes in

**Route A — clone from GitHub.** Everything tracked arrives; §2–§6 rebuild the
rest by hand.

**Route B — a zip of the working folder.** `.env` *and* `pb_data/` travel, so
§2 and §4–§6 all collapse to "unzip, `pnpm install`, run". Your dev content,
your superuser and the Google OAuth config come with it. Three conditions:

1. **Stop PocketBase before zipping.** SQLite runs in WAL mode, so a copy taken
   mid-write can arrive inconsistent — and `pb_data/` is the one thing in the
   bundle that cannot be regenerated.
2. **Exclude `node_modules/`** (and `.svelte-kit`, `build`, `test-results`,
   `playwright-report`). It is ~200 MB of the ~259 MB total and holds
   platform-compiled binaries; `pnpm install` rebuilds it correctly. Excluding
   them gives a ~59 MB zip.
3. **On a different OS, the binary is wrong.** Delete `pb/pocketbase.exe` and
   re-download for the new platform (§3). `pb_data/` itself is portable — it is
   plain SQLite. Confirm with `pb/pocketbase --version` → 0.39.7.

```powershell
# Windows, PocketBase stopped:
$src="c:\path\to\upscvidya"; $stage="$env:TEMP\upscvidya-handover"
robocopy $src $stage /E /XD node_modules .svelte-kit build test-results playwright-report /NFL /NDL /NJH /NJS
Compress-Archive -Path "$stage\*" -DestinationPath "$env:USERPROFILE\Desktop\upscvidya-handover.zip" -Force
Remove-Item $stage -Recurse -Force
```

`robocopy` exits 1–7 on success; that is not an error. `.git` is included, so
history and the remote come along.

> ⚠️ **That zip is a secrets bundle.** It contains `.env` (5 live AI keys, the PB
> admin password) and `pb_data/`, which stores **PocketBase's Google OAuth client
> secret**. Move it over USB, an encrypted drive or a direct transfer — never
> email, a public share link, or a chat upload — and delete both copies once the
> new machine is running. If it does leak: rotate the five AI keys and reset the
> Google OAuth client secret in Cloud Console.

After a Route B unzip, the whole of §2 and §4–§6 is already done. Skip to
`pnpm install`, then §7 to verify.

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
