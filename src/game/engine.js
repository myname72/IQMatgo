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

// 엿보기: 쓴 사람이 모든 카드를 볼 수 있는 시간(밀리초). 화면에서 사용한다.
export const PEEK_VIEW_MS = 3000;

const other = (who) => (who === 'player' ? 'ai' : 'player');

// 시작할 때 판에 앞면으로 깔아 두는 카드 수 (먼저 시작하는 쪽이 불리하지 않도록 둘 다 본다)
export const START_OPEN = 4;

export function createGame(difficulty, rng = Math.random, first = 'player') {
  const dealt = shuffle([...HWATU_CARDS, ...ITEM_CARDS], rng).map((card) => ({ card, taken: false }));
  // 무작위 위치를 하나씩 넘기며 일반 카드 4장이 깔릴 때까지 진행하고, 그 사이에 나온 아이템 패는 효과 없이 선(사람)이 먹는다
  // (쌍피·쓰리피는 피로 계산)
  const startOpen = [];
  const startItems = [];
  const taken = new Set();
  const startSlots = []; // 시작 때 먹은 아이템과 그 칸 [{ item, slot }]
  const order = shuffle(dealt.map((_, k) => k), rng); // 판 위 무작위 위치에서 뽑는다
  for (const i of order) {
    if (startOpen.length >= START_OPEN) break;
    if (isItem(dealt[i].card)) {
      startItems.push(dealt[i].card);
      taken.add(i);
      startSlots.push({ item: dealt[i].card.item, slot: i });
    } else {
      startOpen.push(i);
    }
  }
  const deck = dealt.map((d, i) => (taken.has(i) ? { ...d, taken: true } : d));
  const openTurns = Math.max(REVEAL_TURNS[difficulty] ?? 0, 2); // 최소 한 사람당 한 턴은 볼 수 있다
  const state = {
    phase: 'playing', // playing | gostop | over
    difficulty,
    seed: Math.floor(rng() * 2 ** 31), // 판 위 카드의 흐트러진 배치용 (게임 중 고정)
    deck,
    rngCount: 0, // 아이템 효과용 난수 (seed로부터 결정적으로 만든다)
    itemEvent: null, // 마지막으로 발동한 아이템 { n, who, item }
    flipped: [],
    turn: first,
    turnEvent: { n: 1, to: first, reason: 'start' },
    tries: 0, // 이번 턴에 사용한 시도 횟수
    first, // 이번 판의 선
    startNote: startItems.length ? { who: first, items: startItems.map((c) => c.name) } : null, // 시작 때 선이 먹은 아이템 (화면 안내용)
    captured: first === 'player' ? { player: startItems, ai: [] } : { player: [], ai: startItems },
    lastHidden: [], // 방금 뒷면으로 돌아간 카드 위치 (판에서 반짝여 알려준다)
    revealed: startOpen, // 앞면으로 남아 있는 카드 위치 (시작 때 깔아 둔 카드 + 틀린 뒤 남은 카드)
    revealLeft: Object.fromEntries(startOpen.map((i) => [i, openTurns])), // 위치 -> 앞으로 앞면으로 남아 있을 턴 수
    memory: startOpen, // 최근에 공개된 (아직 남아있는) 카드 위치
    goCount: { player: 0, ai: 0 },
    lastGoScore: { player: 0, ai: 0 },
    pendingTurnEnd: null,
    rewardEvent: null,
    bonus: { player: 0, ai: 0 },
    turnMonths: [], // 이번 턴에 짝을 맞춰 먹은 월들 (폭탄 판정용, 턴이 넘어가면 비운다)
    message: first === 'player' ? `카드 ${START_OPEN}장이 앞면으로 깔려 있습니다. 당신의 턴입니다!` : `카드 ${START_OPEN}장이 앞면으로 깔려 있습니다. AI가 먼저 시작합니다.`,
    result: null,
  };
  // 시작 때 먹은 아이템도 눌렀을 때처럼 연출을 보여 준다. 여러 장이면 가장 효과가 큰 하나만 연출한다.
  // 엿보기는 효과가 실제로 발동하고, 쌍피·쓰리피는 이미 먹은 패에 들어 있으며, 섞기·초기화는 시작 판에서 바꿀 것이 없어 연출만 한다.
  const show = ['peek', 'tripi', 'ssangpi', 'shuffle', 'reset'].map((k) => startSlots.find((x) => x.item === k)).find(Boolean);
  if (show) state.itemEvent = { n: 1, who: first, item: show.item, index: show.slot, picks: [] };
  if (startSlots.some((x) => x.item === 'peek') && first === 'ai') state.memory = aiPeekMemory(state, rng);
  return state;
}

export const scoreOf = (state, who) => calculateScore(state.captured[who]) + (state.bonus?.[who] ?? 0);

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

// AI가 엿보기로 모든 카드를 본 뒤 기억하는 카드:
// 기억력 한도 안에서, 서로 짝이 되는 카드를 우선해서 기억한다.
// 엿보기로 볼 수 있는 카드: 지금 닫혀 있는 일반 카드(아이템 패 제외) 중 무작위 절반
export function peekSubset(state, rng) {
  const closed = [];
  state.deck.forEach((d, i) => {
    if (!d.taken && !isItem(d.card) && !state.flipped.includes(i) && !state.revealed.includes(i)) closed.push(i);
  });
  if (closed.length === 0) return [];
  return shuffle(closed, rng).slice(0, Math.max(1, Math.floor(closed.length / 2)));
}

function aiPeekMemory(state, rng) {
  const limit = MEMORY_LIMIT[state.difficulty];
  const byMonth = {};
  const seen = new Set(peekSubset(state, rng)); // AI도 사람과 같이 절반만 본다
  state.deck.forEach((d, i) => {
    if (seen.has(i)) (byMonth[d.card.month] ||= []).push(i);
  });
  const pairs = shuffle(Object.values(byMonth).filter((a) => a.length >= 2), rng);
  const learned = [];
  for (const idxs of pairs) {
    if (learned.length + 2 > limit) break;
    learned.push(idxs[0], idxs[1]);
  }
  return [...new Set([...state.memory, ...learned])].slice(-limit);
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
      return next;
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
      // 쓴 사람만 3초 동안 모든 카드를 본다. 화면 연출은 UI가 맡고, 엔진은 AI의 기억만 갱신한다.
      // (사람이 쓰면 사람이 눈으로 기억하므로 엔진 상태는 바뀌지 않는다.)
      if (who !== 'ai') return next;
      return { ...next, memory: aiPeekMemory(next, rng) };
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
    state.bonus?.[winner] ?? 0,
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
    return finishTurn({ ...state, flipped: [], revealed, revealLeft, lastHidden }, who, 'miss');
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

  // 보너스: 판쓸·쪽·폭탄은 상대의 피를 가져온다 (판쓸은 +1점도 더한다)
  const rewards = [];
  if (state.revealed.length > 0 && next.revealed.length === 0) rewards.push({ kind: 'sweep', label: '판쓸', pi: 1, bonus: 1 });
  if (!state.revealed.includes(i) && !state.revealed.includes(j)) rewards.push({ kind: 'jjok', label: '쪽', pi: 1 });
  // 폭탄: 한 턴에 같은 월 4장을 모두 먹었을 때 (같은 월 짝을 이번 턴에 두 번 맞춤)
  next.turnMonths = [...(state.turnMonths ?? []), a.month];
  if (next.turnMonths.filter((m) => m === a.month).length >= 2) rewards.push({ kind: 'bomb', label: '폭탄', pi: 2 });
  if (rewards.length) {
    const r = applyRewards(next, who, rewards);
    Object.assign(next, r.state, {
      message: `✨ ${rewards.map((x) => x.label).join('·')}! ${whoLabel(who)}이(가) ${r.stolen.length ? `상대의 피 ${r.stolen.length}장을 가져옵니다` : '보너스를 얻었습니다'}${r.bonus ? ` (+${r.bonus}점)` : ''}.`,
    });
  }

  // 아직 시도 기회가 남아 있으면 고/스톱은 묻지 않고 턴을 마저 한다
  if (next.tries < MAX_TRIES) return next;
  return finishTurn(next, who, 'tries');
}

// 보상 처리: 상대의 피 중 가치가 낮은 것부터(일반 피 → 쌍피 → 쓰리피) 가져온다
function applyRewards(state, who, rewards) {
  const foe = other(who);
  const want = rewards.reduce((n, r) => n + (r.pi ?? 0), 0);
  const bonus = rewards.reduce((n, r) => n + (r.bonus ?? 0), 0);
  const pool = state.captured[foe].filter((c) => c.piValue > 0).sort((x, y) => x.piValue - y.piValue);
  const stolen = pool.slice(0, want);
  const rewardEvent = { n: (state.rewardEvent?.n ?? 0) + 1, who, rewards, stolen: stolen.map((c) => ({ ...c })), bonus };
  return {
    stolen,
    bonus,
    state: {
      rewardEvent,
      bonus: { ...state.bonus, [who]: state.bonus[who] + bonus },
      captured: {
        ...state.captured,
        [foe]: state.captured[foe].filter((c) => !stolen.includes(c)),
        [who]: [...state.captured[who], ...stolen],
      },
    },
  };
}

// 턴이 끝나는 시점에 고/스톱 조건을 확인한다. 남은 카드가 적으면 묻지 않고 스톱한다.
function finishTurn(state, who, reason) {
  const score = scoreOf(state, who);
  const needed = Math.max(WIN_THRESHOLD, state.lastGoScore[who] + 1);
  if (score >= needed) {
    if (remainingNormal(state) <= AUTO_STOP_REMAINING) return finish(state, who, 'auto');
    return {
      ...state,
      phase: 'gostop',
      pendingTurnEnd: reason,
      message: `${whoLabel(who)}이(가) ${score}점! 고 또는 스톱?`,
    };
  }
  return passTurn(state, reason, reason !== 'miss');
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

// 상대에게 턴을 넘긴다. 틀린 경우(miss)는 열린 카드 처리를 이미 마쳤으므로 tick=false.
function passTurn(state, reason, tick = true) {
  const who = state.turn;
  let { revealed, revealLeft, lastHidden } = state;
  if (tick) {
    const t = tickReveal(state);
    revealed = t.revealed;
    revealLeft = t.revealLeft;
    lastHidden = t.hidden;
  }
  const message =
    reason === 'miss'
      ? who === 'player' ? '❌ 짝이 아닙니다. AI의 턴입니다.' : '당신의 턴입니다!'
      : who === 'player'
        ? `카드 ${MAX_FLIPS}장을 모두 열었습니다. AI의 턴입니다.`
        : `AI가 카드 ${MAX_FLIPS}장을 모두 열었습니다. 당신의 턴입니다!`;
  return {
    ...state,
    phase: 'playing',
    pendingTurnEnd: null,
    turnMonths: [],
    flipped: [],
    revealed,
    revealLeft,
    lastHidden,
    turn: other(who),
    turnEvent: turnEventOf(state, other(who), reason),
    tries: 0,
    message,
  };
}

// 고: 점수를 키워 두고 상대 차례로 넘어간다 (고/스톱은 턴이 끝날 때 묻는다).
export function declareGo(state) {
  if (state.phase !== 'gostop') return state;
  const who = state.turn;
  const goCount = state.goCount[who] + 1;
  const next = passTurn(
    {
      ...state,
      goCount: { ...state.goCount, [who]: goCount },
      lastGoScore: { ...state.lastGoScore, [who]: scoreOf(state, who) },
    },
    'go',
    state.pendingTurnEnd !== 'miss',
  );
  return {
    ...next,
    message: `${whoLabel(who)}이(가) ${goCount}고를 불렀습니다! ${who === 'player' ? 'AI' : '당신'}의 차례입니다.`,
  };
}

// 시간 초과: 고르던 카드를 덮고 상대에게 턴을 넘긴다 (사람 대전용)
export function skipTurn(state) {
  if (state.phase !== 'playing') return state;
  return passTurn({ ...state, flipped: [], lastHidden: [...state.flipped] }, 'timeout');
}

// 기권/이탈: loser 가 졌다. 이긴 쪽 점수는 최소 WIN_THRESHOLD점으로 쳐서, 지는 판을 끊고 나가는 게 이득이 되지 않게 한다.
export function forfeitGame(state, loser) {
  const winner = other(loser);
  const s = finish(state, winner, 'forfeit');
  return { ...s, result: { ...s.result, total: Math.max(WIN_THRESHOLD, s.result.total) } };
}

export function declareStop(state) {
  if (state.phase !== 'gostop') return state;
  return finish(state, state.turn, 'stop');
}

export function gameReducer(state, action) {
  switch (action.type) {
    case 'START':
      return createGame(action.difficulty, action.rng, action.first);
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
