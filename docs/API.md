# API reference — UPSCVidya

> Every network surface the app talks to, in one place. Keep it current: when
> you add or change a `routerAdd(...)` in `pb/pb_hooks/*`, a collection rule, or
> a cron, update the matching row here in the same commit.

Two kinds of surface:

1. **Custom endpoints** — JS route handlers in `pb/pb_hooks/*.pb.js`, mounted at
   `{PUBLIC_PB_URL}/api/...`. All are `POST` with a JSON body/response unless
   noted. They run as PocketBase superuser, so collection rules are bypassed
   inside them — which is exactly why anything cheatable (XP, scores,
   entitlements, answers, prices, timers) lives here, never on the client.
2. **PocketBase built-in REST** — the standard collection/auth API the client
   uses directly for reads/writes that ARE safe to gate with collection rules.

Auth: send the PocketBase token as the `Authorization` header. "admin" =
`users.role == "admin"` (returns `403` otherwise). "public" = works logged out.

---

## 1. END-USER — study engine (auth required)

### Quiz — `pb/pb_hooks/quiz.pb.js`
| Method · Path | Body | Purpose |
|---|---|---|
| POST `/api/quiz/start` | `{code}` | Compose a 12-Q topic quiz / 15-Q drill (30-40-30 tier weighting, prefers least-attempted-by-this-user); reuses an active session so a refresh resumes. Returns options in a server-shuffled order — `answer_index` never leaves the server. |
| POST `/api/quiz/state` | `{session_id}` | Resume payload; reveals the correct index only for already-answered questions. |
| POST `/api/quiz/answer` | `{session_id, qid, choice, ms}` | Verify one answer, record an `attempts` row, bump question stats, return correct display index + explanation. |
| POST `/api/quiz/flag` | `{session_id, qid, flagged}` | Persist a review flag. |
| POST `/api/quiz/finish` | `{session_id}` | Score; ≥70% conquered / ≥90% 2nd-pass-all-tiers gold (never downgrades); enqueue wrongs to `sr_cards`; award XP + streak; grant referral credit on the referred user's first finish. |

### Spaced repetition — `pb/pb_hooks/sr.pb.js`
| POST `/api/sr/due` | `{}` | Due batch (cap 60/day, overdue-then-ease order), 7-day forecast, decaying-topic warnings. No answers in the payload. |
| POST `/api/sr/reveal` | `{card_id}` | Answer + explanation for one owned card. |
| POST `/api/sr/grade` | `{card_id, grade}` | SM-2 reschedule (`again·good·easy·mastered`) + review XP (8, or 12 if ever lapsed). |
| POST `/api/sr/restore` | `{code}` | 5-Q restore micro-quiz from a decaying topic's most-missed questions (routes through the quiz engine). |

### Test centre — `pb/pb_hooks/test.pb.js`
| POST `/api/test/catalogue` | `{}` | Live mocks (with `locked` per entitlement) + the user's attempt history. |
| POST `/api/test/sectional` | `{regions, tiers, count}` | Compose a sectional (free tier: 1 per IST month, else `premium_required`). |
| POST `/api/test/start` | `{test_id}` | Start/resume a mock (entitlement-checked; composes from pool if `question_ids` is null). |
| POST `/api/test/state` | `{attempt_id}` | Resume payload; **no** `answer_index`/`explanation` (exam conditions); remaining time from the server clock. |
| POST `/api/test/submit` | `{attempt_id}` | CAPF marking, percentile (recomputed vs all attempts), region/tier accuracy, full review. |

### Daily Briefing — `pb/pb_hooks/ca.pb.js`
| POST `/api/ca/briefing` | `{date}` | A day's published items + per-item mini-quiz. Free = today+yesterday; older dates return `{locked:true}` with **no items**. |
| POST `/api/ca/answer` | `{qid, choice, ms}` | Mini-quiz check; a miss feeds the revision stack. |
| POST `/api/ca/complete` | `{}` | 30 XP once per IST day + streak. |

### Monthly Current Affairs — `pb/pb_hooks/ca_extra.pb.js`
| POST `/api/ca/monthly-index` | `{}` | Months (YYYY-MM) that have published CA MCQs, with live-question + attempted counts; current IST month flagged. |
| POST `/api/ca/monthly-start` | `{month}` | Union every live CA MCQ published that month into a reusable practice test (+1/correct, no negative, 2-min/Q). Current month free; older months premium. |

### Battalion — `pb/pb_hooks/board.pb.js`
| POST `/api/board` | `{}` | This week's cohort standings assembled server-side. Emits only display_name (or "Anonymous Cadet"), rank_code, streak, xp_week, and each aspirant's ≤5 featured badge codes — never emails or user ids. Anonymous users' name AND badges are masked to other viewers. |

---

## 2. PUBLIC — no login (acquisition funnel)

### PYQ Vault — `pb/pb_hooks/pyq.pb.js` (deliberately unauthenticated; scoped to `source_type='pyq' && status='live'`)
| POST `/api/pyq/index` | `{}` | Years + topic breakdown (+ per-user progress if a token is attached). |
| POST `/api/pyq/paper` | `{year?, topic?}` | A paper's questions — **no** `answer_index`/`explanation`. |
| POST `/api/pyq/check` | `{qid, choice, ms}` | Reveal verdict + explanation for one Q; records the attempt + feeds SR when logged in. |
| POST `/api/pyq/attempt-paper` | `{year}` | Whole paper as a test via the test engine (**login required**). |

### Referral — `pb/pb_hooks/referral.pb.js`
| **GET** `/api/referral/{code}` | — | Resolve a referral code → referrer user id (powers the `/r/CODE` landing; clients can't list users). |

---

## 3. ADMIN — content & validation (`role=admin`)

### CA queue + content — `pb/pb_hooks/ca.pb.js` + `pb/pb_hooks/ca_extra.pb.js`
| POST `/api/ca/compose` | `{date?, raw?, items?}` | **Manual ingestion.** Paste raw notes → with `GROQ_API_KEY` the model drafts briefs (60-90w) + 2-3 MCQs each, tagged to POL topics, inserted as `draft`. No key → `422 {need_key}`; or POST a structured `items` array to hand-author. Nothing skips approval. |
| POST `/api/ca/queue` | `{}` | Pending CA drafts (+ their draft MCQs) and standalone draft MCQs, with dupe flags. |
| POST `/api/ca/approve` | `{id, with_quiz?, headline?, summary?, linked_topics?}` | Publish a CA item + its questions **atomically** (`runInTransaction`); stamps reviewer; schedules 07:00 next day if approved after 20:00 IST. |
| POST `/api/ca/reject` | `{id}` or `{question_id}` | Reject a CA item / retire a draft MCQ. |
| POST `/api/ca/publish-question` | `{question_id, stem?, options?, answer_index?, explanation?}` | Edit + flip one draft MCQ live. |
| POST `/api/ca/batch` | `{ids, min_confidence?}` | Batch-approve low-risk items only (confidence ≥ 0.92). |

### Push testing — `pb/pb_hooks/notify.pb.js`
| POST `/api/notify/preview` | `{type}` | Dry-run: who would receive this notification type. |
| POST `/api/notify/test` | `{type}` | Send a real test push to the caller. |

---

## 4. PAYMENTS — `pb/pb_hooks/pay.pb.js`
| POST `/api/pay/order` | `{plan}` | Create a Razorpay order; price is **server-computed** (beta founders get 50%). | user |
| POST `/api/pay/verify` | `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` | Verify signature → grant premium; idempotent via the `payments` ledger. | user |
| POST `/api/pay/webhook` | Razorpay event | Server-to-server confirmation. HMAC-verified (no user token); replay-safe (no double-extend). | Razorpay |
| POST `/api/pay/restore` | `{}` | Re-check / restore an active purchase. | user |

Dev/e2e: set `PAY_SIMULATE=1` (no Razorpay keys) to run the flow offline.

---

## 5. PocketBase built-in REST (client-direct)

Base `{PUBLIC_PB_URL}/api/`. Used where a collection rule is enough.

**Auth (`users`):** `POST /collections/users/auth-with-password`,
`POST /collections/users/auth-refresh`, OAuth2 (Google),
`POST /collections/users/request-password-reset` (+ confirm),
`POST /collections/users/records` (signup — create hook sets defaults).

**Self-update:** `PATCH /collections/users/records/{id}` — own record only, and
only unguarded fields (`pt_weekly_goal`, `notification_prefs`, `anonymous`,
`analytics_minimal`, `tour_done`). `xp` / `is_premium` / `premium_*` / `role` /
`rank_code` / `streak_*` / `battalion_id` / `referral_*` are **rule-blocked**.

**Reads (own-only unless noted):** `topics_public` (public list), `topics_teaser`
(public gated teaser), `topics` (entitled full read), `topic_progress`,
`badges`, `xp_events`, `payments`, `referral_credits`, `ca_items` (published
only, public).

**Test progress:** `POST` + `PATCH /collections/test_attempts/records` — create
and continuously save `answers`/`palette_state` mid-attempt; `score`,
`started_at`, `submitted_at`, `percentile` are server-owned (update rule blocks
them, and an `onRecordUpdateRequest` hook rejects writes past the deadline).

**Ops:** `GET /api/health` · admin dashboard at `/_/`.

---

## 6. Scheduled work (crons) + record hooks (no HTTP)

**Crons** — `pb/pb_hooks/cron.pb.js` (+ `pt.pb.js`, `notify.pb.js`):
| Job | When (IST) | Does |
|---|---|---|
| `topic_decay` | 02:30 daily | conquered + 21d idle → `decaying` |
| `leaderboard_rollover` | Mon 00:00 | snapshot podium/commendation badges, stamp new week |
| `freeze_refill` | 1st of month | streak freezes back to 2 |
| `premium_expiry` | nightly | clear `is_premium` once `premium_until` passes |
| notification crons ×4 | daily / weekly | daily briefing 07:00, streak-risk 20:30, SR pile-up, battalion Monday |

**Record hooks:** `users` onCreate (progression defaults, unique referral code,
battalion assignment); `test_attempts` onUpdateRequest (reject answer writes
after submit / past the timer).

---

## 7. Content pipeline (CLI + job — not HTTP)

- `pnpm validate` — validate `content/` against the schema.
- `pnpm sync -- --env dev` — upsert `content/` → PocketBase (idempotent; retires, never deletes).
- `pnpm ingest -- --topic POL-08 --source "external:<name>" --file input.txt` — MCQ ingestion CLI (Groq).
- `pnpm pyq:snapshot` — regenerate `src/lib/pyq-snapshot.json` for the prerendered PYQ landings.
- `pnpm repair:pyq -- --env prod [--apply]` — one-off repair for the old sync unit-filter bug that retired every `source_type="pyq"` question. Dry run unless `--apply`. Only un-retires PYQ questions that still exist in `content/pyq/`, restoring the status the repo declares; a PYQ retired in PB with no repo counterpart is reported and left alone. Sync never downgrades status, so this damage cannot self-heal.
- **CA RSS job** — `infra/jobs/ca-pipeline/index.js`, cron 05:30 + 17:30 IST on the VPS (PIB + national feeds → dedup → Groq/heuristic draft → `draft` ca_items). Same output as the in-app `/api/ca/compose`.

---

*Totals: 37 custom `/api/*` routes across 11 hook files. Last updated at repo
commit 8f8ff1b.*
