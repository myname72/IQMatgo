import { C, W, H, rng, card, ell, circ, path, rect, leaf, blossom, vine, jagged, ribbon, hikari, bird } from './lib.mjs';

const f = (n) => Math.round(n * 100) / 100;

// 가늘고 긴 잎(칼날 모양)
function blade(x, y, len, bend, w, fill = C.blk) {
  return `<path d="M${f(x - w)} ${f(y)} Q ${f(x + bend * 0.2)} ${f(y - len * 0.5)} ${f(x + bend)} ${f(y - len)} Q ${f(x + bend * 0.6 + w)} ${f(y - len * 0.45)} ${f(x + w)} ${f(y)}Z" fill="${fill}"/>`;
}

// ---------- 붓꽃(난초) ----------
function iris(x, y, s) {
  let o = path(`M${x} ${y + 36 * s} L${x} ${y + 4 * s}`, 'none', C.blk, 1.6);
  // 위로 선 꽃잎 2장
  o += `<g transform="translate(${f(x)} ${f(y)}) scale(${s})">`;
  o += ell(-5, -6, 4.8, 11, C.blu, -18) + ell(5, -6, 4.8, 11, C.blu, 18);
  // 아래로 처진 꽃잎 3장
  o += ell(-10, 7, 5.6, 10, '#3d86dd', 60) + ell(10, 7, 5.6, 10, '#3d86dd', -60) + ell(0, 11, 6, 10.5, C.blu, 0);
  o += ell(0, 8, 1.6, 6, C.yel, 0, null);
  o += `</g>`;
  return o;
}
function bridge(y) {
  let o = '';
  // 팔교: 지그재그로 꺾인 노란 판자 다리와 붉은 기둥, 아래 물결
  o += path(`M2 ${y + 10} L 24 ${y + 2} L 40 ${y + 14} L 60 ${y + 4} L 80 ${y + 16} L 100 ${y + 8}`, 'none', C.blk, 10);
  o += path(`M2 ${y + 10} L 24 ${y + 2} L 40 ${y + 14} L 60 ${y + 4} L 80 ${y + 16} L 100 ${y + 8}`, 'none', C.yel, 7.6);
  for (const x of [14, 36, 58, 82]) o += rect(x, y + 12, 4, 18, C.red, 0, C.blk, 0.6);
  for (let i = 0; i < 4; i++) o += path(`M6 ${y + 26 + i * 7} q 6 -4 12 0 t 12 0 t 12 0 t 12 0 t 12 0 t 12 0 t 12 0`, 'none', C.blu, 1.4);
  return o;
}
export function month5() {
  const out = {};
  {
    const r = rng(51);
    let s = '';
    s += blade(26, 108, 60, -12, 3.4) + blade(42, 108, 74, 8, 3.2) + blade(70, 108, 58, 12, 3.2);
    s += iris(36, 40, 1.15) + iris(66, 62, 0.9);
    s += bridge(112);
    out.Tane = card(s);
  }
  {
    const r = rng(52);
    let s = blade(20, 150, 100, -10, 3.6) + blade(42, 150, 120, 6, 3.4) + blade(66, 150, 96, 14, 3.4) + blade(84, 150, 84, 8, 3);
    s += iris(48, 44, 1.2);
    s += ribbon(54, 80, 24, 100, 5, C.red, '');
    out.Tanzaku = card(s);
  }
  for (const [k, seed, a] of [['Kasu_1', 53, [30, 60]], ['Kasu_2', 54, [64, 50]]]) {
    let s = blade(20, 156, 96, -8, 3.6) + blade(40, 156, 112, 8, 3.4) + blade(64, 156, 100, 10, 3.4) + blade(84, 156, 84, -6, 3);
    s += iris(a[0], a[1], 1.25) + iris(104 - a[0], a[1] + 38, 1.0);
    out[k] = card(s);
  }
  return out;
}

// ---------- 모란 ----------
function peony(x, y, s, rand) {
  let o = `<g transform="translate(${f(x)} ${f(y)}) scale(${s})">`;
  const ring = (n, r, pr, fill) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand();
      o += circ(Math.cos(a) * r, Math.sin(a) * r, pr, fill, C.blk, 0.7);
    }
  };
  ring(8, 14, 9, '#d8101c');
  ring(7, 9, 7.5, '#ee2a36');
  ring(5, 5, 5.5, '#ff5560');
  o += circ(0, 0, 4, C.yel, C.blk, 0.7);
  o += `</g>`;
  return o;
}
function peonyLeaves(x, y, rand, n = 5) {
  let o = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360 + rand() * 30;
    o += jagged(x + Math.cos(a * Math.PI / 180) * 20, y + Math.sin(a * Math.PI / 180) * 20, 11, 7, 7, rand);
  }
  return o;
}
function butterfly(x, y, s, rot) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
${path('M0 0 C -14 -18 -26 -4 -12 8 C -4 12 0 6 0 0Z', C.yel, C.blk, 0.9)}
${path('M0 0 C 14 -18 26 -4 12 8 C 4 12 0 6 0 0Z', C.yel, C.blk, 0.9)}
${path('M0 2 C -10 10 -14 20 -4 20 C 0 18 0 8 0 2Z', C.red, C.blk, 0.9)}
${path('M0 2 C 10 10 14 20 4 20 C 0 18 0 8 0 2Z', C.red, C.blk, 0.9)}
${circ(-7, -6, 2, C.blk, null)}${circ(7, -6, 2, C.blk, null)}
${path('M0 -2 L0 16 M0 -2 q -4 -8 -9 -10 M0 -2 q 4 -8 9 -10', 'none', C.blk, 1)}
</g>`;
}
function cloudRed(y) {
  let d = `M2 ${y + 22}`;
  for (let i = 0; i < 5; i++) d += ` q 6 -22 ${i % 2 ? 14 : 18} -8`;
  return path(d + ` L${W} ${y + 30} L2 ${y + 30}Z`, C.red, C.blk, 0.8);
}
export function month6() {
  const out = {};
  {
    const r = rng(61);
    let s = peonyLeaves(52, 48, r) + peony(52, 48, 1.25, r);
    s += butterfly(32, 100, 1.1, -14) + butterfly(70, 108, 1.0, 12);
    s += cloudRed(136);
    out.Tane = card(s);
  }
  {
    const r = rng(62);
    let s = peonyLeaves(50, 118, r, 6) + peony(50, 118, 1.15, r) + peonyLeaves(60, 34, r, 4) + peony(62, 36, 0.7, r);
    s += ribbon(46, 70, 24, 100, -3, C.blu, '청단');
    out.Tanzaku = card(s);
  }
  for (const [k, seed, a] of [['Kasu_1', 63, [40, 52, 62, 118]], ['Kasu_2', 64, [66, 46, 40, 112]]]) {
    const r = rng(seed);
    let s = peonyLeaves(a[0], a[1], r) + peonyLeaves(a[2], a[3], r) + peony(a[0], a[1], 0.95, r) + peony(a[2], a[3], 1.2, r);
    out[k] = card(s);
  }
  return out;
}

// ---------- 홍싸리 ----------
function bushClover(rand, variant) {
  let o = '';
  const stems = variant
    ? [[14, 150, 40, 18, -10], [40, 156, 84, 24, 10], [70, 156, 92, 70, -6]]
    : [[10, 156, 34, 22, 10], [44, 156, 70, 16, -12], [74, 156, 92, 60, 6]];
  for (const [x0, y0, x1, y1, bend] of stems) {
    o += vine(x0, y0, x1, y1, bend, 9, 13, 4.6, [C.red, C.blk, C.red, C.blk, C.red], rand, C.blk, 1.1);
  }
  return o;
}
function boar(x, y, s) {
  // 멧돼지: 왼쪽을 본다. 노란 몸, 등을 따라 선 털, 큰 머리와 주둥이, 하얀 송곳니
  return `<g transform="translate(${x} ${y}) scale(${s})">
${path('M-14 16 L-14 34 M-4 18 L-4 36 M14 18 L14 36 M24 14 L26 32', 'none', C.blk, 3.6)}
${path('M-16 34 l-4 3 M-6 36 l-4 3 M12 36 l-4 3 M24 32 l-4 3', 'none', C.blk, 2.4)}
${path('M-26 4 C-26 -14 -4 -22 16 -16 C 32 -10 34 10 22 16 C 6 22 -26 20 -26 4Z', '#e8a317', C.blk, 1.1)}
${path('M-22 -8 L-18 -20 L-12 -12 L-6 -22 L0 -14 L6 -22 L12 -14 L18 -20 L24 -8', C.blk, C.blk, 0.8)}
${path('M-24 -6 C -46 -14 -56 6 -46 16 C -38 22 -24 18 -22 8Z', '#f2b73a', C.blk, 1.1)}
${path('M-46 0 C -58 0 -58 14 -48 14 C -44 12 -44 4 -46 0Z', '#f6c453', C.blk, 1)}
${circ(-52, 6, 1.4, C.blk, null)}${circ(-51, 10, 1.1, C.blk, null)}
${path('M-44 14 C -46 20 -40 22 -38 18', C.wht, C.blk, 0.8)}
${path('M-30 -6 L-24 -18 L-20 -8Z', '#c98a0c', C.blk, 0.9)}
${circ(-36, 0, 1.6, C.blk, null)}
${path('M26 -2 q 8 -2 8 6 q -2 6 -8 2', 'none', C.blk, 1.4)}
${path('M-12 -4 q 6 5 12 0 M0 4 q 6 4 14 -1', 'none', C.blk, 1)}
</g>`;
}

export function month7() {
  const out = {};
  {
    const r = rng(71);
    let s = bushClover(r, 0);
    s += boar(68, 108, 1.05);
    out.Tane = card(s);
  }
  {
    const r = rng(72);
    let s = bushClover(r, 1);
    s += ribbon(50, 80, 24, 100, 5, C.red, '');
    out.Tanzaku = card(s);
  }
  for (const [k, seed, v] of [['Kasu_1', 73, 0], ['Kasu_2', 74, 1]]) {
    const r = rng(seed);
    out[k] = card(bushClover(r, v));
  }
  return out;
}

// ---------- 공산(억새·보름달) ----------
function hill(y, rand, w = 1) {
  const pts = [[2, y + 22], [24, y - 4 * w], [50, y + 8], [76, y - 12 * w], [102, y + 14]];
  let d = `M2 ${H} L2 ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) d += ` Q ${(pts[i - 1][0] + pts[i][0]) / 2} ${Math.min(pts[i - 1][1], pts[i][1]) - 10 * rand()} ${pts[i][0]} ${pts[i][1]}`;
  d += ` L${W} ${H}Z`;
  return path(d, C.blk, null);
}
function goose(x, y, s, color, rot = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
${path('M-6 0 C -20 -22 -34 -14 -34 -6 C -24 -8 -14 -4 -4 4Z', color, C.blk, 0.9)}
${path('M6 0 C 20 -22 34 -14 34 -6 C 24 -8 14 -4 4 4Z', color, C.blk, 0.9)}
${ell(0, 4, 8, 4.5, color, 0)}
${circ(0, -3, 3.2, color)}
${path('M-2 -4 L-9 -6 L-2 -1Z', C.org, C.blk, 0.5)}
${path('M0 8 L-2 15 M0 8 L4 14', 'none', C.blk, 0.8)}
</g>`;
}
export function month8() {
  const out = {};
  {
    const r = rng(81);
    let s = circ(52, 52, 31, C.red, null) + circ(52, 52, 31, 'none', C.blk, 1);
    s += hill(84, r, 1.2);
    s += hikari(24, 148, 8.5);
    out.Hikari = card(s);
  }
  {
    const r = rng(82);
    let s = hill(100, r, 1);
    s += goose(34, 38, 1.2, C.yel, -8) + goose(66, 52, 1.1, C.red, 6) + goose(46, 78, 1.0, C.yel, -4);
    out.Tane = card(s);
  }
  for (const [k, seed, y] of [['Kasu_1', 83, 82], ['Kasu_2', 84, 74]]) {
    const r = rng(seed);
    out[k] = card(hill(y, r, 1.4));
  }
  return out;
}
