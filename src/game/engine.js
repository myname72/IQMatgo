import { HWATU_CARDS, ITEM_CARDS, ITEM_INFO, shuffle } from './cards.js';
import { calculateScore, finalPayout, WIN_THRESHOLD } from './scoring.js';

// AI가 기억하는 카드 수 (난이도)
export const MEMORY_LIMIT = { easy: 4, normal: 8, hard: 14 };

// 틀린 카드를 앞면으로 유지하는 턴 수 (쉬움에서만). 사람과 AI의 턴을 모두 센다.
export const REVEAL_TURNS = { easy: 5, normal: 0, hard: 0 };

// 한 턴에 열 수 있는 카드는 최대 4장 (= 2장씩 2번 시도, 맞춰도 소모)
export const MAX_FLIPS = 4;

// 남은 카드가 이 장수 이하일 때 고/스톱 조건이 되면 묻지 않고 바로 스톱한다
export const AUTO_STOP_REMAINING = 4;
export const MAX_TRIES = MAX_FLIPS / 2;

// 엿보기로 공개된 카드가 유지되는 턴 수
export const PEEK_TURNS = 5;

const other = (who) => (who === 'player' ? 'ai' : 'player');

export function createGame(difficulty, rng = Math.random) {
  return {
    phase: 'playing', // playing | gostop | over
    difficulty,
    seed: Math.floor(rng() * 2 ** 31), // 판 위 카드의 흐트러진 배치용 (게임 중 고정)
    deck: shuffle([...HWATU_CARDS, ...ITEM_CARDS], rng).map((card) => ({ card, taken: false })),
    rngCount: 0, // 아이템 효과용 난수 (seed로부터 결정적으로 만든다)
    itemEvent: null, // 마지막으로 발동한 아이템 { n, who, item }
    flipped: [],
    turn: 'player',
    turnEvent: { n: 1, to: 'player', reason: 'start' },
    tries: 0, // 이번 턴에 사용한 시도 횟수
    captured: { player: [], ai: [] },
    lastHidden: [], // 방금 뒷면으로 돌아간 카드 위치 (판에서 반짝여 알려준다)
    revealed: [], // 틀린 뒤에도 앞면으로 남아 있는 카드 위치
    revealLeft: {}, // 위치 -> 앞으로 앞면으로 남아 있을 턴 수
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

// 턴이 넘어갈 때마다 화면에 "누구 차례인지" 알리기 위한 기록
// reason: start(시작) | miss(짝 못 맞춤) | tries(4장을 모두 엶) | go(고를 부름)
const turnEventOf = (state, to, reason) => ({ n: (state.turnEvent?.n ?? 0) + 1, to, reason });

const isItem = (card) => card.kind === 'item';
const remainingNormal = (state) => state.deck.filter((d) => !d.taken && !isItem(d.card)).length;

// 리듀서를 순수하게 유지하기 위해 seed와 사용 횟수로 결정적인 난수를 만든다
function rngFor(state) {
  let a = (state.seed + Math.imul(state.rngCount, 0x9e3779b9)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 남은 카드(앞면으로 열린 것 포함)의 위치를 무작위로 바꾼다
function shuffleBoard(state, rng) {
  const positions = state.deck.map((d, i) => (d.taken ? -1 : i)).filter((i) => i >= 0);
  const order = shuffle(positions, rng); // order[k] = positions[k] 자리로 옮겨 갈 카드의 옛 위치
  const deck = [...state.deck];
  const moved = {};
  positions.forEach((pos, k) => {
    deck[pos] = state.deck[order[k]];
    moved[order[k]] = pos;
  });
  const to = (i) => moved[i] ?? i;
  return {
    ...state,
    deck,
    flipped: state.flipped.map(to),
    revealed: state.revealed.map(to),
    revealLeft: Object.fromEntries(Object.entries(state.revealLeft).map(([k, v]) => [to(+k), v])),
    lastHidden: [],
    memory: [], // 위치가 바뀌었으니 AI의 기억도 소용없다
  };
}

// 아이템 패를 뒤집었을 때: 그 자리에서 효과가 발동하고, 시도 횟수는 쓰지 않는다.
function useItem(state, index) {
  const card = state.deck[index].card;
  const who = state.turn;
  const rng = rngFor(state);
  let next = {
    ...state,
    deck: state.deck.map((d, i) => (i === index ? { ...d, taken: true } : d)),
    rngCount: state.rngCount + 1,
    itemEvent: { n: (state.itemEvent?.n ?? 0) + 1, who, item: card.item, index, picks: [] }, // index: 아이템 카드가 있던 칸
  };
  const info = ITEM_INFO[card.item];
  next.message = `${whoLabel(who)}이(가) ${info.title} 카드를 뒤집었습니다! ${info.desc}`;

  switch (card.item) {
    case 'ssangpi':
    case 'tripi':
      next = { ...next, captured: { ...next.captured, [who]: [...next.captured[who], card] } };
      return checkGoStop(next, who, false);
    case 'shuffle':
      return shuffleBoard(next, rng);
    case 'reset':
      return {
        ...next,
        lastHidden: [...state.revealed],
        revealed: [],
        revealLeft: {},
        memory: [],
      };
    case 'peek': {
      const candidates = next.deck
        .map((d, i) => (d.taken || isItem(d.card) || next.revealed.includes(i) || next.flipped.includes(i) ? -1 : i))
        .filter((i) => i >= 0);
      const picks = shuffle(candidates, rng).slice(0, 2);
      return {
        ...next,
        itemEvent: { ...next.itemEvent, picks },
        revealed: [...next.revealed, ...picks],
        revealLeft: { ...next.revealLeft, ...Object.fromEntries(picks.map((i) => [i, PEEK_TURNS])) },
      };
    }
    default:
      return next;
  }
}

export function flipCard(state, index) {
  const slot = state.deck[index];
  if (state.phase !== 'playing' || !slot || slot.taken) return state;
  // 앞면으로 남아 있는(revealed) 카드도 다시 선택할 수 있다
  if (state.flipped.length >= 2 || state.flipped.includes(index)) return state;
  if (isItem(slot.card)) return useItem(state, index);
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
    // 턴이 넘어가므로 기존에 열려 있던 카드의 남은 턴을 하나 줄이고,
    // 방금 틀린 두 장은 새로 정해진 턴 수만큼 앞면으로 유지한다.
    const turns = REVEAL_TURNS[state.difficulty];
    const { revealed, revealLeft, hidden } = tickReveal(state, [i, j]);
    if (turns) {
      for (const k of [i, j]) {
        revealLeft[k] = turns;
        if (!revealed.includes(k)) revealed.push(k);
      }
    }
    const lastHidden = [...new Set([...hidden, ...(turns ? [] : [i, j])])];
    return {
      ...state,
      flipped: [],
      revealed,
      revealLeft,
      lastHidden,
      turn: other(who),
      turnEvent: turnEventOf(state, other(who), 'miss'),
      tries: 0,
      message: who === 'player' ? '❌ 짝이 아닙니다. AI의 턴입니다.' : '당신의 턴입니다!',
    };
  }

  const deck = state.deck.map((s, k) => (k === i || k === j ? { ...s, taken: true } : s));
  const next = {
    ...state,
    deck,
    flipped: [],
    tries: state.tries + 1,
    lastHidden: [],
    revealed: state.revealed.filter((k) => k !== i && k !== j),
    revealLeft: Object.fromEntries(Object.entries(state.revealLeft).filter(([k]) => +k !== i && +k !== j)),
    memory: state.memory.filter((k) => k !== i && k !== j),
    captured: { ...state.captured, [who]: [...state.captured[who], a, b] },
  };
  next.message = `🎯 ${whoLabel(who)}이(가) ${a.month}월 짝을 맞췄습니다!`;

  if (remainingNormal(next) === 0) return settleEnd(next);

  return checkGoStop(next, who, true);
}

// 점수가 고/스톱 조건에 닿았는지 확인한다. 남은 카드가 적으면 묻지 않고 스톱한다.
function checkGoStop(next, who, endTurn) {
  const score = scoreOf(next, who);
  const needed = Math.max(WIN_THRESHOLD, next.lastGoScore[who] + 1);
  if (score >= needed) {
    if (remainingNormal(next) <= AUTO_STOP_REMAINING) return finish(next, who, 'auto');
    return { ...next, phase: 'gostop', message: `${whoLabel(who)}이(가) ${score}점! 고 또는 스톱?` };
  }
  return endTurn ? endTurnIfOutOfTries(next) : next;
}

// 턴이 넘어갈 때: 열려 있는 카드의 남은 턴을 하나씩 줄이고 0이 되면 뒷면으로 돌린다
function tickReveal(state, skip = []) {
  const revealed = [];
  const revealLeft = {};
  const hidden = [];
  for (const k of state.revealed) {
    if (skip.includes(k)) continue; // 이번에 다시 틀린 카드는 새로 정해진다
    const left = (state.revealLeft[k] ?? 1) - 1;
    if (left > 0) {
      revealed.push(k);
      revealLeft[k] = left;
    } else {
      hidden.push(k);
    }
  }
  return { revealed, revealLeft, hidden };
}

// 맞춰서 턴이 이어지더라도 시도 횟수를 다 쓰면 상대에게 넘어간다
function endTurnIfOutOfTries(state) {
  if (state.tries < MAX_TRIES) return state;
  const who = state.turn;
  const { revealed, revealLeft, hidden } = tickReveal(state);
  return {
    ...state,
    revealed,
    revealLeft,
    lastHidden: hidden,
    turn: other(who),
    turnEvent: turnEventOf(state, other(who), 'tries'),
    tries: 0,
    message:
      who === 'player'
        ? `카드 ${MAX_FLIPS}장을 모두 열었습니다. AI의 턴입니다.`
        : `AI가 카드 ${MAX_FLIPS}장을 모두 열었습니다. 당신의 턴입니다!`,
  };
}

// 고: 점수를 키워 두고 상대 차례로 넘어간다.
// 짝을 맞추는 도중(첫 카드만 고른 상태)에 아이템으로 고/스톱이 된 경우, 고른 카드는 도로 덮는다.
export function declareGo(state) {
  if (state.phase !== 'gostop') return state;
  const who = state.turn;
  const { revealed, revealLeft, hidden } = tickReveal(state); // 턴이 넘어가므로 열린 카드의 남은 턴도 줄어든다
  const goCount = state.goCount[who] + 1;
  return {
    ...state,
    phase: 'playing',
    goCount: { ...state.goCount, [who]: goCount },
    lastGoScore: { ...state.lastGoScore, [who]: scoreOf(state, who) },
    flipped: [],
    revealed,
    revealLeft,
    lastHidden: [...hidden, ...state.flipped],
    turn: other(who),
    turnEvent: turnEventOf(state, other(who), 'go'),
    tries: 0,
    message: `${whoLabel(who)}이(가) ${goCount}고를 불렀습니다! ${who === 'player' ? 'AI' : '당신'}의 차례입니다.`,
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
  // 기억 + 화면에 앞면으로 남아 있는 카드는 모두 아는 카드로 취급한다
  const known = [...new Set([...state.memory, ...state.revealed])].filter((i) => open.includes(i));
  const monthOf = (i) => state.deck[i].card.month;

  if (state.flipped.length === 0) {
    // 기억 속에 짝이 있으면 우선 선택
    for (const i of known) {
      if (monthOf(i) !== 0 && known.some((j) => j !== i && monthOf(j) === monthOf(i))) return i;
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
