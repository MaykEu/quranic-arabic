// Build data/roots.json — curated root families for learning.
//
// Each family lists member words as normalized forms (harakat stripped, same
// normalization the vocabulary pipeline uses). The tool finds each word in the
// corpus (first occurrence, mushaf order) and pulls the real spelling,
// transliteration, gloss, reference and word-audio url. Any member that does
// not exist in the corpus aborts the build — no silent drops.
//
// Usage: node tools/build-roots.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QURAN = path.join(ROOT, 'data', 'quran');

const strip = (s) => s.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u0671\u06D6-\u06ED\u0640]/g, '');

// Curated families: root letters, a plain-English theme, and member forms.
// (Forms are the stripped spellings as they appear in the corpus data.)
const FAMILIES = [
  { id: 'ktb', root: 'ك ت ب', note: 'writing', members: ['كتاب@18:27', 'كاتب', 'يكتب', 'كتبنا'] },
  { id: 'elm', root: 'ع ل م', note: 'knowledge', members: ['علم', 'عليم', 'يعلم', 'معلوم'] },
  { id: 'qwl', root: 'ق و ل', note: 'speech, saying', members: ['قال', 'يقول', 'قول', 'قالوا'] },
  { id: 'kwn', root: 'ك و ن', note: 'being', members: ['كان', 'يكون', 'كونوا'] },
  { id: 'amn', root: 'أ م ن', note: 'faith, safety', members: ['ءامنوا', 'لإيمن', 'مؤمنون', 'مؤمنين'] },
  { id: 'rbb', root: 'ر ب ب', note: 'lord, nurturing', members: ['رب', 'ربك', 'ربنا@2:128'] },
  { id: 'elh', root: 'إ ل ه', note: 'divinity', members: ['إله', 'إلهك', 'إلهه'] },
  { id: 'dyn', root: 'د ي ن', note: 'religion, judgment', members: ['دين', 'دينكم', 'دينهم'] },
  { id: 'ywm', root: 'ي و م', note: 'day', members: ['يوم', 'يوما', 'يومئذ'] },
  { id: 'ard', root: 'أ ر ض', note: 'earth, land', members: ['أرض', 'أرضا', 'أرضهم'] },
  { id: 'nwr', root: 'ن و ر', note: 'light', members: ['نور', 'نوره', 'منير'] },
  { id: 'zlm', root: 'ظ ل م', note: 'wrongdoing, darkness', members: ['ظلم', 'ظلموا', 'يظلم'] },
  { id: 'ebd', root: 'ع ب د', note: 'serving, worship', members: ['عبد', 'عبدا', 'عباد'] },
  { id: 'smE', root: 'س م ع', note: 'hearing', members: ['سمع', 'يسمع', 'سميع'] },
  { id: 'hdy', root: 'ه د ي', note: 'guidance', members: ['هدى', 'يهدى'] },
  { id: 'dll', root: 'ض ل ل', note: 'going astray', members: ['ضل', 'ضلل', 'يضل'] },
  { id: 'kfr', root: 'ك ف ر', note: 'covering, disbelief', members: ['كفر', 'كفروا', 'كفرون'] },
  { id: 'sbr', root: 'ص ب ر', note: 'patience', members: ['صبر', 'صبروا', 'صبرا'] },
  { id: 'škr', root: 'ش ك ر', note: 'thankfulness', members: ['شكر', 'شكور', 'شكرتم'] },
  { id: 'nzl', root: 'ن ز ل', note: 'sending down', members: ['نزل', 'أنزل', 'أنزلنا'] },
  { id: 'rsl', root: 'ر س ل', note: 'messengers', members: ['رسول', 'رسل', 'أرسلنا'] },
  { id: 'xlq', root: 'خ ل ق', note: 'creation', members: ['خلق', 'خلقنا', 'يخلق'] },
  { id: 'jEl', root: 'ج ع ل', note: 'making', members: ['جعل', 'جعلنا', 'يجعل@4:15'] },
  { id: 'kdb', root: 'ك ذ ب', note: 'lying', members: ['كذب', 'كذبوا', 'يكذبون'] },
];

// Scan the corpus once: stripped form -> all occurrences (mushaf order).
const occ = new Map();
for (const f of readdirSync(QURAN).filter((x) => /^\d{3}\.json$/.test(x)).sort()) {
  const surah = JSON.parse(readFileSync(path.join(QURAN, f), 'utf8'));
  for (const ayah of surah.ayahs) {
    for (const w of ayah.words) {
      const key = strip(w.ar);
      if (!key) continue;
      const rec = { ar: w.ar, translit: w.translit, gloss: w.gloss, ref: `${surah.id}:${ayah.n}`, audio: w.audio };
      if (!occ.has(key)) occ.set(key, []);
      occ.get(key).push(rec);
    }
  }
}

const misses = [];
const roots = [];
for (const fam of FAMILIES) {
  const members = [];
  for (const spec of fam.members) {
    // 'form' → first occurrence; 'form@3:163' → that exact occurrence (better gloss).
    const [form, ref] = spec.split('@');
    const list = occ.get(form);
    const hit = list ? (ref ? list.find((x) => x.ref === ref) : list[0]) : null;
    if (!hit) {
      misses.push(`${fam.id} (${fam.root}): '${spec}' not found in corpus`);
      continue;
    }
    members.push({ ar: hit.ar, translit: hit.translit, gloss: hit.gloss, ref: hit.ref, audio: hit.audio });
  }
  roots.push({ id: fam.id, root: fam.root, note: fam.note, members });
}

if (misses.length) {
  console.error(`FIX THE LIST — ${misses.length} member(s) not found:`);
  for (const m of misses) console.error('  ' + m);
  process.exit(1);
}

writeFileSync(path.join(ROOT, 'data', 'roots.json'), JSON.stringify({ generated: new Date().toISOString(), count: roots.length, roots }, null, 1));
console.log(`roots.json written: ${roots.length} families, ${roots.reduce((a, r) => a + r.members.length, 0)} member words`);
