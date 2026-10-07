import { useEffect, useReducer } from 'react';
import { RotateCcw, Trophy, Hand } from 'lucide-react';
import CardFace from './components/CardFace.jsx';
import { WIN_THRESHOLD, scoreItems } from './game/scoring.js';
import {
  gameReducer,
  createGame,
  scoreOf,
  aiChooseFlip,
  aiDecideGoStop,
  MEMORY_LIMIT,
  MAX_FLIPS,
  AUTO_STOP_REMAINING,
  REVEAL_TURNS,
} from './game/engine.js';

const DIFFICULTIES = [
  { key: 'easy', label: '쉬움', cls: 'btn-easy' },
  { key: 'normal', label: '보통', cls: 'btn-normal' },
  { key: 'hard', label: '어려움', cls: 'btn-hard' },
];

// 게임마다 고정된 0~1 난수 (카드 위치별)
function hash01(seed, i, k) {
  let x = Math.imul(seed ^ Math.imul(i + 1, 374761393) ^ Math.imul(k + 1, 668265263), 2246822519);
  x ^= x >>> 13;
  x = Math.imul(x, 3266489917);
  x ^= x >>> 16;
  return (x >>> 0) / 2 ** 32;
}

// 먹은 패: 1줄에 광·열끗·띠(종류별로 묶어 간격을 두고), 2줄에 피. 같은 줄·같은 종류는 가로로 겹쳐 쌓는다.
function CapturedRow({ groups, className }) {
  const filled = groups.filter((g) => g.length > 0);
  const n = filled.reduce((sum, g) => sum + g.length, 0);
  const style = { '--g': Math.max(filled.length, 1), '--k': Math.max(n - filled.length, 1) };
  return (
    <div className={`captured-row ${className}`} style={style}>
      {filled.map((g) =>
        g.map((c, i) => (
          <div className={`mini ${i > 0 ? 'joint' : 'gap'}`} key={c.id} title={c.name}>
            <CardFace card={c} />
          </div>
        )),
      )}
    </div>
  );
}

function CapturedPanel({ title, cards, score, goCount }) {
  const pick = (kind) => cards.filter((c) => c.kind === kind);
  const pi = cards.filter((c) => c.kind === 'pi' || c.kind === 'ssangpi');
  const piCount = pi.reduce((sum, c) => sum + c.piValue, 0); // 쌍피는 2장
  const items = scoreItems(cards);
  const piItem = items.find((item) => item.key === 'pi');
  return (
    <section className="captured" aria-label={`${title}이(가) 먹은 패`}>
      <header>
        <strong>{title}</strong>
        <span className={`pi-count ${piCount >= 10 ? 'enough' : ''}`} aria-label={`피 ${piCount}장`}>
          피 {piCount}{piItem && ` +${piItem.points}`}
        </span>
        <div className="captured-chips" aria-label="점수 조합">
          {items.filter((item) => item.key !== 'pi').map((item) => (
            <span className="chip" key={item.key}>{item.label} +{item.points}</span>
          ))}
        </div>
        <span className="captured-score">{score}점{goCount > 0 && ` · ${goCount}고`}</span>
      </header>
      <div className="captured-rows">
        <CapturedRow groups={[pick('gwang'), pick('animal'), pick('ribbon')]} className="row-upper" />
        <CapturedRow groups={[pi]} className="row-pi" />
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
            <small>(AI 기억력: {MEMORY_LIMIT[d.key]}장{REVEAL_TURNS[d.key] > 0 && ` · 틀린 카드 ${REVEAL_TURNS[d.key]}턴 유지`})</small>
          </button>
        ))}
      </div>
      <div className="rules">
        <h3>게임 규칙</h3>
        <p>• 화투 48장 중 같은 월 2장을 뒤집어 맞추면 가져가고 한 번 더 뒤집을 수 있습니다. 틀리거나, 한 턴에 카드 4장(2번 시도)을 모두 열면 맞췄어도 상대 차례입니다.</p>
        <p>• 쉬움 난이도에서는 틀린 카드가 5턴(사람과 AI의 턴을 모두 셉니다) 동안 앞면으로 남아 있고, 앞면인 카드도 다시 골라 짝을 맞출 수 있습니다. 카드 모서리의 숫자는 남은 턴이고, 점선 테두리 카드는 이번 턴이 끝나면 뒷면으로 돌아갑니다.</p>
        <p>• 광 3점(비광 포함 2점)·4광 4점·5광 15점, 고도리 5점, 홍단·청단·초단 각 3점</p>
        <p>• 열끗·띠는 5장부터 1점(이후 1장당 +1), 피는 10장부터 1점(쌍피는 2장으로 계산)</p>
        <p>• {WIN_THRESHOLD}점 이상이 되면 <b>고</b>(계속) 또는 <b>스톱</b>(종료)을 선택합니다. 고를 부른 뒤에는 점수가 더 올라야 다시 선택할 수 있습니다.</p>
        <p>• 1고 +1, 2고 +2, 3고부터는 점수가 2배씩! 피박·광박이면 각각 2배</p>
        <p>• 모든 카드를 가져갔는데 {WIN_THRESHOLD}점 이상이 없으면 나가리(무승부)</p>
      </div>
      <p className="credits">
        카드 그림 출처:{' '}
        <a href="https://namu.wiki/w/%ED%99%94%ED%88%AC/%ED%8C%A8" target="_blank" rel="noreferrer">나무위키 「화투/패」</a>
      </p>
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
  // 다음에 틀리면 뒷면으로 돌아갈 카드 (가장 오래된 것부터)
  // 이번 턴이 끝나면 뒷면으로 돌아갈 카드 (남은 턴이 1)
  const dropping = new Set(state.revealed.filter((i) => state.revealLeft[i] === 1));
  const canClick = state.phase === 'playing' && state.turn === 'player' && state.flipped.length < 2;

  if (state.phase === 'over') {
    const r = state.result;
    const winnerName = r.winner === 'player' ? '내' : 'AI의';
    return (
      <div className="screen over-screen">
        <h2 className="over-title">{state.message}</h2>
        {r.winner && (
          <p className="over-how">
            {r.how === 'stop'
              ? `${r.winner === 'player' ? '내가' : 'AI가'} 스톱을 선언했습니다`
              : r.how === 'auto'
                ? `남은 카드가 ${AUTO_STOP_REMAINING}장 이하여서 ${r.winner === 'player' ? '내가' : 'AI가'} 자동으로 스톱했습니다`
                : '모든 카드를 가져가서 끝났습니다'}
          </p>
        )}

        <CapturedPanel title="AI" cards={state.captured.ai} score={aiScore} goCount={state.goCount.ai} />
        <CapturedPanel title="플레이어" cards={state.captured.player} score={playerScore} goCount={state.goCount.player} />

        {r.winner && (
          <section className="payout" aria-label="득점 내역">
            <h3>{winnerName} 득점 내역</h3>
            <ul>
              {r.items.map((item) => (
                <li key={item.key}><span>{item.label}</span><b>+{item.points}</b></li>
              ))}
            </ul>
            <div className="payout-line"><span>소계</span><b>{r.base}점</b></div>
            {r.goCount > 0 && (
              <div className="payout-line"><span>{r.goCount}고</span><b>{r.withGo}점</b></div>
            )}
            {r.pibak && (
              <div className="payout-line"><span>피박 (상대 피 {r.loserPi}장)</span><b>×2</b></div>
            )}
            {r.gwangbak && (
              <div className="payout-line"><span>광박 (상대 광 {r.loserGwang}장)</span><b>×2</b></div>
            )}
            <div className="payout-total"><span>합계</span><b>{r.total}점</b></div>
          </section>
        )}

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

      <div className="cards-grid" aria-label="카드 판">
        {state.deck.map((slot, index) => {
          const selected = state.flipped.includes(index);
          const up = selected || state.revealed.includes(index);
          const dx = (hash01(state.seed, index, 1) - 0.5) * 6;
          const dy = (hash01(state.seed, index, 2) - 0.5) * 6;
          const rot = (hash01(state.seed, index, 3) - 0.5) * 10;
          return (
            <div className="slot" key={slot.card.id}>
              {slot.taken ? null : up ? (
                <button
                  type="button"
                  className={`slot-face ${selected ? 'selected' : ''} ${dropping.has(index) ? 'dropping' : ''}`}
                  style={{ transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(1.2)` }}
                  onClick={() => send({ type: 'FLIP', index })}
                  disabled={!canClick || selected}
                  title={`앞면 유지 ${state.revealLeft[index] ?? ''}턴 남음`}
                >
                  <CardFace card={slot.card} />
                  {state.revealLeft[index] > 0 && <span className="left-badge">{state.revealLeft[index]}</span>}
                </button>
              ) : (
                <button
                  type="button"
                  className={`back-card ${state.lastHidden.includes(index) ? 'returned' : ''}`}
                  style={{ transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)` }}
                  onClick={() => send({ type: 'FLIP', index })}
                  disabled={!canClick}
                  aria-label="뒤집지 않은 카드"
                >
                  <span className="card-pattern" />
                </button>
              )}
            </div>
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
