import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { randomInt } from 'node:crypto';
import { replayGame, rewardFor, todayKst, DAILY_AI_CAP, MIN_PLAY_MS, POINTS_PER_SCORE, AI_REWARD_RATE } from './lib/settle.js';

initializeApp();
const db = getFirestore();
const opts = { region: 'asia-northeast3', cors: true };

const need = (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  if (req.auth.token.email_verified !== true) throw new HttpsError('failed-precondition', '이메일 인증이 필요합니다.');
  return req.auth.uid;
};

// 판 시작: 서버가 시드를 정해 준다. 포인트는 이 시드로 재생된 결과로만 정산된다.
export const startAiGame = onCall(opts, async (req) => {
  const uid = need(req);
  const { difficulty, first } = req.data ?? {};
  if (!['easy', 'normal', 'hard'].includes(difficulty)) throw new HttpsError('invalid-argument', '난이도가 올바르지 않습니다.');
  const seed = randomInt(1, 2 ** 31);
  const ref = db.collection('games').doc();
  await ref.set({ uid, difficulty, seed, first: first === 'ai' ? 'ai' : 'player', startedAt: Date.now(), settled: false });
  return { gameId: ref.id, seed, first: first === 'ai' ? 'ai' : 'player' };
});

// 판 정산: 조작 기록을 서버가 재생해 결과를 계산하고, 규칙에 따라 포인트를 넣는다.
export const settleAiGame = onCall(opts, async (req) => {
  const uid = need(req);
  const { gameId, actions } = req.data ?? {};
  if (typeof gameId !== 'string' || !gameId) throw new HttpsError('invalid-argument', '판 정보가 없습니다.');
  const gameRef = db.collection('games').doc(gameId);
  const userRef = db.collection('users').doc(uid);

  return db.runTransaction(async (tx) => {
    const [g, u] = await Promise.all([tx.get(gameRef), tx.get(userRef)]);
    if (!g.exists || g.data().uid !== uid) throw new HttpsError('not-found', '판을 찾을 수 없습니다.');
    if (g.data().settled) throw new HttpsError('already-exists', '이미 정산된 판입니다.');
    if (!u.exists) throw new HttpsError('failed-precondition', '지갑이 없습니다.');
    if (Date.now() - g.data().startedAt < MIN_PLAY_MS) throw new HttpsError('failed-precondition', '너무 빨리 끝난 판입니다.');

    let result;
    try {
      result = replayGame({ ...g.data(), actions });
    } catch {
      throw new HttpsError('invalid-argument', '판 기록이 올바르지 않습니다.');
    }

    const today = todayKst();
    const daily = u.data().aiDaily;
    const earnedToday = daily?.date === today ? daily.earned : 0;
    const earned = rewardFor(result, earnedToday);

    tx.update(gameRef, { settled: true, settledAt: Date.now(), winner: result.winner, score: result.total ?? 0, earned });
    if (earned > 0) {
      tx.update(userRef, { points: FieldValue.increment(earned), aiDaily: { date: today, earned: earnedToday + earned } });
    }
    return { earned, winner: result.winner, score: result.total ?? 0, earnedToday: earnedToday + earned, dailyCap: DAILY_AI_CAP, perScore: POINTS_PER_SCORE, rate: AI_REWARD_RATE };
  });
});
