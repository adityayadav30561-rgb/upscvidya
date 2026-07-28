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
  // Quiz length is NOT capped: a session serves the topic's entire live pool, so
  // a chapter with 50 authored questions gives a 50-question quiz. (This used to
  // be a fixed 12/15 sample.) N is finalised once the pool is loaded, below.
  let N = 0;

  // resolve topic (chapters live in `topics`; drills have no topic row)
  let topic = null;
  try {
    topic = e.app.findFirstRecordByFilter("topics", "id_code = {:c} && status = 'live'", { c: code });
  } catch (_) {
    topic = null;
  }

  // entitlement: free topic, premium user, or admin (drills are free).
  // Centralised in lib/entitle so every gated surface asks the same question
  // (and premium respects premium_until, not just the flag).
  if (topic && !isDrill) {
    const ent = require(`${__hooks}/lib/entitle.js`);
    if (!ent.entitled(auth, { free: topic.getBool("is_free") })) {
      return e.json(403, { message: "This territory's quiz is premium.", code: "premium_required" });
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
  // serve every live question this territory has — no floor, no ceiling
  N = pool.length;

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

  // anti-farm (Prompt 09): a repeat CORRECT answer on a question the user
  // already answered correctly within 7 days earns 0 XP at finish time.
  // Checked before this attempt is recorded; SR reviews are exempt (they
  // never route through this endpoint).
  let farmed = false;
  if (isCorrect) {
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().replace("T", " ");
    try {
      e.app.findFirstRecordByFilter(
        "attempts",
        "user = {:u} && question = {:q} && is_correct = true && attempted_at >= {:c}",
        { u: auth.id, q: q.id, c: cutoff }
      );
      farmed = true; // found a recent correct attempt
    } catch (_) {
      farmed = false;
    }
  }

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
  item.farm = farmed;
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

  const xp = require(`${__hooks}/lib/xp.js`); // the single awardXP path (Prompt 09)

  const items = JSON.parse(session.get("items") || "[]");
  const total = items.length;
  const correct = items.filter((it) => it.correct === true).length;
  const scorePct = total ? Math.round((correct / total) * 100) : 0;
  const kind = session.get("kind");
  const isDrill = kind === "drill";
  const pass = !isDrill && scorePct >= 70;

  // already finished → return the stored summary (idempotent; no re-award)
  if (session.get("status") === "finished") {
    return e.json(200, buildSummary(e, session, items, correct, total, scorePct, null, null, 0, auth.getInt("xp"), 0, null, null));
  }

  const topicId = session.get("topic");
  let newState = null;
  let gold = false;
  let srAdded = 0;
  let newlyConquered = false;
  let regionComplete = null; // region code when the 500 bonus fires

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

    newlyConquered = !held && (newState === "conquered" || newState === "gold");

    // region completion: every CHAPTER of the region conquered/gold, measured
    // against the master-doc chapter counts (partial live content can't fire it)
    if (newlyConquered) {
      try {
        const topicRec = e.app.findRecordById("topics", topicId);
        const region = topicRec.get("region");
        const expected = xp.REGION_CHAPTERS[region] || 999;
        const regionTopics = e.app.findRecordsByFilter(
          "topics",
          "region = {:r} && kind = 'chapter' && status = 'live'",
          "", 200, 0, { r: region }
        );
        let heldCount = 0;
        for (const t of regionTopics) {
          try {
            const p = e.app.findFirstRecordByFilter(
              "topic_progress",
              "user = {:u} && topic = {:t} && (state = 'conquered' || state = 'gold')",
              { u: auth.id, t: t.id }
            );
            if (p) heldCount++;
          } catch (_) { /* not held */ }
        }
        if (heldCount >= expected) {
          regionComplete = region;
          xp.awardBadge(e.app, auth.id, "region_" + region);
        }
      } catch (err) {
        e.app.logger().error("region check", "err", String(err));
      }
    }
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

  // ---- XP (Prompt 09 rules, single awardXP path) ----
  let xpAwarded = 0;
  let rankUp = null;
  let xpTotal = auth.getInt("xp");
  try {
    if (isDrill) {
      xpAwarded = 40; // drill session complete: flat
    } else {
      // per-correct-answer 10 × tier multiplier; anti-farmed answers give 0
      for (const it of items) {
        if (it.correct === true) xpAwarded += xp.answerXp(it.tier, !!it.farm);
      }
      if (gold) xpAwarded += 150;
      else if (newlyConquered) xpAwarded += 100;
      else if (pass) xpAwarded += 0; // re-pass of an already-held topic: answers only
      if (regionComplete) xpAwarded += 500;
    }
    const res = xp.awardXP(e.app, auth.id, xpAwarded, isDrill ? "drill" : "topic_quiz");
    xpTotal = res.xpTotal;
    rankUp = res.rankUp;
    if (newlyConquered) xp.awardBadge(e.app, auth.id, "first_conquest");
  } catch (err) {
    e.app.logger().error("xp award", "err", String(err));
  }

  // ---- streak: a finished topic quiz is a qualifying activity ----
  let streak = null;
  if (!isDrill) {
    try {
      streak = xp.applyStreak(e.app, auth.id);
    } catch (err) {
      e.app.logger().error("streak", "err", String(err));
    }
  }

  // ---- referral reward (Prompt 14): a referred user completing a real topic
  // quiz is the quality gate — grants +7 premium days to BOTH parties, exactly
  // once (idempotent in lib/entitle). Only the true finish reaches here (the
  // "already finished" branch returned at the top), and drills don't qualify.
  if (!isDrill) {
    const referredBy = auth.get("referred_by");
    if (referredBy) {
      try {
        const ent = require(`${__hooks}/lib/entitle.js`);
        ent.grantReferralCredit(e.app, referredBy, auth.id);
      } catch (err) {
        e.app.logger().error("referral grant", "err", String(err));
      }
    }
  }

  session.set("status", "finished");
  session.set("correct_count", correct);
  session.set("score_pct", scorePct);
  e.app.save(session);

  return e.json(200, buildSummary(e, session, items, correct, total, scorePct, newState, gold, xpAwarded, xpTotal, srAdded, rankUp, streak));

  // inlined: assemble the results payload incl. per-question review
  function buildSummary(ev, sess, its, corr, tot, pct, state, isGold, xpA, xpT, sr, rankU, streakInfo) {
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
      rank_up: rankU || null,
      streak: streakInfo
        ? { current: streakInfo.current, counted: streakInfo.counted, freezes_used: streakInfo.freezesUsed, freezes_left: streakInfo.freezes }
        : null,
    };
  }
});
