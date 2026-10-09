import { createGame, gameReducer, resolveFlip, skipTurn, forfeitGame } from '../game/engine.js';
import { PVP_POINTS_PER_SCORE } from './settle.js';

export const MOVE_MS = 30_000; // 한 번 움직이는 데 주어지는 시간
export const FIRST_MOVE_MS = 40_000; // 판 시작 직후 첫 수는 조금 더
export const MAX_TIMEOUTS = 3; // 연속 시간 초과가 이만큼 쌓이면 기권패
export const RESOLVE_MIN_MS = 900; // 두 장을 뒤집은 뒤 판정까지 최소로 보여 주는 시간
export const HOST_ALIVE_MS = 45_000; // 방장이 이 시간 안에 신호(heartbeat)를 보낸 대기 방만 목록에 보인다
export const HEARTBEAT_MS = 15_000;

const ACTIONS = new Set(['FLIP', 'RESOLVE', 'GO', 'STOP', 'GUKJIN']);
export const sideOf = (seat) => (seat === 'A' ? 'player' : 'ai');
export const seatOf = (side) => (side === 'player' ? 'A' : 'B');
export const otherSeat = (seat) => (seat === 'A' ? 'B' : 'A');

// 새 판 (A 자리가 engine 의 player, B 자리가 ai 쪽). first 는 선을 잡는 자리.
export function newGame({ difficulty, firstSeat = 'A', rng }) {
  return { state: createGame(difficulty, rng, sideOf(firstSeat)), lastFlipAt: 0, timeouts: { A: 0, B: 0 } };
}

export const deadlineFor = (game, now, first = false) => (game.state.phase === 'over' ? null : now + (first ? FIRST_MOVE_MS : MOVE_MS));

// 한 자리의 조작을 적용한다. 규칙에 어긋나면 오류를 던진다.
export function applyAction(game, seat, action, now) {
  const s = game.state;
  if (!action || !ACTIONS.has(action.type)) throw new Error('bad-action');
  if (s.phase === 'over') throw new Error('over');
  const mine = s.turn === sideOf(seat);
  // 국진을 열끗/쌍피 중 무엇으로 쓸지는 자기 차례가 아니어도 언제든 바꿀 수 있다
  if (action.type === 'GUKJIN') {
    const next = gameReducer(s, { type: 'GUKJIN', who: sideOf(seat), mode: action.mode });
    if (next === s) throw new Error('illegal');
    return { ...game, state: next, keepDeadline: true }; // 제한 시간은 그대로 둔다 (시간 끌기 방지)
  }
  if (action.type === 'RESOLVE') {
    if (s.flipped.length !== 2 || now - game.lastFlipAt < RESOLVE_MIN_MS) throw new Error('too-early');
  } else {
    if (!mine) throw new Error('not-your-turn');
    if (action.type === 'FLIP' && !Number.isInteger(action.index)) throw new Error('bad-action');
  }
  const next = gameReducer(s, action.type === 'FLIP' ? { type: 'FLIP', index: action.index } : { type: action.type });
  if (next === s) throw new Error('illegal');
  return {
    ...game,
    state: next,
    lastFlipAt: action.type === 'FLIP' ? now : game.lastFlipAt,
    timeouts: action.type === 'RESOLVE' ? game.timeouts : { ...game.timeouts, [seat]: 0 },
  };
}

// 시간 초과: 지금 차례인 자리의 수를 자동으로 마무리한다. 연속 초과가 쌓이면 기권패.
export function applyTimeout(game) {
  let s = game.state;
  if (s.phase === 'over') throw new Error('over');
  const seat = seatOf(s.turn);
  if (s.phase === 'playing' && s.flipped.length === 2) s = resolveFlip(s);
  if (s.phase === 'gostop') s = gameReducer(s, { type: 'STOP' }); // 고/스톱을 못 정하면 스톱
  else if (s.phase === 'playing') s = skipTurn(s);
  const timeouts = { ...game.timeouts, [seat]: game.timeouts[seat] + 1 };
  if (s.phase !== 'over' && timeouts[seat] >= MAX_TIMEOUTS) s = forfeitGame(s, sideOf(seat));
  return { ...game, state: s, timeouts };
}

export function applyForfeit(game, seat) {
  if (game.state.phase === 'over') throw new Error('over');
  return { ...game, state: forfeitGame(game.state, sideOf(seat)) };
}

// 포인트 이동: 이긴 쪽이 판 점수 × 점당 포인트를 가져온다 (진 쪽 잔액이 모자라면 가진 만큼만).
export function settleMoney(result, balances) {
  if (!result || !result.winner) return { amount: 0, winnerSeat: null, balances };
  const winnerSeat = seatOf(result.winner);
  const loserSeat = otherSeat(winnerSeat);
  const amount = Math.max(0, Math.min(result.total * PVP_POINTS_PER_SCORE, balances[loserSeat]));
  return {
    amount,
    winnerSeat,
    balances: { ...balances, [winnerSeat]: balances[winnerSeat] + amount, [loserSeat]: balances[loserSeat] - amount },
  };
}

// 서버가 덱을 섞을 때 쓰는 예측 불가능한 난수 (시드로는 덱을 추측할 수 없다)
import { randomBytes } from 'node:crypto';
export const secureRng = () => randomBytes(4).readUInt32LE(0) / 2 ** 32;
