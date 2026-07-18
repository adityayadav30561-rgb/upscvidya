/** Normalised trigram (Jaccard) similarity for near-duplicate stem detection. */

const normalise = (s) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

function trigrams(s) {
  const n = normalise(s);
  const grams = new Set();
  for (let i = 0; i <= n.length - 3; i++) grams.add(n.slice(i, i + 3));
  return grams;
}

export function similarity(a, b) {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

/** @returns {qid, score} of best match above threshold, else null */
export function findDupe(stem, existing, threshold = 0.75) {
  let best = null;
  for (const e of existing) {
    const score = similarity(stem, e.stem);
    if (score > threshold && (!best || score > best.score)) {
      best = { qid: e.id, score: Number(score.toFixed(3)) };
    }
  }
  return best;
}
