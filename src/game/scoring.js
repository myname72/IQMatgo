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

export function calculateScore(cards) {
  const s = summarize(cards);
  let score = gwangScore(s.gwang);
  if (s.godori) score += 5;
  if (s.hongdan) score += 3;
  if (s.cheongdan) score += 3;
  if (s.chodan) score += 3;
  if (s.animals.length >= 5) score += s.animals.length - 4;
  if (s.ribbons.length >= 5) score += s.ribbons.length - 4;
  if (s.piCount >= 10) score += s.piCount - 9;
  return score;
}

// 고 횟수 보너스: 1고 +1, 2고 +2, 3고부터 2배씩
export function applyGo(score, goCount) {
  if (goCount <= 0) return score;
  let result = score + Math.min(goCount, 2);
  if (goCount >= 3) result *= 2 ** (goCount - 2);
  return result;
}

// 박 판정 (승자 기준)
export function detectBak(winnerCards, loserCards) {
  const w = summarize(winnerCards);
  const l = summarize(loserCards);
  const pibak = w.piCount >= 10 && l.piCount <= 5;
  const gwangbak = w.gwang.length >= 3 && l.gwang.length === 0;
  return { pibak, gwangbak };
}

export function finalPayout(winnerCards, loserCards, goCount) {
  const base = calculateScore(winnerCards);
  const withGo = applyGo(base, goCount);
  const { pibak, gwangbak } = detectBak(winnerCards, loserCards);
  const multiplier = (pibak ? 2 : 1) * (gwangbak ? 2 : 1);
  return { base, goCount, pibak, gwangbak, total: withGo * multiplier };
}
