import { useEffect, useLayoutEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { RotateCcw, Trophy, Hand, Music, Volume2, VolumeX } from 'lucide-react';
import * as audio from './audio/audio.js';
import CardFace from './components/CardFace.jsx';
import { useAccount } from './firebase/useAccount.js';
import { ITEM_CARDS, ITEM_INFO } from './game/cards.js';
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
  PEEK_VIEW_MS,
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

function CapturedPanel({ who, title, cards, score, goCount, active = false }) {
  const pick = (kind) => cards.filter((c) => c.kind === kind);
  const pi = cards.filter((c) => c.piValue > 0); // 피, 쌍피, 아이템 쌍피·쓰리피
  const piCount = pi.reduce((sum, c) => sum + c.piValue, 0); // 쌍피는 2장
  const items = scoreItems(cards);
  const piItem = items.find((item) => item.key === 'pi');
  return (
    <section className={`captured ${active ? 'active' : ''} captured-${who}`} data-who={who} aria-label={`${title}이(가) 먹은 패`}>
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

// 아이템 카드가 뒤집힌 칸에서 크게 커지며 빛나는 연출 (쌍피·쓰리피는 먹은 패 쪽으로 날아간다)
function ItemPop({ event }) {
  const ref = useRef(null);
  const card = ITEM_CARDS.find((c) => c.item === event.item);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !(event.item === 'ssangpi' || event.item === 'tripi')) return;
    const panel = document.querySelector(`.captured[data-who="${event.who}"]`);
    if (!panel) return;
    const a = el.getBoundingClientRect();
    const b = panel.getBoundingClientRect();
    el.style.setProperty('--fly-x', `${Math.round(b.left + b.width / 2 - (a.left + a.width / 2))}px`);
    el.style.setProperty('--fly-y', `${Math.round(b.top + b.height / 2 - (a.top + a.height / 2))}px`);
  }, [event]);
  return (
    <div ref={ref} className={`item-pop item-pop-${event.item}`} aria-hidden="true">
      <span className="item-pop-ring" />
      <span className="item-pop-ring item-pop-ring2" />
      <div className="item-pop-card"><CardFace card={card} /></div>
    </div>
  );
}

// 턴이 넘어갈 때 화면 가운데에 누구 차례인지 크게 알려 준다
const TURN_REASON = {
  start: { player: '카드 2장을 뒤집어 같은 월을 찾으세요' },
  miss: { player: 'AI가 짝을 맞추지 못했습니다', ai: '짝이 맞지 않았습니다' },
  tries: { player: `AI가 카드 ${MAX_FLIPS}장을 모두 열었습니다`, ai: `카드 ${MAX_FLIPS}장을 모두 열었습니다` },
  go: { player: 'AI가 고를 불렀습니다', ai: '고를 불렀습니다' },
};
function TurnBanner({ event }) {
  const mine = event.to === 'player';
  const sub = TURN_REASON[event.reason]?.[event.to];
  return (
    <div className={`turn-banner ${mine ? 'mine' : 'theirs'}`} role="status" aria-live="polite">
      <strong>{mine ? '당신의 턴' : 'AI의 턴'}</strong>
      {sub && <span>{sub}</span>}
    </div>
  );
}

function ItemToast({ event }) {
  const card = ITEM_CARDS.find((c) => c.item === event.item);
  const info = ITEM_INFO[event.item];
  return (
    <div className="item-toast" role="status" aria-live="polite">
      <div className="item-toast-card"><CardFace card={card} /></div>
      <div>
        <strong>{event.who === 'player' ? '내가' : 'AI가'} {info.title}!</strong>
        <p>{info.desc}</p>
        <p className="item-toast-note">시도 횟수는 쓰지 않습니다</p>
      </div>
    </div>
  );
}

// 보너스가 겹치면 가장 큰 연출 하나만 보여 준다 (폭탄 > 판쓸 > 쪽)
const BURST_TITLE = { bomb: '💣 폭탄!', sweep: '🧹 판쓸!', jjok: '💋 쪽!' };
const burstKindOf = (event) => ['bomb', 'sweep', 'jjok'].find((k) => event.rewards.some((r) => r.kind === k)) ?? 'sweep';
function RewardBurst({ event }) {
  const kind = burstKindOf(event);
  return (
    <div className={`sweep-burst burst-${kind} ${event.who === 'player' ? 'mine' : 'theirs'}`} aria-hidden="true">
      <div className="sweep-flash" />
      <div className="sweep-wipe" />
      <div className="burst-ring" />
      <div className="burst-ring r2" />
      <div className="sweep-title">{BURST_TITLE[kind]}</div>
      <div className="sweep-sparks">
        {Array.from({ length: 28 }, (_, i) => <i key={i} style={{ '--i': i }} />)}
      </div>
    </div>
  );
}

function SweepToast({ event }) {
  const names = event.stolen.map((c) => c.name ?? '피').join(', ');
  return (
    <div className="item-toast sweep-toast" role="status" aria-live="polite">
      <div className="sweep-emoji" aria-hidden="true">✨</div>
      <div>
        <strong>{event.who === 'player' ? '내가' : 'AI가'} {event.rewards.map((r) => r.label).join(' · ')}!</strong>
        <p>
          {event.stolen.length ? `상대의 피 ${event.stolen.length}장(${names})을 가져옵니다` : '상대에게 가져올 피가 없습니다'}
          {event.bonus ? ` · +${event.bonus}점` : ''}
        </p>
      </div>
    </div>
  );
}

function EmailForm({ acc, onDone }) {
  const [mode, setMode] = useState('in'); // in | up | reset
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setInfo('');
    try {
      if (mode === 'in') await acc.signInEmail(email.trim(), pw);
      else if (mode === 'up') await acc.signUpEmail(email.trim(), pw, name.trim());
      else {
        await acc.resetPassword(email.trim());
        setInfo('비밀번호 재설정 메일을 보냈습니다. 메일함을 확인해 주세요.');
        setBusy(false);
        return;
      }
      onDone();
    } catch {
      /* 오류 문구는 acc.error로 표시된다 */
    }
    setBusy(false);
  };
  return (
    <form className="email-form" onSubmit={submit}>
      <div className="email-tabs">
        <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => { setMode('in'); acc.setError(''); }}>로그인</button>
        <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => { setMode('up'); acc.setError(''); }}>회원가입</button>
      </div>
      {mode === 'up' && <input placeholder="닉네임" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} required autoComplete="nickname" />}
      <input type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      {mode !== 'reset' && <input type="password" placeholder="비밀번호 (6자 이상)" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} />}
      <button className="btn btn-normal account-btn" disabled={busy}>
        {mode === 'in' ? '로그인' : mode === 'up' ? '가입하고 인증 메일 받기' : '재설정 메일 보내기'}
      </button>
      {mode === 'in' && <button type="button" className="account-link" onClick={() => { setMode('reset'); acc.setError(''); }}>비밀번호를 잊었어요</button>}
      {mode === 'reset' && <button type="button" className="account-link" onClick={() => { setMode('in'); setInfo(''); }}>로그인으로 돌아가기</button>}
      {info && <span className="account-note">{info}</span>}
    </form>
  );
}

function AccountBar() {
  const acc = useAccount();
  const [open, setOpen] = useState(false);
  if (acc.status === 'off') return null;
  return (
    <div className="account-bar">
      {acc.status === 'loading' && <span className="account-note">계정 확인 중…</span>}
      {acc.status === 'out' && (
        <>
          <div className="account-actions">
            <button className="btn btn-normal account-btn" onClick={acc.signIn}>Google로 로그인</button>
            <button className="btn btn-easy account-btn" onClick={() => setOpen((v) => !v)}>이메일로 로그인 / 가입</button>
          </div>
          {open && <EmailForm acc={acc} onDone={() => setOpen(false)} />}
          {!open && <span className="account-note">로그인하면 포인트가 저장됩니다. 로그인 없이도 연습은 가능해요.</span>}
        </>
      )}
      {acc.status === 'unverified' && (
        <>
          <span className="account-note">{acc.user.email} 로 인증 메일을 보냈습니다. 메일의 링크를 누른 뒤 아래 버튼을 눌러 주세요.</span>
          <div className="account-actions">
            <button className="btn btn-normal account-btn" onClick={acc.reloadUser}>인증했어요</button>
            <button className="account-link" onClick={acc.resendVerification}>메일 다시 보내기</button>
            <button className="account-link" onClick={acc.signOut}>로그아웃</button>
          </div>
        </>
      )}
      {acc.status === 'in' && (
        <>
          <span className="account-name">{acc.user.name || '플레이어'}</span>
          <span className="account-points">🪙 {acc.points === null ? '…' : acc.points.toLocaleString()}</span>
          <button className="account-link" onClick={acc.signOut}>로그아웃</button>
        </>
      )}
      {acc.error && <span className="account-error">{acc.error}</span>}
    </div>
  );
}

function Menu({ onStart }) {
  return (
    <div className="screen menu-screen">
      <AccountBar />
      <h1 className="title">IQ 맞고</h1>
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
        <p>• 시작할 때 <b>카드 4장이 앞면으로 깔려</b> 있어, 먼저 하는 쪽이 불리하지 않도록 두 사람이 한 턴씩 보고 시작합니다. 이긴 편이 다음 판의 선이 됩니다. 깔다가 아이템 패가 나오면 효과 없이 선(먼저 하는 사람)이 그냥 먹고, 일반 카드 4장은 항상 깔립니다.</p>
        <p>• 쉬움 난이도에서는 틀린 카드가 5턴(사람과 AI의 턴을 모두 셉니다) 동안 앞면으로 남아 있고, 앞면인 카드도 다시 골라 짝을 맞출 수 있습니다. 카드 모서리의 숫자는 남은 턴이고, 점선 테두리 카드는 이번 턴이 끝나면 뒷면으로 돌아갑니다.</p>
        <p>• 판에는 <b>아이템 패 6장</b>(쌍피 2, 쓰리피, 섞기, 초기화, 엿보기)이 섞여 있습니다. 뒤집으면 그 자리에서 효과가 발동하고 시도 횟수는 쓰지 않습니다. 쌍피·쓰리피는 피 2장·3장으로 계산되어 먹은 패에 들어가고, 섞기는 남은 카드의 위치를 모두 바꾸며, 초기화는 열려 있던 카드를 모두 뒷면으로 돌리고, 엿보기는 쓴 사람만 3초 동안 판의 모든 카드를 볼 수 있게 합니다(상대에게는 보이지 않고, 그동안 카드를 누를 수 없습니다).</p>
        <p>• 광 3점(비광 포함 2점)·4광 4점·5광 15점, 고도리 5점, 홍단·청단·초단 각 3점</p>
        <p>• 열끗·띠는 5장부터 1점(이후 1장당 +1), 피는 10장부터 1점(쌍피는 2장으로 계산)</p>
        <p>• <b>보너스</b>(상대 피를 가져옴): <b>판쓸</b> 열려 있던 카드를 모두 먹음(+1점도) · <b>쪽</b> 첫 시도에서 처음 보는 두 장이 짝 · <b>폭탄</b> 앞면으로 열린 같은 월 3장이 있을 때 맞춤(피 2장)</p>
        <p>• {WIN_THRESHOLD}점 이상이 되면 <b>턴이 끝날 때</b>(남은 2번의 시도를 모두 마친 뒤) <b>고</b>(계속) 또는 <b>스톱</b>(종료)을 선택합니다. 고를 부르면 <b>상대 차례로 넘어가고</b>, 그 뒤에는 점수가 더 올라야 다시 선택할 수 있습니다.</p>
        <p>• 1고 +1, 2고 +2, 3고부터는 점수가 2배씩! 피박·광박이면 각각 2배</p>
        <p>• 오른쪽 아래 버튼으로 배경음악과 효과음을 따로 켜고 끌 수 있습니다. 소리는 브라우저에서 직접 만들어 내며, 설정은 기억됩니다.</p>
        <p>• 모든 카드를 가져갔는데 {WIN_THRESHOLD}점 이상이 없으면 나가리(무승부)</p>
      </div>
      <p className="credits">
        카드 그림:{' '}
        <a href="https://commons.wikimedia.org/wiki/User:Spen%C4%89jo" target="_blank" rel="noreferrer">Spenĉjo</a>,{' '}
        <a href="https://commons.wikimedia.org/wiki/Category:SVG_Hwatu" target="_blank" rel="noreferrer">Wikimedia Commons</a>,{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.ko" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>
        {' '}(크기와 색을 변경함)
      </p>
    </div>
  );
}

// 오른쪽 아래에 떠 있는 배경음악·효과음 켜기/끄기 버튼
function SoundControls({ inline = false }) {
  const st = useSyncExternalStore(audio.subscribe, audio.getSettings);
  return (
    <div className={`sound-controls ${inline ? 'inline' : ''}`}>
      <button
        type="button"
        className={`icon-btn ${st.music ? '' : 'off'}`}
        onClick={() => audio.setMusic(!st.music)}
        aria-pressed={st.music}
        aria-label={st.music ? '배경음악 끄기' : '배경음악 켜기'}
        title="배경음악"
      >
        <Music size={18} />
      </button>
      <button
        type="button"
        className={`icon-btn ${st.sfx ? '' : 'off'}`}
        onClick={() => audio.setSfx(!st.sfx)}
        aria-pressed={st.sfx}
        aria-label={st.sfx ? '효과음 끄기' : '효과음 켜기'}
        title="효과음"
      >
        {st.sfx ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>
    </div>
  );
}

// 게임 상태가 바뀐 모양을 보고 효과음을 낸다
function useGameSounds(state) {
  const prev = useRef(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = state;
    if (!state) return undefined;
    if (!p || p.seed !== state.seed) {
      audio.play('start');
      return undefined;
    }
    const total = (g) => g.captured.player.length + g.captured.ai.length;
    const timers = [];
    const later = (ms, name) => timers.push(setTimeout(() => audio.play(name), ms));
    const itemUsed = state.itemEvent && state.itemEvent.n !== (p.itemEvent?.n ?? 0);

    const rewarded = state.rewardEvent && state.rewardEvent.n !== (p.rewardEvent?.n ?? 0);
    if (rewarded) {
      const kind = burstKindOf(state.rewardEvent);
      later(kind === 'sweep' ? 120 : 150, kind);
    }
    if (itemUsed) audio.play(state.itemEvent.item);
    else if (state.flipped.length > p.flipped.length) audio.play('flip');
    else if (total(state) > total(p)) audio.play('match');
    else if (p.flipped.length === 2 && state.flipped.length === 0 && state.phase === 'playing') audio.play('miss');

    if (state.turn !== p.turn && state.phase === 'playing') {
      if (state.turn === 'player') later(380, 'yourTurn');
      else later(150, 'turnEnd');
    }
    if (state.phase === 'gostop' && p.phase !== 'gostop') later(250, 'gostop');
    if (p.phase === 'gostop' && state.phase === 'playing') audio.play('go');
    if (state.phase === 'over' && p.phase !== 'over') {
      const r = state.result;
      const stopped = r.how === 'stop' || r.how === 'auto';
      if (stopped) audio.play('stop');
      later(stopped ? 900 : 200, r.winner === 'player' ? 'win' : r.winner === 'ai' ? 'lose' : 'draw');
    }
    return () => timers.forEach(clearTimeout);
  }, [state]);
}

function appReducer(state, action) {
  if (action.type === 'MENU') return null;
  if (action.type === 'START') {
    // 이긴 편이 다음 판의 선이 된다 (비기면 이전 선 유지)
    const first = state?.phase === 'over' ? (state.result?.winner ?? state.first ?? 'player') : 'player';
    return createGame(action.difficulty, Math.random, first);
  }
  if (state === null) return state;
  return gameReducer(state, action);
}

// state === null 이면 메뉴 화면
export default function App() {
  const [state, send] = useReducer(appReducer, null);
  // 첫 입력에서 소리를 켜고, 버튼을 누를 때마다 딸깍 소리를 낸다
  useEffect(() => {
    const onPointerDown = () => audio.unlock();
    const onClick = (e) => {
      if (e.target.closest?.('.btn, .go-button')) audio.play('click');
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('click', onClick);
    };
  }, []);
  useGameSounds(state);
  return (
    <>
      <Game state={state} send={send} />
      {(!state || state.phase === 'over') && <SoundControls />}
    </>
  );
}

function Game({ state, send }) {
  // 엿보기(사람이 쓴 경우): 연출이 보인 뒤 3초 동안 모든 카드를 앞면으로 보여 준다. AI가 쓰면 사람 화면은 그대로다.
  const peekN = state?.itemEvent?.item === 'peek' && state.itemEvent.who === 'player' ? state.itemEvent.n : 0;
  const [peekPhase, setPeekPhase] = useState(null); // null | 'wait'(연출 중) | 'show'(모든 카드 공개)
  useEffect(() => {
    if (!peekN) {
      setPeekPhase(null);
      return undefined;
    }
    setPeekPhase('wait');
    const t1 = setTimeout(() => setPeekPhase('show'), 700);
    const t2 = setTimeout(() => {
      setPeekPhase(null);
      audio.play('hide');
    }, 700 + PEEK_VIEW_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [peekN]);

  // 턴 배너: 턴이 넘어갈 때마다 잠깐 보여 준다
  const turnN = state?.turnEvent?.n ?? 0;
  const [turnToastN, setTurnToastN] = useState(0);
  useEffect(() => {
    if (!turnN) {
      setTurnToastN(0);
      return undefined;
    }
    setTurnToastN(turnN);
    const id = setTimeout(() => setTurnToastN(0), 1500);
    return () => clearTimeout(id);
  }, [turnN]);

  // 아이템 효과 알림: 새 아이템이 발동할 때마다 잠깐 보여 준다
  const itemN = state?.itemEvent?.n ?? 0;
  const [toastN, setToastN] = useState(0);
  useEffect(() => {
    if (!itemN) {
      setToastN(0);
      return undefined;
    }
    setToastN(itemN);
    const id = setTimeout(() => setToastN(0), 2600);
    return () => clearTimeout(id);
  }, [itemN]);

  const rewardN = state?.rewardEvent?.n ?? 0;
  const [rewardToastN, setRewardToastN] = useState(0);
  useEffect(() => {
    if (!rewardN) {
      setRewardToastN(0);
      return undefined;
    }
    setRewardToastN(rewardN);
    const id = setTimeout(() => setRewardToastN(0), 2600);
    return () => clearTimeout(id);
  }, [rewardN]);

  useEffect(() => {
    if (!state || state.phase === 'over') return undefined;
    let id;
    if (state.phase === 'playing' && state.flipped.length === 2) {
      id = setTimeout(() => send({ type: 'RESOLVE' }), 1100); // 뒤집은 두 장을 볼 시간
    } else if (state.phase === 'playing' && state.turn === 'ai') {
      // 아이템 연출이 보이는 동안에는 기다렸다가, 끝나면(toastN 변경) 이어서 진행한다
      if (state.itemEvent && toastN === state.itemEvent.n) return undefined;
      // 턴 배너가 보이는 동안에도 기다린다 (누구 차례인지 눈으로 확인할 시간)
      if (state.turnEvent && turnToastN === state.turnEvent.n) return undefined;
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
  }, [state, send, toastN, turnToastN]);

  if (!state) {
    return <Menu onStart={(difficulty) => send({ type: 'START', difficulty })} />;
  }

  const playerScore = scoreOf(state, 'player');
  const aiScore = scoreOf(state, 'ai');
  // 다음에 틀리면 뒷면으로 돌아갈 카드 (가장 오래된 것부터)
  // 이번 턴이 끝나면 뒷면으로 돌아갈 카드 (남은 턴이 1)
  const dropping = new Set(state.revealed.filter((i) => state.revealLeft[i] === 1));
  const popActive = Boolean(state.itemEvent && toastN === state.itemEvent.n);
  const canClick = state.phase === 'playing' && state.turn === 'player' && state.flipped.length < 2 && !peekPhase;

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

        <CapturedPanel who="ai" title="AI" cards={state.captured.ai} score={aiScore} goCount={state.goCount.ai} />
        <CapturedPanel who="player" title="플레이어" cards={state.captured.player} score={playerScore} goCount={state.goCount.player} />

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
        <div className={`turn-indicator ${state.turn === 'player' ? 'mine' : 'theirs'}`}>
          {state.turn === 'player' ? '🎮 당신의 턴' : '🤖 AI의 턴'}
          <span className="tries"> · 카드 {state.tries * 2 + state.flipped.length}/{MAX_FLIPS}장 오픈</span>
        </div>
        <div className="header-actions">
          <SoundControls inline />
          <button className="btn btn-primary" onClick={() => send({ type: 'MENU' })}>
            <RotateCcw size={18} /> <span>메뉴로</span>
          </button>
        </div>
      </div>

      {state.turnEvent && turnToastN === state.turnEvent.n && <TurnBanner event={state.turnEvent} />}

      <CapturedPanel who="ai" title="AI" cards={state.captured.ai} score={aiScore} goCount={state.goCount.ai} active={state.turn === 'ai'} />

      {state.itemEvent && toastN === state.itemEvent.n && <ItemToast event={state.itemEvent} />}
      {state.rewardEvent && rewardToastN === state.rewardEvent.n && <RewardBurst event={state.rewardEvent} />}
      {state.rewardEvent && rewardToastN === state.rewardEvent.n && <SweepToast event={state.rewardEvent} />}

      <div className={`board-wrap ${peekPhase === 'show' ? 'peeking' : ''}`}>
        {peekPhase === 'show' && (
          <div className="peek-timer" role="status">
            <span>엿보기 · 모든 카드가 보입니다</span>
            <i style={{ animationDuration: `${PEEK_VIEW_MS}ms` }} />
          </div>
        )}
      <div
        className={`cards-grid ${popActive && state.itemEvent.item === 'shuffle' ? 'shuffling' : ''} ${popActive && state.itemEvent.item === 'reset' ? 'resetting' : ''}`}
        aria-label="카드 판"
      >
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
                  style={{ transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(var(--reveal-scale, 1.25))` }}
                  onClick={() => send({ type: 'FLIP', index })}
                  disabled={!canClick || selected}
                  title={`앞면 유지 ${state.revealLeft[index] ?? ''}턴 남음`}
                >
                  <CardFace card={slot.card} />
                  {state.revealLeft[index] > 0 && <span className="left-badge">{state.revealLeft[index]}</span>}
                </button>
              ) : peekPhase === 'show' ? (
                <span
                  className="peek-face"
                  style={{ transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(1.08)` }}
                  aria-label={`${slot.card.month}월 ${slot.card.name}`}
                >
                  <CardFace card={slot.card} />
                </span>
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
              {popActive && state.itemEvent.index === index && <ItemPop event={state.itemEvent} />}
            </div>
          );
        })}
      </div>
      </div>

      <CapturedPanel who="player" title="플레이어" cards={state.captured.player} score={playerScore} goCount={state.goCount.player} active={state.turn === 'player'} />

      {state.phase === 'gostop' && state.turn === 'player' && (
        <div className="gostop-overlay" role="dialog" aria-label="고 또는 스톱">
          <div className="gostop-box">
            <h3>{playerScore}점! 고 또는 스톱?</h3>
            <p>고를 부르면 상대 차례로 넘어가고, 점수가 더 올라야 다시 고/스톱을 선택할 수 있습니다.</p>
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
