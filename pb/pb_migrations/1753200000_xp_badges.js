/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — progression storage (build book Prompt 09).
 *
 * badges: earned decorations. Server-granted only; clients read their own.
 *   Codes: first_conquest, region_<code> ×8, streak_7/30/100, pet_ready,
 *   mock_finisher, beta_founder (later prompts award the last three).
 *
 * xp_events: append-only XP ledger written by the awardXP helper. Powers the
 *   dashboard's weekly sparkline and the Prompt 10 weekly leaderboards.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const badges = new Collection({
      type: "base",
      name: "badges",
      fields: [
        { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "code", required: true },
        { type: "autodate", name: "earned_at", onCreate: true },
      ],
      listRule: 'user = @request.auth.id',
      viewRule: 'user = @request.auth.id',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      indexes: ["CREATE UNIQUE INDEX idx_badges_user_code ON badges (user, code)"],
    });
    app.save(badges);

    const xpEvents = new Collection({
      type: "base",
      name: "xp_events",
      fields: [
        { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: "number", name: "amount", onlyInt: true, required: true },
        { type: "text", name: "reason", required: true }, // quiz_answers / conquered / gold / region / drill / sr_review / ...
        { type: "autodate", name: "created", onCreate: true },
      ],
      listRule: 'user = @request.auth.id',
      viewRule: 'user = @request.auth.id',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      indexes: ["CREATE INDEX idx_xp_user_created ON xp_events (user, created)"],
    });
    app.save(xpEvents);
  },
  (app) => {
    for (const n of ["xp_events", "badges"]) {
      try {
        app.delete(app.findCollectionByNameOrId(n));
      } catch (_) {
        /* absent */
      }
    }
  }
);
