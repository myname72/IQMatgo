import { call, load } from './wallet.js';
import { swapSides } from '../game/pvp.js';

// ---- 서버 함수 (사람 대전) ----
export const quickMatch = () => call('quickMatch', {});
export const createRoom = (secret = false) => call('createRoom', { private: secret });
export const joinByCode = (code) => call('joinRoom', { code });
export const joinById = (roomId) => call('joinRoom', { roomId });
export const listRooms = () => call('listRooms', {});
export const heartbeat = (roomId) => call('heartbeat', { roomId });
export const leaveRoom = (roomId) => call('leaveRoom', { roomId });
export const playAction = (roomId, action) => call('playAction', { roomId, action });
export const claimTimeout = (roomId) => call('claimTimeout', { roomId });
export const rematch = (roomId) => call('rematch', { roomId });

// 서버 오류(HttpsError)에 담긴 한국어 문구를 꺼낸다 (네트워크 오류 등은 일반 문구)
export const messageOf = (e) => {
  const m = String(e?.message ?? '');
  return /[가-힣]/.test(m) ? m : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
};

// 방 문서를 구독한다. 참가자가 아니거나 방이 없으면 cb(null).
export function watchRoom(roomId, cb) {
  let off = () => {};
  let dead = false;
  load().then((fb) => {
    if (!fb || dead) return;
    off = fb.F.onSnapshot(fb.F.doc(fb.fs, 'rooms', roomId), (s) => cb(s.exists() ? s.data() : null), () => cb(null));
  });
  return () => {
    dead = true;
    off();
  };
}

// 엿보기로 본 카드 (쓴 사람만 읽을 수 있다)
export function watchPeek(roomId, uid, cb) {
  let off = () => {};
  let dead = false;
  load().then((fb) => {
    if (!fb || dead) return;
    off = fb.F.onSnapshot(fb.F.doc(fb.fs, 'rooms', roomId, 'peek', uid), (s) => s.exists() && cb({ n: s.data().n, cards: JSON.parse(s.data().cardsJson) }), () => {});
  });
  return () => {
    dead = true;
    off();
  };
}

// 방 문서 → 내 시점의 화면 상태 (B 자리면 player/ai 를 맞바꾼다)
export function viewOf(room, uid) {
  if (!room?.viewJson) return null;
  const v = JSON.parse(room.viewJson);
  const seat = room.seats[0] === uid ? 'A' : 'B';
  const mine = seat === 'A' ? v : swapSides(v);
  return { view: mine, seat };
}
