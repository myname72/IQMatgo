import { describe, it, expect } from 'vitest';
import { createGame, gameReducer, aiChooseFlip, aiDecideGoStop } from '../game/engine.js';
import { seededRng } from '../game/rng.js';
import { replayGame, rewardFor, DAILY_AI_CAP, POINTS_PER_SCORE, AI_REWARD_RATE, todayKst } from './settle.js';

// 클라이언트처럼 한 판을 끝까지 진행하며 조작 기록을 남긴다 (사람 쪽도 AI 로직으로 대신 둔다)
function playLogged(difficulty, seed, first) {
  let g = createGame(difficulty, seededRng(seed), first);
  const actions = [];
  const act = (a) => {
    const n = gameReducer(g, a);
    if (n !== g) actions.push(a);
    g = n;
  };
  let guard = 0;
  while (g.phase !== 'over' && guard++ < 5000) {
    if (g.phase === 'gostop') act({ type: aiDecideGoStop(g) === 'go' ? 'GO' : 'STOP' });
    else if (g.flipped.length === 2) act({ type: 'RESOLVE' });
    else act({ type: 'FLIP', index: aiChooseFlip(g) });
  }
  return { g, actions };
}

describe('서버 재생 정산', () => {
  it('같은 시드와 조작 기록이면 클라이언트와 같은 결과가 나온다', () => {
    for (const [difficulty, first] of [['easy', 'player'], ['normal', 'ai'], ['hard', 'player']]) {
      const seed = 12345 + difficulty.length;
      const { g, actions } = playLogged(difficulty, seed, first);
      const result = replayGame({ difficulty, seed, first, actions });
      expect(result.winner).toBe(g.result.winner);
      expect(result.total).toBe(g.result.total);
    }
  });

  it('다른 시드로는 재생이 어긋나 결과가 달라지거나 끝나지 않는다', () => {
    const { g, actions } = playLogged('normal', 777, 'player');
    let same = 0;
    for (let s = 1; s <= 5; s++) {
      try {
        const r = replayGame({ difficulty: 'normal', seed: 777 + s, first: 'player', actions });
        if (r.winner === g.result.winner && r.total === g.result.total) same++;
      } catch {
        /* 끝나지 않으면 오류 */
      }
    }
    expect(same).toBeLessThan(5);
  });

  it('끝나지 않은 기록·잘못된 동작은 거부한다', () => {
    const { actions } = playLogged('normal', 99, 'player');
    expect(() => replayGame({ difficulty: 'normal', seed: 99, first: 'player', actions: actions.slice(0, 5) })).toThrow();
    expect(() => replayGame({ difficulty: 'normal', seed: 99, first: 'player', actions: [{ type: 'HACK' }] })).toThrow();
    expect(() => replayGame({ difficulty: 'normal', seed: 99, first: 'player', actions: [] })).toThrow();
  });

  it('포인트: 이겼을 때만, AI 비율로, 일일 상한 안에서', () => {
    expect(rewardFor({ winner: 'ai', total: 10 }, 0)).toBe(0);
    expect(rewardFor({ winner: null, total: 0 }, 0)).toBe(0);
    expect(rewardFor({ winner: 'player', total: 8 }, 0)).toBe(Math.floor(8 * POINTS_PER_SCORE * AI_REWARD_RATE));
    expect(rewardFor({ winner: 'player', total: 100 }, 0)).toBe(DAILY_AI_CAP);
    expect(rewardFor({ winner: 'player', total: 100 }, DAILY_AI_CAP - 50)).toBe(50);
    expect(rewardFor({ winner: 'player', total: 100 }, DAILY_AI_CAP)).toBe(0);
  });

  it('한국 날짜 기준으로 하루가 바뀐다', () => {
    expect(todayKst(Date.UTC(2026, 9, 7, 14, 59))).toBe('2026-10-07'); // KST 23:59
    expect(todayKst(Date.UTC(2026, 9, 7, 15, 0))).toBe('2026-10-08'); // KST 00:00
  });
});
