// Guide page — "How to learn": the path in order, the daily template, the
// evidence behind it, and FAQ. Static content; the app sections map to it.
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
    see: '<a href="basics.html#join">Why letters change shape as they join</a>',
  },
  {
    n: 2,
    title: 'Vowels & marks',
    where: 'Letters → Harakat',
    body: 'Short vowels, sukūn, shadda and tanwīn. Once letters + marks are solid you can sound out any fully vowelled word.',
    why: 'New systems land best just-in-time, not front-loaded (expertise-reversal, Kalyuga 2003).',
    see: '<a href="basics.html#marks">How the marks work</a>',
  },
  {
    n: 3,
    title: 'Core words (frequency first)',
    where: 'Words + Build',
    body: 'The 500 most frequent words cover 56% of every word in the Qur’an — the top 150 alone give you 41%. Learn them with flashcards (spaced review) and Build — assembling words from letters teaches how Arabic words are actually made.',
    why: 'Frequency-first maximises comprehension per word learned. Spaced retrieval: Cepeda 2006; Roediger & Karpicke 2006.',
    see: '<a href="basics.html#words">How words are made (roots &amp; patterns)</a>',
  },
  {
    n: 4,
    title: 'Read verses',
    where: 'Verses',
    body: 'Once you can sound out words, read one or two verses a day with the audio. Tap any word you don’t know — you hear it, see its meaning, and it comes back in review.',
    why: 'Learner-paced segments + audio + text (Mayer: segmenting ≈ .79, modality ≈ .76).',
    see: '',
  },
  {
    n: 5,
    title: 'Train your voice',
    where: 'Practice',
    body: 'Listen & repeat, read aloud against the reciter, and trace words. Saying things aloud is part of remembering them.',
    why: 'Production effect (MacLeod 2010) — speaking strengthens memory.',
    see: '',
  },
  {
    n: 6,
    title: 'Consolidate',
    where: 'Review (throughout)',
    body: 'Review is always first and always expands: 1 · 3 · 7 · 14 · 30 days. New material shrinks as your base grows — that’s the system working.',
    why: 'Spacing effect (Cepeda et al. 2006) — review timing beats review volume.',
    see: '',
  },
];

const FAQ = [
  ['How long should I practise each day?', 'About 15–20 minutes: a few minutes of review, a few learning something new, a minute or two reading with the audio, and a short drill. Ten focused minutes daily beats an hour on Sunday.'],
  ['What if I miss a day?', 'Nothing breaks. Your reviews just pile up gently — clear them first on your return and continue where you stopped.'],
  ['Where is my progress stored?', 'Only on this device — nothing is uploaded anywhere. Download a backup from the Progress page now and then; you can import it on any device or after clearing your browser.'],
  ['Do I have to follow the order?', 'No. Nothing is locked. The order is a recommendation — jump anywhere, any time, and come back to this guide whenever you need it.'],
  ['Why words before grammar?', 'Grammar notes appear in context on the verses that need them — right when they help, instead of years before.'],
  ['What does “learned” mean?', 'A word counts as known once its review box reaches 3 (roughly two weeks of successful recalls). Letters get marked when you trace them well.'],
  ['Why is there no speaking score?', 'Automatic pronunciation scoring would be guessing. Your ears are the judge — compare your recording with the reciter, side by side.'],
];

main.innerHTML = `
  <p class="muted">Six steps, in order — but nothing is locked. Move at your own pace; each step has its
  own section in the app. If the writing system feels confusing,
  <a href="basics.html">How Arabic works</a> explains joining and vowels in plain language.</p>

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
        ${s.see ? `<p class="step-see muted">See: ${s.see}</p>` : ''}
        <p class="step-why muted">Why: ${esc(s.why)}</p>
      </section>`,
    ).join('')}
  </div>

  <section class="card">
    <h3>The daily routine — about 15–20 minutes</h3>
    <ol class="template-list">
      <li><strong>Review</strong> (3–5 min) — clear what’s due in Words › Review. Always first.</li>
      <li><strong>Learn</strong> (5–7 min) — a few new letters or words at your level.</li>
      <li><strong>Read</strong> (4–6 min) — one verse with the audio, tapping unknown words.</li>
      <li><strong>Practice</strong> (3–5 min) — one drill: listen, read aloud, recall, or trace.</li>
    </ol>
    <p class="muted">That’s the whole routine. You can always come back here from Home.</p>
  </section>

  <section class="card">
    <h3>Why this order works</h3>
    <ul class="muted evidence-list">
      <li><strong>Frequency first</strong> — the top 150 words give you 41.3% of the Qur’an’s words; the full 500 give 56% (measured on all 77,429 words).</li>
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
