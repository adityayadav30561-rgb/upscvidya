/**
 * Loose MCQ text parser — tolerates messy spacing, mixed option markers
 * (a)-d), A-D, 1)-4)), "Ans: b" lines, statement-based blocks, wrapped lines.
 *
 * Numeric-marker disambiguation ("1." can be a statement, an option, or the
 * next question):
 *   - statement-cue stems ("consider the following...") absorb numeric lines
 *     into the stem until a selector line ("Which of the statements...") appears
 *   - after the selector, markers (letter or numeric) are options
 *   - a numbered line starts a NEW question only when the current one looks
 *     finished (answer seen, or ≥2 options collected)
 * Known limit: numeric "1."-style options in a no-cue stem right after a
 * finished question parse fine; exotic mixes go to the warnings channel.
 */

const Q_START = /^\s*(?:Q\.?\s*)?(\d{1,3})[).:-]\s+/;
const OPT_LINE = /^\s*\(?([a-dA-D1-4])[).:-]\s+(.*)$/;
const ANS_LINE = /^\s*(?:ans(?:wer)?)\b\s*[:.\-)\s]*\(?([a-dA-D1-4])\)?\s*\.?\s*$/i;
const EXPL_LINE = /^\s*(?:expl(?:anation)?|sol(?:ution)?)\b\s*[:.-]?\s*(.*)$/i;
const STATEMENT_CUE = /consider the following|match the following|arrange the following|match list/i;
const SELECTOR_LINE = /which of the|select the correct|correct answer using the code|codes\s*:/i;

const optIndex = (ch) => {
  const c = ch.toLowerCase();
  if (c >= "a" && c <= "d") return c.charCodeAt(0) - 97;
  if (c >= "1" && c <= "4") return Number(c) - 1;
  return -1;
};

/** @returns array of {stem, options: string[], answer: number|null, explanation: string, warnings: string[]} */
export function parseLooseMcqText(text) {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const blocks = [];
  let cur = null;

  const newBlock = (firstStemLine) => ({
    stemLines: [firstStemLine],
    optLines: [],
    ansChar: null,
    explLines: [],
    done: false,       // answer line seen
    hasCue: STATEMENT_CUE.test(firstStemLine),
    pastSelector: false,
  });

  for (const line of lines) {
    const qm = line.match(Q_START);
    const looksFinished = cur && (cur.done || cur.optLines.length >= 2);
    if (qm && (!cur || looksFinished)) {
      if (cur) blocks.push(cur);
      cur = newBlock(line.replace(Q_START, ""));
      continue;
    }
    if (!cur) continue; // junk before the first question

    const ans = line.match(ANS_LINE);
    if (ans) { cur.ansChar = ans[1]; cur.done = true; continue; }

    if (cur.done) {
      const expl = line.match(EXPL_LINE);
      const t = expl ? expl[1] : line.trim();
      if (t) cur.explLines.push(t);
      continue;
    }

    if (SELECTOR_LINE.test(line)) {
      cur.pastSelector = true;
      cur.stemLines.push(line);
      continue;
    }

    const opt = line.match(OPT_LINE);
    if (opt) {
      const isLetter = /[a-dA-D]/.test(opt[1]);
      // numeric markers are statements (stem) while a cue is active and the
      // selector line hasn't appeared yet
      const isStatement = !isLetter && cur.hasCue && !cur.pastSelector && cur.optLines.length === 0;
      if (!isStatement) {
        cur.optLines.push({ idx: optIndex(opt[1]), text: opt[2].trim() });
        continue;
      }
    }

    if (cur.optLines.length > 0) {
      if (line.trim()) cur.optLines[cur.optLines.length - 1].text += " " + line.trim(); // wrapped option
    } else {
      cur.stemLines.push(line);
    }
  }
  if (cur) blocks.push(cur);

  return blocks
    .map((b, i) => {
      const warnings = [];
      const options = ["", "", "", ""];
      for (const o of b.optLines) {
        if (o.idx >= 0 && o.idx < 4) {
          options[o.idx] = options[o.idx] ? options[o.idx] + " " + o.text : o.text;
        }
      }
      const present = options.filter(Boolean).length;
      if (present !== 4) warnings.push(`question ${i + 1}: found ${present}/4 options`);
      const answer = b.ansChar ? optIndex(b.ansChar) : null;
      if (answer === null) warnings.push(`question ${i + 1}: no answer line found`);
      return {
        stem: b.stemLines.map((l) => l.trimEnd()).join("\n").trim(),
        options,
        answer,
        explanation: b.explLines.join(" ").trim(),
        warnings,
      };
    })
    .filter((q) => q.stem);
}
