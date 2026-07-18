/**
 * Groq enhancement: normalise, classify tier/format, draft explanations,
 * rewrite commercial-source wording. Model: llama-3.3-70b-versatile.
 * Key: GROQ_API_KEY env (paste into .env at repo root when available).
 */
import { FORMATS } from "../content/lib.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

export const hasGroqKey = () => !!process.env.GROQ_API_KEY;

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

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const out = JSON.parse(data.choices[0].message.content);

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
