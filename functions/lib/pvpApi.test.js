import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeDb, FieldValue } from './fakeFirestore.js';

const { db, store } = makeDb();
vi.mock('firebase-admin/app', () => ({ getApps: () => [1], initializeApp: () => {} }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => db, FieldValue }));
vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_o, h) => h,
  HttpsError: class extends Error { constructor(code, msg) { super(msg); this.code = code; } },
}));

const api = await import('../pvpApi.js');
const { aiChooseFlip, aiDecideGoStop } = await import('../game/engine.js');

const req = (uid, data = {}) => ({ auth: { uid, token: {} }, data });
const wallet = (uid, points = 100000) => store.set(`users/${uid}`, { points, name: uid });
const room = (id) => store.get(`rooms/${id}`);
const viewOf = (id) => JSON.parse(room(id).viewJson);
const gameOf = (id) => JSON.parse(store.get(`rooms/${id}/private/game`).stateJson);

beforeEach(() => {
  store.clear();
  wallet('alice');
  wallet('bob');
});

async function startMatch() {
  const a = await api.quickMatch(req('alice'));
  expect(a.waiting).toBe(true);
  const b = await api.quickMatch(req('bob'));
  expect(b.matched).toBe(true);
  expect(b.roomId).toBe(a.roomId);
  return a.roomId;
}

describe('사람 대전 API (인메모리 Firestore)', () => {
  it('빠른 대전: 먼저 온 사람이 기다리고, 두 번째 사람이 들어오면 판이 시작된다', async () => {
    const id = await startMatch();
    expect(room(id).status).toBe('playing');
    expect(room(id).seats).toEqual(['alice', 'bob']);
    expect(store.get('users/alice').activeRoom).toBe(id);
    expect(store.get('users/bob').activeRoom).toBe(id);
  });

  it('이미 방에 있으면 새 방을 만들지 않고 그 방을 돌려준다', async () => {
    const a = await api.createRoom(req('alice'));
    const again = await api.quickMatch(req('alice'));
    expect(again).toMatchObject({ roomId: a.roomId, resumed: true });
  });

  it('방 코드로 입장한다 / 내 방·잘못된 코드는 거부', async () => {
    const { roomId, code } = await api.createRoom(req('alice', { private: true }));
    expect(await api.joinRoom(req('alice', { code }))).toMatchObject({ roomId, resumed: true }); // 내 방은 새로 입장하지 않고 이어서 들어간다
    await expect(api.joinRoom(req('bob', { code: '0000' }))).rejects.toMatchObject({ code: 'not-found' });
    const j = await api.joinRoom(req('bob', { code }));
    expect(j.roomId).toBe(roomId);
    expect(room(roomId).status).toBe('playing');
  });

  it('포인트가 입장 최소치보다 적으면 입장할 수 없다', async () => {
    wallet('poor', 500);
    await expect(api.quickMatch(req('poor'))).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('로그인하지 않으면 거부', async () => {
    await expect(api.quickMatch({ data: {} })).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('공개 상태에는 뒤집지 않은 카드의 정체가 없다 (상대가 읽는 문서)', async () => {
    const id = await startMatch();
    const view = viewOf(id);
    const hidden = view.deck.filter((s, i) => !s.taken && !view.revealed.includes(i));
    expect(hidden.length).toBeGreaterThan(30);
    expect(hidden.every((s) => s.card.kind === 'hidden')).toBe(true);
    expect(room(id).viewJson).not.toContain('"stateJson"');
  });

  it('내 차례가 아닌 사람의 조작은 거부, 내 차례의 조작은 반영', async () => {
    const id = await startMatch();
    const g = gameOf(id);
    const opener = g.turn === 'player' ? 'alice' : 'bob';
    const other = opener === 'alice' ? 'bob' : 'alice';
    const idx = g.deck.findIndex((s, i) => !s.taken && !g.revealed.includes(i) && s.card.kind !== 'item');
    await expect(api.playAction(req(other, { roomId: id, action: { type: 'FLIP', index: idx } }))).rejects.toMatchObject({ code: 'failed-precondition' });
    await api.playAction(req(opener, { roomId: id, action: { type: 'FLIP', index: idx } }));
    expect(viewOf(id).flipped).toEqual([idx]);
    expect(viewOf(id).deck[idx].card.month).toBeGreaterThan(0); // 뒤집은 카드는 공개된다
    expect(room(id).version).toBeGreaterThan(0);
  });

  it('둘이 번갈아 끝까지 두면 판이 끝나고 포인트가 이동한다 (총합 불변)', async () => {
    const id = await startMatch();
    const t0 = Date.now();
    vi.useFakeTimers();
    let guard = 0;
    while (room(id).status === 'playing' && guard++ < 6000) {
      vi.setSystemTime(t0 + guard * 1500);
      const s = gameOf(id);
      const uid = s.turn === 'player' ? 'alice' : 'bob';
      const action = s.phase === 'gostop' ? { type: aiDecideGoStop(s) === 'go' ? 'GO' : 'STOP' } : s.flipped.length === 2 ? { type: 'RESOLVE' } : { type: 'FLIP', index: aiChooseFlip(s) };
      await api.playAction(req(uid, { roomId: id, action }));
    }
    vi.useRealTimers();
    expect(room(id).status).toBe('over');
    const total = store.get('users/alice').points + store.get('users/bob').points;
    expect(total).toBe(200000);
    expect(store.get('users/alice').activeRoom).toBeUndefined();
    if (room(id).result.winner) expect(room(id).money.amount).toBeGreaterThan(0);
  });

  it('도중에 나가면 기권패로 정산된다', async () => {
    const id = await startMatch();
    await api.leaveRoom(req('alice', { roomId: id }));
    expect(room(id).status).toBe('over');
    expect(room(id).result.how).toBe('forfeit');
    expect(store.get('users/bob').points).toBeGreaterThan(100000);
    expect(store.get('users/alice').points).toBeLessThan(100000);
    expect(store.get('users/alice').points + store.get('users/bob').points).toBe(200000);
  });

  it('기한 전에는 시간 초과 처리가 안 되고, 기한이 지나면 턴이 넘어간다', async () => {
    const id = await startMatch();
    expect(await api.claimTimeout(req('bob', { roomId: id }))).toMatchObject({ ok: false });
    store.set(`rooms/${id}`, { ...room(id), deadline: Date.now() - 1 });
    const before = gameOf(id).turn;
    await api.claimTimeout(req('bob', { roomId: id }));
    expect(gameOf(id).turn).not.toBe(before);
  });

  it('대기 중인 방은 나가면 사라진다', async () => {
    const a = await api.createRoom(req('alice'));
    await api.leaveRoom(req('alice', { roomId: a.roomId }));
    expect(room(a.roomId)).toBeUndefined();
    expect(store.get('users/alice').activeRoom).toBeUndefined();
  });

  it('한 판 더: 두 사람이 모두 누르면 새 판이 시작된다', async () => {
    const id = await startMatch();
    await api.leaveRoom(req('alice', { roomId: id })); // 기권패로 끝남
    expect(await api.rematch(req('bob', { roomId: id }))).toMatchObject({ waiting: true });
    expect(await api.rematch(req('alice', { roomId: id }))).toMatchObject({ started: true });
    expect(room(id).status).toBe('playing');
    expect(gameOf(id).phase).toBe('playing');
  });

  it('열린 방 목록: 다른 사람이 만든 살아 있는 방만 보인다', async () => {
    const a = await api.createRoom(req('alice'));
    expect((await api.listRooms(req('alice'))).rooms).toEqual([]); // 내 방은 목록에 없다
    const list = (await api.listRooms(req('bob'))).rooms;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: a.roomId, host: 'alice' });
    expect(JSON.stringify(list)).not.toContain(room(a.roomId).code); // 코드는 노출하지 않는다
  });

  it('방장이 신호를 끊으면(45초 이상) 목록에서 사라지고, heartbeat 로 되살아난다', async () => {
    const a = await api.createRoom(req('alice'));
    store.set(`rooms/${a.roomId}`, { ...room(a.roomId), updatedAt: Date.now() - 60_000 });
    expect((await api.listRooms(req('bob'))).rooms).toEqual([]);
    await expect(api.joinRoom(req('bob', { roomId: a.roomId }))).rejects.toMatchObject({ code: 'not-found' });
    expect(await api.heartbeat(req('alice', { roomId: a.roomId }))).toEqual({ ok: true });
    expect((await api.listRooms(req('bob'))).rooms).toHaveLength(1);
    expect(await api.heartbeat(req('bob', { roomId: a.roomId }))).toEqual({ ok: false }); // 방장만 보낼 수 있다
  });

  it('목록에서 고른 방에 들어가면 방장이 기다리던 중이어도 바로 대전이 시작된다', async () => {
    const a = await api.createRoom(req('alice'));
    const j = await api.joinRoom(req('bob', { roomId: a.roomId }));
    expect(j.roomId).toBe(a.roomId);
    expect(room(a.roomId).status).toBe('playing');
    expect(room(a.roomId).seats).toEqual(['alice', 'bob']);
    // 이미 시작된 방에는 다른 사람이 들어올 수 없다
    wallet('carol');
    await expect(api.joinRoom(req('carol', { roomId: a.roomId }))).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('빠른 대전은 코드로 만든 방에도 들어간다', async () => {
    const a = await api.createRoom(req('alice'));
    const b = await api.quickMatch(req('bob'));
    expect(b).toMatchObject({ roomId: a.roomId, matched: true });
  });

  it('비밀방: 목록·빠른 대전에 나오지 않고, 방 id 로는 못 들어가며, 코드로만 입장한다', async () => {
    const a = await api.createRoom(req('alice', { private: true }));
    expect(a.code).toMatch(/^\d{4}$/);
    expect(room(a.roomId).private).toBe(true);
    expect((await api.listRooms(req('bob'))).rooms).toEqual([]);
    await expect(api.joinRoom(req('bob', { roomId: a.roomId }))).rejects.toMatchObject({ code: 'permission-denied' });
    const q = await api.quickMatch(req('bob')); // 비밀방에 끼어들지 않고 자기 방을 만든다
    expect(q.roomId).not.toBe(a.roomId);
    expect(q.waiting).toBe(true);
    await api.leaveRoom(req('bob', { roomId: q.roomId }));
    const j = await api.joinRoom(req('bob', { code: a.code }));
    expect(j.roomId).toBe(a.roomId);
    expect(room(a.roomId).status).toBe('playing');
  });

  it('공개방은 코드를 돌려주지 않는다', async () => {
    const a = await api.createRoom(req('alice', { private: false }));
    expect(a.code).toBeUndefined();
  });

  it('시작 때 엿보기가 나온 판은 선인 사람에게만 엿보기 정보가 간다', async () => {
    let found = false;
    for (let n = 0; n < 200 && !found; n++) {
      const a = await api.quickMatch(req('alice'));
      const b = await api.quickMatch(req('bob'));
      const id = b.roomId;
      const g = gameOf(id);
      if (g.itemEvent?.item === 'peek') {
        found = true;
        const firstUid = g.turn === 'player' ? 'alice' : 'bob';
        const otherUid = firstUid === 'alice' ? 'bob' : 'alice';
        const peek = store.get(`rooms/${id}/peek/${firstUid}`);
        expect(peek.seed).toBe(room(id).layoutSeed);
        expect(store.get(`rooms/${id}/peek/${otherUid}`)).toBeUndefined();
        const cards = JSON.parse(peek.cardsJson);
        expect(Object.values(cards).every((c) => c.kind !== 'item')).toBe(true);
      } else {
        await api.leaveRoom(req('alice', { roomId: id })); // 기권으로 끝내고 다시 시도
      }
      expect(a.roomId).toBe(id);
    }
    expect(found).toBe(true);
  });
});
