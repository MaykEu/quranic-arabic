// The learning path: stage detection + today's plan composition.
// Deliberately SOFT: nothing is locked; every module is open to any level.
// The plan recommends — a "focus" setting lets anyone override the auto stage.
import { get, set } from './store.js';
import { load as loadSRS, dueIds } from './srs.js';
import { count as progressCount, activeDays } from './progress.js';

export const STAGE_INFO = {
  letters: {
    chip: 'Stage 1 · Letters',
    line: 'Learning the script: sounds, shapes, and tracing — words unlock as you go.',
  },
  words: {
    chip: 'Stage 2 · Core words',
    line: 'The 150 most frequent words cover 41.3% of every word in the Qur’an.',
  },
  reading: {
    chip: 'Stage 3 · Reading',
    line: 'Reading verses, meeting words in context, and consolidating.',
  },
};

export function getFocus() {
  return get('focusStage', 'auto');
}
export function setFocus(f) {
  set('focusStage', f);
}

export function stats() {
  const srsAll = loadSRS();
  const ids = Object.keys(srsAll);
  const wordsSeen = ids.filter((id) => /^\d+$/.test(id) || id.startsWith('b:')).length;
  const today = new Date().toISOString().slice(0, 10);
  const practice = get('practice', {});
  return {
    lettersDone: progressCount('letters'),
    wordsSeen,
    versesRead: progressCount('verses'),
    due: dueIds(srsAll).length,
    daysThisWeek: activeDays().filter((d) => Date.now() - Date.parse(d) < 7 * 86400000).length,
    practicedToday: practice.day === today && (practice.count || 0) > 0,
  };
}

export function detectStage(s = stats()) {
  if (s.lettersDone < 28) return 'letters';
  if (s.wordsSeen < 100) return 'words';
  return 'reading';
}

export function activeStage() {
  const f = getFocus();
  return f === 'auto' ? detectStage() : f;
}

// The daily template: Review → Learn → Read → Practice (~15–20 min total).
export function todayPlan() {
  const s = stats();
  const stage = activeStage();
  const lastRead = get('lastRead', null);
  const blocks = [];

  blocks.push({
    id: 'review',
    title: 'Review — 3–5 min',
    desc: s.due
      ? `${s.due} card${s.due === 1 ? '' : 's'} due. Always first — recall what you know.`
      : 'Nothing due right now — review is clear.',
    href: 'words.html#review',
    cta: s.due ? `Review ${s.due}` : 'Review',
  });

  if (stage === 'letters') {
    const left = 28 - s.lettersDone;
    blocks.push({
      id: 'learn',
      title: 'Learn — 5–7 min',
      desc:
        left > 0
          ? `${left} letter${left === 1 ? '' : 's'} to go. Hear each one, then trace it.`
          : 'All 28 letters learned — time to build words!',
      href: left > 0 ? 'letters.html' : 'words.html#build',
      cta: left > 0 ? 'Letters' : 'Build words',
    });
  } else if (stage === 'words') {
    const left = Math.max(0, 150 - s.wordsSeen);
    blocks.push({
      id: 'learn',
      title: 'Learn — 5–7 min',
      desc:
        left > 0
          ? `${left} of the top 150 words to meet — they cover 41% of the Qur’an. Flashcards + Build.`
          : 'Top-150 met! Build extra words and read verses.',
      href: 'words.html#build',
      cta: 'Words',
    });
  } else {
    blocks.push({
      id: 'learn',
      title: 'Learn — 5–7 min',
      desc: 'Read a new verse and tap any word you don’t know — new words flow back into review.',
      href: 'verses.html',
      cta: 'Verses',
    });
  }

  blocks.push({
    id: 'read',
    title: 'Read — 4–6 min',
    desc: lastRead
      ? `Continue at ${lastRead.s}:${lastRead.a}.`
      : 'Start with Al-Fatiha — read it and tap each word.',
    href: lastRead ? `verses.html#${lastRead.s}:${lastRead.a}` : 'verses.html#1:1',
    cta: 'Read',
  });

  const drills = [
    ['read', 'Read aloud'],
    ['listen', 'Listen & repeat'],
    ['recall', 'Recall'],
    ['trace', 'Trace a word'],
  ];
  const [drill, label] = drills[new Date().getDay() % drills.length];
  blocks.push({
    id: 'practice',
    title: 'Practice — 3–5 min',
    desc: `Today’s drill: ${label}.`,
    href: `practice.html#${drill}`,
    cta: 'Practice',
  });

  return { stage, blocks, stats: s };
}
