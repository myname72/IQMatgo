import { C, W, H, rng, card, ell, circ, path, rect, leaf, blossom, vine, jagged, ribbon, hikari, bird } from './lib.mjs';

// ---------- 소나무 ----------
function pine(cx, cy, s, rand, trunk = true) {
  let o = '';
  if (trunk) o += path(`M${cx} ${cy + 40 * s} C ${cx - 4 * s} ${cy + 20 * s} ${cx + 5 * s} ${cy + 8 * s} ${cx} ${cy}`, 'none', C.brn, 3.2 * s);
  const blobs = [[0, 0, 26, 11], [-16, 14, 20, 9], [17, 16, 20, 9], [0, 26, 22, 9]];
  for (const [dx, dy, rx, ry] of blobs) {
    o += jagged(cx + dx * s, cy + dy * s - 6 * s, rx * s, ry * s, 9, rand);
    for (let i = 0; i < 4; i++) {
      const px = cx + (dx + (rand() - 0.5) * rx * 1.2) * s;
      const py = cy + (dy - 6 + (rand() - 0.5) * ry) * s;
      o += path(`M${px} ${py} l ${(rand() - 0.5) * 8 * s} ${(rand() - 0.5) * 5 * s}`, 'none', C.wht, 0.7);
    }
  }
  return o;
}

function crane(x, y, s) {
  // 학: 왼쪽을 보고 선 모습. 흰 몸, 길고 휜 목, 붉은 정수리, 검은 날개 끝과 꽁지
  return `<g transform="translate(${x} ${y}) scale(${s})">
${path('M-2 10 L-4 46 L-9 50 M5 10 L7 46 L12 50', 'none', C.blk, 1.8)}
${path('M14 -1 L40 8 L34 12 L12 6Z', C.blk, null)}
${path('M-20 -4 C-22 -16 6 -22 22 -10 C 26 2 12 14 -4 12 C -14 10 -19 4 -20 -4Z', C.wht, C.blk, 1.1)}
${path('M0 -8 C 10 -18 24 -14 28 -4 C 18 -4 8 -2 0 -8Z', C.wht, C.blk, 1)}
${path('M18 -10 C 24 -12 28 -8 28 -4 L20 -4Z', C.blk, null)}
${path('M-16 -6 C -30 -14 -30 -30 -22 -42', 'none', C.blk, 6.6)}
${path('M-16 -6 C -30 -14 -30 -30 -22 -42', 'none', C.wht, 4.4)}
${circ(-22, -46, 5.6, C.wht, C.blk, 1.1)}
${path('M-27 -49 Q -22 -56 -16 -50 Q -22 -49 -27 -49Z', C.red, C.blk, 0.6)}
${path('M-27 -45 L-46 -42 L-27 -41Z', C.org, C.blk, 0.7)}
${circ(-24, -47, 1, C.blk, null)}
</g>`;
}

export function month1() {
  const out = {};
  {
    const r = rng(11);
    let s = circ(34, 38, 25, C.red, null);
    s += pine(74, 124, 0.85, r);
    s += crane(60, 94, 1.12);
    s += hikari(84, 150, 8.5);
    out.Hikari = card(s);
  }
  {
    const r = rng(12);
    let s = pine(52, 128, 1.15, r);
    s += ribbon(50, 66, 24, 98, -4, C.red, '홍단');
    out.Tanzaku = card(s);
  }
  for (const [k, seed, dx] of [['Kasu_1', 13, -8], ['Kasu_2', 14, 10]]) {
    const r = rng(seed);
    out[k] = card(pine(52 + dx, 56, 1.15, r) + pine(48 - dx, 124, 1.0, r));
  }
  return out;
}

// ---------- 매화 ----------
function plum(x0, y0, x1, y1, bend, rand, n = 7) {
  let o = path(`M${x0} ${y0} Q ${(x0 + x1) / 2 + bend} ${(y0 + y1) / 2} ${x1} ${y1}`, 'none', C.blk, 4);
  o += path(`M${(x0 + x1) / 2 + bend * 0.3} ${(y0 + y1) / 2} q ${12} ${-14} ${22} ${-12}`, 'none', C.blk, 2.2);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const px = x0 + (x1 - x0) * t + (rand() - 0.5) * 22;
    const py = y0 + (y1 - y0) * t + (rand() - 0.5) * 18;
    if (rand() > 0.28) o += blossom(px, py, 6.5 + rand() * 3, C.red, C.yel);
    else o += circ(px, py, 2.6, C.red, C.blk, 0.6);
  }
  return o;
}

export function month2() {
  const out = {};
  {
    const r = rng(21);
    let s = plum(8, 150, 96, 36, -10, r, 6);
    s += bird(50, 66, 1.35, '#3d9b6a', '#e9d43b', '#2a6fb0', '#2a6fb0');
    out.Tane = card(s);
  }
  {
    const r = rng(22);
    let s = plum(10, 28, 92, 150, 12, r, 8);
    s += ribbon(52, 80, 24, 100, 3, C.red, '홍단');
    out.Tanzaku = card(s);
  }
  for (const [k, seed, a] of [['Kasu_1', 23, [8, 154, 94, 30, -14]], ['Kasu_2', 24, [96, 150, 10, 40, 14]]]) {
    const r = rng(seed);
    out[k] = card(plum(a[0], a[1], a[2], a[3], a[4], r, 9));
  }
  return out;
}

// ---------- 벚꽃 ----------
function sakura(x, y, r, rand) {
  let o = '';
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 - 90) * Math.PI / 180;
    const px = x + Math.cos(a) * r * 0.62, py = y + Math.sin(a) * r * 0.62;
    o += `<ellipse cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" rx="${(r * 0.5).toFixed(2)}" ry="${(r * 0.62).toFixed(2)}" fill="${rand() > 0.3 ? C.pnk : '#fbd1da'}" stroke="${C.blk}" stroke-width="0.6" transform="rotate(${i * 72} ${px.toFixed(2)} ${py.toFixed(2)})"/>`;
  }
  o += circ(x, y, r * 0.26, C.red, null);
  for (let i = 0; i < 6; i++) o += path(`M${x} ${y} l ${(Math.cos(i) * r * 0.5).toFixed(2)} ${(Math.sin(i) * r * 0.5).toFixed(2)}`, 'none', C.red, 0.6);
  return o;
}
function sakuraBranch(x0, y0, x1, y1, bend, rand, n = 6) {
  let o = path(`M${x0} ${y0} Q ${(x0 + x1) / 2 + bend} ${(y0 + y1) / 2} ${x1} ${y1}`, 'none', C.blk, 4.2);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.4) / n;
    o += sakura(x0 + (x1 - x0) * t + (rand() - 0.5) * 24, y0 + (y1 - y0) * t + (rand() - 0.5) * 20, 8 + rand() * 3, rand);
  }
  return o;
}
function curtain(y, h) {
  let o = rect(4, y, W - 8, h, C.blk);
  for (let i = 0; i < 6; i++) o += rect(10 + i * 15, y + 6, 6, h - 14, i % 2 ? C.wht : C.red);
  let d = `M4 ${y + h}`;
  for (let i = 0; i < 6; i++) d += ` q 7.5 10 15 0`;
  o += path(d + ` L${W - 4} ${y + h - 2} L4 ${y + h - 2}Z`, C.blk, null);
  o += rect(4, y - 3, W - 8, 4, C.blk);
  return o;
}

export function month3() {
  const out = {};
  {
    const r = rng(31);
    let s = sakuraBranch(8, 34, 96, 26, 6, r, 5);
    s += curtain(66, 54);
    s += rect(8, 124, 88, 4, C.blk);
    s += hikari(24, 148, 8.5);
    s += sakura(78, 146, 9, r);
    out.Hikari = card(s);
  }
  {
    const r = rng(32);
    let s = sakuraBranch(10, 150, 94, 22, -14, r, 9);
    s += ribbon(50, 84, 24, 100, 3, C.red, '홍단');
    out.Tanzaku = card(s);
  }
  for (const [k, seed, a] of [['Kasu_1', 33, [8, 20, 94, 152, 14]], ['Kasu_2', 34, [96, 24, 10, 150, -12]]]) {
    const r = rng(seed);
    out[k] = card(sakuraBranch(a[0], a[1], a[2], a[3], a[4], r, 10));
  }
  return out;
}

// ---------- 흑싸리(등나무) ----------
function wisteria(rand, variant = 0) {
  let o = '';
  const xs = variant ? [24, 46, 70, 88] : [18, 40, 62, 84];
  xs.forEach((x, i) => {
    const top = 14 + (i % 2) * 14;
    o += vine(x, top, x + (i % 2 ? -6 : 6), 150 - (i % 3) * 8, i % 2 ? 6 : -6, 8, 14, 5.4, [C.blk], rand, C.blk, 1.1);
  });
  return o;
}
export function month4() {
  const out = {};
  {
    const r = rng(41);
    let s = wisteria(r, 0);
    s += bird(46, 52, 1.3, '#f2cf2a', '#f2cf2a', '#d9a60f', '#c98a0c', C.org);
    out.Tane = card(s);
  }
  {
    const r = rng(42);
    let s = wisteria(r, 1);
    s += ribbon(50, 80, 24, 100, 4, C.red, '');
    out.Tanzaku = card(s);
  }
  for (const [k, seed, v] of [['Kasu_1', 43, 0], ['Kasu_2', 44, 1]]) {
    const r = rng(seed);
    out[k] = card(wisteria(r, v) + path('M12 26 q 10 -10 18 0 q -6 10 -12 4', 'none', C.blk, 1.1));
  }
  return out;
}
