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
- **8 of 103 units authored** (POL-01…06, 10, 19) = **416 questions**, live in
  **dev only**. `pnpm promote` exists as the publish step.
- **Step 1 — Google login: DONE locally.** Both bugs documented in BETA_SETUP §1
  gotchas (`redirect_uri_mismatch` from `PUBLIC_PB_URL`; `invalid_client` from a
  mismatched ID/secret pair, visible only in PB's logs).
- **Hosting re-decided (this session).** PocketHost **dropped its free tier**
  ($9.99/mo · $59.99/yr · $149.99 lifetime per slot; an instance refuses to boot
  un-upgraded). Beta and launch now share **one** backend: **Oracle Always Free
  VPS (PAYG tenancy) + a free DuckDNS hostname** — still ₹0. `infra/setup.sh`
  already does the whole build and copies `pb_migrations`/`pb_hooks` **from the
  repo checkout**, so there is no file-upload step, just `git clone` on the box.
- **`infra/setup.sh` hardened for it:** `API_HOST` override (a DuckDNS name has
  no room for an `api.` prefix), `ARCH` override (`amd64` for the always-free AMD
  micro when ARM capacity fails), and **`PB_VERSION` pinned to v0.39.7** — it was
  resolving *latest*, which would have silently broken the hooks.
- BETA_SETUP §2 rewritten as the Oracle runbook (2.1–2.9). DECISIONS, CLAUDE-
  adjacent docs and `.env.example` re-pointed.
- Pre-flight green: local PB **0.39.7** · `pnpm validate` 8 topics / 2 PYQ papers
  / 416 questions · `pnpm check` 525 files 0 errors · `bash -n setup.sh` OK.

## In progress

Nothing half-done in code. Step 2 is blocked only on the Oracle signup.

## Next

1. **Step 2 — Oracle VPS**, runbook in BETA_SETUP §2.1–2.9: Oracle signup
   (Indian home region) + **PAYG upgrade** → `VM.Standard.A1.Flex` Ubuntu 24.04 →
   **VCN ingress 80/443** → DuckDNS `upscvidya` → `git clone` on the box →
   `sudo DOMAIN=upscvidya.duckdns.org API_HOST=upscvidya.duckdns.org
   ADMIN_SSH_KEY="…" bash infra/setup.sh` → superuser → Google OAuth (append the
   redirect URI) → `PB_URL_PROD` in `.env` → `pnpm sync -- --env prod` →
   `pnpm promote -- --env prod --all` → CI secrets.
2. **Step 2b** — Cloudflare Pages; every `PUBLIC_*` var must exist or the build fails.
3. **Steps 5 / 7 / 9** — beta-free system, privacy + terms, install guide.
4. Only then **POL-07 (Citizenship, `mcq_floor` 30)**.

## Active files

- `docs/BETA_SETUP.md` (§2 = the Oracle runbook)
- `infra/setup.sh`, `infra/Caddyfile`, `infra/SERVER.md`

## Do NOT

- Author chapters until the app is installable. Explicit user call.
- Use the AI API chain to write notes or MCQs.
- Ship an MCQ bank without auditing tier + answer-position spread (§6).
- Let `PB_VERSION` float to latest, or provision a non-"Always Free eligible"
  Oracle shape. An OCI **budget is an alert, not a cap**.
- Put a server secret in a `PUBLIC_*` var, or commit a PB auto-migration
  containing OAuth credentials (check every `*_updated_users.js` before staging).
- Display `mcq_floor` as a question count — use `live_questions`.
- Commit `.env` — 5 live API keys.
- Scan the repo (use PROJECT_INDEX.md).

## Notes / gotchas

- **`pnpm sync` publishes nothing** — forgetting `pnpm promote` is the likeliest
  reason "I synced a chapter and users can't see it".
- On Oracle, **ufw is not enough**: the VCN security list filters first, so 80/443
  must be opened there or Let's Encrypt's HTTP-01 challenge fails.
- `pb_hooks/lib/` (`xp.js`, `entitle.js`, `notify.js`) is `require`d **at call
  time** — a missing `lib/` boots clean and throws on the first quiz/XP/pay call.
- PB must be **restarted** to load changed `pb_hooks` or new migrations.
- No "new version" toast; an open tab keeps stale JS after a deploy.
- Dev login `reader-test@local.dev` / `Testpass123!` — delete before beta.
- CI `content-sync.yml` fails until step 2 lands (no prod). Expected.
