/// <reference path="../../pb_data/types.d.ts" />
/**
 * UPSCVidya — the single entitlement + pricing + premium-grant path
 * (build book Prompt 14). `require`d by the money/gating handlers:
 *   const ent = require(`${__hooks}/lib/entitle.js`);
 *
 * WHY a shared module: PB's JSVM runs each route handler in an isolated pool
 * VM, so file-scope helpers are invisible inside handlers — but a CommonJS
 * module loaded via require() (the same trick lib/xp.js uses) IS visible.
 * Centralising the premium check here means every gated surface (quiz, sr,
 * test, ca) asks the SAME question, and prices are computed server-side only
 * (clients never decide what they pay — build book §14.2 beta rule).
 *
 * Pricing is the build-book matrix (locked with the user):
 *   monthly    base ₹199  beta ₹99   → +30 days
 *   till_exam  base ₹999  beta ₹499  → premium_until = 2027-08-31 (exam buffer)
 * The struck "MRP" anchors (₹399 / ₹1999) are display-only framing and never
 * charged — see src/lib/pay.ts (client mirror; keep both in sync).
 */

// ---- pricing (server-authoritative) --------------------------------------
const PRICING = {
  monthly: { base_inr: 199, beta_inr: 99, anchor_inr: 399, days: 30 },
  // till-exam access runs to a fixed buffer date past CAPF AC 2027 (build book
  // "premium_until Aug 31 2027"); "date-shift protected" copy is honoured by
  // this generous buffer beyond the exam's first-Sunday-of-August window.
  till_exam: { base_inr: 999, beta_inr: 499, anchor_inr: 1999, until: "2027-08-31" },
};

const REFERRAL_DAYS = 7; // per party, per successful referral
const REFERRAL_CAP = 10; // max referral credits a single user can earn
const DAY_MS = 86400000;

/** Parse a PB date string ("YYYY-MM-DD hh:mm:ss.SSSZ") to epoch ms, or 0. */
function toMs(v) {
  if (!v) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const ms = Date.parse(s.replace(" ", "T"));
  return isNaN(ms) ? 0 : ms;
}

/** PB date string for an epoch ms. */
function pbDate(ms) {
  return new Date(ms).toISOString().replace("T", " ");
}

/** True premium: the flag AND an unexpired premium_until (defence in depth —
 *  the nightly premium_expiry cron also clears the flag, but a check that
 *  respects the date can never over-grant even between cron runs). */
function isPremium(user) {
  if (!user || !user.getBool || !user.getBool("is_premium")) return false;
  const until = toMs(user.get("premium_until"));
  return until === 0 || until > Date.now();
}

function isAdmin(user) {
  return !!user && user.get("role") === "admin";
}

/** The one gating question every premium surface asks. `opts.free` = the
 *  surface's own free-tier flag (e.g. topic.is_free, test.is_free). */
function entitled(user, opts) {
  const free = !!(opts && opts.free);
  return free || isPremium(user) || isAdmin(user);
}

/** Does this user hold the beta_founder badge? (badge grant ships in P18; the
 *  price path must already honour it — build book §14.2.) */
function isBetaFounder(app, userId) {
  try {
    app.findFirstRecordByFilter("badges", "user = {:u} && code = 'beta_founder'", { u: userId });
    return true;
  } catch (_) {
    return false;
  }
}

/** Server-computed price for a plan, in whole rupees + paise (Razorpay wants
 *  paise). Beta founders pay the 50% price. Never trust a client amount. */
function priceFor(app, userId, plan) {
  const p = PRICING[plan];
  if (!p) throw new Error("unknown plan: " + plan);
  const beta = isBetaFounder(app, userId);
  const amount_inr = beta ? p.beta_inr : p.base_inr;
  return { plan, amount_inr, amount_paise: amount_inr * 100, beta, anchor_inr: p.anchor_inr };
}

/** premium_until target for a plan, extending from the later of now / current
 *  access (monthly stacks; till_exam jumps to the fixed date). */
function premiumUntilMs(plan, fromMs) {
  const p = PRICING[plan];
  if (plan === "monthly") return fromMs + p.days * DAY_MS;
  // till_exam: end-of-day on the buffer date (never shorten an existing longer
  // access — a monthly buyer upgrading keeps whichever is later)
  const fixed = toMs(p.until + " 23:59:59.000Z");
  return Math.max(fromMs, fixed);
}

/** Grant/extend premium for a paid plan. Applies any banked referral days.
 *  Caller guarantees this runs at most once per payment (payment status is the
 *  idempotency ledger), so extension here is safe. */
function grantPremium(app, userId, plan) {
  const user = app.findRecordById("users", userId);
  const now = Date.now();
  // extend from the later of now or an existing unexpired access
  const base = isPremium(user) ? Math.max(now, toMs(user.get("premium_until"))) : now;
  let untilMs = premiumUntilMs(plan, base);

  // fold in banked referral days (start-later credit realising on purchase)
  const banked = user.getInt("premium_credit_days");
  if (banked > 0) {
    untilMs += banked * DAY_MS;
    user.set("premium_credit_days", 0);
  }

  user.set("is_premium", true);
  user.set("premium_until", pbDate(untilMs));
  user.set("premium_plan", plan);
  app.save(user);
  return { premium_until: pbDate(untilMs), plan };
}

/** Add REFERRAL_DAYS to one party: extend live premium, else bank the days. */
function applyReferralDays(app, userId) {
  const user = app.findRecordById("users", userId);
  if (isPremium(user)) {
    const untilMs = Math.max(Date.now(), toMs(user.get("premium_until"))) + REFERRAL_DAYS * DAY_MS;
    user.set("premium_until", pbDate(untilMs));
  } else {
    user.set("premium_credit_days", user.getInt("premium_credit_days") + REFERRAL_DAYS);
  }
  app.save(user);
}

/** Grant a referral reward to BOTH parties, exactly once, on the referred
 *  user's first quiz completion (build book §14.6). Idempotent via the unique
 *  (user, referred_user) index + an explicit existence guard; capped at
 *  REFERRAL_CAP credits earned per user. Safe to call on every quiz finish.
 *  Returns true if it granted this call, false if already granted / capped. */
function grantReferralCredit(app, referrerId, refereeId) {
  if (!referrerId || !refereeId || referrerId === refereeId) return false;

  // already granted for this referral? (guard on the referrer→referee row)
  try {
    app.findFirstRecordByFilter(
      "referral_credits",
      "user = {:u} && referred_user = {:r}",
      { u: referrerId, r: refereeId }
    );
    return false; // exists → done before
  } catch (_) { /* not yet granted */ }

  const nowIso = pbDate(Date.now());
  let granted = false;

  // credit each party: (grantee, counterparty)
  const pairs = [
    [referrerId, refereeId],
    [refereeId, referrerId],
  ];
  for (const [grantee, counterparty] of pairs) {
    // per-user cap on earned credits
    let count = 0;
    try {
      const rows = app.findRecordsByFilter(
        "referral_credits", "user = {:u}", "", REFERRAL_CAP + 1, 0, { u: grantee }
      );
      count = rows.length;
    } catch (_) { count = 0; }
    if (count >= REFERRAL_CAP) continue;

    try {
      const col = app.findCollectionByNameOrId("referral_credits");
      const rec = new Record(col);
      rec.set("user", grantee);
      rec.set("referred_user", counterparty);
      rec.set("days_granted", REFERRAL_DAYS);
      rec.set("granted_at", nowIso);
      app.save(rec); // unique (user, referred_user) → idempotent
      applyReferralDays(app, grantee);
      granted = true;
    } catch (_) { /* already recorded for this pair */ }
  }
  return granted;
}

module.exports = {
  PRICING, REFERRAL_DAYS, REFERRAL_CAP,
  toMs, pbDate,
  isPremium, isAdmin, entitled, isBetaFounder,
  priceFor, premiumUntilMs, grantPremium,
  applyReferralDays, grantReferralCredit,
};
