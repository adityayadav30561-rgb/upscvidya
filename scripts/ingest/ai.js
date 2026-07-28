/**
 * AI enhancement for the ingestion CLI: normalise, classify tier/format, draft
 * explanations, rewrite commercial-source wording.
 *
 * Providers are resolved from env AT CALL TIME. All five speak the OpenAI
 * chat-completions shape, so only base URL + model + key differ. Chain order:
 *
 *   OPENROUTER_API_KEY (+ OPENROUTER_MODEL)  → openrouter.ai            [primary]
 *   GEMINI_API_KEY     (+ GEMINI_MODEL)      → Google OpenAI-compat shim
 *   MISTRAL_API_KEY    (+ MISTRAL_MODEL)     → api.mistral.ai
 *   OPENCODE_API_KEY   (+ OPENCODE_MODEL)    → opencode.ai/zen (all free)
 *   GROQ_API_KEY       (+ GROQ_MODEL)        → api.groq.com
 *
 * This is a real FAILOVER chain, not just a preference order: a call starts at
 * the first configured provider and moves down the list when that one is out of
 * quota (429), rejecting the key (401/403), missing the model (404), or still
 * erroring after its in-provider retries. It only throws once every provider is
 * spent — so a run survives OpenRouter's 50/day cap by finishing on the rest.
 * Quotas differ by orders of magnitude (50/day vs 50/min).
 *
 * Set AI_PROVIDER=openrouter|gemini|mistral|opencode|groq to pin the chain to
 * exactly one provider (no failover) — to spend a specific quota deliberately.
 *
 * Defaults to NVIDIA Nemotron 3 Ultra (free tier). Two consequences of that
 * choice are handled here and must not be removed:
 *   - it is a REASONING model, so the JSON can arrive wrapped in <think> blocks
 *     or ``` fences, and `response_format` is not guaranteed to be honoured by
 *     the underlying provider → see extractJson().
 *   - the free tier is rate-limited (~20 req/min) → per-provider minimum call
 *     spacing + 429/5xx retry with backoff.
 */
import { FORMATS } from "../content/lib.js";

const PROVIDERS = [
  {
    name: "openrouter",
    keyVar: "OPENROUTER_API_KEY",
    modelVar: "OPENROUTER_MODEL",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    // Optional attribution headers; OpenRouter ignores them if unrecognised.
    headers: { "HTTP-Referer": "https://upscvidya.app", "X-Title": "UPSCVidya" },
    minIntervalMs: 3500, // free tier ≈ 20 req/min
  },
  {
    // Google's OpenAI-compatibility shim — Bearer auth, native json_object mode.
    // Pro models are quota-starved on Antigravity (AQ.*) keys; Flash is usable.
    name: "gemini",
    keyVar: "GEMINI_API_KEY",
    modelVar: "GEMINI_MODEL",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-3.6-flash",
    headers: {},
    minIntervalMs: 1000,
  },
  {
    // 50 req/min AND 50k tokens/min — the token cap binds first at our prompt
    // size (~1.5k/call ⇒ ~33/min), hence the 1800ms spacing.
    name: "mistral",
    keyVar: "MISTRAL_API_KEY",
    modelVar: "MISTRAL_MODEL",
    url: "https://api.mistral.ai/v1/chat/completions",
    model: "mistral-large-latest",
    headers: {},
    minIntervalMs: 1800,
  },
  {
    // OpenCode Zen gateway — all models are free tier. Publishes no rate-limit
    // headers, and some models 429/400 from their upstream, so failover matters
    // here more than elsewhere. Working: deepseek-v4-flash, mimo-v2.5,
    // nemotron-3-ultra, north-mini-code. Broken as of setup: ling-3.0-flash (400).
    name: "opencode",
    keyVar: "OPENCODE_API_KEY",
    modelVar: "OPENCODE_MODEL",
    url: "https://opencode.ai/zen/v1/chat/completions",
    model: "deepseek-v4-flash-free",
    headers: {},
    minIntervalMs: 1000,
  },
  {
    name: "groq",
    keyVar: "GROQ_API_KEY",
    modelVar: "GROQ_MODEL",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
    headers: {},
    minIntervalMs: 0,
  },
];

/**
 * Every configured provider, in failover order (AI_PROVIDER pins to exactly one).
 * @returns {Array<{name,url,model,key,headers,minIntervalMs}>}
 */
export function resolveProviders() {
  const forced = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  const pool = forced ? PROVIDERS.filter((p) => p.name === forced) : PROVIDERS;
  if (forced && !pool.length) throw new Error(`unknown AI_PROVIDER "${forced}" (openrouter | gemini | mistral | opencode | groq)`);
  return pool
    .map((p) => ({ ...p, key: process.env[p.keyVar] || "" }))
    .filter((p) => p.key)
    .map((p) => ({ ...p, model: process.env[p.modelVar] || p.model }));
}

/** The provider a call starts with. */
export function resolveProvider() {
  return resolveProviders()[0] || null;
}

export const hasAiKey = () => resolveProviders().length > 0;

/** Human-readable chain for CLI logs: "mistral · mistral-large-latest → groq · …". */
export function aiLabel() {
  const chain = resolveProviders();
  return chain.length ? chain.map((p) => `${p.name} · ${p.model}`).join(" → ") : "none";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Per-provider spacing clock — providers have independent rate limits. */
const lastCallAt = new Map();
/** Providers knocked out for this process (quota gone, key rejected). */
const dead = new Set();

/** Longest we'll honour a Retry-After before giving up and switching provider. */
const MAX_RETRY_AFTER_MS = 20_000;

/**
 * Pull a JSON object out of a model reply that may contain reasoning traces,
 * code fences or prose. Brace-balanced so nested objects survive.
 */
export function extractJson(raw) {
  let s = String(raw ?? "");
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, " ");
  const stray = s.lastIndexOf("</think>"); // unterminated reasoning block
  if (stray !== -1) s = s.slice(stray + "</think>".length);
  s = s.replace(/```(?:json)?/gi, " ");

  const start = s.indexOf("{");
  if (start === -1) throw new Error(`no JSON object in model output: ${s.slice(0, 120)}`);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(s.slice(start, i + 1));
  }
  throw new Error("unbalanced JSON in model output");
}

/** One provider, with in-provider retry. Throws {retryable} on give-up. */
async function callProvider(p, body, tries) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const backoff = 1500 * 2 ** (attempt - 1);

    const wait = p.minIntervalMs - (Date.now() - (lastCallAt.get(p.name) ?? 0));
    if (wait > 0) await sleep(wait);

    let res;
    try {
      lastCallAt.set(p.name, Date.now());
      res = await fetch(p.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json", ...p.headers },
        body: JSON.stringify({ ...body, model: p.model }),
      });
    } catch (err) {
      lastErr = Object.assign(new Error(`${p.name}: ${err.message}`), { retryable: true });
      if (attempt === tries) throw lastErr;
      await sleep(backoff);
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      const text = (await res.text()).slice(0, 200);
      // Out of quota / rate-limited: retrying here just burns time when another
      // provider is sitting idle, so give this one at most `tries` and move on.
      lastErr = Object.assign(new Error(`${p.name} ${res.status}: ${text}`), {
        retryable: true,
        exhausted: res.status === 429,
      });
      if (attempt === tries) throw lastErr;
      const retryAfter = Number(res.headers.get("retry-after")) * 1000;
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : backoff;
      if (delay > MAX_RETRY_AFTER_MS) throw lastErr; // switch provider instead of waiting
      await sleep(delay);
      continue;
    }

    if (!res.ok) {
      // 401/403 = bad key, 404 = model gone. Not worth retrying, but another
      // provider may well work, so mark it dead rather than killing the run.
      throw Object.assign(new Error(`${p.name} ${res.status}: ${(await res.text()).slice(0, 200)}`), {
        retryable: true,
        fatal: res.status === 401 || res.status === 403 || res.status === 404,
      });
    }

    const data = await res.json();
    const msg = data?.choices?.[0]?.message ?? {};
    // reasoning models put the answer in .content; .reasoning is the fallback
    return extractJson(msg.content || msg.reasoning || "");
  }
  throw lastErr;
}

/**
 * One chat completion, parsed as JSON.
 *
 * Two levels of resilience: retry WITHIN a provider (transient 5xx, network),
 * then FAIL OVER to the next configured provider when this one is out of quota,
 * rejecting the key, or still failing. Only throws once every provider is spent.
 * Providers that returned 401/403/404 are remembered as dead for the process, so
 * a batch run doesn't re-probe a broken key on every question.
 *
 * @param messages OpenAI-style message array
 * @param opts {temperature?, tries?, onFailover?}
 */
export async function chatJson(messages, opts = {}) {
  const chain = resolveProviders();
  if (!chain.length) {
    throw new Error("no AI key set (OPENROUTER_API_KEY, GEMINI_API_KEY, MISTRAL_API_KEY, OPENCODE_API_KEY or GROQ_API_KEY)");
  }

  const usable = chain.filter((p) => !dead.has(p.name));
  const pool = usable.length ? usable : chain; // all dead ⇒ try anyway, report honestly
  const body = { temperature: opts.temperature ?? 0.3, response_format: { type: "json_object" }, messages };
  const tries = opts.tries ?? 3;
  const failures = [];

  for (const [i, p] of pool.entries()) {
    try {
      return await callProvider(p, body, tries);
    } catch (err) {
      failures.push(err.message);
      if (err.fatal) dead.add(p.name);
      const next = pool[i + 1];
      if (!next) break;
      if (opts.onFailover) opts.onFailover(p, next, err);
    }
  }
  throw new Error(`all ${pool.length} AI provider(s) failed — ${failures.join(" | ")}`);
}

/**
 * @param q parsed question {stem, options, answer, explanation}
 * @param opts {topicTitle, rewrite: boolean}  rewrite=true for commercial external sources
 * @returns {stem, options, answer_index, explanation, tier, format}
 */
export async function enhanceQuestion(q, opts) {
  const sys = `You are an expert on Indian Polity MCQs for the UPSC CAPF exam. Respond ONLY with a JSON object.`;
  const task = opts.rewrite
    ? `REWRITE the stem and all four options in fresh wording that preserves the exact concept tested (the facts are not protected, their expression is — never copy the original phrasing).`
    : `Keep the stem and options VERBATIM (fix only obvious OCR/typography artifacts like broken hyphenation).`;

  const user = `Topic: ${opts.topicTitle}
Question (parsed from raw text):
${JSON.stringify({ stem: q.stem, options: q.options, answer_index: q.answer, explanation: q.explanation || null }, null, 2)}

Tasks:
1. ${task}
2. Classify "tier" 1-5 (1 = direct NCERT fact, 3 = standard UPSC application, 5 = elite discrimination).
3. Classify "format" as one of: ${FORMATS.join(", ")}.
4. ${q.explanation ? "Improve the explanation so it addresses every option." : "Draft an explanation that addresses every option (why right is right AND why each wrong is wrong)."}
5. If answer_index is null, determine the correct answer yourself and set it.

Return JSON: {"stem": string, "options": [4 strings], "answer_index": 0-3, "explanation": string, "tier": 1-5, "format": string}`;

  const out = await chatJson(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    {
      temperature: 0.3,
      onFailover: (from, to, err) =>
        console.warn(`  ↪ ${from.name} unavailable (${err.message.slice(0, 80)}) — falling over to ${to.name}`),
    }
  );

  // basic sanity — bad AI output degrades to parser values, never corrupts
  if (!Array.isArray(out.options) || out.options.length !== 4) out.options = q.options;
  if (!Number.isInteger(out.answer_index) || out.answer_index < 0 || out.answer_index > 3) {
    out.answer_index = q.answer ?? 0;
  }
  if (!FORMATS.includes(out.format)) out.format = guessFormat(out.stem ?? q.stem);
  if (!Number.isInteger(out.tier) || out.tier < 1 || out.tier > 5) out.tier = 2;
  if (!out.stem) out.stem = q.stem;
  if (!out.explanation) out.explanation = q.explanation;
  return out;
}

/** Heuristic fallbacks for --no-ai runs (and AI sanity nets). */
export function guessFormat(stem) {
  const s = stem.toLowerCase();
  if (/consider the following statements/.test(s)) return "statement-based";
  if (/match the following|match list/.test(s)) return "match-pairs";
  if (/assertion\s*\(a\)|reason\s*\(r\)/.test(s)) return "assertion-reason";
  if (/chronolog|correct order|arrange the following/.test(s)) return "chronology";
  if (/not\b.*(correct|true|a fundamental|among|one of)|odd one/.test(s)) return "odd-one-out";
  if (/fill in|appropriate word/.test(s)) return "fill-appropriate";
  return "single-factual";
}
