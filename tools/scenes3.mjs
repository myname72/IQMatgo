import { C, W, H, rng, card, ell, circ, path, rect, leaf, blossom, vine, jagged, ribbon, hikari } from './lib.mjs';

const f = (n) => Math.round(n * 100) / 100;

// ---------- 국화 ----------
function chrys(x, y, s, rand) {
  let o = `<g transform="translate(${f(x)} ${f(y)}) scale(${s})">`;
  for (let i = 0; i < 22; i++) o += `<ellipse cx="0" cy="-11" rx="2.6" ry="9" fill="${C.yel}" stroke="${C.blk}" stroke-width="0.5" transform="rotate(${i * (360 / 22)})"/>`;
  for (let i = 0; i < 14; i++) o += `<ellipse cx="0" cy="-6.5" rx="2.3" ry="5.5" fill="${i % 2 ? '#f08a1c' : C.red}" stroke="${C.blk}" stroke-width="0.4" transform="rotate(${i * (360 / 14) + 6})"/>`;
  o += circ(0, 0, 3.4, C.yel, C.blk, 0.5);
  return o + `</g>`;
}
function chrysLeaves(x, y, rand, n = 4) {
  let o = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand();
    o += jagged(x + Math.cos(a) * 20, y + Math.sin(a) * 20, 10, 6.5, 6, rand);
  }
  return o;
}
function sakeCup(x, y, s) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
${path('M-22 0 C-22 22 22 22 22 0Z', C.red, C.blk, 1.2)}
${path('M-24 0 Q 0 -8 24 0', C.yel, C.blk, 1)}
${path('M-6 20 L-8 28 L8 28 L6 20Z', C.red, C.blk, 1)}
${path('M-12 8 q 12 6 24 0', 'none', C.yel, 1.6)}
${circ(0, 12, 3, C.yel, null)}
</g>`;
}
export function month9() {
  const out = {};
  {
    const r = rng(91);
    let s = chrysLeaves(58, 44, r) + chrys(58, 44, 1.5, r);
    s += `<path d="M2 ${H} L2 118 Q 28 108 54 120 T 102 112 L102 ${H}Z" fill="${C.blu}" stroke="${C.blk}" stroke-width="0.8"/>`;
    s += path('M10 136 q 8 -5 16 0 t 16 0 t 16 0', 'none', C.wht, 1.4);
    s += sakeCup(46, 106, 1.25);
    out.Tane = card(s);
  }
  {
    const r = rng(92);
    let s = chrysLeaves(44, 112, r) + chrys(44, 112, 1.25, r) + chrysLeaves(66, 38, r, 3) + chrys(66, 36, 0.85, r);
    s += ribbon(50, 70, 24, 100, 3, C.blu, '청단');
    out.Tanzaku = card(s);
  }
  for (const [k, seed, a] of [['Kasu_1', 93, [40, 46, 64, 116]], ['Kasu_2', 94, [66, 44, 40, 114]]]) {
    const r = rng(seed);
    out[k] = card(chrysLeaves(a[0], a[1], r) + chrysLeaves(a[2], a[3], r) + chrys(a[0], a[1], 1.0, r) + chrys(a[2], a[3], 1.3, r));
  }
  return out;
}

// ---------- 단풍 ----------
function maple(x, y, s, rot, fill) {
  const pts = [];
  const tips = 5;
  for (let i = 0; i < tips * 2; i++) {
    const a = (i * Math.PI) / tips - Math.PI / 2;
    const r = i % 2 === 0 ? (i === 0 ? 17 : 14) : 6;
    pts.push(`${f(Math.cos(a) * r)} ${f(Math.sin(a) * r)}`);
  }
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot}) scale(${s})"><polygon points="${pts.join(' ')}" fill="${fill}" stroke="${C.blk}" stroke-width="0.8" stroke-linejoin="round"/>${path('M0 0 L0 22', 'none', C.blk, 0.9)}${path('M0 0 L-8 -8 M0 0 L8 -8 M0 -2 L0 -13', 'none', C.blk, 0.5)}</g>`;
}
function mapleBranch(rand, variant) {
  const cols = [C.red, C.blk, '#f08a1c', C.red, C.yel, C.blk];
  let o = path(variant ? 'M96 20 Q 60 70 12 150' : 'M8 24 Q 50 80 94 148', 'none', C.blk, 2.4);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const bx = variant ? 96 - 84 * t : 8 + 86 * t;
    const by = variant ? 20 + 130 * t : 24 + 124 * t;
    o += maple(bx + (rand() - 0.5) * 30, by + (rand() - 0.5) * 22, 0.8 + rand() * 0.45, rand() * 360, cols[i % cols.length]);
  }
  return o;
}
function deer(x, y, s) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
${path('M-14 14 L-16 42 M-6 16 L-6 44 M12 16 L12 44 M20 12 L24 40', 'none', C.blk, 2.6)}
${path('M-22 4 C-22 -10 4 -12 20 -6 C 28 -2 28 12 18 16 C 4 20 -22 18 -22 4Z', '#f1b92c', C.blk, 1)}
${path('M-20 -4 C -34 -14 -34 -34 -26 -44 L-16 -40 C -18 -28 -12 -14 -10 -8Z', '#f1b92c', C.blk, 1)}
${path('M-26 -44 C-34 -48 -38 -42 -34 -38 C -32 -34 -26 -34 -22 -38Z', '#f6c453', C.blk, 1)}
${path('M-28 -46 l-4 -12 l4 4 l2 -10 l2 10 l4 -4 l-2 12', 'none', C.blk, 1.2)}
${circ(-31, -42, 1.1, C.blk, null)}
${path('M22 -4 q 6 -4 8 2', 'none', C.blk, 1.4)}
${[[-14, 0], [-4, -4], [6, 0], [14, 4], [-10, 8], [2, 8]].map(([a, b]) => circ(a, b, 1.5, C.blk, null)).join('')}
</g>`;
}
export function month10() {
  const out = {};
  {
    const r = rng(101);
    let s = mapleBranch(r, 0);
    s += deer(62, 104, 1.22);
    out.Tane = card(s);
  }
  {
    const r = rng(102);
    let s = mapleBranch(r, 1);
    s += ribbon(50, 80, 24, 100, 4, C.blu, '청단');
    out.Tanzaku = card(s);
  }
  for (const [k, seed, v] of [['Kasu_1', 103, 0], ['Kasu_2', 104, 1]]) {
    const r = rng(seed);
    out[k] = card(mapleBranch(r, v) + mapleBranch(rng(seed + 5), 1 - v));
  }
  return out;
}

// ---------- 오동 ----------
function paulowniaLeaf(x, y, s, rot) {
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot}) scale(${s})"><path d="M0 -22 C 14 -26 26 -12 24 2 C 22 14 10 22 0 26 C -10 22 -22 14 -24 2 C -26 -12 -14 -26 0 -22Z" fill="${C.blk}"/>${path('M0 -16 L0 24 M0 0 L-14 -6 M0 0 L14 -6 M0 10 L-10 8 M0 10 L10 8', 'none', C.wht, 0.7)}</g>`;
}
function paulowniaFlowers(x, y, s, rand) {
  let o = path(`M${x} ${y + 30 * s} L${x} ${y - 4 * s}`, 'none', C.blk, 1.4);
  for (let i = 0; i < 7; i++) {
    const px = x + (i % 2 ? 7 : -7) * s * (1 - i * 0.08);
    const py = y + (i * 6 - 4) * s;
    o += `<g transform="translate(${f(px)} ${f(py)}) scale(${s})">${path('M-5 -4 L5 -4 L4 5 Q0 9 -4 5Z', '#4a8be0', C.blk, 0.7)}${circ(0, -4, 1.4, '#a9c9f5', null)}</g>`;
  }
  o += circ(x, y - 7 * s, 3.2 * s, '#4a8be0', C.blk, 0.6);
  return o;
}
function phoenix(x, y, s) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
${path('M10 4 C 30 10 34 30 20 42 C 28 28 18 18 6 14Z', C.red, C.blk, 0.9)}
${path('M14 8 C 40 14 48 38 30 54 C 40 36 28 22 10 14Z', C.blk, null)}
${path('M12 14 C 30 28 28 44 14 56 C 20 42 16 30 6 22Z', C.red, C.blk, 0.9)}
${path('M-18 -6 C-18 -22 8 -26 18 -10 C 24 2 18 14 0 18 C -14 18 -22 6 -18 -6Z', C.blk, null)}
${path('M-8 -4 C 0 -14 14 -10 14 0 C 10 8 -2 8 -8 -4Z', C.red, C.blk, 0.8)}
${path('M-14 -22 C-22 -34 -14 -40 -8 -34 C -10 -28 -8 -26 -4 -24Z', C.blk, null)}
${path('M-6 -30 l-6 -12 l8 6 l2 -12 l3 12 l8 -6 l-4 12Z', C.red, C.blk, 0.7)}
${circ(-12, -18, 5.4, C.red, C.blk, 0.8)}
${circ(-14, -19, 1.3, C.blk, null)}
${path('M-17 -16 L-30 -12 L-17 -11Z', C.yel, C.blk, 0.7)}
</g>`;
}
export function month11() {
  const out = {};
  {
    const r = rng(111);
    let s = paulowniaLeaf(24, 124, 1.05, -12) + paulowniaLeaf(78, 138, 0.9, 14);
    s += paulowniaFlowers(78, 60, 1.1, r);
    s += phoenix(44, 70, 1.15);
    s += hikari(26, 150, 8.5);
    out.Hikari = card(s);
  }
  // Kasu_2: 쌍피 — 아래쪽이 붉다
  {
    const r = rng(112);
    let s = rect(4, 112, W - 8, 52, C.red);
    s += paulowniaLeaf(50, 118, 1.75, 0) + paulowniaFlowers(30, 40, 1.35, r) + paulowniaFlowers(70, 58, 1.2, r);
    out.Kasu_2 = card(s);
  }
  for (const [k, seed, a] of [['Kasu_1', 113, [64, 46, 40, 126, 1]], ['Kasu_3', 114, [34, 52, 62, 126, -1]]]) {
    const r = rng(seed);
    let s = paulowniaLeaf(a[2], a[3], 1.7, 8 * a[4]) + paulowniaFlowers(a[0], a[1], 1.4, r) + paulowniaFlowers(a[0] + a[4] * 26, a[1] + 34, 1.1, r);
    out[k] = card(s);
  }
  return out;
}

// ---------- 비 ----------
function willow(rand, xs, top = 8) {
  let o = '';
  for (const x of xs) {
    const len = 70 + rand() * 60;
    o += path(`M${x} ${top} C ${x - 8} ${top + len * 0.4} ${x + 8} ${top + len * 0.7} ${x} ${top + len}`, 'none', C.blk, 1.4);
    for (let i = 1; i < 8; i++) o += leaf(x + (i % 2 ? 3 : -3), top + (len / 8) * i, 11, 2.6, i % 2 ? 80 : -80, C.blk);
  }
  return o;
}
function umbrellaMan(x, y, s) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
${path('M-6 40 L-6 52 M6 40 L6 52', 'none', C.blk, 2.2)}
${path('M-12 6 L12 6 L16 42 L-16 42Z', C.red, C.blk, 1)}
${path('M-4 6 L4 6 L6 42 L-6 42Z', '#ff4d55', null)}
${circ(0, -6, 6, '#f7d9b0')}
${path('M-8 -9 L8 -9 L6 -16 L-6 -16Z', C.blk, null)}
${path('M-12 -9 L12 -9', 'none', C.blk, 2)}
${path('M-26 -10 C -22 -30 22 -30 26 -10 Q 0 -20 -26 -10Z', C.grn, C.blk, 1)}
${path('M0 -24 L0 6', 'none', C.blk, 1.4)}
${path('M-12 8 L-24 -8', 'none', C.blk, 1.6)}
</g>`;
}
function frog(x, y, s) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
${ell(0, 0, 11, 7, '#f1c232', 0)}
${circ(-5, -6, 3.2, '#f1c232')}${circ(5, -6, 3.2, '#f1c232')}
${circ(-5, -6.4, 1, C.blk, null)}${circ(5, -6.4, 1, C.blk, null)}
${path('M-10 4 L-18 10 M10 4 L18 10', 'none', C.blk, 2)}
${path('M-12 -2 l-5 -3 M12 -2 l5 -3', 'none', C.blk, 2)}
</g>`;
}
function swallow(x, y, s, rot) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
${path('M14 4 L36 18 L28 6 L38 4 L22 -2Z', C.blk, null)}
${path('M-4 -2 C 6 -26 28 -30 40 -26 C 26 -18 16 -8 6 4Z', C.red, C.blk, 0.9)}
${path('M-22 0 C-22 -12 6 -14 16 -4 C 20 4 8 10 -6 8 C -16 8 -22 6 -22 0Z', C.blk, null)}
${circ(-16, -3, 7, C.blk, null)}
${path('M-14 -4 C -20 2 -14 8 -8 6Z', C.red, null)}
${path('M-22 -4 L-32 -2 L-22 1Z', C.yel, C.blk, 0.6)}
${circ(-18, -5, 1, C.wht, null)}
</g>`;
}
function rainWater(y) {
  let o = '';
  for (let i = 0; i < 5; i++) o += path(`M2 ${y + i * 8} q 6 -4 12 0 t 12 0 t 12 0 t 12 0 t 12 0 t 12 0 t 12 0 t 12 0`, 'none', C.blu, 1.6);
  return o;
}
export function month12() {
  const out = {};
  {
    const r = rng(121);
    let s = willow(r, [20, 40, 62, 86], 6);
    s += rainWater(108);
    s += umbrellaMan(54, 82, 1.3) + frog(24, 144, 1.05);
    s += hikari(24, 20, 8.5);
    out.Hikari = card(s);
  }
  {
    const r = rng(122);
    let s = willow(r, [16, 36, 60, 84, 96], 6);
    s += swallow(52, 96, 1.5, -18);
    out.Tane = card(s);
  }
  {
    const r = rng(123);
    let s = willow(r, [14, 34, 62, 88], 6);
    s += ribbon(52, 84, 24, 100, 5, C.red, '');
    out.Tanzaku = card(s);
  }
  {
    // 쌍피: 붉은 빗금 바탕에 검은 아치
    let s = rect(4, 4, W - 8, H - 8, C.red);
    for (let i = 0; i < 24; i++) s += path(`M${4 + i * 5} 4 L${-30 + i * 5} ${H}`, 'none', C.blk, 0.6);
    s += path(`M16 ${H} L16 72 Q 16 22 52 22 Q 88 22 88 72 L88 ${H}Z`, C.blk, null);
    s += path(`M30 ${H} L30 80 Q 30 44 52 44 Q 74 44 74 80 L74 ${H}Z`, C.red, null);
    out.Kasu = card(s);
  }
  return out;
}
