import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { claimTimeout, leaveRoom, messageOf, playAction, rematch, viewOf, watchPeek, watchRoom } from '../firebase/pvp.js';

// 상대를 기다리는 화면
function Waiting({ room, onCancel, quickWaitSec }) {
  return (
    <div className="screen menu-screen">
      <h2 className="title">{room.quick ? '상대를 찾는 중…' : '친구를 기다리는 중…'}</h2>
      {!room.quick && (
        <>
          <p className="subtitle">친구에게 이 코드를 알려 주세요</p>
          <div className="room-code" aria-label="방 코드">{room.code}</div>
        </>
      )}
      {room.quick && quickWaitSec > 0 && <p className="subtitle">{quickWaitSec}초 안에 상대가 없으면 AI와 연습 판으로 시작합니다</p>}
      <button className="btn btn-normal" onClick={onCancel}>취소</button>
    </div>
  );
}

// 사람 대전 방. Game 은 기존 대전 화면 컴포넌트를 그대로 받아 쓴다.
export default function PvpRoom({ roomId, uid, Game, onExit, onFallbackToAi, useGameSounds }) {
  const [room, setRoom] = useState(undefined); // undefined: 불러오는 중, null: 방이 없음
  const [peek, setPeek] = useState(null);
  const [notice, setNotice] = useState('');
  const [quickWaitSec, setQuickWaitSec] = useState(0);

  useEffect(() => watchRoom(roomId, setRoom), [roomId]);
  useEffect(() => watchPeek(roomId, uid, setPeek), [roomId, uid]);

  const mapped = useMemo(() => viewOf(room, uid), [room?.version, room?.status, room?.viewJson, uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const names = room ? (room.seats[0] === uid ? { me: room.names.A, other: room.names.B } : { me: room.names.B, other: room.names.A }) : { me: '', other: '' };
  const mySeat = room ? (room.seats[0] === uid ? 'A' : 'B') : null;

  // 화면 상태: 끝났으면 제목 문구를 만든다
  const view = useMemo(() => {
    if (!mapped) return null;
    const v = mapped.view;
    if (v.phase !== 'over') return { ...v, message: '' };
    const r = v.result;
    const msg = r.winner === 'player' ? `🎉 승리! ${r.total}점` : r.winner === 'ai' ? `😢 패배... ${r.total}점` : '🤝 무승부';
    return { ...v, message: msg };
  }, [mapped]);

  useGameSounds(view);

  // 빠른 대전: 일정 시간 안에 상대가 안 오면 방을 닫고 AI 연습 판으로 시작한다
  const quickWaiting = room?.status === 'waiting' && room.quick;
  useEffect(() => {
    if (!quickWaiting) return undefined;
    let left = 10;
    setQuickWaitSec(left);
    const t = setInterval(() => {
      left -= 1;
      setQuickWaitSec(left);
      if (left <= 0) {
        clearInterval(t);
        leaveRoom(roomId).catch(() => {}).finally(() => onFallbackToAi());
      }
    }, 1000);
    return () => clearInterval(t);
  }, [quickWaiting, roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 시간 초과: 기한이 지나면 두 쪽 모두 서버에 처리를 요청한다 (먼저 온 요청만 적용된다)
  useEffect(() => {
    if (room?.status !== 'playing' || !room.deadline) return undefined;
    const t = setTimeout(() => claimTimeout(roomId).catch(() => {}), Math.max(0, room.deadline - Date.now()) + 600);
    return () => clearTimeout(t);
  }, [room?.deadline, room?.status, roomId]);

  const sendRef = useRef(null);
  sendRef.current = (action) => {
    if (action.type === 'MENU') {
      const playing = room?.status === 'playing';
      if (playing && !window.confirm('나가면 기권패로 처리됩니다. 나갈까요?')) return;
      leaveRoom(roomId).catch(() => {}).finally(onExit);
      return;
    }
    playAction(roomId, action).catch((e) => {
      // 같은 판정을 두 사람이 동시에 보내는 경우 등은 조용히 넘긴다
      if (action.type !== 'RESOLVE') setNotice(messageOf(e));
    });
  };
  const send = useCallback((a) => sendRef.current(a), []);

  // 알림은 잠깐만 보인다
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  if (room === undefined) return <div className="screen menu-screen"><p className="subtitle">방에 들어가는 중…</p></div>;
  if (room === null || room.status === 'closed') {
    return (
      <div className="screen menu-screen">
        <h2 className="title">방이 닫혔습니다</h2>
        <button className="btn btn-primary" onClick={onExit}>돌아가기</button>
      </div>
    );
  }
  if (room.status === 'waiting') {
    return <Waiting room={room} quickWaitSec={quickWaitSec} onCancel={() => leaveRoom(roomId).catch(() => {}).finally(onExit)} />;
  }
  if (!view) return null;

  const money = room.money;
  const delta = money && money.amount > 0 ? (money.winnerSeat === mySeat ? money.amount : -money.amount) : 0;
  const settle = view.phase === 'over' ? { status: 'pvp', delta, drawn: !room.result?.winner } : null;
  const rematchVotes = room.rematch ?? {};

  return (
    <>
      <Game
        state={view}
        send={send}
        remote={{
          names,
          deadline: room.deadline,
          peekDeck: peek && view.itemEvent?.item === 'peek' && peek.n === view.itemEvent.n ? peek.cards : null,
          onRematch: () => rematch(roomId).catch((e) => setNotice(messageOf(e))),
          rematchSent: Boolean(rematchVotes[mySeat]),
          opponentWantsRematch: Boolean(rematchVotes[mySeat === 'A' ? 'B' : 'A']),
          onExit: () => leaveRoom(roomId).catch(() => {}).finally(onExit),
        }}
        settle={settle}
      />
      {notice && <div className="net-toast" role="status">{notice}</div>}
    </>
  );
}
