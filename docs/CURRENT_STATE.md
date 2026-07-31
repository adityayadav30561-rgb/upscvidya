# Current State

> Session memory. Rewrite this at the end of every session. Keep <500 words.
> Read this FIRST on a new session (see CLAUDE.md §0). Don't scan the repo.

## Current goal

**Make the app installable on a phone.** Content authoring stays **paused** until
a stranger can open a URL, tap *Add to Home Screen*, and log in. Checklist and
step order: **[BETA_SETUP.md](BETA_SETUP.md)** — critical path 1 → 2 → 2b → 5 →
7 → 9. **Prompt 17 (deploy/QA) stays paused.**

## Completed

- Prompts 00–16 + FIELD DOSSIER + retrieval practice. See CLAUDE.md §2.
- **8 of 103 units authored** (POL-01…06, 10, 19), live in **dev only**.
- **Step 1 — Google login: DONE locally.** Two bugs, both now documented in
  BETA_SETUP §1 gotchas: (a) `redirect_uri_mismatch` — the SDK builds the URI
  from `PUBLIC_PB_URL` (`127.0.0.1`), not PB's `meta.appURL` (`localhost`);
  (b) `invalid_client` — ID and secret came from two different OAuth clients,
  visible only in PB's logs because the admin API masks the secret. A Google
  login for an existing email **links** to that account (`_externalAuths`) and
  keeps its XP/rank — wanted behaviour.
- **`pnpm promote` built** ([scripts/content/promote.js](../scripts/content/promote.js)) —
  the missing publish step. Sync lands everything `draft` (invisible); promote
  flips a topic + its questions to `live`. Forward-only: never resurrects
  `retired`, skips CA questions (admin queue), idempotent, warns on a 0-question
  pool. `--all`, `--topic A,B`, `--dry-run`, `--include-ca`.
- **Cloudflare Pages SPA fallback** ([static/_redirects](../static/_redirects)) —
  without it every deep link would 404 on Pages.
- Phase 0 pre-flight green: `pnpm check` 525 files 0 errors; build against a real
  HTTPS `PUBLIC_PB_URL` verified, no secret leaked into the public bundle.

## In progress

Nothing half-done in code.

## Next

1. **Step 2 — PocketHost** (full runbook now in BETA_SETUP §2): pin PB
   **0.39.7**, upload `pb_migrations/` + `pb_hooks/` (incl. `lib/`), restart,
   redo Google config, set `PB_URL_PROD`, `pnpm sync -- --env prod`, then
   `pnpm promote -- --env prod --all`, then add the CI secrets.
2. **Step 2b** — Cloudflare Pages; every `PUBLIC_*` var must exist or the build fails.
3. **Steps 5 / 7 / 9** — beta-free system, privacy + terms, install guide.
4. Only then **POL-07 (Citizenship, `mcq_floor` 30)**.

## Active files

- `docs/BETA_SETUP.md` (step 1 ticked, step 2 runbook written)
- `scripts/content/promote.js`

## Do NOT

- Author chapters until the app is installable. Explicit user call.
- Use the AI API chain to write notes or MCQs.
- Ship an MCQ bank without auditing tier + answer-position spread (§6).
- Put a server secret in a `PUBLIC_*` var, or commit a PB auto-migration
  containing OAuth credentials (check every `*_updated_users.js` before staging).
- Display `mcq_floor` as a question count — use `live_questions`.
- Commit `.env` — 5 live API keys.
- Scan the repo (use PROJECT_INDEX.md).

## Notes / gotchas

- **`pnpm sync` publishes nothing** — forgetting `pnpm promote` is the likeliest
  reason "I synced a chapter and users can't see it".
- Dev server: pin the port (`--port 5174 --strictPort`) — Vite silently drifts to
  the next free one, which breaks OAuth config. Vite v8 binds **IPv6**: use
  `localhost`, not `127.0.0.1`.
- PB must be **restarted** to load changed `pb_hooks` or new migrations.
- No "new version" toast; an open tab keeps stale JS after a deploy.
- Dev login `reader-test@local.dev` / `Testpass123!` — delete before beta.
- CI `content-sync.yml` fails until step 2 lands (no prod). Expected.
