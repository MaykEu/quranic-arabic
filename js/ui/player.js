// Single reusable <audio> element + sticky player bar (sits above the bottom nav).
// Every sound in the app plays through play() — one element keeps iOS happy.

import { trackAudio } from '../lib/activity.js';

const audio = new Audio();
trackAudio(audio);
audio.preload = 'none';

const SVG_PLAY = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg>';
const SVG_PAUSE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>';
const SVG_CLOSE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>';

let barEl = null;
let labelEl = null;
let toggleEl = null;

export function mountPlayer() {
  if (barEl) return;
  barEl = document.createElement('div');
  barEl.className = 'player-bar';
  barEl.id = 'player-bar';
  barEl.innerHTML = `
    <button class="btn-icon" id="player-toggle" aria-label="Play or pause"></button>
    <div class="player-label" id="player-label"></div>
    <button class="btn-icon" id="player-close" aria-label="Stop playback">${SVG_CLOSE}</button>`;
  document.body.appendChild(barEl);
  labelEl = barEl.querySelector('#player-label');
  toggleEl = barEl.querySelector('#player-toggle');
  toggleEl.addEventListener('click', () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });
  barEl.querySelector('#player-close').addEventListener('click', stop);
  audio.addEventListener('play', sync);
  audio.addEventListener('pause', sync);
  audio.addEventListener('ended', sync);
  sync();
  armIosUnlock();
}

// Play a URL with a human-readable label shown in the bar.
// Safe to call even when the player bar has not been mounted (e.g. in tests).
export function play(url, label = '') {
  if (label && labelEl) labelEl.textContent = label;
  if (audio.src !== url) audio.src = url;
  barEl?.classList.add('on');
  audio.play().catch(() => {});
  return audio;
}

export function stop() {
  audio.pause();
  audio.currentTime = 0;
  audio.removeAttribute('src');
  audio.load();
  if (barEl) barEl.classList.remove('on');
}

export function isPlaying() {
  return !audio.paused;
}

function sync() {
  if (!toggleEl) return;
  toggleEl.innerHTML = audio.paused ? SVG_PLAY : SVG_PAUSE;
}

// iOS Safari: audio may only start inside a user gesture. Prime the element on
// the first tap so later programmatic play() calls are allowed.
function armIosUnlock() {
  const once = () => {
    try {
      audio.muted = true;
      audio.play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        })
        .catch(() => {
          audio.muted = false;
        });
    } catch {
      audio.muted = false;
    }
    window.removeEventListener('pointerdown', once, true);
  };
  window.addEventListener('pointerdown', once, true);
}
