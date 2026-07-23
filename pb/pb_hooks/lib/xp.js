/// <reference path="../../pb_data/types.d.ts" />
/**
 * UPSCVidya — the single awardXP path (build book Prompt 09).
 * Required by quiz.pb.js / sr.pb.js handlers via:
 *   const xp = require(`${__hooks}/lib/xp.js`);
 * Clients never write XP: every mutation funnels through here, inside hook
 * handlers running as superuser. Pure math mirrors src/lib/xp.ts — the client
 * unit-test table guards both.
 */

// 14-grade CAPF ladder — design is source of truth (mirrors src/lib/ranks.ts)
const RANKS = [
  ["cadet", 0], ["constable", 500], ["sr_constable", 1200], ["head_constable", 2200],
  ["asi", 3500], ["si", 5200], ["inspector", 7500], ["ac", 10500], ["dc", 14500],
  ["second_in_command", 19500], ["commandant", 26000], ["dig", 34000], ["ig", 44000], ["dg", 56000],
];

function rankForXp(xp) {
  let code = RANKS[0][0];
  for (const r of RANKS) if (xp >= r[1]) code = r[0];
  return code;
}

/** tier multiplier: T1-2 ×1.0, T3 ×1.4, T4 ×1.8, T5 ×2.2 */
function tierMult(tier) {
  return tier <= 2 ? 1.0 : tier === 3 ? 1.4 : tier === 4 ? 1.8 : 2.2;
}

/** XP for one correct topic-quiz answer (0 when anti-farmed). */
function answerXp(tier, farmed) {
  return farmed ? 0 : Math.round(10 * tierMult(tier));
}

/** XP for one correct SR review: 8 flat, 12 if the card ever lapsed. */
function srReviewXp(lapses) {
  return lapses >= 1 ? 12 : 8;
}

// region → chapter count from the master doc (drills excluded). Region
// completion means every CHAPTER conquered/gold — checked against these
// totals, not against whatever happens to be live, so partial content can
// never trigger the 500 bonus early.
const REGION_CHAPTERS = {
  foundations: 12, system: 5, centre: 12, states: 9,
  grassroots: 4, institutions: 29, dynamics: 18, courtroom: 5,
};

/** IST calendar date (YYYY-MM-DD) for a given ms timestamp. */
function istDate(ms) {
  return new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Monday 00:00 IST of the week containing `ms`, as a PB date string.
 *  Leaderboard entries key on (user, week_start), so weeks accumulate as
 *  history instead of being overwritten. */
function weekStartIST(ms) {
  const ist = new Date(ms + 5.5 * 3600 * 1000);
  const day = ist.getUTCDay(); // 0=Sun after the IST shift
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  const monday = new Date(ist.getTime() - diff * 86400000);
  return monday.toISOString().slice(0, 10) + " 00:00:00.000Z";
}

/** Whole days between two YYYY-MM-DD dates. */
function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/** Pure streak step (mirrors src/lib/xp.ts streakStep — see its test table).
 *  Runs when a qualifying activity completes. Freezes auto-apply on gaps. */
function streakStep(state, today) {
  const { current, best, freezes, last } = state;
  if (last === today) {
    return { current, best, freezes, last, counted: false, freezesUsed: 0 };
  }
  let next, usedFreezes = 0, nextFreezes = freezes;
  if (!last) {
    next = 1;
  } else {
    const gap = daysBetween(last, today) - 1;
    if (gap <= 0) {
      next = current + 1;
    } else if (gap <= freezes) {
      usedFreezes = gap;
      nextFreezes = freezes - gap;
      next = current + 1; // freeze preserved the chain
    } else {
      next = 1; // chain broken
    }
  }
  return {
    current: next,
    best: Math.max(best, next),
    freezes: nextFreezes,
    last: today,
    counted: true,
    freezesUsed: usedFreezes,
  };
}

/** Append an xp_events row + bump user XP/rank. Returns {xpTotal, rankUp}. */
function awardXP(app, userId, amount, reason) {
  const user = app.findRecordById("users", userId);
  const before = user.getInt("xp");
  const after = before + amount;
  const rankBefore = rankForXp(before);
  const rankAfter = rankForXp(after);
  user.set("xp", after);
  user.set("rank_code", rankAfter);
  app.save(user);

  if (amount !== 0) {
    try {
      const col = app.findCollectionByNameOrId("xp_events");
      const ev = new Record(col);
      ev.set("user", userId);
      ev.set("amount", amount);
      ev.set("reason", reason);
      app.save(ev);
    } catch (err) {
      app.logger().error("xp_event save", "err", String(err));
    }

    // Prompt 10: the same hook maintains this week's battalion standing.
    try {
      bumpLeaderboard(app, user, amount);
    } catch (err) {
      app.logger().error("leaderboard bump", "err", String(err));
    }
  }

  return {
    xpTotal: after,
    rankUp: rankBefore !== rankAfter ? { from: rankBefore, to: rankAfter } : null,
  };
}

/** Increment this week's leaderboard entry for the user's battalion.
 *  Entries are keyed (user, week_start) — upsert, never overwrite history. */
function bumpLeaderboard(app, user, amount) {
  const battalion = user.get("battalion_id");
  if (!battalion) return;
  const weekStart = weekStartIST(Date.now());

  let entry = null;
  try {
    entry = app.findFirstRecordByFilter(
      "leaderboard_entries",
      "user = {:u} && week_start = {:w}",
      { u: user.id, w: weekStart }
    );
  } catch (_) {
    entry = null;
  }

  if (!entry) {
    const col = app.findCollectionByNameOrId("leaderboard_entries");
    entry = new Record(col);
    entry.set("user", user.id);
    entry.set("battalion", battalion);
    entry.set("week_start", weekStart);
    entry.set("xp_week", 0);
  }
  entry.set("battalion", battalion); // follow a re-assignment
  entry.set("xp_week", entry.getInt("xp_week") + amount);
  app.save(entry);
}

/** Grant a badge once (unique index makes this idempotent). */
function awardBadge(app, userId, code) {
  try {
    const col = app.findCollectionByNameOrId("badges");
    const b = new Record(col);
    b.set("user", userId);
    b.set("code", code);
    app.save(b);
    return true;
  } catch (_) {
    return false; // already earned
  }
}

/** Apply a qualifying streak activity to the user row. Returns step result +
 *  any milestone badges granted (7/30/100). */
function applyStreak(app, userId) {
  const user = app.findRecordById("users", userId);
  const today = istDate(Date.now());
  const step = streakStep(
    {
      current: user.getInt("streak_current"),
      best: user.getInt("streak_best"),
      freezes: user.getInt("streak_freezes"),
      // PB date fields render as "YYYY-MM-DD hh:mm:ss.SSSZ" — normalise to the
      // bare IST date or same-day dedupe would never match
      last: String(user.get("last_active_date") || "").slice(0, 10),
    },
    today
  );
  if (!step.counted) return step;

  user.set("streak_current", step.current);
  user.set("streak_best", step.best);
  user.set("streak_freezes", step.freezes);
  user.set("last_active_date", step.last);
  app.save(user);

  for (const m of [7, 30, 100]) {
    if (step.current === m) awardBadge(app, userId, "streak_" + m);
  }
  return step;
}

module.exports = {
  RANKS, rankForXp, tierMult, answerXp, srReviewXp,
  REGION_CHAPTERS, istDate, weekStartIST, daysBetween, streakStep,
  awardXP, awardBadge, applyStreak, bumpLeaderboard,
};
