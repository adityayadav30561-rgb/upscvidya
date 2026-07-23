/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — Drill Ground progression (build book Prompt 16, pivoted).
 *
 * On a workout_log create: award the parallel PT track. The HYBRID model —
 * ~40 XP into the shared ladder (first workout of the IST day only, anti-farm,
 * exactly like a drill), a fitness-only PT streak (never touches the study
 * streak), and contextual fitness badges. XP/streak run through the single
 * lib/xp path so the rank ladder + leaderboard stay consistent.
 *
 * Idempotency: workout_logs is unique on (user, client_id), so an offline
 * re-sync collides on the index and never re-creates — this hook, firing only
 * on a successful create, therefore never double-awards.
 *
 * PB's JSVM isolates handlers; lib/xp.js comes in via require(), and every other
 * helper is inlined here.
 */
onRecordAfterCreateSuccess((e) => {
  const app = e.app;
  const rec = e.record;
  const userId = rec.get("user");
  const xp = require(`${__hooks}/lib/xp.js`);

  // IST day of the workout (logged_at is backdatable). logged_at is stored in
  // UTC, so the "same IST day" window must be the UTC instants that bound that
  // IST calendar day — NOT the IST date label used as a UTC string (that off-by
  // -5.5h mismatch would make every log look like the first of its day).
  const IST = 5.5 * 3600 * 1000;
  const loggedMs = Date.parse(String(rec.get("logged_at") || "").replace(" ", "T"));
  const baseMs = isNaN(loggedMs) ? Date.now() : loggedMs;
  const istDay = xp.istDate(baseMs); // IST date label (for the streak)
  const istToday = xp.istDate(Date.now());
  const shifted = new Date(baseMs + IST);
  const dayStartUtcMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - IST;
  const a = new Date(dayStartUtcMs).toISOString().replace("T", " ");
  const b = new Date(dayStartUtcMs + 86400000 - 1).toISOString().replace("T", " ");

  // first log for this IST day? (exclude this record)
  let firstOfDay = true;
  try {
    const rows = app.findRecordsByFilter(
      "workout_logs",
      "user = {:u} && logged_at >= {:a} && logged_at <= {:b} && id != {:id}",
      "", 2, 0,
      { u: userId, a, b, id: rec.id }
    );
    firstOfDay = rows.length === 0;
  } catch (_) { firstOfDay = true; }

  // badges (idempotent) — first ever + contextual milestones
  try {
    xp.awardBadge(app, userId, "first_workout");
    const ex = rec.get("exercise_code");
    const grp = rec.get("group");
    const best = rec.getInt("best");
    const total = rec.getInt("total");
    if (rec.get("source") === "routine") xp.awardBadge(app, userId, "circuit_finisher");
    if (ex === "pushups" && best >= 50) xp.awardBadge(app, userId, "pushups_50");
    if (ex === "plank" && best >= 300) xp.awardBadge(app, userId, "plank_5min");
    if (grp === "cardio" && ex === "running" && total >= 5000) xp.awardBadge(app, userId, "run_5k");
  } catch (err) {
    app.logger().error("pt badges", "err", String(err));
  }

  // XP + PT streak: once per workout DAY
  if (firstOfDay) {
    try {
      xp.awardXP(app, userId, 40, "workout"); // loads+saves the user's xp/rank
    } catch (err) {
      app.logger().error("pt xp", "err", String(err));
    }
    try {
      const user = app.findRecordById("users", userId);
      user.set("pt_sessions_total", user.getInt("pt_sessions_total") + 1);
      // streak advances only for a workout dated TODAY (backdated fills history
      // for PBs but must not retro-bump the current streak)
      if (istDay === istToday) {
        const step = xp.streakStep(
          {
            current: user.getInt("pt_streak_current"),
            best: user.getInt("pt_streak_best"),
            freezes: 0, // PT streak has no freezes
            last: String(user.get("pt_last_workout_date") || "").slice(0, 10),
          },
          istDay
        );
        if (step.counted) {
          user.set("pt_streak_current", step.current);
          user.set("pt_streak_best", step.best);
          user.set("pt_last_workout_date", step.last);
          if (step.current >= 30) xp.awardBadge(app, userId, "regiment_30");
        }
      }
      app.save(user);
    } catch (err) {
      app.logger().error("pt streak", "err", String(err));
    }
  }

  e.next();
}, "workout_logs");
