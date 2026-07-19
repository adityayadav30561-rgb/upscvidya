/// <reference path="../pb_data/types.d.ts" />
/**
 * Referral code resolver — /r/[code] links need the referrer's user id at
 * signup, but clients cannot list other users. Public, returns id only.
 */
routerAdd("GET", "/api/referral/{code}", (e) => {
  const code = e.request.pathValue("code");
  if (!code || code.length > 16) {
    return e.json(404, { found: false });
  }
  try {
    const user = e.app.findFirstRecordByFilter("users", "referral_code = {:code}", {
      code: code.toUpperCase(),
    });
    return e.json(200, { found: true, id: user.id });
  } catch (_) {
    return e.json(404, { found: false });
  }
});
