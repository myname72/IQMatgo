import { describe, it, expect } from 'vitest';
import { newGame, applyAction, applyTimeout, applyForfeit, settleMoney, sideOf, RESOLVE_MIN_MS } from './pvp.js';
import { publicView, swapSides, peekCardsOf } from '../game/pvp.js';
import { seededRng } from '../game/rng.js';
import { aiChooseFlip, aiDecideGoStop } from '../game/engine.js';

const fresh = (firstSeat = 'A') => newGame({ difficulty: 'normal', firstSeat, rng: seededRng(4242) });

describe('사람 대전: 서버 규칙', () => {
  it('내 차례가 아니면 카드를 뒤집을 수 없다', () => {
    const g = fresh('A');
    expect(() => applyAction(g, 'B', { type: 'FLIP', index: 0 }, 1000)).toThrow('not-your-turn');
    const ok = applyAction(g, 'A', { type: 'FLIP', index: g.state.deck.findIndex((s, i) => !s.taken && !g.state.revealed.includes(i) && s.card.kind !== 'item') }, 1000);
    expect(ok.state.flipped).toHaveLength(1);
  });

  it('두 장을 뒤집어도 보여 주는 시간이 지나기 전에는 판정할 수 없다', () => {
    let g = fresh('A');
    // 아직 안 본(뒷면) 일반 카드 두 장 (앞면 카드는 짝일 때만 고를 수 있다)
    const open = [...g.state.deck.keys()].filter((i) => !g.state.deck[i].taken && g.state.deck[i].card.kind !== 'item' && !g.state.revealed.includes(i));
    g = applyAction(g, 'A', { type: 'FLIP', index: open[0] }, 1000);
    g = applyAction(g, 'A', { type: 'FLIP', index: open[1] }, 1000);
    expect(() => applyAction(g, 'B', { type: 'RESOLVE' }, 1000 + RESOLVE_MIN_MS - 1)).toThrow('too-early');
    const r = applyAction(g, 'B', { type: 'RESOLVE' }, 1000 + RESOLVE_MIN_MS); // 상대도 판정을 요청할 수 있다
    expect(r.state.flipped).toHaveLength(0);
  });

  it('공개 상태에는 뒤집지 않은 카드의 정체가 없다', () => {
    const g = fresh('A');
    const view = publicView(g.state, 777);
    const hidden = view.deck.filter((s, i) => !s.taken && !g.state.revealed.includes(i));
    expect(hidden.length).toBeGreaterThan(30);
    expect(hidden.every((s) => s.card.kind === 'hidden')).toBe(true);
    expect(view.seed).toBe(777);
    expect(JSON.stringify(view)).not.toContain(String(g.state.seed) + ',');
    // 열린 카드는 정체가 보인다
    for (const i of g.state.revealed) expect(view.deck[i].card.month).toBeGreaterThan(0);
  });

  it('B 자리 시점으로 바꾸면 player/ai 가 맞바뀐다', () => {
    const g = fresh('B');
    const v = swapSides(publicView(g.state, 1));
    expect(g.state.turn).toBe('ai');
    expect(v.turn).toBe('player'); // B 에게는 내 차례
    expect(v.turnEvent.to).toBe('player');
  });

  it('엿보기 정보에는 닫힌 일반 카드의 절반만 들어 있고 아이템 패는 없다', () => {
    const g = fresh('A');
    const cards = peekCardsOf(g.state);
    const closed = g.state.deck.filter((s, i) => !s.taken && s.card.kind !== 'item' && !g.state.revealed.includes(i)).length;
    expect(Object.keys(cards).length).toBe(Math.floor(closed / 2));
    expect(Object.values(cards).every((c) => c.kind !== 'item')).toBe(true);
  });

  it('시간 초과: 턴이 넘어가고, 연속 3번이면 기권패', () => {
    const first = applyTimeout(fresh('A'));
    expect(first.state.phase).toBe('playing');
    expect(first.state.turn).toBe('ai'); // A 가 초과해서 B 차례
    expect(first.timeouts.A).toBe(1);
    // 같은 자리가 계속 초과하면 쌓인다
    let h = { ...fresh('A') };
    h = applyTimeout(h); // A 초과
    h = applyTimeout(h); // B 초과
    h = applyTimeout(h); // A 초과 2
    h = applyTimeout(h); // B 초과 2
    h = applyTimeout(h); // A 초과 3 → 기권
    expect(h.state.phase).toBe('over');
    expect(h.state.result.winner).toBe(sideOf('B'));
    expect(h.state.result.how).toBe('forfeit');
  });

  it('기권하면 이긴 쪽 점수는 최소 7점으로 친다', () => {
    const g = applyForfeit(fresh('A'), 'A');
    expect(g.state.phase).toBe('over');
    expect(g.state.result.winner).toBe('ai');
    expect(g.state.result.total).toBeGreaterThanOrEqual(7);
  });

  it('포인트는 이긴 쪽으로 이동하고, 진 쪽 잔액을 넘지 않는다', () => {
    const win = { winner: 'player', total: 8 };
    expect(settleMoney(win, { A: 100000, B: 100000 })).toMatchObject({ amount: 800, winnerSeat: 'A', balances: { A: 100800, B: 99200 } });
    expect(settleMoney(win, { A: 100000, B: 300 })).toMatchObject({ amount: 300, balances: { A: 100300, B: 0 } });
    expect(settleMoney({ winner: null, total: 0 }, { A: 5, B: 5 }).amount).toBe(0);
    expect(settleMoney({ winner: 'ai', total: 10 }, { A: 100000, B: 100000 })).toMatchObject({ winnerSeat: 'B', balances: { A: 99000, B: 101000 } });
  });

  it('두 자리가 번갈아 끝까지 두면 판이 끝나고 정산이 가능하다', () => {
    let g = fresh('A');
    let now = 1000;
    let guard = 0;
    while (g.state.phase !== 'over' && guard++ < 6000) {
      const s = g.state;
      const seat = s.turn === 'player' ? 'A' : 'B';
      now += 1000;
      if (s.phase === 'gostop') g = applyAction(g, seat, { type: aiDecideGoStop(s) === 'go' ? 'GO' : 'STOP' }, now);
      else if (s.flipped.length === 2) g = applyAction(g, seat, { type: 'RESOLVE' }, now);
      else g = applyAction(g, seat, { type: 'FLIP', index: aiChooseFlip(s) }, now);
    }
    expect(g.state.phase).toBe('over');
    const res = settleMoney(g.state.result, { A: 100000, B: 100000 });
    expect(res.balances.A + res.balances.B).toBe(200000); // 포인트는 늘거나 줄지 않고 이동만 한다
  });
});
