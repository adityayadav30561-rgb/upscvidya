/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — user lifecycle hooks (build book Prompt 00-B).
 * On user create:
 *   - progression defaults (xp 0, rank cadet, 2 streak freezes, role user)
 *   - unique referral_code
 *   - assign to the current open battalion (new one every 50 members)
 */

onRecordCreate((e) => {
  const r = e.record;

  // defaults (PB select/number fields have no default-value support)
  if (!r.get("role")) r.set("role", "user");
  if (!r.get("rank_code")) r.set("rank_code", "cadet");
  r.set("xp", r.getInt("xp") || 0);
  r.set("streak_current", 0);
  r.set("streak_best", 0);
  r.set("streak_freezes", 2);
  r.set("is_premium", false);

  // referral code: 8 chars, unambiguous alphabet, retry on the rare collision
  if (!r.get("referral_code")) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < 5; i++) {
      const code = $security.randomStringWithAlphabet(8, alphabet);
      try {
        e.app.findFirstRecordByFilter("users", "referral_code = {:code}", { code });
      } catch (_) {
        r.set("referral_code", code); // no record found → code is free
        break;
      }
    }
  }

  // battalion assignment: first with capacity, else create the next one
  if (!r.get("battalion_id")) {
    let battalion;
    try {
      battalion = e.app.findFirstRecordByFilter(
        "battalions",
        "member_count < 50",
        // deterministic fill order: oldest battalion first
      );
    } catch (_) {
      battalion = null;
    }
    if (!battalion) {
      // NOTE: helpers must be inlined — PB's JSVM executes handlers in
      // isolated pool VMs, so file-scope functions are not visible here.
      const now = new Date(Date.now() + 5.5 * 3600 * 1000); // shift to IST
      const day = now.getUTCDay(); // 0=Sun
      const diff = day === 0 ? 6 : day - 1; // days since Monday
      const monday = new Date(now.getTime() - diff * 86400 * 1000);
      const weekStart = monday.toISOString().slice(0, 10) + " 00:00:00.000Z";

      const col = e.app.findCollectionByNameOrId("battalions");
      battalion = new Record(col);
      const count = e.app.countRecords("battalions");
      battalion.set("name", "Battalion " + (count + 1));
      battalion.set("member_count", 0);
      battalion.set("week_start", weekStart);
      e.app.save(battalion);
    }
    r.set("battalion_id", battalion.id);
  }

  e.next();
}, "users");

// increment battalion member_count only after the user row actually persisted
onRecordAfterCreateSuccess((e) => {
  const bid = e.record.get("battalion_id");
  if (bid) {
    try {
      const b = e.app.findRecordById("battalions", bid);
      b.set("member_count", b.getInt("member_count") + 1);
      e.app.save(b);
    } catch (err) {
      e.app.logger().error("battalion count increment failed", "err", String(err));
    }
  }
  e.next();
}, "users");
