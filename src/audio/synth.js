// 효과음·배경 음악을 Web Audio로 직접 합성한다 (외부 음원 파일 없음).
// 모든 함수는 (ctx, out, t) 형태라서 실제 AudioContext와 OfflineAudioContext 양쪽에서 쓸 수 있다.

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

function noiseBuffer(ctx, seconds = 1) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0; // 시드 난수: 같은 소리가 나온다
    data[i] = (seed / 4294967296) * 2 - 1;
  }
  return buf;
}

// 사인/삼각 등 단순 음. 소리 크기는 빠르게 올라갔다가 지수적으로 줄어든다.
function tone(ctx, out, t, { freq, type = 'sine', dur = 0.2, vol = 0.25, attack = 0.004, slideTo = null, detune = 0 }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  osc.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + attack + dur + 0.05);
}

// 필터를 거친 잡음 (슥, 쉬익 같은 소리)
function noise(ctx, out, t, { dur = 0.1, vol = 0.2, type = 'bandpass', freq = 2000, freqEnd = null, q = 1, attack = 0.003 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, Math.max(dur + 0.1, 0.3));
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t);
  src.stop(t + attack + dur + 0.05);
}

// 종·징 같은 금속음: 정수배가 아닌 부분음을 겹친다
function bell(ctx, out, t, { freq, dur = 1.2, vol = 0.18 }) {
  [1, 2.01, 2.76, 4.07, 5.4].forEach((m, i) => tone(ctx, out, t, { freq: freq * m, dur: dur / (1 + i * 0.6), vol: vol / (1 + i * 0.9), type: 'sine' }));
}

// 가야금 같은 뜯는 소리
function pluck(ctx, out, t, { freq, dur = 1.4, vol = 0.2 }) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;
  lp.connect(out);
  tone(ctx, lp, t, { freq, type: 'triangle', dur, vol, attack: 0.003, slideTo: freq * 0.996 });
  tone(ctx, lp, t, { freq: freq * 2, type: 'sine', dur: dur * 0.5, vol: vol * 0.35, attack: 0.002 });
  noise(ctx, lp, t, { dur: 0.04, vol: vol * 0.5, freq: 4000, q: 0.7 });
}

// 금관 소리: 톱니파를 저역 통과시켜 부드럽게
function brass(ctx, out, t, { freq, dur = 0.4, vol = 0.12 }) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.linearRampToValueAtTime(3200, t + 0.08);
  lp.connect(out);
  tone(ctx, lp, t, { freq, type: 'sawtooth', dur, vol, attack: 0.02 });
  tone(ctx, lp, t, { freq: freq * 1.003, type: 'square', dur, vol: vol * 0.4, attack: 0.02 });
}

// 장구 소리
function drum(ctx, out, t, { low = true, vol = 0.3 }) {
  if (low) {
    tone(ctx, out, t, { freq: 130, slideTo: 62, dur: 0.28, vol, type: 'sine', attack: 0.002 });
    noise(ctx, out, t, { dur: 0.06, vol: vol * 0.35, type: 'lowpass', freq: 600 });
  } else {
    noise(ctx, out, t, { dur: 0.05, vol: vol * 0.7, type: 'highpass', freq: 3000, q: 0.7 });
    tone(ctx, out, t, { freq: 330, slideTo: 240, dur: 0.06, vol: vol * 0.5, type: 'triangle' });
  }
}

export const SFX = {
  click: (ctx, out, t) => tone(ctx, out, t, { freq: 760, type: 'triangle', dur: 0.07, vol: 0.16 }),
  start: (ctx, out, t) => {
    [midi(67), midi(72), midi(76)].forEach((f, i) => pluck(ctx, out, t + i * 0.09, { freq: f, dur: 0.9, vol: 0.2 }));
    drum(ctx, out, t, { low: true, vol: 0.28 });
  },
  // 카드 뒤집기: "슥" + 톡
  flip: (ctx, out, t) => {
    noise(ctx, out, t, { dur: 0.07, vol: 0.2, type: 'bandpass', freq: 3200, freqEnd: 1400, q: 0.9 });
    tone(ctx, out, t + 0.035, { freq: 420, slideTo: 260, type: 'triangle', dur: 0.06, vol: 0.14 });
  },
  match: (ctx, out, t) => {
    [midi(79), midi(84)].forEach((f, i) => tone(ctx, out, t + i * 0.09, { freq: f, type: 'triangle', dur: 0.5, vol: 0.2 }));
    noise(ctx, out, t + 0.08, { dur: 0.25, vol: 0.05, type: 'highpass', freq: 6000 });
  },
  miss: (ctx, out, t) => {
    tone(ctx, out, t, { freq: 190, slideTo: 90, dur: 0.22, vol: 0.28, type: 'sine' });
    noise(ctx, out, t, { dur: 0.08, vol: 0.12, type: 'lowpass', freq: 500 });
  },
  hide: (ctx, out, t) => noise(ctx, out, t, { dur: 0.09, vol: 0.09, type: 'bandpass', freq: 1800, freqEnd: 900, q: 0.8 }),
  yourTurn: (ctx, out, t) => {
    [midi(76), midi(79)].forEach((f, i) => tone(ctx, out, t + i * 0.11, { freq: f, type: 'sine', dur: 0.28, vol: 0.14 }));
  },
  turnEnd: (ctx, out, t) => tone(ctx, out, t, { freq: 520, slideTo: 380, type: 'triangle', dur: 0.12, vol: 0.12 }),
  // 아이템 공통: 빛이 확 퍼지는 소리
  itemPop: (ctx, out, t) => {
    noise(ctx, out, t, { dur: 0.35, vol: 0.1, type: 'bandpass', freq: 600, freqEnd: 5000, q: 1.2 });
    [midi(72), midi(76), midi(79), midi(84)].forEach((f, i) => tone(ctx, out, t + 0.05 + i * 0.06, { freq: f, type: 'triangle', dur: 0.4, vol: 0.14 }));
  },
  ssangpi: (ctx, out, t) => {
    SFX.itemPop(ctx, out, t);
    [1318, 1760].forEach((f, i) => tone(ctx, out, t + 0.28 + i * 0.07, { freq: f, type: 'sine', dur: 0.35, vol: 0.18 }));
  },
  tripi: (ctx, out, t) => {
    SFX.itemPop(ctx, out, t);
    [1175, 1480, 1976].forEach((f, i) => tone(ctx, out, t + 0.28 + i * 0.07, { freq: f, type: 'sine', dur: 0.35, vol: 0.18 }));
  },
  shuffle: (ctx, out, t) => {
    SFX.itemPop(ctx, out, t);
    for (let i = 0; i < 12; i++) noise(ctx, out, t + 0.25 + i * 0.045, { dur: 0.05, vol: 0.1, type: 'bandpass', freq: 1200 + (i * 331) % 2600, q: 1.5 });
  },
  reset: (ctx, out, t) => {
    SFX.itemPop(ctx, out, t);
    noise(ctx, out, t + 0.2, { dur: 0.6, vol: 0.16, type: 'bandpass', freq: 5200, freqEnd: 300, q: 0.8 });
    tone(ctx, out, t + 0.2, { freq: 880, slideTo: 110, dur: 0.6, vol: 0.12, type: 'sine' });
  },
  peek: (ctx, out, t) => {
    SFX.itemPop(ctx, out, t);
    [88, 91, 95, 100].forEach((n, i) => tone(ctx, out, t + 0.3 + i * 0.08, { freq: midi(n), type: 'sine', dur: 0.5, vol: 0.1, detune: i % 2 ? 6 : -6 }));
  },
  // 판쓸: 쓸어내는 바람 소리 + 올라가는 팡파르 + 북
  sweep: (ctx, out, t) => {
    noise(ctx, out, t, { dur: 0.55, vol: 0.2, type: 'bandpass', freq: 400, freqEnd: 6000, q: 0.9 });
    drum(ctx, out, t + 0.05, { low: true, vol: 0.3 });
    [72, 76, 79, 84, 88].forEach((n, i) => tone(ctx, out, t + 0.2 + i * 0.07, { freq: midi(n), type: 'triangle', dur: 0.6, vol: 0.17 }));
    [1568, 2093].forEach((f, i) => tone(ctx, out, t + 0.6 + i * 0.08, { freq: f, type: 'sine', dur: 0.5, vol: 0.12 }));
  },
  // 쪽: 가볍게 "쪽!" 하는 입맞춤 소리 + 반짝
  jjok: (ctx, out, t) => {
    tone(ctx, out, t, { freq: 900, slideTo: 1500, type: 'sine', dur: 0.09, vol: 0.2 });
    noise(ctx, out, t, { dur: 0.05, vol: 0.12, type: 'highpass', freq: 5000 });
    [midi(88), midi(95)].forEach((f, i) => tone(ctx, out, t + 0.12 + i * 0.08, { freq: f, type: 'sine', dur: 0.35, vol: 0.14 }));
  },
  // 폭탄: 쿵 하는 폭발 + 낮게 울리는 잔향
  bomb: (ctx, out, t) => {
    tone(ctx, out, t, { freq: 120, slideTo: 38, type: 'sine', dur: 0.7, vol: 0.4 });
    noise(ctx, out, t, { dur: 0.6, vol: 0.32, type: 'lowpass', freq: 1800, freqEnd: 120 });
    noise(ctx, out, t, { dur: 0.12, vol: 0.2, type: 'highpass', freq: 3000 });
    [midi(55), midi(62)].forEach((f, i) => tone(ctx, out, t + 0.25 + i * 0.1, { freq: f, type: 'sawtooth', dur: 0.6, vol: 0.07 }));
  },
  gostop: (ctx, out, t) => {
    bell(ctx, out, t, { freq: 440, dur: 1.4, vol: 0.2 });
    drum(ctx, out, t, { low: true, vol: 0.3 });
    drum(ctx, out, t + 0.22, { low: false, vol: 0.25 });
  },
  go: (ctx, out, t) => {
    [midi(76), midi(83), midi(88)].forEach((f, i) => tone(ctx, out, t + i * 0.08, { freq: f, type: 'triangle', dur: 0.45, vol: 0.2 }));
    drum(ctx, out, t, { low: false, vol: 0.25 });
  },
  stop: (ctx, out, t) => {
    bell(ctx, out, t, { freq: 196, dur: 2.0, vol: 0.28 });
    drum(ctx, out, t, { low: true, vol: 0.4 });
  },
  // 승리: 약 6초짜리 신나는 팡파르 (본 선율 4초) (북 + 금관 + 반짝이는 마무리)
  win: (ctx, dest, t) => {
    const out = ctx.createGain(); // 음량이 큰 편이라 살짝 낮춘다
    out.gain.value = 0.72;
    out.connect(dest);
    const B = 1 / 3; // 한 박 (180bpm) — 선율 12박 = 4초
    // 1) 올라가는 런
    [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => pluck(ctx, out, t + i * 0.08, { freq: midi(n), dur: 0.5, vol: 0.2 }));
    noise(ctx, out, t, { dur: 0.6, vol: 0.12, type: 'bandpass', freq: 800, freqEnd: 7000, q: 0.8 });
    // 2) 주제 선율 (midi, 박 길이)
    const start = t + 0.75;
    const tune = [
      [79, 0.5], [79, 0.5], [84, 1], [83, 0.5], [81, 0.5], [79, 1],
      [76, 0.5], [79, 0.5], [84, 1], [86, 0.5], [88, 0.5], [91, 1],
      [88, 0.5], [88, 0.5], [86, 0.5], [84, 0.5], [86, 0.5], [83, 0.5], [84, 1],
    ];
    let at = start;
    for (const [n, beats] of tune) {
      const d = beats * B;
      brass(ctx, out, at, { freq: midi(n), dur: d * 0.95, vol: 0.13 });
      tone(ctx, out, at, { freq: midi(n + 12), type: 'sine', dur: d * 0.6, vol: 0.05 });
      at += d;
    }
    // 3) 반주: 박마다 북 + 엇박 심벌 + 베이스, 마디마다 화음
    const beats = Math.round((at - start) / B);
    const bass = [48, 48, 55, 55, 53, 53, 55, 55];
    for (let k = 0; k < beats; k++) {
      const bt = start + k * B;
      drum(ctx, out, bt, { low: true, vol: 0.26 });
      drum(ctx, out, bt + B / 2, { low: false, vol: 0.12 });
      tone(ctx, out, bt, { freq: midi(bass[Math.floor(k / 2) % bass.length]), type: 'triangle', dur: B * 0.9, vol: 0.16 });
      if (k % 4 === 0) [60, 64, 67].forEach((n) => brass(ctx, out, bt, { freq: midi(n), dur: B * 1.8, vol: 0.06 }));
    }
    // 4) 마무리: 큰 화음 + 심벌 + 반짝이
    const end = at + 0.1;
    [60, 64, 67, 72, 76, 79].forEach((n) => brass(ctx, out, end, { freq: midi(n), dur: 1.6, vol: 0.09 }));
    [84, 88, 91, 96].forEach((n, i) => bell(ctx, out, end + i * 0.07, { freq: midi(n), dur: 1.8, vol: 0.12 }));
    drum(ctx, out, end, { low: true, vol: 0.4 });
    noise(ctx, out, end, { dur: 1.2, vol: 0.16, type: 'highpass', freq: 5000 });
    for (let i = 0; i < 6; i++) tone(ctx, out, end + 0.4 + i * 0.12, { freq: midi(93 + (i * 5) % 12), type: 'sine', dur: 0.3, vol: 0.07 });
  },
  lose: (ctx, out, t) => {
    [67, 63, 60, 55].forEach((n, i) => pluck(ctx, out, t + i * 0.2, { freq: midi(n), dur: 1.2, vol: 0.2 }));
    tone(ctx, out, t + 0.8, { freq: 98, slideTo: 82, dur: 1.2, vol: 0.2, type: 'sine' });
  },
  draw: (ctx, out, t) => {
    [67, 67].forEach((n, i) => pluck(ctx, out, t + i * 0.25, { freq: midi(n), dur: 0.9, vol: 0.18 }));
  },
};

// ---- 배경 음악 ----
// 느긋한 라운지 재즈 풍 자동 생성 루프: 전자피아노 코드 + 워킹 베이스 + 브러시 드럼.
const BEAT = 0.68; // 한 박(≈88 BPM)
const BAR = BEAT * 4;
const SWING = BEAT * 0.07; // 뒷박을 살짝 늦춰 스윙 느낌을 준다

// 네 마디 순환 코드 진행 (Am7 - Dm7 - G7 - Cmaj7): 베이스 음과 구성음(MIDI)
const PROGRESSION = [
  { bass: 45, notes: [60, 64, 67, 71] }, // Am7
  { bass: 50, notes: [60, 65, 69, 72] }, // Dm7
  { bass: 43, notes: [59, 62, 65, 69] }, // G9
  { bass: 48, notes: [59, 64, 67, 71] }, // Cmaj7
];
// 코드마다 선율에 쓸 음 (코드음 + 지나가는 음)
const MELODY = [
  [69, 72, 76, 79, 81],
  [69, 72, 77, 81, 84],
  [67, 71, 74, 77, 79],
  [67, 71, 76, 79, 83],
];

// 전자피아노: 부드럽게 올라왔다 길게 사라지는 사인음 두 겹
function epiano(ctx, out, t, { freq, dur = 1.6, vol = 0.07 }) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2600;
  lp.connect(out);
  tone(ctx, lp, t, { freq, type: 'sine', dur, vol, attack: 0.035 });
  tone(ctx, lp, t, { freq: freq * 2.01, type: 'sine', dur: dur * 0.45, vol: vol * 0.3, attack: 0.02 });
}

// 손가락으로 뜯는 더블베이스
function upright(ctx, out, t, { freq, dur = 0.55, vol = 0.22 }) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  lp.connect(out);
  tone(ctx, lp, t, { freq, type: 'triangle', dur, vol, attack: 0.012, slideTo: freq * 0.99 });
  noise(ctx, lp, t, { dur: 0.03, vol: vol * 0.25, freq: 900, q: 0.8 });
}

// 브러시로 쓸어 주는 스네어·라이드
function brush(ctx, out, t, { vol = 0.05, swish = true }) {
  noise(ctx, out, t, swish
    ? { dur: 0.22, vol, type: 'highpass', freq: 4200, q: 0.6, attack: 0.05 }
    : { dur: 0.07, vol: vol * 1.2, type: 'bandpass', freq: 6500, q: 1.2 });
}

export function createMusic(ctx, out, rand = Math.random) {
  let bar = 0;
  let last = 2; // 직전에 쓴 선율 음 번호
  const scheduleBar = (t0) => {
    const step = bar % PROGRESSION.length;
    const chord = PROGRESSION[step];
    const scale = MELODY[step];

    // 베이스: 1·3박은 근음, 2·4박은 코드음 사이를 걸어 다닌다
    upright(ctx, out, t0, { freq: midi(chord.bass) });
    upright(ctx, out, t0 + BEAT, { freq: midi(chord.bass + 7), vol: 0.14 });
    upright(ctx, out, t0 + BEAT * 2, { freq: midi(chord.bass + 12), vol: 0.17 });
    upright(ctx, out, t0 + BEAT * 3 + SWING, { freq: midi(chord.bass + (rand() < 0.5 ? 10 : 5)), vol: 0.13 });

    // 브러시: 박마다 쓸고, 뒷박에 가볍게 찍는다
    for (let b = 0; b < 4; b++) {
      brush(ctx, out, t0 + b * BEAT, { vol: b % 2 === 0 ? 0.05 : 0.035 });
      if (b % 2 === 1) brush(ctx, out, t0 + b * BEAT + BEAT / 2 + SWING, { vol: 0.03, swish: false });
    }

    // 코드: 2박과 4박 뒤에 살짝 늦게 깔아 준다 (엇박 컴핑)
    const comp = (t, spread) => chord.notes.forEach((n, k) => epiano(ctx, out, t + k * 0.012, { freq: midi(n), dur: spread, vol: 0.055 }));
    comp(t0 + BEAT * 0.5 + SWING, 1.5);
    if (rand() < 0.7) comp(t0 + BEAT * 2.5 + SWING, 1.2);

    // 선율: 한두 음씩 띄엄띄엄, 가까운 음으로 움직인다
    const hits = rand() < 0.35 ? [1.5, 3] : [2.5];
    hits.forEach((b) => {
      last = Math.max(0, Math.min(scale.length - 1, last + Math.floor(rand() * 3) - 1));
      epiano(ctx, out, t0 + b * BEAT + SWING, { freq: midi(scale[last]), dur: 1.3, vol: 0.085 });
    });

    bar++;
  };
  return { scheduleBar, BAR };
}
