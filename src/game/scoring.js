// 맞고 점수 계산 (실제 규칙)
// - 광: 3광 3점(비광 포함 시 2점), 4광 4점, 5광 15점
// - 열끗: 5장부터 1점, 이후 1장당 +1점 / 고도리(2·4·8월 열끗) 5점
// - 띠: 5장부터 1점, 이후 1장당 +1점 / 홍단·청단·초단 각 3점
// - 피: 10장부터 1점, 이후 1장당 +1점 (쌍피는 2장으로 계산)

export const WIN_THRESHOLD = 7;

export function summarize(cards) {
  const gwang = cards.filter((c) => c.kind === 'gwang');
  const animals = cards.filter((c) => c.kind === 'animal');
  const ribbons = cards.filter((c) => c.kind === 'ribbon');
  const piCount = cards.reduce((n, c) => n + c.piValue, 0);
  const ribbonCount = (type) => ribbons.filter((c) => c.ribbon === type).length;
  return {
    gwang,
    animals,
    ribbons,
    piCount,
    godori: animals.filter((c) => c.godori).length === 3,
    hongdan: ribbonCount('hong') === 3,
    cheongdan: ribbonCount('cheong') === 3,
    chodan: ribbonCount('cho') === 3,
  };
}

export function gwangScore(gwang) {
  const n = gwang.length;
  if (n === 5) return 15;
  if (n === 4) return 4;
  if (n === 3) return gwang.some((c) => c.month === 12) ? 2 : 3;
  return 0;
}

function gwangLabel(gwang) {
  const n = gwang.length;
  if (n === 5) return '오광';
  if (n === 4) return '사광';
  return gwang.some((c) => c.month === 12) ? '비삼광' : '삼광';
}

// 점수가 나는 항목들 (화면에 표시하고, 합계가 곧 점수)
export function scoreItems(cards) {
  const s = summarize(cards);
  const items = [];
  const g = gwangScore(s.gwang);
  // note: 결과 화면에서 "왜 이 점수인지" 설명하는 문구
  if (g > 0) items.push({ key: 'gwang', label: gwangLabel(s.gwang), points: g, note: `광 ${s.gwang.length}장 (비광이 끼면 삼광은 2점)` });
  if (s.godori) items.push({ key: 'godori', label: '고도리', points: 5, note: '매조·흑싸리새·공산기러기 3장 (새 3장)' });
  if (s.hongdan) items.push({ key: 'hongdan', label: '홍단', points: 3, note: '홍단 띠 3장 (송학·매조·벚꽃)' });
  if (s.cheongdan) items.push({ key: 'cheongdan', label: '청단', points: 3, note: '청단 띠 3장 (모란·국화·단풍)' });
  if (s.chodan) items.push({ key: 'chodan', label: '초단', points: 3, note: '초단 띠 3장 (흑싸리·난초·홍싸리 띠)' });
  if (s.animals.length >= 5) items.push({ key: 'animal', label: `열끗 ${s.animals.length}장`, points: s.animals.length - 4, note: '열끗 5장부터 1점, 이후 1장마다 +1점' });
  if (s.ribbons.length >= 5) items.push({ key: 'ribbon', label: `띠 ${s.ribbons.length}장`, points: s.ribbons.length - 4, note: '띠 5장부터 1점, 이후 1장마다 +1점' });
  if (s.piCount >= 10) items.push({ key: 'pi', label: `피 ${s.piCount}장`, points: s.piCount - 9, note: '피 10장부터 1점, 이후 1장마다 +1점 (쌍피 2장·쓰리피 3장으로 셈)' });
  return items;
}

export function calculateScore(cards) {
  return scoreItems(cards).reduce((sum, item) => sum + item.points, 0);
}

// 고 보너스: 고를 한 번 부를 때마다 +1점, 3고부터는 고마다 점수가 2배씩
// 예) 4고 = (점수 + 4) × 4배, 5고 = (점수 + 5) × 8배
export const goMultiplierOf = (goCount) => (goCount >= 3 ? 2 ** (goCount - 2) : 1);

export function applyGo(score, goCount) {
  if (goCount <= 0) return score;
  return (score + goCount) * goMultiplierOf(goCount);
}

// 맞고 정석 기준값
export const PIBAK_PI = 7; // 패자 피가 이 장수 이하이면 피박 (3인 고스톱은 5장, 1:1 맞고는 7장)
export const MUNGTTA_ANIMALS = 7; // 승자 열끗이 이 장수 이상이면 멍따(멍박)

// 박 판정 (승자 기준). loserGo 는 진 쪽이 부른 고 횟수 (고박 판정용)
export function detectBak(winnerCards, loserCards, loserGo = 0) {
  const w = summarize(winnerCards);
  const l = summarize(loserCards);
  return {
    pibak: w.piCount >= 10 && l.piCount <= PIBAK_PI, // 피로 점수를 낸 승자 + 피 적은 패자
    gwangbak: w.gwang.length >= 3 && l.gwang.length === 0, // 광으로 점수를 낸 승자 + 광 0장 패자
    mungtta: w.animals.length >= MUNGTTA_ANIMALS, // 멍따(멍박)
    gobak: loserGo > 0, // 고를 부른 쪽이 역전당해 짐
  };
}

export function finalPayout(winnerCards, loserCards, goCount, bonus = 0, loserGo = 0) {
  const items = scoreItems(winnerCards);
  if (bonus) items.push({ key: 'bonus', label: '판쓸 보너스', points: bonus });
  const base = calculateScore(winnerCards) + bonus;
  const withGo = applyGo(base, goCount);
  const goBonus = Math.max(goCount, 0); // 고 1번마다 +1점
  const goMultiplier = goMultiplierOf(goCount); // 3고 ×2, 4고 ×4, 5고 ×8 …
  const bak = detectBak(winnerCards, loserCards, loserGo);
  const w = summarize(winnerCards);
  const l = summarize(loserCards);
  // 박은 모두 2배이고 겹치면 곱해진다 (피박×광박 = 4배)
  const multipliers = [];
  if (bak.pibak) multipliers.push({ key: 'pibak', label: '피박', x: 2, note: `상대 피 ${l.piCount}장 (${PIBAK_PI}장 이하)` });
  if (bak.gwangbak) multipliers.push({ key: 'gwangbak', label: '광박', x: 2, note: '상대가 광을 한 장도 못 먹음' });
  if (bak.mungtta) multipliers.push({ key: 'mungtta', label: '멍따', x: 2, note: `열끗 ${w.animals.length}장 (${MUNGTTA_ANIMALS}장 이상)` });
  if (bak.gobak) multipliers.push({ key: 'gobak', label: '고박', x: 2, note: `상대가 ${loserGo}고를 부르고 짐` });
  const multiplier = multipliers.reduce((m, x) => m * x.x, 1);
  return {
    items,
    base,
    goCount,
    withGo,
    goBonus,
    goMultiplier,
    ...bak,
    multipliers,
    multiplier,
    loserPi: l.piCount,
    loserGwang: l.gwang.length,
    loserGo,
    total: withGo * multiplier,
  };
}
