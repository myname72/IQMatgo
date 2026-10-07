import { SFX, createMusic } from './synth.js';

// 브라우저는 사용자가 한 번 누르기 전에는 소리를 낼 수 없으므로
// AudioContext는 첫 입력(unlock)에서 만든다.
const STORAGE_KEY = 'iqmatgo-audio';
const listeners = new Set();
let ctx = null;
let master = null;
let sfxGain = null;
let musicGain = null;
let music = null;
let musicTimer = null;
let nextBar = 0;
let settings = load();

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { music: v.music !== false, sfx: v.sfx !== false };
  } catch {
    return { music: true, sfx: true };
  }
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* 저장하지 못해도 소리는 그대로 동작한다 */
  }
}
const emit = () => listeners.forEach((fn) => fn());

export function getSettings() {
  return settings;
}
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  // 겹쳐서 소리가 터지지 않도록 가벼운 압축기를 단다
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  master.connect(comp).connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = settings.sfx ? 1 : 0;
  sfxGain.connect(master);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(master);
  music = createMusic(ctx, musicGain);
  return ctx;
}

function tickMusic() {
  if (!ctx || !settings.music || ctx.state !== 'running') return;
  // 다음 마디가 0.8초 안에 시작하면 미리 예약한다
  while (nextBar < ctx.currentTime + 0.8) {
    music.scheduleBar(Math.max(nextBar, ctx.currentTime + 0.05));
    nextBar = Math.max(nextBar, ctx.currentTime) + music.BAR;
  }
}

function startMusic() {
  if (!ctx || musicTimer) return;
  nextBar = ctx.currentTime + 0.3;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setTargetAtTime(0.9, ctx.currentTime, 0.6);
  tickMusic();
  musicTimer = setInterval(tickMusic, 200);
}
function stopMusic() {
  if (!ctx) return;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

// 첫 사용자 입력에서 호출한다 (여러 번 불러도 안전)
export function unlock() {
  const c = ensureContext();
  if (!c) return;
  const go = () => {
    if (settings.music) startMusic();
  };
  if (c.state === 'suspended') c.resume().then(go).catch(() => {});
  else go();
}

export function play(name) {
  if (!settings.sfx) return;
  const c = ensureContext();
  const fn = SFX[name];
  if (!c || !fn || c.state !== 'running') return;
  try {
    fn(c, sfxGain, c.currentTime + 0.005);
  } catch {
    /* 소리가 실패해도 게임은 계속된다 */
  }
}

export function setMusic(on) {
  settings = { ...settings, music: on };
  save();
  if (on) unlock();
  else stopMusic();
  emit();
}
export function setSfx(on) {
  settings = { ...settings, sfx: on };
  save();
  if (sfxGain && ctx) sfxGain.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.02);
  if (on) unlock();
  emit();
}

// 탭이 가려지면 소리와 계산을 멈춘다
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else ctx.resume().catch(() => {});
  });
}

// 확인용: ?audiotest 로 열면 오프라인으로 소리를 만들어 크기를 잰다
if (typeof window !== 'undefined' && /[?&]audiotest/.test(window.location.search)) {
  window.__iqAudio = {
    state: () => ctx?.state ?? 'none',
    async measure(name, seconds = 2.5) {
      const off = new OfflineAudioContext(1, Math.floor(44100 * seconds), 44100);
      const g = off.createGain();
      g.connect(off.destination);
      if (name === 'music') {
        const m = createMusic(off, g, (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })());
        for (let i = 0; i < Math.ceil(seconds / m.BAR); i++) m.scheduleBar(i * m.BAR);
      } else {
        SFX[name](off, g, 0.01);
      }
      const buf = await off.startRendering();
      const d = buf.getChannelData(0);
      let peak = 0, sum = 0;
      for (let i = 0; i < d.length; i++) {
        const v = Math.abs(d[i]);
        if (v > peak) peak = v;
        sum += v * v;
      }
      return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4) };
    },
    names: Object.keys(SFX),
  };
}
