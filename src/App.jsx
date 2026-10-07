import { useEffect, useReducer } from 'react';
import { RotateCcw, Trophy, Hand } from 'lucide-react';
import CardFace from './components/CardFace.jsx';
import { summarize, WIN_THRESHOLD } from './game/scoring.js';
import { KIND_LABEL, ribbonLabel } from './game/cards.js';
import {
  gameReducer,
  createGame,
  scoreOf,
  aiChooseFlip,
  aiDecideGoStop,
  MEMORY_LIMIT,
  MAX_FLIPS,
  REVEAL_LIMIT,
} from './game/engine.js';

const DIFFICULTIES = [
  { key: 'easy', label: '쉬움', cls: 'btn-easy' },
  { key: 'normal', label: '보통', cls: 'btn-normal' },
  { key: 'hard', label: '어려움', cls: 'btn-hard' },
];

function CapturedPanel({ title, cards, score, goCount }) {
  const s = summarize(cards);
  const groups = [
    ['gwang', s.gwang],
    ['animal', s.animals],
    ['ribbon', s.ribbons],
    ['pi', cards.filter((c) => c.kind === 'pi' || c.kind === 'ssangpi')],
  ];
  const tags = [
    s.godori && '고도리',
    s.hongdan && '홍단',
    s.cheongdan && '청단',
    s.chodan && '초단',
  ].filter(Boolean);
  return (
    <section className="captured">
      <header>
        <strong>{title}</strong>
        <span className="captured-score">{score}점{goCount > 0 && ` · ${goCount}고`}</span>
      </header>
      <div className="captured-counts">
        광 {s.gwang.length} · 열끗 {s.animals.length} · 띠 {s.ribbons.length} · 피 {s.piCount}
        {tags.length > 0 && <span className="tags"> ✦ {tags.join(' ')}</span>}
      </div>
      <div className="captured-cards">
        {groups.map(([kind, list]) =>
          list.map((c) => (
            <div className="mini" key={c.id} title={`${c.name} (${KIND_LABEL[c.kind]}${c.ribbon ? ' · ' + ribbonLabel(c.ribbon) : ''})`}>
              <CardFace card={c} compact />
            </div>
          )),
        )}
      </div>
    </section>
  );
}

function Menu({ onStart }) {
  return (
    <div className="screen menu-screen">
      <h1 className="title">화투 메모리 맞고</h1>
      <p className="subtitle">카드를 뒤집어 같은 월을 찾고, 맞고 규칙으로 점수를 겨루세요!</p>
      <div className="row">
        {DIFFICULTIES.map((d) => (
          <button key={d.key} className={`btn ${d.cls}`} onClick={() => onStart(d.key)}>
            <span>{d.label}</span>
            <small>(AI 기억력: {MEMORY_LIMIT[d.key]}장{REVEAL_LIMIT[d.key] > 0 && ` · 틀린 카드 ${REVEAL_LIMIT[d.key]}장 유지`})</small>
          </button>
        ))}
      </div>
      <div className="rules">
        <h3>게임 규칙</h3>
        <p>• 화투 48장 중 같은 월 2장을 뒤집어 맞추면 가져가고 한 번 더 뒤집을 수 있습니다. 틀리거나, 한 턴에 카드 4장(2번 시도)을 모두 열면 맞췄어도 상대 차례입니다.</p>
        <p>• 쉬움 난이도에서는 틀린 카드가 최근 6장까지 앞면으로 남아 있고, 앞면인 카드도 다시 골라 짝을 맞출 수 있습니다.</p>
        <p>• 광 3점(비광 포함 2점)·4광 4점·5광 15점, 고도리 5점, 홍단·청단·초단 각 3점</p>
        <p>• 열끗·띠는 5장부터 1점(이후 1장당 +1), 피는 10장부터 1점(쌍피는 2장으로 계산)</p>
        <p>• {WIN_THRESHOLD}점 이상이 되면 <b>고</b>(계속) 또는 <b>스톱</b>(종료)을 선택합니다. 고를 부른 뒤에는 점수가 더 올라야 다시 선택할 수 있습니다.</p>
        <p>• 1고 +1, 2고 +2, 3고부터는 점수가 2배씩! 피박·광박이면 각각 2배</p>
        <p>• 모든 카드를 가져갔는데 {WIN_THRESHOLD}점 이상이 없으면 나가리(무승부)</p>
      </div>
    </div>
  );
}

function appReducer(state, action) {
  if (action.type === 'MENU') return null;
  if (action.type === 'START') return createGame(action.difficulty);
  if (state === null) return state;
  return gameReducer(state, action);
}

// state === null 이면 메뉴 화면
export default function App() {
  const [state, send] = useReducer(appReducer, null);
  return <Game state={state} send={send} />;
}

function Game({ state, send }) {
  useEffect(() => {
    if (!state || state.phase === 'over') return undefined;
    let id;
    if (state.phase === 'playing' && state.flipped.length === 2) {
      id = setTimeout(() => send({ type: 'RESOLVE' }), 900);
    } else if (state.phase === 'playing' && state.turn === 'ai') {
      id = setTimeout(() => {
        const index = aiChooseFlip(state);
        if (index !== null) send({ type: 'FLIP', index });
      }, 700);
    } else if (state.phase === 'gostop' && state.turn === 'ai') {
      id = setTimeout(
        () => send({ type: aiDecideGoStop(state) === 'go' ? 'GO' : 'STOP' }),
        1400,
      );
    }
    return () => clearTimeout(id);
  }, [state, send]);

  if (!state) {
    return <Menu onStart={(difficulty) => send({ type: 'START', difficulty })} />;
  }

  const playerScore = scoreOf(state, 'player');
  const aiScore = scoreOf(state, 'ai');
  const canClick = state.phase === 'playing' && state.turn === 'player' && state.flipped.length < 2;

  if (state.phase === 'over') {
    const r = state.result;
    return (
      <div className="screen over-screen">
        <h2 className="over-title">{state.message}</h2>
        {r.winner && (
          <p className="breakdown">
            기본 {r.base}점{r.goCount > 0 && ` · ${r.goCount}고`}
            {r.pibak && ' · 피박 ×2'}
            {r.gwangbak && ' · 광박 ×2'} → <b>{r.total}점</b>
          </p>
        )}
        <div className="final-scores">
          <div><span>플레이어</span><b>{playerScore}점</b></div>
          <div><span>AI</span><b>{aiScore}점</b></div>
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={() => send({ type: 'START', difficulty: state.difficulty })}>
            <RotateCcw size={18} /> <span>다시 하기</span>
          </button>
          <button className="btn btn-normal" onClick={() => send({ type: 'MENU' })}>
            <span>메뉴로</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen game-screen">
      <div className="game-header">
        <div className="turn-indicator">
          {state.turn === 'player' ? '🎮 당신의 턴' : '🤖 AI의 턴'}
          <span className="tries"> · 카드 {state.tries * 2 + state.flipped.length}/{MAX_FLIPS}장 오픈</span>
        </div>
        <button className="btn btn-primary" onClick={() => send({ type: 'MENU' })}>
          <RotateCcw size={18} /> <span>메뉴로</span>
        </button>
      </div>

      <div className="message-box" role="status" aria-live="polite">{state.message}</div>

      <CapturedPanel title="AI" cards={state.captured.ai} score={aiScore} goCount={state.goCount.ai} />

      <div className="cards-grid">
        {state.deck.map((slot, index) => {
          const selected = state.flipped.includes(index);
          const faceUp = slot.taken || selected || state.revealed.includes(index);
          return (
            <button
              key={slot.card.id}
              type="button"
              className={`card ${faceUp ? 'flipped' : ''} ${slot.taken ? 'taken' : ''} ${selected ? 'selected' : ''}`}
              onClick={() => send({ type: 'FLIP', index })}
              disabled={!canClick || slot.taken || selected}
              aria-label={faceUp ? `${slot.card.month}월 ${slot.card.name}` : '뒤집지 않은 카드'}
            >
              <span className="card-inner">
                <span className="card-back"><span className="card-pattern" /></span>
                <span className="card-front"><CardFace card={slot.card} /></span>
              </span>
            </button>
          );
        })}
      </div>

      <CapturedPanel title="플레이어" cards={state.captured.player} score={playerScore} goCount={state.goCount.player} />

      {state.phase === 'gostop' && state.turn === 'player' && (
        <div className="gostop-overlay" role="dialog" aria-label="고 또는 스톱">
          <div className="gostop-box">
            <h3>{playerScore}점! 고 또는 스톱?</h3>
            <p>고를 부르면 계속 진행하고 점수가 올라야 다시 선택할 수 있습니다.</p>
            <div className="row">
              <button className="btn go-button" onClick={() => send({ type: 'GO' })}>
                <Hand size={20} /> <span>고 ({state.goCount.player + 1}고)</span>
              </button>
              <button className="btn btn-easy" onClick={() => send({ type: 'STOP' })}>
                <Trophy size={20} /> <span>스톱</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
