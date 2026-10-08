// 서버 함수가 같은 게임 엔진으로 판을 재생할 수 있도록 src/game 의 엔진 파일을 functions/game 으로 복사한다.
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'functions/game'), { recursive: true });
for (const f of ['engine.js', 'cards.js', 'scoring.js', 'rng.js', 'pvp.js']) {
  cpSync(join(root, 'src/game', f), join(root, 'functions/game', f));
}
console.log('functions/game 갱신 완료');
