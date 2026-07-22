/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — quiz_sessions collection (build book Prompt 07).
 *
 * A server-side quiz session holds the composed question set with per-question
 * shuffled option order, so the client is never sent answer_index and a refresh
 * mid-quiz resumes exactly (session_id lives in the player URL). All writes go
 * through the /api/quiz/* hooks running as superuser; clients may only READ
 * their own sessions.
 *
 * items[] shape (json):
 *   { qid, stem, format, tier,
 *     opts:  [option texts in DISPLAY order],
 *     map:   [original option index for each display slot],  // verification
 *     chosen: null | display index,
 *     correct: null | boolean,
 *     ms: null | number,
 *     flagged: boolean }
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const topics = app.findCollectionByNameOrId("topics");

    const sessions = new Collection({
      type: "base",
      name: "quiz_sessions",
      fields: [
        { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "topic", required: false, collectionId: topics.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "code", required: true }, // POL-05 / APX-1
        { type: "select", name: "kind", maxSelect: 1, required: true, values: ["topic_quiz", "drill"] },
        { type: "json", name: "items", maxSize: 200000 },
        { type: "select", name: "status", maxSelect: 1, required: true, values: ["active", "finished"] },
        { type: "number", name: "score_pct", onlyInt: true, min: 0, max: 100 },
        { type: "number", name: "correct_count", onlyInt: true, min: 0 },
        { type: "number", name: "total", onlyInt: true, min: 0 },
        { type: "autodate", name: "started", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      // clients read their own sessions; only the hooks (superuser) write
      listRule: 'user = @request.auth.id',
      viewRule: 'user = @request.auth.id',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      indexes: [
        "CREATE INDEX idx_qs_user_status ON quiz_sessions (user, status)",
      ],
    });
    app.save(sessions);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("quiz_sessions"));
    } catch (_) {
      /* absent */
    }
  }
);
