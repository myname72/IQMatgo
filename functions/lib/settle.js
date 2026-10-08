import { createGame, gameReducer } from '../game/engine.js';
import { seededRng } from '../game/rng.js';

// ---- 포인트 규칙 (여기 숫자만 바꾸면 된다) ----
export const START_POINTS = 100_000; // 처음 가입할 때 받는 포인트
export const PVP_MIN_ENTRY = 3_000; // 사람 대전에 들어가려면 필요한 최소 보유 포인트
export const PVP_POINTS_PER_SCORE = 100; // 사람 대전: 판 점수 1점당 이동하는 포인트
export const POINTS_PER_SCORE = 100; // 판 점수 1점당 포인트
export const AI_REWARD_RATE = 0.5; // AI 대전은 이긴 점수의 이 비율만 받는다 (져도 감점 없음)
export const DAILY_AI_CAP = 3000; // 하루에 AI 대전으로 받을 수 있는 최대 포인트
export const MIN_PLAY_MS = 20_000; // 이보다 빨리 끝난 판은 인정하지 않는다
export const MAX_ACTIONS = 4000;

const ALLOWED = new Set(['FLIP', 'RESOLVE', 'GO', 'STOP']);

// 서버가 발급한 시드로 판을 처음부터 재생해 결과를 직접 계산한다.
// 클라이언트가 "이겼다"고 주장하는 값은 쓰지 않는다.
export function replayGame({ difficulty, seed, first, actions }) {
  if (!Array.isArray(actions) || actions.length === 0 || actions.length > MAX_ACTIONS) throw new Error('bad-actions');
  let state = createGame(difficulty, seededRng(seed), first);
  for (const a of actions) {
    if (!a || !ALLOWED.has(a.type)) throw new Error('bad-action');
    if (a.type === 'FLIP' && !Number.isInteger(a.index)) throw new Error('bad-action');
    state = gameReducer(state, a.type === 'FLIP' ? { type: 'FLIP', index: a.index } : { type: a.type });
  }
  if (state.phase !== 'over') throw new Error('not-finished');
  return state.result; // { winner: 'player' | 'ai' | null, total, ... }
}

// 한 판의 포인트 (이겼을 때만, 일일 상한 안에서)
export function rewardFor(result, earnedToday) {
  if (result.winner !== 'player') return 0;
  const raw = Math.floor(result.total * POINTS_PER_SCORE * AI_REWARD_RATE);
  return Math.max(0, Math.min(raw, DAILY_AI_CAP - earnedToday));
}

// 한국 날짜 기준으로 하루를 센다
export const todayKst = (now = Date.now()) => new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
