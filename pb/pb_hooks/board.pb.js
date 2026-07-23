/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — battalion leaderboard (build book Prompt 10).
 *
 *   POST /api/board {}  → this week's standings for the caller's battalion
 *
 * PRIVACY: the `users` collection is self-read only, so a client can never
 * list other aspirants. This endpoint assembles rows server-side and emits
 * ONLY display_name (or "Anonymous Cadet" when that user set the flag),
 * rank_code, streak and weekly XP. No emails, no ids beyond an opaque row key
 * for the caller's own row.
 *
 * NOTE: PB JSVM pool isolation — helpers inlined per handler.
 */
routerAdd("POST", "/api/board", (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });

  const xp = require(`${__hooks}/lib/xp.js`);
  const weekStart = xp.weekStartIST(Date.now());
  const prevWeek = xp.weekStartIST(Date.now() - 7 * 86400000);

  const battalionId = auth.get("battalion_id");
  if (!battalionId) {
    return e.json(200, { battalion: null, rows: [], you: null, week_start: weekStart });
  }

  let battalion = null;
  try {
    battalion = e.app.findRecordById("battalions", battalionId);
  } catch (_) {
    return e.json(200, { battalion: null, rows: [], you: null, week_start: weekStart });
  }

  // ---- this week's entries for the battalion ----
  let entries = [];
  try {
    entries = e.app.findRecordsByFilter(
      "leaderboard_entries",
      "battalion = {:b} && week_start = {:w}",
      "-xp_week",
      200,
      0,
      { b: battalionId, w: weekStart }
    );
  } catch (_) {
    entries = [];
  }

  // ---- last week's order, to compute the ▲/▼ delta ----
  const prevRank = {};
  try {
    const prev = e.app.findRecordsByFilter(
      "leaderboard_entries",
      "battalion = {:b} && week_start = {:w}",
      "-xp_week",
      200,
      0,
      { b: battalionId, w: prevWeek }
    );
    for (let i = 0; i < prev.length; i++) prevRank[prev[i].get("user")] = i + 1;
  } catch (_) { /* first week */ }

  const rows = [];
  let you = null;
  for (let i = 0; i < entries.length; i++) {
    const en = entries[i];
    const uid = en.get("user");
    const isYou = uid === auth.id;

    let name = "Cadet";
    let rankCode = "cadet";
    let streak = 0;
    try {
      const u = e.app.findRecordById("users", uid);
      rankCode = u.get("rank_code") || "cadet";
      streak = u.getInt("streak_current");
      // mask for everyone except the owner viewing their own row
      name = u.getBool("anonymous") && !isYou
        ? "Anonymous Cadet"
        : (u.get("display_name") || "Cadet");
    } catch (_) { /* user removed */ }

    const before = prevRank[uid] || null;
    const rank = i + 1;
    const row = {
      rank,
      name,
      rank_code: rankCode,
      streak,
      xp_week: en.getInt("xp_week"),
      is_you: isYou,
      delta: before ? before - rank : null, // +ve = climbed
      anonymous: isYou ? auth.getBool("anonymous") : undefined,
    };
    rows.push(row);
    if (isYou) you = row;
  }

  // caller has earned nothing yet this week — still show them their position
  if (!you) {
    you = {
      rank: rows.length + 1,
      name: auth.getBool("anonymous") ? "Anonymous Cadet" : (auth.get("display_name") || "Cadet"),
      rank_code: auth.get("rank_code") || "cadet",
      streak: auth.getInt("streak_current"),
      xp_week: 0,
      is_you: true,
      delta: prevRank[auth.id] ? prevRank[auth.id] - (rows.length + 1) : null,
      anonymous: auth.getBool("anonymous"),
      unranked: true,
    };
  }

  // XP gap to the rank directly above the caller
  let behind = null;
  if (you.rank > 1) {
    const above = rows[you.rank - 2];
    if (above) behind = above.xp_week - you.xp_week;
  }

  // week countdown → next Monday 00:00 IST
  const nextWeek = new Date(Date.parse(weekStart.replace(" ", "T")) + 7 * 86400000);
  const secondsLeft = Math.max(0, Math.floor((nextWeek.getTime() - (Date.now() + 5.5 * 3600 * 1000)) / 1000));

  // ISO week number, for the "week 29" label
  const now = new Date(Date.now() + 5.5 * 3600 * 1000);
  const jan1 = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7);

  return e.json(200, {
    battalion: { name: battalion.get("name"), member_count: battalion.getInt("member_count") },
    week_start: weekStart,
    week_no: weekNo,
    seconds_left: secondsLeft,
    rows,
    you,
    behind,
  });
});
