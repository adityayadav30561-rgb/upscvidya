/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — Razorpay payments (build book Prompt 14).
 *
 *   POST /api/pay/order    {plan}                                   → order
 *   POST /api/pay/verify   {razorpay_order_id, _payment_id, _sig}   → grant
 *   POST /api/pay/webhook  (Razorpay → us)                          → grant
 *   POST /api/pay/restore  {}                                       → re-sync
 *
 * Standard one-time checkout (NOT subscriptions — both plans are single
 * payments). Prices are SERVER-computed (lib/entitle.priceFor) so a tampered
 * client can never pick its own amount, and beta founders get 50% priced here.
 *
 * IDEMPOTENCY / anti-double-extend (the key acceptance): the `payments` row —
 * unique on razorpay_order_id — is the ledger. Premium is granted only on the
 * created→paid transition, inside a transaction, so a replayed webhook OR a
 * webhook racing the client callback extends access exactly once.
 *
 * Signature trust:
 *   /verify   — HMAC-SHA256(order_id|payment_id, key_secret): the signed string
 *               is one WE construct, so hs256 verification is exact & reliable.
 *   /webhook  — we do NOT rely on hashing the raw body (PB's JSVM can't
 *               re-serialise it byte-identically); instead we CONFIRM with an
 *               authenticated server→Razorpay fetch of the order's payments.
 *               That is strictly stronger than a body-HMAC and dodges the
 *               raw-body pitfall.
 *
 * PB's JSVM isolates each handler in a pool VM: file-scope helpers are invisible
 * inside a handler, so every helper is inlined per handler (except lib/*.js,
 * which is loaded via require()).
 */

// ---------------------------------------------------------------- pay/order
routerAdd("POST", "/api/pay/order", (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });

  const ent = require(`${__hooks}/lib/entitle.js`);
  const body = e.requestInfo().body || {};
  const plan = String(body.plan || "");
  if (plan !== "monthly" && plan !== "till_exam") {
    return e.json(400, { message: "plan must be 'monthly' or 'till_exam'." });
  }

  const price = ent.priceFor(e.app, auth.id, plan); // {amount_inr, amount_paise, beta, anchor_inr}
  const keyId = $os.getenv("RAZORPAY_KEY_ID");
  const keySecret = $os.getenv("RAZORPAY_KEY_SECRET");
  const simulate = $os.getenv("PAY_SIMULATE") === "1";

  // create the local ledger row up front (status=created)
  const receipt = "rcpt_" + auth.id + "_" + Date.now();
  let orderId, providerRaw;

  if (keyId && keySecret) {
    // real Razorpay order
    const b64 = (function (s) {
      // base64 (goja has no btoa) — encode the "key:secret" basic-auth pair
      const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      let out = "", i = 0;
      while (i < s.length) {
        const c1 = s.charCodeAt(i++), c2 = s.charCodeAt(i++), c3 = s.charCodeAt(i++);
        const e1 = c1 >> 2;
        const e2 = ((c1 & 3) << 4) | (c2 >> 4);
        let e3 = ((c2 & 15) << 2) | (c3 >> 6);
        let e4 = c3 & 63;
        if (isNaN(c2)) { e3 = e4 = 64; } else if (isNaN(c3)) { e4 = 64; }
        out += A.charAt(e1) + A.charAt(e2) +
          (e3 === 64 ? "=" : A.charAt(e3)) + (e4 === 64 ? "=" : A.charAt(e4));
      }
      return out;
    })(keyId + ":" + keySecret);

    let res;
    try {
      res = $http.send({
        url: "https://api.razorpay.com/v1/orders",
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Basic " + b64 },
        body: JSON.stringify({
          amount: price.amount_paise,
          currency: "INR",
          receipt,
          notes: { user: auth.id, plan },
        }),
        timeout: 20,
      });
    } catch (err) {
      e.app.logger().error("razorpay order", "err", String(err));
      return e.json(502, { message: "Could not reach the payment gateway." });
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      e.app.logger().error("razorpay order", "status", res.statusCode, "body", String(res.body));
      return e.json(502, { message: "Payment gateway rejected the order." });
    }
    const data = res.json || {};
    orderId = data.id;
    providerRaw = data;
  } else if (simulate) {
    // dev/e2e simulation — ONLY when explicitly enabled and no live keys.
    // Never active in production (keys present ⇒ this branch is unreachable).
    orderId = "order_sim_" + receipt;
    providerRaw = { simulated: true, amount: price.amount_paise };
  } else {
    return e.json(503, {
      message: "Payments are not configured on this server.",
      code: "pay_unconfigured",
    });
  }

  // ledger row
  const col = e.app.findCollectionByNameOrId("payments");
  const pay = new Record(col);
  pay.set("user", auth.id);
  pay.set("razorpay_order_id", orderId);
  pay.set("amount_inr", price.amount_inr);
  pay.set("plan", plan);
  pay.set("status", "created");
  pay.set("raw", { order: providerRaw, price });
  try {
    e.app.save(pay);
  } catch (err) {
    e.app.logger().error("payment ledger", "err", String(err));
    return e.json(500, { message: "Could not record the order." });
  }

  return e.json(200, {
    order_id: orderId,
    amount_inr: price.amount_inr,
    amount_paise: price.amount_paise,
    currency: "INR",
    plan,
    beta: price.beta,
    anchor_inr: price.anchor_inr,
    key_id: keyId || "",
    simulate: !keyId && simulate,
    // Razorpay checkout prefill / display
    name: "UPSCVidya",
    description: plan === "till_exam" ? "Premium — till your exam" : "Premium — monthly",
  });
});

// --------------------------------------------------------------- pay/verify
// Client callback after the Razorpay sheet closes (build book "client callback
// double-verification"). Verifies the handshake HMAC, then grants once.
routerAdd("POST", "/api/pay/verify", (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });

  const ent = require(`${__hooks}/lib/entitle.js`);
  const body = e.requestInfo().body || {};
  const orderId = String(body.razorpay_order_id || "");
  const paymentId = String(body.razorpay_payment_id || "");
  const signature = String(body.razorpay_signature || "");
  if (!orderId) return e.json(400, { message: "razorpay_order_id is required." });

  // resolve OUR ledger row for this order (also proves ownership)
  let pay;
  try {
    pay = e.app.findFirstRecordByFilter("payments", "razorpay_order_id = {:o}", { o: orderId });
  } catch (_) {
    return e.json(404, { message: "Unknown order." });
  }
  if (pay.get("user") !== auth.id) return e.json(403, { message: "Not your order." });
  const plan = pay.get("plan");

  const keySecret = $os.getenv("RAZORPAY_KEY_SECRET");
  const simulate = $os.getenv("PAY_SIMULATE") === "1";

  // signature check
  let ok = false;
  if (keySecret) {
    // Razorpay: hex HMAC-SHA256(order_id + "|" + payment_id, key_secret)
    const expected = $security.hs256(orderId + "|" + paymentId, keySecret);
    ok = !!signature && $security.equal(expected, signature);
  } else if (simulate && !$os.getenv("RAZORPAY_KEY_ID")) {
    ok = signature === "SIMULATED";
  }
  if (!ok) {
    pay.set("status", "failed");
    pay.set("raw", Object.assign({}, pay.get("raw"), { verify_failed_at: new Date().toISOString() }));
    e.app.save(pay);
    return e.json(400, { message: "Payment signature verification failed." });
  }

  // grant exactly once (created→paid transition inside a txn)
  let granted;
  try {
    e.app.runInTransaction((txApp) => {
      const fresh = txApp.findFirstRecordByFilter("payments", "razorpay_order_id = {:o}", { o: orderId });
      if (fresh.get("status") === "paid") {
        granted = { already: true, premium_until: null };
        return;
      }
      fresh.set("status", "paid");
      fresh.set("razorpay_payment_id", paymentId);
      fresh.set("raw", Object.assign({}, fresh.get("raw"), { verified_at: new Date().toISOString(), source: "callback" }));
      txApp.save(fresh);
      const res = ent.grantPremium(txApp, auth.id, plan);
      granted = { already: false, premium_until: res.premium_until };
    });
  } catch (err) {
    e.app.logger().error("pay verify grant", "err", String(err));
    return e.json(500, { message: "Payment recorded but activation failed — tap Restore purchase." });
  }

  return e.json(200, {
    status: "paid",
    plan,
    already: !!granted.already,
    premium_until: granted.premium_until,
  });
});

// -------------------------------------------------------------- pay/webhook
// Razorpay → us (payment.captured / order.paid). Public route. We CONFIRM via
// an authenticated fetch of the order's payments rather than trusting a
// raw-body hash, then grant idempotently. Replays are no-ops.
routerAdd("POST", "/api/pay/webhook", (e) => {
  const ent = require(`${__hooks}/lib/entitle.js`);
  const body = e.requestInfo().body || {};

  // pull the order id out of the event payload (shape-tolerant)
  let orderId = "";
  let paymentId = "";
  try {
    const ent0 = (body.payload && (body.payload.payment || body.payload.order)) || {};
    const en = ent0.entity || {};
    orderId = String(en.order_id || en.id || "");
    paymentId = String(en.id || "");
    if (en.entity === "order") { orderId = String(en.id || ""); paymentId = ""; }
  } catch (_) { /* fall through */ }
  if (!orderId) return e.json(200, { ignored: true }); // ack, nothing actionable

  // our ledger row (ignore orders we never created)
  let pay;
  try {
    pay = e.app.findFirstRecordByFilter("payments", "razorpay_order_id = {:o}", { o: orderId });
  } catch (_) {
    return e.json(200, { ignored: true });
  }
  if (pay.get("status") === "paid") return e.json(200, { ok: true, already: true });

  const userId = pay.get("user");
  const plan = pay.get("plan");
  const keyId = $os.getenv("RAZORPAY_KEY_ID");
  const keySecret = $os.getenv("RAZORPAY_KEY_SECRET");
  const simulate = $os.getenv("PAY_SIMULATE") === "1";

  // CONFIRM the payment really is captured for the right amount
  let captured = false;
  let confirmPaymentId = paymentId;
  if (keyId && keySecret) {
    const b64 = (function (s) {
      const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      let out = "", i = 0;
      while (i < s.length) {
        const c1 = s.charCodeAt(i++), c2 = s.charCodeAt(i++), c3 = s.charCodeAt(i++);
        const e1 = c1 >> 2, e2 = ((c1 & 3) << 4) | (c2 >> 4);
        let e3 = ((c2 & 15) << 2) | (c3 >> 6), e4 = c3 & 63;
        if (isNaN(c2)) { e3 = e4 = 64; } else if (isNaN(c3)) { e4 = 64; }
        out += A.charAt(e1) + A.charAt(e2) + (e3 === 64 ? "=" : A.charAt(e3)) + (e4 === 64 ? "=" : A.charAt(e4));
      }
      return out;
    })(keyId + ":" + keySecret);
    try {
      const res = $http.send({
        url: "https://api.razorpay.com/v1/orders/" + orderId + "/payments",
        method: "GET",
        headers: { authorization: "Basic " + b64 },
        timeout: 20,
      });
      const data = (res.json && res.json.items) || [];
      const wantPaise = pay.getInt("amount_inr") * 100;
      for (const p of data) {
        if (p.status === "captured" && Number(p.amount) === wantPaise) {
          captured = true;
          confirmPaymentId = String(p.id || confirmPaymentId);
          break;
        }
      }
    } catch (err) {
      e.app.logger().error("webhook confirm", "err", String(err));
      return e.json(502, { message: "confirm failed" }); // Razorpay will retry
    }
  } else if (simulate) {
    captured = true; // dev/e2e
  } else {
    return e.json(503, { message: "unconfigured" });
  }

  if (!captured) return e.json(200, { ok: false, reason: "not_captured" });

  try {
    e.app.runInTransaction((txApp) => {
      const fresh = txApp.findFirstRecordByFilter("payments", "razorpay_order_id = {:o}", { o: orderId });
      if (fresh.get("status") === "paid") return; // race with the callback — done
      fresh.set("status", "paid");
      if (confirmPaymentId) fresh.set("razorpay_payment_id", confirmPaymentId);
      fresh.set("raw", Object.assign({}, fresh.get("raw"), { webhook_at: new Date().toISOString(), source: "webhook" }));
      txApp.save(fresh);
      ent.grantPremium(txApp, userId, plan);
    });
  } catch (err) {
    e.app.logger().error("webhook grant", "err", String(err));
    return e.json(500, { message: "grant failed" });
  }
  return e.json(200, { ok: true });
});

// -------------------------------------------------------------- pay/restore
// Restore purchase: re-derive entitlement from the user's paid payments (build
// book §14.3 "restore-purchase flow — re-check by logged-in identity"). Covers
// the case where a payment succeeded but activation missed (e.g. the callback
// never returned). Idempotent.
routerAdd("POST", "/api/pay/restore", (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });
  const ent = require(`${__hooks}/lib/entitle.js`);

  // already active? just report it
  const me = e.app.findRecordById("users", auth.id);
  if (ent.isPremium(me)) {
    return e.json(200, { restored: false, premium: true, premium_until: me.get("premium_until"), plan: me.get("premium_plan") });
  }

  // find the most recent PAID payment for this user
  let pay = null;
  try {
    const rows = e.app.findRecordsByFilter("payments", "user = {:u} && status = 'paid'", "-created", 1, 0, { u: auth.id });
    pay = rows[0] || null;
  } catch (_) { pay = null; }
  if (!pay) return e.json(200, { restored: false, premium: false });

  // re-grant from the paid record (grantPremium extends from now for monthly;
  // for a monthly plan whose window already lapsed this would re-activate — so
  // only restore till_exam automatically, and monthly only if still in-window
  // by original grant. Simplest correct rule: restore reflects the plan the
  // payment bought; monthly that has genuinely lapsed is NOT resurrected.)
  const plan = pay.get("plan");
  if (plan === "monthly") {
    // monthly access is time-boxed; if it lapsed, there is nothing to restore
    return e.json(200, { restored: false, premium: false, note: "monthly access has ended" });
  }
  const res = ent.grantPremium(e.app, auth.id, plan);
  return e.json(200, { restored: true, premium: true, premium_until: res.premium_until, plan });
});
