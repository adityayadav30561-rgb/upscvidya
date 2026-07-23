/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — notification control endpoints (build book Prompt 15).
 *
 *   POST /api/notify/preview {type}   → (auth, self) would I receive this now?
 *   POST /api/notify/test    {type}   → (admin) force-send this type immediately
 *
 * /preview is how the opt-out acceptance is verified without OneSignal: it runs
 * the exact server-side pref+candidacy gate for the CALLING user, so toggling a
 * setting off flips `would_receive` to false. /test force-triggers a real send
 * (dry-logs when OneSignal is unkeyed).
 *
 * PB's JSVM isolates handlers; helpers come from lib/notify.js via require().
 */

routerAdd("POST", "/api/notify/preview", (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });
  const notify = require(`${__hooks}/lib/notify.js`);

  const body = e.requestInfo().body || {};
  const type = String(body.type || "");
  if (notify.TYPES.indexOf(type) === -1) {
    return e.json(400, { message: "Unknown notification type." });
  }
  // re-read the user so prefs reflect a just-saved toggle
  const user = e.app.findRecordById("users", auth.id);
  return e.json(200, notify.wouldReceive(e.app, user, type));
});

routerAdd("POST", "/api/notify/test", (e) => {
  const auth = e.auth;
  if (!auth || auth.get("role") !== "admin") return e.json(403, { message: "Admins only." });
  const notify = require(`${__hooks}/lib/notify.js`);

  const body = e.requestInfo().body || {};
  const type = String(body.type || "");
  if (notify.TYPES.indexOf(type) === -1) {
    return e.json(400, { message: "Unknown notification type." });
  }
  const res = notify.sendType(e.app, type, notify.COPY[type]);
  return e.json(200, res);
});
