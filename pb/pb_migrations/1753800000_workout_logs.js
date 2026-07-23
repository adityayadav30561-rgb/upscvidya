/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — fitness tracker "The Drill Ground" (build book Prompt 16, pivoted).
 *
 *   workout_logs — one row per exercise per session. `client_id` is a
 *     client-generated uuid (unique per user) so the OFFLINE QUEUE can re-sync
 *     safely: a replayed create collides on the unique index and is a no-op, so
 *     XP is never awarded twice. `sets` is the raw log; `total`/`best` are
 *     denormalised for fast PBs + charts. `logged_at` is the workout day
 *     (backdatable); the XP/streak hook keys on its IST date.
 *
 *   users PT fields — a PARALLEL progress track (hybrid model): the study XP
 *     ladder is shared (workouts add ~40/session via lib/xp), but the streak +
 *     weekly goal here are fitness-only and never touch the study streak.
 *     Only pt_weekly_goal is user-editable; the rest are server-owned.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const workoutLogs = new Collection({
      type: "base",
      name: "workout_logs",
      fields: [
        { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "exercise_code", required: true },   // e.g. "pushups"
        { type: "select", name: "group", maxSelect: 1, values: ["push", "pull", "legs", "core", "cardio"] },
        { type: "select", name: "metric", maxSelect: 1, values: ["reps", "time", "distance", "amrap"] },
        { type: "json", name: "sets", maxSize: 5000 },             // [{reps?,seconds?,distance_m?}]
        { type: "number", name: "total", min: 0 },                 // volume (reps / seconds / metres)
        { type: "number", name: "best", min: 0 },                  // best single set (PB source)
        { type: "select", name: "source", maxSelect: 1, values: ["manual", "routine"] },
        { type: "text", name: "routine_code" },                    // set when source = routine
        { type: "text", name: "client_id", required: true },       // offline idempotency key
        { type: "date", name: "logged_at", required: true },       // the workout day (backdatable)
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_workout_logs_client ON workout_logs (user, client_id)",
        "CREATE INDEX idx_workout_logs_user_ex ON workout_logs (user, exercise_code, logged_at)",
        "CREATE INDEX idx_workout_logs_user_day ON workout_logs (user, logged_at)",
      ],
      // full CRUD on own rows (edit/delete a mislog); XP is server-side (hook)
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: '@request.auth.id != "" && user = @request.auth.id',
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
    });
    app.save(workoutLogs);

    // ---- users PT track fields ----
    users.fields.add(new Field({ type: "number", name: "pt_streak_current", onlyInt: true, min: 0 }));
    users.fields.add(new Field({ type: "number", name: "pt_streak_best", onlyInt: true, min: 0 }));
    users.fields.add(new Field({ type: "date", name: "pt_last_workout_date" }));
    users.fields.add(new Field({ type: "number", name: "pt_weekly_goal", onlyInt: true, min: 1 }));
    users.fields.add(new Field({ type: "number", name: "pt_sessions_total", onlyInt: true, min: 0 }));
    // server-owned PT fields blocked from self-write; pt_weekly_goal stays editable
    users.updateRule =
      users.updateRule +
      " && @request.body.pt_streak_current:isset = false" +
      " && @request.body.pt_streak_best:isset = false" +
      " && @request.body.pt_last_workout_date:isset = false" +
      " && @request.body.pt_sessions_total:isset = false";
    app.save(users);
  },
  (app) => {
    try { app.delete(app.findCollectionByNameOrId("workout_logs")); } catch (_) { /* absent */ }
    const users = app.findCollectionByNameOrId("users");
    for (const f of ["pt_streak_current", "pt_streak_best", "pt_last_workout_date", "pt_weekly_goal", "pt_sessions_total"]) {
      try { users.fields.removeByName(f); } catch (_) { /* absent */ }
    }
    users.updateRule = users.updateRule
      .replace(" && @request.body.pt_streak_current:isset = false", "")
      .replace(" && @request.body.pt_streak_best:isset = false", "")
      .replace(" && @request.body.pt_last_workout_date:isset = false", "")
      .replace(" && @request.body.pt_sessions_total:isset = false", "");
    app.save(users);
  }
);
