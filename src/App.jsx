import { useEffect, useLayoutEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { RotateCcw, Trophy, Hand, Music, Volume2, VolumeX } from 'lucide-react';
import * as audio from './audio/audio.js';
import CardFace from './components/CardFace.jsx';
import { createContext, useCallback, useContext } from 'react';
import { useAccount } from './firebase/useAccount.js';
import { settleAiGameOnServer, startAiGameOnServer } from './firebase/wallet.js';
import { seededRng } from './game/rng.js';
import PvpRoom from './pvp/PvpRoom.jsx';
import { createRoom, joinByCode, joinById, listRooms, messageOf, quickMatch } from './firebase/pvp.js';

const AccountContext = createContext(null);
const OpponentContext = createContext('AI'); // 상대 이름 (사람 대전이면 닉네임)
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
  peekSubset,
} from './game/engine.js';

// AI 대전과 사람 대전은 같은 규칙(틀린 카드 5턴 유지)을 쓴다
const DIFFICULTIES = [
  { key: 'easy', label: 'AI 대전', cls: 'btn-easy' },
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
  timeout: { player: '상대가 시간을 넘겼습니다', ai: '시간이 초과되었습니다' },
};
function TurnBanner({ event }) {
  const opp = useContext(OpponentContext);
  const mine = event.to === 'player';
  const sub = TURN_REASON[event.reason]?.[event.to]?.replace('AI', opp);
  return (
    <div className={`turn-banner ${mine ? 'mine' : 'theirs'}`} role="status" aria-live="polite">
      <strong>{mine ? '당신의 턴' : `${opp}의 턴`}</strong>
      {sub && <span>{sub}</span>}
    </div>
  );
}

function ItemToast({ event }) {
  const opp = useContext(OpponentContext);
  const card = ITEM_CARDS.find((c) => c.item === event.item);
  const info = ITEM_INFO[event.item];
  return (
    <div className="item-toast" role="status" aria-live="polite">
      <div className="item-toast-card"><CardFace card={card} /></div>
      <div>
        <strong>{event.who === 'player' ? '내가' : `${opp}이(가)`} {info.title}!</strong>
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
  const opp = useContext(OpponentContext);
  const names = event.stolen.map((c) => c.name ?? '피').join(', ');
  return (
    <div className="item-toast sweep-toast" role="status" aria-live="polite">
      <div className="sweep-emoji" aria-hidden="true">✨</div>
      <div>
        <strong>{event.who === 'player' ? '내가' : `${opp}이(가)`} {event.rewards.map((r) => r.label).join(' · ')}!</strong>
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
  const acc = useContext(AccountContext);
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

function SettleLine({ settle, winner }) {
  let text;
  if (settle.status === 'pvp') {
    if (settle.drawn) text = '비겼습니다. 포인트 이동은 없습니다.';
    else if (settle.delta === 0) text = '상대 포인트가 없어 이동한 포인트가 없습니다.';
    else text = `🪙 ${settle.delta > 0 ? '+' : '−'}${Math.abs(settle.delta).toLocaleString()} 포인트 (상대와 정산)`;
    return <p className={`settle-line ${settle.delta > 0 ? 'earned' : ''}`}>{text}</p>;
  }
  if (settle.status === 'pending') text = '포인트 정산 중…';
  else if (settle.status === 'error') text = '포인트 정산에 실패했습니다. (이 판은 반영되지 않습니다)';
  else if (settle.earned > 0) text = `🪙 +${settle.earned.toLocaleString()} 포인트 (오늘 AI 대전 ${settle.earnedToday.toLocaleString()} / ${settle.dailyCap.toLocaleString()})`;
  else if (winner === 'player') text = `오늘 AI 대전 포인트 상한(${settle.dailyCap.toLocaleString()})에 도달해 더 받지 못했습니다.`;
  else text = '이긴 판에서만 포인트를 받습니다. (져도 포인트는 줄지 않아요)';
  return <p className={`settle-line ${settle.earned > 0 ? 'earned' : ''}`}>{text}</p>;
}

// 로비 본문: 자동입장(빠른 대전) 칩 + 방 선택 판 + 열린 방 목록
function LobbyBody({ onStart, onEnter, resumeRoom, onLogin }) {
  const acc = useContext(AccountContext);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [rooms, setRooms] = useState([]); // 열린 방 목록 (방장이 AI와 연습하며 기다리는 방)
  const loggedIn = acc.status === 'in';
  // 열린 방 목록을 주기적으로 새로 읽는다 (화면이 보일 때만)
  useEffect(() => {
    if (!loggedIn) return undefined;
    let dead = false;
    const load = () => {
      if (document.hidden) return;
      listRooms().then((r) => !dead && setRooms(r.rooms)).catch(() => {});
    };
    load();
    const t = setInterval(load, 6000);
    document.addEventListener('visibilitychange', load);
    return () => {
      dead = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', load);
    };
  }, [loggedIn]);
  const run = async (fn) => {
    if (!loggedIn) {
      onLogin();
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const res = await fn();
      onEnter(res.roomId);
    } catch (e) {
      setErr(messageOf(e));
    }
    setBusy(false);
  };
  return (
    <>
      {resumeRoom && loggedIn && (
        <button className="lobby-resume" onClick={() => onEnter(resumeRoom)} disabled={busy}>▶ 진행 중인 대전으로 돌아가기</button>
      )}
      <div className="lobby-main">
        <button className={`chip-btn ${loggedIn ? '' : 'locked'}`} onClick={() => run(quickMatch)} disabled={busy} aria-label="자동입장 (빠른 대전)">
          <span className="chip-ring" aria-hidden="true" />
          <span className="chip-face">
            <span className="chip-title">자동<b>입장</b></span>
            <span className="chip-sub">{loggedIn ? '빠른 대전' : '로그인 필요'}</span>
            <span className="chip-note">점당 100P · 3,000P 이상</span>
          </span>
        </button>
        <div className="plates">
          <button className="plate plate-ai" onClick={() => onStart('easy')}>
            <b>AI 대전</b>
            <small>혼자 연습 · 이기면 포인트</small>
          </button>
          <button className={`plate ${loggedIn ? '' : 'locked'}`} onClick={() => run(() => createRoom(false))} disabled={busy}>
            <b>방 만들기</b>
            <small>AI와 연습하며 대기</small>
          </button>
          <button className={`plate ${loggedIn ? '' : 'locked'}`} onClick={() => run(() => createRoom(true))} disabled={busy}>
            <b>🔒 비밀방</b>
            <small>코드로만 입장</small>
          </button>
          <form className={`plate plate-code ${loggedIn ? '' : 'locked'}`} onSubmit={(e) => { e.preventDefault(); run(() => joinByCode(code.trim())); }}>
            <input className="code-input" inputMode="numeric" pattern="[0-9]*" maxLength={4} placeholder="비밀방 코드" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="비밀방 코드 4자리" />
            <button className="code-go" disabled={busy || (loggedIn && code.length !== 4)}>입장</button>
          </form>
        </div>
      </div>
      {err && <p className="lobby-error">{err}</p>}
      {loggedIn && (
        <section className="lobby-rooms" aria-label="열린 방">
          <h3>열린 방 {rooms.length > 0 ? <em>{rooms.length}</em> : null}</h3>
          {rooms.length === 0 && <p className="lobby-empty">지금 열린 방이 없습니다. 방을 만들어 기다려 보세요.</p>}
          {rooms.map((r) => (
            <div className="room-card" key={r.id}>
              <span className="room-avatar" aria-hidden="true">{(r.host || '?').slice(0, 1)}</span>
              <span className="room-name">{r.host}님의 방</span>
              <button className="room-join" onClick={() => run(() => joinById(r.id))} disabled={busy}>입장</button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function RulesModal({ onClose }) {
  return (
    <div className="rules-modal" role="dialog" aria-label="게임 규칙" onClick={onClose}>
      <div className="rules-box" onClick={(e) => e.stopPropagation()}>
        <button className="rules-close" onClick={onClose} aria-label="닫기">✕</button>
        <div className="rules">
        <h3>게임 규칙</h3>
        <p>• 화투 48장 중 같은 월 2장을 뒤집어 맞추면 가져가고 한 번 더 뒤집을 수 있습니다. 틀리거나, 한 턴에 카드 4장(2번 시도)을 모두 열면 맞췄어도 상대 차례입니다.</p>
        <p>• 시작할 때 <b>카드 4장이 앞면으로 깔려</b> 있어, 먼저 하는 쪽이 불리하지 않도록 두 사람이 한 턴씩 보고 시작합니다. 이긴 편이 다음 판의 선이 됩니다. 깔다가 아이템 패가 나오면 선(먼저 하는 사람)이 그냥 먹고(엿보기만 효과가 바로 발동), 일반 카드 4장은 항상 깔립니다.</p>
        <p>• 틀린 카드는 5턴(사람과 AI의 턴을 모두 셉니다) 동안 앞면으로 남아 있고, 앞면인 카드도 다시 골라 짝을 맞출 수 있습니다. 카드 모서리의 숫자는 남은 턴이고, 점선 테두리 카드는 이번 턴이 끝나면 뒷면으로 돌아갑니다.</p>
        <p>• 판에는 <b>아이템 패 6장</b>(쌍피 2, 쓰리피, 섞기, 초기화, 엿보기)이 섞여 있습니다. 뒤집으면 그 자리에서 효과가 발동하고 시도 횟수는 쓰지 않습니다. 쌍피·쓰리피는 피 2장·3장으로 계산되어 먹은 패에 들어가고, 섞기는 남은 카드의 위치를 모두 바꾸며, 초기화는 열려 있던 카드를 모두 뒷면으로 돌리고, 엿보기는 쓴 사람만 3초 동안 닫혀 있는 카드의 절반(무작위, 아이템 패는 제외)을 볼 수 있게 합니다(상대에게는 보이지 않고, 그동안 카드를 누를 수 없습니다).</p>
        <p>• 광 3점(비광 포함 2점)·4광 4점·5광 15점, 고도리 5점, 홍단·청단·초단 각 3점</p>
        <p>• 열끗·띠는 5장부터 1점(이후 1장당 +1), 피는 10장부터 1점(쌍피는 2장으로 계산)</p>
        <p>• <b>보너스</b>(상대 피를 가져옴): <b>판쓸</b> 열려 있던 카드를 모두 먹음(+1점도) · <b>쪽</b> 앞면으로 열려 있지 않던 두 장을 뒤집어 바로 짝(첫 번째·두 번째 시도 모두) · <b>폭탄</b> 한 턴에 같은 월 4장을 모두 먹었을 때(같은 월 짝을 연속으로 두 번, 피 2장)</p>
        <p>• {WIN_THRESHOLD}점 이상이 되면 <b>턴이 끝날 때</b>(남은 2번의 시도를 모두 마친 뒤) <b>고</b>(계속) 또는 <b>스톱</b>(종료)을 선택합니다. 고를 부르면 <b>상대 차례로 넘어가고</b>, 그 뒤에는 점수가 더 올라야 다시 선택할 수 있습니다.</p>
        <p>• <b>고 점수</b>: 1고 +1점, 2고 +2점, 3고부터는 점수가 2배씩(3고 ×2, 4고 ×4, 5고 ×8). 예) 21점에서 4고 → (21+2)×4 = 92점</p>
        <p>• <b>박</b>(각각 2배, 겹치면 곱해집니다): <b>피박</b> 내가 피로 점수를 냈고 상대 피가 7장 이하 · <b>광박</b> 내가 3광 이상이고 상대 광이 0장 · <b>멍따</b> 내가 열끗 7장 이상 · <b>고박</b> 고를 부른 상대가 역전당해 짐</p>
        <p>• 화면 위쪽의 소리 버튼으로 배경음악과 효과음을 따로 켜고 끌 수 있습니다. 소리는 브라우저에서 직접 만들어 내며, 설정은 기억됩니다.</p>
        <p>• 모든 카드를 가져갔는데 {WIN_THRESHOLD}점 이상이 없으면 나가리(무승부)</p>
      </div>
      <p className="credits">
        카드 그림:{' '}
        <a href="https://commons.wikimedia.org/wiki/User:Spen%C4%89jo" target="_blank" rel="noreferrer">Spenĉjo</a>,{' '}
        <a href="https://commons.wikimedia.org/wiki/Category:SVG_Hwatu" target="_blank" rel="noreferrer">Wikimedia Commons</a>,{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.ko" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>
        {' '}(크기와 색을 변경함)
      </p>
        <button className="btn btn-primary" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}

function Menu({ onStart, onPvp }) {
  const acc = useContext(AccountContext);
  const [showRules, setShowRules] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const loggedIn = acc.status === 'in';
  const name = acc.user?.name || '플레이어';
  return (
    <div className="lobby">
      <header className="lobby-top">
        <div className="lobby-profile">
          <span className="avatar" aria-hidden="true">{loggedIn ? name.slice(0, 1) : '?'}</span>
          {loggedIn ? (
            <div className="profile-text">
              <b>{name}</b>
              <button className="profile-link" onClick={acc.signOut}>로그아웃</button>
            </div>
          ) : (
            <div className="profile-text">
              <b>게스트</b>
              <button className="profile-link" onClick={() => setShowAuth(true)}>
                {acc.status === 'unverified' ? '이메일 인증 필요' : acc.status === 'loading' ? '확인 중…' : '로그인 / 가입'}
              </button>
            </div>
          )}
        </div>
        <div className="lobby-icons">
          <button className="top-icon" onClick={() => setShowRules(true)} aria-label="게임 규칙">
            <span aria-hidden="true">📖</span>
            <small>규칙</small>
          </button>
          <SoundControls inline />
        </div>
      </header>

      <h1 className="lobby-logo">IQ <span>맞고</span></h1>

      <LobbyBody onStart={onStart} onEnter={onPvp} resumeRoom={acc.activeRoom} onLogin={() => setShowAuth(true)} />

      <footer className="lobby-bottom">
        <span className="coin-icon" aria-hidden="true" />
        <div>
          <small>보유 포인트</small>
          <b>{loggedIn ? (acc.points === null ? '…' : acc.points.toLocaleString()) : '로그인하면 저장됩니다'}</b>
        </div>
      </footer>

      {showAuth && (
        <div className="rules-modal" role="dialog" aria-label="로그인" onClick={() => setShowAuth(false)}>
          <div className="rules-box" onClick={(e) => e.stopPropagation()}>
            <button className="rules-close" onClick={() => setShowAuth(false)} aria-label="닫기">✕</button>
            <AccountBar />
          </div>
        </div>
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

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
    const timers = [];
    const later = (ms, name) => timers.push(setTimeout(() => audio.play(name), ms));
    if (!p || p.seed !== state.seed) {
      audio.play('start');
      if (state.itemEvent) later(450, state.itemEvent.item); // 시작 때 먹은 아이템 소리
      return () => timers.forEach(clearTimeout);
    }
    const total = (g) => g.captured.player.length + g.captured.ai.length;
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
    // 서버가 시드를 준 판(gameId)은 같은 시드로 만들고, 조작 기록(log)을 남겨 정산에 쓴다
    const rng = action.seed ? seededRng(action.seed) : Math.random;
    const game = createGame(action.difficulty, rng, action.first ?? 'player');
    return action.gameId ? { ...game, gameId: action.gameId, log: [] } : game;
  }
  if (state === null) return state;
  const next = gameReducer(state, action);
  if (state.gameId && next !== state && LOGGED.has(action.type)) {
    return { ...next, log: [...state.log, action.type === 'FLIP' ? { type: 'FLIP', index: action.index } : { type: action.type }] };
  }
  return next;
}
const LOGGED = new Set(['FLIP', 'RESOLVE', 'GO', 'STOP']);

// 이긴 편이 다음 판의 선이 된다 (비기면 이전 선 유지)
const nextFirst = (state) => (state?.phase === 'over' ? (state.result?.winner ?? state.first ?? 'player') : 'player');

// 방을 만들고 기다리는 동안 AI와 하는 연습 판. 누군가 방에 들어오면 이 화면은 바로 대전 화면으로 바뀐다.
function PracticeWhileWaiting({ room, onCancel }) {
  const [state, send] = useReducer(appReducer, null, () => appReducer(null, { type: 'START', difficulty: 'easy', first: 'player' }));
  useGameSounds(state);
  const wrapped = useCallback(
    (a) => {
      if (a.type === 'MENU') onCancel(); // 메뉴로 = 방 닫기
      else send(a);
    },
    [onCancel],
  );
  return (
    <>
      <GameView state={state} send={wrapped} onStart={(d) => send({ type: 'START', difficulty: d, first: nextFirst(state) })} settle={null} />
      <div className="wait-pill" role="status">
        <span>⏳ 상대를 기다리는 중 · {room.private ? <>🔒 비밀방 코드 <b>{room.code}</b></> : '공개방'}</span>
        <button className="account-link" onClick={onCancel}>방 닫기</button>
      </div>
    </>
  );
}

// 상대 이름을 알려 주는 래퍼 (사람 대전이면 닉네임, 아니면 AI)
function GameView(props) {
  return (
    <OpponentContext.Provider value={props.remote?.names.other || 'AI'}>
      <Game {...props} />
    </OpponentContext.Provider>
  );
}

// state === null 이면 메뉴 화면
export default function App() {
  const [state, send] = useReducer(appReducer, null);
  const account = useAccount();
  const [pvpRoom, setPvpRoom] = useState(null); // 사람 대전 중인 방 id
  const [notice, setNotice] = useState('');
  const [settle, setSettle] = useState(null); // 정산 결과: {status:'pending'|'done'|'error', ...}

  // 판 시작: 로그인했으면 서버에서 시드를 받아 포인트 정산이 가능한 판으로 시작한다.
  // 서버가 안 되면 포인트 없이 연습 판으로 시작한다.
  const startingRef = useRef(false);
  const startGame = async (difficulty) => {
    if (startingRef.current) return;
    startingRef.current = true;
    const first = nextFirst(state);
    setSettle(null);
    setNotice('');
    if (account.status === 'in') {
      try {
        const g = await startAiGameOnServer(difficulty, first);
        send({ type: 'START', difficulty, first: g.first, seed: g.seed, gameId: g.gameId });
        return;
      } catch {
        setNotice('서버에 연결하지 못해 포인트 없이 연습 판으로 시작합니다.');
        setTimeout(() => setNotice(''), 4000);
      } finally {
        startingRef.current = false;
      }
    }
    startingRef.current = false;
    send({ type: 'START', difficulty, first });
  };

  // 판이 끝나면 조작 기록을 서버로 보내 정산한다
  const settledRef = useRef(null);
  useEffect(() => {
    if (state?.phase !== 'over' || !state.gameId || settledRef.current === state.gameId) return;
    settledRef.current = state.gameId;
    setSettle({ status: 'pending' });
    settleAiGameOnServer(state.gameId, state.log)
      .then((r) => setSettle({ status: 'done', ...r }))
      .catch(() => setSettle({ status: 'error' }));
  }, [state]);
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
    <AccountContext.Provider value={account}>
      {pvpRoom ? (
        <PvpRoom
          roomId={pvpRoom}
          uid={account.user?.uid}
          Game={GameView}
          Practice={PracticeWhileWaiting}
          useGameSounds={useGameSounds}
          onExit={() => setPvpRoom(null)}
        />
      ) : (
        <GameView state={state} send={send} onStart={startGame} settle={settle} remoteEnter={setPvpRoom} />
      )}
      {notice && <div className="net-toast" role="status">{notice}</div>}
      {!pvpRoom && state?.phase === 'over' && <SoundControls />}
    </AccountContext.Provider>
  );
}

function Game({ state, send, onStart, settle, remote, remoteEnter }) {
  const opp = remote?.names.other || 'AI';
  const myName = remote?.names.me || '플레이어';
  const [, forceTick] = useState(0); // 사람 대전: 남은 시간 표시를 1초마다 갱신
  useEffect(() => {
    if (!remote?.deadline) return undefined;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [remote?.deadline]);
  const secondsLeft = remote?.deadline ? Math.max(0, Math.ceil((remote.deadline - Date.now()) / 1000)) : null;
  // 엿보기(사람이 쓴 경우): 연출이 보인 뒤 3초 동안 닫힌 카드의 절반(아이템 패 제외)을 앞면으로 보여 준다. AI가 쓰면 사람 화면은 그대로다.
  const peekN = state?.itemEvent?.item === 'peek' && state.itemEvent.who === 'player' ? state.itemEvent.n : 0;
  const [peekPhase, setPeekPhase] = useState(null); // null | 'wait'(연출 중) | 'show'(카드 공개)
  const [peekSet, setPeekSet] = useState(null); // 혼자 하는 판에서 엿보기로 보이는 카드 위치
  // 시작할 때 아이템 패가 나와 선이 먹었다면 잠깐 알려 준다 (판 한 칸이 비어 있는 이유)
  const startKey = state?.startNote ? state.seed : null;
  const [startToastKey, setStartToastKey] = useState(null);
  useEffect(() => {
    if (startKey === null) {
      setStartToastKey(null);
      return undefined;
    }
    setStartToastKey(startKey);
    const t = setTimeout(() => setStartToastKey(null), 4500);
    return () => clearTimeout(t);
  }, [startKey]);
  useEffect(() => {
    if (!peekN) {
      setPeekPhase(null);
      setPeekSet(null);
      return undefined;
    }
    if (!remote) setPeekSet(new Set(peekSubset(state, seededRng(((state.seed ^ Math.imul(peekN, 2654435761)) >>> 0) || 1))));
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
    } else if (!remote && state.phase === 'playing' && state.turn === 'ai') {
      // 아이템 연출이 보이는 동안에는 기다렸다가, 끝나면(toastN 변경) 이어서 진행한다
      if (state.itemEvent && toastN === state.itemEvent.n) return undefined;
      // 턴 배너가 보이는 동안에도 기다린다 (누구 차례인지 눈으로 확인할 시간)
      if (state.turnEvent && turnToastN === state.turnEvent.n) return undefined;
      id = setTimeout(() => {
        const index = aiChooseFlip(state);
        if (index !== null) send({ type: 'FLIP', index });
      }, 700);
    } else if (!remote && state.phase === 'gostop' && state.turn === 'ai') {
      id = setTimeout(
        () => send({ type: aiDecideGoStop(state) === 'go' ? 'GO' : 'STOP' }),
        1400,
      );
    }
    return () => clearTimeout(id);
  }, [state, send, toastN, turnToastN, remote]);

  if (!state) {
    return <Menu onStart={onStart} onPvp={remoteEnter} />;
  }

  const playerScore = scoreOf(state, 'player');
  const aiScore = scoreOf(state, 'ai');
  // 다음에 틀리면 뒷면으로 돌아갈 카드 (가장 오래된 것부터)
  // 이번 턴이 끝나면 뒷면으로 돌아갈 카드 (남은 턴이 1)
  const dropping = new Set(state.revealed.filter((i) => state.revealLeft[i] === 1));
  const popActive = Boolean(state.itemEvent && toastN === state.itemEvent.n);
  // 엿보기로 보이는 카드 (사람 대전은 서버가 보내 준 것만, 혼자 하는 판은 고른 절반만)
  const peekCardAt = (slot, index) => (remote ? remote.peekDeck?.[index] ?? null : peekSet?.has(index) ? slot.card : null);
  const canClick = state.phase === 'playing' && state.turn === 'player' && state.flipped.length < 2 && !peekPhase;

  if (state.phase === 'over') {
    const r = state.result;
    const winnerName = r.winner === 'player' ? '내' : `${opp}의`;
    return (
      <div className="screen over-screen">
        <h2 className="over-title">{state.message}</h2>
        {r.winner && (
          <p className="over-how">
            {r.how === 'stop'
              ? `${r.winner === 'player' ? '내가' : `${opp}이(가)`} 스톱을 선언했습니다`
              : r.how === 'auto'
                ? `남은 카드가 ${AUTO_STOP_REMAINING}장 이하여서 ${r.winner === 'player' ? '내가' : `${opp}이(가)`} 자동으로 스톱했습니다`
                : r.how === 'forfeit'
                  ? (r.winner === 'player' ? '상대가 기권해서 이겼습니다' : '기권(또는 시간 초과 반복)으로 졌습니다')
                  : '모든 카드를 가져가서 끝났습니다'}
          </p>
        )}

        <CapturedPanel who="ai" title={opp} cards={state.captured.ai} score={aiScore} goCount={state.goCount.ai} />
        <CapturedPanel who="player" title={myName} cards={state.captured.player} score={playerScore} goCount={state.goCount.player} />

        {r.winner && (
          <section className="payout" aria-label="득점 내역">
            <h3>{winnerName} 득점 내역</h3>
            <ul>
              {r.items.map((item) => (
                <li key={item.key} className="payout-item">
                  <div><span>{item.label}</span>{item.note && <small>{item.note}</small>}</div>
                  <b>+{item.points}</b>
                </li>
              ))}
            </ul>
            <div className="payout-line"><span>소계 (위 점수의 합)</span><b>{r.base}점</b></div>
            {r.goBonus > 0 && (
              <div className="payout-line payout-step">
                <span>고 보너스 <small>{r.goCount}고 → +{r.goBonus}점 (1고 +1, 2고 이상 +2)</small></span>
                <b>{r.base + r.goBonus}점</b>
              </div>
            )}
            {r.goMultiplier > 1 && (
              <div className="payout-line payout-step">
                <span>고 배수 <small>3고부터 2배씩 → {r.goCount}고 ×{r.goMultiplier}</small></span>
                <b>{r.withGo}점</b>
              </div>
            )}
            {(r.multipliers ?? []).map((m) => (
              <div className="payout-line payout-step" key={m.key}>
                <span>{m.label} <small>{m.note}</small></span>
                <b>×{m.x}</b>
              </div>
            ))}
            <div className="payout-total"><span>합계</span><b>{r.total}점</b></div>
            <p className="payout-formula">
              계산: {r.goBonus > 0 ? `(${r.base} + ${r.goBonus})` : r.base}
              {r.goMultiplier > 1 ? ` × ${r.goMultiplier}(${r.goCount}고)` : ''}
              {(r.multipliers ?? []).map((m) => ` × ${m.x}(${m.label})`).join('')} = {r.total}점
            </p>
          </section>
        )}

        {(state.gameId || remote) && settle && <SettleLine settle={settle} winner={r.winner} />}

        {remote ? (
          <div className="row">
            <button className="btn btn-primary" onClick={remote.onRematch} disabled={remote.rematchSent}>
              <RotateCcw size={18} /> <span>{remote.rematchSent ? '상대를 기다리는 중…' : remote.opponentWantsRematch ? '한 판 더 (상대가 원해요)' : '한 판 더'}</span>
            </button>
            <button className="btn btn-normal" onClick={remote.onExit}>
              <span>나가기</span>
            </button>
          </div>
        ) : (
          <div className="row">
            <button className="btn btn-primary" onClick={() => onStart(state.difficulty)}>
              <RotateCcw size={18} /> <span>다시 하기</span>
            </button>
            <button className="btn btn-normal" onClick={() => send({ type: 'MENU' })}>
              <span>메뉴로</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="screen game-screen">
      <div className="game-header">
        <div className={`turn-indicator ${state.turn === 'player' ? 'mine' : 'theirs'}`}>
          {state.turn === 'player' ? '🎮 당신의 턴' : `${remote ? '👤' : '🤖'} ${opp}의 턴`}
          <span className="tries"> · 카드 {state.tries * 2 + state.flipped.length}/{MAX_FLIPS}장 오픈</span>
          {secondsLeft !== null && state.phase !== 'over' && <span className={`time-left ${secondsLeft <= 10 ? 'urgent' : ''}`}> · ⏱ {secondsLeft}초</span>}
        </div>
        <div className="header-actions">
          <SoundControls inline />
          <button className="btn btn-primary" onClick={() => send({ type: 'MENU' })}>
            <RotateCcw size={18} /> <span>메뉴로</span>
          </button>
        </div>
      </div>

      {startKey !== null && startToastKey === startKey && (
        <div className={`start-toast ${state.itemEvent?.n === 1 ? 'below-item' : ''}`} role="status">
          🎴 시작할 때 <b>{state.startNote.items.join(', ')}</b> 카드가 나와 선({state.startNote.who === 'player' ? myName : opp})이 먹었습니다
        </div>
      )}
      {state.turnEvent && turnToastN === state.turnEvent.n && <TurnBanner event={state.turnEvent} />}

      <CapturedPanel who="ai" title={opp} cards={state.captured.ai} score={aiScore} goCount={state.goCount.ai} active={state.turn === 'ai'} />

      {state.itemEvent && toastN === state.itemEvent.n && <ItemToast event={state.itemEvent} />}
      {state.rewardEvent && rewardToastN === state.rewardEvent.n && <RewardBurst event={state.rewardEvent} />}
      {state.rewardEvent && rewardToastN === state.rewardEvent.n && <SweepToast event={state.rewardEvent} />}

      <div className={`board-wrap ${peekPhase === 'show' ? 'peeking' : ''}`}>
        {peekPhase === 'show' && (
          <div className="peek-timer" role="status">
            <span>엿보기 · 닫힌 카드의 절반이 보입니다</span>
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
              ) : peekPhase === 'show' && peekCardAt(slot, index) ? (
                <span
                  className="peek-face"
                  style={{ transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(1.08)` }}
                  aria-label="엿보기로 본 카드"
                >
                  <CardFace card={peekCardAt(slot, index)} />
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

      <CapturedPanel who="player" title={myName} cards={state.captured.player} score={playerScore} goCount={state.goCount.player} active={state.turn === 'player'} />

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
