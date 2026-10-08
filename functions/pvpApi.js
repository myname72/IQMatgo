import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { publicView, peekCardsOf } from './game/pvp.js';
import { PVP_MIN_ENTRY } from './lib/settle.js';
import {
  newGame, applyAction, applyTimeout, applyForfeit, settleMoney, deadlineFor, secureRng, seatOf, WAIT_ROOM_MS,
} from './lib/pvp.js';

// 모듈이 불러와지는 순서상 index.js 의 initializeApp() 보다 먼저 실행될 수 있어서, 여기서도 한 번만 초기화한다
if (!getApps().length) initializeApp();
const db = getFirestore();
const opts = { region: 'asia-northeast3', cors: true };
const ACTIVE_STALE_MS = 3 * 3600_000; // 이보다 오래 갱신이 없는 방은 끝난 것으로 본다

const roomRef = (id) => db.collection('rooms').doc(id);
const privRef = (id) => roomRef(id).collection('private').doc('game');
const peekRef = (id, uid) => roomRef(id).collection('peek').doc(uid);
const userRef = (uid) => db.collection('users').doc(uid);

const need = (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  if (req.auth.token.email_verified !== true) throw new HttpsError('failed-precondition', '이메일 인증이 필요합니다.');
  return req.auth.uid;
};
const fail = (code, msg) => {
  throw new HttpsError(code, msg);
};
const nameOf = (u) => String(u?.name || '플레이어').slice(0, 12);
const layoutSeedOf = () => Math.floor(Math.random() * 2 ** 31);

// 진행 중인 방이 있으면 그 id
async function activeRoomOf(tx, userSnap) {
  const id = userSnap.data()?.activeRoom;
  if (!id) return null;
  const r = await tx.get(roomRef(id));
  if (!r.exists) return null;
  const d = r.data();
  if (!['waiting', 'playing'].includes(d.status) || Date.now() - d.updatedAt > ACTIVE_STALE_MS) return null;
  return id;
}

// 새 판을 시작할 때 방 문서에 쓰는 값 (공개 상태 + 기한)
function startPatch(game, now, extra = {}) {
  const layoutSeed = layoutSeedOf();
  return {
    status: 'playing',
    viewJson: JSON.stringify(publicView(game.state, layoutSeed)),
    layoutSeed,
    version: FieldValue.increment(1),
    deadline: deadlineFor(game, now, true),
    timeouts: game.timeouts,
    result: null,
    money: null,
    rematch: { A: false, B: false },
    updatedAt: now,
    ...extra,
  };
}

// 판 진행 후 방 문서를 갱신하고, 끝났으면 포인트를 정산한다. (트랜잭션 안에서 읽기가 모두 끝난 뒤 호출)
function commit(tx, ctx, game, now) {
  const { roomId, room, users, seatUid } = ctx;
  const layoutSeed = room.layoutSeed;
  const patch = {
    viewJson: JSON.stringify(publicView(game.state, layoutSeed)),
    version: FieldValue.increment(1),
    deadline: deadlineFor(game, now),
    timeouts: game.timeouts,
    updatedAt: now,
  };
  tx.set(privRef(roomId), { stateJson: JSON.stringify(game.state), lastFlipAt: game.lastFlipAt, timeouts: game.timeouts });
  if (game.state.phase === 'over') {
    const bal = { A: users.A.points, B: users.B.points };
    const money = settleMoney(game.state.result, bal);
    patch.status = 'over';
    patch.result = { winner: game.state.result.winner, how: game.state.result.how, total: game.state.result.total };
    patch.money = { amount: money.amount, winnerSeat: money.winnerSeat };
    for (const seat of ['A', 'B']) {
      const upd = { activeRoom: FieldValue.delete() };
      if (money.amount > 0) upd.points = money.balances[seat];
      tx.update(userRef(seatUid[seat]), upd);
    }
  }
  tx.update(roomRef(roomId), patch);
}

// 방 하나와 두 자리 사용자를 읽어 온다
async function loadContext(tx, roomId, uid) {
  const rs = await tx.get(roomRef(roomId));
  if (!rs.exists) fail('not-found', '방을 찾을 수 없습니다.');
  const room = rs.data();
  const seat = room.seats[0] === uid ? 'A' : room.seats[1] === uid ? 'B' : null;
  if (!seat) fail('permission-denied', '이 방의 참가자가 아닙니다.');
  const seatUid = { A: room.seats[0], B: room.seats[1] };
  const users = {};
  const snaps = {};
  for (const s of ['A', 'B']) {
    if (!seatUid[s]) continue;
    snaps[s] = await tx.get(userRef(seatUid[s]));
    users[s] = snaps[s].data() ?? { points: 0 };
  }
  let game = null;
  if (room.status === 'playing' || room.status === 'over') {
    const ps = await tx.get(privRef(roomId));
    if (ps.exists) {
      const d = ps.data();
      game = { state: JSON.parse(d.stateJson), lastFlipAt: d.lastFlipAt ?? 0, timeouts: d.timeouts ?? { A: 0, B: 0 } };
    }
  }
  return { roomId, room, seat, seatUid, users, game };
}

const loadUser = async (tx, uid) => {
  const snap = await tx.get(userRef(uid));
  if (!snap.exists) fail('failed-precondition', '지갑이 아직 없습니다. 잠시 후 다시 시도해 주세요.');
  return snap;
};
const checkEntry = (snap) => {
  if ((snap.data().points ?? 0) < PVP_MIN_ENTRY) fail('failed-precondition', `사람 대전은 ${PVP_MIN_ENTRY.toLocaleString()} 포인트 이상 있어야 입장할 수 있습니다.`);
};

// 방에 두 번째 사람이 들어와 판을 시작한다. (읽기는 호출 전에 모두 끝나 있어야 한다)
function startMatch(tx, roomId, room, hostUid, guestUid, hostName, guestName, now) {
  const game = newGame({ difficulty: room.difficulty, firstSeat: 'A', rng: secureRng });
  tx.set(privRef(roomId), { stateJson: JSON.stringify(game.state), lastFlipAt: 0, timeouts: game.timeouts });
  tx.update(roomRef(roomId), startPatch(game, now, { seats: [hostUid, guestUid], names: { A: hostName, B: guestName } }));
  tx.update(userRef(guestUid), { activeRoom: roomId });
  tx.update(userRef(hostUid), { activeRoom: roomId });
}

const newRoomData = (uid, name, difficulty, quick, code, now) => ({
  code, quick, difficulty, status: 'waiting', seats: [uid, ''], names: { A: name, B: '' }, hostUid: uid,
  viewJson: '', version: 0, deadline: null, layoutSeed: 0, timeouts: { A: 0, B: 0 }, rematch: { A: false, B: false },
  result: null, money: null, createdAt: now, updatedAt: now,
});

const randomCode = () => String(Math.floor(1000 + Math.random() * 9000));

// ---- 방 만들기 (코드로 친구와 대전) ----
export const createRoom = onCall(opts, async (req) => {
  const uid = need(req);
  const difficulty = ['easy', 'normal', 'hard'].includes(req.data?.difficulty) ? req.data.difficulty : 'normal';
  return db.runTransaction(async (tx) => {
    const me = await loadUser(tx, uid);
    const active = await activeRoomOf(tx, me);
    if (active) return { roomId: active, resumed: true };
    checkEntry(me);
    let code = null;
    for (let i = 0; i < 6 && !code; i++) {
      const c = randomCode();
      const q = await tx.get(db.collection('rooms').where('code', '==', c).where('status', '==', 'waiting').limit(1));
      if (q.empty) code = c;
    }
    if (!code) fail('resource-exhausted', '방 코드를 만들지 못했습니다. 다시 시도해 주세요.');
    const now = Date.now();
    const ref = db.collection('rooms').doc();
    tx.set(ref, newRoomData(uid, nameOf(me.data()), difficulty, false, code, now));
    tx.update(userRef(uid), { activeRoom: ref.id });
    return { roomId: ref.id, code };
  });
});

// ---- 코드로 입장 ----
export const joinRoom = onCall(opts, async (req) => {
  const uid = need(req);
  const code = String(req.data?.code ?? '').trim();
  if (!/^\d{4}$/.test(code)) fail('invalid-argument', '방 코드는 숫자 4자리입니다.');
  return db.runTransaction(async (tx) => {
    const me = await loadUser(tx, uid);
    const active = await activeRoomOf(tx, me);
    if (active) return { roomId: active, resumed: true };
    checkEntry(me);
    const q = await tx.get(db.collection('rooms').where('code', '==', code).where('status', '==', 'waiting').limit(1));
    if (q.empty) fail('not-found', '해당 코드의 대기 중인 방이 없습니다.');
    const doc = q.docs[0];
    const room = doc.data();
    if (room.hostUid === uid) fail('failed-precondition', '내가 만든 방입니다.');
    if (Date.now() - room.createdAt > WAIT_ROOM_MS) fail('not-found', '만료된 방입니다.');
    const host = await loadUser(tx, room.hostUid);
    checkEntry(host);
    startMatch(tx, doc.id, room, room.hostUid, uid, room.names.A, nameOf(me.data()), Date.now());
    return { roomId: doc.id };
  });
});

// ---- 빠른 대전: 기다리는 방이 있으면 들어가고, 없으면 방을 만들어 기다린다 ----
export const quickMatch = onCall(opts, async (req) => {
  const uid = need(req);
  return db.runTransaction(async (tx) => {
    const me = await loadUser(tx, uid);
    const active = await activeRoomOf(tx, me);
    if (active) return { roomId: active, resumed: true };
    checkEntry(me);
    const now = Date.now();
    const q = await tx.get(db.collection('rooms').where('quick', '==', true).where('status', '==', 'waiting').limit(10));
    const doc = q.docs.find((d) => d.data().hostUid !== uid && now - d.data().createdAt < WAIT_ROOM_MS);
    if (doc) {
      const room = doc.data();
      const host = await loadUser(tx, room.hostUid);
      if ((host.data().points ?? 0) >= PVP_MIN_ENTRY) {
        startMatch(tx, doc.id, room, room.hostUid, uid, room.names.A, nameOf(me.data()), now);
        return { roomId: doc.id, matched: true };
      }
    }
    const ref = db.collection('rooms').doc();
    tx.set(ref, newRoomData(uid, nameOf(me.data()), 'normal', true, randomCode(), now));
    tx.update(userRef(uid), { activeRoom: ref.id });
    return { roomId: ref.id, waiting: true };
  });
});

// ---- 방 나가기: 대기 중이면 방을 없애고, 진행 중이면 기권패 ----
export const leaveRoom = onCall(opts, async (req) => {
  const uid = need(req);
  const roomId = req.data?.roomId;
  if (typeof roomId !== 'string') fail('invalid-argument', '방 정보가 없습니다.');
  return db.runTransaction(async (tx) => {
    const ctx = await loadContext(tx, roomId, uid);
    const { room, seat, seatUid } = ctx;
    const now = Date.now();
    if (room.status === 'waiting') {
      tx.delete(roomRef(roomId));
      tx.update(userRef(uid), { activeRoom: FieldValue.delete() });
      return { left: true };
    }
    if (room.status === 'playing' && ctx.game) {
      commit(tx, ctx, applyForfeit(ctx.game, seat), now);
      return { left: true, forfeited: true };
    }
    tx.update(userRef(uid), { activeRoom: FieldValue.delete() });
    tx.update(roomRef(roomId), { status: 'closed', updatedAt: now, closedBy: seatUid[seat] });
    return { left: true };
  });
});

// ---- 카드 뒤집기 / 판정 / 고 / 스톱 ----
export const playAction = onCall(opts, async (req) => {
  const uid = need(req);
  const { roomId, action } = req.data ?? {};
  if (typeof roomId !== 'string') fail('invalid-argument', '방 정보가 없습니다.');
  return db.runTransaction(async (tx) => {
    const ctx = await loadContext(tx, roomId, uid);
    if (ctx.room.status !== 'playing' || !ctx.game) fail('failed-precondition', '진행 중인 판이 아닙니다.');
    const now = Date.now();
    let next;
    try {
      next = applyAction(ctx.game, ctx.seat, action, now);
    } catch (e) {
      fail('failed-precondition', `허용되지 않은 동작입니다. (${e.message})`);
    }
    // 엿보기: 쓴 사람에게만 남은 모든 카드를 알려 준다 (상대는 읽을 수 없는 문서)
    const ev = next.state.itemEvent;
    if (ev && ev.n !== ctx.game.state.itemEvent?.n && ev.item === 'peek') {
      const who = seatOf(ev.who);
      tx.set(peekRef(roomId, ctx.seatUid[who]), { n: ev.n, cardsJson: JSON.stringify(peekCardsOf(next.state)), at: now });
    }
    commit(tx, ctx, next, now);
    return { ok: true };
  });
});

// ---- 시간 초과: 기한이 지났으면 누구든 호출해 지금 차례의 수를 자동 처리한다 ----
export const claimTimeout = onCall(opts, async (req) => {
  const uid = need(req);
  const roomId = req.data?.roomId;
  if (typeof roomId !== 'string') fail('invalid-argument', '방 정보가 없습니다.');
  return db.runTransaction(async (tx) => {
    const ctx = await loadContext(tx, roomId, uid);
    const now = Date.now();
    if (ctx.room.status !== 'playing' || !ctx.game) return { ok: false };
    if (!ctx.room.deadline || now < ctx.room.deadline) return { ok: false, early: true };
    commit(tx, ctx, applyTimeout(ctx.game), now);
    return { ok: true };
  });
});

// ---- 한 판 더: 두 사람이 모두 누르면 이긴 쪽이 선으로 새 판을 시작한다 ----
export const rematch = onCall(opts, async (req) => {
  const uid = need(req);
  const roomId = req.data?.roomId;
  if (typeof roomId !== 'string') fail('invalid-argument', '방 정보가 없습니다.');
  return db.runTransaction(async (tx) => {
    const ctx = await loadContext(tx, roomId, uid);
    const { room, seat, seatUid, users } = ctx;
    if (room.status !== 'over') fail('failed-precondition', '아직 판이 끝나지 않았습니다.');
    const now = Date.now();
    const votes = { ...room.rematch, [seat]: true };
    if (!(votes.A && votes.B)) {
      tx.update(roomRef(roomId), { rematch: votes, updatedAt: now });
      return { waiting: true };
    }
    for (const s of ['A', 'B']) {
      if ((users[s].points ?? 0) < PVP_MIN_ENTRY) fail('failed-precondition', '포인트가 부족한 참가자가 있어 다시 시작할 수 없습니다.');
    }
    const firstSeat = room.result?.winner ? seatOf(room.result.winner) : 'A'; // 이긴 쪽이 선 (비기면 A)
    const game = newGame({ difficulty: room.difficulty, firstSeat, rng: secureRng });
    tx.set(privRef(roomId), { stateJson: JSON.stringify(game.state), lastFlipAt: 0, timeouts: game.timeouts });
    tx.update(roomRef(roomId), startPatch(game, now));
    tx.update(userRef(seatUid.A), { activeRoom: roomId });
    tx.update(userRef(seatUid.B), { activeRoom: roomId });
    return { started: true };
  });
});

