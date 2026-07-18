# Content pipeline

Content lives in `/content/<subject>/<ID-CODE-slug>/`:

```
content/polity/POL-05-preamble/
  topic.md    # YAML frontmatter (id_code, title, part_no, region, kind, book_ref,
              # mcq_floor, tags, guided_order, est_read_minutes, prerequisites,
              # is_free) + markdown body = the topic notes
  mcqs.json   # array of questions per the provenance schema in
              # docs/polity-mvp-master.md (id, topic, stem, options[4], answer,
              # explanation, tier, format, exams, source{type,...}, status, added)
```

## Commands

| Command | What |
|---|---|
| `pnpm validate` | Schema-check every unit. Non-zero exit + `file:line` errors. |
| `pnpm sync -- --env dev` | Upsert to local PB (`PB_URL_DEV`, default `127.0.0.1:8090`) |
| `pnpm sync -- --env prod` | Upsert to prod PB (`PB_URL_PROD`) |

Credentials: `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` env vars.

## Sync rules

- Match on `id_code` (topics) / `qid` (questions); only changed fields are patched.
- **Status never downgrades** via sync: `draft < validated < live < retired`.
  A question flipped live in PB stays live even if the repo says validated.
  Consequence: a retired question cannot be revived by re-adding it to the
  repo — revival is a deliberate admin action in PB.
- Repo deletions → `status=retired` in PB. Never hard-deleted (attempt
  history references them). `ca`-sourced questions are exempt (they are born
  in PB by the CA pipeline, not in this repo).
- Topic `status` is not synced at all: new topics arrive as `draft`; flipping
  to `live` is an admin action in PB.

## CI

`.github/workflows/content-sync.yml`: push to `main` touching `content/**` →
validate → sync to prod. Requires repo secrets `PB_URL`, `PB_ADMIN_EMAIL`,
`PB_ADMIN_PASSWORD`.
