import { HWATU_CARDS, shuffle } from './cards.js';
import { calculateScore, finalPayout, WIN_THRESHOLD } from './scoring.js';

// AI가 기억하는 카드 수 (난이도)
export const MEMORY_LIMIT = { easy: 4, normal: 8, hard: 14 };

const other = (who) => (who === 'player' ? 'ai' : 'player');

export function createGame(difficulty, rng = Math.random) {
  return {
    phase: 'playing', // playing | gostop | over
    difficulty,
    deck: shuffle(HWATU_CARDS, rng).map((card) => ({ card, taken: false })),
    flipped: [],
    turn: 'player',
    captured: { player: [], ai: [] },
    memory: [], // 최근에 공개된 (아직 남아있는) 카드 위치
    goCount: { player: 0, ai: 0 },
    lastGoScore: { player: 0, ai: 0 },
    message: '당신의 턴입니다. 카드 2장을 뒤집으세요!',
    result: null,
  };
}

export const scoreOf = (state, who) => calculateScore(state.captured[who]);

const whoLabel = (who) => (who === 'player' ? '당신' : 'AI');

function remember(state, index) {
  const limit = MEMORY_LIMIT[state.difficulty];
  const memory = state.memory.filter((i) => i !== index);
  memory.push(index);
  return memory.slice(-limit);
}

export function flipCard(state, index) {
  const slot = state.deck[index];
  if (state.phase !== 'playing' || !slot || slot.taken) return state;
  if (state.flipped.length >= 2 || state.flipped.includes(index)) return state;
  return {
    ...state,
    flipped: [...state.flipped, index],
    memory: remember(state, index), // 누가 뒤집든 AI는 본 카드를 기억한다
  };
}

function finish(state, winner, how) {
  if (!winner) {
    return {
      ...state,
      phase: 'over',
      result: { winner: null },
      message: '🤝 나가리! 승부가 나지 않았습니다.',
    };
  }
  const payout = finalPayout(
    state.captured[winner],
    state.captured[other(winner)],
    state.goCount[winner],
  );
  return {
    ...state,
    phase: 'over',
    result: { winner, ...payout, how },
    message:
      winner === 'player'
        ? `🎉 승리! ${payout.total}점을 얻었습니다.`
        : `😢 패배... AI가 ${payout.total}점을 얻었습니다.`,
  };
}

function settleEnd(state) {
  const p = scoreOf(state, 'player');
  const a = scoreOf(state, 'ai');
  const pOk = p >= WIN_THRESHOLD;
  const aOk = a >= WIN_THRESHOLD;
  if (!pOk && !aOk) return finish(state, null);
  if (pOk && !aOk) return finish(state, 'player', 'end');
  if (aOk && !pOk) return finish(state, 'ai', 'end');
  if (p === a) return finish(state, null);
  return finish(state, p > a ? 'player' : 'ai', 'end');
}

// 뒤집은 두 장 판정
export function resolveFlip(state) {
  if (state.phase !== 'playing' || state.flipped.length !== 2) return state;
  const [i, j] = state.flipped;
  const a = state.deck[i].card;
  const b = state.deck[j].card;
  const who = state.turn;

  if (a.month !== b.month) {
    return {
      ...state,
      flipped: [],
      turn: other(who),
      message: who === 'player' ? '❌ 짝이 아닙니다. AI의 턴입니다.' : '당신의 턴입니다!',
    };
  }

  const deck = state.deck.map((s, k) => (k === i || k === j ? { ...s, taken: true } : s));
  const next = {
    ...state,
    deck,
    flipped: [],
    memory: state.memory.filter((k) => k !== i && k !== j),
    captured: { ...state.captured, [who]: [...state.captured[who], a, b] },
  };
  next.message = `🎯 ${whoLabel(who)}이(가) ${a.month}월 짝을 맞췄습니다!`;

  if (next.deck.every((s) => s.taken)) return settleEnd(next);

  const score = scoreOf(next, who);
  const needed = Math.max(WIN_THRESHOLD, next.lastGoScore[who] + 1);
  if (score >= needed) {
    return { ...next, phase: 'gostop', message: `${whoLabel(who)}이(가) ${score}점! 고 또는 스톱?` };
  }
  return next;
}

export function declareGo(state) {
  if (state.phase !== 'gostop') return state;
  const who = state.turn;
  return {
    ...state,
    phase: 'playing',
    goCount: { ...state.goCount, [who]: state.goCount[who] + 1 },
    lastGoScore: { ...state.lastGoScore, [who]: scoreOf(state, who) },
    message: `${whoLabel(who)}이(가) ${state.goCount[who] + 1}고를 불렀습니다! 계속 진행합니다.`,
  };
}

export function declareStop(state) {
  if (state.phase !== 'gostop') return state;
  return finish(state, state.turn, 'stop');
}

export function gameReducer(state, action) {
  switch (action.type) {
    case 'START':
      return createGame(action.difficulty, action.rng);
    case 'FLIP':
      return flipCard(state, action.index);
    case 'RESOLVE':
      return resolveFlip(state);
    case 'GO':
      return declareGo(state);
    case 'STOP':
      return declareStop(state);
    default:
      return state;
  }
}

// ---- AI ----

const hidden = (state) =>
  state.deck.map((s, i) => (s.taken ? -1 : i)).filter((i) => i >= 0);

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

export function aiChooseFlip(state, rng = Math.random) {
  const open = hidden(state).filter((i) => !state.flipped.includes(i));
  if (open.length === 0) return null;
  const known = state.memory.filter((i) => open.includes(i));
  const monthOf = (i) => state.deck[i].card.month;

  if (state.flipped.length === 0) {
    // 기억 속에 짝이 있으면 우선 선택
    for (const i of known) {
      if (known.some((j) => j !== i && monthOf(j) === monthOf(i))) return i;
    }
  } else {
    const first = state.flipped[0];
    const match = known.find((j) => monthOf(j) === monthOf(first));
    if (match !== undefined) return match;
  }

  // 모르는 카드를 우선 선택 (이미 본 카드를 또 뒤집는 낭비를 피함)
  const unknown = open.filter((i) => !known.includes(i));
  return pick(unknown.length > 0 ? unknown : open, rng);
}

export function aiDecideGoStop(state, rng = Math.random) {
  const me = scoreOf(state, 'ai');
  const you = scoreOf(state, 'player');
  const goCount = state.goCount.ai;
  const remaining = hidden(state).length;
  if (state.difficulty === 'easy') return 'stop';
  const limit = state.difficulty === 'hard' ? 2 : 1;
  const comfortable = me - you >= 4 && remaining >= 12;
  return goCount < limit && comfortable && rng() < 0.7 ? 'go' : 'stop';
}
