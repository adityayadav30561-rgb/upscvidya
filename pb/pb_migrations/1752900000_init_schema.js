/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — initial schema (build book Prompt 00-B).
 * 14 collections + API rules + indexes.
 *
 * notes_md gating strategy (documented in pb/SCHEMA.md):
 *   - `topics` collection itself is entitlement-gated (view rule checks
 *     is_free / auth premium / admin), so notes_md never leaks to free users.
 *   - `topics_public` is a VIEW collection exposing every field EXCEPT
 *     notes_md for status=live topics — the map and topic lists read this.
 */
migrate(
  (app) => {
    const AUTH_USERS = app.findCollectionByNameOrId("users");

    // ------------------------------------------------------------- battalions
    const battalions = new Collection({
      type: "base",
      name: "battalions",
      fields: [
        { type: "text", name: "name", required: true },
        { type: "date", name: "week_start" },
        { type: "number", name: "member_count", onlyInt: true, min: 0 },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    app.save(battalions);

    // ----------------------------------------------------------------- topics
    const topics = new Collection({
      type: "base",
      name: "topics",
      fields: [
        { type: "text", name: "id_code", required: true }, // POL-01..POL-95, APX-1..APX-9
        { type: "text", name: "title", required: true },
        { type: "number", name: "part_no", onlyInt: true },
        {
          type: "select", name: "region", maxSelect: 1, required: true,
          values: ["foundations", "system", "centre", "states", "grassroots", "institutions", "dynamics", "courtroom"],
        },
        { type: "select", name: "kind", maxSelect: 1, required: true, values: ["chapter", "appendix"] },
        { type: "text", name: "book_ref" },
        { type: "number", name: "mcq_floor", onlyInt: true, min: 0 },
        { type: "json", name: "tags", maxSize: 5000 },
        { type: "number", name: "guided_order", onlyInt: true },
        { type: "number", name: "est_read_minutes", onlyInt: true },
        { type: "json", name: "prerequisites", maxSize: 5000 }, // array of id_codes
        { type: "editor", name: "notes_md" },                   // 500-700 word notes (markdown)
        { type: "select", name: "status", maxSelect: 1, required: true, values: ["draft", "live"] },
        { type: "bool", name: "is_free" },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_topics_id_code ON topics (id_code)"],
      // entitled full read (incl. notes_md); public metadata goes via topics_public
      listRule: 'status = "live" && (is_free = true || @request.auth.is_premium = true || @request.auth.role = "admin")',
      viewRule: 'status = "live" && (is_free = true || @request.auth.is_premium = true || @request.auth.role = "admin")',
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    app.save(topics);

    // -------------------------------------------------------------- questions
    const questions = new Collection({
      type: "base",
      name: "questions",
      fields: [
        { type: "text", name: "qid", required: true }, // POL-08-Q042
        {
          type: "relation", name: "topic", required: true,
          collectionId: topics.id, maxSelect: 1, cascadeDelete: false,
        },
        { type: "text", name: "stem", required: true },
        { type: "json", name: "options", required: true, maxSize: 10000 }, // array of 4
        { type: "number", name: "answer_index", onlyInt: true, min: 0, max: 3 },
        { type: "text", name: "explanation" },
        { type: "number", name: "tier", onlyInt: true, min: 1, max: 5 },
        {
          type: "select", name: "format", maxSelect: 1,
          values: ["single-factual", "statement-based", "match-pairs", "assertion-reason", "chronology", "odd-one-out", "fill-appropriate"],
        },
        { type: "json", name: "exams", maxSize: 1000 }, // ["capf","cse"]
        { type: "select", name: "source_type", maxSelect: 1, values: ["ai", "self", "external", "pyq", "ca"] },
        { type: "json", name: "source_meta", maxSize: 5000 },
        { type: "select", name: "status", maxSelect: 1, required: true, values: ["draft", "validated", "live", "retired"] },
        { type: "number", name: "attempts_count", onlyInt: true, min: 0 },
        { type: "number", name: "correct_count", onlyInt: true, min: 0 },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_questions_qid ON questions (qid)",
        "CREATE INDEX idx_questions_topic_status ON questions (topic, status)",
      ],
      // NEVER bulk-listable by clients — quiz delivery is via custom endpoints
      // (Prompt 07) that strip answer_index. Admin role only here.
      listRule: '@request.auth.role = "admin"',
      viewRule: '@request.auth.role = "admin"',
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    app.save(questions);

    // ----------------------------------------------------- users (extend auth)
    const userFields = [
      { type: "text", name: "display_name" },
      { type: "text", name: "avatar_seed" },
      { type: "select", name: "exam", maxSelect: 1, values: ["capf"] },
      { type: "number", name: "target_year", onlyInt: true },
      { type: "number", name: "daily_minutes", onlyInt: true },
      { type: "number", name: "xp", onlyInt: true, min: 0 },
      {
        type: "select", name: "rank_code", maxSelect: 1,
        values: ["cadet", "constable", "head_constable", "asi", "si", "inspector", "ac", "dc", "commandant", "dg"],
      },
      { type: "number", name: "streak_current", onlyInt: true, min: 0 },
      { type: "number", name: "streak_best", onlyInt: true, min: 0 },
      { type: "number", name: "streak_freezes", onlyInt: true, min: 0 },
      { type: "date", name: "last_active_date" },
      {
        type: "relation", name: "battalion_id",
        collectionId: battalions.id, maxSelect: 1, cascadeDelete: false,
      },
      { type: "bool", name: "is_premium" },
      { type: "date", name: "premium_until" },
      { type: "select", name: "premium_plan", maxSelect: 1, values: ["monthly", "till_exam"] },
      { type: "text", name: "referral_code" },
      {
        type: "relation", name: "referred_by",
        collectionId: AUTH_USERS.id, maxSelect: 1, cascadeDelete: false,
      },
      { type: "select", name: "role", maxSelect: 1, values: ["user", "admin"] },
    ];
    for (const f of userFields) AUTH_USERS.fields.add(new Field(f));
    AUTH_USERS.addIndex("idx_users_referral_code", true, "referral_code", "referral_code != ''");
    // own-record access; server hooks own the progression fields.
    // Self-update cannot touch protected fields (XP, premium, role, streaks...).
    AUTH_USERS.listRule = "id = @request.auth.id";
    AUTH_USERS.viewRule = "id = @request.auth.id";
    AUTH_USERS.updateRule =
      "id = @request.auth.id" +
      " && @request.body.xp:isset = false" +
      " && @request.body.rank_code:isset = false" +
      " && @request.body.is_premium:isset = false" +
      " && @request.body.premium_until:isset = false" +
      " && @request.body.premium_plan:isset = false" +
      " && @request.body.role:isset = false" +
      " && @request.body.streak_current:isset = false" +
      " && @request.body.streak_best:isset = false" +
      " && @request.body.streak_freezes:isset = false" +
      " && @request.body.referral_code:isset = false" +
      " && @request.body.referred_by:isset = false" +
      " && @request.body.battalion_id:isset = false";
    app.save(AUTH_USERS);

    // ------------------------------------------------------- topics_public view
    // Everything except notes_md, live topics only. Public read (map, lists).
    const topicsPublic = new Collection({
      type: "view",
      name: "topics_public",
      viewQuery:
        "SELECT id, id_code, title, part_no, region, kind, book_ref, mcq_floor, " +
        "tags, guided_order, est_read_minutes, prerequisites, status, is_free " +
        "FROM topics WHERE status = 'live'",
      listRule: "",
      viewRule: "",
    });
    app.save(topicsPublic);

    // --------------------------------------------------------------- attempts
    const attempts = new Collection({
      type: "base",
      name: "attempts",
      fields: [
        { type: "relation", name: "user", required: true, collectionId: AUTH_USERS.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "question", required: true, collectionId: questions.id, maxSelect: 1, cascadeDelete: false },
        { type: "relation", name: "topic", collectionId: topics.id, maxSelect: 1, cascadeDelete: false },
        {
          type: "select", name: "context", maxSelect: 1, required: true,
          values: ["topic_quiz", "sectional", "mock", "pyq", "daily_ca", "sr_review", "drill"],
        },
        { type: "number", name: "chosen_index", onlyInt: true, min: 0, max: 3 },
        { type: "bool", name: "is_correct" },
        { type: "number", name: "time_taken_ms", onlyInt: true, min: 0 },
        { type: "autodate", name: "attempted_at", onCreate: true },
      ],
      indexes: [
        "CREATE INDEX idx_attempts_user_question ON attempts (user, question)",
        "CREATE INDEX idx_attempts_user_attempted ON attempts (user, attempted_at)",
      ],
      // create/read own only; immutable once written
      listRule: 'user = @request.auth.id',
      viewRule: 'user = @request.auth.id',
      createRule: '@request.auth.id != "" && user = @request.auth.id',
      updateRule: null,
      deleteRule: null,
    });
    app.save(attempts);

    // --------------------------------------------------------- topic_progress
    const topicProgress = new Collection({
      type: "base",
      name: "topic_progress",
      fields: [
        { type: "relation", name: "user", required: true, collectionId: AUTH_USERS.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "topic", required: true, collectionId: topics.id, maxSelect: 1, cascadeDelete: false },
        {
          type: "select", name: "state", maxSelect: 1, required: true,
          values: ["unread", "read", "conquered", "gold", "decaying"],
        },
        { type: "number", name: "best_score_pct", min: 0, max: 100 },
        { type: "date", name: "last_activity" },
        { type: "number", name: "quiz_passes", onlyInt: true, min: 0 },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_topic_progress_pair ON topic_progress (user, topic)"],
      listRule: 'user = @request.auth.id',
      viewRule: 'user = @request.auth.id',
      // client may create/update reading state only; conquest states are
      // server-set (quiz finish endpoint, Prompt 07)
      createRule: '@request.auth.id != "" && user = @request.auth.id && (state = "unread" || state = "read")',
      updateRule: 'user = @request.auth.id && (@request.body.state:isset = false || state = "read")',
      deleteRule: null,
    });
    app.save(topicProgress);

    // --------------------------------------------------------------- sr_cards
    const srCards = new Collection({
      type: "base",
      name: "sr_cards",
      fields: [
        { type: "relation", name: "user", required: true, collectionId: AUTH_USERS.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "question", required: true, collectionId: questions.id, maxSelect: 1, cascadeDelete: false },
        { type: "number", name: "ease", min: 1.3 },
        { type: "number", name: "interval_days", onlyInt: true, min: 0 },
        { type: "number", name: "reps", onlyInt: true, min: 0 },
        { type: "date", name: "due_date" },
        { type: "number", name: "lapses", onlyInt: true, min: 0 },
        { type: "bool", name: "suspended" },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_sr_cards_pair ON sr_cards (user, question)",
        "CREATE INDEX idx_sr_cards_user_due ON sr_cards (user, due_date)",
      ],
      // read own; scheduling fields are server-owned (SR endpoints, Prompt 08)
      listRule: 'user = @request.auth.id',
      viewRule: 'user = @request.auth.id',
      createRule: '@request.auth.id != "" && user = @request.auth.id',
      updateRule: null,
      deleteRule: null,
    });
    app.save(srCards);

    // ------------------------------------------------------------------ tests
    const tests = new Collection({
      type: "base",
      name: "tests",
      fields: [
        { type: "text", name: "title", required: true },
        { type: "select", name: "kind", maxSelect: 1, required: true, values: ["sectional", "mock"] },
        { type: "json", name: "config", maxSize: 10000 }, // {regions,tiers,count,duration_sec,negative_mark}
        { type: "json", name: "question_ids", maxSize: 100000 }, // null for dynamic sectionals
        { type: "bool", name: "is_free" },
        { type: "select", name: "status", maxSelect: 1, required: true, values: ["draft", "live"] },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      listRule: 'status = "live" || @request.auth.role = "admin"',
      viewRule: 'status = "live" || @request.auth.role = "admin"',
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    app.save(tests);

    // ----------------------------------------------------------- test_attempts
    const testAttempts = new Collection({
      type: "base",
      name: "test_attempts",
      fields: [
        { type: "relation", name: "user", required: true, collectionId: AUTH_USERS.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "test", required: true, collectionId: tests.id, maxSelect: 1, cascadeDelete: false },
        { type: "date", name: "started_at" },
        { type: "date", name: "submitted_at" },
        { type: "json", name: "answers", maxSize: 100000 }, // qid → chosen index
        { type: "number", name: "score" },
        { type: "number", name: "max_score" },
        { type: "number", name: "percentile" },
        { type: "json", name: "palette_state", maxSize: 100000 },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_test_attempts_user ON test_attempts (user)"],
      listRule: 'user = @request.auth.id',
      viewRule: 'user = @request.auth.id',
      createRule: '@request.auth.id != "" && user = @request.auth.id',
      // client may persist answers/palette during the attempt; scoring fields
      // and identity are server-owned (submit endpoint, Prompt 11)
      updateRule:
        "user = @request.auth.id" +
        " && @request.body.user:isset = false" +
        " && @request.body.test:isset = false" +
        " && @request.body.score:isset = false" +
        " && @request.body.max_score:isset = false" +
        " && @request.body.percentile:isset = false" +
        " && @request.body.started_at:isset = false" +
        " && @request.body.submitted_at:isset = false",
      deleteRule: null,
    });
    app.save(testAttempts);

    // --------------------------------------------------------------- ca_items
    const caItems = new Collection({
      type: "base",
      name: "ca_items",
      fields: [
        { type: "date", name: "date", required: true },
        { type: "text", name: "headline", required: true },
        { type: "text", name: "summary" },
        { type: "text", name: "source_name" },
        { type: "url", name: "source_url" },
        { type: "json", name: "linked_topics", maxSize: 2000 }, // topic id_codes
        {
          type: "select", name: "status", maxSelect: 1, required: true,
          values: ["draft", "approved", "rejected", "published"],
        },
        { type: "json", name: "quiz_question_ids", maxSize: 5000 },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_ca_items_date_status ON ca_items (date, status)"],
      listRule: 'status = "published" || @request.auth.role = "admin"',
      viewRule: 'status = "published" || @request.auth.role = "admin"',
      createRule: null,
      updateRule: '@request.auth.role = "admin"',
      deleteRule: null,
    });
    app.save(caItems);

    // ---------------------------------------------------- leaderboard_entries
    const leaderboardEntries = new Collection({
      type: "base",
      name: "leaderboard_entries",
      fields: [
        { type: "relation", name: "battalion", required: true, collectionId: battalions.id, maxSelect: 1, cascadeDelete: false },
        { type: "relation", name: "user", required: true, collectionId: AUTH_USERS.id, maxSelect: 1, cascadeDelete: true },
        { type: "date", name: "week_start", required: true },
        { type: "number", name: "xp_week", onlyInt: true, min: 0 },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_leaderboard_user_week ON leaderboard_entries (user, week_start)",
        "CREATE INDEX idx_leaderboard_battalion_week ON leaderboard_entries (battalion, week_start)",
      ],
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: null, // maintained by the awardXP hook (Prompt 09)
      updateRule: null,
      deleteRule: null,
    });
    app.save(leaderboardEntries);

    // ---------------------------------------------------------------- pet_logs
    const petLogs = new Collection({
      type: "base",
      name: "pet_logs",
      fields: [
        { type: "relation", name: "user", required: true, collectionId: AUTH_USERS.id, maxSelect: 1, cascadeDelete: true },
        {
          type: "select", name: "event", maxSelect: 1, required: true,
          values: ["sprint_100m", "run_800m", "long_jump", "shot_put"],
        },
        { type: "number", name: "value", required: true, min: 0 }, // seconds or metres
        { type: "date", name: "logged_at", required: true },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_pet_logs_user_event ON pet_logs (user, event)"],
      listRule: 'user = @request.auth.id',
      viewRule: 'user = @request.auth.id',
      createRule: '@request.auth.id != "" && user = @request.auth.id',
      updateRule: 'user = @request.auth.id',
      deleteRule: 'user = @request.auth.id',
    });
    app.save(petLogs);

    // ---------------------------------------------------------------- payments
    const payments = new Collection({
      type: "base",
      name: "payments",
      fields: [
        { type: "relation", name: "user", required: true, collectionId: AUTH_USERS.id, maxSelect: 1, cascadeDelete: false },
        { type: "text", name: "razorpay_order_id" },
        { type: "text", name: "razorpay_payment_id" },
        { type: "number", name: "amount_inr" },
        { type: "select", name: "plan", maxSelect: 1, values: ["monthly", "till_exam"] },
        {
          type: "select", name: "status", maxSelect: 1, required: true,
          values: ["created", "paid", "failed", "refunded"],
        },
        { type: "json", name: "raw", maxSize: 50000 },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_payments_user ON payments (user)"],
      // read own; ALL writes server-side (payment hooks, Prompt 14)
      listRule: 'user = @request.auth.id',
      viewRule: 'user = @request.auth.id',
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    app.save(payments);

    // -------------------------------------------------------- referral_credits
    const referralCredits = new Collection({
      type: "base",
      name: "referral_credits",
      fields: [
        { type: "relation", name: "user", required: true, collectionId: AUTH_USERS.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "referred_user", required: true, collectionId: AUTH_USERS.id, maxSelect: 1, cascadeDelete: false },
        { type: "number", name: "days_granted", onlyInt: true, min: 0 },
        { type: "date", name: "granted_at" },
        { type: "autodate", name: "created", onCreate: true },
      ],
      indexes: ["CREATE INDEX idx_referral_credits_user ON referral_credits (user)"],
      listRule: 'user = @request.auth.id',
      viewRule: 'user = @request.auth.id',
      createRule: null, // granted server-side (Prompt 14)
      updateRule: null,
      deleteRule: null,
    });
    app.save(referralCredits);
  },
  (app) => {
    // rollback in reverse dependency order
    const names = [
      "referral_credits", "payments", "pet_logs", "leaderboard_entries",
      "ca_items", "test_attempts", "tests", "sr_cards", "topic_progress",
      "attempts", "topics_public", "questions", "topics", "battalions",
    ];
    for (const n of names) {
      try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) { /* absent */ }
    }
    // strip added user fields
    const users = app.findCollectionByNameOrId("users");
    const added = [
      "display_name", "avatar_seed", "exam", "target_year", "daily_minutes",
      "xp", "rank_code", "streak_current", "streak_best", "streak_freezes",
      "last_active_date", "battalion_id", "is_premium", "premium_until",
      "premium_plan", "referral_code", "referred_by", "role",
    ];
    for (const f of added) { try { users.fields.removeByName(f); } catch (_) {} }
    users.listRule = null;
    users.viewRule = null;
    users.updateRule = null;
    app.save(users);
  }
);
