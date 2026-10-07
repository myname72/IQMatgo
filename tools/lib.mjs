// 화투 카드 그림을 만들기 위한 공통 도형 모음 (직접 그린 벡터 도안)
export const W = 103.2;
export const H = 168.2;
export const C = {
  red: '#e1131c', blk: '#141414', wht: '#ffffff', yel: '#f6c613', blu: '#2b72c8',
  grn: '#1f8a3c', pnk: '#f4a3b5', org: '#e98a2b', brn: '#6e4220', gry: '#9aa0a8', sky: '#8fc6ee',
};

// 시드 난수 (카드마다 같은 그림이 나오게)
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => Math.round(n * 100) / 100;
export const g = (attrs, ...kids) => `<g ${attrs}>${kids.join('')}</g>`;
export const tr = (x, y, rot = 0, s = 1) => `transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${s})"`;

// 카드 틀: 붉은 테두리 + 흰 바탕
export function card(inner, id = 'c') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs><clipPath id="${id}"><rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="5"/></clipPath></defs>
<rect width="${W}" height="${H}" rx="9" fill="${C.red}"/>
<rect x="5" y="5" width="${W - 10}" height="${H - 10}" rx="5.5" fill="${C.wht}"/>
<g clip-path="url(#${id})">${inner}</g>
</svg>`;
}

export const ell = (cx, cy, rx, ry, fill, rot = 0, stroke = C.blk, sw = 0.9) =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="${sw}"` : ''} ${rot ? `transform="rotate(${f(rot)} ${f(cx)} ${f(cy)})"` : ''}/>`;
export const circ = (cx, cy, r, fill, stroke = C.blk, sw = 0.9) =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="${sw}"` : ''}/>`;
export const path = (d, fill = 'none', stroke = C.blk, sw = 1, extra = '') =>
  `<path d="${d}" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"` : ''} ${extra}/>`;
export const rect = (x, y, w, h, fill, rx = 0, stroke = null, sw = 1) =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${rx}" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="${sw}"` : ''}/>`;

// 잎 한 장
export function leaf(x, y, len, wid, rot, fill = C.blk, stroke = null) {
  const d = `M0 ${f(-len / 2)} C ${f(wid)} ${f(-len / 4)} ${f(wid)} ${f(len / 4)} 0 ${f(len / 2)} C ${f(-wid)} ${f(len / 4)} ${f(-wid)} ${f(-len / 4)} 0 ${f(-len / 2)}Z`;
  return `<path d="${d}" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="0.6"` : ''} transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})"/>`;
}

// 다섯 꽃잎 꽃
export function blossom(x, y, r, petal, center = C.yel, stroke = C.blk) {
  let s = '';
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 - 90) * Math.PI / 180;
    s += circ(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.52, petal, stroke, 0.6);
  }
  s += circ(x, y, r * 0.3, center, null);
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 - 54) * Math.PI / 180;
    s += circ(x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2, r * 0.07, C.blk, null);
  }
  return s;
}

// 구불구불한 줄기를 따라 잎을 달기 (등나무, 싸리 등)
export function vine(x0, y0, x1, y1, bend, n, leafLen, leafWid, fills, rand, stemColor = C.blk, sw = 1.1) {
  const mx = (x0 + x1) / 2 + bend;
  const my = (y0 + y1) / 2;
  const pt = (t) => {
    const u = 1 - t;
    return [u * u * x0 + 2 * u * t * mx + t * t * x1, u * u * y0 + 2 * u * t * my + t * t * y1];
  };
  let s = path(`M${f(x0)} ${f(y0)} Q ${f(mx)} ${f(my)} ${f(x1)} ${f(y1)}`, 'none', stemColor, sw);
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const [px, py] = pt(t);
    const side = i % 2 ? 1 : -1;
    const fill = fills[Math.floor(rand() * fills.length)];
    s += leaf(px + side * leafLen * 0.45, py, leafLen * (0.85 + rand() * 0.3), leafWid, side * (55 + rand() * 25), fill);
  }
  const [tx, ty] = pt(1);
  s += leaf(tx, ty - leafLen * 0.3, leafLen, leafWid, 0, fills[0]);
  return s;
}

// 가장자리가 들쭉날쭉한 덩어리 (소나무 잎, 산 등)
export function jagged(cx, cy, rx, ry, spikes, rand, fill = C.blk, depth = 0.18) {
  let d = '';
  const n = spikes * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = i % 2 ? 1 - depth * (0.6 + rand() * 0.8) : 1;
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    d += `${i ? 'L' : 'M'}${f(x)} ${f(y)} `;
  }
  return `<path d="${d}Z" fill="${fill}"/>`;
}

// 띠: 세로로 긴 리본. text는 위에서 아래로 한 글자씩 쓴다.
export function ribbon(x, y, w, h, rot, color, text = '', textColor = C.wht) {
  const hw = w / 2, hh = h / 2;
  let s = `<path d="M${-hw} ${-hh} L${hw} ${-hh + 2} L${hw} ${hh} L${-hw} ${hh - 2} Z" fill="${color}" stroke="${C.blk}" stroke-width="0.8"/>`;
  if (text) {
    [...text].forEach((ch, i) => {
      s += `<text x="0" y="${f(-hh + 16 + i * 14)}" font-size="${f(Math.min(w * 0.75, 12))}" font-weight="900" fill="${textColor}" text-anchor="middle" font-family="'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo','Nanum Gothic',sans-serif">${ch}</text>`;
    });
  }
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})">${s}</g>`;
}

// 光 표시
export function hikari(x, y, r = 8.5) {
  return circ(x, y, r, C.red, C.wht, 1.2) + `<text x="${f(x)}" y="${f(y + r * 0.38)}" font-size="${f(r * 1.25)}" font-weight="900" fill="${C.wht}" text-anchor="middle" font-family="'Noto Serif KR','Noto Serif CJK KR','Noto Serif SC','Nanum Myeongjo',serif">光</text>`;
}

// 새 (옆모습, 왼쪽을 본다)
export function bird(x, y, s, body, head, wing, tail = body, beak = C.org) {
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${s})">
${path('M12 4 L30 13 L26 15 L11 9Z', tail, C.blk, 0.8)}
${ell(0, 0, 14, 8.5, body, -8)}
${path('M-8 -9 L-18 -6 L-8 -4Z', beak, C.blk, 0.6)}
${circ(-9, -5, 6, head)}
${circ(-11, -6.2, 1.2, C.blk, null)}
${path('M-2 -3 Q8 -9 16 2 Q6 6 -2 4Z', wing, C.blk, 0.8)}
</g>`;
}
