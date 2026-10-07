import { describe, it, expect } from 'vitest';
import { HWATU_CARDS } from './cards.js';
import { calculateScore, applyGo, finalPayout } from './scoring.js';
import { REVEAL_LIMIT, MAX_TRIES, createGame, flipCard, resolveFlip, declareGo, declareStop, aiChooseFlip, scoreOf } from './engine.js';

const byName = (...names) => names.map((n) => HWATU_CARDS.find((c) => c.name === n));
const fill = (kind, n) => HWATU_CARDS.filter((c) => c.kind === kind).slice(0, n);

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
    expect(applyGo(7, 0)).toBe(7);
    expect(applyGo(7, 1)).toBe(8);
    expect(applyGo(7, 2)).toBe(9);
    expect(applyGo(7, 3)).toBe(18);
    expect(applyGo(7, 4)).toBe(36);
    const winner = [...fill('gwang', 3), ...fill('pi', 10)];
    const p = finalPayout(winner, [], 0);
    expect(p.pibak && p.gwangbak).toBe(true);
    expect(p.total).toBe(p.base * 4);
  });
});

describe('게임 진행', () => {
  const rigged = () => {
    const g = createGame('normal');
    // 앞 4장을 1월 4장으로 고정
    const ones = HWATU_CARDS.filter((c) => c.month === 1);
    const rest = g.deck.filter((s) => s.card.month !== 1);
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
    let g = createGame('normal');
    g.captured.player = byName('송학광', '벚꽃광', '공산광', '오동광', '매조', '흑싸리새', '공산기러기');
    expect(scoreOf(g, 'player')).toBe(4 + 5);
    g = { ...g, phase: 'gostop' };
    g = declareGo(g);
    expect(g.phase).toBe('playing');
    expect(g.goCount.player).toBe(1);
    expect(g.lastGoScore.player).toBe(9);
    g.captured.ai = byName('비광'); // 광박 방지
    const stop = declareStop({ ...g, phase: 'gostop' });
    expect(stop.phase).toBe('over');
    expect(stop.result.winner).toBe('player');
    expect(stop.result.total).toBe(10); // 9점 + 1고
  });
  it('모든 카드를 가져갔는데 7점 미만이면 나가리', () => {
    let g = createGame('normal');
    g.deck = g.deck.map((s, i) => (i < 2 ? s : { ...s, taken: true }));
    // 같은 월 2장으로 맞춰놓고 마지막 짝을 맞춘 상황 재현
    g.deck[0] = { card: HWATU_CARDS[2], taken: false };
    g.deck[1] = { card: HWATU_CARDS[3], taken: false };
    g = flipCard(flipCard(g, 0), 1);
    g = resolveFlip(g);
    expect(g.phase).toBe('over');
    expect(g.result.winner).toBeNull();
  });
  it('연속으로 맞춰도 4번 시도하면 턴이 넘어간다', () => {
    let g = createGame('normal');
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
  it('쉬움: 틀린 카드는 최근 6장까지만 앞면으로 유지된다', () => {
    let g = createGame('easy');
    expect(REVEAL_LIMIT.easy).toBe(6);
    const miss = (a, b) => {
      g = resolveFlip(flipCard(flipCard(g, a), b));
      g = { ...g, turn: 'player', tries: 0 }; // 연속 시도 시험용
    };
    // 월이 서로 다른 카드 8장 (0..7이 아니라 월별 첫 카드)
    const firsts = [1, 2, 3, 4, 5, 6, 7, 8].map((m) => g.deck.findIndex((s) => s.card.month === m));
    miss(firsts[0], firsts[1]);
    miss(firsts[2], firsts[3]);
    miss(firsts[4], firsts[5]);
    expect(g.revealed).toEqual(firsts.slice(0, 6));
    miss(firsts[6], firsts[7]);
    expect(g.revealed).toEqual(firsts.slice(2, 8)); // 가장 오래된 2장이 뒤집힌다
  });
  it('쉬움: 앞면 카드 2장을 골라 짝을 맞출 수 있고 유지 목록에서 빠진다', () => {
    let g = createGame('easy');
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
    let g = createGame('normal');
    const i = g.deck.findIndex((s) => s.card.month === 1);
    const j = g.deck.findIndex((s) => s.card.month === 2);
    g = resolveFlip(flipCard(flipCard(g, i), j));
    expect(g.revealed).toEqual([]);
  });
});
