// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { createGame } from '../game/engine.js';
import { publicView } from '../game/pvp.js';
import { seededRng } from '../game/rng.js';

let roomCb = null;
const calls = { claimTimeout: 0, leaveRoom: 0, playAction: [] };
vi.mock('../firebase/pvp.js', async () => {
  const actual = await vi.importActual('../firebase/pvp.js').catch(() => ({}));
  const { swapSides } = await import('../game/pvp.js');
  return {
    ...actual,
    watchRoom: (id, cb) => { roomCb = cb; return () => {}; },
    watchPeek: () => () => {},
    claimTimeout: async () => { calls.claimTimeout++; },
    leaveRoom: async () => { calls.leaveRoom++; },
    playAction: async (id, a) => { calls.playAction.push(a); },
    rematch: async () => {},
    messageOf: (e) => String(e?.message ?? ''),
    viewOf: (room, uid) => {
      if (!room?.viewJson) return null;
      const v = JSON.parse(room.viewJson);
      const seat = room.seats[0] === uid ? 'A' : 'B';
      return { view: seat === 'A' ? v : swapSides(v), seat };
    },
  };
});
vi.mock('../firebase/wallet.js', () => ({ call: async () => ({}), load: async () => null }));

const { default: PvpRoom } = await import('./PvpRoom.jsx');

const mkRoom = (extra = {}) => {
  const g = createGame('normal', seededRng(5), 'ai'); // B 자리가 선
  return {
    status: 'playing', quick: false, code: '1234', seats: ['alice', 'bob'], names: { A: '앨리스', B: '밥' },
    viewJson: JSON.stringify(publicView(g, 99)), version: 1, deadline: Date.now() + 30000, rematch: { A: false, B: false }, ...extra,
  };
};

let lastProps = null;
const Game = (props) => { lastProps = props; return <div data-testid="game">{props.state.turn}|{props.remote.names.other}</div>; };
const setup = (uid) => render(<PvpRoom roomId="r1" uid={uid} Game={Game} onExit={() => {}} onFallbackToAi={() => {}} useGameSounds={() => {}} />);

beforeEach(() => { cleanup(); lastProps = null; calls.claimTimeout = 0; calls.leaveRoom = 0; calls.playAction = []; roomCb = null; });

describe('사람 대전 화면 연결', () => {
  it('내가 B 자리면 화면은 내 시점(player/ai 맞바꿈)으로 그려진다', async () => {
    setup('bob');
    await act(async () => roomCb(mkRoom()));
    // 서버 상태에서는 B(ai)가 선 → 밥의 화면에서는 "내 차례(player)"
    expect(screen.getByTestId('game').textContent).toBe('player|앨리스');
    expect(lastProps.remote.names).toEqual({ me: '밥', other: '앨리스' });
  });

  it('내가 A 자리면 상대(ai)가 선이라 상대 차례로 보인다', async () => {
    setup('alice');
    await act(async () => roomCb(mkRoom()));
    expect(screen.getByTestId('game').textContent).toBe('ai|밥');
  });

  it('대기 중인 방은 코드를 보여 준다', async () => {
    setup('alice');
    await act(async () => roomCb({ status: 'waiting', quick: false, code: '4821', seats: ['alice', ''], names: { A: '앨리스', B: '' } }));
    expect(screen.getByText('4821')).toBeTruthy();
  });

  it('방이 사라지면 안내를 보여 준다', async () => {
    setup('alice');
    await act(async () => roomCb(null));
    expect(screen.getByText('방이 닫혔습니다')).toBeTruthy();
  });

  it('조작은 서버 호출로 전달된다', async () => {
    setup('bob');
    await act(async () => roomCb(mkRoom()));
    await act(async () => lastProps.send({ type: 'FLIP', index: 3 }));
    expect(calls.playAction).toEqual([{ type: 'FLIP', index: 3 }]);
  });

  it('끝난 판은 정산 정보를 내 시점으로 계산해 전달한다', async () => {
    setup('bob');
    const g = createGame('normal', seededRng(5), 'ai');
    const over = { ...g, phase: 'over', result: { winner: 'ai', total: 8, how: 'stop' } }; // 서버 기준 B(ai)가 승
    await act(async () => roomCb(mkRoom({ status: 'over', viewJson: JSON.stringify(publicView(over, 99)), money: { amount: 800, winnerSeat: 'B' } })));
    expect(lastProps.settle).toMatchObject({ status: 'pvp', delta: 800 }); // 밥은 이겨서 +800
    expect(lastProps.state.result.winner).toBe('player');
  });
});
