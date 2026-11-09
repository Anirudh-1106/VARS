// Words → mouth shapes (visemes) on the audio clock.
//
// Shapes available from the interviewer's footage:
//   REST  closed (the still face)      MBP  lips pressed (m b p)
//   A     jaw open (ah, a)             E    open with teeth (eh, ay)
//   I     wide, teeth together (ee)    O    round and open (oh, ow)
//   U     small round (oo, w, sh)      K    teeth slightly apart (t d n s k g l r)
//   FV    teeth on lower lip (f v)
//
// English spelling is mapped with a small set of patterns, which is close
// enough for the shapes to follow each word.

const PATTERNS = [
  ["tion", ["U", "K"]], ["sion", ["U", "K"]], ["ough", ["O"]], ["augh", ["A"]], ["eigh", ["E"]],
  ["igh", ["A", "I"]], ["ture", ["U", "K"]],
  ["th", ["K"]], ["sh", ["U"]], ["ch", ["U"]], ["ph", ["FV"]], ["wh", ["U"]], ["ck", ["K"]],
  ["ng", ["K"]], ["qu", ["K", "U"]], ["oo", ["U"]], ["ew", ["U"]], ["ue", ["U"]], ["ui", ["U"]],
  ["ee", ["I"]], ["ea", ["I"]], ["ie", ["I"]], ["ey", ["E"]], ["ai", ["E"]], ["ay", ["E"]],
  ["ei", ["E"]], ["oa", ["O"]], ["oe", ["O"]], ["ow", ["O"]], ["ou", ["O"]], ["oi", ["O", "I"]],
  ["oy", ["O", "I"]], ["au", ["A"]], ["aw", ["A"]], ["er", ["K"]], ["ir", ["K"]], ["ur", ["K"]],
];

const LETTER = {
  a: "A", e: "E", i: "I", o: "O", u: "U", y: "I",
  b: "MBP", m: "MBP", p: "MBP",
  f: "FV", v: "FV",
  w: "U", r: "K", l: "K",
  t: "K", d: "K", n: "K", s: "K", z: "K", c: "K", k: "K", g: "K", j: "U", x: "K", q: "K",
  h: null,
};

const DIGITS = { 0: ["I", "K", "O"], 1: ["U", "A", "K"], 2: ["K", "U"], 3: ["K", "I"], 4: ["FV", "O"], 5: ["FV", "A", "FV"], 6: ["K", "I", "K"], 7: ["K", "E", "FV", "K"], 8: ["E", "K"], 9: ["K", "A", "K"] };
const VOWELS = new Set(["A", "E", "I", "O", "U"]);

export function wordVisemes(raw) {
  let word = String(raw || "").toLowerCase();
  const out = [];
  if (/\d/.test(word)) {
    for (const ch of word) if (DIGITS[ch]) out.push(...DIGITS[ch]);
    return out;
  }
  word = word.replace(/[^a-z']/g, "");
  if (word.length > 3 && /[^aeiou]e$/.test(word)) word = word.slice(0, -1); // silent final e
  word = word.replace(/([^aeiou])\1+/g, "$1"); // doubled consonants sound once (vowel pairs are patterns)
  let i = 0;
  while (i < word.length) {
    const match = PATTERNS.find(([p]) => word.startsWith(p, i));
    if (match) {
      out.push(...match[1]);
      i += match[0].length;
      continue;
    }
    const ch = word[i];
    const v = ch === "y" && i === 0 ? "I" : LETTER[ch];
    if (v) out.push(v);
    i += 1;
  }
  // merge repeats so the mouth does not stutter on the same shape
  return out.filter((v, idx) => v !== out[idx - 1]);
}

// Spread each word's shapes across its spoken time. Vowels hold longer than
// consonants; lips closing for m/b/p are short but always shown.
export function buildTimeline(text, words, duration) {
  const segs = words && words.length ? words.map((w) => ({ w: w.w, t: w.t, d: w.d })) : estimateWords(text, duration);
  const out = [];
  for (const seg of segs) {
    const shapes = wordVisemes(seg.w);
    if (!shapes.length || seg.d <= 0) continue;
    const weights = shapes.map((v) => (VOWELS.has(v) ? 1.6 : v === "MBP" ? 0.8 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    const span = Math.max(0.06, seg.d * 0.96);
    let t = seg.t;
    shapes.forEach((v, idx) => {
      const len = (span * weights[idx]) / total;
      out.push({ t0: t, t1: t + len, v });
      t += len;
    });
  }
  return out;
}

// Without word timings (some voices), assume an even pace across the audio.
export function estimateWords(text, duration) {
  const tokens = String(text || "").split(/\s+/).filter(Boolean);
  if (!tokens.length || !duration) return [];
  const weight = (tok) => tok.replace(/[^a-z0-9]/gi, "").length + 1.5 + (/[.,;:?!]$/.test(tok) ? 4 : 0);
  const total = tokens.reduce((a, tok) => a + weight(tok), 0);
  const usable = Math.max(0.3, duration * 0.92);
  let t = Math.min(0.12, duration * 0.04);
  return tokens.map((tok) => {
    const share = (usable * weight(tok)) / total;
    const pause = /[.,;:?!]$/.test(tok) ? (usable * 4) / total : 0;
    const seg = { w: tok, t, d: Math.max(0.05, share - pause) };
    t += share;
    return seg;
  });
}

export function visemeAt(timeline, t) {
  if (!timeline || !timeline.length) return "REST";
  let lo = 0;
  let hi = timeline.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = timeline[mid];
    if (t < seg.t0) hi = mid - 1;
    else if (t >= seg.t1) lo = mid + 1;
    else return seg.v;
  }
  return "REST";
}
