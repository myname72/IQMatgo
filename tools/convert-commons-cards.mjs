// Wikimedia Commons "Hwatu ..." SVG(작가 Spenĉjo, CC BY-SA 4.0)를 게임용 WebP로 변환한다.
// 변경 사항(표기 의무): 크기를 가로 256px로 래스터화했고, 노랑(#faea01), 하늘색(#1ca4da), 주황(#f79e33)을 아래 색으로 바꿨다.
// 사용: node tools/convert-commons-cards.mjs <원본 SVG 폴더>   (sharp 필요: npm i --no-save sharp)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const srcDir = process.argv[2];
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/assets/cards');
const W = 256;
const H = Math.round((W * 168.2) / 103.2);
const RECOLOR = { '#faea01': '#eec01a', '#1ca4da': '#0a63a8', '#f79e33': '#f0b323' };

fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (/\.(webp|svg)$/.test(f)) fs.rmSync(path.join(outDir, f));

let n = 0;
for (const file of fs.readdirSync(srcDir).filter((f) => /^Hwatu_.*\.svg$/.test(f)).sort()) {
  let svg = fs.readFileSync(path.join(srcDir, file), 'utf8');
  if (!/^<(svg|\?xml)/.test(svg)) throw new Error(`${file}: SVG가 아닙니다 (다운로드 실패?)`);
  for (const [from, to] of Object.entries(RECOLOR)) svg = svg.replace(new RegExp(from, 'gi'), to);
  const name = file.replace(/^Hwatu_/, '').replace(/\.svg$/, '');
  await sharp(Buffer.from(svg), { density: (96 * W) / 103.2 })
    .resize(W, H, { fit: 'fill' })
    .webp({ quality: 88, alphaQuality: 92 })
    .toFile(path.join(outDir, `${name}.webp`));
  n++;
}
console.log(`${n}장을 ${outDir} 에 썼습니다.`);
