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

// Monday 00:00 IST — leaderboard week rollover.
// Entries are keyed (user, week_start), so a new week simply accumulates new
// rows; the rollover stamps battalions with the new week_start (history stays).
// Podium badge snapshots land with the badges system (Prompt 10).
cronAdd("leaderboard_rollover", "0 0 * * 1", () => {
  const now = new Date(Date.now() + 5.5 * 3600 * 1000); // IST
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now.getTime() - diff * 86400 * 1000);
  const weekStart = monday.toISOString().slice(0, 10) + " 00:00:00.000Z";

  const battalions = $app.findRecordsByFilter("battalions", "id != ''", "", 1000, 0);
  for (const b of battalions) {
    b.set("week_start", weekStart);
    $app.save(b);
  }
  $app.logger().info("leaderboard_rollover", "week_start", weekStart);
});
