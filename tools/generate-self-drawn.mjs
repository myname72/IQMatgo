// (현재 사용하지 않음) 직접 그린 화투 카드 그림(SVG)을 tools/self-drawn/ 에 쓴다.
// 사용: node tools/generate-self-drawn.mjs
// 모든 그림은 전통 화투의 소재(소나무와 학, 매화와 새 등)를 바탕으로 직접 그린 것이다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build-lib.mjs';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './self-drawn');
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (f.endsWith('.webp') || f.endsWith('.svg')) fs.rmSync(path.join(outDir, f));
const cards = buildAll();
for (const [name, svg] of Object.entries(cards)) fs.writeFileSync(path.join(outDir, `${name}.svg`), svg);
console.log(`${Object.keys(cards).length}개 카드를 ${outDir} 에 썼습니다.`);
