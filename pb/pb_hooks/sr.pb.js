/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — spaced repetition endpoints (build book Prompt 08).
 *
 *   POST /api/sr/due      {}                      → due count, capped batch, week forecast
 *   POST /api/sr/reveal   {card_id}               → answer text + explanation
 *   POST /api/sr/grade    {card_id, grade}        → SM-2 reschedule + next-due previews
 *   POST /api/sr/restore  {code}                  → 5-Q micro-quiz session for a decaying topic
 *
 * SM-2 (documented table lives in src/lib/__tests__/sr.test.ts — keep in sync):
 *   again  → lapse: reps=0, interval=1d, ease=max(1.3, ease-0.2), lapses+1
 *   good q4 → reps+1; interval: rep1→1d, rep2→6d, else round(interval*ease); ease+0
 *   easy q5 → same intervals; ease+0.1
 *   mastered → suspended=true (design: deliberate retirement, button-only)
 *   interval cap 60 days (pre-exam context). Daily batch cap 60, overdue first
 *   then ease ascending. The UI's third button maps to "mastered"; "easy" stays
 *   in the engine per the build-book acceptance tests.
 *
 * NOTE: PB JSVM pool isolation — helpers inlined per handler.
 */

// ---------------------------------------------------------------------- due
routerAdd("POST", "/api/sr/due", (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });

  const now = new Date();
  const endOfToday = now.toISOString().slice(0, 10) + " 23:59:59.999Z";

  // due today or overdue, unsuspended; overdue first, then ease ascending
  let cards = [];
  try {
    cards = e.app.findRecordsByFilter(
      "sr_cards",
      "user = {:u} && suspended = false && due_date <= {:d}",
      "+due_date,+ease",
      60, // daily cap
      0,
      { u: auth.id, d: endOfToday }
    );
  } catch (_) {
    cards = [];
  }

  const batch = [];
  for (const c of cards) {
    let q;
    try {
      q = e.app.findRecordById("questions", c.get("question"));
    } catch (_) {
      continue; // question retired/deleted
    }
    let topicCode = "", topicTitle = "";
    try {
      const t = e.app.findRecordById("topics", q.get("topic"));
      topicCode = t.get("id_code");
      topicTitle = t.get("title");
    } catch (_) { /* orphan */ }

    // preview intervals for the grade buttons (mirror of the SM-2 below)
    const reps = c.getInt("reps");
    const ease = c.getFloat("ease") || 2.5;
    const interval = c.getInt("interval_days");
    const nextGood = reps + 1 === 1 ? 1 : reps + 1 === 2 ? 6 : Math.min(60, Math.round(interval * ease));

    batch.push({
      card_id: c.id,
      qid: q.get("qid"),
      stem: q.get("stem"),
      format: q.get("format"),
      tier: q.getInt("tier"),
      topic_code: topicCode,
      topic_title: topicTitle,
      missed: c.getInt("lapses") + 1, // created from a miss
      reread: c.getInt("lapses") >= 2, // 3× total misses → re-read link
      last_seen: c.get("updated"),
      next_good_days: nextGood,
    });
  }

  // 7-day forecast (today + 6) for the week strip
  const forecast = [];
  for (let d = 0; d < 7; d++) {
    const day = new Date(now.getTime() + d * 86400000);
    const from = day.toISOString().slice(0, 10) + " 00:00:00.000Z";
    const to = day.toISOString().slice(0, 10) + " 23:59:59.999Z";
    let n = 0;
    try {
      n = e.app.countRecords(
        "sr_cards",
        $dbx.exp(
          d === 0
            ? "user = {:u} AND suspended = false AND due_date <= {:to}"
            : "user = {:u} AND suspended = false AND due_date >= {:from} AND due_date <= {:to}",
          d === 0 ? { u: auth.id, to } : { u: auth.id, from, to }
        )
      );
    } catch (_) { n = 0; }
    forecast.push({ day: day.toISOString().slice(0, 10), count: n });
  }

  // decaying territories for the warnings block
  const decays = [];
  try {
    const rows = e.app.findRecordsByFilter(
      "topic_progress",
      "user = {:u} && state = 'decaying'",
      "+last_activity",
      10,
      0,
      { u: auth.id }
    );
    for (const r of rows) {
      try {
        const t = e.app.findRecordById("topics", r.get("topic"));
        const last = new Date(String(r.get("last_activity")).replace(" ", "T"));
        decays.push({
          code: t.get("id_code"),
          title: t.get("title"),
          days: Math.max(0, Math.floor((now.getTime() - last.getTime()) / 86400000)),
        });
      } catch (_) { /* orphan */ }
    }
  } catch (_) { /* none */ }

  return e.json(200, { count: batch.length, cards: batch, forecast, decays });
});

// -------------------------------------------------------------------- reveal
routerAdd("POST", "/api/sr/reveal", (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });
  const body = e.requestInfo().body || {};

  let card;
  try {
    card = e.app.findRecordById("sr_cards", String(body.card_id || ""));
  } catch (_) {
    return e.json(404, { message: "Card not found." });
  }
  if (card.get("user") !== auth.id) return e.json(403, { message: "Not your card." });

  let q;
  try {
    q = e.app.findRecordById("questions", card.get("question"));
  } catch (_) {
    return e.json(404, { message: "Question retired." });
  }
  const opts = JSON.parse(q.get("options") || "[]");
  return e.json(200, {
    card_id: card.id,
    answer: opts[q.getInt("answer_index")] || "",
    explanation: q.get("explanation"),
  });
});

// --------------------------------------------------------------------- grade
routerAdd("POST", "/api/sr/grade", (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });
  const body = e.requestInfo().body || {};
  const grade = String(body.grade || "");
  if (["again", "good", "easy", "mastered"].indexOf(grade) === -1) {
    return e.json(400, { message: "grade must be again|good|easy|mastered." });
  }

  let card;
  try {
    card = e.app.findRecordById("sr_cards", String(body.card_id || ""));
  } catch (_) {
    return e.json(404, { message: "Card not found." });
  }
  if (card.get("user") !== auth.id) return e.json(403, { message: "Not your card." });

  // SM-2 (inlined; mirror of src/lib/sr.ts sm2())
  let reps = card.getInt("reps");
  let ease = card.getFloat("ease") || 2.5;
  let interval = card.getInt("interval_days");
  let lapses = card.getInt("lapses");
  let suspended = false;

  if (grade === "mastered") {
    suspended = true;
  } else if (grade === "again") {
    reps = 0;
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
    lapses += 1;
  } else {
    reps += 1;
    interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(interval * ease);
    if (interval > 60) interval = 60; // pre-exam cap
    if (grade === "easy") ease = ease + 0.1;
  }

  const due = new Date(Date.now() + interval * 86400000);
  const dueStr = due.toISOString().slice(0, 10) + " 00:00:00.000Z";

  card.set("reps", reps);
  card.set("ease", ease);
  card.set("interval_days", interval);
  card.set("lapses", lapses);
  card.set("suspended", suspended);
  if (!suspended) card.set("due_date", dueStr);
  e.app.save(card);

  // remaining due today (drives the "stack clear" moment client-side)
  const endOfToday = new Date().toISOString().slice(0, 10) + " 23:59:59.999Z";
  let remaining = 0;
  try {
    remaining = e.app.countRecords(
      "sr_cards",
      $dbx.exp("user = {:u} AND suspended = false AND due_date <= {:d}", {
        u: auth.id,
        d: endOfToday,
      })
    );
  } catch (_) { remaining = 0; }

  return e.json(200, {
    card_id: card.id,
    grade,
    reps,
    ease: Math.round(ease * 100) / 100,
    interval_days: interval,
    due_date: suspended ? null : dueStr,
    suspended,
    remaining_due: remaining,
  });
});

// ------------------------------------------------------------------- restore
// Decay integration: 5-question micro-quiz composed from the territory's
// most-missed-by-this-user questions. Reuses the quiz_sessions engine — the
// normal /api/quiz/finish already restores conquered on a >=70% pass and
// refreshes last_activity.
routerAdd("POST", "/api/sr/restore", (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });
  const body = e.requestInfo().body || {};
  const code = String(body.code || "").trim();
  if (!code) return e.json(400, { message: "code is required." });

  let topic;
  try {
    topic = e.app.findFirstRecordByFilter("topics", "id_code = {:c} && status = 'live'", { c: code });
  } catch (_) {
    return e.json(404, { message: "Territory not found." });
  }

  // entitlement mirrors quiz/start
  const free = topic.getBool("is_free");
  if (!free && !auth.getBool("is_premium") && auth.get("role") !== "admin") {
    return e.json(403, { message: "This territory is premium." });
  }

  // reuse an active session for this code
  try {
    const existing = e.app.findFirstRecordByFilter(
      "quiz_sessions",
      "user = {:u} && code = {:c} && status = 'active'",
      { u: auth.id, c: code }
    );
    if (existing) return e.json(200, { session_id: existing.id, code, reused: true });
  } catch (_) { /* compose fresh */ }

  let pool = [];
  try {
    pool = e.app.findRecordsByFilter("questions", "topic = {:t} && status = 'live'", "", 500, 0, { t: topic.id });
  } catch (_) { pool = []; }
  if (pool.length === 0) return e.json(422, { message: "No live questions for this territory." });

  // most-missed-by-this-user first, then least-attempted
  const wrongCount = {}, seenCount = {};
  try {
    const mine = e.app.findRecordsByFilter(
      "attempts",
      "user = {:u} && topic = {:t}",
      "",
      5000,
      0,
      { u: auth.id, t: topic.id }
    );
    for (const a of mine) {
      const qi = a.get("question");
      seenCount[qi] = (seenCount[qi] || 0) + 1;
      if (!a.getBool("is_correct")) wrongCount[qi] = (wrongCount[qi] || 0) + 1;
    }
  } catch (_) { /* fresh user */ }

  const rnd = () => Math.random() - 0.5;
  pool.sort(
    (a, b) =>
      (wrongCount[b.id] || 0) - (wrongCount[a.id] || 0) ||
      (seenCount[a.id] || 0) - (seenCount[b.id] || 0) ||
      rnd()
  );
  const picked = pool.slice(0, 5);

  const items = picked.map((q) => {
    const opts = JSON.parse(q.get("options") || "[]");
    const map = opts.map((_, i) => i).sort(rnd);
    return {
      qid: q.get("qid"), stem: q.get("stem"), format: q.get("format"),
      tier: q.getInt("tier"), opts: map.map((i) => opts[i]), map,
      chosen: null, correct: null, ms: null, flagged: false,
    };
  });

  const col = e.app.findCollectionByNameOrId("quiz_sessions");
  const session = new Record(col);
  session.set("user", auth.id);
  session.set("topic", topic.id);
  session.set("code", code);
  session.set("kind", "topic_quiz");
  session.set("items", JSON.stringify(items));
  session.set("status", "active");
  session.set("total", items.length);
  session.set("correct_count", 0);
  session.set("score_pct", 0);
  e.app.save(session);

  return e.json(200, { session_id: session.id, code, reused: false });
});
