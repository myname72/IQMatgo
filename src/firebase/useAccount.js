import { useEffect, useState } from 'react';
import { firebaseEnabled } from './config.js';
import { resetPassword, signIn, signInEmail, signOut, signUpEmail, watchUser, watchWallet } from './wallet.js';

// Firebase 오류 코드를 사람이 읽을 말로 바꾼다
const MESSAGES = {
  'auth/invalid-email': '이메일 형식이 올바르지 않습니다.',
  'auth/email-already-in-use': '이미 가입된 이메일입니다. 로그인해 주세요.',
  'auth/weak-password': '비밀번호는 6자 이상으로 해 주세요.',
  'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않습니다.',
  'auth/wrong-password': '이메일 또는 비밀번호가 맞지 않습니다.',
  'auth/user-not-found': '이메일 또는 비밀번호가 맞지 않습니다.',
  'auth/too-many-requests': '시도가 너무 많습니다. 잠시 후 다시 해 주세요.',
  'auth/network-request-failed': '네트워크 연결을 확인해 주세요.',
  'auth/operation-not-allowed': '이 로그인 방식이 아직 켜져 있지 않습니다.',
}
const explain = (e) => MESSAGES[e?.code] ?? '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';

// status: off(기능 꺼짐) | loading | out(로그아웃) | in(로그인)
export function useAccount() {
  const [user, setUser] = useState(undefined); // undefined=확인 중, null=로그아웃
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => (firebaseEnabled ? watchUser(setUser) : undefined), []);
  useEffect(() => {
    setWallet(null);
    if (!user) return undefined;
    return watchWallet(user, setWallet, () => setError('포인트 정보를 불러오지 못했습니다.'));
  }, [user]);

  const status = !firebaseEnabled ? 'off' : user === undefined ? 'loading' : user ? 'in' : 'out';
  return {
    status,
    user,
    points: wallet?.points ?? null,
    activeRoom: wallet?.activeRoom ?? null,
    error,
    setError,
    signIn: () => signIn().catch((e) => setError(explain(e))),
    signUpEmail: (email, pw, name) => signUpEmail(email, pw, name).then(() => setError('')).catch((e) => { setError(explain(e)); throw e; }),
    signInEmail: (email, pw) => signInEmail(email, pw).then(() => setError('')).catch((e) => { setError(explain(e)); throw e; }),
    resetPassword: (email) => resetPassword(email).catch((e) => { setError(explain(e)); throw e; }),
    signOut: () => signOut().catch(() => {}),
  };
}
