// 사람 대전용 상태 변환. 서버(Cloud Functions)와 클라이언트가 함께 쓴다.
// 서버는 전체 상태(덱 포함)를 비공개로 들고 있고, 클라이언트에는 "보이는 것만" 담긴 공개 상태를 내려 준다.

import { peekSubset } from './engine.js';

const HIDDEN = (index) => ({ id: `hidden-${index}`, month: 0, kind: 'hidden', name: '' });

// 공개 상태: 먹은 카드·뒤집어 둔 카드·앞면으로 남은 카드의 정체만 남기고 나머지는 가린다.
export function publicView(state, layoutSeed) {
  const visible = new Set([...state.flipped, ...state.revealed]);
  return {
    ...state,
    seed: layoutSeed, // 판 배치용 값. 실제 덱을 만든 난수 시드는 내보내지 않는다.
    memory: [],
    deck: state.deck.map((slot, i) => (slot.taken || visible.has(i) ? slot : { card: HIDDEN(i), taken: false })),
  };
}

const flip = (side) => (side === 'player' ? 'ai' : side === 'ai' ? 'player' : side);
const swapPair = (o) => (o ? { player: o.ai, ai: o.player } : o);

// 두 번째 자리(B)의 눈으로 본 상태: player/ai 를 맞바꿔서, 화면은 늘 "내가 player"로 그린다.
export function swapSides(view) {
  const v = { ...view };
  v.captured = swapPair(view.captured);
  v.goCount = swapPair(view.goCount);
  v.lastGoScore = swapPair(view.lastGoScore);
  v.bonus = swapPair(view.bonus);
  v.turn = flip(view.turn);
  v.first = flip(view.first);
  if (view.turnEvent) v.turnEvent = { ...view.turnEvent, to: flip(view.turnEvent.to) };
  if (view.itemEvent) v.itemEvent = { ...view.itemEvent, who: flip(view.itemEvent.who) };
  if (view.rewardEvent) v.rewardEvent = { ...view.rewardEvent, who: flip(view.rewardEvent.who) };
  if (view.result) v.result = { ...view.result, winner: flip(view.result.winner) };
  return v;
}

// 엿보기: 쓴 사람에게만 보내는 정보. 닫혀 있는 일반 카드의 무작위 절반만 보내고, 아이템 패는 보내지 않는다.
export function peekCardsOf(state, rng = Math.random) {
  const out = {};
  for (const i of peekSubset(state, rng)) out[i] = state.deck[i].card;
  return out;
}
