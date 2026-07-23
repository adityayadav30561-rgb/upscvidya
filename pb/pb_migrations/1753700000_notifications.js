/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — notification prefs + analytics opt-out (build book Prompt 15).
 *
 *   users.notification_prefs — JSON map {daily_briefing, streak_risk,
 *     sr_pileup, battalion_weekly} → bool. ABSENT/true = opted-in (default on);
 *     the server send path treats a missing key as opted-in, so existing users
 *     need no backfill. The client writes this from Settings; it is NOT in the
 *     updateRule block list, so a user may self-edit their own prefs.
 *   users.analytics_minimal — bool; when true the client suppresses all but the
 *     essential PostHog events ("minimal analytics" toggle). Self-writable.
 *   users.last_sr_push — server-owned date; the sr-pileup cron writes it to
 *     throttle to at most once / 3 days. BLOCKED from client writes.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(new Field({ type: "json", name: "notification_prefs", maxSize: 2000 }));
    users.fields.add(new Field({ type: "bool", name: "analytics_minimal" }));
    users.fields.add(new Field({ type: "date", name: "last_sr_push" }));
    // only last_sr_push is server-owned; prefs + analytics_minimal stay editable
    users.updateRule =
      users.updateRule + " && @request.body.last_sr_push:isset = false";
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    for (const f of ["notification_prefs", "analytics_minimal", "last_sr_push"]) {
      try { users.fields.removeByName(f); } catch (_) { /* absent */ }
    }
    users.updateRule = users.updateRule.replace(
      " && @request.body.last_sr_push:isset = false",
      ""
    );
    app.save(users);
  }
);
