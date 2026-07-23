/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — scheduled jobs (build book Prompt 00-B).
 * NOTE: PocketBase cron expressions run in the SERVER's local timezone.
 * setup.sh sets the VPS to Asia/Kolkata, so these expressions are IST.
 * (On a dev machine in another TZ the wall-clock time shifts — harmless.)
 */

// Nightly 02:30 IST — territory decay:
// conquered topics untouched for 21+ days start decaying.
cronAdd("topic_decay", "30 2 * * *", () => {
  const cutoff = new Date(Date.now() - 21 * 86400 * 1000)
    .toISOString()
    .replace("T", " ");
  const stale = $app.findRecordsByFilter(
    "topic_progress",
    "state = 'conquered' && last_activity < {:cutoff}",
    "-last_activity",
    500,
    0,
    { cutoff }
  );
  let n = 0;
  for (const rec of stale) {
    rec.set("state", "decaying");
    $app.save(rec);
    n++;
  }
  if (n > 0) $app.logger().info("topic_decay", "decayed", n);
});

// Monday 00:00 IST — leaderboard week rollover (Prompt 10).
// Entries are keyed (user, week_start), so a new week simply accumulates new
// rows; the rollover snapshots the CLOSING week's standings into badges, then
// stamps battalions with the new week_start (history stays intact).
cronAdd("leaderboard_rollover", "0 0 * * 1", () => {
  const now = new Date(Date.now() + 5.5 * 3600 * 1000); // IST
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now.getTime() - diff * 86400 * 1000);
  const weekStart = monday.toISOString().slice(0, 10) + " 00:00:00.000Z";
  // the week that just closed
  const closing = new Date(monday.getTime() - 7 * 86400 * 1000)
    .toISOString().slice(0, 10) + " 00:00:00.000Z";

  const battalions = $app.findRecordsByFilter("battalions", "id != ''", "", 1000, 0);
  let podiums = 0;

  for (const b of battalions) {
    // snapshot: top 3 get podium badges, top 5 get a commendation (design)
    try {
      const standings = $app.findRecordsByFilter(
        "leaderboard_entries",
        "battalion = {:b} && week_start = {:w} && xp_week > 0",
        "-xp_week",
        5,
        0,
        { b: b.id, w: closing }
      );
      for (let i = 0; i < standings.length; i++) {
        const uid = standings[i].get("user");
        const codes = [];
        if (i < 3) codes.push("podium_" + (i + 1));
        codes.push("commendation");
        for (const code of codes) {
          try {
            const col = $app.findCollectionByNameOrId("badges");
            const rec = new Record(col);
            rec.set("user", uid);
            rec.set("code", code);
            $app.save(rec); // unique (user, code) index makes this idempotent
            podiums++;
          } catch (_) { /* already held */ }
        }
      }
    } catch (_) { /* empty battalion week */ }

    b.set("week_start", weekStart);
    $app.save(b);
  }
  $app.logger().info("leaderboard_rollover", "week_start", weekStart, "badges", podiums);
});

// Nightly 03:00 IST — premium expiry (Prompt 14): clear is_premium for anyone
// whose premium_until has passed, so the flag stays truthful for the API rules
// (topics gating reads @request.auth.is_premium directly). Banked referral days
// live on premium_credit_days and are untouched — they realise on next purchase.
cronAdd("premium_expiry", "0 3 * * *", () => {
  const nowIso = new Date().toISOString().replace("T", " ");
  const lapsed = $app.findRecordsByFilter(
    "users",
    "is_premium = true && premium_until != '' && premium_until < {:now}",
    "",
    5000,
    0,
    { now: nowIso }
  );
  let n = 0;
  for (const u of lapsed) {
    u.set("is_premium", false);
    $app.save(u);
    n++;
  }
  if (n > 0) $app.logger().info("premium_expiry", "cleared", n);
});

// ---- Push notification sends (Prompt 15) --------------------------------
// Every send routes through lib/notify.sendType, which drops opted-out users
// server-side and dry-logs when OneSignal is unkeyed. Cron TZ = server TZ =
// Asia/Kolkata (setup.sh), so these clock times are IST.

// 07:00 IST — "Daily Briefing is ready" (only when one is published today).
cronAdd("briefing_push", "0 7 * * *", () => {
  const notify = require(`${__hooks}/lib/notify.js`);
  notify.sendType($app, "daily_briefing");
});

// 20:30 IST — streak-at-risk for anyone with no qualifying activity today.
cronAdd("streak_risk_push", "30 20 * * *", () => {
  const notify = require(`${__hooks}/lib/notify.js`);
  notify.sendType($app, "streak_risk");
});

// 18:00 IST — SR pile-up (≥25 due), self-throttled to once / 3 days per user.
cronAdd("sr_pileup_push", "0 18 * * *", () => {
  const notify = require(`${__hooks}/lib/notify.js`);
  notify.sendType($app, "sr_pileup");
});

// Monday 08:00 IST — weekly battalion result (after the 00:00 rollover).
cronAdd("battalion_weekly_push", "0 8 * * 1", () => {
  const notify = require(`${__hooks}/lib/notify.js`);
  notify.sendType($app, "battalion_weekly");
});

// 1st of each month 00:05 IST — refill streak freezes to 2 (Prompt 09:
// "2 streak freezes/month auto-apply on a missed day").
cronAdd("freeze_refill", "5 0 1 * *", () => {
  const users = $app.findRecordsByFilter("users", "streak_freezes < 2", "", 5000, 0);
  let n = 0;
  for (const u of users) {
    u.set("streak_freezes", 2);
    $app.save(u);
    n++;
  }
  if (n > 0) $app.logger().info("freeze_refill", "refilled", n);
});
