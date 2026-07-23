/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — test centre: sectionals + mocks (build book Prompt 11).
 *
 *   POST /api/test/catalogue {}                        → mocks + attempt history
 *   POST /api/test/sectional {regions,tiers,count}     → compose + start
 *   POST /api/test/start     {test_id}                 → start/resume a mock
 *   POST /api/test/state     {attempt_id}              → resume payload
 *   POST /api/test/submit    {attempt_id}              → score + percentile + review
 *
 * EXAM CONDITIONS: unlike topic quizzes there is no immediate feedback —
 * answer_index and explanations are withheld until submit. Options keep their
 * authored order (papers are reproduced as printed), so `answers` is simply
 * qid → chosen original index, matching the schema comment.
 *
 * TIMER HONESTY: started_at is written by the server and the client cannot
 * update it (test_attempts updateRule blocks it). Remaining time and the
 * submit cutoff are always computed from that server timestamp, so moving the
 * client clock cannot buy a single second.
 *
 * NOTE: PB JSVM pool isolation — helpers are inlined per handler.
 */

// --------------------------------------------------------------- catalogue
routerAdd("POST", "/api/test/catalogue", (e) => {
  // PB JSVM hands json fields back as raw bytes — decode defensively.
  function asObj(v) {
    if (!v) return {};
    // PB returns json fields as a raw type: typeof is "object" but property
    // access yields undefined, so parse the string form FIRST.
    try {
      const s = String(v);
      if (s && s.charAt(0) === "{") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    if (typeof v === "object") return v;
    return {};
  }
  function isSet(v) {
    return String(v || "").trim() !== "";
  }
  function asArr(v) {
    if (!v) return null;
    try {
      const s = String(v);
      if (s && s.charAt(0) === "[") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    if (Array.isArray(v)) return v;
    return null;
  }

  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });

  const mocks = [];
  try {
    const rows = e.app.findRecordsByFilter("tests", "kind = 'mock' && status = 'live'", "+created", 50, 0);
    for (const t of rows) {
      const cfg = asObj(t.get("config"));
      let attempted = false;
      try {
        e.app.findFirstRecordByFilter(
          "test_attempts",
          "user = {:u} && test = {:t} && submitted_at != ''",
          { u: auth.id, t: t.id }
        );
        attempted = true;
      } catch (_) { /* not attempted */ }
      mocks.push({
        id: t.id,
        title: t.get("title"),
        is_free: t.getBool("is_free"),
        locked: !t.getBool("is_free") && !auth.getBool("is_premium") && auth.get("role") !== "admin",
        count: cfg.count || 0,
        duration_sec: cfg.duration_sec || 0,
        negative: cfg.negative || 0,
        blurb: cfg.blurb || "",
        attempted,
      });
    }
  } catch (_) { /* none */ }

  // attempt history (submitted only), newest first
  const history = [];
  try {
    const rows = e.app.findRecordsByFilter(
      "test_attempts",
      "user = {:u} && submitted_at != ''",
      "-submitted_at",
      25,
      0,
      { u: auth.id }
    );
    for (const a of rows) {
      let title = "Test", kind = "sectional";
      try {
        const t = e.app.findRecordById("tests", a.get("test"));
        title = t.get("title");
        kind = t.get("kind");
      } catch (_) { /* deleted */ }
      history.push({
        attempt_id: a.id,
        title,
        kind,
        score: a.getFloat("score"),
        max_score: a.getFloat("max_score"),
        percentile: a.get("percentile"),
        submitted_at: a.get("submitted_at"),
      });
    }
  } catch (_) { /* none */ }

  return e.json(200, { mocks, history });
});

// --------------------------------------------------------------- sectional
routerAdd("POST", "/api/test/sectional", (e) => {
  // PB JSVM hands json fields back as raw bytes — decode defensively.
  function asObj(v) {
    if (!v) return {};
    // PB returns json fields as a raw type: typeof is "object" but property
    // access yields undefined, so parse the string form FIRST.
    try {
      const s = String(v);
      if (s && s.charAt(0) === "{") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    if (typeof v === "object") return v;
    return {};
  }
  function isSet(v) {
    return String(v || "").trim() !== "";
  }
  function asArr(v) {
    if (!v) return null;
    try {
      const s = String(v);
      if (s && s.charAt(0) === "[") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    if (Array.isArray(v)) return v;
    return null;
  }

  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });
  const body = e.requestInfo().body || {};

  const regions = Array.isArray(body.regions) ? body.regions : [];
  const tiers = Array.isArray(body.tiers) && body.tiers.length === 2 ? body.tiers : [1, 5];
  const count = body.count === 50 ? 50 : 20;
  if (regions.length === 0) return e.json(400, { message: "Pick at least one region." });

  // live pool for the chosen regions + tier band
  let pool = [];
  try {
    const topics = e.app.findRecordsByFilter("topics", "status = 'live'", "", 500, 0);
    const allowed = {};
    for (const t of topics) if (regions.indexOf(t.get("region")) !== -1) allowed[t.id] = true;
    const qs = e.app.findRecordsByFilter("questions", "status = 'live'", "", 2000, 0);
    for (const q of qs) {
      const tier = q.getInt("tier");
      if (allowed[q.get("topic")] && tier >= tiers[0] && tier <= tiers[1]) pool.push(q);
    }
  } catch (_) { pool = []; }
  if (pool.length === 0) return e.json(422, { message: "No live questions match that composition yet." });

  // standard tier weighting 30 / 40 / 30 across T1-2, T3, T4+
  const rnd = () => Math.random() - 0.5;
  const t12 = [], t3 = [], t4 = [];
  for (const q of pool) {
    const tier = q.getInt("tier");
    if (tier <= 2) t12.push(q); else if (tier === 3) t3.push(q); else t4.push(q);
  }
  for (const b of [t12, t3, t4]) b.sort(rnd);
  const targets = [Math.round(count * 0.3), Math.round(count * 0.4), count - Math.round(count * 0.3) - Math.round(count * 0.4)];
  const buckets = [t12, t3, t4];
  const picked = [], taken = {};
  for (let b = 0; b < 3; b++) {
    for (let i = 0; i < targets[b] && i < buckets[b].length; i++) {
      picked.push(buckets[b][i]);
      taken[buckets[b][i].id] = true;
    }
  }
  if (picked.length < count) {
    const rest = pool.filter((q) => !taken[q.id]).sort(rnd);
    for (const q of rest) {
      if (picked.length >= count) break;
      picked.push(q);
      taken[q.id] = true;
    }
  }
  picked.sort(rnd);

  // 45s per question budget (build book)
  const duration = picked.length * 45;

  const testsCol = e.app.findCollectionByNameOrId("tests");
  const test = new Record(testsCol);
  test.set("title", "Sectional — " + regions.join(", "));
  test.set("kind", "sectional");
  test.set("config", {
    regions, tiers, count: picked.length,
    duration_sec: duration, correct: 2, negative: 0.667,
  });
  test.set("question_ids", picked.map((q) => q.id));
  test.set("is_free", true);
  test.set("status", "live");
  e.app.save(test);

  const attemptsCol = e.app.findCollectionByNameOrId("test_attempts");
  const attempt = new Record(attemptsCol);
  attempt.set("user", auth.id);
  attempt.set("test", test.id);
  attempt.set("started_at", new Date().toISOString().replace("T", " "));
  attempt.set("answers", {});
  attempt.set("palette_state", {});
  attempt.set("score", 0);
  attempt.set("max_score", picked.length * 2);
  e.app.save(attempt);

  return e.json(200, { attempt_id: attempt.id, test_id: test.id });
});

// ------------------------------------------------------------------- start
routerAdd("POST", "/api/test/start", (e) => {
  // PB JSVM hands json fields back as raw bytes — decode defensively.
  function asObj(v) {
    if (!v) return {};
    // PB returns json fields as a raw type: typeof is "object" but property
    // access yields undefined, so parse the string form FIRST.
    try {
      const s = String(v);
      if (s && s.charAt(0) === "{") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    if (typeof v === "object") return v;
    return {};
  }
  function isSet(v) {
    return String(v || "").trim() !== "";
  }
  function asArr(v) {
    if (!v) return null;
    try {
      const s = String(v);
      if (s && s.charAt(0) === "[") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    if (Array.isArray(v)) return v;
    return null;
  }

  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });
  const body = e.requestInfo().body || {};

  let test;
  try {
    test = e.app.findRecordById("tests", String(body.test_id || ""));
  } catch (_) {
    return e.json(404, { message: "Test not found." });
  }
  if (test.get("status") !== "live") return e.json(404, { message: "Test not available." });

  // entitlement: free paper, premium user, or admin
  if (!test.getBool("is_free") && !auth.getBool("is_premium") && auth.get("role") !== "admin") {
    return e.json(403, { message: "This paper is premium." });
  }

  // resume an unsubmitted attempt rather than starting a second one
  try {
    const open = e.app.findFirstRecordByFilter(
      "test_attempts",
      "user = {:u} && test = {:t} && submitted_at = ''",
      { u: auth.id, t: test.id }
    );
    if (open) return e.json(200, { attempt_id: open.id, test_id: test.id, resumed: true });
  } catch (_) { /* none open */ }

  // compose: fixed paper if authored, else weighted from the live pool
  let qids = asArr(test.get("question_ids"));
  const cfg = asObj(test.get("config"));

  if (!qids || qids.length === 0) {
    const want = cfg.count || 125;
    let pool = [];
    try {
      pool = e.app.findRecordsByFilter("questions", "status = 'live'", "", 3000, 0);
    } catch (_) { pool = []; }
    if (pool.length === 0) return e.json(422, { message: "No live questions to compose a paper yet." });

    const rnd = () => Math.random() - 0.5;
    const t12 = [], t3 = [], t4 = [];
    for (const q of pool) {
      const tier = q.getInt("tier");
      if (tier <= 2) t12.push(q); else if (tier === 3) t3.push(q); else t4.push(q);
    }
    for (const b of [t12, t3, t4]) b.sort(rnd);
    const n = Math.min(want, pool.length);
    const targets = [Math.round(n * 0.3), Math.round(n * 0.4), n - Math.round(n * 0.3) - Math.round(n * 0.4)];
    const buckets = [t12, t3, t4];
    const picked = [], taken = {};
    for (let b = 0; b < 3; b++) {
      for (let i = 0; i < targets[b] && i < buckets[b].length; i++) {
        picked.push(buckets[b][i]); taken[buckets[b][i].id] = true;
      }
    }
    if (picked.length < n) {
      const rest = pool.filter((q) => !taken[q.id]).sort(rnd);
      for (const q of rest) { if (picked.length >= n) break; picked.push(q); taken[q.id] = true; }
    }
    picked.sort(rnd);
    qids = picked.map((q) => q.id);
  }

  const attemptsCol = e.app.findCollectionByNameOrId("test_attempts");
  const attempt = new Record(attemptsCol);
  attempt.set("user", auth.id);
  attempt.set("test", test.id);
  attempt.set("started_at", new Date().toISOString().replace("T", " "));
  attempt.set("answers", {});
  // the composed paper is pinned into the attempt so a resume is stable even
  // for a dynamically-composed mock
  attempt.set("palette_state", { qids });
  attempt.set("score", 0);
  attempt.set("max_score", qids.length * (cfg.correct || 2));
  e.app.save(attempt);

  return e.json(200, { attempt_id: attempt.id, test_id: test.id, resumed: false });
});

// ------------------------------------------------------------------- state
routerAdd("POST", "/api/test/state", (e) => {
  // PB JSVM hands json fields back as raw bytes — decode defensively.
  function asObj(v) {
    if (!v) return {};
    // PB returns json fields as a raw type: typeof is "object" but property
    // access yields undefined, so parse the string form FIRST.
    try {
      const s = String(v);
      if (s && s.charAt(0) === "{") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    if (typeof v === "object") return v;
    return {};
  }
  function isSet(v) {
    return String(v || "").trim() !== "";
  }
  function asArr(v) {
    if (!v) return null;
    try {
      const s = String(v);
      if (s && s.charAt(0) === "[") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    if (Array.isArray(v)) return v;
    return null;
  }

  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });
  const body = e.requestInfo().body || {};

  let attempt;
  try {
    attempt = e.app.findRecordById("test_attempts", String(body.attempt_id || ""));
  } catch (_) {
    return e.json(404, { message: "Attempt not found." });
  }
  if (attempt.get("user") !== auth.id) return e.json(403, { message: "Not your attempt." });

  const test = e.app.findRecordById("tests", attempt.get("test"));
  const cfg = asObj(test.get("config"));

  // question order: pinned in palette_state for mocks, else the test's list
  const palette = asObj(attempt.get("palette_state"));
  let qids = asArr(palette.qids) || asArr(test.get("question_ids")) || [];

  const questions = [];
  for (let i = 0; i < qids.length; i++) {
    let q;
    try { q = e.app.findRecordById("questions", qids[i]); } catch (_) { continue; }
    let region = "";
    try { region = e.app.findRecordById("topics", q.get("topic")).get("region"); } catch (_) { /* orphan */ }
    // NO answer_index, NO explanation — exam conditions until submit
    questions.push({
      index: i,
      qid: q.get("qid"),
      stem: q.get("stem"),
      options: JSON.parse(q.get("options") || "[]"),
      tier: q.getInt("tier"),
      format: q.get("format"),
      region,
    });
  }

  // remaining time from the SERVER's started_at — the client clock is ignored
  const startedMs = Date.parse(String(attempt.get("started_at")).replace(" ", "T"));
  const duration = cfg.duration_sec || questions.length * 45;
  const elapsed = Math.floor((Date.now() - startedMs) / 1000);
  const remaining = Math.max(0, duration - elapsed);

  return e.json(200, {
    attempt_id: attempt.id,
    title: test.get("title"),
    kind: test.get("kind"),
    submitted: isSet(attempt.get("submitted_at")),
    duration_sec: duration,
    remaining_sec: remaining,
    marking: { correct: cfg.correct || 2, negative: cfg.negative || 0.667 },
    questions,
    answers: asObj(attempt.get("answers")),
    marked: palette.marked || {},
    // the client rewrites palette_state as it plays; it must echo the pinned
    // paper back or a dynamically-composed mock would lose its question order
    pinned_qids: palette.qids || null,
  });
});

// ------------------------------------------------------------------ submit
routerAdd("POST", "/api/test/submit", (e) => {
  // PB JSVM hands json fields back as raw bytes — decode defensively.
  function asObj(v) {
    if (!v) return {};
    // PB returns json fields as a raw type: typeof is "object" but property
    // access yields undefined, so parse the string form FIRST.
    try {
      const s = String(v);
      if (s && s.charAt(0) === "{") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    if (typeof v === "object") return v;
    return {};
  }
  function isSet(v) {
    return String(v || "").trim() !== "";
  }
  function asArr(v) {
    if (!v) return null;
    try {
      const s = String(v);
      if (s && s.charAt(0) === "[") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    if (Array.isArray(v)) return v;
    return null;
  }

  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });
  const body = e.requestInfo().body || {};

  let attempt;
  try {
    attempt = e.app.findRecordById("test_attempts", String(body.attempt_id || ""));
  } catch (_) {
    return e.json(404, { message: "Attempt not found." });
  }
  if (attempt.get("user") !== auth.id) return e.json(403, { message: "Not your attempt." });

  const test = e.app.findRecordById("tests", attempt.get("test"));
  const cfg = asObj(test.get("config"));
  const perCorrect = cfg.correct || 2;
  const perWrong = cfg.negative || 0.667;

  const palette = asObj(attempt.get("palette_state"));
  let qids = asArr(palette.qids) || asArr(test.get("question_ids")) || [];

  const answers = asObj(attempt.get("answers"));
  const alreadySubmitted = isSet(attempt.get("submitted_at"));

  let correct = 0, wrong = 0, skipped = 0;
  const review = [];
  const byRegion = {}, byTier = {};

  for (let i = 0; i < qids.length; i++) {
    let q;
    try { q = e.app.findRecordById("questions", qids[i]); } catch (_) { continue; }
    const qid = q.get("qid");
    const chosen = answers[qid];
    const answerIndex = q.getInt("answer_index");
    const has = chosen !== undefined && chosen !== null && chosen >= 0;
    const isCorrect = has && chosen === answerIndex;

    if (!has) skipped++;
    else if (isCorrect) correct++;
    else wrong++;

    let region = "";
    try { region = e.app.findRecordById("topics", q.get("topic")).get("region"); } catch (_) { /* orphan */ }
    const tierKey = q.getInt("tier") >= 4 ? 4 : q.getInt("tier");
    if (!byRegion[region]) byRegion[region] = [0, 0];
    if (!byTier[tierKey]) byTier[tierKey] = [0, 0];
    byRegion[region][1]++; byTier[tierKey][1]++;
    if (isCorrect) { byRegion[region][0]++; byTier[tierKey][0]++; }

    review.push({
      index: i,
      qid,
      stem: q.get("stem"),
      options: JSON.parse(q.get("options") || "[]"),
      tier: q.getInt("tier"),
      region,
      chosen: has ? chosen : null,
      correct_index: answerIndex,
      is_correct: isCorrect,
      explanation: q.get("explanation"),
      marked: !!(palette.marked || {})[qid],
    });
  }

  // CAPF marking, rounded to 2dp
  const raw = correct * perCorrect - wrong * perWrong;
  const score = Math.round(raw * 100) / 100;
  const maxScore = qids.length * perCorrect;

  if (!alreadySubmitted) {
    attempt.set("submitted_at", new Date().toISOString().replace("T", " "));
    attempt.set("score", score);
    attempt.set("max_score", maxScore);
    e.app.save(attempt);
  }

  // percentile against every submitted attempt of this test (recomputed live)
  let percentile = null;
  try {
    const peers = e.app.findRecordsByFilter(
      "test_attempts",
      "test = {:t} && submitted_at != ''",
      "-score",
      1000,
      0,
      { t: test.id }
    );
    if (peers.length > 0) {
      let below = 0;
      for (const p of peers) if (p.getFloat("score") < score) below++;
      percentile = Math.round((below / peers.length) * 100);
      if (!alreadySubmitted || attempt.get("percentile") === null) {
        attempt.set("percentile", percentile);
        e.app.save(attempt);
      }
    }
  } catch (_) { percentile = null; }

  // XP: 200 + score-scaled bonus for mocks (Prompt 09 rules, single path)
  let xpAwarded = 0;
  if (!alreadySubmitted && test.get("kind") === "mock") {
    try {
      const xp = require(`${__hooks}/lib/xp.js`);
      const pct = maxScore > 0 ? Math.max(0, score) / maxScore : 0;
      xpAwarded = 200 + Math.round(200 * pct);
      xp.awardXP(e.app, auth.id, xpAwarded, "mock");
      xp.awardBadge(e.app, auth.id, "mock_finisher");
      xp.applyStreak(e.app, auth.id);
    } catch (err) {
      e.app.logger().error("mock xp", "err", String(err));
    }
  }

  const regions = Object.keys(byRegion)
    .filter((r) => r)
    .map((r) => ({ region: r, correct: byRegion[r][0], total: byRegion[r][1] }))
    .sort((a, b) => a.correct / a.total - b.correct / b.total);
  const tiers = Object.keys(byTier).map((t) => ({
    tier: Number(t), correct: byTier[t][0], total: byTier[t][1],
  }));

  return e.json(200, {
    attempt_id: attempt.id,
    title: test.get("title"),
    kind: test.get("kind"),
    score, max_score: maxScore,
    correct, wrong, skipped,
    marking: { correct: perCorrect, negative: perWrong },
    percentile,
    regions, tiers,
    weakest_region: regions.length > 0 ? regions[0].region : null,
    xp_awarded: xpAwarded,
    review,
  });
});

// ------------------------------------------------- deadline enforcement
/**
 * The client persists answers/palette straight to test_attempts (the
 * collection rules allow the owner those two fields). That write path must
 * respect the SERVER clock: once an attempt is submitted, or once
 * started_at + duration has passed, further answer writes are rejected.
 *
 * Without this a tampered client clock could keep answering past the bell and
 * submit late; with it, extra time buys nothing.
 */
onRecordUpdateRequest((e) => {
  const rec = e.record;

  const isSet = (v) => String(v || "").trim() !== "";
  const asObj = (v) => {
    if (!v) return {};
    try {
      const s = String(v);
      if (s && s.charAt(0) === "{") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    return typeof v === "object" ? v : {};
  };
  const asArr = (v) => {
    if (!v) return null;
    try {
      const s = String(v);
      if (s && s.charAt(0) === "[") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    return Array.isArray(v) ? v : null;
  };

  // load the stored row: e.record already carries the incoming changes
  let stored;
  try {
    stored = e.app.findRecordById("test_attempts", rec.id);
  } catch (_) {
    e.next();
    return;
  }

  if (isSet(stored.get("submitted_at"))) {
    throw new BadRequestError("This attempt is already submitted.");
  }

  const startedRaw = String(stored.get("started_at") || "");
  if (startedRaw) {
    let duration = 0;
    try {
      const test = e.app.findRecordById("tests", stored.get("test"));
      const cfg = asObj(test.get("config"));
      duration = cfg.duration_sec || 0;
      if (!duration) {
        const qids = asArr(asObj(stored.get("palette_state")).qids) || asArr(test.get("question_ids")) || [];
        duration = qids.length * 45;
      }
    } catch (_) { duration = 0; }

    if (duration > 0) {
      const startedMs = Date.parse(startedRaw.replace(" ", "T"));
      const elapsed = (Date.now() - startedMs) / 1000;
      // small grace for the in-flight save the client fires as the clock hits 0
      if (elapsed > duration + 10) {
        throw new BadRequestError("Time is up for this attempt.");
      }
    }
  }

  e.next();
}, "test_attempts");
