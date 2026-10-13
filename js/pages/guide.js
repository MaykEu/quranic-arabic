// Guide page — "How to learn": the path in order, the daily template, the
// evidence behind it, and FAQ. Content is static; the Today card on Home does
// the live planning.
const main = document.querySelector('main');
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const STEPS = [
  {
    n: 1,
    title: 'Letters & sounds',
    where: 'Letters',
    body: 'Learn all 28 letters — sound, the four shapes, and trace each one. The app starts with the most frequent letters so real words unlock early.',
    why: 'Writing by hand helps recognition (Longcamp 2005; James & Engelhardt 2012).',
  },
  {
    n: 2,
    title: 'Vowels & marks',
    where: 'Letters → Harakat',
    body: 'Short vowels, sukūn, shadda and tanwīn. Once letters + marks are solid you can sound out any fully vowelled word.',
    why: 'New systems land best just-in-time, not front-loaded (expertise-reversal, Kalyuga 2003).',
  },
  {
    n: 3,
    title: 'Core words (frequency first)',
    where: 'Words + Build',
    body: 'The 150 most frequent words cover 41.3% of every word in the Qur’an. Learn them with flashcards (spaced review) and Build — assembling words from letters teaches how Arabic words are actually made.',
    why: 'Frequency-first maximises comprehension per word learned. Spaced retrieval: Cepeda 2006; Roediger & Karpicke 2006.',
  },
  {
    n: 4,
    title: 'Read verses',
    where: 'Verses',
    body: 'Read one or two verses a day. Tap any word you don’t know — you hear it, see its meaning, and it comes back in review. Keep the translation hidden first, then reveal to check.',
    why: 'Learner-paced segments + audio + text (Mayer: segmenting ≈ .79, modality ≈ .76).',
  },
  {
    n: 5,
    title: 'Train your voice',
    where: 'Practice',
    body: 'Listen & repeat, read aloud against the reciter, and trace words. Saying things aloud is part of remembering them.',
    why: 'Production effect (MacLeod 2010) — speaking strengthens memory.',
  },
  {
    n: 6,
    title: 'Consolidate',
    where: 'Review (throughout)',
    body: 'Review is always first and always expands: 1 · 3 · 7 · 14 · 30 days. New material shrinks as your base grows — that’s the system working.',
    why: 'Spacing effect (Cepeda et al. 2006) — review timing beats review volume.',
  },
];

const FAQ = [
  ['How long should I practise each day?', 'About 15–20 minutes: review 3–5, learn 5–7, read 4–6, practise 3–5. Ten focused minutes daily beats an hour on Sunday.'],
  ['What if I miss a day?', 'Nothing breaks. Your reviews just pile up gently — clear them first on your return and continue where you stopped.'],
  ['Do I have to follow the order?', 'No. Nothing is locked. The order is a recommendation — jump anywhere, any time, and set your Focus on the Home card to match what you want to work on.'],
  ['Why words before grammar?', 'Grammar notes appear in context on the verses that need them — right when they help, instead of years before.'],
  ['What does “learned” mean?', 'A word counts as known once its review box reaches 3 (roughly two weeks of successful recalls). Letters get marked when you trace them well.'],
  ['Why is there no speaking score?', 'Automatic pronunciation scoring would be guessing. Your ears are the judge — compare your recording with the reciter, side by side.'],
];

main.innerHTML = `
  <h2>How to learn <span class="muted">· the path</span></h2>
  <p class="muted">Six steps, each unlocking the next — but nothing is locked. Go at your level;
  the <a href="index.html">Today card</a> composes each day for you, and <em>Focus</em> lets you override it.</p>

  <div class="steps">
    ${STEPS.map(
      (s) => `
      <section class="card step-card">
        <div class="step-head">
          <span class="step-n">${s.n}</span>
          <strong>${esc(s.title)}</strong>
          <span class="step-where muted">${esc(s.where)}</span>
        </div>
        <p>${s.body}</p>
        <p class="step-why muted">Why: ${esc(s.why)}</p>
      </section>`,
    ).join('')}
  </div>

  <section class="card">
    <h3>The daily template — about 15–20 minutes</h3>
    <ol class="template-list">
      <li><strong>Review</strong> (3–5 min) — clear what’s due. Always first.</li>
      <li><strong>Learn</strong> (5–7 min) — the next new things at your stage.</li>
      <li><strong>Read</strong> (4–6 min) — one verse, tapping unknown words.</li>
      <li><strong>Practice</strong> (3–5 min) — one drill: listen, read aloud, recall, or trace.</li>
    </ol>
    <p class="muted">The Home page turns this into four buttons that know exactly where you are.</p>
  </section>

  <section class="card">
    <h3>Why this order works</h3>
    <ul class="muted evidence-list">
      <li><strong>Frequency first</strong> — the 150 most common words give you 41.3% of the Qur’an’s words (measured on all 77,429 words).</li>
      <li><strong>Spaced review</strong> — expanding intervals (1·3·7·14·30 days) make remembering easier: Cepeda et al. 2006.</li>
      <li><strong>Retrieval first</strong> — testing yourself beats re-reading: Roediger &amp; Karpicke 2006.</li>
      <li><strong>Small steps with audio</strong> — verse-by-verse, word-by-word: Mayer’s segmenting &amp; modality principles.</li>
      <li><strong>Say it out loud</strong> — the production effect: MacLeod 2010.</li>
      <li><strong>Write it by hand</strong> — tracing aids letter recognition: Longcamp 2005.</li>
      <li><strong>Grammar in context</strong> — notes appear on verses, not in a wall up front: Kalyuga 2003 (expertise reversal).</li>
    </ul>
  </section>

  <section class="card">
    <h3>Questions</h3>
    ${FAQ.map(
      ([q, a]) => `
      <div class="faq-item">
        <strong>${esc(q)}</strong>
        <p class="muted">${esc(a)}</p>
      </div>`,
    ).join('')}
  </section>`;
