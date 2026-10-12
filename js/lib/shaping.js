// Arabic letter-joining logic (used by the Build mode, tests and future tools).
//
// Rendering is done by the font — the browser shapes a real Arabic string and
// Arabic joining "just works" (including the lām-alef ligature). What we need
// from code is: how to split a written word into letter tiles, whether a letter
// connects to its neighbours, and what form that produces. Letter data comes
// from data/letters.json, so nothing here is hard-coded.

// Everything that is not a base letter: harakat, tanwin, sukun, shadda,
// superscript alef, tatweel, alef wasla, Quranic marks, invisible controls.
export const NON_LETTER =
  /[\u0610-\u061A\u064B-\u065F\u0670\u0640\u0671\u06D6-\u06ED\u08D3-\u08FF\u200E\u200F\uFEFF]/g;

// Letters only: marks stripped, alef wasla normalised to a plain alef.
export const bareForm = (s) => s.replace(/\u0671/g, '\u0627').replace(NON_LETTER, '');

export function buildIndex(letters) {
  const byChar = new Map(letters.map((l) => [l.ar, l]));
  return {
    byChar,
    entry: (ch) => byChar.get(ch) || null,
    // can this letter join the letter AFTER it? (it then takes initial/medial shape)
    canLeftJoin: (l) => !!(l.forms.initial || l.forms.medial),
    // can this letter join the letter BEFORE it? (final/medial shape)
    canRightJoin: (l) => !!(l.forms.medial || l.forms.final),
    // which named form does this letter take in this position?
    formName(entry, connectedRight, connectedLeft) {
      if (connectedRight && connectedLeft) return 'medial';
      if (connectedRight) return 'final';
      if (connectedLeft) return 'initial';
      return 'isolated';
    },
    formFor(entry, connectedRight, connectedLeft) {
      const f = entry.forms;
      return f[this.formName(entry, connectedRight, connectedLeft)] || f.isolated;
    },
  };
}

// Split a bare string (letters only, marks stripped) into per-letter join info.
// Returns { ok, plan: [{ ch, id, connectedRight, connectedLeft, form }], missing }
export function joinPlan(bare, index) {
  const chars = [...bare];
  const missing = chars.filter((ch) => !index.entry(ch));
  const plan = chars.map((ch, i) => {
    const entry = index.entry(ch);
    const prev = i > 0 ? index.entry(chars[i - 1]) : null;
    const next = i < chars.length - 1 ? index.entry(chars[i + 1]) : null;
    const connectedRight = !!prev && index.canLeftJoin(prev);
    const connectedLeft = !!entry && !!next && index.canLeftJoin(entry);
    return {
      ch,
      id: entry ? entry.id : null,
      connectedRight,
      connectedLeft,
      formName: entry ? index.formName(entry, connectedRight, connectedLeft) : null,
      form: entry ? index.formFor(entry, connectedRight, connectedLeft) : null,
    };
  });
  return { ok: missing.length === 0, plan, missing };
}
