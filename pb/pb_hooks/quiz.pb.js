/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — quiz engine endpoints (build book Prompt 07).
 *
 *   POST /api/quiz/start   {code}                          → composed session
 *   POST /api/quiz/state   {session_id}                    → resume payload
 *   POST /api/quiz/answer  {session_id, qid, choice, ms}   → verify + explain
 *   POST /api/quiz/flag    {session_id, qid, flagged}      → persist flag
 *   POST /api/quiz/finish  {session_id}                    → score + rewards
 *
 * answer_index NEVER leaves the server before an answer: the client receives
 * options in a server-shuffled order plus the display index it must render;
 * the original-index mapping stays in the session row. All writes run here as
 * superuser, so questions/topic_progress/sr_cards rules are bypassed safely.
 *
 * NOTE: PB's JSVM runs each handler in an isolated pool VM — file-scope helpers
 * are NOT visible inside handlers, so every helper is inlined per handler.
 */

// -------------------------------------------------------------------- start
routerAdd("POST", "/api/quiz/start", (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });

  const body = e.requestInfo().body || {};
  const code = String(body.code || "").trim();
  if (!code) return e.json(400, { message: "code is required." });

  const isDrill = code.indexOf("APX") === 0;
  const N = isDrill ? 15 : 12;

  // resolve topic (chapters live in `topics`; drills have no topic row)
  let topic = null;
  try {
    topic = e.app.findFirstRecordByFilter("topics", "id_code = {:c} && status = 'live'", { c: code });
  } catch (_) {
    topic = null;
  }

  // entitlement: free topic, premium user, or admin (drills are free)
  if (topic && !isDrill) {
    const free = topic.getBool("is_free");
    const premium = auth.getBool("is_premium");
    const admin = auth.get("role") === "admin";
    if (!free && !premium && !admin) {
      return e.json(403, { message: "This territory's quiz is premium." });
    }
  }

  // reuse an already-active session for this code (resume-safe, no duplicates)
  try {
    const existing = e.app.findFirstRecordByFilter(
      "quiz_sessions",
      "user = {:u} && code = {:c} && status = 'active'",
      { u: auth.id, c: code }
    );
    if (existing) {
      const items = JSON.parse(existing.get("items") || "[]");
      return e.json(200, {
        session_id: existing.id,
        code,
        kind: existing.get("kind"),
        timed: isDrill,
        per_question_sec: isDrill ? 20 : null,
        questions: items.map((it, i) => ({
          qid: it.qid, index: i, stem: it.stem, format: it.format,
          tier: it.tier, options: it.opts, flagged: !!it.flagged,
          chosen: it.chosen, correct: it.correct,
        })),
      });
    }
  } catch (_) {
    /* none active — compose a fresh one */
  }

  // live question pool for this topic
  let pool = [];
  if (topic) {
    try {
      pool = e.app.findRecordsByFilter("questions", "topic = {:t} && status = 'live'", "", 500, 0, { t: topic.id });
    } catch (_) {
      pool = [];
    }
  }
  if (pool.length === 0) {
    return e.json(422, { message: "No live questions for this territory yet." });
  }

  // per-user attempt counts → prefer least-attempted-by-this-user
  const attemptCount = {};
  try {
    const mine = e.app.findRecordsByFilter("attempts", "user = {:u}", "", 5000, 0, { u: auth.id });
    for (const a of mine) {
      const q = a.get("question");
      attemptCount[q] = (attemptCount[q] || 0) + 1;
    }
  } catch (_) { /* first-timer: all zero */ }

  // bucket by tier
  const t12 = [], t3 = [], t4 = [];
  for (const q of pool) {
    const tier = q.getInt("tier");
    if (tier <= 2) t12.push(q);
    else if (tier === 3) t3.push(q);
    else t4.push(q);
  }
  // sort each bucket: least attempted first, random tiebreak
  const rnd = () => Math.random() - 0.5;
  const sortBucket = (arr) =>
    arr.sort((a, b) => (attemptCount[a.id] || 0) - (attemptCount[b.id] || 0) || rnd());
  sortBucket(t12); sortBucket(t3); sortBucket(t4);

  // weighted targets 30% / 40% / 30%
  const targets = [Math.round(N * 0.3), Math.round(N * 0.4), N - Math.round(N * 0.3) - Math.round(N * 0.4)];
  const buckets = [t12, t3, t4];
  const picked = [];
  const takenIds = {};
  for (let b = 0; b < 3; b++) {
    for (let i = 0; i < targets[b] && i < buckets[b].length; i++) {
      picked.push(buckets[b][i]);
      takenIds[buckets[b][i].id] = true;
    }
  }
  // backfill from the least-attempted leftovers of the whole pool
  if (picked.length < N) {
    const rest = sortBucket(pool.filter((q) => !takenIds[q.id]));
    for (const q of rest) {
      if (picked.length >= N) break;
      picked.push(q);
      takenIds[q.id] = true;
    }
  }
  picked.sort(rnd); // mix tiers/formats in presentation order

  // build items with per-question shuffled option order
  const items = picked.map((q) => {
    const opts = JSON.parse(q.get("options") || "[]");
    const map = opts.map((_, i) => i).sort(rnd); // display slot -> original index
    return {
      qid: q.get("qid"),
      stem: q.get("stem"),
      format: q.get("format"),
      tier: q.getInt("tier"),
      opts: map.map((i) => opts[i]),
      map,
      chosen: null,
      correct: null,
      ms: null,
      flagged: false,
    };
  });

  const col = e.app.findCollectionByNameOrId("quiz_sessions");
  const session = new Record(col);
  session.set("user", auth.id);
  if (topic) session.set("topic", topic.id);
  session.set("code", code);
  session.set("kind", isDrill ? "drill" : "topic_quiz");
  session.set("items", JSON.stringify(items));
  session.set("status", "active");
  session.set("total", items.length);
  session.set("correct_count", 0);
  session.set("score_pct", 0);
  e.app.save(session);

  return e.json(200, {
    session_id: session.id,
    code,
    kind: isDrill ? "drill" : "topic_quiz",
    timed: isDrill,
    per_question_sec: isDrill ? 20 : null,
    questions: items.map((it, i) => ({
      qid: it.qid, index: i, stem: it.stem, format: it.format,
      tier: it.tier, options: it.opts, flagged: false, chosen: null, correct: null,
    })),
  });
});

// -------------------------------------------------------------------- state
routerAdd("POST", "/api/quiz/state", (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });
  const body = e.requestInfo().body || {};
  const sid = String(body.session_id || "");

  let session;
  try {
    session = e.app.findRecordById("quiz_sessions", sid);
  } catch (_) {
    return e.json(404, { message: "Session not found." });
  }
  if (session.get("user") !== auth.id) return e.json(403, { message: "Not your session." });

  const items = JSON.parse(session.get("items") || "[]");
  // reveal correct index only for already-answered questions
  const revealed = items.map((it, i) => {
    const out = {
      qid: it.qid, index: i, stem: it.stem, format: it.format,
      tier: it.tier, options: it.opts, flagged: !!it.flagged,
      chosen: it.chosen, correct: it.correct,
    };
    if (it.chosen !== null) out.correct_display_index = it.map.indexOf(revealAnswerIndex(e, it.qid));
    return out;
  });

  function revealAnswerIndex(ev, qid) {
    try {
      const q = ev.app.findFirstRecordByFilter("questions", "qid = {:q}", { q: qid });
      return q.getInt("answer_index");
    } catch (_) { return -1; }
  }

  return e.json(200, {
    session_id: session.id,
    code: session.get("code"),
    kind: session.get("kind"),
    status: session.get("status"),
    timed: session.get("kind") === "drill",
    per_question_sec: session.get("kind") === "drill" ? 20 : null,
    questions: revealed,
  });
});

// ------------------------------------------------------------------- answer
routerAdd("POST", "/api/quiz/answer", (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });
  const body = e.requestInfo().body || {};
  const sid = String(body.session_id || "");
  const qid = String(body.qid || "");
  const choice = parseInt(body.choice, 10);
  const ms = parseInt(body.ms, 10) || 0;

  let session;
  try {
    session = e.app.findRecordById("quiz_sessions", sid);
  } catch (_) {
    return e.json(404, { message: "Session not found." });
  }
  if (session.get("user") !== auth.id) return e.json(403, { message: "Not your session." });
  if (session.get("status") !== "active") return e.json(409, { message: "Session already finished." });

  const items = JSON.parse(session.get("items") || "[]");
  const item = items.find((it) => it.qid === qid);
  if (!item) return e.json(400, { message: "Question not in session." });

  const q = e.app.findFirstRecordByFilter("questions", "qid = {:q}", { q: qid });
  const answerIndex = q.getInt("answer_index");
  const correctDisplay = item.map.indexOf(answerIndex);

  // idempotent: replay a prior answer without double-recording
  if (item.chosen !== null) {
    return e.json(200, {
      qid, correct_display_index: correctDisplay, is_correct: item.correct,
      explanation: q.get("explanation"), already: true,
    });
  }
  if (!(choice >= 0 && choice < item.opts.length)) {
    return e.json(400, { message: "Invalid choice index." });
  }

  const isCorrect = choice === correctDisplay;
  const chosenOriginal = item.map[choice];

  // record the attempt
  const attCol = e.app.findCollectionByNameOrId("attempts");
  const att = new Record(attCol);
  att.set("user", auth.id);
  att.set("question", q.id);
  att.set("topic", session.get("topic") || "");
  att.set("context", session.get("kind") === "drill" ? "drill" : "topic_quiz");
  att.set("chosen_index", chosenOriginal);
  att.set("is_correct", isCorrect);
  att.set("time_taken_ms", ms);
  att.set("attempted_at", new Date().toISOString().replace("T", " "));
  try { e.app.save(att); } catch (err) { e.app.logger().error("attempt save", "err", String(err)); }

  // update question aggregate stats
  try {
    q.set("attempts_count", q.getInt("attempts_count") + 1);
    if (isCorrect) q.set("correct_count", q.getInt("correct_count") + 1);
    e.app.save(q);
  } catch (_) { /* stats are best-effort */ }

  // persist the answer into the session item
  item.chosen = choice;
  item.correct = isCorrect;
  item.ms = ms;
  session.set("items", JSON.stringify(items));
  session.set("correct_count", items.filter((it) => it.correct === true).length);
  e.app.save(session);

  return e.json(200, {
    qid, correct_display_index: correctDisplay, is_correct: isCorrect,
    explanation: q.get("explanation"),
  });
});

// --------------------------------------------------------------------- flag
routerAdd("POST", "/api/quiz/flag", (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });
  const body = e.requestInfo().body || {};
  let session;
  try {
    session = e.app.findRecordById("quiz_sessions", String(body.session_id || ""));
  } catch (_) {
    return e.json(404, { message: "Session not found." });
  }
  if (session.get("user") !== auth.id) return e.json(403, { message: "Not your session." });

  const items = JSON.parse(session.get("items") || "[]");
  const item = items.find((it) => it.qid === String(body.qid || ""));
  if (item) {
    item.flagged = !!body.flagged;
    session.set("items", JSON.stringify(items));
    e.app.save(session);
  }
  return e.json(200, { ok: true });
});

// ------------------------------------------------------------------- finish
routerAdd("POST", "/api/quiz/finish", (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });
  const body = e.requestInfo().body || {};

  let session;
  try {
    session = e.app.findRecordById("quiz_sessions", String(body.session_id || ""));
  } catch (_) {
    return e.json(404, { message: "Session not found." });
  }
  if (session.get("user") !== auth.id) return e.json(403, { message: "Not your session." });

  // rank ladder (mirrors src/lib/ranks.ts — see pb/SCHEMA.md single-source note)
  const RANKS = [
    ["cadet", 0], ["constable", 500], ["sr_constable", 1200], ["head_constable", 2200],
    ["asi", 3500], ["si", 5200], ["inspector", 7500], ["ac", 10500], ["dc", 14500],
    ["second_in_command", 19500], ["commandant", 26000], ["dig", 34000], ["ig", 44000], ["dg", 56000],
  ];
  const rankForXp = (xp) => {
    let code = RANKS[0][0];
    for (const r of RANKS) if (xp >= r[1]) code = r[0];
    return code;
  };

  const items = JSON.parse(session.get("items") || "[]");
  const total = items.length;
  const correct = items.filter((it) => it.correct === true).length;
  const scorePct = total ? Math.round((correct / total) * 100) : 0;
  const kind = session.get("kind");
  const isDrill = kind === "drill";
  const pass = !isDrill && scorePct >= 70;

  // already finished → return the stored summary (idempotent)
  if (session.get("status") === "finished") {
    return e.json(200, buildSummary(e, session, items, correct, total, scorePct, null, null, 0, 0));
  }

  const topicId = session.get("topic");
  let newState = null;
  let gold = false;
  let srAdded = 0;

  if (!isDrill && topicId) {
    // tiers represented across the quiz (gold needs all tiers present)
    const tiersSeen = {};
    for (const it of items) tiersSeen[it.tier <= 2 ? 12 : it.tier === 3 ? 3 : 4] = true;
    const allTiers = tiersSeen[12] && tiersSeen[3] && tiersSeen[4];

    let prog = null;
    try {
      prog = e.app.findFirstRecordByFilter("topic_progress", "user = {:u} && topic = {:t}", { u: auth.id, t: topicId });
    } catch (_) { prog = null; }
    const priorPasses = prog ? prog.getInt("quiz_passes") : 0;

    gold = scorePct >= 90 && priorPasses >= 1 && allTiers;
    const priorState = prog ? prog.get("state") : "unread";
    // never downgrade: a failed retake keeps conquered/gold/decaying as-is
    // (a decaying territory is only restored by a pass — Prompt 08 restore flow)
    const held = priorState === "conquered" || priorState === "gold" || priorState === "decaying";
    newState = gold ? "gold" : pass ? "conquered" : held ? priorState : "read";

    const nowIso = new Date().toISOString().replace("T", " ");
    if (!prog) {
      const col = e.app.findCollectionByNameOrId("topic_progress");
      prog = new Record(col);
      prog.set("user", auth.id);
      prog.set("topic", topicId);
    }
    prog.set("state", newState);
    prog.set("best_score_pct", Math.max(prog.getInt("best_score_pct"), scorePct));
    prog.set("quiz_passes", priorPasses + (pass ? 1 : 0));
    prog.set("last_activity", nowIso);
    e.app.save(prog);
  }

  // enqueue every wrong answer into the revision stack (dup-guarded)
  const dueToday = new Date().toISOString().slice(0, 10) + " 00:00:00.000Z";
  const srCol = e.app.findCollectionByNameOrId("sr_cards");
  for (const it of items) {
    if (it.correct === false) {
      let q;
      try { q = e.app.findFirstRecordByFilter("questions", "qid = {:q}", { q: it.qid }); } catch (_) { continue; }
      let dup = null;
      try { dup = e.app.findFirstRecordByFilter("sr_cards", "user = {:u} && question = {:q}", { u: auth.id, q: q.id }); } catch (_) { dup = null; }
      if (dup) continue;
      const card = new Record(srCol);
      card.set("user", auth.id);
      card.set("question", q.id);
      card.set("ease", 2.5);
      card.set("interval_days", 0);
      card.set("reps", 0);
      card.set("due_date", dueToday);
      card.set("lapses", 0);
      card.set("suspended", false);
      try { e.app.save(card); srAdded++; } catch (err) { e.app.logger().error("sr_card save", "err", String(err)); }
    }
  }

  // award XP (Prompt 09 will formalise; kept here so the loop closes)
  const xpAwarded = correct * 10 + (pass ? 50 : 0) + (gold ? 30 : 0);
  let xpTotal = auth.getInt("xp");
  try {
    const u = e.app.findRecordById("users", auth.id);
    xpTotal = u.getInt("xp") + xpAwarded;
    u.set("xp", xpTotal);
    u.set("rank_code", rankForXp(xpTotal));
    e.app.save(u);
  } catch (err) { e.app.logger().error("xp award", "err", String(err)); }

  session.set("status", "finished");
  session.set("correct_count", correct);
  session.set("score_pct", scorePct);
  e.app.save(session);

  return e.json(200, buildSummary(e, session, items, correct, total, scorePct, newState, gold, xpAwarded, xpTotal, srAdded));

  // inlined: assemble the results payload incl. per-question review
  function buildSummary(ev, sess, its, corr, tot, pct, state, isGold, xpA, xpT, sr) {
    const byTier = { 1: [0, 0], 2: [0, 0], 3: [0, 0], 4: [0, 0] };
    const review = its.map((it, i) => {
      let explanation = "", answerIndex = -1;
      try {
        const q = ev.app.findFirstRecordByFilter("questions", "qid = {:q}", { q: it.qid });
        explanation = q.get("explanation");
        answerIndex = q.getInt("answer_index");
      } catch (_) { /* question vanished */ }
      const tk = it.tier >= 4 ? 4 : it.tier;
      byTier[tk][1]++;
      if (it.correct) byTier[tk][0]++;
      return {
        qid: it.qid, index: i, stem: it.stem, tier: it.tier, format: it.format,
        options: it.opts, chosen: it.chosen, is_correct: it.correct,
        correct_display_index: it.map.indexOf(answerIndex),
        explanation, flagged: !!it.flagged,
      };
    });
    const tiers = Object.keys(byTier)
      .filter((k) => byTier[k][1] > 0)
      .map((k) => ({ tier: Number(k), correct: byTier[k][0], total: byTier[k][1] }));
    return {
      session_id: sess.id, code: sess.get("code"), kind: sess.get("kind"),
      score_pct: pct, correct: corr, total: tot,
      pass: pct >= 70 && sess.get("kind") !== "drill",
      gold: !!isGold, state, xp_awarded: xpA, xp_total: xpT,
      wrong_count: tot - corr, sr_added: sr, tiers, review,
    };
  }
});
