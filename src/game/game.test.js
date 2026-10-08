import { describe, it, expect } from 'vitest';
import { seededRng } from './rng.js';
import { HWATU_CARDS, ITEM_CARDS } from './cards.js';
import { calculateScore, scoreItems, applyGo, finalPayout } from './scoring.js';
import { canFlip, peekSubset, PEEK_VIEW_MS, START_OPEN, MEMORY_LIMIT, REVEAL_TURNS, AUTO_STOP_REMAINING, MAX_TRIES, createGame, flipCard, resolveFlip, declareGo, declareStop, aiChooseFlip, scoreOf } from './engine.js';

const byName = (...names) => names.map((n) => HWATU_CARDS.find((c) => c.name === n));
const fill = (kind, n) => HWATU_CARDS.filter((c) => c.kind === kind).slice(0, n);

// 시작할 때 깔리는 카드를 치우고 시작하는 테스트용 판
const cleanGame = (d) => {
  const g = createGame(d);
  // 시작 때 깔린 카드(와 선이 먹은 아이템)를 치우고 판을 원래대로 되돌린다
  return { ...g, deck: g.deck.map((x) => ({ ...x, taken: false })), captured: { player: [], ai: [] }, revealed: [], revealLeft: {}, memory: [] };
};

describe('카드 구성', () => {
  it('48장, 월별 4장, 종류별 개수가 실제 화투와 같다', () => {
    expect(HWATU_CARDS).toHaveLength(48);
    for (let m = 1; m <= 12; m++) expect(HWATU_CARDS.filter((c) => c.month === m)).toHaveLength(4);
    const count = (k) => HWATU_CARDS.filter((c) => c.kind === k).length;
    expect([count('gwang'), count('animal'), count('ribbon'), count('pi'), count('ssangpi')]).toEqual([5, 9, 10, 22, 2]);
    expect(HWATU_CARDS.filter((c) => c.ribbon === 'hong').map((c) => c.month)).toEqual([1, 2, 3]);
    expect(HWATU_CARDS.filter((c) => c.ribbon === 'cheong').map((c) => c.month)).toEqual([6, 9, 10]);
    expect(HWATU_CARDS.filter((c) => c.ribbon === 'cho').map((c) => c.month)).toEqual([4, 5, 7]);
    expect(HWATU_CARDS.filter((c) => c.godori).map((c) => c.month)).toEqual([2, 4, 8]);
  });
});

describe('점수 계산', () => {
  it('광', () => {
    expect(calculateScore(byName('송학광', '벚꽃광', '공산광'))).toBe(3);
    expect(calculateScore(byName('송학광', '벚꽃광', '비광'))).toBe(2);
    expect(calculateScore(byName('송학광', '벚꽃광', '공산광', '비광'))).toBe(4);
    expect(calculateScore(fill('gwang', 5))).toBe(15);
  });
  it('고도리와 단', () => {
    expect(calculateScore(byName('매조', '흑싸리새', '공산기러기'))).toBe(5);
    expect(calculateScore(byName('송학띠', '매조띠', '벚꽃띠'))).toBe(3);
    expect(calculateScore(byName('모란띠', '국화띠', '단풍띠'))).toBe(3);
    expect(calculateScore(byName('흑싸리띠', '난초띠', '홍싸리띠'))).toBe(3);
  });
  it('띠·열끗·피 개수 점수', () => {
    // 단이 완성되지 않는 띠 5장
    expect(calculateScore(byName('송학띠', '매조띠', '흑싸리띠', '난초띠', '모란띠'))).toBe(1);
    expect(calculateScore(byName('매조', '난초열끗', '모란나비', '홍싸리멧돼지', '국화술잔', '단풍사슴'))).toBe(2);
    expect(calculateScore(fill('pi', 10))).toBe(1);
    // 쌍피는 피 2장
    expect(calculateScore([...fill('pi', 8), ...fill('ssangpi', 1)])).toBe(1);
  });
  it('고/박 배수', () => {
    // 고 1번마다 +1점, 3고부터 고마다 2배씩: (점수 + 고 횟수) × 배수
    expect(applyGo(7, 0)).toBe(7);
    expect(applyGo(7, 1)).toBe(8); // 7+1
    expect(applyGo(7, 2)).toBe(9); // 7+2
    expect(applyGo(7, 3)).toBe(20); // (7+3)×2
    expect(applyGo(7, 4)).toBe(44); // (7+4)×4
    expect(applyGo(7, 5)).toBe(96); // (7+5)×8
    expect(applyGo(21, 4)).toBe(100); // 실제 판 예시
    const winner = [...fill('gwang', 3), ...fill('pi', 10)];
    const p = finalPayout(winner, [], 0);
    expect(p.pibak && p.gwangbak).toBe(true);
    expect(p.total).toBe(p.base * 4);
  });

  it('피박: 맞고 기준으로 상대 피 7장 이하일 때만', () => {
    const winner = [...fill('pi', 10), ...byName('송학광')]; // 피로 점수를 냈고 광은 1장(광박 아님)
    expect(finalPayout(winner, fill('pi', 7), 0).pibak).toBe(true);
    expect(finalPayout(winner, fill('pi', 8), 0).pibak).toBe(false);
    // 승자가 피로 점수를 못 내면(피 9장 이하) 피박이 아니다
    expect(finalPayout([...fill('pi', 9), ...byName('송학광')], fill('pi', 3), 0).pibak).toBe(false);
  });

  it('멍따: 열끗 7장 이상이면 2배', () => {
    const animals = HWATU_CARDS.filter((c) => c.kind === 'animal');
    const six = finalPayout(animals.slice(0, 6), [], 0);
    expect(six.mungtta).toBe(false);
    expect(six.total).toBe(six.base);
    const seven = finalPayout(animals.slice(0, 7), [], 0);
    expect(seven.mungtta).toBe(true);
    expect(seven.total).toBe(seven.base * 2);
  });

  it('고박: 고를 부른 쪽이 지면 이긴 쪽 점수가 2배', () => {
    const winner = [...byName('송학광', '벚꽃광'), ...fill('ribbon', 5)];
    const plain = finalPayout(winner, [], 0, 0, 0);
    const gobak = finalPayout(winner, [], 0, 0, 2); // 상대가 2고를 부르고 졌다
    expect(plain.gobak).toBe(false);
    expect(gobak.gobak).toBe(true);
    expect(gobak.total).toBe(plain.total * 2);
  });

  it('박이 겹치면 배수가 곱해지고 계산 과정이 함께 나온다', () => {
    const winner = [...fill('gwang', 3), ...fill('pi', 10)]; // 피박 + 광박
    const p = finalPayout(winner, [], 2, 0, 1); // 2고 + 고박
    expect(p.multipliers.map((m) => m.key)).toEqual(['pibak', 'gwangbak', 'gobak']);
    expect(p.multiplier).toBe(8);
    expect(p.goBonus).toBe(2);
    expect(p.total).toBe((p.base + 2) * 8);
    // 3고 이상이면 고 점수도 고 횟수만큼 붙고 배수가 곱해진다
    const q = finalPayout(winner, [], 4);
    expect(q.goBonus).toBe(4);
    expect(q.goMultiplier).toBe(4);
    expect(q.total).toBe((q.base + 4) * 4 * 4); // 피박·광박 4배까지
  });
});

describe('게임 진행', () => {
  const rigged = () => {
    const g = cleanGame('normal');
    // 앞 4장을 1월 4장으로 고정
    const ones = HWATU_CARDS.filter((c) => c.month === 1);
    // 아이템 패는 빼서 칸 번호로 일반 카드만 고를 수 있게 한다
    const rest = g.deck.filter((s) => s.card.month !== 1 && s.card.kind !== 'item');
    g.deck = [...ones.map((card) => ({ card, taken: false })), ...rest];
    return g;
  };

  it('같은 카드를 두 번 클릭해도 짝으로 처리되지 않는다', () => {
    let g = rigged();
    g = flipCard(g, 0);
    g = flipCard(g, 0);
    expect(g.flipped).toEqual([0]);
  });
  it('짝을 맞추면 가져가고 턴을 유지, 틀리면 턴이 넘어간다', () => {
    let g = rigged();
    g = resolveFlip(flipCard(flipCard(g, 0), 1));
    expect(g.captured.player).toHaveLength(2);
    expect(g.turn).toBe('player');
    const other = g.deck.findIndex((s) => !s.taken && s.card.month !== 1);
    g = resolveFlip(flipCard(flipCard(g, 2), other));
    expect(g.turn).toBe('ai');
    expect(g.captured.player).toHaveLength(2);
  });
  it('플레이어가 뒤집은 카드도 AI가 기억한다', () => {
    let g = rigged();
    g = flipCard(g, 0);
    expect(g.memory).toContain(0);
  });
  it('AI는 기억 속 짝을 우선 선택한다', () => {
    let g = rigged();
    g = resolveFlip(flipCard(flipCard(g, 5), 0)); // 월 불일치 → AI턴 (5는 1월이 아님)
    g = { ...g, turn: 'ai', flipped: [], memory: [0, 1] };
    expect([0, 1]).toContain(aiChooseFlip(g));
    g = { ...g, flipped: [0] };
    expect(aiChooseFlip(g)).toBe(1);
  });
  it('7점이 되면 고/스톱, 고 이후에는 점수가 더 올라야 한다', () => {
    let g = cleanGame('normal');
    g.captured.player = byName('송학광', '벚꽃광', '공산광', '오동광', '매조', '흑싸리새', '공산기러기');
    expect(scoreOf(g, 'player')).toBe(4 + 5);
    g = { ...g, phase: 'gostop' };
    g = declareGo(g);
    expect(g.phase).toBe('playing');
    expect(g.goCount.player).toBe(1);
    expect(g.lastGoScore.player).toBe(9);
    expect(g.turn).toBe('ai'); // 고를 부르면 상대 차례
    expect(g.tries).toBe(0);
    g = { ...g, turn: 'player' }; // 이어지는 검증을 위해 되돌린다
    g.captured.ai = byName('비광'); // 광박 방지
    const stop = declareStop({ ...g, phase: 'gostop' });
    expect(stop.phase).toBe('over');
    expect(stop.result.winner).toBe('player');
    expect(stop.result.total).toBe(10); // 9점 + 1고
  });
  it('모든 카드를 가져갔는데 7점 미만이면 나가리', () => {
    let g = cleanGame('normal');
    g.deck = g.deck.map((s, i) => (i < 2 ? s : { ...s, taken: true }));
    // 같은 월 2장으로 맞춰놓고 마지막 짝을 맞춘 상황 재현
    g.deck[0] = { card: HWATU_CARDS[2], taken: false };
    g.deck[1] = { card: HWATU_CARDS[3], taken: false };
    g = flipCard(flipCard(g, 0), 1);
    g = resolveFlip(g);
    expect(g.phase).toBe('over');
    expect(g.result.winner).toBeNull();
  });
  it('연속으로 맞춰도 카드 4장(2번 시도)을 열면 턴이 넘어간다', () => {
    let g = cleanGame('normal');
    const pairs = [];
    for (let m = 1; m <= 6; m++) {
      const idx = g.deck.map((s, i) => (s.card.month === m ? i : -1)).filter((i) => i >= 0);
      pairs.push([idx[0], idx[1]]);
    }
    for (let t = 0; t < MAX_TRIES; t++) {
      expect(g.turn).toBe('player');
      const [a, b] = pairs[t];
      g = resolveFlip(flipCard(flipCard(g, a), b));
      if (g.phase === 'gostop') g = declareGo(g);
    }
    expect(g.turn).toBe('ai');
    expect(g.tries).toBe(0);
  });
  it('시작할 때 일반 카드 4장이 앞면으로 깔리고 양쪽이 한 턴씩 볼 수 있다', () => {
    for (const d of ['easy', 'normal', 'hard']) {
      let g = createGame(d);
      const dealtItems = g.deck.filter((x) => x.taken);
      expect(g.revealed).toHaveLength(START_OPEN); // 아이템을 먹어도 일반 카드 4장은 항상 깔린다
      expect(g.revealed.every((k) => g.deck[k].card.kind !== 'item')).toBe(true);
      expect(dealtItems.every((x) => x.taken)).toBe(true);
      expect(g.captured.player).toHaveLength(dealtItems.length);
      const open = [...g.revealed];
      const a = g.deck.findIndex((s, k) => !open.includes(k) && s.card.kind !== 'item');
      const b = g.deck.findIndex((s, k) => !open.includes(k) && k !== a && s.card.kind !== 'item' && s.card.month !== g.deck[a].card.month);
      g = resolveFlip(flipCard(flipCard(g, a), b)); // 내 턴이 끝남
      expect(open.every((k) => g.revealed.includes(k) || g.deck[k].taken)).toBe(true);
    }
  });
  it('쉬움: 틀린 카드는 5턴 동안 앞면으로 유지되고 6번째 턴 시작 전에 뒷면으로 돌아간다', () => {
    let g = cleanGame('easy');
    expect(REVEAL_TURNS.easy).toBe(5);
    const firsts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => g.deck.findIndex((s) => s.card.month === m));
    const miss = (a, b) => { g = resolveFlip(flipCard(flipCard(g, a), b)); };
    miss(firsts[0], firsts[1]); // 턴1 종료: 두 장이 5턴짜리로 열림
    expect(g.revealed.sort()).toEqual([firsts[0], firsts[1]].sort());
    expect(g.revealLeft[firsts[0]]).toBe(5);
    miss(firsts[2], firsts[3]); // 턴2 종료
    miss(firsts[4], firsts[5]); // 턴3 종료
    miss(firsts[6], firsts[7]); // 턴4 종료
    expect(g.revealLeft[firsts[0]]).toBe(2);
    miss(firsts[8], firsts[9]); // 턴5 종료: 아직 1턴 남음
    expect(g.revealLeft[firsts[0]]).toBe(1);
    expect(g.revealed).toContain(firsts[0]);
    expect(g.lastHidden).toEqual([]);
    miss(firsts[10], firsts[11]); // 턴6 종료: 처음 두 장이 뒷면으로
    expect(g.revealed).not.toContain(firsts[0]);
    expect(g.revealed).not.toContain(firsts[1]);
    expect(g.lastHidden.sort()).toEqual([firsts[0], firsts[1]].sort());
  });
  it('쉬움: 앞면 카드는 틀림에 휘말리지 않고, 새로 틀린 두 장만 5턴으로 열린다', () => {
    let g = cleanGame('easy');
    const f = [1, 2, 3, 4].map((m) => g.deck.findIndex((s) => s.card.month === m));
    g = resolveFlip(flipCard(flipCard(g, f[0]), f[1]));
    g = resolveFlip(flipCard(flipCard(g, f[2]), f[3]));
    expect(g.revealLeft[f[0]]).toBe(4);
    // 앞면 카드는 짝일 때만 고를 수 있으므로, 틀리는 수는 뒷면 두 장뿐이다
    const back = g.deck
      .map((x, i) => (!x.taken && !g.revealed.includes(i) && x.card.kind !== 'item' ? i : -1))
      .filter((i) => i >= 0);
    const a = back[0];
    const b = back.find((i) => g.deck[i].card.month !== g.deck[a].card.month);
    g = resolveFlip(flipCard(flipCard(g, a), b));
    expect(g.revealLeft[a]).toBe(5);
    expect(g.revealLeft[b]).toBe(5);
    expect(g.revealLeft[f[0]]).toBe(3); // 먼저 열려 있던 카드는 한 턴 더 줄어든다
    expect(g.revealLeft[f[2]]).toBe(4);
  });

  it('앞면 카드는 짝을 맞출 때만 고를 수 있다 (새 카드를 안 보여 주는 꼼수 방지)', () => {
    const base = cleanGame('easy');
    const at = (m, n = 0) => base.deck.map((s, k) => (s.card.month === m ? k : -1)).filter((k) => k >= 0)[n];
    const a1 = at(1);
    const b1 = at(2);
    const back = base.deck.findIndex((x, i) => !x.taken && i !== a1 && i !== b1 && x.card.kind !== 'item' && x.card.month !== 1 && x.card.month !== 2);

    // 1월 한 장, 2월 한 장만 앞면 — 앞면끼리 짝이 없으니 첫 장으로 고를 수 없다
    const lone = { ...base, revealed: [a1, b1], revealLeft: { [a1]: 3, [b1]: 3 } };
    expect(canFlip(lone, a1)).toBe(false);
    expect(canFlip(lone, back)).toBe(true);

    // 뒷면을 먼저 고른 뒤에는, 짝이 아닌 앞면 카드를 고를 수 없다 (꼼수)
    const one = flipCard(lone, back);
    expect(one.flipped).toEqual([back]);
    expect(canFlip(one, a1)).toBe(false);
    expect(canFlip(one, b1)).toBe(false);
    expect(flipCard(one, a1)).toBe(one); // 상태 그대로 = 선택되지 않음
    // 다른 뒷면 카드는 고를 수 있다
    const other = base.deck.findIndex((x, i) => !x.taken && i !== back && i !== a1 && i !== b1 && x.card.kind !== 'item');
    expect(canFlip(one, other)).toBe(true);

    // 같은 월의 앞면 카드는 고를 수 있다 (짝 맞추기)
    const m = base.deck[back].card.month;
    const sameMonth = base.deck.findIndex((x, i) => i !== back && !x.taken && x.card.month === m);
    const matchable = { ...base, revealed: [sameMonth], revealLeft: { [sameMonth]: 3 } };
    const picked = flipCard(matchable, back);
    expect(canFlip(picked, sameMonth)).toBe(true);
    expect(resolveFlip(flipCard(picked, sameMonth)).captured.player).toHaveLength(2);
  });

  it('앞면 짝이 둘 다 보이면 첫 장으로 골라 바로 먹을 수 있다', () => {
    const base = cleanGame('easy');
    const pair = base.deck.map((s, k) => (s.card.month === 1 ? k : -1)).filter((k) => k >= 0).slice(0, 2);
    const g = { ...base, revealed: pair, revealLeft: { [pair[0]]: 3, [pair[1]]: 3 } };
    expect(canFlip(g, pair[0])).toBe(true);
    const one = flipCard(g, pair[0]);
    expect(canFlip(one, pair[1])).toBe(true);
    // 앞면을 먼저 골랐으면 그 짝만 고를 수 있다 (뒷면 카드로 도망갈 수 없다)
    const back = base.deck.findIndex((x, i) => !x.taken && !pair.includes(i) && x.card.kind !== 'item');
    expect(canFlip(one, back)).toBe(false);
    expect(resolveFlip(flipCard(one, pair[1])).captured.player).toHaveLength(2);
  });

  it('AI도 짝이 아닌 앞면 카드 두 장을 고르지 않는다', () => {
    let g = cleanGame('easy');
    const at = (m) => g.deck.map((s, k) => (s.card.month === m ? k : -1)).filter((k) => k >= 0)[0];
    const a = at(1);
    const b = at(2);
    g = { ...g, turn: 'ai', revealed: [a, b], revealLeft: { [a]: 3, [b]: 3 }, flipped: [a] };
    for (let n = 0; n < 60; n++) {
      const pickIdx = aiChooseFlip(g, Math.random);
      expect(pickIdx).not.toBe(b);
      expect(canFlip(g, pickIdx)).toBe(true);
    }
  });
  it('쉬움: 앞면 카드 2장을 골라 짝을 맞출 수 있고 유지 목록에서 빠진다', () => {
    let g = cleanGame('easy');
    const month = (m) => g.deck.map((s, i) => (s.card.month === m ? i : -1)).filter((i) => i >= 0);
    const [a1, a2] = month(1);
    const b1 = month(2)[0];
    const c1 = month(3)[0];
    g = resolveFlip(flipCard(flipCard(g, a1), b1)); // 틀림: a1,b1 공개
    g = resolveFlip(flipCard(flipCard({ ...g, turn: 'player' }, a2), c1)); // 틀림: a2,c1 공개
    g = { ...g, turn: 'player', tries: 0 };
    g = resolveFlip(flipCard(flipCard(g, a1), a2)); // 공개된 두 장으로 짝 성공
    expect(g.captured.player).toHaveLength(2);
    expect(g.revealed).not.toContain(a1);
    expect(g.revealed).not.toContain(a2);
  });
  it('보통/어려움은 틀린 카드를 유지하지 않는다', () => {
    let g = cleanGame('normal');
    const i = g.deck.findIndex((s) => s.card.month === 1);
    const j = g.deck.findIndex((s) => s.card.month === 2);
    g = resolveFlip(flipCard(flipCard(g, i), j));
    expect(g.revealed).toEqual([]);
  });
  it('AI는 기억에 없어도 앞면으로 보이는 카드의 짝을 찾는다', () => {
    let g = cleanGame('easy');
    const month1 = g.deck.map((s, i) => (s.card.month === 1 ? i : -1)).filter((i) => i >= 0);
    g = { ...g, turn: 'ai', flipped: [], memory: [], revealed: [month1[0], month1[1]] };
    expect(month1.slice(0, 2)).toContain(aiChooseFlip(g));
    g = { ...g, flipped: [month1[0]] };
    expect(aiChooseFlip(g)).toBe(month1[1]);
  });
  it('보통: 틀린 두 장이 방금 뒷면으로 돌아간 카드로 표시된다', () => {
    let g = cleanGame('normal');
    const i = g.deck.findIndex((s) => s.card.month === 1);
    const j = g.deck.findIndex((s) => s.card.month === 2);
    g = resolveFlip(flipCard(flipCard(g, i), j));
    expect(g.lastHidden.sort()).toEqual([i, j].sort());
  });
  it('득점 항목 내역이 합계와 일치한다', () => {
    const cards = [...byName('송학광', '벚꽃광', '비광'), ...byName('매조', '흑싸리새', '공산기러기'), ...byName('송학띠', '매조띠', '벚꽃띠')];
    const items = scoreItems(cards);
    expect(items.map((i) => i.label)).toEqual(['비삼광', '고도리', '홍단']);
    expect(items.reduce((a, i) => a + i.points, 0)).toBe(calculateScore(cards));
    expect(calculateScore(cards)).toBe(2 + 5 + 3);
  });
  it('남은 카드가 4장 이하이면 고/스톱을 묻지 않고 자동 스톱한다', () => {
    let g = cleanGame('normal');
    // 광이 없는 월(4~6월)만 판에 남겨서, 미리 먹어 둔 광 5장(15점)과 겹치지 않게 한다
    const keep = [4, 5, 6].flatMap((m) => g.deck.map((s, i) => (s.card.month === m ? i : -1)).filter((i) => i >= 0).slice(0, 2));
    g.deck = g.deck.map((s, i) => (keep.includes(i) ? s : { ...s, taken: true }));
    g.captured.player = fill('gwang', 5); // 15점
    g.captured.ai = [];
    g.tries = 1; // 두 번째(마지막) 시도
    const [a, b] = keep.slice(0, 2); // 4월 두 장
    g = resolveFlip(flipCard(flipCard(g, a), b));
    expect(g.deck.filter((s) => !s.taken)).toHaveLength(AUTO_STOP_REMAINING);
    expect(g.phase).toBe('over');
    expect(g.result.winner).toBe('player');
    expect(g.result.how).toBe('auto');
  });
  it('남은 카드가 5장 이상이면 고/스톱을 묻는다', () => {
    let g = cleanGame('normal');
    const keep = [4, 5, 6, 7].flatMap((m) => g.deck.map((s, i) => (s.card.month === m ? i : -1)).filter((i) => i >= 0).slice(0, 2));
    g.deck = g.deck.map((s, i) => (keep.includes(i) ? s : { ...s, taken: true }));
    g.captured.player = fill('gwang', 5);
    g.tries = 1;
    const [a, b] = keep.slice(0, 2);
    g = resolveFlip(flipCard(flipCard(g, a), b));
    expect(g.deck.filter((s) => !s.taken)).toHaveLength(6);
    expect(g.phase).toBe('gostop');
  });
});

describe('아이템 패', () => {
  const idxOfItem = (g, item) => g.deck.findIndex((s) => s.card.item === item);
  const idxOfMonth = (g, m, n = 0) => g.deck.map((s, i) => (s.card.month === m ? i : -1)).filter((i) => i >= 0)[n];

  it('덱은 일반 48장 + 아이템 6장이다', () => {
    const g = cleanGame('normal');
    expect(g.deck).toHaveLength(54);
    expect(ITEM_CARDS.map((c) => c.item).sort()).toEqual(['peek', 'reset', 'shuffle', 'ssangpi', 'ssangpi', 'tripi']);
  });

  it('쌍피: 먹은 패에 피 2장으로 들어가고 시도 횟수·차례는 그대로다', () => {
    let g = cleanGame('normal');
    const a = idxOfMonth(g, 1);
    g = flipCard(g, a); // 먼저 일반 카드 한 장 선택
    const i = idxOfItem(g, 'ssangpi');
    g = flipCard(g, i);
    expect(g.deck[i].taken).toBe(true);
    expect(g.captured.player.map((c) => c.piValue)).toEqual([2]);
    expect(g.tries).toBe(0);
    expect(g.turn).toBe('player');
    expect(g.flipped).toEqual([a]); // 선택해 둔 카드는 그대로
    expect(g.itemEvent).toMatchObject({ who: 'player', item: 'ssangpi', index: i });
    expect(calculateScore(g.captured.player)).toBe(0);
  });

  it('쓰리피는 피 3장으로 계산된다', () => {
    let g = cleanGame('normal');
    g = flipCard(g, idxOfItem(g, 'tripi'));
    expect(g.captured.player[0].piValue).toBe(3);
  });

  it('쌍피로 7점이 되어도 바로 묻지 않고, 턴이 끝날 때 고/스톱을 묻는다', () => {
    let g = cleanGame('normal');
    g.captured.player = fill('gwang', 5);
    g = flipCard(g, idxOfItem(g, 'ssangpi'));
    expect(g.phase).toBe('playing');
    g = { ...g, tries: 1 };
    const pair = g.deck.map((s, k) => (s.card.month === 6 ? k : -1)).filter((k) => k >= 0).slice(0, 2);
    g = resolveFlip(flipCard(flipCard(g, pair[0]), pair[1]));
    expect(g.phase).toBe('gostop');
  });

  it('고/스톱 점수에 닿아도 시도가 남았으면 남은 시도를 마친 뒤에 묻는다', () => {
    let g = cleanGame('normal');
    g.captured.player = fill('gwang', 5);
    const pair = (m) => g.deck.map((s, k) => (s.card.month === m ? k : -1)).filter((k) => k >= 0).slice(0, 2);
    g = resolveFlip(flipCard(flipCard(g, pair(6)[0]), pair(6)[1]));
    expect(g.phase).toBe('playing'); // 아직 한 번 더 시도 가능
    expect(g.turn).toBe('player');
    g = resolveFlip(flipCard(flipCard(g, pair(7)[0]), pair(7)[1]));
    expect(g.phase).toBe('gostop');
    expect(g.turn).toBe('player');
    // 틀려서 끝나는 경우에도 묻는다
    let h = cleanGame('normal');
    h.captured.player = fill('gwang', 5);
    const x = h.deck.findIndex((s) => s.card.month === 6);
    h = resolveFlip(flipCard(flipCard(h, x), h.deck.findIndex((s) => s.card.month === 6 && s !== h.deck[x])));
    const i = h.deck.findIndex((s) => !s.taken && s.card.month === 1);
    const j = h.deck.findIndex((s) => !s.taken && s.card.month === 2);
    h = resolveFlip(flipCard(flipCard(h, i), j));
    expect(h.phase).toBe('gostop');
    expect(h.turn).toBe('player');
    expect(declareGo(h).turn).toBe('ai');
  });

  it('섞기: 남은 카드의 위치가 바뀌고 선택·공개 카드는 따라간다', () => {
    let g = cleanGame('easy');
    const a = idxOfMonth(g, 1);
    const b = idxOfMonth(g, 2);
    g = { ...g, revealed: [b], revealLeft: { [b]: 3 }, memory: [a, b] };
    g = flipCard(g, a);
    const cardA = g.deck[a].card;
    const cardB = g.deck[b].card;
    g = flipCard(g, idxOfItem(g, 'shuffle'));
    expect(g.deck[g.flipped[0]].card).toBe(cardA);
    expect(g.deck[g.revealed[0]].card).toBe(cardB);
    expect(g.revealLeft[g.revealed[0]]).toBe(3);
    expect(g.memory).toEqual([]);
    const ids = g.deck.filter((s) => !s.taken).map((s) => s.card.id).sort((x, y) => x - y);
    expect(ids).toHaveLength(53);
    expect(new Set(ids).size).toBe(53);
  });

  it('초기화: 열려 있던 카드를 모두 뒷면으로 돌린다 (고른 카드는 유지)', () => {
    let g = cleanGame('easy');
    const a = idxOfMonth(g, 1);
    const b = idxOfMonth(g, 2);
    const c = idxOfMonth(g, 3);
    g = { ...g, revealed: [b, c], revealLeft: { [b]: 4, [c]: 2 } };
    g = flipCard(g, a);
    g = flipCard(g, idxOfItem(g, 'reset'));
    expect(g.revealed).toEqual([]);
    expect(g.revealLeft).toEqual({});
    expect(g.lastHidden.sort()).toEqual([b, c].sort());
    expect(g.flipped).toEqual([a]);
  });

  it('엿보기(사람): 엔진 상태는 바뀌지 않고, 쓴 사람이 사람임이 기록된다', () => {
    let g = cleanGame('normal');
    const before = { memory: g.memory, revealed: g.revealed };
    g = flipCard(g, idxOfItem(g, 'peek'));
    expect(g.itemEvent).toMatchObject({ who: 'player', item: 'peek' });
    expect(g.memory).toEqual(before.memory); // AI는 아무것도 알게 되지 않는다
    expect(g.revealed).toEqual(before.revealed); // 상대 화면에는 아무 카드도 열리지 않는다
    expect(PEEK_VIEW_MS).toBe(3000);
  });

  it('엿보기(AI): 기억력 한도 안에서 짝이 되는 카드를 기억한다', () => {
    for (const diff of ['easy', 'normal', 'hard']) {
      let g = { ...cleanGame(diff), turn: 'ai' };
      g = flipCard(g, idxOfItem(g, 'peek'));
      expect(g.itemEvent).toMatchObject({ who: 'ai', item: 'peek' });
      expect(g.memory.length).toBeGreaterThan(0);
      expect(g.memory.length).toBeLessThanOrEqual(MEMORY_LIMIT[diff]);
      const months = g.memory.map((k) => g.deck[k].card.month);
      // 짝이 되는 카드들이다 (각 월이 정확히 2장씩 들어 있다)
      for (const m of new Set(months)) expect(months.filter((x) => x === m).length % 2).toBe(0);
      for (const k of g.memory) {
        expect(g.deck[k].taken).toBe(false);
        expect(g.deck[k].card.kind).not.toBe('item');
      }
      expect(g.revealed).toEqual([]); // 사람에게 보이는 카드는 없다
    }
  });

  it('엿보기(AI)로 짝을 알게 된 AI는 그 짝을 고른다', () => {
    let g = { ...cleanGame('normal'), turn: 'ai' };
    g = flipCard(g, idxOfItem(g, 'peek'));
    const first = aiChooseFlip(g);
    g = flipCard(g, first);
    const second = aiChooseFlip(g);
    expect(g.deck[second].card.month).toBe(g.deck[first].card.month);
  });

  it('같은 상태에서 같은 아이템을 쓰면 결과도 같다 (리듀서가 순수하다)', () => {
    const g = cleanGame('normal');
    const i = idxOfItem(g, 'shuffle');
    const x = flipCard(g, i);
    const y = flipCard(g, i);
    expect(x.deck.map((s) => s.card.id)).toEqual(y.deck.map((s) => s.card.id));
  });

  it('게임은 일반 카드를 모두 가져가면 끝난다 (아이템이 남아 있어도)', () => {
    let g = cleanGame('normal');
    const pair = [idxOfMonth(g, 1), idxOfMonth(g, 1, 1)];
    g.deck = g.deck.map((s, i) => (pair.includes(i) || s.card.kind === 'item' ? s : { ...s, taken: true }));
    g = resolveFlip(flipCard(flipCard(g, pair[0]), pair[1]));
    expect(g.phase).toBe('over');
    expect(g.deck.some((s) => !s.taken && s.card.kind === 'item')).toBe(true);
  });

  it('고: 상대 차례로 넘어가고, 열려 있던 카드의 남은 턴이 줄어든다', () => {
    let g = cleanGame('easy');
    g.captured.player = fill('gwang', 5);
    const m = (n) => g.deck.findIndex((s) => s.card.month === n);
    g = { ...g, phase: 'gostop', revealed: [m(6)], revealLeft: { [m(6)]: 3 }, tries: 1 };
    g = declareGo(g);
    expect(g.turn).toBe('ai');
    expect(g.tries).toBe(0);
    expect(g.revealLeft[m(6)]).toBe(2);
  });

  it('쌍피로 고/스톱이 되어 틀리면, 턴 끝에 고를 불러 상대 차례가 된다', () => {
    let g = cleanGame('normal');
    g.captured.player = fill('gwang', 5);
    g = flipCard(g, g.deck.findIndex((s) => s.card.item === 'ssangpi')); // 쌍피로 7점
    g = { ...g, tries: 1 };
    const i = g.deck.findIndex((s) => s.card.month === 1);
    const j = g.deck.findIndex((s) => s.card.month === 2);
    g = resolveFlip(flipCard(flipCard(g, i), j)); // 틀려서 턴 종료 → 고/스톱
    expect(g.phase).toBe('gostop');
    g = declareGo(g);
    expect(g.flipped).toEqual([]);
    expect(g.turn).toBe('ai');
  });

  it('턴이 넘어갈 때마다 turnEvent가 이유와 함께 기록된다', () => {
    let g = cleanGame('normal');
    expect(g.turnEvent).toEqual({ n: 1, to: 'player', reason: 'start' });
    // 틀림
    const i = g.deck.findIndex((s) => s.card.month === 1);
    const j = g.deck.findIndex((s) => s.card.month === 2);
    g = resolveFlip(flipCard(flipCard(g, i), j));
    expect(g.turnEvent).toEqual({ n: 2, to: 'ai', reason: 'miss' });
    // 4장 모두 엶: 두 번 연속 맞춤
    g = { ...g, turn: 'player' };
    const pair = (m) => g.deck.map((s, k) => (s.card.month === m ? k : -1)).filter((k) => k >= 0).slice(0, 2);
    g.captured.player = [];
    g = resolveFlip(flipCard(flipCard(g, ...pair(4).slice(0, 1)), pair(4)[1]));
    g = resolveFlip(flipCard(flipCard(g, pair(5)[0]), pair(5)[1]));
    expect(g.turnEvent).toMatchObject({ to: 'ai', reason: 'tries' });
    // 고
    let h = cleanGame('normal');
    h.captured.player = fill('gwang', 5);
    h = declareGo({ ...h, phase: 'gostop' });
    expect(h.turnEvent).toMatchObject({ to: 'ai', reason: 'go' });
  });

  const pairOf = (g, m) => g.deck.map((s, k) => (!s.taken && s.card.month === m ? k : -1)).filter((k) => k >= 0).slice(0, 2);

  it('판쓸: 열려 있던 카드를 모두 먹으면 상대 피 한 장과 +1점', () => {
    let g = cleanGame('easy');
    const ms = pairOf(g, 1);
    g.revealed = [...ms];
    g.revealLeft = { [ms[0]]: 3, [ms[1]]: 3 };
    g.captured.ai = fill('pi', 3);
    g = resolveFlip(flipCard(flipCard(g, ms[0]), ms[1]));
    expect(g.rewardEvent.rewards.map((r) => r.kind)).toContain('sweep');
    expect(g.captured.ai).toHaveLength(3 - g.rewardEvent.stolen.length);
    expect(g.bonus.player).toBe(1);
    // 열린 카드가 남아 있으면 판쓸이 아니다
    let h = cleanGame('easy');
    const m2 = pairOf(h, 1);
    const other = h.deck.findIndex((s) => s.card.month === 5);
    h.revealed = [...m2, other];
    h.revealLeft = { [m2[0]]: 3, [m2[1]]: 3, [other]: 3 };
    h.tries = 1;
    h = resolveFlip(flipCard(flipCard(h, m2[0]), m2[1]));
    expect(h.bonus.player).toBe(0);
  });

  it('쪽: 첫 시도에서 처음 보는 두 장이 짝이면 상대 피 한 장', () => {
    let g = cleanGame('normal');
    g.captured.ai = fill('pi', 3);
    const [x, y] = pairOf(g, 4);
    g = resolveFlip(flipCard(flipCard(g, x), y));
    expect(g.rewardEvent.rewards.map((r) => r.kind)).toEqual(['jjok']);
    expect(g.captured.ai).toHaveLength(2);
  });

  it('쪽: 두 번째 시도(3·4번째 카드)에서도 처음 보는 두 장이 짝이면 상대 피 한 장', () => {
    let g = cleanGame('normal');
    g.captured.ai = fill('pi', 3);
    g.tries = 1;
    const [x, y] = pairOf(g, 4);
    g = resolveFlip(flipCard(flipCard(g, x), y));
    expect(g.rewardEvent.rewards.map((r) => r.kind)).toEqual(['jjok']);
    expect(g.captured.ai).toHaveLength(2);
  });

  it('폭탄: 한 턴에 같은 월 두 쌍(4장)을 연속으로 맞출 때만 터진다', () => {
    const idx = (g, m) => g.deck.map((s, k) => (s.card.month === m ? k : -1)).filter((k) => k >= 0);
    let g = cleanGame('easy');
    g.captured.ai = fill('pi', 6);
    const c = idx(g, 4);
    g = resolveFlip(flipCard(flipCard(g, c[0]), c[1])); // 첫 번째 시도: 4월 한 쌍
    expect(g.rewardEvent?.rewards.map((r) => r.kind) ?? []).not.toContain('bomb');
    expect(g.turn).toBe('player');
    g = resolveFlip(flipCard(flipCard(g, c[2]), c[3])); // 두 번째 시도: 4월 나머지 한 쌍 → 폭탄
    expect(g.rewardEvent.rewards.map((r) => r.kind)).toContain('bomb');
    expect(g.rewardEvent.stolen.length).toBeGreaterThanOrEqual(2);
  });

  it('폭탄: 다른 월을 사이에 맞췄거나, 턴이 달라지면 터지지 않는다', () => {
    const idx = (g, m) => g.deck.map((s, k) => (s.card.month === m ? k : -1)).filter((k) => k >= 0);
    // 같은 턴이라도 다른 월 짝 뒤에는 4장이 안 된다
    let g = cleanGame('easy');
    g.captured.ai = fill('pi', 6);
    const a = idx(g, 4);
    const b = idx(g, 5);
    g = resolveFlip(flipCard(flipCard(g, a[0]), a[1]));
    g = resolveFlip(flipCard(flipCard(g, b[0]), b[1]));
    expect(g.rewardEvent?.rewards.map((r) => r.kind) ?? []).not.toContain('bomb');
    // 이전 턴에 먹은 4월 한 쌍이 있어도, 새 턴에 나머지 한 쌍을 맞추면 폭탄이 아니다
    let h = cleanGame('easy');
    h.captured.ai = fill('pi', 6);
    h.captured.player = h.deck.filter((s) => s.card.month === 4).slice(0, 2).map((s) => s.card);
    const c = idx(h, 4);
    h.deck = h.deck.map((s, k) => (k === c[0] || k === c[1] ? { ...s, taken: true } : s));
    h = resolveFlip(flipCard(flipCard(h, c[2]), c[3]));
    expect(h.rewardEvent?.rewards.map((r) => r.kind) ?? []).not.toContain('bomb');
    // 3장이 앞면으로 열려 있기만 해도 아니다
    let k = cleanGame('easy');
    k.captured.ai = fill('pi', 6);
    const d = idx(k, 6);
    k.revealed = d.slice(0, 3);
    k.revealLeft = Object.fromEntries(k.revealed.map((x) => [x, 3]));
    k = resolveFlip(flipCard(flipCard(k, d[0]), d[1]));
    expect(k.rewardEvent?.rewards.map((r) => r.kind) ?? []).not.toContain('bomb');
  });

  it('선을 AI로 정하면 AI가 먼저 시작하고 시작 아이템도 AI가 먹는다', () => {
    const g = createGame('normal', Math.random, 'ai');
    expect(g.turn).toBe('ai');
    expect(g.turnEvent).toMatchObject({ to: 'ai', reason: 'start' });
    expect(g.captured.player).toHaveLength(0);
    expect(g.revealed).toHaveLength(START_OPEN);
  });

  it('엿보기로 보이는 카드: 닫힌 일반 카드의 절반이고, 아이템·열린·먹은 카드는 빠진다', () => {
    let g = cleanGame('easy');
    const open = g.deck.findIndex((s) => s.card.kind !== 'item');
    g.revealed = [open];
    g.revealLeft = { [open]: 3 };
    const taken = g.deck.findIndex((s, i) => i !== open && s.card.kind !== 'item');
    g.deck = g.deck.map((s, i) => (i === taken ? { ...s, taken: true } : s));
    const closed = g.deck.filter((s, i) => !s.taken && s.card.kind !== 'item' && i !== open).length;
    const sub = peekSubset(g, Math.random);
    expect(sub).toHaveLength(Math.floor(closed / 2));
    expect(sub.every((i) => g.deck[i].card.kind !== 'item' && !g.deck[i].taken && i !== open)).toBe(true);
    expect(new Set(sub).size).toBe(sub.length);
  });

  it('시작 때 선이 먹은 아이템이 있으면 startNote 로 알려 준다', () => {
    let seen = 0;
    for (let n = 1; n <= 200; n++) {
      const g = createGame('easy', seededRng(n), n % 2 ? 'player' : 'ai');
      const took = g.captured[g.first];
      if (took.length > 0) {
        seen++;
        expect(g.startNote).toEqual({ who: g.first, items: took.map((c) => c.name) });
      } else {
        expect(g.startNote).toBeNull();
      }
    }
    expect(seen).toBeGreaterThan(0); // 200판 중 아이템이 나온 판이 있어야 검증이 의미 있다
  });

  it('시작 때 엿보기가 나오면 선에게 효과가 바로 발동한다 (AI 선이면 기억에 반영)', () => {
    let human = 0;
    let aiFirst = 0;
    for (let n = 1; n <= 600; n++) {
      for (const first of ['player', 'ai']) {
        const g = createGame('easy', seededRng(n), first);
        const hasPeek = g.startNote?.items.includes('엿보기');
        if (!hasPeek) {
          // 엿보기가 아니어도 먹은 아이템이 있으면 연출이 나온다 (우선순위: 쓰리피 > 쌍피 > 섞기 > 초기화)
          if (g.startNote) {
            expect(g.itemEvent).toMatchObject({ n: 1, who: first });
            expect(g.deck[g.itemEvent.index].taken).toBe(true);
            expect(g.startNote.items).toContain(g.itemEvent.item === 'ssangpi' ? '쌍피' : g.itemEvent.item === 'tripi' ? '쓰리피' : g.itemEvent.item === 'shuffle' ? '섞기' : '초기화');
          } else {
            expect(g.itemEvent).toBeNull();
          }
          continue;
        }
        expect(g.itemEvent).toMatchObject({ n: 1, who: first, item: 'peek' });
        expect(g.deck[g.itemEvent.index].taken).toBe(true);
        if (first === 'player') human++;
        else {
          aiFirst++;
          expect(g.memory.length).toBeGreaterThan(g.revealed.length - 1); // 열린 카드 + 엿보기로 안 것
        }
      }
    }
    expect(human).toBeGreaterThan(0);
    expect(aiFirst).toBeGreaterThan(0);
  });
});
