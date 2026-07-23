/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — payments + referrals (build book Prompt 14).
 *
 * The `payments` and `referral_credits` collections already ship in the init
 * migration; Prompt 14 only adds the pieces the money/referral flows need:
 *
 *   1. users.premium_credit_days — banked referral days for a FREE referrer.
 *      A referred user's first quiz grants +7 days to both parties; a party who
 *      is already premium gets premium_until extended immediately, a free party
 *      banks the days here and they apply on their next purchase ("start-later
 *      credit" — build book §14.6). Server-owned, so the users updateRule blocks
 *      self-writes exactly like xp/premium fields.
 *
 *   2. payments unique index on razorpay_order_id — the idempotency ledger.
 *      /verify and /webhook both resolve the payment by order id and only grant
 *      when flipping created→paid, so a replayed webhook cannot double-extend.
 *
 *   3. referral_credits unique index on (user, referred_user) — makes the
 *      grant idempotent: "credit exactly once, to both parties" (build book
 *      acceptance) is enforced by the DB, not just by a code check.
 */
migrate(
  (app) => {
    // ---- users.premium_credit_days (banked referral days) ------------------
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(
      new Field({ type: "number", name: "premium_credit_days", onlyInt: true, min: 0 })
    );
    // block self-writes to the banked-days field (mirrors the other server-owned
    // guards already in the rule)
    users.updateRule =
      users.updateRule + " && @request.body.premium_credit_days:isset = false";
    app.save(users);

    // ---- payments: unique order-id index (idempotency ledger) --------------
    const payments = app.findCollectionByNameOrId("payments");
    // partial unique — blank order ids (should not occur) never collide
    payments.addIndex(
      "idx_payments_order",
      true,
      "razorpay_order_id",
      "razorpay_order_id != ''"
    );
    app.save(payments);

    // ---- referral_credits: one credit per (grantee, counterparty) ----------
    const credits = app.findCollectionByNameOrId("referral_credits");
    credits.addIndex(
      "idx_referral_credits_pair",
      true,
      "user, referred_user",
      ""
    );
    app.save(credits);
  },
  (app) => {
    // rollback
    try {
      const credits = app.findCollectionByNameOrId("referral_credits");
      credits.removeIndex("idx_referral_credits_pair");
      app.save(credits);
    } catch (_) { /* absent */ }

    try {
      const payments = app.findCollectionByNameOrId("payments");
      payments.removeIndex("idx_payments_order");
      app.save(payments);
    } catch (_) { /* absent */ }

    try {
      const users = app.findCollectionByNameOrId("users");
      users.fields.removeByName("premium_credit_days");
      users.updateRule = users.updateRule.replace(
        " && @request.body.premium_credit_days:isset = false",
        ""
      );
      app.save(users);
    } catch (_) { /* absent */ }
  }
);
