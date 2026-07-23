/// <reference path="../../pb_data/types.d.ts" />
/**
 * UPSCVidya — push send + preference gate (build book Prompt 15).
 * `require`d by cron.pb.js + notify.pb.js:
 *   const notify = require(`${__hooks}/lib/notify.js`);
 *
 * The opt-out is honoured HERE, server-side: every send filters recipients
 * through wantsType() before OneSignal is ever called, so a disabled toggle is
 * never delivered regardless of what the client does. Sends target OneSignal by
 * external_id = PB user id (the client calls OneSignal.login(userId) at sign-in).
 *
 * Without ONESIGNAL_APP_ID / ONESIGNAL_REST_KEY the send path runs in DRY mode:
 * it computes + logs the audience but contacts nothing (dev/e2e). This mirrors
 * the CA pipeline's heuristic degradation and the payment PAY_SIMULATE path.
 */

const TYPES = ["daily_briefing", "streak_risk", "sr_pileup", "battalion_weekly"];
const DAY_MS = 86400000;

// Notification copy — one source for the crons and the /test endpoint.
const COPY = {
  daily_briefing: { title: "Daily Briefing is ready", body: "Today's current affairs + a quick quiz.", url: "/briefing" },
  streak_risk: { title: "Your streak is at risk", body: "One quiz keeps the chain alive.", url: "/" },
  sr_pileup: { title: "Revision is piling up", body: "25+ cards are due. Clear a few now.", url: "/revision" },
  battalion_weekly: { title: "Battalion results are in", body: "See where you finished this week.", url: "/battalion" },
};

/** Parsed notification_prefs JSON (PB hands json back as raw bytes). */
function parsePrefs(user) {
  const raw = user.get("notification_prefs");
  if (!raw) return {};
  try {
    const s = String(raw);
    if (s && s.charAt(0) === "{") return JSON.parse(s);
  } catch (_) { /* not stringifiable */ }
  return typeof raw === "object" ? raw : {};
}

/** Opt-in unless explicitly false — a missing key means "not yet touched" and
 *  defaults ON, so existing users need no backfill. */
function wantsType(user, type) {
  const prefs = parsePrefs(user);
  return prefs[type] !== false;
}

/** IST calendar date (YYYY-MM-DD) for an epoch ms. */
function istDate(ms) {
  return new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Is this user a candidate for `type` right now (independent of the pref)? */
function isCandidate(app, user, type) {
  if (type === "streak_risk") {
    // no qualifying activity logged for today (IST)
    const last = String(user.get("last_active_date") || "").slice(0, 10);
    return last !== istDate(Date.now());
  }
  if (type === "battalion_weekly") {
    return !!user.get("battalion_id");
  }
  if (type === "sr_pileup") {
    // ≥25 cards due today AND not pushed in the last 3 days
    const today = istDate(Date.now()) + " 23:59:59.999Z";
    let due = 0;
    try {
      const rows = app.findRecordsByFilter(
        "sr_cards",
        "user = {:u} && suspended = false && due_date <= {:d}",
        "", 26, 0, { u: user.id, d: today }
      );
      due = rows.length;
    } catch (_) { due = 0; }
    if (due < 25) return false;
    const lastPush = user.get("last_sr_push");
    if (lastPush) {
      const ms = Date.parse(String(lastPush).replace(" ", "T"));
      if (!isNaN(ms) && Date.now() - ms < 3 * DAY_MS) return false; // throttled
    }
    return true;
  }
  if (type === "daily_briefing") {
    // only when a briefing is actually published for today
    try {
      app.findFirstRecordByFilter(
        "ca_items",
        "status = 'published' && date >= {:d}",
        { d: istDate(Date.now()) + " 00:00:00.000Z" }
      );
      return true;
    } catch (_) { return false; }
  }
  return false;
}

/** Would the calling user receive `type` right now? (pref ∧ candidacy) */
function wouldReceive(app, user, type) {
  const wants = wantsType(user, type);
  const candidate = isCandidate(app, user, type);
  return { type, wants, candidate, would_receive: wants && candidate };
}

/** POST one notification to OneSignal (external_id targeting). Dry when unkeyed. */
function sendOneSignal(app, userIds, payload) {
  if (!userIds || userIds.length === 0) return { sent: 0, dry: false, targeted: 0 };
  const appId = $os.getenv("ONESIGNAL_APP_ID");
  const restKey = $os.getenv("ONESIGNAL_REST_KEY");

  if (!appId || !restKey) {
    app.logger().info("notify.dry", "type", payload.type, "targeted", userIds.length);
    return { sent: 0, dry: true, targeted: userIds.length };
  }

  try {
    const res = $http.send({
      url: "https://api.onesignal.com/notifications",
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Basic " + restKey,
      },
      body: JSON.stringify({
        app_id: appId,
        target_channel: "push",
        include_aliases: { external_id: userIds },
        headings: { en: payload.title },
        contents: { en: payload.body },
        url: payload.url || undefined,
        data: { type: payload.type },
      }),
      timeout: 20,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      app.logger().error("notify.onesignal", "status", res.statusCode, "body", String(res.body));
      return { sent: 0, dry: false, targeted: userIds.length, error: true };
    }
    return { sent: userIds.length, dry: false, targeted: userIds.length };
  } catch (err) {
    app.logger().error("notify.onesignal", "err", String(err));
    return { sent: 0, dry: false, targeted: userIds.length, error: true };
  }
}

/** Full send for a type: gather candidates, drop opt-outs, send once.
 *  `payload` defaults to the shared COPY for the type. */
function sendType(app, type, payload) {
  payload = payload || COPY[type] || {};
  const recipients = [];
  let users = [];
  try {
    users = app.findRecordsByFilter("users", "id != ''", "", 100000, 0);
  } catch (_) { users = []; }
  for (const u of users) {
    if (!wantsType(u, type)) continue;       // opt-out honoured server-side
    if (!isCandidate(app, u, type)) continue;
    recipients.push(u.id);
    // sr-pileup throttle bookkeeping
    if (type === "sr_pileup") {
      try {
        u.set("last_sr_push", new Date().toISOString().replace("T", " "));
        app.save(u);
      } catch (_) { /* best effort */ }
    }
  }
  const res = sendOneSignal(app, recipients, Object.assign({ type }, payload));
  app.logger().info("notify.sendType", "type", type, "recipients", recipients.length,
    "sent", res.sent, "dry", !!res.dry);
  return { type, recipients: recipients.length, sent: res.sent, dry: !!res.dry };
}

module.exports = {
  TYPES, COPY, parsePrefs, wantsType, istDate, isCandidate, wouldReceive,
  sendOneSignal, sendType,
};
